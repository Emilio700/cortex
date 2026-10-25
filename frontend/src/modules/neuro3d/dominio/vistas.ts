/**
 * Vistas predefinidas del atlas, con su tecla.
 *
 * Coordenadas del modelo, en centímetros: +x es el lado IZQUIERDO del paciente,
 * +y arriba y +z hacia delante. Así la vista anterior deja la izquierda del
 * paciente a la derecha de la pantalla, como al tenerlo enfrente.
 */

export type VistaId = 'anterior' | 'lateral' | 'superior' | 'sagital' | 'columna' | 'base' | 'posterior'

export type Vec3 = [number, number, number]

export interface Vista {
  id: VistaId
  nombre: string
  /** Tecla que la abre (sin modificadores). */
  tecla: string
  descripcion: string
  posicion: Vec3
  objetivo: Vec3
  arriba: Vec3
  /** El sagital medio abre con el corte sagital en la línea media. */
  corte?: { plano: PlanoDeCorte; posicion: number }
}

export type PlanoDeCorte = 'ninguno' | 'sagital' | 'axial' | 'coronal'

export const PLANOS_DE_CORTE: { id: PlanoDeCorte; nombre: string }[] = [
  { id: 'ninguno', nombre: 'Sin corte' },
  { id: 'sagital', nombre: 'Sagital' },
  { id: 'axial', nombre: 'Axial' },
  { id: 'coronal', nombre: 'Coronal' },
]

/** Hasta dónde puede moverse cada plano (cm), para el deslizador. */
export const LIMITES_DE_CORTE: Record<Exclude<PlanoDeCorte, 'ninguno'>, [number, number]> = {
  sagital: [-9, 9],
  axial: [-90, 12],
  coronal: [-12, 14],
}

const CENTRO_ENCEFALO: Vec3 = [0, 0.6, -0.4]

export const VISTAS: Vista[] = [
  {
    id: 'anterior',
    nombre: 'Anterior',
    tecla: '1',
    descripcion: 'De frente, como al tener al paciente enfrente.',
    posicion: [0, 3, 40],
    objetivo: CENTRO_ENCEFALO,
    arriba: [0, 1, 0],
  },
  {
    id: 'lateral',
    nombre: 'Lateral',
    tecla: '2',
    descripcion: 'Desde el lado izquierdo: los cuatro lóbulos y la cisura de Silvio.',
    posicion: [40, 2, 1],
    objetivo: CENTRO_ENCEFALO,
    arriba: [0, 1, 0],
  },
  {
    id: 'superior',
    nombre: 'Superior',
    tecla: '3',
    descripcion: 'Desde arriba, con la frente hacia arriba de la pantalla.',
    posicion: [0, 42, 0.5],
    objetivo: CENTRO_ENCEFALO,
    arriba: [0, 0, 1],
  },
  {
    id: 'sagital',
    nombre: 'Sagital medio',
    tecla: '4',
    descripcion: 'Corte por la línea media: cara interna del hemisferio, tronco y ventrículos.',
    posicion: [-38, 1, 2],
    objetivo: [0, -1, -0.8],
    arriba: [0, 1, 0],
    corte: { plano: 'sagital', posicion: 0 },
  },
  {
    id: 'columna',
    nombre: 'Columna completa',
    tecla: '5',
    descripcion: 'Del cráneo al sacro, desde atrás y de lado.',
    posicion: [62, -36, -78],
    objetivo: [0, -44, -2],
    arriba: [0, 1, 0],
  },
  {
    id: 'base',
    nombre: 'Base (polígono de Willis)',
    tecla: '6',
    descripcion: 'Desde abajo: el polígono de Willis en la base del encéfalo.',
    posicion: [0, -34, 9],
    objetivo: [0, -1.2, 0.6],
    arriba: [0, 0, 1],
  },
  {
    id: 'posterior',
    nombre: 'Posterior',
    tecla: '7',
    descripcion: 'Desde atrás: cerebelo, columna y raíces.',
    posicion: [0, -10, -48],
    objetivo: [0, -12, -1],
    arriba: [0, 1, 0],
  },
]

export const vistaPorTecla = (tecla: string): Vista | undefined => VISTAS.find((v) => v.tecla === tecla)
export const vistaPorId = (id: VistaId): Vista => VISTAS.find((v) => v.id === id)!

/** Curva suave de 0 a 1 para las transiciones de cámara. */
export const suavizar = (t: number): number => {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Duración de una transición de cámara: cero con «reducir movimiento». */
export const duracionDeTransicion = (reducirMovimiento: boolean): number => (reducirMovimiento ? 0 : 750)
