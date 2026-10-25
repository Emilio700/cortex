/**
 * Reglas del render volumétrico del estudio (feat/render-volumetrico).
 *
 * Todo lo que decide **si** una serie se puede pintar en 3D, **cómo** se pinta
 * (preajuste, umbral, opacidad, recorte) y **cuánto** pesa vive aquí, sin
 * Cornerstone ni GPU, para probarlo con casos. La pantalla y el servicio sólo
 * aplican lo que esto calcula.
 *
 * Lo que se ve en 3D depende del preajuste y del umbral: con otro umbral, un
 * vaso «desaparece» o un hueso fino se ve roto. Por eso la vista no mide nada y
 * siempre lleva el aviso de abajo.
 */
import type { ManifiestoSerie, SerieDicom } from './tipos'

export const AVISO_RENDER_3D =
  'Render del estudio original: lo que ves depende del preajuste y del umbral; para medir y decidir, usa los cortes.'

export const LEYENDA_CAPTURA_3D = 'Render 3D del estudio · Material de apoyo · No sirve para medir'

/** Menos cortes que esto no dan un volumen que se lea: se ve como una lámina. */
export const MINIMO_DE_CORTES = 20

/** Por encima de esto se carga a media resolución (un corte de cada dos). */
export const LIMITE_DE_MEMORIA_BYTES = 768 * 1024 * 1024

// ── Elegibilidad ────────────────────────────────────────────────────────────

export type Elegibilidad =
  | { apta: true; cortes: number; espaciado: number | null }
  | { apta: false; motivo: string }

const MODALIDADES_VOLUMETRICAS = ['CT', 'MR']
const MODALIDADES_PROYECCION = ['CR', 'DX', 'MG', 'XA', 'RF', 'PX', 'IO']

const NOMBRE_DE_MODALIDAD: Record<string, string> = { CT: 'TC', MR: 'RM' }

const productoCruz = (a: number[], b: number[]): number[] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const productoPunto = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norma = (a: number[]) => Math.sqrt(productoPunto(a, a))

function normalDelCorte(orientacion: number[]): number[] | null {
  if (orientacion.length !== 6 || orientacion.some((v) => !Number.isFinite(v))) return null
  const n = productoCruz(orientacion.slice(0, 3), orientacion.slice(3, 6))
  const largo = norma(n)
  return largo > 1e-6 ? n.map((v) => v / largo) : null
}

const mediana = (valores: number[]): number => {
  const orden = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2
}

const mm = (v: number) => `${Number(v.toFixed(2))} mm`

/**
 * ¿Esta serie forma un volumen? Con sólo la serie se descarta lo evidente (una
 * radiografía, pocos cortes, sin posición); con el manifiesto se revisa corte
 * por corte: misma orientación, mismo tamaño y espaciado uniforme. Un volumen
 * con huecos o cortes oblicuos mezclados se pintaría deformado, y deformado no
 * se nota a simple vista: por eso se niega y se dice por qué.
 */
