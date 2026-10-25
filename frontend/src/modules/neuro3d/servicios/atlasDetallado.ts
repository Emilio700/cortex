/**
 * Consulta y descarga del atlas detallado (BodyParts3D) que el servidor sirve
 * como archivos estáticos en `atlas/bodyparts3d/`.
 *
 * Sin three.js: la página lo importa para saber, al abrir, si la opción se
 * puede ofrecer. Las mallas sólo se descargan cuando el médico elige «Atlas
 * detallado» (carga diferida, con avance), y se guardan en memoria mientras la
 * pestaña viva para que volver a elegirlo no las pida otra vez.
 */
import { leerCredito, type Credito } from '../dominio/creditos'
import { leerManifiesto, MOTIVO_SIN_ATLAS, type ManifiestoDelAtlas } from '../dominio/atlasDetallado'

export const RUTA_ATLAS = `${(import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')}atlas/bodyparts3d/`

export type EstadoDelAtlas =
  | { instalado: true; manifiesto: ManifiestoDelAtlas; creditos: Credito }
  | { instalado: false; motivo: string }

type Pedir = (url: string, init?: RequestInit) => Promise<Response>

const leerJson = async (respuesta: Response): Promise<unknown> => {
  if (!respuesta.ok) return null
  try {
    return JSON.parse(await respuesta.text())
  } catch {
    // Un servidor sin atlas suele contestar la página de inicio (HTML).
    return null
  }
}

/** ¿Está instalado? Nunca rechaza: si algo falla, dice que no y por qué. */
export async function consultarAtlas(base = RUTA_ATLAS, pedir: Pedir = fetch): Promise<EstadoDelAtlas> {
  try {
    const [m, c] = await Promise.all([
      pedir(`${base}manifiesto.json`, { cache: 'no-cache' }).then(leerJson),
      pedir(`${base}CREDITOS.json`, { cache: 'no-cache' }).then(leerJson),
    ])
    const manifiesto = leerManifiesto(m)
    const creditos = leerCredito(c)
    // Sin créditos válidos no se muestra: la licencia pide la atribución.
    if (!manifiesto || !creditos) return { instalado: false, motivo: MOTIVO_SIN_ATLAS }
    return { instalado: true, manifiesto, creditos }
  } catch {
    return { instalado: false, motivo: MOTIVO_SIN_ATLAS }
  }
}

export class AtlasIncompleto extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'AtlasIncompleto'
  }
}

const enMemoria = new Map<string, Promise<ArrayBuffer>>()

/** Para pruebas. */
export const olvidarDescargas = () => enMemoria.clear()

const descargarUno = async (url: string, bytes: number, alAvanzar: (leidos: number) => void, pedir: Pedir): Promise<ArrayBuffer> => {
  try {
    return await leerCompleto(url, bytes, alAvanzar, pedir)
  } catch (err) {
    if (err instanceof AtlasIncompleto) throw err
    // «Failed to fetch» no le dice nada al médico.
    throw new AtlasIncompleto('Se cortó la descarga del atlas detallado. Revisa la conexión e inténtalo de nuevo.')
  }
}

const leerCompleto = async (url: string, bytes: number, alAvanzar: (leidos: number) => void, pedir: Pedir): Promise<ArrayBuffer> => {
  const r = await pedir(url)
  if (!r.ok) throw new AtlasIncompleto(`El servidor no entregó ${url.split('/').pop()} (${r.status}).`)
  let datos: Uint8Array
  if (r.body && typeof r.body.getReader === 'function') {
    const lector = r.body.getReader()
    const partes: Uint8Array[] = []
    let leidos = 0
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      partes.push(value)
      leidos += value.byteLength
      alAvanzar(leidos)
    }
    datos = new Uint8Array(leidos)
    let i = 0
    for (const p of partes) {
      datos.set(p, i)
      i += p.byteLength
    }
  } else {
    datos = new Uint8Array(await r.arrayBuffer())
    alAvanzar(datos.byteLength)
  }
  // Un archivo cortado (descarga interrumpida, servidor a medias) no se dibuja.
  if (datos.byteLength !== bytes) throw new AtlasIncompleto(`${url.split('/').pop()} llegó incompleto (${datos.byteLength} de ${bytes} bytes).`)
  return datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer
}

/**
 * Descarga los GLB del manifiesto. `alProgreso` recibe de 0 a 1 sobre el total
 * de bytes. Lo ya descargado en esta pestaña se reutiliza.
 */
export async function descargarAtlas(
  manifiesto: ManifiestoDelAtlas,
  alProgreso: (fraccion: number) => void = () => {},
  base = RUTA_ATLAS,
  pedir: Pedir = fetch,
): Promise<ArrayBuffer[]> {
  const total = manifiesto.archivos.reduce((s, a) => s + a.bytes, 0)
  const leidos = new Map<string, number>()
  const avisar = () => alProgreso(Math.min(1, [...leidos.values()].reduce((s, n) => s + n, 0) / total))
  alProgreso(0)
  const buffers = await Promise.all(
    manifiesto.archivos.map(async (a) => {
      const url = `${base}${a.ruta}`
      const clave = `${url}#${a.bytes}`
      let promesa = enMemoria.get(clave)
      if (!promesa) {
        promesa = descargarUno(
          url,
          a.bytes,
          (n) => {
            leidos.set(url, n)
            avisar()
          },
          pedir,
        )
        enMemoria.set(clave, promesa)
        // Si falla, la próxima vez se vuelve a pedir.
        promesa.catch(() => enMemoria.delete(clave))
      }
      const datos = await promesa
      leidos.set(url, a.bytes)
      avisar()
      return datos
    }),
  )
  return buffers
}
