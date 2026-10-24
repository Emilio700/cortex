"""Lista las recetas duplicadas exactas que ya están guardadas en la base.

Por qué hace falta
------------------
Hasta esta corrección, el formulario de receta nunca supo que ya había
guardado: al entrar a "Vista Previa" y confirmar, creaba una SEGUNDA receta con
el mismo contenido. El caso que lo destapó son las recetas 39573 y 39574 de
Paola Lizeth, con un minuto de diferencia y contenido idéntico. La causa ya está
arreglada, pero los duplicados que se crearon antes siguen ahí y no sabemos
cuántos son.

Este reporte es de SÓLO LECTURA. No borra, no modifica y no genera un DELETE
listo para ejecutar, a propósito: una receta es un documento clínico y quién se
queda y quién se va lo decide el médico, viendo el folio impreso.

Criterio de duplicado exacto
----------------------------
Misma cita + mismos medicamentos + mismas indicaciones. Dos recetas DISTINTAS
en la misma consulta son legítimas y no se reportan: una consulta puede llevar
a propósito dos tratamientos separados.

Uso:
    python -m scripts.reporte_recetas_duplicadas
    python -m scripts.reporte_recetas_duplicadas --tenant 2
    python -m scripts.reporte_recetas_duplicadas --desde 2026-09-01
"""
import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import joinedload

from app.db.session import SessionLocal
from app.models.prescription import Prescription


def _normalizar(valor):
    """Forma canónica de un valor del JSON de medicamentos.

    Se compara por CONTENIDO y no por el texto crudo de la columna: el mismo
    medicamento guardado dos veces puede serializarse con las llaves en otro
    orden, con espacios de más o con una llave opcional ausente en una fila y
    vacía en la otra. Nada de eso hace distinta a la receta.

    Se ignoran mayúsculas porque la captura del consultorio alterna entre
    mayúsculas y minúsculas sin querer decir nada: una diferencia clínica real
    siempre está en el fármaco, la dosis, la frecuencia o la duración.
    """
    if isinstance(valor, dict):
        # Una llave con valor vacío es lo mismo que la llave ausente.
        canonico = {}
        for llave, contenido in valor.items():
            normalizado = _normalizar(contenido)
            if normalizado in (None, "", [], {}):
                continue
            canonico[str(llave).strip().casefold()] = normalizado
        return canonico
    if isinstance(valor, list):
        return [_normalizar(elemento) for elemento in valor]
    if isinstance(valor, str):
        return " ".join(valor.split()).casefold()
    return valor


def _texto(valor) -> str:
    return json.dumps(valor, sort_keys=True, ensure_ascii=False)


def clave_estricta(receta) -> str:
    """Huella del contenido respetando el orden en que se listaron los fármacos."""
    return _texto(_normalizar(receta.medications or []))


def clave_duplicado(receta) -> tuple:
    """Huella con la que se agrupa: medicamentos como CONJUNTO, indicaciones y motivo.

    Decisión: dos recetas con los mismos medicamentos en distinto ORDEN sí
    cuentan como duplicado. El orden de la lista no tiene significado clínico
    —no es una secuencia de administración, es el orden en que se teclearon— y
    un médico que de verdad quiere dos recetas distintas cambia el fármaco,
    la dosis o la duración, no reacomoda la misma lista. Aun así el reporte
    avisa cuándo el grupo empató sólo tras reordenar, para que ella lo vea.

    Se ordenan las huellas de cada medicamento (no el conjunto), de modo que
    repetir dos veces el mismo fármaco sigue siendo distinto de listarlo una.

    El motivo entra aquí porque imprime: una receta que lo lleva y otra que no
    no son el mismo papel, y contarlas como sobrante sería reportar de más.
    Este criterio tiene que seguir siendo el mismo que el de
    ``app/routers/prescriptions.py``, que es quien rechaza el reenvío.
    """
    medicamentos = _normalizar(receta.medications or [])
    if isinstance(medicamentos, list):
        huellas = sorted(_texto(medicamento) for medicamento in medicamentos)
    else:
        # Defensivo: alguna fila histórica podría no traer una lista.
        huellas = [_texto(medicamentos)]
    indicaciones = _normalizar(receta.instructions or "")
    motivo = _normalizar(getattr(receta, "diagnosis", None) or "")
    return (_texto(huellas), indicaciones, motivo)


