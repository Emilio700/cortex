"""Background task scheduler infrastructure.

G.E.M.S has always been purely reactive - the only work ever performed is in
direct response to an incoming HTTP request, with no way to run code on a
timer independent of a request. Fase 4 of the roadmap (appointment
reminders, automated emails, daily-agenda notifications) needs exactly that,
and is explicitly blocked on this piece of infrastructure existing first.

Uses APScheduler's ``BackgroundScheduler`` (in-process, thread-based) rather
than Celery+Redis: simpler to operate for a single-instance deployment, with
no new external service to run. If G.E.M.S ever needs multiple backend
instances sharing one job schedule, revisit with a distributed queue then -
premature to add that operational weight now.

No real jobs exist yet beyond a small, low-risk example that proves the
infrastructure works end-to-end (periodically purging the in-memory login
rate limiter's stale entries - see ``app.core.rate_limit``). Fase 4's real
jobs (reminders, etc.) get registered here.
"""
from datetime import datetime, timedelta

from app.core.hora_local import ahora_local, hoy_local, zona_del_consultorio

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.rate_limit import login_rate_limiter

# Las horas de los cron («6:00», «7:30») son del consultorio. Sin zona,
# APScheduler usaba la del contenedor, que corre en UTC: la «agenda de hoy»
# salía a las 23:00 de Mazatlán del día anterior y el aviso prenatal a las
# 0:30 (plan 27).
scheduler = BackgroundScheduler(timezone=zona_del_consultorio())


def _purge_rate_limiter() -> None:
    """Housekeeping job: drop rate-limiter buckets for IPs that haven't
    made a request in a while, so memory doesn't grow unbounded over a
    long-running process."""
    login_rate_limiter.purge_stale()


def _notify_daily_agenda() -> None:
    """Fase 4.1: once a day, tell each doctor how many appointments they have
    today. Runs once per process start via the 'cron' trigger below (06:00
    local time) - a fresh, self-contained DB session since this runs outside
    any request context."""
    from sqlalchemy import func

    from app.db.session import SessionLocal
    from app.models.appointment import Appointment, AppointmentStatus
    from app.models.notification import NotificationType
    from app.services.notification_service import notify

    db = SessionLocal()
    try:
        # Hora del consultorio, no del contenedor (que corre en UTC).
        today_start = datetime.combine(hoy_local(), datetime.min.time())
        today_end = today_start + timedelta(days=1)

        counts = (
            db.query(Appointment.tenant_id, Appointment.doctor_id, func.count(Appointment.id))
            .filter(
                Appointment.scheduled_at >= today_start,
                Appointment.scheduled_at < today_end,
                Appointment.status != AppointmentStatus.CANCELADA,
            )
            .group_by(Appointment.tenant_id, Appointment.doctor_id)
            .all()
        )
        for tenant_id, doctor_id, count in counts:
            notify(
                db,
                tenant_id=tenant_id,
                user_id=doctor_id,
                type=NotificationType.APPOINTMENT_TODAY,
                title="Agenda de hoy",
                message=f"Tienes {count} cita(s) programada(s) para hoy.",
                # Si el proceso se reinicia y el job vuelve a correr el mismo
                # día, no se repite el aviso.
                dedupe_key=f"appointment_today:{today_start.date().isoformat()}",
            )
        # ``notify`` ya no confirma: el job confirma al final de su unidad.
        db.commit()
    finally:
        db.close()


def _send_appointment_reminders() -> None:
    """Fase 4.3: every 5 minutes, find appointments coming up within configured
    windows (24h, 1h, etc.) and send reminders if not already sent. Runs every
    5 minutes via the 'interval' trigger below."""
    from app.db.session import SessionLocal
    from app.models.appointment import Appointment, AppointmentStatus
    from app.models.appointment_reminder import AppointmentReminder, AppointmentReminderPreference
    from app.models.notification import NotificationPreference
    from app.services.appointment_reminder_service import (
        UNA_HORA,
        avisar_cita_en_una_hora,
        parse_reminder_times,
        send_appointment_reminder,
    )

    db = SessionLocal()
    try:
        # scheduled_at esta en hora local del consultorio: hay que
        # compararlo contra la hora local, no contra UTC.
        now = ahora_local()

        # Find all active appointments in the next 24h
        window_end = now + timedelta(hours=24)
        upcoming = (
            db.query(Appointment)
            .filter(
                Appointment.scheduled_at > now,
                Appointment.scheduled_at <= window_end,
                Appointment.status != AppointmentStatus.CANCELADA,
            )
            .all()
        )

        for appointment in upcoming:
            # Get doctor's reminder preference
            pref = (
                db.query(AppointmentReminderPreference)
                .filter(AppointmentReminderPreference.doctor_id == appointment.doctor_id)
                .first()
            )
            if not pref or not pref.enabled:
                continue

            reminder_times = parse_reminder_times(pref.reminder_times)

            # For each configured reminder window, check if we should send
            for minutes_before in reminder_times:
                target_send_time = appointment.scheduled_at - timedelta(minutes=minutes_before)

                # Send if we're close to the target time (within 5 min window)
                # and haven't sent this reminder before
                if now >= target_send_time and now < target_send_time + timedelta(minutes=5):
                    already_sent = (
                        db.query(AppointmentReminder)
                        .filter(
                            AppointmentReminder.appointment_id == appointment.id,
                            AppointmentReminder.reminder_minutes_before == minutes_before,
                        )
                        .first()
                    )
                    if not already_sent:
                        send_appointment_reminder(db, appointment, minutes_before)

        # Aviso en la campana al médico, una hora antes: va aparte del
        # correo a pacientes y sólo para quien lo pidió en sus avisos.
        quieren = {
            fila.user_id
            for fila in db.query(NotificationPreference.user_id).filter(
                NotificationPreference.recordatorio_una_hora.is_(True)
            )
        }
        for appointment in upcoming:
            if appointment.doctor_id not in quieren:
                continue
            objetivo = appointment.scheduled_at - timedelta(minutes=UNA_HORA)
            if objetivo <= now < objetivo + timedelta(minutes=5):
                avisar_cita_en_una_hora(db, appointment)
        db.commit()
    finally:
        db.close()


