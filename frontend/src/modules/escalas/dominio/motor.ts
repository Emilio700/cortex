/**
 * El cálculo de una escala, sin React ni red.
 *
 * La pantalla lo usa para **sugerir** el puntaje mientras se llena; el que se
 * guarda lo calcula el servidor con la misma regla (`services/escalas.py`).
 * Cualquier cambio aquí tiene que hacerse igual allá: `paridad.json` lo vigila
 * desde las dos suites de pruebas.
 */
import type { Escala, Item, Opcion, Respuestas, Resultado, Tono } from './tipos'

/**
 * Redondeo a un decimal, «la mitad hacia arriba». Igual en Python
 * (`math.floor(x * 10 + 0.5) / 10`): `Math.round` y `round` no redondean igual
 * los empates y daban puntajes distintos en la pantalla y en el expediente.
 */
export const redondear = (x: number): number => Math.floor(x * 10 + 0.5) / 10

const opcionDe = (item: Item, codigo: string | undefined): Opcion | undefined =>
  codigo === undefined || codigo === '' ? undefined : item.opciones.find((o) => o.codigo === codigo)

const maximoDelItem = (item: Item): number =>
  Math.max(...item.opciones.map((o) => o.puntos ?? 0))

const SIN_TOTAL =
  'Sin total: hay un componente no valorable. Se registra por componentes.'

/** La banda que le toca a un puntaje. */
export function bandaDe(escala: Escala, puntaje: number): { texto: string; tono: Tono } {
  const banda = escala.bandas.find((b) => puntaje <= b.hasta) ?? escala.bandas[escala.bandas.length - 1]
  return { texto: banda.texto, tono: banda.tono }
}

const secciones = (n: number) => (n === 1 ? '1 sección sin responder' : `${n} secciones sin responder`)

export function calcular(escala: Escala, respuestas: Respuestas): Resultado {
  const faltantes: string[] = []
  const elegidas: { item: Item; opcion: Opcion }[] = []
  for (const item of escala.items) {
    const opcion = opcionDe(item, respuestas[item.id])
    if (opcion) elegidas.push({ item, opcion })
    else if (!item.opcional) faltantes.push(item.id)
  }
  const vacio: Resultado = {
    completo: false,
    faltantes,
    puntaje: null,
    interpretacion: null,
    tono: 'neutral',
    detalle: null,
    avisos: [],
  }
  if (faltantes.length > 0 || elegidas.length === 0) return vacio

  const porComponentes = escala.items.every((i) => i.abreviatura)
  let detalle: string | null = porComponentes
    ? elegidas.map(({ item, opcion }) => `${item.abreviatura}${opcion.codigo}`).join(' ')
    : null
  const noValorables = elegidas.filter(({ opcion }) => opcion.puntos === null)

  if (noValorables.length > 0 && (escala.noValorable ?? 'anula') === 'anula') {
    return { ...vacio, completo: true, interpretacion: SIN_TOTAL, detalle }
  }

  const avisos: string[] = []
  if (noValorables.length > 0) {
    avisos.push(
      `No valorable (cuenta 0): ${noValorables.map(({ item }) => item.titulo).join('; ')}.`,
    )
    detalle ??= `No valorable: ${noValorables.map(({ item }) => item.id).join(', ')}`
  }

  const suma = elegidas.reduce((total, { opcion }) => total + (opcion.puntos ?? 0), 0)
  let puntaje = suma
  if (escala.calculo === 'porcentaje') {
    const posible = elegidas.reduce((total, { item }) => total + maximoDelItem(item), 0)
    puntaje = redondear((suma / posible) * 100)
  } else if (escala.calculo === 'prorrateo') {
    puntaje = redondear((suma / elegidas.length) * escala.items.length)
  }

  const omitidas = escala.items.length - elegidas.length
  if (omitidas > 0) {
    detalle ??= secciones(omitidas)
    if (escala.avisarOmitidasDesde !== undefined && omitidas >= escala.avisarOmitidasDesde) {
      avisos.push(
        `Con ${secciones(omitidas)} el resultado puede no ser válido (verificar).`,
      )
    }
  }

  const { texto, tono } = bandaDe(escala, puntaje)
  return { completo: true, faltantes: [], puntaje, interpretacion: texto, tono, detalle, avisos }
}

/**
 * Errores que impiden guardar, en español y con el nombre del ítem como se ve
 * en pantalla. Los mismos textos devuelve el servidor.
 */
export function validar(escala: Escala, respuestas: Respuestas): string[] {
  const errores: string[] = []
  const ids = new Set(escala.items.map((i) => i.id))
  for (const clave of Object.keys(respuestas)) {
    if (!ids.has(clave)) errores.push(`La respuesta «${clave}» no pertenece a ${escala.nombre}.`)
  }
  let respondidas = 0
  for (const item of escala.items) {
    const codigo = respuestas[item.id]
    if (codigo === undefined || codigo === '') {
      if (!item.opcional) errores.push(`Falta responder «${item.titulo}».`)
      continue
    }
    if (!opcionDe(item, codigo)) {
      errores.push(`La respuesta de «${item.titulo}» no es una opción de ${escala.nombre}.`)
      continue
    }
    respondidas += 1
  }
  if (errores.length === 0 && respondidas === 0) errores.push('Responde al menos una sección.')
  return errores
}

/** Cómo se lee un puntaje: «12», «44.4 %», «Grado III», «AIS D». */
export function formatearPuntaje(escala: Escala, puntaje: number | null): string {
  if (puntaje === null) return '—'
  switch (escala.presentacion) {
    case 'porcentaje':
      return `${puntaje} %`
    case 'romano':
      return `Grado ${['0', 'I', 'II', 'III', 'IV', 'V'][puntaje] ?? puntaje}`
    case 'letra':
      return `AIS ${'ABCDE'[puntaje - 1] ?? puntaje}`
    default:
      return Number.isInteger(puntaje) ? String(puntaje) : puntaje.toFixed(1)
  }
}

/**
 * La parte de la escala que el servidor tiene que repetir tal cual: ítems,
 * opciones con sus puntos, forma de cálculo y rangos. Los textos de las
 * opciones no entran: el servidor no los muestra.
 */
export function estructura(escala: Escala) {
  return {
    id: escala.id,
    version: escala.version,
    nombre: escala.nombre,
    calculo: escala.calculo,
    no_valorable: escala.noValorable ?? 'anula',
    avisar_omitidas_desde: escala.avisarOmitidasDesde ?? null,
    min: escala.min,
    max: escala.max,
    items: escala.items.map((i) => ({
      id: i.id,
      titulo: i.titulo,
      abreviatura: i.abreviatura ?? null,
      opcional: Boolean(i.opcional),
      opciones: i.opciones.map((o) => [o.codigo, o.puntos]),
    })),
    bandas: escala.bandas.map((b) => [b.hasta, b.texto, b.tono]),
  }
}