export function elegibilidad3D(serie: SerieDicom, manifiesto?: ManifiestoSerie | null): Elegibilidad {
  const modalidad = (serie.modality || '').toUpperCase()
  if (MODALIDADES_PROYECCION.includes(modalidad)) {
    return {
      apta: false,
      motivo: `Es una radiografía (${modalidad}): una sola proyección no forma un volumen.`,
    }
  }
  if (!MODALIDADES_VOLUMETRICAS.includes(modalidad)) {
    return {
      apta: false,
      motivo: `Sólo la TC y la RM se ven en 3D; esta serie es ${modalidad || 'de modalidad desconocida'}.`,
    }
  }
  if (serie.instance_count <= 1) {
    return { apta: false, motivo: 'Es una serie 2D (un solo corte): no forma un volumen.' }
  }
  if (!serie.has_geometry) {
    return {
      apta: false,
      motivo: 'La serie no trae la posición de sus cortes; sin ella no se puede armar el volumen.',
    }
  }
  if (serie.instance_count < MINIMO_DE_CORTES) {
    return {
      apta: false,
      motivo: `Tiene ${serie.instance_count} cortes; hacen falta al menos ${MINIMO_DE_CORTES} para un volumen.`,
    }
  }
  if (!manifiesto) return { apta: true, cortes: serie.instance_count, espaciado: null }

  const cortes = manifiesto.instances
  if (cortes.length < MINIMO_DE_CORTES) {
    return {
      apta: false,
      motivo: `Tiene ${cortes.length} cortes guardados; hacen falta al menos ${MINIMO_DE_CORTES} para un volumen.`,
    }
  }
  const normales = cortes.map((c) => normalDelCorte(c.orientation ?? []))
  if (
    normales.some((n) => !n) ||
    cortes.some((c) => (c.position ?? []).length !== 3 || c.position.some((v) => !Number.isFinite(v)))
  ) {
    return { apta: false, motivo: 'Algunos cortes no traen su posición u orientación.' }
  }
  const referencia = normales[0] as number[]
  if (normales.some((n) => Math.abs(productoPunto(n as number[], referencia)) < 0.999)) {
    return {
      apta: false,
      motivo: 'Los cortes no son paralelos (la serie mezcla orientaciones, como un localizador).',
    }
  }
  const filas = cortes[0].rows
  const columnas = cortes[0].columns
  if (cortes.some((c) => c.rows !== filas || c.columns !== columnas)) {
    return { apta: false, motivo: 'Los cortes no tienen todos el mismo tamaño.' }
  }
  const alturas = cortes.map((c) => productoPunto(c.position, referencia)).sort((a, b) => a - b)
  const pasos = alturas.slice(1).map((h, i) => h - alturas[i])
  if (pasos.some((p) => p < 1e-3)) {
    return { apta: false, motivo: 'Hay cortes repetidos en la misma posición.' }
  }
  const tipico = mediana(pasos)
  const tolerancia = Math.max(0.1 * tipico, 0.05)
  const menor = Math.min(...pasos)
  const mayor = Math.max(...pasos)
  if (mayor - tipico > tolerancia || tipico - menor > tolerancia) {
    return {
      apta: false,
      motivo: `El espacio entre cortes no es uniforme (de ${mm(menor)} a ${mm(mayor)}): faltan cortes o hay huecos.`,
    }
  }
  return { apta: true, cortes: cortes.length, espaciado: Number(tipico.toFixed(3)) }
}

/** «TC» o «RM» para el texto; la modalidad tal cual si no es ninguna. */
export function nombreDeModalidad(modalidad: string | null | undefined): string {
  const m = (modalidad || '').toUpperCase()
  return NOMBRE_DE_MODALIDAD[m] ?? m
}

// ── Preajustes ──────────────────────────────────────────────────────────────

export type ModalidadVolumen = 'CT' | 'MR'

export interface Preajuste3D {
  id: string
  nombre: string
  /** Nombre del preajuste de Cornerstone (`CONSTANTS.VIEWPORT_PRESETS`). */
  preset: string
  modalidad: ModalidadVolumen
  descripcion: string
}

/**
 * Los preajustes que se ofrecen, en español, sobre los de Cornerstone (que son
 * los de 3D Slicer). Se eligieron por lo que el médico pide ver, no por su
 * nombre en inglés: «Piel» es `CT-Soft-Tissue` porque ese preajuste vuelve
 * opaco todo lo que pasa de −160 UH, y lo primero opaco desde fuera es la piel.
 */