@dataclass
class GrupoDuplicado:
    """Un conjunto de recetas idénticas emitidas en la misma cita."""

    appointment_id: int
    tenant_id: int
    paciente: str
    fecha_cita: datetime | None
    recetas: list = field(default_factory=list)  # ordenadas de más antigua a más reciente
    mismo_orden: bool = True

    @property
    def mas_antigua(self):
        return self.recetas[0]

    @property
    def sobrantes(self) -> int:
        return len(self.recetas) - 1


@dataclass
class Reporte:
    total_revisadas: int
    grupos: list[GrupoDuplicado] = field(default_factory=list)

    @property
    def recetas_sobrantes(self) -> int:
        return sum(grupo.sobrantes for grupo in self.grupos)


def buscar_duplicados(db, tenant_id: int | None = None, desde: datetime | None = None) -> Reporte:
    """Recorre las recetas y arma los grupos de duplicados exactos.

    No escribe nada: sólo consulta. El agrupamiento incluye ``tenant_id`` para
    que una clínica no pueda arrastrar datos de otra ni siquiera si dos
    sucursales llegaran a compartir el número de cita.
    """
    consulta = (
        db.query(Prescription)
        .options(joinedload(Prescription.patient), joinedload(Prescription.appointment))
        .order_by(Prescription.created_at, Prescription.id)
    )
    if tenant_id is not None:
        consulta = consulta.filter(Prescription.tenant_id == tenant_id)
    if desde is not None:
        consulta = consulta.filter(Prescription.created_at >= desde)

    recetas = consulta.all()

    agrupadas: dict[tuple, list] = {}
    for receta in recetas:
        clave = (receta.tenant_id, receta.appointment_id) + clave_duplicado(receta)
        agrupadas.setdefault(clave, []).append(receta)

    grupos = []
    for recetas_del_grupo in agrupadas.values():
        if len(recetas_del_grupo) < 2:
            continue
        # La consulta ya viene ordenada por created_at, pero se reordena aquí
        # para no depender de eso: la primera del grupo tiene que ser la más
        # antigua porque es la que el médico normalmente conserva.
        ordenadas = sorted(
            recetas_del_grupo,
            key=lambda r: (r.created_at or datetime.min, r.id),
        )
        primera = ordenadas[0]
        cita = primera.appointment
        paciente = primera.patient
        grupos.append(
            GrupoDuplicado(
                appointment_id=primera.appointment_id,
                tenant_id=primera.tenant_id,
                paciente=(
                    f"{paciente.first_name} {paciente.last_name}".strip()
                    if paciente
                    else "(paciente no encontrada)"
                ),
                fecha_cita=cita.scheduled_at if cita else None,
                recetas=ordenadas,
                mismo_orden=len({clave_estricta(r) for r in ordenadas}) == 1,
            )
        )

    grupos.sort(key=lambda g: (g.fecha_cita or datetime.min, g.appointment_id))
    return Reporte(total_revisadas=len(recetas), grupos=grupos)


def diferencia_humana(segundos: float) -> str:
    """Convierte una diferencia de tiempo a algo que se lee de corrido."""
    segundos = int(round(segundos))
    if segundos < 60:
        return f"{segundos} s"
    if segundos < 3600:
        minutos, resto = divmod(segundos, 60)
        return f"{minutos} min {resto} s" if resto else f"{minutos} min"
    if segundos < 86400:
        horas, resto = divmod(segundos, 3600)
        minutos = resto // 60
        return f"{horas} h {minutos} min" if minutos else f"{horas} h"
    dias = segundos // 86400
    return "1 día" if dias == 1 else f"{dias} días"


