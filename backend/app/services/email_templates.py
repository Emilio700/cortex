"""
Email HTML Templates — Plan 09 Email Experience
================================================
Professional medical email designs with clinic branding.
"""
from typing import Optional
from sqlalchemy.orm import Session

from app.models.doctor_profile import DoctorProfile
from app.models.user import User
from app.models.tenant import Tenant
from app.utils.tratamiento import nombre_con_tratamiento


def get_clinic_info(db: Session, user_id: Optional[int] = None, tenant_id: Optional[int] = None) -> dict:
    """Build clinic dict from doctor profile, falling back to tenant info."""
    clinic = {
        "name": "CORTEX",
        "specialty": "",
        "address": "",
        "phone": "",
        "email": "",
    }

    # Try doctor profile first
    if user_id:
        profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == user_id).first()
        if profile:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                # Tratamiento capturado o nada: nunca un "Dr." supuesto.
                clinic["name"] = nombre_con_tratamiento(user)
            if profile.specialty:
                clinic["specialty"] = profile.specialty.name if hasattr(profile.specialty, 'name') else str(profile.specialty)
            clinic["address"] = profile.clinic_address or ""
            clinic["phone"] = profile.phone or ""

    # Fallback to tenant
    if tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if tenant:
            if clinic["name"] == "CORTEX":
                clinic["name"] = tenant.name or "Consultorio Médico"
            clinic["email"] = tenant.email or ""
            if not clinic["address"]:
                clinic["address"] = tenant.address or ""
            if not clinic["phone"]:
                clinic["phone"] = tenant.phone or ""

    return clinic