export const PREAJUSTES_3D: Preajuste3D[] = [
  {
    id: 'hueso',
    nombre: 'Hueso',
    preset: 'CT-Bone',
    modalidad: 'CT',
    descripcion: 'El hueso opaco y el resto transparente.',
  },
  {
    id: 'hueso-contorno',
    nombre: 'Hueso (contorno fino)',
    preset: 'CT-Bones',
    modalidad: 'CT',
    descripcion: 'Hueso semitransparente: deja ver fracturas y lo que hay detrás.',
  },
  {
    id: 'angio-tc',
    nombre: 'Angio-TC (vasos con contraste)',
    preset: 'CT-AAA',
    modalidad: 'CT',
    descripcion: 'Lo que pasa de ~150 UH: vasos con contraste y hueso. Los vasos intracraneales «tal cual» sólo se ven así, en una angio-TC.',
  },
  {
    id: 'piel',
    nombre: 'Piel',
    preset: 'CT-Soft-Tissue',
    modalidad: 'CT',
    descripcion: 'La superficie del cuerpo, opaca.',
  },
  {
    id: 'tejidos-blandos',
    nombre: 'Tejidos blandos',
    preset: 'CT-Muscle',
    modalidad: 'CT',
    descripcion: 'Músculo y órganos semitransparentes, hueso más opaco.',
  },
  {
    id: 'rm-encefalo',
    nombre: 'RM: encéfalo',
    preset: 'MR-T2-Brain',
    modalidad: 'MR',
    descripcion: 'Pensado para T2 de encéfalo. La intensidad de una RM no tiene unidades fijas: ajusta el umbral.',
  },
  {
    id: 'rm-angio',
    nombre: 'RM: angio (vasos)',
    preset: 'MR-Angio',
    modalidad: 'MR',
    descripcion: 'Para angio-RM (TOF): lo más brillante, los vasos.',
  },
  {
    id: 'rm-general',
    nombre: 'RM: general',
    preset: 'MR-Default',
    modalidad: 'MR',
    descripcion: 'Rampa suave para cualquier secuencia.',
  },
]

export function preajustesParaModalidad(modalidad: string | null | undefined): Preajuste3D[] {
  const m = (modalidad || '').toUpperCase()
  return PREAJUSTES_3D.filter((p) => p.modalidad === m)
}

/** El preajuste con que abre: hueso en TC, encéfalo en RM. */
export function preajusteInicial(modalidad: string | null | undefined): Preajuste3D | null {
  return preajustesParaModalidad(modalidad)[0] ?? null
}

export function preajustePorId(id: string): Preajuste3D | null {
  return PREAJUSTES_3D.find((p) => p.id === id) ?? null
}

// ── Umbral y opacidad ───────────────────────────────────────────────────────

export interface RangoDeUmbral {
  min: number
  max: number
  paso: number
  unidad: string
}

/** Cuánto se puede mover el umbral. En RM no hay unidades fijas: se dice. */
export function rangoDeUmbral(modalidad: string | null | undefined): RangoDeUmbral {
  return (modalidad || '').toUpperCase() === 'CT'
    ? { min: -600, max: 600, paso: 10, unidad: 'UH' }
    : { min: -400, max: 400, paso: 5, unidad: 'unidades de la RM' }
}

/** Lo que de un preajuste importa para la curva de opacidad. */
export interface CurvaDePreajuste {
  colorTransfer: string
  scalarOpacity: string
}

const numeros = (texto: string): number[] => texto.trim().split(/\s+/).slice(1).map(Number)

/**
 * La curva de opacidad del preajuste, movida por el umbral y escalada por la
 * opacidad, en las coordenadas en que la pone Cornerstone.
 *
 * Cornerstone (`utilities.applyPreset`) no pone los puntos tal cual: los
 * recorre para centrarlos en el rango del color (x' = x − mín − (máx − mín)/2).
 * Aquí se hace lo mismo para que con umbral 0 y opacidad 1 la curva sea
 * **exactamente** la del preajuste; si no, mover el deslizador y regresarlo a
 * cero dejaría otra imagen.
 */
export function curvaDeOpacidad(
  preajuste: CurvaDePreajuste,
  desplazamiento: number,
  factor: number
): Array<[number, number]> {
  const color = numeros(preajuste.colorTransfer)
  let minimo = Infinity
  let maximo = -Infinity
  for (let i = 0; i < color.length; i += 4) {
    minimo = Math.min(minimo, color[i])
    maximo = Math.max(maximo, color[i])
  }
  const centro = (maximo - minimo) / 2
  const opacidad = numeros(preajuste.scalarOpacity)
  const puntos: Array<[number, number]> = []
  for (let i = 0; i < opacidad.length; i += 2) {
    const x = opacidad[i] - minimo - centro + desplazamiento
    const y = Math.min(1, Math.max(0, opacidad[i + 1] * factor))
    puntos.push([x, y])
  }
  return puntos
}