def _folio(receta) -> str:
    """El folio es lo que el médico ve impreso; el id sólo es el último recurso."""
    if receta.folio_number:
        return f"Folio {receta.folio_number}"
    return f"(sin folio, registro interno {receta.id})"


def _describir_medicamentos(receta) -> list[str]:
    renglones = []
    for medicamento in receta.medications or []:
        if not isinstance(medicamento, dict):
            renglones.append(str(medicamento))
            continue
        partes = [
            str(medicamento.get(campo, "")).strip()
            for campo in ("name", "dosage", "frequency", "duration")
        ]
        renglones.append(" · ".join(parte for parte in partes if parte))
    return renglones or ["(sin medicamentos)"]


def _fecha(momento) -> str:
    return momento.strftime("%d/%m/%Y %H:%M:%S") if momento else "(sin fecha)"


def imprimir_reporte(reporte: Reporte, tenant_id: int | None = None) -> None:
    print("REPORTE DE RECETAS DUPLICADAS")
    print("Sólo lectura: este reporte no borra ni modifica ninguna receta.")
    print("Clínica    : {}".format(tenant_id if tenant_id is not None else "todas"))
    print(f"Recetas revisadas         : {reporte.total_revisadas}")
    print(f"Grupos de duplicados      : {len(reporte.grupos)}")
    print(f"Recetas de más en total   : {reporte.recetas_sobrantes}")

    if not reporte.grupos:
        print("\nNo se encontraron recetas duplicadas.")
        return

    for grupo in reporte.grupos:
        print("\n" + "-" * 78)
        print(f"Paciente : {grupo.paciente}")
        print(f"Cita     : {_fecha(grupo.fecha_cita)}   (clínica {grupo.tenant_id})")
        print("Medicamentos :")
        for renglon in _describir_medicamentos(grupo.mas_antigua):
            print(f"    - {renglon}")
        indicaciones = (grupo.mas_antigua.instructions or "").strip()
        print("Indicaciones : {}".format(indicaciones or "(sin indicaciones)"))
        if not grupo.mismo_orden:
            print("Nota     : el contenido es el mismo, pero los medicamentos se")
            print("           capturaron en distinto orden. Conviene revisarlo.")

        referencia = grupo.mas_antigua.created_at
        for posicion, receta in enumerate(grupo.recetas):
            if posicion == 0:
                detalle = "la más antigua, normalmente la que se conserva"
            elif receta.created_at and referencia:
                detalle = f"{diferencia_humana((receta.created_at - referencia).total_seconds())} después"
            else:
                detalle = "sin hora de emisión"
            print(
                f"    {_folio(receta)}   emitida {_fecha(receta.created_at)}   ({detalle})"
            )

    print("\n" + "-" * 78)
    print("Qué sigue: el médico revisa cada grupo y decide, por folio, cuál se")
    print("conserva. Este script no borra nada.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Lista recetas duplicadas (sólo lectura)")
    parser.add_argument(
        "--tenant",
        type=int,
        default=None,
        help="acota el reporte a una sola clínica (tenant_id)",
    )
    parser.add_argument(
        "--desde",
        default=None,
        help="sólo recetas emitidas desde esta fecha, en formato AAAA-MM-DD",
    )
    args = parser.parse_args()

    desde = None
    if args.desde:
        try:
            desde = datetime.strptime(args.desde, "%Y-%m-%d")
        except ValueError:
            print("La fecha de --desde debe venir en formato AAAA-MM-DD.")
            return 2

    db = SessionLocal()
    try:
        reporte = buscar_duplicados(db, tenant_id=args.tenant, desde=desde)
        imprimir_reporte(reporte, tenant_id=args.tenant)
    finally:
        # Nunca hay commit: el rollback deja explícito que la sesión se cierra
        # sin haber escrito nada, aunque sólo se hayan hecho consultas.
        db.rollback()
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
