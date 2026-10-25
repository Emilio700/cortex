/**
 * Tipos de las escalas clínicas.
 *
 * Una escala es **datos**, no código: ítems, opciones con sus puntos, cómo se
 * calcula y rangos de interpretación. Así el servidor puede tener la misma
 * definición en Python (`backend/app/services/escalas.py`) y una prueba
 * compartida (`paridad.json`) comprueba que las dos digan lo mismo.
 *
 * Portado del motor de MediSuite (`modules/escalas/escalas.ts`): allí las
 * bandas eran funciones; aquí son una tabla, porque una función no se puede
 * comparar con su copia en Python.
 */

/** Color con que se pinta la interpretación (DESIGN.md §2: el color comunica). */
export type Tono = 'ok' | 'aviso' | 'alerta' | 'neutral'

export interface Opcion {
  /** Lo que se guarda en la respuesta. Estable: cambiarlo es cambiar de versión. */
  codigo: string
  /** `null` = «no valorable» (p. ej. intubado en el Glasgow). */
  puntos: number | null
  texto: string
}

export interface Item {
  id: string
  titulo: string
  /** Para el detalle por componentes («O3 VT M5»). */
  abreviatura?: string
  opciones: Opcion[]
  /** Se puede dejar sin responder (secciones omitidas del ODI y el NDI). */
  opcional?: boolean
  /** El texto del ítem es traducción libre: se pinta con «(verificar)». */
  verificar?: boolean
  /** Instrucción breve debajo del título. */
  ayuda?: string
}

/** Rango de interpretación: aplica desde el `hasta` anterior (exclusivo) hasta este (inclusivo). */
export interface Banda {
  hasta: number
  texto: string
  tono: Tono
}

/**
 * Cómo se llega al puntaje:
 * - `suma`: todos los ítems obligatorios; el puntaje es la suma.
 * - `porcentaje`: suma ÷ (máximo por ítem × ítems respondidos) × 100 (ODI).
 * - `prorrateo`: suma ÷ ítems respondidos × ítems totales (NDI con secciones omitidas).
 */
export type Calculo = 'suma' | 'porcentaje' | 'prorrateo'

/**
 * Qué hacer con una opción «no valorable»:
 * - `anula`: no hay total (Glasgow: se reporta por componentes).
 * - `cero`: cuenta 0 y se anota cuál fue (NIHSS: «UN»).
 */
export type NoValorable = 'anula' | 'cero'

/** Cómo se lee el puntaje en pantalla. */
export type Presentacion = 'puntos' | 'porcentaje' | 'romano' | 'letra'

export interface Escala {
  id: string
  /** Sube si cambia un ítem, una opción, un punto o un rango. */
  version: string
  nombre: string
  titulo: string
  descripcion: string
  instrucciones?: string
  /** Autor y año: se muestra siempre junto a la escala. */
  fuente: string
  /** Lo que falta confirmar con un médico; se pinta como «(verificar)». */
  verificar?: string[]
  /** Los rangos de interpretación están por verificar. */
  bandasPorVerificar?: boolean
  items: Item[]
  calculo: Calculo
  noValorable?: NoValorable
  /** Ítems respondidos a partir de los cuales se avisa (secciones omitidas). */
  avisarOmitidasDesde?: number
  min: number
  max: number
  presentacion: Presentacion
  /** Un número más alto es mejor (Glasgow, Barthel, Karnofsky, mJOA). */
  mayorEsMejor?: boolean
  bandas: Banda[]
}

/** Respuestas: id del ítem → código de la opción elegida. */
export type Respuestas = Record<string, string | undefined>

export interface Resultado {
  /** Ya se puede guardar: no falta ningún ítem obligatorio. */
  completo: boolean
  /** Ítems obligatorios sin responder. */
  faltantes: string[]
  /** `null` mientras falten ítems o cuando un «no valorable» anula el total. */
  puntaje: number | null
  interpretacion: string | null
  tono: Tono
  /** «O3 VT M5», «No valorable: 5a» o «2 secciones sin responder». */
  detalle: string | null
  /** Avisos que no impiden guardar (secciones omitidas, ítems «UN»). */
  avisos: string[]
}
