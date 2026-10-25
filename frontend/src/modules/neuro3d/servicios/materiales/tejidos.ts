/**
 * Tejidos del modo Realista: qué material lleva cada pieza y cómo se ve.
 *
 * Puro (sin three.js): la escena, las pruebas y las capas futuras leen de aquí.
 * Una capa con mallas detalladas (tramo ATLAS) no elige materiales: entrega sus
 * piezas con `acabado` y `capa` —y, si quiere precisar, `tejido`— y la escena
 * resuelve el tejido con `tejidoDePieza` y le pide el material a la biblioteca
 * (`biblioteca.ts`).
 *
 * Los colores son tokens `--cx-anat-real-*` de `ui/atlas.css`; `respaldo` sólo
 * se usa si la hoja no cargó.
 */
import type { CapaId } from '../../dominio/capas'
import type { Acabado } from '../anatomia/tipos'

export type Tejido =
  | 'hueso'
  | 'corteza'
  | 'sustancia-blanca'
  | 'medula'
  | 'nervio'
  | 'arteria'
  | 'vena'
  | 'disco'
  | 'liquido'
  | 'piel'
  | 'craneo'
  | 'via'
  | 'lesion'

/** Relieve fino generado en código (ver `texturas.ts`). */
export type Relieve = 'poro' | 'tejido' | 'liso'

export interface DefinicionDeTejido {
  nombre: string
  /** Token de color; `null` = el de la pieza (vías y lesiones conservan su color didáctico). */
  color: string | null
  respaldo: string
  rugosidad: number
  clearcoat: number
  clearcoatRugosidad: number
  sheen: number
  /** Token del brillo aterciopelado (nervios). */
  sheenColor?: string
  opacidad: number
  /** Se ve por dentro al cortar (órganos, envolturas). */
  dobleCara: boolean
  emisivo: number
  relieve: Relieve
  /** Fuerza del relieve sobre la normal (0–1). */
  fuerzaRelieve: number
  /** Repeticiones de la textura por centímetro. */
  escalaRelieve: number
  /** Cuánto varía la rugosidad con el relieve (0–1). */
  variacionRugosidad: number
  /** Cuánto oscurece el relieve el color (poros). */
  variacionColor: number
  /** Borde luminoso (piel y cráneo translúcidos). */
  fresnel?: { potencia: number; minimo: number }
}

