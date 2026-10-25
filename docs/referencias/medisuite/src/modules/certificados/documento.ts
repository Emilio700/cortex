// Ciclo de vida de un certificado/referencia: borrador → emitido (inmutable, con huella) → cancelado (con motivo).
import type { Registro } from '../../lib/types'
import { siguienteFolio } from '../ordenes/comun'
import { generarCuerpo, huella, infoPlantilla, type Campos, type EstadoCert, type PacienteSnap, type Plantilla, type Seccion } from './plantillas'

export interface MedicoSnap {
  nombre: string
  cedula: string
  especialidad?: string
  cedulaEspecialidad?: string
}

export interface DatosCert {
  plantilla: Plantilla
  campos: Campos
  folio?: string
  paciente?: PacienteSnap
  medico?: MedicoSnap
  cuerpo?: Seccion[]
  emitidoEn?: string
  hash?: string
  motivoCancelacion?: string
}

export const esCert = (r: Registro) => r.tipo === 'certificado' || r.tipo === 'referencia'

export function datosCert(r: Registro): DatosCert {
  const d = (r.datos ?? {}) as Partial<DatosCert>
  return { ...d, plantilla: (d.plantilla ?? (r.tipo === 'referencia' ? 'referencia' : 'salud')) as Plantilla, campos: (d.campos ?? {}) as Campos }
}

export function estadoCert(r: Registro): EstadoCert {
  return r.estado === 'emitido' || r.estado === 'cancelado' ? r.estado : 'borrador'
}

export function tituloCert(plantilla: Plantilla, campos: Campos, folio?: string): string {
  const info = infoPlantilla(plantilla)
  let n = info.nombre
  if (plantilla === 'salud' && typeof campos.finalidad === 'string' && campos.finalidad !== 'buena-salud') n += ` (${campos.finalidad})`
  if (plantilla === 'referencia') n = `${campos.modalidad === 'contrarreferencia' ? 'Contrarreferencia' : 'Referencia'}${campos.especialidad ? ' a ' + String(campos.especialidad) : ''}`
  return folio ? `${n} · ${folio}` : `${n} (borrador)`
}

/** Huella recalculada a partir de lo guardado (para verificar que nada cambió). */
export function recalcularHuella(r: Registro): string {
  const d = datosCert(r)
  if (!d.folio || !d.paciente || !d.cuerpo || !d.emitidoEn) return ''
  return huella({ folio: d.folio, tipo: r.tipo, plantilla: d.plantilla, patientId: r.patientId, paciente: d.paciente, cuerpo: d.cuerpo, emitidoEn: d.emitidoEn, cedula: d.medico?.cedula ?? '' })
}

/**
 * Patch para emitir un borrador: asigna folio consecutivo (CM- para certificados, RF- para referencias),
 * congela el texto, la identificación del paciente y del médico, y calcula la huella SHA-256.
 */
export function prepararEmision(r: Registro, paciente: PacienteSnap, medico: MedicoSnap, existentes: Registro[], ahoraISO: string): Pick<Registro, 'estado' | 'titulo' | 'datos'> {
  const d = datosCert(r)
  const info = infoPlantilla(d.plantilla)
  const folio = siguienteFolio(
    info.prefijo,
    existentes.filter(esCert).map((x) => String((x.datos as Partial<DatosCert>)?.folio ?? '')),
  )
  const cuerpo = generarCuerpo(d.plantilla, d.campos, paciente, ahoraISO, medico)
  const hash = huella({ folio, tipo: r.tipo, plantilla: d.plantilla, patientId: r.patientId, paciente, cuerpo, emitidoEn: ahoraISO, cedula: medico.cedula })
  return {
    estado: 'emitido',
    titulo: tituloCert(d.plantilla, d.campos, folio),
    datos: { ...r.datos, plantilla: d.plantilla, campos: d.campos, folio, paciente, medico, cuerpo, emitidoEn: ahoraISO, hash },
  }
}

/**
 * Patch de cancelación: lo único que el servidor permite sobre un documento emitido es
 * `{ estado: 'cancelado', datos: { ...datos, motivoCancelacion } }` (sin tocar ningún otro campo).
 */
export function prepararCancelacion(r: Registro, motivo: string): Pick<Registro, 'estado' | 'datos'> {
  return { estado: 'cancelado', datos: { ...r.datos, motivoCancelacion: motivo.trim() } }
}