def _purgar_avisos() -> None:
    """Borra los avisos que ya no le sirven a nadie (plan 27, D-9).

    Informativas leídas, a los 90 días; las que pedían algo y ya se
    resolvieron, al año. Nada abierto se borra.
    """
    import logging

    from app.db.session import SessionLocal
    from app.services.notification_service import purgar

    db = SessionLocal()
    try:
        borradas = purgar(db)
        logging.getLogger(__name__).info("Purga de avisos: %s borrados", borradas)
    except Exception:
        logging.getLogger(__name__).exception("Purga de avisos: falló; se reintenta mañana")
    finally:
        db.close()


def _sync_medication_cache() -> None:
    """Fase 6: refresh the local medication cache from OpenFDA.

    Runs daily and fetches a curated list of common medication terms so the
    cache is never completely empty when users search. New entries are added
    without duplicating existing ones (see ``medication_service.cache_openfda_results``).
    """
    from app.db.session import SessionLocal
    from app.services.medication_service import cache_openfda_results

    # Common medication search terms (gynecology + general practice)
    COMMON_TERMS = [
        "aspirin",
        "ibuprofen", "paracetamol", "amoxicillin", "omeprazole",
        "loratadine", "metformin", "enalapril", "salbutamol",
        "azithromycin", "ciprofloxacin", "clindamycin", "metronidazole",
        "fluconazole", "clotrimazole", "levonorgestrel", "estradiol",
        "progesterone", "medroxyprogesterone", "norethindrone",
        "misoprostol", "oxytocin", "ergometrine", "tamoxifen",
        "levothyroxine", "folic acid", "ferrous sulfate", "calcium carbonate",
        "vitamin d", "prenatal vitamins",
    ]

    import asyncio

    db = SessionLocal()
    try:
        for term in COMMON_TERMS:
            try:
                asyncio.run(cache_openfda_results(db, term))
            except Exception:
                continue  # Skip individual terms that fail
    finally:
        db.close()


def _avisar_estudios_atrasados() -> None:
    """Un aviso al día, agrupado, por doctora con estudios atrasados (plan 32, punto 3).

    Las reglas están en ``app/services/avisos_de_atrasados.py``; aquí sólo se
    envuelve para la bitácora y para que un fallo no tumbe al programador.
    """
    import logging

    from app.db.session import SessionLocal
    from app.services.avisos_de_atrasados import ejecutar, lineas_resumen

    log = logging.getLogger("app.services.avisos_de_atrasados")
    db = SessionLocal()
    try:
        resumen = ejecutar(db)
    except Exception:
        log.exception("Aviso de estudios atrasados: la corrida fallo entera")
        return
    finally:
        db.close()
    for linea in lineas_resumen(resumen):
        log.info(linea)


def start_scheduler() -> None:
    """Register jobs and start the scheduler. Call once on app startup."""
    if scheduler.running:
        return
    scheduler.add_job(
        _purge_rate_limiter,
        "interval",
        minutes=30,
        id="purge_rate_limiter",
        replace_existing=True,
    )
    scheduler.add_job(
        _notify_daily_agenda,
        "cron",
        hour=6,
        minute=0,
        id="notify_daily_agenda",
        replace_existing=True,
    )
    scheduler.add_job(
        _send_appointment_reminders,
        "interval",
        minutes=5,
        id="send_appointment_reminders",
        replace_existing=True,
    )
    scheduler.add_job(
        _sync_medication_cache,
        "cron",
        hour=3,
        minute=0,  # 3:00 AM daily
        id="sync_medication_cache",
        replace_existing=True,
    )
    # Cortex no registra el aviso diario de revisión prenatal ni el espejo del
    # sistema anterior de GEMS: no hay embarazos que vigilar ni sistema legado.
    scheduler.add_job(
        _avisar_estudios_atrasados,
        "cron",
        hour=7,
        minute=45,
        id="aviso_estudios_atrasados",
        replace_existing=True,
        # Una vez al día y no cada rato: el aviso es agrupado y accionable, y
        # correrlo seguido solo multiplicaría las ocasiones de saturar la campana.
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _purgar_avisos,
        "cron",
        hour=3,
        minute=30,
        id="purgar_avisos",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()


def shutdown_scheduler() -> None:
    """Stop the scheduler. Call once on app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