export const TEJIDOS: Record<Tejido, DefinicionDeTejido> = {
  hueso: {
    nombre: 'Hueso cortical',
    color: '--cx-anat-real-hueso',
    respaldo: '#e6d9bd',
    rugosidad: 0.5,
    clearcoat: 0.08,
    clearcoatRugosidad: 0.55,
    sheen: 0,
    opacidad: 1,
    dobleCara: false,
    emisivo: 0,
    relieve: 'poro',
    fuerzaRelieve: 0.55,
    escalaRelieve: 0.42,
    variacionRugosidad: 0.45,
    variacionColor: 0.22,
  },
  corteza: {
    nombre: 'Corteza cerebral',
    color: '--cx-anat-real-corteza',
    respaldo: '#d7aea6',
    rugosidad: 0.55,
    clearcoat: 0.45,
    clearcoatRugosidad: 0.28,
    sheen: 0.25,
    sheenColor: '--cx-anat-real-brillo',
    opacidad: 1,
    dobleCara: true,
    emisivo: 0,
    relieve: 'tejido',
    fuerzaRelieve: 0.22,
    escalaRelieve: 0.55,
    variacionRugosidad: 0.25,
    variacionColor: 0.06,
  },
  'sustancia-blanca': {
    nombre: 'Sustancia blanca',
    color: '--cx-anat-real-blanca',
    respaldo: '#e8d6cb',
    rugosidad: 0.5,
    clearcoat: 0.4,
    clearcoatRugosidad: 0.3,
    sheen: 0.2,
    sheenColor: '--cx-anat-real-brillo',
    opacidad: 1,
    dobleCara: true,
    emisivo: 0,
    relieve: 'tejido',
    fuerzaRelieve: 0.15,
    escalaRelieve: 0.6,
    variacionRugosidad: 0.2,
    variacionColor: 0.04,
  },
  medula: {
    nombre: 'Médula espinal',
    color: '--cx-anat-real-medula',
    respaldo: '#efdfc8',
    rugosidad: 0.42,
    clearcoat: 0.45,
    clearcoatRugosidad: 0.25,
    sheen: 0.35,
    sheenColor: '--cx-anat-real-brillo',
    opacidad: 1,
    dobleCara: false,
    emisivo: 0,
    relieve: 'tejido',
    fuerzaRelieve: 0.15,
    escalaRelieve: 0.8,
    variacionRugosidad: 0.2,
    variacionColor: 0.03,
  },
  nervio: {
    nombre: 'Nervio',
    color: '--cx-anat-real-nervio',
    respaldo: '#e9cf8c',
    rugosidad: 0.45,
    clearcoat: 0.25,
    clearcoatRugosidad: 0.35,
    sheen: 0.7,
    sheenColor: '--cx-anat-real-nervio-brillo',
    opacidad: 1,
    dobleCara: false,
    emisivo: 0,
    relieve: 'tejido',
    fuerzaRelieve: 0.2,
    escalaRelieve: 1.4,
    variacionRugosidad: 0.2,
    variacionColor: 0.05,
  },
  arteria: {
    nombre: 'Arteria',
    color: '--cx-anat-real-arteria',
    respaldo: '#b3262c',
    rugosidad: 0.32,
    clearcoat: 0.85,
    clearcoatRugosidad: 0.14,
    sheen: 0,
    opacidad: 1,
    dobleCara: false,
    emisivo: 0.04,
    relieve: 'liso',
    fuerzaRelieve: 0,
    escalaRelieve: 1,
    variacionRugosidad: 0,
    variacionColor: 0,
  },
  vena: {
    nombre: 'Vena o seno venoso',
    color: '--cx-anat-real-vena',
    respaldo: '#33407e',
    rugosidad: 0.36,
    clearcoat: 0.7,
    clearcoatRugosidad: 0.18,
    sheen: 0,
    opacidad: 1,
    dobleCara: false,
    emisivo: 0.03,
    relieve: 'liso',
    fuerzaRelieve: 0,
    escalaRelieve: 1,
    variacionRugosidad: 0,
    variacionColor: 0,
  },
  disco: {
    nombre: 'Disco intervertebral',
    color: '--cx-anat-real-disco',
    respaldo: '#b9d2e4',
    rugosidad: 0.3,
    clearcoat: 0.65,
    clearcoatRugosidad: 0.2,
    sheen: 0.3,
    sheenColor: '--cx-anat-real-brillo',
    opacidad: 0.82,
    dobleCara: false,
    emisivo: 0.02,
    relieve: 'tejido',
    fuerzaRelieve: 0.18,
    escalaRelieve: 0.9,
    variacionRugosidad: 0.2,
    variacionColor: 0.03,
  },
  liquido: {
    nombre: 'Líquido cefalorraquídeo',
    color: '--cx-anat-real-lcr',
    respaldo: '#9fd8f0',
    rugosidad: 0.08,
    clearcoat: 1,
    clearcoatRugosidad: 0.05,
    sheen: 0,
    opacidad: 0.62,
    dobleCara: true,
    emisivo: 0.12,
    relieve: 'liso',
    fuerzaRelieve: 0,
    escalaRelieve: 1,
    variacionRugosidad: 0,
    variacionColor: 0,
  },
  piel: {
    nombre: 'Piel',
    color: '--cx-anat-real-piel',
    respaldo: '#e3b49b',
    rugosidad: 0.6,
    clearcoat: 0,
    clearcoatRugosidad: 0.5,
    sheen: 0,
    // Más tenue que en Estándar: en Realista lo que importa es lo de adentro, y
    // un velo claro encima apaga el color de los tejidos.
    opacidad: 0.26,
    dobleCara: false,
    emisivo: 0.04,
    relieve: 'liso',
    fuerzaRelieve: 0,
    escalaRelieve: 1,
    variacionRugosidad: 0,
    variacionColor: 0,
    fresnel: { potencia: 2.6, minimo: 0.02 },
  },
  craneo: {
    nombre: 'Cráneo',
    color: '--cx-anat-real-hueso',
    respaldo: '#e6d9bd',
    rugosidad: 0.55,
    clearcoat: 0,
    clearcoatRugosidad: 0.5,
    sheen: 0,
    opacidad: 0.4,
    dobleCara: false,
    emisivo: 0.03,
    relieve: 'liso',
    fuerzaRelieve: 0,
    escalaRelieve: 1,
    variacionRugosidad: 0,
    variacionColor: 0,
    fresnel: { potencia: 2.2, minimo: 0.03 },
  },
  via: {
    nombre: 'Vía (esquemática)',
    color: null,
    respaldo: '#ff8a5c',
    rugosidad: 0.5,
    clearcoat: 0,
    clearcoatRugosidad: 0.5,
    sheen: 0,
    opacidad: 0.92,
    dobleCara: false,
    emisivo: 1.1,
    relieve: 'liso',
    fuerzaRelieve: 0,
    escalaRelieve: 1,
    variacionRugosidad: 0,
    variacionColor: 0,
  },
  lesion: {
    nombre: 'Lesión marcada',
    color: null,
    respaldo: '#ffb020',
    rugosidad: 0.3,
    clearcoat: 0.6,
    clearcoatRugosidad: 0.3,
    sheen: 0,
    opacidad: 1,
    dobleCara: false,
    emisivo: 0.55,
    relieve: 'liso',
    fuerzaRelieve: 0,
    escalaRelieve: 1,
    variacionRugosidad: 0,
    variacionColor: 0,
  },
}

/** El tronco del encéfalo se ve por fuera como sustancia blanca. */
const TRONCO = new Set(['mesencefalo', 'protuberancia', 'bulbo'])

export interface DatosDeTejido {
  estructura?: string
  capa: CapaId
  acabado: Acabado
  tejido?: Tejido
}

/**
 * El tejido de una pieza. Funciona igual para las del atlas, las del paciente
 * (TC: `vertebra-*` y `sacro` llegan como «hueso», la médula como «nervio» en la
 * capa «medula») y las de capas futuras, que pueden precisarlo con `tejido`.
 */
export const tejidoDePieza = (p: DatosDeTejido): Tejido => {
  if (p.tejido) return p.tejido
  switch (p.acabado) {
    case 'hueso':
      return 'hueso'
    case 'disco':
      return 'disco'
    case 'nervio':
      return p.capa === 'medula' ? 'medula' : 'nervio'
    case 'vaso':
      return p.capa === 'venas' ? 'vena' : 'arteria'
    case 'liquido':
      return 'liquido'
    case 'envoltura':
      return p.capa === 'craneo' ? 'craneo' : 'piel'
    case 'via':
      return 'via'
    case 'lesion':
      return 'lesion'
    case 'organo':
    default:
      return p.estructura && TRONCO.has(p.estructura) ? 'sustancia-blanca' : 'corteza'
  }
}

/** Los tokens que usa el modo Realista (hay prueba de que existen en la hoja). */
export const TOKENS_DE_TEJIDOS: string[] = [
  ...new Set(
    Object.values(TEJIDOS).flatMap((t) => [t.color, t.sheenColor].filter((x): x is string => Boolean(x))),
  ),
]
