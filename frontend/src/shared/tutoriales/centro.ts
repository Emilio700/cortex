/**
 * Lógica del centro de ayuda separada de React: búsqueda, recorrido completo y
 * cómo se abre cada recorrido desde donde está la persona. Así se prueba sin
 * montar pantallas y la interfaz sólo pinta lo que aquí se decide.
 */
import routes from '../../routes'
import type {
  AccesoTutoriales,
  EtapaCompleta,
  PasoRecorrido,
  Recorrido,
  RecorridoCompleto,
} from './tipos'
import { buscarAncla, contextoPresente, puedeVerRecorrido, rutaCoincide } from './visibilidad'

/* ------------------------------------------------------------------ */
/* Cómo se abre un recorrido                                           */
/* ------------------------------------------------------------------ */

/**
 * - `aqui`: se puede ver en la pantalla abierta.
 * - `navegar`: vive en otra pantalla sin datos concretos; basta ir ahí.
 * - `necesita`: hace falta algo que el sistema no puede elegir por la
 *   persona: una paciente o consulta concreta (`datos`) o un formulario
 *   abierto (`formulario`). Abrirlo por ella sería actuar, y un tutorial nunca
 *   actúa; se explica cómo llegar.
 */
export type Apertura =
  | { tipo: 'aqui' }
  | { tipo: 'navegar'; ruta: string }
  | { tipo: 'necesita'; razon: 'datos' | 'formulario' }

export function comoAbrir(r: Recorrido, rutaActual: string, raiz: ParentNode = document): Apertura {
  const enSuPantalla = !r.ruta || rutaCoincide(r.ruta, rutaActual)
  if (!enSuPantalla) {
    if (r.ruta!.includes(':')) return { tipo: 'necesita', razon: 'datos' }
    if (r.contexto) return { tipo: 'necesita', razon: 'formulario' }
    return { tipo: 'navegar', ruta: r.ruta! }
  }
  if (!contextoPresente(r, raiz)) return { tipo: 'necesita', razon: 'formulario' }
  return { tipo: 'aqui' }
}

/** ¿El paso tiene a qué señalar ahora? Las tarjetas sin elemento siempre. */
export function pasoEnPantalla(paso: PasoRecorrido, raiz: ParentNode = document): boolean {
  return !paso.elemento || buscarAncla(paso.elemento, raiz) !== null
}

/**
 * ¿Puede abrir esta pantalla? Misma regla que `AccessGuard` sobre la ruta
 * declarada en `routes.tsx`: el centro no ofrece "Ir a…" hacia un /403.
 */
export function puedeIrA(ruta: string, acceso: AccesoTutoriales): boolean {
  const destino = routes.find((r) => r.path === ruta)
  if (!destino) return false
  return puedeVerRecorrido(
    {
      id: '',
      version: 0,
      titulo: '',
      resumen: '',
      grupo: 'General',
      requiere: destino.requires,
      roles: destino.roles,
      pasos: [],
    },
    acceso,
  )
}

/* ------------------------------------------------------------------ */
/* Recorrido completo                                                  */
/* ------------------------------------------------------------------ */

export interface EtapaResuelta {
  etapa: EtapaCompleta
  /** Índice entre las etapas declaradas; es lo que se guarda como avance. */
  indice: number
  recorrido: Recorrido
}

export function completoDeRol(
  completos: RecorridoCompleto[],
  acceso: AccesoTutoriales,
): RecorridoCompleto | null {
  if (acceso.role === undefined) return null
  return completos.find((c) => c.roles.includes(acceso.role!)) ?? null
}

/**
 * Las etapas que sí le tocan (su recorrido está entre los disponibles) y las
 * que se saltan por permisos, para decirlo en vez de omitirlas en silencio.
 */
export function resolverCompleto(
  completo: RecorridoCompleto,
  disponibles: Recorrido[],
): { aplicables: EtapaResuelta[]; saltadas: EtapaCompleta[] } {
  const aplicables: EtapaResuelta[] = []
  const saltadas: EtapaCompleta[] = []
  completo.etapas.forEach((etapa, indice) => {
    const recorrido = disponibles.find((r) => r.id === etapa.recorridoId)
    if (recorrido) aplicables.push({ etapa, indice, recorrido })
    else saltadas.push(etapa)
  })
  return { aplicables, saltadas }
}

/** Etapa en que va: la primera aplicable desde el avance guardado. */
export function etapaActual(
  aplicables: EtapaResuelta[],
  avance: number | null,
): EtapaResuelta | null {
  if (avance === null) return aplicables[0] ?? null
  return aplicables.find((e) => e.indice >= avance) ?? null
}

