/**
 * Calidad de Neuro 3D: «Estándar» (el modelo didáctico de siempre) o
 * «Realista» (materiales por tejido, luz de estudio, oclusión ambiental y más
 * detalle). Puro: la página lee el equipo y el almacenamiento, y la escena mide
 * los cuadros; aquí sólo se decide.
 *
 * La preferencia se guarda por usuario en `localStorage`: es una preferencia de
 * pantalla, no un dato clínico. Si el navegador no deja guardar, sólo no se
 * recuerda.
 */

export type Calidad = 'estandar' | 'realista'

export const CALIDADES: { id: Calidad; nombre: string }[] = [
  { id: 'estandar', nombre: 'Estándar' },
  { id: 'realista', nombre: 'Realista' },
]

export interface CapacidadDelEquipo {
  /** El navegador da un contexto WebGL2 (el posproceso lo necesita). */
  webgl2: boolean
  /** `MAX_TEXTURE_SIZE` de la tarjeta (0 si no se pudo leer). */
  maxTextura: number
  /** «Reducir movimiento» del sistema o de Cortex. */
  reducirMovimiento: boolean
  /** Teléfono o tableta pequeña: pantalla táctil y angosta. */
  movil: boolean
  /**
   * Nombre de la tarjeta (`WEBGL_debug_renderer_info`), si el navegador lo da.
   * Sólo se usa aquí, para decidir, y en el tooltip de la leyenda: nunca se
   * envía al servidor ni se guarda.
   */
  gpu?: string | null
}

/** Por debajo de esto la tarjeta es de gama muy baja (o un emulador por software). */
export const TEXTURA_MINIMA = 4096
/** Sin el nombre de la tarjeta, sólo una así de grande se da por suficiente. */
export const TEXTURA_SIN_NOMBRE = 8192

export type TipoDeGpu = 'dedicada' | 'suficiente' | 'integrada' | 'software' | 'desconocida'

/**
 * Qué clase de tarjeta es, por su nombre. Lo que no se reconoce queda
 * «desconocida» y se decide por la capacidad medida. (verificar) Lista hecha con
 * los nombres que dan Chrome, Edge y Firefox en 2026; una tarjeta nueva puede no
 * estar.
 */
export const clasificarGpu = (nombre: string | null | undefined): TipoDeGpu => {
  const n = (nombre ?? '').toLowerCase()
  if (!n.trim()) return 'desconocida'
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(n)) return 'software'
  if (/nvidia|geforce|quadro|rtx|gtx|radeon\s*(rx|pro|r9|r7)|firepro|intel\(r\) arc|intel arc|\barc a\d/.test(n)) return 'dedicada'
  // Apple M1 en adelante: integrada, pero con potencia de sobra para Realista.
  if (/apple m\d|apple gpu/.test(n)) return 'suficiente'
  if (/intel|uhd|iris|mali|adreno|powervr|videocore|radeon\(tm\) graphics|radeon graphics|vega \d/.test(n)) return 'integrada'
  return 'desconocida'
}

/** ¿El equipo aguanta Realista? Tarjeta dedicada o, sin nombre, capacidad de sobra. */
export const equipoApto = (c: CapacidadDelEquipo): boolean => {
  if (!c.webgl2 || c.maxTextura < TEXTURA_MINIMA) return false
  const tipo = clasificarGpu(c.gpu)
  if (tipo === 'dedicada' || tipo === 'suficiente') return true
  if (tipo === 'desconocida') return c.maxTextura >= TEXTURA_SIN_NOMBRE
  return false
}

export const LEYENDA_DISPONIBLE = 'Render realista disponible en este equipo'
export const LEYENDA_SIN_GPU = 'Este equipo usa calidad estándar: el render realista necesita una tarjeta gráfica dedicada'
export const LEYENDA_SIN_WEBGL2 = 'Este equipo usa calidad estándar: el navegador no tiene WebGL2, que el render realista necesita'
export const LEYENDA_CAIDA = 'Bajamos a estándar porque el equipo no alcanzaba los cuadros por segundo'

/**
 * ¿Se puede elegir Realista en este equipo? Sin WebGL2 o sin una tarjeta que
 * lo aguante, no: el interruptor queda deshabilitado y dice por qué.
 */
export const disponibilidadRealista = (c: CapacidadDelEquipo): { disponible: boolean; motivo?: string } => {
  if (!c.webgl2) return { disponible: false, motivo: LEYENDA_SIN_WEBGL2 }
  if (!equipoApto(c)) return { disponible: false, motivo: LEYENDA_SIN_GPU }
  return { disponible: true }
}

/**
 * La leyenda junto al interruptor: qué calidad puede este equipo y, si la
 * escena bajó sola, que fue por los cuadros por segundo (con reintentar).
 */
