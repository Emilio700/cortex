/**
 * Lo que se escribe sobre una captura del visor y cómo se llama el archivo.
 *
 * La captura sale del navegador (a un archivo, al portapapeles, a una hoja), así
 * que lleva dentro lo que hace falta para no confundirla después: qué estudio,
 * qué serie, qué corte y de qué fecha. Y lleva siempre la leyenda de que es
 * material de apoyo: el visor muestra y mide, no interpreta (doc. 03, §6.5).
 *
 * El nombre del paciente **no** va por omisión. Una imagen suelta se reenvía por
 * WhatsApp y se queda en el teléfono de cualquiera; quien quiera el nombre tiene
 * que pedirlo.
 */

export const LEYENDA_DE_CAPTURA = 'Material de apoyo · No es un informe radiológico'

export interface DatosDeCaptura {
  estudio: string | null
  modalidad: string | null
  /** Fecha del estudio (AAAA-MM-DD…). */
  fecha: string | null
  serie: string | null
  /** Posición del corte, desde 0. */
  indice: number
  total: number
  ventana?: string | null
  invertido?: boolean
  paciente?: string | null
}

const SIN_FECHA = 'sin fecha'

function fechaLegible(valor: string | null | undefined): string {
  const texto = String(valor ?? '').trim()
  if (!texto) return SIN_FECHA
  const [anio, mes, dia] = texto.slice(0, 10).split('-')
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : texto.slice(0, 10)
}

/** Las líneas del sello, de arriba abajo, en la esquina de la imagen. */
export function lineasDelSello(datos: DatosDeCaptura): string[] {
  const lineas: string[] = []
  if (datos.paciente?.trim()) lineas.push(datos.paciente.trim())
  lineas.push(
    [datos.estudio?.trim() || 'Estudio de imagen', datos.modalidad?.trim()]
      .filter(Boolean)
      .join(' · ')
  )
  lineas.push(
    [datos.serie?.trim(), fechaLegible(datos.fecha)].filter(Boolean).join(' · ')
  )
  const corte = `Corte ${datos.indice + 1} / ${datos.total}`
  const extras = [datos.ventana, datos.invertido ? 'invertido' : null].filter(Boolean)
  lineas.push([corte, ...extras].join(' · '))
  return lineas
}

/** Sin acentos, espacios ni signos: un nombre que cualquier sistema acepta. */
export function limpiarParaArchivo(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sin-nombre'
  )
}

/** «cortex-rm-t2-ax-corte-012-2026-09-14.png». */
export function nombreDeArchivoCaptura(datos: DatosDeCaptura, extension = 'png'): string {
  const partes = [
    'cortex',
    limpiarParaArchivo(datos.modalidad ?? 'img'),
    limpiarParaArchivo(datos.serie ?? 'serie'),
    `corte-${String(datos.indice + 1).padStart(3, '0')}`,
  ]
  const fecha = String(datos.fecha ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) partes.push(fecha)
  return `${partes.join('-')}.${extension}`
}

/** Nombre sugerido para marcar el corte, si el médico no escribe uno. */
export function etiquetaSugerida(serie: string | null | undefined, indice: number): string {
  return [serie?.trim(), `corte ${indice + 1}`].filter(Boolean).join(' · ')
}