// ── Recorte ─────────────────────────────────────────────────────────────────

export type EjeDeRecorte = 'axial' | 'sagital' | 'coronal'

export interface Recorte {
  /** Fracción del volumen que se quita, de 0 a 0.95. */
  fraccion: number
  /** Quita desde el lado contrario al de siempre. */
  invertido: boolean
}

export type Recortes = Record<EjeDeRecorte, Recorte>

export const SIN_RECORTE: Recortes = {
  axial: { fraccion: 0, invertido: false },
  sagital: { fraccion: 0, invertido: false },
  coronal: { fraccion: 0, invertido: false },
}

export const LADO_DEL_RECORTE: Record<EjeDeRecorte, [string, string]> = {
  axial: ['desde arriba', 'desde abajo'],
  sagital: ['desde la izquierda del paciente', 'desde la derecha del paciente'],
  coronal: ['desde delante', 'desde atrás'],
}

export interface PlanoDeRecorte {
  origen: [number, number, number]
  normal: [number, number, number]
}

/**
 * Los planos de recorte en coordenadas del paciente (LPS, mm): x crece hacia la
 * izquierda del paciente, y hacia atrás, z hacia arriba. `limites` es la caja del
 * volumen `[xmin, xmax, ymin, ymax, zmin, zmax]`. VTK conserva lo que queda del
 * lado al que apunta la normal, así que la normal mira hacia lo que se queda.
 */
export function planosDeRecorte(recortes: Recortes, limites: number[]): PlanoDeRecorte[] {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = limites
  const centro: [number, number, number] = [(xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2]
  const planos: PlanoDeRecorte[] = []
  const agregar = (eje: 0 | 1 | 2, desde: 'max' | 'min', fraccion: number) => {
    const bajo = [xmin, ymin, zmin][eje]
    const alto = [xmax, ymax, zmax][eje]
    const corte = desde === 'max' ? alto - fraccion * (alto - bajo) : bajo + fraccion * (alto - bajo)
    const origen: [number, number, number] = [...centro]
    origen[eje] = corte
    const normal: [number, number, number] = [0, 0, 0]
    normal[eje] = desde === 'max' ? -1 : 1
    planos.push({ origen, normal })
  }
  const limitar = (f: number) => Math.min(0.95, Math.max(0, f))
  // Axial: por omisión se quita desde arriba (z alto, craneal), para abrir el cráneo.
  if (recortes.axial.fraccion > 0) agregar(2, recortes.axial.invertido ? 'min' : 'max', limitar(recortes.axial.fraccion))
  // Sagital: desde la izquierda del paciente (x alto en LPS).
  if (recortes.sagital.fraccion > 0)
    agregar(0, recortes.sagital.invertido ? 'min' : 'max', limitar(recortes.sagital.fraccion))
  // Coronal: desde delante (y bajo en LPS: anterior).
  if (recortes.coronal.fraccion > 0)
    agregar(1, recortes.coronal.invertido ? 'max' : 'min', limitar(recortes.coronal.fraccion))
  return planos
}

// ── Memoria ─────────────────────────────────────────────────────────────────

/** Bytes que ocupa el volumen en la tarjeta (4 por vóxel: punto flotante). */
export function memoriaDelVolumen(filas: number | null, columnas: number | null, cortes: number): number {
  if (!filas || !columnas || cortes <= 0) return 0
  return filas * columnas * cortes * 4
}

/** Cada cuántos cortes se toma uno para no pasar del límite (1 = todos). */
export function factorDeDecimado(bytes: number, limite = LIMITE_DE_MEMORIA_BYTES): number {
  if (bytes <= limite) return 1
  return Math.ceil(bytes / limite)
}

/** Un corte de cada `factor`. El espaciado sigue uniforme: se multiplica. */
export function decimarCortes<T>(cortes: T[], factor: number): T[] {
  if (factor <= 1) return cortes
  return cortes.filter((_, i) => i % factor === 0)
}

export function textoDeMemoria(bytes: number): string {
  const mega = bytes / (1024 * 1024)
  return mega >= 1024 ? `${(mega / 1024).toFixed(1)} GB` : `${Math.round(mega)} MB`
}
