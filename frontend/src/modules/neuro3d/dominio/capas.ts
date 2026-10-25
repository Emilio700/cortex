/**
 * Las capas del atlas y cómo se combinan: lo que el médico enciende, la
 * opacidad que elige y el «pelado» (piel → cráneo → encéfalo → ventrículos y
 * vasos) que se recorre con un deslizador.
 *
 * Puro: la escena recibe el resultado y sólo lo aplica.
 */

export type CapaId =
  | 'piel'
  | 'craneo'
  | 'encefalo'
  | 'ventriculos'
  | 'vasos'
  | 'venas'
  | 'columna'
  | 'medula'
  | 'raices'
  | 'tractos'

export interface DefinicionDeCapa {
  id: CapaId
  nombre: string
  /** Una línea para el panel. */
  ayuda: string
  visible: boolean
  /** 0–1. */
  opacidad: number
  /** Las vías son un dibujo esquemático; se dice en el panel. */
  esquematica?: boolean
}

export const CAPAS: DefinicionDeCapa[] = [
  { id: 'piel', nombre: 'Piel', ayuda: 'Silueta translúcida de la cabeza y el tronco.', visible: true, opacidad: 1 },
  { id: 'craneo', nombre: 'Cráneo', ayuda: 'Bóveda craneal translúcida.', visible: true, opacidad: 1 },
  { id: 'encefalo', nombre: 'Encéfalo', ayuda: 'Lóbulos, ínsula, cerebelo y tronco.', visible: true, opacidad: 1 },
  { id: 'ventriculos', nombre: 'Ventrículos', ayuda: 'Cavidades con líquido cefalorraquídeo.', visible: true, opacidad: 1 },
  { id: 'vasos', nombre: 'Vasos', ayuda: 'Polígono de Willis y sus arterias.', visible: true, opacidad: 1 },
  {
    id: 'venas',
    nombre: 'Venas y senos',
    ayuda: 'Senos venosos de la duramadre, yugulares internas y venas puenteantes.',
    visible: true,
    opacidad: 1,
  },
  { id: 'columna', nombre: 'Columna', ayuda: 'Vértebras C1 a sacro y discos.', visible: true, opacidad: 1 },
  { id: 'medula', nombre: 'Médula', ayuda: 'Médula espinal por segmentos y cono medular.', visible: true, opacidad: 1 },
  { id: 'raices', nombre: 'Raíces', ayuda: 'Raíces nerviosas por nivel y cola de caballo.', visible: true, opacidad: 1 },
  {
    id: 'tractos',
    nombre: 'Vías principales',
    ayuda: 'Corticoespinal y columnas dorsales, del encéfalo a la médula.',
    visible: false,
    opacidad: 1,
    esquematica: true,
  },
]

export type EstadoDeCapas = Record<CapaId, { visible: boolean; opacidad: number }>

export const estadoInicialDeCapas = (): EstadoDeCapas =>
  Object.fromEntries(CAPAS.map((c) => [c.id, { visible: c.visible, opacidad: c.opacidad }])) as EstadoDeCapas

const recortar = (v: number) => Math.min(1, Math.max(0, v))

/** Máximo del deslizador de pelado: 0 = todo cubierto, 3 = encéfalo translúcido. */
export const PELADO_MAXIMO = 3

export const ETAPAS_DEL_PELADO = ['Piel', 'Cráneo', 'Encéfalo', 'Ventrículos y vasos'] as const

/** Qué etapa se está viendo con el deslizador en `v` (para leerlo en voz alta). */
export const etapaDelPelado = (v: number): string =>
  ETAPAS_DEL_PELADO[Math.min(ETAPAS_DEL_PELADO.length - 1, Math.max(0, Math.round(v)))]

/**
 * Multiplicadores del pelado: la piel se va de 0 a 1, el cráneo de 1 a 2 y el
 * encéfalo se vuelve translúcido de 2 a 3. Ventrículos y vasos (arterias y
 * venas) se descubren en el último tramo aunque su capa estuviera apagada: es lo
 * que el pelado promete enseñar.
 */
export const multiplicadoresDelPelado = (v: number) => ({
  piel: recortar(1 - v),
  craneo: recortar(2 - v),
  encefalo: 1 - 0.82 * recortar(v - 2),
  revelar: recortar(v - 2),
})

export interface CapaEfectiva {
  visible: boolean
  opacidad: number
}

/** Visibilidad y opacidad final de cada capa: la elección del médico por el pelado. */
export const capasEfectivas = (estado: EstadoDeCapas, pelado: number): Record<CapaId, CapaEfectiva> => {
  const m = multiplicadoresDelPelado(pelado)
  const salida = {} as Record<CapaId, CapaEfectiva>
  for (const { id } of CAPAS) {
    const { visible, opacidad } = estado[id]
    let o = visible ? opacidad : 0
    if (id === 'piel') o *= m.piel
    if (id === 'craneo') o *= m.craneo
    if (id === 'encefalo') o *= m.encefalo
    if ((id === 'ventriculos' || id === 'vasos' || id === 'venas') && m.revelar > 0) o = Math.max(o, m.revelar)
    salida[id] = { visible: o > 0.01, opacidad: recortar(o) }
  }
  return salida
}
