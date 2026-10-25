// PDF de certificados y referencias (carta) con encabezado del médico y QR de verificación (folio + huella).
import type { Patient, Registro, Settings } from '../../lib/types'
import { edad, nombreCompleto } from '../../lib/utils'
import { bloquePaciente, marcaAgua, nuevoPDF, numerar, parrafo, pieFirma, seccion } from '../ordenes/pdfComun'
import { datosCert, estadoCert } from './documento'
import { fechaLarga, generarCuerpo, infoPlantilla, urlVerificacion, type PacienteSnap } from './plantillas'

export function snapPaciente(p: Patient, fechaISO: string): PacienteSnap {
  return { nombre: nombreCompleto(p), edad: edad(p.fechaNac, new Date(fechaISO)).texto, sexo: p.sexo, ...(p.curp ? { curp: p.curp } : {}) }
}

export function baseVerificacion(): string {
  return `${location.origin}${location.pathname}`
}

export async function certificadoPDF(r: Registro, p: Patient, s: Settings): Promise<Blob> {
  const d = datosCert(r)
  const estado = estadoCert(r)
  const info = infoPlantilla(d.plantilla)
  const fecha = d.emitidoEn ?? new Date().toISOString()
  // Emitido: se usa el texto congelado y los datos del médico al emitir; borrador: vista previa con los datos actuales
  const medico = d.medico ?? { nombre: s.doctor.nombre, cedula: s.doctor.cedula }
  const sx: Settings = { ...s, doctor: { ...s.doctor, nombre: medico.nombre || s.doctor.nombre, cedula: medico.cedula || s.doctor.cedula } }
  const paciente = d.paciente ?? snapPaciente(p, fecha)
  const cuerpo = d.cuerpo ?? generarCuerpo(d.plantilla, d.campos, paciente, fecha, medico)
  const titulo = d.plantilla === 'referencia' ? (d.campos.modalidad === 'contrarreferencia' ? 'Carta de contrarreferencia' : 'Carta de referencia') : d.plantilla === 'incapacidad' ? 'Justificante médico' : info.nombre
  const folio = d.folio ?? 'BORRADOR'
  const c = nuevoPDF(sx, titulo, { folio, asunto: info.nombre })
  c.pieReservado = 40
  bloquePaciente(c, p, fecha, folio)
  for (const sec of cuerpo) {
    if (sec.titulo) seccion(c, sec.titulo)
    parrafo(c, sec.texto, { size: d.plantilla === 'referencia' ? 9.5 : 10, gap: d.plantilla === 'referencia' ? 2 : 3, align: 'justify' })
  }
  c.y += 2
  const lugar = s.doctor.direccion ? s.doctor.direccion.split(',').slice(-1)[0].trim() : ''
  parrafo(c, `${lugar ? lugar + ', a ' : ''}${fechaLarga(fecha.slice(0, 10))}.`, { size: 9.5, color: 60 })

  const url = d.folio && d.hash ? urlVerificacion(baseVerificacion(), d.folio, d.hash) : `MediSuite|BORRADOR|${r.id}`
  const nota =
    estado === 'borrador'
      ? 'BORRADOR sin validez. Emita el documento para asignar folio y huella de verificación.'
      : `Folio ${d.folio}. Huella SHA-256: ${String(d.hash).slice(0, 16)}… El QR permite verificar en el sistema del consultorio que el documento no fue alterado ni cancelado.`
  await pieFirma(c, url, nota, estado === 'borrador' ? 'Vista previa' : 'Escanee para verificar')
  if (estado === 'cancelado') marcaAgua(c, 'CANCELADO')
  if (estado === 'borrador') marcaAgua(c, 'BORRADOR')
  numerar(c)
  return c.doc.output('blob')
}