def _base(clinic: dict, title: str, content: str, footer_note: str = "") -> str:
    """Shared HTML shell — white card on light blue bg, clinic header, G.E.M.S footer."""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%%;">

  <!-- ═══ HEADER ═══ -->
  <tr>
    <td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:28px 32px;border-radius:12px 12px 0 0;">
      <table width="100%%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
            {clinic.get("name", "Consultorio Médico")}
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;color:rgba(255,255,255,0.8);padding-top:4px;">
            {clinic.get("specialty", "")}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ BODY ═══ -->
  <tr>
    <td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
      <table width="100%%" cellpadding="0" cellspacing="0">

        <!-- Title -->
        <tr>
          <td style="padding-bottom:8px;">
            <h2 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.2px;">{title}</h2>
          </td>
        </tr>

        <!-- Blue accent line -->
        <tr>
          <td style="padding-bottom:24px;">
            <div style="width:36px;height:3px;border-radius:2px;background:linear-gradient(90deg,#2563eb,#60a5fa);"></div>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="font-size:15px;line-height:1.6;color:#334155;">
            {content}
          </td>
        </tr>

        <!-- Footer note (optional) -->
        {f'<tr><td style="padding-top:24px;font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;">{footer_note}</td></tr>' if footer_note else ""}

      </table>
    </td>
  </tr>

  <!-- ═══ CLINIC FOOTER ═══ -->
  <tr>
    <td style="background:#f8fafc;padding:20px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-radius:0 0 12px 12px;border-bottom:1px solid #e2e8f0;">
      <table width="100%%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#64748b;line-height:1.6;">
            <strong style="color:#334155;">{clinic.get("name", "Consultorio Médico")}</strong><br>
            {f'{clinic.get("address")}<br>' if clinic.get("address") else ""}
            {f'Tel: {clinic.get("phone")} &nbsp;·&nbsp; ' if clinic.get("phone") else ""}{clinic.get("email", "")}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ CORTEX FOOTER ═══ -->
  <tr>
    <td style="padding:16px 32px;text-align:center;">
      <span style="font-size:11px;color:#94a3b8;">
        Enviado a través de <strong style="color:#64748b;">CORTEX</strong> — Sistema clínico para neurocirugía
      </span>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>"""


# ═══════════════════════════════════════════════════════════════
# TEMPLATES
# ═══════════════════════════════════════════════════════════════

def forgot_password(clinic: dict, reset_link: str, user_name: str) -> str:
    """Password reset email with prominent CTA button."""
    content = f"""
      <p style="margin:0 0 12px;">Hola <strong>{user_name}</strong>,</p>
      <p style="margin:0 0 20px;">Has solicitado restablecer tu contraseña. Haz clic en el botón para crear una nueva:</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td align="center" style="border-radius:8px;background:linear-gradient(135deg,#2563eb,#1d4ed8);">
            <a href="{reset_link}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;">Restablecer Contraseña</a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#94a3b8;">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este mensaje.</p>
      <p style="margin:8px 0 0;font-size:12px;color:#cbd5e1;">O copia este enlace: {reset_link}</p>
    """
    return _base(clinic, "Restablecer Contraseña", content, "Seguridad de tu cuenta")


def appointment_confirmation(clinic: dict, patient_name: str, date_str: str, time_str: str, doctor_name: str, reason: str = "") -> str:
    """Appointment confirmation — clean info card."""
    info_rows = f"""
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;white-space:nowrap;">📅 Fecha</td><td style="padding:6px 0;color:#0f172a;">{date_str}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;white-space:nowrap;">🕐 Hora</td><td style="padding:6px 0;color:#0f172a;">{time_str}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;white-space:nowrap;">👨‍⚕️ Doctor</td><td style="padding:6px 0;color:#0f172a;">{doctor_name}</td></tr>
      {f'<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;white-space:nowrap;">📋 Motivo</td><td style="padding:6px 0;color:#0f172a;">{reason}</td></tr>' if reason else ""}
    """
    content = f"""
      <p style="margin:0 0 12px;">Hola <strong>{patient_name}</strong>,</p>
      <p style="margin:0 0 20px;">Tu cita ha sido confirmada. Aquí los detalles:</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;width:100%;margin-bottom:20px;">
        {info_rows}
      </table>
      <p style="margin:0;font-size:13px;color:#94a3b8;">Si necesitas reagendar o cancelar, comunícate con la clínica.</p>
    """
    return _base(clinic, "Cita Confirmada ✅", content, "Agenda tu próxima visita")


def appointment_reminder(clinic: dict, patient_name: str, date_str: str, time_str: str, hours_before: int) -> str:
    """Appointment reminder with urgency cue."""
    urgency = "⏰" if hours_before <= 1 else "📅"
    content = f"""
      <p style="margin:0 0 12px;">Hola <strong>{patient_name}</strong>,</p>
      <p style="margin:0 0 20px;">Te recordamos que tienes una cita médica {'en 1 hora' if hours_before <= 1 else 'mañana'}.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;width:100%;margin-bottom:20px;">
        <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;">📅</td><td style="padding:6px 0;color:#0f172a;">{date_str}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;">🕐</td><td style="padding:6px 0;color:#0f172a;">{time_str}</td></tr>
      </table>
      <p style="margin:0;font-size:13px;color:#94a3b8;">Por favor llega 10 minutos antes. Si no puedes asistir, avísanos.</p>
    """
    return _base(clinic, f"Recordatorio de Cita {urgency}", content, "Te esperamos")


def prescription_email(clinic: dict, patient_name: str, date_str: str) -> str:
    """Accompanies the prescription PDF attachment."""
    content = f"""
      <p style="margin:0 0 12px;">Hola <strong>{patient_name}</strong>,</p>
      <p style="margin:0 0 16px;">Adjuntamos tu receta médica generada el {date_str}.</p>
      <table cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;width:100%;margin-bottom:20px;">
        <tr>
          <td style="font-size:14px;color:#1e40af;">
            📎 <strong>Archivo adjunto:</strong> Receta médica en PDF
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#94a3b8;">Sigue las indicaciones del doctor y no dudes en contactarnos si tienes dudas sobre tu tratamiento.</p>
    """
    return _base(clinic, "Tu Receta Médica 💊", content, "Cuida tu salud")


def certificate_email(clinic: dict, patient_name: str, cert_type: str, date_str: str) -> str:
    """Accompanies the medical certificate PDF attachment."""
    type_labels = {"sick_leave": "Reposo Médico", "fitness": "Aptitud Física", "other": "Constancia Médica"}
    label = type_labels.get(cert_type, "Constancia")
    content = f"""
      <p style="margin:0 0 12px;">Hola <strong>{patient_name}</strong>,</p>
      <p style="margin:0 0 16px;">Adjuntamos tu certificado médico ({label}) generado el {date_str}.</p>
      <table cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;width:100%;margin-bottom:20px;">
        <tr>
          <td style="font-size:14px;color:#166534;">
            📎 <strong>Archivo adjunto:</strong> Certificado médico en PDF
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#94a3b8;">Este documento tiene validez oficial.</p>
    """
    return _base(clinic, f"Certificado — {label} 📄", content, "Documento oficial")


def payment_receipt(clinic: dict, patient_name: str, amount: str, method_label: str, date_str: str, description: str = "") -> str:
    """Payment confirmation with prominent amount display."""
    desc_row = f'<tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;">📝 Concepto</td><td style="padding:6px 0;color:#0f172a;">{description}</td></tr>' if description else ""
    content = f"""
      <p style="margin:0 0 12px;">Hola <strong>{patient_name}</strong>,</p>
      <p style="margin:0 0 16px;">Confirmamos la recepción de tu pago:</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
        <tr>
          <td style="text-align:center;background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:20px;border-radius:10px;">
            <span style="font-size:12px;color:rgba(255,255,255,0.8);display:block;">Total pagado</span>
            <span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${amount}</span>
            <span style="font-size:12px;color:rgba(255,255,255,0.7);display:block;margin-top:2px;">MXN</span>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;width:100%;margin-bottom:20px;">
        <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;">💳 Método</td><td style="padding:6px 0;color:#0f172a;">{method_label}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;font-weight:600;color:#475569;">📅 Fecha</td><td style="padding:6px 0;color:#0f172a;">{date_str}</td></tr>
        {desc_row}
      </table>
      <p style="margin:0;font-size:13px;color:#94a3b8;">Gracias por tu pago. Conserva este comprobante para cualquier aclaración.</p>
    """
    return _base(clinic, "Pago Confirmado 💰", content, "Comprobante de pago")
