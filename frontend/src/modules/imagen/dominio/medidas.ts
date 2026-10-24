/**
 * Cálculos sobre las mediciones: formato, agrupación y evolución.
 *
 * Vive en el dominio porque es la parte que se puede probar sin navegador y la
 * que sostiene la afirmación más delicada del visor: «esta lesión creció 18 %
 * respecto de junio». Si esa cuenta se hace mal, el médico decide con un dato
 * falso.
 */
import type { AnotacionDicom } from './tipos'

export interface Evolucion {
  delta: number
  porcentaje: number
  fechaPrevia: string
}

export function formatearMedida(valor: number | null, unidad: string | null): string {
  if (valor === null || Number.isNaN(valor)) return '—'
  const redondeado = Math.abs(valor) >= 100 ? Math.round(valor) : Number(valor.toFixed(1))
  return `${redondeado} ${unidad ?? ''}`.trim()
}

export function claveDeMedida(medicion: AnotacionDicom): string {
  const etiqueta = medicion.label?.trim().toLowerCase()
  return etiqueta ? `${medicion.kind}:${etiqueta}` : `${medicion.kind}:sin-etiqueta`
}

/** La medición comparable más reciente de cada etiqueta. */
export function ultimasPorEtiqueta(medidas: AnotacionDicom[]): Map<string, AnotacionDicom> {
  const mapa = new Map<string, AnotacionDicom>()
  for (const medicion of medidas) {
    if (medicion.value === null) continue
    const clave = claveDeMedida(medicion)
    const previa = mapa.get(clave)
    if (!previa || new Date(medicion.created_at) > new Date(previa.created_at)) {
      mapa.set(clave, medicion)
    }
  }
  return mapa
}

/**
 * Diferencia contra la medición equivalente de un estudio previo.
 *
 * Devuelve ``null`` —y no un cero— cuando no hay con qué comparar o cuando las
 * unidades no coinciden: un 0 % inventado se lee como «no cambió».
 */
export function evolucionDeMedida(
  actual: AnotacionDicom,
  medidasPrevias: AnotacionDicom[]
): Evolucion | null {
  if (actual.value === null) return null
  const clave = claveDeMedida(actual)
  const candidatas = medidasPrevias.filter(
    (previa) =>
      claveDeMedida(previa) === clave &&
      previa.value !== null &&
      (previa.unit ?? '') === (actual.unit ?? '')
  )
  if (candidatas.length === 0) return null

  const previa = candidatas.reduce((masReciente, otra) =>
    new Date(otra.created_at) > new Date(masReciente.created_at) ? otra : masReciente
  )
  const valorPrevio = previa.value as number
  const delta = (actual.value as number) - valorPrevio
  const porcentaje = valorPrevio === 0 ? 0 : (delta / valorPrevio) * 100
  return {
    delta,
    porcentaje: Number(porcentaje.toFixed(1)),
    fechaPrevia: previa.created_at,
  }
}

export function resumirEvolucion(evolucion: Evolucion | null): string | null {
  if (!evolucion) return null
  const signo = evolucion.delta > 0 ? '+' : ''
  const delta = formatearMedida(evolucion.delta, '')
  return `${signo}${delta.trim()} (${signo}${evolucion.porcentaje} %)`
}