/** Etapa que sigue a la del recorrido indicado, o `null` si era la última. */
export function etapaSiguiente(
  aplicables: EtapaResuelta[],
  actual: EtapaResuelta,
): EtapaResuelta | null {
  return aplicables.find((e) => e.indice > actual.indice) ?? null
}

/* ------------------------------------------------------------------ */
/* Búsqueda                                                            */
/* ------------------------------------------------------------------ */

/** Minúsculas, sin acentos y sin las etiquetas HTML de los textos de los pasos. */
export function normalizar(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const PALABRAS_VACIAS = new Set([
  'a',
  'al',
  'como',
  'con',
  'de',
  'del',
  'el',
  'en',
  'es',
  'la',
  'las',
  'lo',
  'los',
  'mi',
  'mis',
  'para',
  'por',
  'que',
  'se',
  'su',
  'sus',
  'un',
  'una',
  'y',
  'o',
  'donde',
  'hago',
  'hacer',
  'quiero',
  'puedo',
  'tu',
  'tus',
  'me',
])

// De la más larga a la más corta: se quita sólo una, la primera que quepa.
const SUFIJOS = [
  'aciones',
  'amiento',
  'ciones',
  'acion',
  'cion',
  'ando',
  'iendo',
  'ados',
  'adas',
  'idos',
  'idas',
  'ado',
  'ada',
  'ido',
  'ida',
  'ar',
  'er',
  'ir',
  'es',
  'os',
  'as',
  'o',
  'a',
  'e',
  's',
]

/**
 * Raíz aproximada de una palabra, para que «cobrar» encuentre «cobro» y
 * «cobrado», y «receta» encuentre «recetas». Se deja al menos de cuatro letras
 * para que «receta» no encuentre «recepción».
 */
export function raizDe(palabra: string): string {
  for (const sufijo of SUFIJOS) {
    if (palabra.endsWith(sufijo) && palabra.length - sufijo.length >= 4) {
      return palabra.slice(0, -sufijo.length)
    }
  }
  return palabra
}

const palabras = (texto: string) =>
  normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean)

/** Términos útiles de la búsqueda, ya reducidos a su raíz. */
export function terminosDe(consulta: string): string[] {
  return palabras(consulta)
    .filter((p) => !PALABRAS_VACIAS.has(p))
    .map(raizDe)
}

/** ¿Todas las raíces aparecen al principio de alguna palabra del texto? */
const coincide = (terminos: string[], texto: string) => {
  const enTexto = palabras(texto)
  return terminos.every((t) => enTexto.some((p) => p.startsWith(t)))
}

export interface PasoEncontrado {
  recorrido: Recorrido
  /** Índice entre los pasos declarados. */
  indice: number
  paso: PasoRecorrido
}

export interface ResultadoBusqueda {
  recorridos: Recorrido[]
  pasos: PasoEncontrado[]
}

export const MAX_PASOS_ENCONTRADOS = 15

/**
 * Busca en los recorridos disponibles (ya filtrados por permisos) y en cada
 * uno de sus pasos. Un paso cuyo recorrido ya salió por su título también se
 * lista: quien busca «firma» quiere llegar al paso de la firma, no al inicio
 * del perfil.
 */
export function buscar(disponibles: Recorrido[], consulta: string): ResultadoBusqueda {
  const terminos = terminosDe(consulta)
  if (terminos.length === 0) return { recorridos: [], pasos: [] }

  const porTitulo: Recorrido[] = []
  const porResumen: Recorrido[] = []
  for (const r of disponibles) {
    if (coincide(terminos, r.titulo)) porTitulo.push(r)
    else if (coincide(terminos, `${r.titulo} ${r.resumen} ${r.grupo}`)) porResumen.push(r)
  }

  const pasosPorTitulo: PasoEncontrado[] = []
  const pasosPorTexto: PasoEncontrado[] = []
  for (const recorrido of disponibles) {
    recorrido.pasos.forEach((paso, indice) => {
      if (coincide(terminos, paso.titulo)) pasosPorTitulo.push({ recorrido, indice, paso })
      else if (coincide(terminos, `${paso.titulo} ${paso.texto}`)) {
        pasosPorTexto.push({ recorrido, indice, paso })
      }
    })
  }

  return {
    recorridos: [...porTitulo, ...porResumen],
    pasos: [...pasosPorTitulo, ...pasosPorTexto].slice(0, MAX_PASOS_ENCONTRADOS),
  }
}

/** Texto plano de un paso (para el lector de pantalla y los resultados). */
export function textoPlano(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/li>/gi, '. ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
