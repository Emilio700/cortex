/**
 * El marcado de puntos sobre las radiografías, como datos: qué punto toca,
 * colocar, corregir, saltar y deshacer. La herramienta sólo lo dibuja.
 *
 * Cada punto tiene una clave estable: `L3.sa` (vértebra y esquina) o `cadera.0`.
 * Saltar un punto es válido (una vértebra tapada por el intestino, una cadera
 * que no se ve): lo que dependía de él no se calcula y se dice por qué.
 */
import {
  VERTEBRAS_RX,
  type EsquinaAP,
  type EsquinaLateral,
  type MarcasRx,
  type Punto,
} from './ajusteRadiografico'

export type VistaRx = 'lateral' | 'ap'

export interface PasoDeMarcado {
  vista: VistaRx
  clave: string
  vertebra: string | null
  /** Lo que se le pide al médico, corto («L3 · platillo superior, esquina anterior»). */
  titulo: string
  /** Una pista de dónde está ese punto. */
  ayuda: string
}

export interface RangoRx {
  desde: string
  hasta: string
}

/** T4–S1 cubre la cifosis torácica y la lordosis lumbar; la pelvis va aparte. */
export const RANGO_LATERAL_POR_OMISION: RangoRx = { desde: 'T4', hasta: 'S1' }
/** T1–L5 cubre las curvas habituales de una escoliosis. */
export const RANGO_AP_POR_OMISION: RangoRx = { desde: 'T1', hasta: 'L5' }

const ESQUINAS_LATERAL: [EsquinaLateral, string, string][] = [
  ['sa', 'platillo superior, esquina anterior', 'La esquina de arriba del cuerpo, del lado del abdomen.'],
  ['sp', 'platillo superior, esquina posterior', 'La esquina de arriba del cuerpo, del lado del conducto (no la del arco).'],
  ['ia', 'platillo inferior, esquina anterior', 'La esquina de abajo del cuerpo, del lado del abdomen.'],
  ['ip', 'platillo inferior, esquina posterior', 'La esquina de abajo del cuerpo, del lado del conducto.'],
]
const ESQUINAS_AP: [EsquinaAP, string, string][] = [
  ['si', 'platillo superior, extremo izquierdo de la imagen', 'Donde termina el platillo de arriba, del lado izquierdo de la pantalla.'],
  ['sd', 'platillo superior, extremo derecho de la imagen', 'El otro extremo del mismo platillo.'],
  ['ii', 'platillo inferior, extremo izquierdo de la imagen', 'Donde termina el platillo de abajo, del lado izquierdo de la pantalla.'],
  ['id', 'platillo inferior, extremo derecho de la imagen', 'El otro extremo del mismo platillo.'],
]

const vertebrasDel = (r: RangoRx) => {
  const a = VERTEBRAS_RX.indexOf(r.desde)
  const b = VERTEBRAS_RX.indexOf(r.hasta)
  if (a < 0 || b < 0 || a > b) return []
  return VERTEBRAS_RX.slice(a, b + 1)
}

/** Los pasos de una vista, de arriba abajo; en la lateral, al final las caderas. */
export const planDeMarcado = (vista: VistaRx, rango: RangoRx, conPelvis = true): PasoDeMarcado[] => {
  const pasos: PasoDeMarcado[] = []
  for (const id of vertebrasDel(rango)) {
    if (vista === 'lateral') {
      for (const [e, texto, ayuda] of ESQUINAS_LATERAL) {
        if (id === 'S1' && (e === 'ia' || e === 'ip')) continue
        const tituloS1 = e === 'sa' ? 'platillo de S1, esquina anterior (promontorio)' : 'platillo de S1, esquina posterior'
        pasos.push({ vista, clave: `${id}.${e}`, vertebra: id, titulo: id === 'S1' ? `S1 · ${tituloS1}` : `${id} · ${texto}`, ayuda })
      }
    } else {
      for (const [e, texto, ayuda] of ESQUINAS_AP) {
        if (id === 'S1' && (e === 'ii' || e === 'id')) continue
        pasos.push({ vista, clave: `${id}.${e}`, vertebra: id, titulo: `${id} · ${texto}`, ayuda })
      }
    }
  }
  if (vista === 'lateral' && conPelvis) {
    pasos.push({
      vista,
      clave: 'cadera.0',
      vertebra: null,
      titulo: 'Centro de la cabeza femoral',
      ayuda: 'El centro del círculo de la cabeza del fémur. Si las dos se ven, empieza por cualquiera.',
    })
    pasos.push({
      vista,
      clave: 'cadera.1',
      vertebra: null,
      titulo: 'Centro de la otra cabeza femoral',
      ayuda: 'Si se superponen o no se ve, salta este punto: se usa la primera.',
    })
  }
  return pasos
}

// ── Estado del marcado ────────────────────────────────────────────────────

interface Accion {
  vista: VistaRx
  clave: string
  /** Lo que había antes: un punto, nada o «saltado». */
  antes: Punto | null | 'saltado'
}

export interface EstadoMarcado {
  puntos: Record<VistaRx, Record<string, Punto>>
  /** `vista:clave` de lo que el médico decidió saltar. */
  saltados: string[]
  historial: Accion[]
}

