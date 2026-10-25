/**
 * El atlas detallado de Neuro 3D: mallas reales de BodyParts3D 4.0 (DBCLS,
 * CC BY 4.0) en lugar del modelo simplificado que Cortex dibuja en código.
 *
 * Es **una persona de referencia**, no el paciente: sólo se ofrece con el
 * origen «esquemático» y lleva su propio aviso, sin tocar `AVISO_ORIGEN` (el
 * contrato común de los orígenes).
 *
 * Los modelos no viajan en el código: cada servidor los prepara con
 * `scripts/atlas/preparar_atlas.py`, que deja en `public/atlas/bodyparts3d/`
 * los GLB, un `manifiesto.json` y un `CREDITOS.json`. Aquí, puro: el formato
 * del manifiesto, su validación y cómo cada pieza cae en el catálogo.
 */
import { CAPAS, type CapaId } from './capas'
import { estructuraPorId } from './catalogo'

export type DetalleDelModelo = 'simplificado' | 'atlas'

export const NOMBRE_DE_DETALLE: Record<DetalleDelModelo, string> = {
  simplificado: 'Simplificado',
  atlas: 'Atlas detallado',
}

export const AVISO_ATLAS =
  'Atlas detallado: anatomía real de una persona de referencia (BodyParts3D), no la de este paciente. Las raíces, la médula y las vías siguen siendo esquemáticas.'

export const MOTIVO_SIN_ATLAS = 'El atlas detallado no está instalado en este servidor.'

/** Para quien administra el servidor: cómo se instala. */
export const COMO_INSTALAR_ATLAS =
  'Para instalarlo, el administrador corre scripts/atlas/preparar_atlas.py (instrucciones en scripts/atlas/README.md) y vuelve a publicar el frontend.'

export const MOTIVO_SOLO_ESQUEMATICO = 'El atlas detallado sólo se usa con el origen «Esquemático».'

/** Tejidos que escribe el script (los mismos de la biblioteca de materiales del modo Realista). */
export type TejidoDelAtlas = 'hueso' | 'craneo' | 'corteza' | 'sustancia-blanca' | 'nervio' | 'arteria' | 'vena' | 'disco' | 'liquido'

const TEJIDOS: readonly TejidoDelAtlas[] = ['hueso', 'craneo', 'corteza', 'sustancia-blanca', 'nervio', 'arteria', 'vena', 'disco', 'liquido']

export interface EntradaDelAtlas {
  /** Nombre del nodo en el GLB. */
  clave: string
  /** Id del catálogo de Neuro 3D (`vertebra-L5`, `giro-precentral-izq`). */
  estructura: string
  /** La estructura del catálogo que la contiene (giro → lóbulo, hueso → cráneo). */
  parteDe: string | null
  capa: string
  tejido: TejidoDelAtlas
  region: 'cabeza' | 'columna'
  fma: string[]
  nombre?: string
}

export interface ArchivoDelAtlas {
  region: 'cabeza' | 'columna'
  ruta: string
  bytes: number
  sha256?: string
}

export interface ManifiestoDelAtlas {
  version: 1
  fuente: string
  versionFuente: string
  unidades: 'mm'
  sistema: 'LPS'
  preparado?: string
  archivos: ArchivoDelAtlas[]
  estructuras: EntradaDelAtlas[]
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const esRegion = (v: unknown): v is 'cabeza' | 'columna' => v === 'cabeza' || v === 'columna'

/**
 * Valida el manifiesto que sirve el servidor. Un servidor sin atlas suele
 * devolver la página de inicio (HTML) con 200: eso, o un JSON que no declara
 * milímetros y LPS, cuenta como «no instalado».
 */
export function leerManifiesto(json: unknown): ManifiestoDelAtlas | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (o.version !== 1 || o.unidades !== 'mm' || o.sistema !== 'LPS' || !esTexto(o.fuente)) return null
  if (!Array.isArray(o.archivos) || !Array.isArray(o.estructuras)) return null
  const archivos: ArchivoDelAtlas[] = []
  for (const a of o.archivos as Record<string, unknown>[]) {
    if (!a || !esRegion(a.region) || !esTexto(a.ruta) || typeof a.bytes !== 'number' || a.bytes <= 0) return null
    // Sólo nombres de archivo: el manifiesto no puede mandar a otra carpeta.
    if (/[\\/]|\.\./.test(a.ruta)) return null
    archivos.push({ region: a.region, ruta: a.ruta, bytes: a.bytes, sha256: esTexto(a.sha256) ? a.sha256 : undefined })
  }
  const estructuras: EntradaDelAtlas[] = []
  for (const e of o.estructuras as Record<string, unknown>[]) {
    if (!e || !esTexto(e.clave) || !esTexto(e.estructura) || !esTexto(e.capa) || !esRegion(e.region)) return null
    if (!TEJIDOS.includes(e.tejido as TejidoDelAtlas)) return null
    estructuras.push({
      clave: e.clave,
      estructura: e.estructura,
      parteDe: esTexto(e.parteDe) ? e.parteDe : null,
      capa: e.capa,
      tejido: e.tejido as TejidoDelAtlas,
      region: e.region,
      fma: Array.isArray(e.fma) ? (e.fma as unknown[]).filter(esTexto) : [],
      nombre: esTexto(e.nombre) ? e.nombre : undefined,
    })
  }
  if (archivos.length === 0 || estructuras.length === 0) return null
  return {
    version: 1,
    fuente: o.fuente as string,
    versionFuente: esTexto(o.versionFuente) ? o.versionFuente : '',
    unidades: 'mm',
    sistema: 'LPS',
    preparado: esTexto(o.preparado) ? o.preparado : undefined,
    archivos,
    estructuras,
  }
}

const CAPAS_VALIDAS = new Set<string>(CAPAS.map((c) => c.id))

/** Cómo entra una pieza del atlas en la escena: con qué id se elige y en qué capa. */
export interface UbicacionEnCatalogo {
  /** `undefined` = se ve, pero no se elige (el id no está en este catálogo). */
  estructura?: string
  parteDe?: string
  capa: CapaId
  /** Token de color: el de su estructura en el catálogo, o el del tejido. */
  color: string
}

const COLOR_DE_TEJIDO: Record<TejidoDelAtlas, string> = {
  hueso: '--cx-anat-hueso',
  craneo: '--cx-anat-hueso',
  corteza: '--cx-anat-tronco',
  'sustancia-blanca': '--cx-anat-tronco',
  nervio: '--cx-anat-raiz',
  arteria: '--cx-anat-arteria',
  // Hasta que el catálogo tenga venas (tramo REAL), una vena se pinta como LCR frío.
  vena: '--cx-anat-lcr',
  disco: '--cx-anat-disco',
  liquido: '--cx-anat-lcr',
}

/**
 * Lo que el catálogo dice de una entrada. Una estructura que este catálogo no
 * conoce se ve como decorativa; una capa que no existe (p. ej. «venas» antes
 * de que llegue el tramo REAL) toma la de su estructura o se descarta (`null`).
 */
export function ubicarEnCatalogo(e: EntradaDelAtlas): UbicacionEnCatalogo | null {
  const enCatalogo = estructuraPorId(e.estructura)
  const capa = CAPAS_VALIDAS.has(e.capa) ? (e.capa as CapaId) : enCatalogo?.capa
  if (!capa) return null
  return {
    estructura: enCatalogo ? e.estructura : undefined,
    parteDe: e.parteDe && estructuraPorId(e.parteDe) ? e.parteDe : undefined,
    capa,
    color: enCatalogo?.color ?? COLOR_DE_TEJIDO[e.tejido],
  }
}
