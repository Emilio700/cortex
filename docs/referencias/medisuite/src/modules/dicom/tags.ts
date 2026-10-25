// Diccionario reducido de etiquetas DICOM comunes (nombre en español + VR para archivos implícitos).
import type { DataSet, Element } from 'dicom-parser'
import { str } from './dicomlib'

export const DICT: Record<string, [string, string]> = {
  x00020010: ['Sintaxis de transferencia', 'UI'],
  x00020002: ['Media Storage SOP Class', 'UI'],
  x00020013: ['Implementación', 'SH'],
  x00080005: ['Juego de caracteres', 'CS'],
  x00080008: ['Tipo de imagen', 'CS'],
  x00080016: ['SOP Class UID', 'UI'],
  x00080018: ['SOP Instance UID', 'UI'],
  x00080020: ['Fecha del estudio', 'DA'],
  x00080021: ['Fecha de la serie', 'DA'],
  x00080022: ['Fecha de adquisición', 'DA'],
  x00080023: ['Fecha del contenido', 'DA'],
  x00080030: ['Hora del estudio', 'TM'],
  x00080031: ['Hora de la serie', 'TM'],
  x00080050: ['Número de acceso', 'SH'],
  x00080060: ['Modalidad', 'CS'],
  x00080064: ['Tipo de conversión', 'CS'],
  x00080070: ['Fabricante', 'LO'],
  x00080080: ['Institución', 'LO'],
  x00080081: ['Dirección de la institución', 'ST'],
  x00080090: ['Médico referente', 'PN'],
  x00081010: ['Nombre de la estación', 'SH'],
  x00081030: ['Descripción del estudio', 'LO'],
  x0008103e: ['Descripción de la serie', 'LO'],
  x00081040: ['Departamento', 'LO'],
  x00081050: ['Médico que realiza', 'PN'],
  x00081070: ['Operador', 'PN'],
  x00081090: ['Modelo del equipo', 'LO'],
  x00100010: ['Nombre del paciente', 'PN'],
  x00100020: ['ID del paciente', 'LO'],
  x00100030: ['Fecha de nacimiento', 'DA'],
  x00100040: ['Sexo', 'CS'],
  x00101010: ['Edad', 'AS'],
  x00101020: ['Talla (m)', 'DS'],
  x00101030: ['Peso (kg)', 'DS'],
  x00101040: ['Dirección del paciente', 'LO'],
  x00180015: ['Región anatómica', 'CS'],
  x00180050: ['Grosor de corte (mm)', 'DS'],
  x00180060: ['kVp', 'DS'],
  x00180080: ['TR (ms)', 'DS'],
  x00180081: ['TE (ms)', 'DS'],
  x00180087: ['Campo magnético (T)', 'DS'],
  x00180088: ['Espaciado entre cortes', 'DS'],
  x00181020: ['Versión de software', 'LO'],
  x00181030: ['Protocolo', 'LO'],
  x00181150: ['Tiempo de exposición', 'IS'],
  x00181151: ['Corriente del tubo (mA)', 'IS'],
  x00181164: ['Espaciado del detector', 'DS'],
  x00185100: ['Posición del paciente', 'CS'],
  x0020000d: ['Study Instance UID', 'UI'],
  x0020000e: ['Series Instance UID', 'UI'],
  x00200010: ['ID del estudio', 'SH'],
  x00200011: ['Número de serie', 'IS'],
  x00200012: ['Número de adquisición', 'IS'],
  x00200013: ['Número de instancia', 'IS'],
  x00200020: ['Orientación del paciente', 'CS'],
  x00200032: ['Posición de la imagen (paciente)', 'DS'],
  x00200037: ['Orientación de la imagen (paciente)', 'DS'],
  x00200052: ['Frame of Reference UID', 'UI'],
  x00201041: ['Posición del corte', 'DS'],
  x00280002: ['Muestras por píxel', 'US'],
  x00280004: ['Interpretación fotométrica', 'CS'],
  x00280006: ['Configuración planar', 'US'],
  x00280008: ['Número de cuadros', 'IS'],
  x00280010: ['Filas', 'US'],
  x00280011: ['Columnas', 'US'],
  x00280030: ['Espaciado de píxel (mm)', 'DS'],
  x00280100: ['Bits asignados', 'US'],
  x00280101: ['Bits almacenados', 'US'],
  x00280102: ['Bit alto', 'US'],
  x00280103: ['Representación de píxel', 'US'],
  x00281050: ['Centro de ventana', 'DS'],
  x00281051: ['Ancho de ventana', 'DS'],
  x00281052: ['Intercepto de reescala', 'DS'],
  x00281053: ['Pendiente de reescala', 'DS'],
  x00281054: ['Tipo de reescala', 'LO'],
  x00321060: ['Procedimiento solicitado', 'LO'],
  x00400254: ['Descripción del procedimiento', 'LO'],
  x7fe00010: ['Datos de píxel', 'OW'],
}

export const SUMMARY = [
  'x00100010', 'x00100020', 'x00100030', 'x00100040', 'x00101010', 'x00080020', 'x00080060', 'x00180015',
  'x00081030', 'x0008103e', 'x00080080', 'x00080070', 'x00081090', 'x00180050', 'x00280030', 'x00280010', 'x00280011',
  'x00020010', 'x00280004',
]

const STRING_VR = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UI', 'UR', 'UT'])

export function fmtTag(tag: string) {
  return `(${tag.slice(1, 5)},${tag.slice(5, 9)})`.toUpperCase()
}

export function elementValue(ds: DataSet, el: Element): { vr: string; value: string } {
  const vr = el.vr ?? DICT[el.tag]?.[1] ?? '??'
  try {
    if (el.items) return { vr: 'SQ', value: `Secuencia (${el.items.length} elementos)` }
    if (el.tag === 'x7fe00010') return { vr, value: el.encapsulatedPixelData ? `${el.fragments?.length ?? 0} fragmentos` : `${el.length} bytes` }
    if (STRING_VR.has(vr)) {
      const s = str(ds, el.tag)
      return { vr, value: vr === 'PN' ? s.replace(/\^/g, ' ') : s }
    }
    const n = (k: number) => Array.from({ length: Math.min(8, el.length / k) }, (_, i) => i)
    if (vr === 'US') return { vr, value: n(2).map((i) => ds.uint16(el.tag, i)).join('\\') }
    if (vr === 'SS') return { vr, value: n(2).map((i) => ds.int16(el.tag, i)).join('\\') }
    if (vr === 'UL') return { vr, value: n(4).map((i) => ds.uint32(el.tag, i)).join('\\') }
    if (vr === 'SL') return { vr, value: n(4).map((i) => ds.int32(el.tag, i)).join('\\') }
    if (vr === 'FL') return { vr, value: n(4).map((i) => ds.float(el.tag, i)?.toFixed(4)).join('\\') }
    if (vr === 'FD') return { vr, value: n(8).map((i) => ds.double(el.tag, i)?.toFixed(4)).join('\\') }
    if (vr === 'AT') return { vr, value: ds.attributeTag(el.tag) ?? '' }
    if (vr === '??' && el.length > 0 && el.length < 128) {
      const s = ds.string(el.tag) ?? ''
      if (/^[\x20-\x7e]*$/.test(s)) return { vr, value: s }
    }
  } catch {
    /* valor ilegible */
  }
  return { vr, value: `[${el.length} bytes]` }
}