export const ESTADO_INICIAL: EstadoMarcado = { puntos: { lateral: {}, ap: {} }, saltados: [], historial: [] }

const llave = (vista: VistaRx, clave: string) => `${vista}:${clave}`

const antesDe = (e: EstadoMarcado, vista: VistaRx, clave: string): Accion['antes'] =>
  e.puntos[vista][clave] ?? (e.saltados.includes(llave(vista, clave)) ? 'saltado' : null)

/** Coloca (o corrige) un punto. Deja rastro para deshacer. */
export const colocar = (e: EstadoMarcado, vista: VistaRx, clave: string, p: Punto): EstadoMarcado => ({
  puntos: { ...e.puntos, [vista]: { ...e.puntos[vista], [clave]: { x: p.x, y: p.y } } },
  saltados: e.saltados.filter((s) => s !== llave(vista, clave)),
  historial: [...e.historial, { vista, clave, antes: antesDe(e, vista, clave) }],
})

/** Salta un punto que no se ve. */
export const saltar = (e: EstadoMarcado, vista: VistaRx, clave: string): EstadoMarcado => {
  const resto = { ...e.puntos[vista] }
  delete resto[clave]
  return {
    puntos: { ...e.puntos, [vista]: resto },
    saltados: [...e.saltados.filter((s) => s !== llave(vista, clave)), llave(vista, clave)],
    historial: [...e.historial, { vista, clave, antes: antesDe(e, vista, clave) }],
  }
}

/** Deshace lo último: un punto puesto, una corrección o un salto. */
export const deshacer = (e: EstadoMarcado): EstadoMarcado => {
  const ultima = e.historial[e.historial.length - 1]
  if (!ultima) return e
  const { vista, clave, antes } = ultima
  const puntos = { ...e.puntos[vista] }
  delete puntos[clave]
  let saltados = e.saltados.filter((s) => s !== llave(vista, clave))
  if (antes === 'saltado') saltados = [...saltados, llave(vista, clave)]
  else if (antes) puntos[clave] = antes
  return { puntos: { ...e.puntos, [vista]: puntos }, saltados, historial: e.historial.slice(0, -1) }
}

export const estaSaltado = (e: EstadoMarcado, vista: VistaRx, clave: string) => e.saltados.includes(llave(vista, clave))

/** El primer paso que no tiene punto ni se saltó; `null` si ya se recorrió todo. */
export const pasoPendiente = (plan: PasoDeMarcado[], e: EstadoMarcado): PasoDeMarcado | null =>
  plan.find((p) => !e.puntos[p.vista][p.clave] && !estaSaltado(e, p.vista, p.clave)) ?? null

export const avance = (plan: PasoDeMarcado[], e: EstadoMarcado) => {
  const hechos = plan.filter((p) => e.puntos[p.vista][p.clave] || estaSaltado(e, p.vista, p.clave)).length
  return { hechos, total: plan.length }
}

/** Las marcas listas para calcular (y para guardar). */
export const marcasDe = (e: EstadoMarcado): MarcasRx => {
  const marcas: MarcasRx = { lateral: { vertebras: {}, caderas: [] }, ap: { vertebras: {} } }
  for (const [clave, p] of Object.entries(e.puntos.lateral)) {
    if (clave.startsWith('cadera.')) continue
    const [v, esquina] = clave.split('.') as [string, EsquinaLateral]
    marcas.lateral.vertebras[v] = { ...marcas.lateral.vertebras[v], [esquina]: p }
  }
  for (const k of ['cadera.0', 'cadera.1']) {
    const p = e.puntos.lateral[k]
    if (p) marcas.lateral.caderas.push(p)
  }
  for (const [clave, p] of Object.entries(e.puntos.ap)) {
    const [v, esquina] = clave.split('.') as [string, EsquinaAP]
    marcas.ap.vertebras[v] = { ...marcas.ap.vertebras[v], [esquina]: p }
  }
  return marcas
}

/** De unas marcas guardadas, el estado para seguir viéndolas (sin historial). */
export const estadoDesde = (m: MarcasRx): EstadoMarcado => {
  const e: EstadoMarcado = { puntos: { lateral: {}, ap: {} }, saltados: [], historial: [] }
  for (const [v, esquinas] of Object.entries(m.lateral.vertebras)) {
    for (const [k, p] of Object.entries(esquinas)) if (p) e.puntos.lateral[`${v}.${k}`] = p
  }
  m.lateral.caderas.slice(0, 2).forEach((p, i) => (e.puntos.lateral[`cadera.${i}`] = p))
  for (const [v, esquinas] of Object.entries(m.ap.vertebras)) {
    for (const [k, p] of Object.entries(esquinas)) if (p) e.puntos.ap[`${v}.${k}`] = p
  }
  return e
}

/**
 * El punto ya puesto más cercano a `q`, si está a menos de `radio` (en las mismas
 * unidades): es el que se arrastra para corregirlo.
 */
export const puntoCercano = (puntos: Record<string, Punto>, q: Punto, radio: number): string | null => {
  let mejor: string | null = null
  let d2 = radio * radio
  for (const [clave, p] of Object.entries(puntos)) {
    const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2
    if (d <= d2) {
      d2 = d
      mejor = clave
    }
  }
  return mejor
}