export const leyendaDeCalidad = (
  c: CapacidadDelEquipo,
  cayo: boolean,
  calidadActual: Calidad,
): { texto: string; tono: 'ok' | 'estandar' | 'caida'; reintentar: boolean } => {
  const d = disponibilidadRealista(c)
  if (!d.disponible) return { texto: d.motivo!, tono: 'estandar', reintentar: false }
  if (cayo && calidadActual === 'estandar') return { texto: LEYENDA_CAIDA, tono: 'caida', reintentar: true }
  return { texto: LEYENDA_DISPONIBLE, tono: 'ok', reintentar: false }
}

/**
 * Por qué, sin preferencia guardada, se arranca en Estándar aunque el equipo
 * pueda Realista (null si se arranca en Realista). Va en el tooltip.
 */
export const motivoParaEstandar = (c: CapacidadDelEquipo): string | null => {
  const d = disponibilidadRealista(c)
  if (!d.disponible) return d.motivo!
  if (c.movil) return 'En el teléfono se empieza en Estándar para cuidar la batería y la fluidez.'
  if (c.reducirMovimiento) return '«Reducir movimiento» está activo: se empieza en Estándar.'
  return null
}

/**
 * La calidad con la que abre la escena: lo que el médico eligió antes, si el
 * equipo puede; si nunca eligió, Realista sólo cuando el equipo lo aguanta.
 */
export const calidadInicial = (preferencia: Calidad | null, c: CapacidadDelEquipo): Calidad => {
  if (!disponibilidadRealista(c).disponible) return 'estandar'
  if (preferencia) return preferencia
  return motivoParaEstandar(c) === null ? 'realista' : 'estandar'
}

// ── Preferencia por usuario ────────────────────────────────────────────────

export const claveDePreferencia = (usuario: number | string | null | undefined) =>
  `cortex.neuro3d.calidad.${usuario ?? 'sin-usuario'}`

type Almacen = Pick<Storage, 'getItem' | 'setItem'>

const almacenLocal = (): Almacen | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export const leerPreferencia = (usuario: number | string | null | undefined, almacen: Almacen | null = almacenLocal()): Calidad | null => {
  try {
    const v = almacen?.getItem(claveDePreferencia(usuario))
    return v === 'estandar' || v === 'realista' ? v : null
  } catch {
    return null
  }
}

/** Devuelve si se pudo guardar (una ventana privada puede negarlo). */
export const guardarPreferencia = (
  usuario: number | string | null | undefined,
  calidad: Calidad,
  almacen: Almacen | null = almacenLocal(),
): boolean => {
  try {
    if (!almacen) return false
    almacen.setItem(claveDePreferencia(usuario), calidad)
    return true
  } catch {
    return false
  }
}

// ── Caída automática ───────────────────────────────────────────────────────

export interface OpcionesDelMonitor {
  /** Por debajo de esto, sostenido, se baja a Estándar. */
  fpsMinimo?: number
  /** Cuánto tiempo seguido tiene que durar la caída (ms). */
  ventanaMs?: number
  /**
   * Un hueco mayor entre dos cuadros es la compilación de un sombreador o la
   * pestaña en segundo plano, no el ritmo de la escena: empieza otra ventana.
   */
  pausaMaximaMs?: number
}

export interface MonitorDeFps {
  /** Registra un cuadro pintado. Devuelve `true` una sola vez: cuando hay que bajar. */
  registrar(ahora: number): boolean
  /** La escena pasó un cuadro sin pintar (estaba quieta): la racha se corta. */
  interrumpir(): void
  /** Cuadros por segundo de la ventana actual (null si aún no hay ventana completa). */
  fps(): number | null
  reiniciar(): void
}

/**
 * Mide sólo rachas de cuadros seguidos (rotación, arrastre, transiciones): una
 * vista quieta se pinta una vez y no dice nada del equipo, y la escena avisa
 * con `interrumpir()`. Baja cuando una ventana entera de cuadros seguidos
 * promedia menos de `fpsMinimo`.
 */
export const crearMonitorDeFps = (op: OpcionesDelMonitor = {}): MonitorDeFps => {
  const fpsMinimo = op.fpsMinimo ?? 24
  const ventana = op.ventanaMs ?? 4000
  const pausa = op.pausaMaximaMs ?? 1500
  let cuadros: number[] = []
  let disparado = false
  let ultimoFps: number | null = null

  return {
    registrar(ahora) {
      const anterior = cuadros[cuadros.length - 1]
      if (anterior !== undefined && ahora - anterior > pausa) cuadros = []
      cuadros.push(ahora)
      // Sólo los cuadros de la última ventana (más el que la abre).
      while (cuadros.length > 2 && ahora - cuadros[1] >= ventana) cuadros.shift()
      const lapso = ahora - cuadros[0]
      if (lapso < ventana) return false
      ultimoFps = ((cuadros.length - 1) * 1000) / lapso
      if (disparado || ultimoFps >= fpsMinimo) return false
      disparado = true
      return true
    },
    interrumpir() {
      cuadros = []
    },
    fps: () => ultimoFps,
    reiniciar() {
      cuadros = []
      disparado = false
      ultimoFps = null
    },
  }
}
