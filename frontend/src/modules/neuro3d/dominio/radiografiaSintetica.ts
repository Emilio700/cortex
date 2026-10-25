/**
 * Marcas de radiografía construidas a partir de medidas conocidas.
 *
 * Sirven para probar las fórmulas (si se arma una columna con una lordosis de
 * 50°, el cálculo tiene que leer 50°), para generar `paridadRx.json` y para la
 * radiografía sintética de la revisión visual. No hay ningún paciente aquí.
 */
import { VERTEBRAS_RX, type MarcasRx, type Punto } from './ajusteRadiografico'

const rad = (g: number) => (g * Math.PI) / 180

/** Extremos [anterior, posterior] de un platillo lateral con su inclinación, en la imagen. */
export const platilloLateral = (c: Punto, grados: number, ancho: number, sentido: 1 | -1): [Punto, Punto] => {
  const dx = (Math.cos(rad(grados)) * ancho) / 2
  const dy = (Math.sin(rad(grados)) * ancho) / 2
  return [
    { x: c.x + sentido * dx, y: c.y - dy },
    { x: c.x - sentido * dx, y: c.y + dy },
  ]
}

/** Extremos [izquierdo, derecho] de un platillo AP; + = el lado derecho de la imagen más alto. */
export const platilloAP = (c: Punto, grados: number, ancho: number): [Punto, Punto] => {
  const dx = (Math.cos(rad(grados)) * ancho) / 2
  const dy = (Math.sin(rad(grados)) * ancho) / 2
  return [
    { x: c.x - dx, y: c.y + dy },
    { x: c.x + dx, y: c.y - dy },
  ]
}

export interface OpcionesLateral {
  /** +1: el paciente mira a la derecha de la imagen. */
  sentido?: 1 | -1
  /** Inclinación de platillos concretos: `'L1.superior': 10`. El resto, 0°. */
  platillos?: Record<string, number>
  /** Desplazamiento de la de arriba sobre la de abajo, en fracción del fondo: `'L5-S1': 0.3`. */
  listesis?: Record<string, number>
  /** Altura de discos concretos en mm: `'L4-L5': 3`. */
  discos?: Record<string, number>
  alturaCuerpo?: number
  alturaDisco?: number
  /** Fondo del cuerpo (largo del platillo), mm. */
  fondo?: number
  mmPorPx?: { x: number; y: number }
  /** Caderas a 100 mm del centro de S1 con esa inclinación pélvica. */
  pelvis?: { inclinacion: number; dosCaderas?: boolean }
  desde?: string
}

/** Una lateral de `desde` (T1 por omisión) a S1, con las medidas pedidas. */
export const lateralSintetica = (op: OpcionesLateral = {}): MarcasRx => {
  const sentido = op.sentido ?? 1
  const alto = op.alturaCuerpo ?? 25
  const fondo = op.fondo ?? 40
  const esc = op.mmPorPx ?? { x: 0.25, y: 0.25 }
  // De mm anatómicos (adelante, arriba) a píxeles.
  const aPx = (ad: number, ar: number): Punto => ({ x: 600 + (sentido * ad) / esc.x, y: 80 - ar / esc.y })
  const extremos = (ad: number, ar: number, grados: number): [Punto, Punto] => {
    const dx = (Math.cos(rad(grados)) * fondo) / 2
    const dy = (Math.sin(rad(grados)) * fondo) / 2
    return [aPx(ad + dx, ar + dy), aPx(ad - dx, ar - dy)]
  }
  const ids = VERTEBRAS_RX.slice(VERTEBRAS_RX.indexOf(op.desde ?? 'T1'))
  const marcas: MarcasRx = { lateral: { vertebras: {}, caderas: [] }, ap: { vertebras: {} } }
  let ar = 0
  let ad = 0
  ids.forEach((id, k) => {
    const [sa, sp] = extremos(ad, ar, op.platillos?.[`${id}.superior`] ?? 0)
    if (id === 'S1') {
      marcas.lateral.vertebras[id] = { sa, sp }
      if (op.pelvis) {
        const pt = rad(op.pelvis.inclinacion)
        const h = { ad: ad + 100 * Math.sin(pt), ar: ar - 100 * Math.cos(pt) }
        marcas.lateral.caderas = op.pelvis.dosCaderas
          ? [aPx(h.ad - 6, h.ar + 4), aPx(h.ad + 6, h.ar - 4)]
          : [aPx(h.ad, h.ar)]
      }
      return
    }
    ar -= alto
    const [ia, ip] = extremos(ad, ar, op.platillos?.[`${id}.inferior`] ?? 0)
    marcas.lateral.vertebras[id] = { sa, sp, ia, ip }
    const siguiente = ids[k + 1]
    ar -= op.discos?.[`${id}-${siguiente}`] ?? op.alturaDisco ?? 10
    ad -= (op.listesis?.[`${id}-${siguiente}`] ?? 0) * fondo
  })
  return marcas
}

/** Una AP con los platillos pedidos: `{ T6: [superior, inferior] }`, + = lado derecho de la imagen arriba. */
export const apSintetica = (op: { platillos: Record<string, [number, number]>; ancho?: number }): MarcasRx => {
  const ancho = op.ancho ?? 160
  const marcas: MarcasRx = { lateral: { vertebras: {}, caderas: [] }, ap: { vertebras: {} } }
  let y = 80
  for (const id of VERTEBRAS_RX) {
    const t = op.platillos[id]
    if (!t) continue
    const [si, sd] = platilloAP({ x: 500, y }, t[0], ancho)
    const [ii, idr] = platilloAP({ x: 500, y: y + 100 }, t[1], ancho)
    marcas.ap.vertebras[id] = { si, sd, ii, id: idr }
    y += 140
  }
  return marcas
}

/** Une una lateral y una AP sintéticas en un solo juego de marcas. */
export const unir = (lateral: MarcasRx, ap: MarcasRx): MarcasRx => ({ lateral: lateral.lateral, ap: ap.ap })
