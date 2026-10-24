"""Cuenta por doctora los resultados críticos que nunca se comunicaron.

Por qué hace falta
------------------
Marcar un resultado como «crítico» no cerraba nada hasta el plan 26 (D-8): no
existía la incidencia ni el paso de documentar que se le comunicó a la
paciente. El día del despliegue, esos resultados que llevan meses sin
constancia de comunicación aparecerán de golpe en el inicio de su doctora,
porque el tablero de críticos las reúne. Nadie falló —el sistema antes no lo
pedía—, así que conviene avisarles con número antes de ese día: este reporte
es ese número.

Regla (la MISMA del tablero de la doctora, ``GET /clinical-tracking/
critical-results``): crítico, sin incidencia cerrada y vigente (no anulado);
se excluyen las órdenes que la doctora ya no quiere imprimir (borrador,
cancelada, rechazada). Si esa regla cambia en ``app/routers/
clinical_tracking.py``, esta tiene que cambiar igual.

Es de SÓLO LECTURA: no escribe nada en la base.

Uso:
    python -m scripts.reporte_criticos_sin_comunicar
    python -m scripts.reporte_criticos_sin_comunicar --tenant 2
    python -m scripts.reporte_criticos_sin_comunicar --listar
"""
import argparse
from collections import defaultdict

from app.core.hora_local import utc_a_local
from app.db.session import SessionLocal
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.user import User
from app.services.anular_resultado import VIGENTE

# Mismo conjunto que ESTADOS_DE_ORDEN_NO_IMPRIMIBLES del router: una orden que
# la doctora canceló o rechazó no aparece en su tablero de críticos.
NO_IMPRIMIBLES = ("draft", "cancelled", "rejected")


def recolectar(db, tenant_id):
    """Resultados críticos abiertos, del más antiguo al más reciente."""
    consulta = (
        db.query(
            DiagnosticResult.id,
            DiagnosticResult.created_at,
            DiagnosticOrder.id,
            DiagnosticOrder.study_name,
            DiagnosticOrder.doctor_id,
            Patient.first_name,
            Patient.last_name,
            User.full_name,
            Tenant.name,
        )
        .join(DiagnosticOrder, DiagnosticOrder.id == DiagnosticResult.diagnostic_order_id)
        .join(Patient, Patient.id == DiagnosticOrder.patient_id)
        .outerjoin(User, User.id == DiagnosticOrder.doctor_id)
        .outerjoin(Tenant, Tenant.id == DiagnosticOrder.tenant_id)
        .filter(
            DiagnosticResult.is_critical.is_(True),
            DiagnosticResult.incidencia_cerrada_at.is_(None),
            VIGENTE,
            DiagnosticOrder.status.notin_(NO_IMPRIMIBLES),
        )
        .order_by(DiagnosticResult.created_at.asc(), DiagnosticResult.id.asc())
    )
    if tenant_id is not None:
        consulta = consulta.filter(DiagnosticOrder.tenant_id == tenant_id)
    return consulta.all()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reporta, por doctora, los resultados críticos sin comunicar (sólo lectura)."
    )
    parser.add_argument("--tenant", type=int, default=None, help="Sólo esta sucursal (id). Por omisión: todas.")
    parser.add_argument("--listar", action="store_true", help="Muestra cada resultado, del más antiguo al más reciente.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        filas = recolectar(db, args.tenant)
    finally:
        db.close()

    print("Resultados críticos sin comunicar (sólo lectura; misma regla del tablero de la doctora)")
    print()

    if not filas:
        print("  No hay ninguno. Nada que avisar antes del despliegue.")
        return

    if args.listar:
        print("  Del más antiguo al más reciente:")
        for rid, creado, oid, estudio, _doc_id, pat_nom, pat_ape, doc_nom, suc in filas:
            fecha = utc_a_local(creado).date().isoformat() if creado else "sin fecha"
            print(
                f"  {fecha} | orden #{oid} · resultado #{rid} | {estudio} | "
                f"{pat_nom} {pat_ape} | {doc_nom or 'sin doctora'} | {suc or 'sin sucursal'}"
            )
        print()

    por_doctora = defaultdict(lambda: {"total": 0, "pacientes": set(), "mas_antiguo": None})
    for _rid, creado, _oid, _estudio, doc_id, _pn, _pa, doc_nom, suc in filas:
        clave = (doc_id, doc_nom or "Sin doctora", suc or "Sin sucursal")
        datos = por_doctora[clave]
        datos["total"] += 1
        datos["pacientes"].add((_pn, _pa))
        if creado is not None:
            fecha = utc_a_local(creado).date()
            if datos["mas_antiguo"] is None or fecha < datos["mas_antiguo"]:
                datos["mas_antiguo"] = fecha

    print(f"  {'Doctora':<40} | {'Sucursal':<24} | {'Abiertos':>8} | {'Pacientes':>9} | Más antigua")
    print(f"  {'-' * 40}-+-{'-' * 24}-+-{'-' * 8}-+-{'-' * 9}-+------------")
    for (doc_id, doc_nom, suc), datos in sorted(
        por_doctora.items(), key=lambda kv: (-kv[1]["total"], kv[0][1])
    ):
        antigua = datos["mas_antiguo"].isoformat() if datos["mas_antiguo"] else "sin fecha"
        print(
            f"  {doc_nom[:40]:<40} | {suc[:24]:<24} | {datos['total']:>8} | "
            f"{len(datos['pacientes']):>9} | {antigua}   (id {doc_id})"
        )

    pacientes = {(f[5], f[6]) for f in filas}
    print()
    print(
        f"  Total: {len(filas)} resultados de {len(pacientes)} pacientes, "
        f"en {len(por_doctora)} doctoras."
    )
    print("  Éste es el número que verán en su inicio el día del despliegue: conviene avisarles antes.")


if __name__ == "__main__":
    main()
