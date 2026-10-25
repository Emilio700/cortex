/**
 * Marcas del modo «Explicar al paciente»: el médico señala una región o un
 * nivel («hernia L4-L5 paracentral derecha») y el atlas enseña la raíz
 * comprimida y su dermatoma.
 *
 * Las marcas viven sólo en la pantalla: no son un diagnóstico ni un dato del
 * expediente. Lo que se conserva es la captura, si el médico decide guardarla.
 */
import { estructuraPorId, idDeRaiz } from './catalogo'
import { DISCOS, efectoDeHernia, type EfectoDeHernia, type Lado, type TipoDeHernia } from './columna'
import { dermatomaDeRaiz } from './dermatomas'
import type { DermatomaEncendido } from './conexiones'

export type HallazgoDeNivel = 'hernia' | 'estenosis-foraminal'
export type HallazgoDeRegion = 'lesion' | 'tumor' | 'hemorragia' | 'aneurisma' | 'fractura'

export const HALLAZGOS_DE_NIVEL: { id: HallazgoDeNivel; nombre: string }[] = [
  { id: 'hernia', nombre: 'Hernia de disco' },
  { id: 'estenosis-foraminal', nombre: 'Estrechez del agujero (estenosis foraminal)' },
]

export const HALLAZGOS_DE_REGION: { id: HallazgoDeRegion; nombre: string }[] = [
  { id: 'lesion', nombre: 'Lesión' },
  { id: 'tumor', nombre: 'Tumor' },
  { id: 'hemorragia', nombre: 'Hemorragia' },
  { id: 'aneurisma', nombre: 'Aneurisma' },
  { id: 'fractura', nombre: 'Fractura' },
]

export type LadoDeMarca = Lado | 'ambos'

export interface MarcaDeNivel {
  id: string
  tipo: 'nivel'
  disco: string
  hallazgo: HallazgoDeNivel
  /** Sólo para hernias: dónde está dentro del conducto. */
  posicion: TipoDeHernia
  lado: LadoDeMarca
  nota: string
}

export interface MarcaDeRegion {
  id: string
  tipo: 'region'
  estructura: string
  hallazgo: HallazgoDeRegion
  nota: string
}

export type Marca = MarcaDeNivel | MarcaDeRegion

export const LARGO_MAXIMO_DE_NOTA = 280

const limpiarNota = (nota: string) => nota.replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_DE_NOTA)

let consecutivo = 0
const nuevoId = () => `marca-${Date.now().toString(36)}-${(consecutivo++).toString(36)}`

export type ResultadoDeMarca<T> = { ok: true; marca: T } | { ok: false; error: string }

export const crearMarcaDeNivel = (datos: Omit<MarcaDeNivel, 'id' | 'tipo'>): ResultadoDeMarca<MarcaDeNivel> => {
  if (!DISCOS.includes(datos.disco)) return { ok: false, error: 'Elige un nivel de la lista.' }
  // Una estenosis del agujero aprieta la raíz que sale: se comporta como una foraminal.
  const posicion: TipoDeHernia = datos.hallazgo === 'estenosis-foraminal' ? 'foraminal' : datos.posicion
  if (posicion === 'central' && datos.lado !== 'ambos') {
    return { ok: false, error: 'Una hernia central afecta a los dos lados: elige «ambos lados».' }
  }
  return { ok: true, marca: { ...datos, posicion, id: nuevoId(), tipo: 'nivel', nota: limpiarNota(datos.nota) } }
}

export const crearMarcaDeRegion = (datos: Omit<MarcaDeRegion, 'id' | 'tipo'>): ResultadoDeMarca<MarcaDeRegion> => {
  if (!estructuraPorId(datos.estructura)) return { ok: false, error: 'Elige una estructura del atlas.' }
  return { ok: true, marca: { ...datos, id: nuevoId(), tipo: 'region', nota: limpiarNota(datos.nota) } }
}

const LADO_TEXTO: Record<LadoDeMarca, string> = { derecho: 'derecha', izquierdo: 'izquierda', ambos: 'bilateral' }
const POSICION_TEXTO: Record<TipoDeHernia, string> = {
  central: 'central',
  paracentral: 'paracentral',
  foraminal: 'foraminal',
}

export const efectoDeMarca = (m: MarcaDeNivel): EfectoDeHernia | null => efectoDeHernia(m.disco, m.posicion)

const lados = (lado: LadoDeMarca): Lado[] => (lado === 'ambos' ? ['izquierdo', 'derecho'] : [lado])

/** Raíces comprimidas por la marca, con su lado. */
export const raicesDeMarca = (m: Marca): { raiz: string; lado: Lado }[] => {
  if (m.tipo !== 'nivel') return []
  const efecto = efectoDeMarca(m)
  if (!efecto?.raiz) return []
  return lados(m.lado).map((lado) => ({ raiz: efecto.raiz!, lado }))
}

/** Título corto de la marca: «Hernia L4-L5 paracentral derecha · raíz L5». */
export const describirMarca = (m: Marca): string => {
  if (m.tipo === 'region') {
    const hallazgo = HALLAZGOS_DE_REGION.find((h) => h.id === m.hallazgo)?.nombre ?? 'Lesión'
    return `${hallazgo} · ${estructuraPorId(m.estructura)?.nombre ?? m.estructura}`
  }
  const efecto = efectoDeMarca(m)
  const base =
    m.hallazgo === 'hernia'
      ? `Hernia ${m.disco} ${POSICION_TEXTO[m.posicion]} ${LADO_TEXTO[m.lado]}`
      : `Estenosis foraminal ${m.disco} ${LADO_TEXTO[m.lado]}`
  if (!efecto) return base
  if (efecto.raiz) return `${base} · raíz ${efecto.raiz}`
  if (efecto.colaDeCaballo) return `${base} · cola de caballo`
  if (efecto.medula) return `${base} · médula`
  return base
}

/** Dermatomas que la marca enciende en la silueta. */
export const dermatomasDeMarca = (m: Marca): DermatomaEncendido[] =>
  raicesDeMarca(m).flatMap(({ raiz, lado }) => {
    const d = dermatomaDeRaiz(raiz)
    return d ? [{ dermatoma: d.id, lado }] : []
  })

/** Todos los dermatomas de varias marcas, sin repetir. */
export const dermatomasDeMarcas = (marcas: Marca[]): DermatomaEncendido[] => {
  const vistos = new Set<string>()
  return marcas.flatMap(dermatomasDeMarca).filter((d) => {
    const llave = `${d.dermatoma}-${d.lado}`
    if (vistos.has(llave)) return false
    vistos.add(llave)
    return true
  })
}

/** Mallas que la marca pinta como afectadas en la escena. */
export const mallasAfectadas = (m: Marca): string[] => {
  if (m.tipo === 'region') return estructuraPorId(m.estructura)?.componentes ?? [m.estructura]
  const ids = [`disco-${m.disco}`]
  for (const { raiz, lado } of raicesDeMarca(m)) ids.push(idDeRaiz(raiz, lado))
  const efecto = efectoDeMarca(m)
  if (efecto?.colaDeCaballo) ids.push(...(estructuraPorId('cola-de-caballo')?.componentes ?? []))
  return ids
}

/** El texto que acompaña a la captura: una línea por marca, con su nota. */
export const textoDeMarcasParaCaptura = (marcas: Marca[]): string[] =>
  marcas.map((m) => (m.nota ? `${describirMarca(m)} — ${m.nota}` : describirMarca(m)))
