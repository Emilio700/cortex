import type { Patient } from './types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function nombreCompleto(p: Pick<Patient, 'nombre' | 'apellidos'>) {
  return `${p.nombre} ${p.apellidos}`
}

export function edad(fechaNac: string, ref = new Date()): { anios: number; meses: number; texto: string } {
  const n = new Date(fechaNac + 'T00:00:00')
  let meses = (ref.getFullYear() - n.getFullYear()) * 12 + (ref.getMonth() - n.getMonth())
  if (ref.getDate() < n.getDate()) meses--
  meses = Math.max(meses, 0) // fecha futura o inválida → 0
  const anios = Math.floor(meses / 12)
  const texto = anios >= 3 ? `${anios} años` : anios >= 1 ? `${anios} a ${meses % 12} m` : meses === 1 ? '1 mes' : `${meses} meses`
  return { anios, meses, texto }
}

export function fmtFecha(iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString('es-MX', opts)
}

export function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function iniciales(p: Pick<Patient, 'nombre' | 'apellidos'>) {
  return (p.nombre[0] + (p.apellidos[0] ?? '')).toUpperCase()
}

export function fileToDataUrl(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(f)
  })
}

export function downloadBlob(data: Blob | string, filename: string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// Ruta absoluta a un archivo de /public respetando la base relativa del build
export function asset(path: string) {
  return new URL(path.replace(/^\//, ''), document.baseURI).href
}

export const OBS_LABELS: Record<string, { label: string; unidad: string }> = {
  peso: { label: 'Peso', unidad: 'kg' },
  talla: { label: 'Talla', unidad: 'cm' },
  imc: { label: 'IMC', unidad: 'kg/m²' },
  pas: { label: 'Presión sistólica', unidad: 'mmHg' },
  pad: { label: 'Presión diastólica', unidad: 'mmHg' },
  fc: { label: 'Frecuencia cardiaca', unidad: 'lpm' },
  fr: { label: 'Frecuencia respiratoria', unidad: 'rpm' },
  temp: { label: 'Temperatura', unidad: '°C' },
  spo2: { label: 'SpO₂', unidad: '%' },
  glucosa: { label: 'Glucosa', unidad: 'mg/dL' },
  hba1c: { label: 'HbA1c', unidad: '%' },
  colesterol: { label: 'Colesterol total', unidad: 'mg/dL' },
  trigliceridos: { label: 'Triglicéridos', unidad: 'mg/dL' },
  hdl: { label: 'HDL', unidad: 'mg/dL' },
  ldl: { label: 'LDL', unidad: 'mg/dL' },
  creatinina: { label: 'Creatinina', unidad: 'mg/dL' },
  hemoglobina: { label: 'Hemoglobina', unidad: 'g/dL' },
  tfg: { label: 'TFG', unidad: 'mL/min/1.73m²' },
  urea: { label: 'Urea', unidad: 'mg/dL' },
  bun: { label: 'BUN', unidad: 'mg/dL' },
  'acido-urico': { label: 'Ácido úrico', unidad: 'mg/dL' },
  hematocrito: { label: 'Hematocrito', unidad: '%' },
  leucocitos: { label: 'Leucocitos', unidad: '10³/µL' },
  plaquetas: { label: 'Plaquetas', unidad: '10³/µL' },
  tsh: { label: 'TSH', unidad: 'µUI/mL' },
  alt: { label: 'ALT (TGP)', unidad: 'U/L' },
  ast: { label: 'AST (TGO)', unidad: 'U/L' },
  sodio: { label: 'Sodio', unidad: 'mEq/L' },
  potasio: { label: 'Potasio', unidad: 'mEq/L' },
  'perimetro-cefalico': { label: 'Perímetro cefálico', unidad: 'cm' },
  cintura: { label: 'Cintura', unidad: 'cm' },
  grasa: { label: '% Grasa', unidad: '%' },
  rom: { label: 'Rango de movimiento', unidad: '°' },
  escala: { label: 'Escala clínica', unidad: 'pts' },
  'agudeza-od': { label: 'Agudeza visual OD', unidad: 'logMAR' },
  'agudeza-oi': { label: 'Agudeza visual OI', unidad: 'logMAR' },
}

/** Convierte un data: URL (base64 o texto) a Blob sin usar fetch (compatible con CSP estricta). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const coma = dataUrl.indexOf(',')
  const header = dataUrl.slice(5, coma) // sin "data:"
  const datos = dataUrl.slice(coma + 1)
  const partes = header.split(';')
  const mime = partes[0] || 'application/octet-stream'
  if (partes.includes('base64')) {
    const bin = atob(datos)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(datos)], { type: partes.join(';') || mime })
}

/**
 * Contenido de un documento como Blob. En modo demo `dataUrl` es un data: URL; en modo servidor es
 * `/api/files/<id>` (mismo origen, se envía la cookie de sesión).
 */
export async function fetchDocBlob(doc: { dataUrl: string; mime?: string }): Promise<Blob> {
  if (doc.dataUrl.startsWith('data:')) return dataUrlToBlob(doc.dataUrl)
  const r = await fetch(doc.dataUrl, { credentials: 'same-origin' })
  if (!r.ok) throw new Error(r.status === 401 ? 'Tu sesión expiró.' : `No se pudo descargar el archivo (${r.status}).`)
  const b = await r.blob()
  return doc.mime && !b.type ? new Blob([b], { type: doc.mime }) : b
}

/** Documento como data: URL (para librerías que lo exigen, p. ej. Excalidraw). */
export async function docToDataUrl(doc: { dataUrl: string; mime?: string }): Promise<string> {
  if (doc.dataUrl.startsWith('data:')) return doc.dataUrl
  return fileToDataUrl(await fetchDocBlob(doc))
}
