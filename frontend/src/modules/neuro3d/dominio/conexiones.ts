/**
 * Lo que se enciende junto.
 *
 * Al tocar una raíz, el neurocirujano quiere enseñar el camino completo: de qué
 * segmento de la médula nace, qué disco cruza, por qué agujero sale (entre qué
 * vértebras) y qué piel siente. Esa conexión se decide aquí, en datos, para
 * que la escena, la ficha y la silueta digan exactamente lo mismo.
 */
import { idDeRaiz, estructuraPorId } from './catalogo'
import {
  efectoDeHernia,
  raizPorId,
  salidaDeRaiz,
  segmentoDeRaiz,
  vertebrasDelDisco,
  type Lado,
  type TipoDeHernia,
} from './columna'
import { dermatomaDeRaiz } from './dermatomas'

export type Papel = 'raiz' | 'segmento' | 'vertebra' | 'disco' | 'disco-que-cruza' | 'afectada'

export interface PiezaEncendida {
  id: string
  papel: Papel
  /** Rótulo corto que acompaña a la pieza en la escena. */
  etiqueta: string
}

export interface DermatomaEncendido {
  dermatoma: string
  lado: Lado
}

export interface Conexion {
  /** La estructura que se eligió. */
  origen: string
  piezas: PiezaEncendida[]
  dermatomas: DermatomaEncendido[]
  /** Las frases de la ficha, en orden. */
  explicacion: string[]
}

const idDeVertebra = (nivel: string) => (nivel === 'S' ? 'sacro' : `vertebra-${nivel}`)
const nombreDeNivel = (nivel: string) => (nivel === 'S' ? 'sacro' : nivel)

/** El disco que una raíz lumbar cruza antes de salir (L5 cruza L4-L5). */
export const discoQueCruza = (raiz: string): string | null => {
  const r = raizPorId(raiz)
  if (!r) return null
  const n = Number(raiz.slice(1))
  if (r.region === 'lumbar' && n >= 2) return `L${n - 1}-L${n}`
  if (raiz === 'S1') return 'L5-S1'
  return null
}

/** La conexión completa de una raíz de un lado. */
export const conexionDeRaiz = (raiz: string, lado: Lado): Conexion | null => {
  const r = raizPorId(raiz)
  const salida = salidaDeRaiz(raiz)
  if (!r || !salida) return null
  const ladoTexto = lado === 'izquierdo' ? 'izquierda' : 'derecha'
  const piezas: PiezaEncendida[] = [
    { id: idDeRaiz(raiz, lado), papel: 'raiz', etiqueta: `Raíz ${raiz} ${ladoTexto}` },
    { id: `segmento-${raiz}`, papel: 'segmento', etiqueta: `Segmento medular ${raiz}` },
  ]
  const explicacion = [`Nace del segmento ${raiz} de la médula.`]

  const cruza = discoQueCruza(raiz)
  if (cruza) {
    piezas.push({ id: `disco-${cruza}`, papel: 'disco-que-cruza', etiqueta: `Disco ${cruza}` })
    explicacion.push(`Baja dentro del conducto y cruza el disco ${cruza}: una hernia paracentral ahí la comprime.`)
  }

  for (const nivel of [salida.arriba, salida.abajo]) {
    if (!nivel || nivel === 'occipital') continue
    const id = idDeVertebra(nivel)
    if (!piezas.some((p) => p.id === id)) {
      piezas.push({ id, papel: 'vertebra', etiqueta: nivel === 'S' ? 'Sacro' : `Vértebra ${nombreDeNivel(nivel)}` })
    }
  }
  if (salida.disco && salida.disco !== cruza) {
    piezas.push({ id: `disco-${salida.disco}`, papel: 'disco', etiqueta: `Agujero ${salida.disco}` })
  }
  explicacion.push(salida.descripcion)

  const derm = dermatomaDeRaiz(raiz)
  const dermatomas = derm ? [{ dermatoma: derm.id, lado }] : []
  if (derm) explicacion.push(`Siente la piel de: ${derm.zona.charAt(0).toLowerCase()}${derm.zona.slice(1)}`)

  return { origen: idDeRaiz(raiz, lado), piezas, dermatomas, explicacion }
}

/** Un segmento medular enciende sus dos raíces y sus dos dermatomas. */
export const conexionDeSegmento = (raiz: string): Conexion | null => {
  if (!segmentoDeRaiz(raiz)) return null
  const izq = conexionDeRaiz(raiz, 'izquierdo')
  const der = conexionDeRaiz(raiz, 'derecho')
  if (!izq || !der) return null
  const piezas = [...izq.piezas]
  for (const p of der.piezas) if (!piezas.some((q) => q.id === p.id)) piezas.push(p)
  return {
    origen: `segmento-${raiz}`,
    piezas,
    dermatomas: [...izq.dermatomas, ...der.dermatomas],
    explicacion: [`Del segmento ${raiz} nacen las raíces ${raiz} izquierda y derecha.`, ...izq.explicacion.slice(1)],
  }
}

/** Un disco enciende las raíces que más se relacionan con él: la que sale y la que pasa. */
export const conexionDeDisco = (disco: string): Conexion | null => {
  const par = vertebrasDelDisco(disco)
  if (!par) return null
  const piezas: PiezaEncendida[] = [
    { id: `disco-${disco}`, papel: 'disco', etiqueta: `Disco ${disco}` },
    ...par.map((n) => ({ id: idDeVertebra(n), papel: 'vertebra' as const, etiqueta: n === 'S' ? 'Sacro' : `Vértebra ${n}` })),
  ]
  const explicacion: string[] = []
  const raices = new Set<string>()
  for (const tipo of ['paracentral', 'foraminal'] as TipoDeHernia[]) {
    const efecto = efectoDeHernia(disco, tipo)
    if (efecto?.raiz) raices.add(efecto.raiz)
    if (efecto) explicacion.push(efecto.explicacion)
  }
  for (const raiz of raices) {
    for (const lado of ['izquierdo', 'derecho'] as Lado[]) {
      piezas.push({ id: idDeRaiz(raiz, lado), papel: 'raiz', etiqueta: `Raíz ${raiz}` })
    }
  }
  return { origen: `disco-${disco}`, piezas, dermatomas: [], explicacion }
}

/** La conexión de cualquier estructura del catálogo (o `null` si no tiene). */
export const conexionDe = (id: string): Conexion | null => {
  const e = estructuraPorId(id)
  if (!e) return null
  if (e.capa === 'raices' && e.raiz && e.lado) return conexionDeRaiz(e.raiz, e.lado)
  if (e.capa === 'medula' && e.raiz) return conexionDeSegmento(e.raiz)
  if (e.disco) return conexionDeDisco(e.disco)
  return null
}
