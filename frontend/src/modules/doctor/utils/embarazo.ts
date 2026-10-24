/**
 * Cálculos obstétricos puros del módulo de embarazo.
 *
 * Viven fuera del JSX para poder probarlos sin navegador. Aquí no se decide
 * nada clínico: solo se calcula lo que el médico verifica a ojo en cada
 * consulta (edad gestacional) y una sugerencia orientativa de próxima cita.
 *
 * La FPP se calcula con `calcularFpp` (regla de Naegele) del formulario de
 * pacientes; no se duplica esa lógica.
 */

import { DIAS_NAEGELE, esIsoValida } from '../../../shared/utils/patientForm'
import { hoyLocalISO } from '../../../shared/utils/date'

const MS_DIA = 24 * 60 * 60 * 1000
const ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Hasta la semana 28 el control estándar es mensual. */
export const UMBRAL_QUINCENAL_SEM = 28
/** De la semana 36 en adelante el control estándar es semanal. */
export const UMBRAL_SEMANAL_SEM = 36

export const DIAS_INTERVALO_MENSUAL = 28
export const DIAS_INTERVALO_QUINCENAL = 14
export const DIAS_INTERVALO_SEMANAL = 7

/**
 * Tope de días desde la FUR a partir del cual la datación deja de ser
 * plausible para un embarazo en curso (45 semanas). Sirve para no mostrar
 * "89 semanas" cuando alguien olvidó cerrar un embarazo antiguo.
 */
export const DIAS_MAX_PLAUSIBLE = 45 * 7

/** Convierte yyyy-MM-dd a milisegundos UTC. `null` si la fecha no es válida. */
const aUtc = (iso: string | null | undefined): number | null => {
    if (!esIsoValida(iso)) return null
    const encaje = ISO_FECHA.exec((iso as string).trim()) as RegExpExecArray
    return Date.UTC(Number(encaje[1]), Number(encaje[2]) - 1, Number(encaje[3]))
}

/** Convierte milisegundos UTC a yyyy-MM-dd. */
const aIso = (utc: number): string => {
    const fecha = new Date(utc)
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0')
    const dia = String(fecha.getUTCDate()).padStart(2, '0')
    return `${fecha.getUTCFullYear()}-${mes}-${dia}`
}

/**
 * Fecha de hoy del consultorio (America/Mazatlan), en formato yyyy-MM-dd.
 *
 * Antes tomaba el día del navegador: en un equipo con otra zona horaria la
 * edad gestacional y la próxima revisión sugerida se corrían un día.
 */
export const hoyIso = (): string => hoyLocalISO()

/** Suma días a una fecha ISO. Devuelve '' si la fecha no es válida. */
export const sumarDias = (iso: string | null | undefined, dias: number): string => {
    const base = aUtc(iso)
    if (base === null) return ''
    return aIso(base + dias * MS_DIA)
}

/** Formato corto que usa el médico: "24.3 sem". */
export const formatoCortoSemanas = (semanas: number, diasSueltos: number): string =>
    `${semanas}.${diasSueltos} sem`

/** Formato largo: "24 semanas 3 días", "1 semana 1 día", "2 semanas". */
export const formatoLargoSemanas = (semanas: number, diasSueltos: number): string => {
    const texto = `${semanas} ${semanas === 1 ? 'semana' : 'semanas'}`
    if (diasSueltos === 0) return texto
    return `${texto} ${diasSueltos} ${diasSueltos === 1 ? 'día' : 'días'}`
}

export interface EdadGestacional {
    /** Días completos transcurridos desde la FUR. */
    dias: number
    semanas: number
    diasSueltos: number
    /** "24.3 sem" */
    etiquetaCorta: string
    /** "24 semanas 3 días" */
    etiqueta: string
    /** true si la datación ya no es plausible para un embarazo en curso. */
    fueraDeRango: boolean
}

/**
 * Edad gestacional por FUR: días completos transcurridos, en semanas y días.
 *
 * Devuelve `null` si la FUR no es una fecha válida o si es posterior a la
 * fecha de referencia: no se inventa una edad gestacional negativa.
 */
export const calcularEdadGestacional = (
    fur: string | null | undefined,
    referencia: string | null | undefined = hoyIso(),
): EdadGestacional | null => {
    const inicio = aUtc(fur)
    const corte = aUtc(referencia)
    if (inicio === null || corte === null) return null
    const dias = Math.floor((corte - inicio) / MS_DIA)
    if (dias < 0) return null
    const semanas = Math.floor(dias / 7)
    const diasSueltos = dias % 7
    return {
        dias,
        semanas,
        diasSueltos,
        etiquetaCorta: formatoCortoSemanas(semanas, diasSueltos),
        etiqueta: formatoLargoSemanas(semanas, diasSueltos),
        fueraDeRango: dias > DIAS_MAX_PLAUSIBLE,
    }
}

/** FUR implícita en una FPP registrada (FPP - 280 días). '' si no es válida. */
export const calcularFurDesdeFpp = (fpp: string | null | undefined): string =>
    sumarDias(fpp, -DIAS_NAEGELE)

export interface ProximaRevision {
    /** Fecha sugerida, yyyy-MM-dd. Siempre orientativa: nadie la agenda sola. */
    fecha: string
    /** Días entre la referencia y la fecha sugerida. */
    dias: number
    /** Intervalo estándar aplicado según la edad gestacional actual. */
    intervaloDias: number
    /** Semanas cumplidas en la fecha de referencia. */
    semanas: number
    /** Texto de la regla aplicada, para mostrarla junto a la sugerencia. */
    motivo: string
    /** true si se recortó el intervalo para no saltarse el cambio de frecuencia. */
    recortada: boolean
}

/**
 * Próxima revisión sugerida según el intervalo estándar de control prenatal:
 * mensual hasta la semana 28, quincenal de la 28 a la 36 y semanal desde la 36.
 *
 * El intervalo se recorta cuando la suma se saltaría el siguiente cambio de
 * frecuencia (p. ej. en la semana 26 la cita cae en la 28, no en la 30).
 *
 * Es una sugerencia orientativa: quien decide y agenda es el médico.
 */
export const proximaRevisionSugerida = (
    fur: string | null | undefined,
    referencia: string | null | undefined = hoyIso(),
): ProximaRevision | null => {
    const edad = calcularEdadGestacional(fur, referencia)
    if (!edad || edad.fueraDeRango) return null
    const inicio = aUtc(fur) as number
    const corte = aUtc(referencia) as number

    let intervaloDias = DIAS_INTERVALO_SEMANAL
    let motivo = `Control semanal desde la semana ${UMBRAL_SEMANAL_SEM}`
    let limite: number | null = null
    if (edad.semanas < UMBRAL_QUINCENAL_SEM) {
        intervaloDias = DIAS_INTERVALO_MENSUAL
        motivo = `Control mensual hasta la semana ${UMBRAL_QUINCENAL_SEM}`
        limite = inicio + UMBRAL_QUINCENAL_SEM * 7 * MS_DIA
    } else if (edad.semanas < UMBRAL_SEMANAL_SEM) {
        intervaloDias = DIAS_INTERVALO_QUINCENAL
        motivo = `Control quincenal de la semana ${UMBRAL_QUINCENAL_SEM} a la ${UMBRAL_SEMANAL_SEM}`
        limite = inicio + UMBRAL_SEMANAL_SEM * 7 * MS_DIA
    }

    const propuesta = corte + intervaloDias * MS_DIA
    const recortada = limite !== null && propuesta > limite
    const elegida = recortada ? (limite as number) : propuesta
    return {
        fecha: aIso(elegida),
        dias: Math.round((elegida - corte) / MS_DIA),
        intervaloDias,
        semanas: edad.semanas,
        motivo,
        recortada,
    }
}

/** Lo mínimo que necesita el cálculo: el embarazo tal como lo devuelve la API. */
export interface DatosDatacion {
    last_menstrual_period?: string | null
    estimated_delivery_date?: string | null
}

export interface ResumenEmbarazo {
    /** FUR usada para el cálculo (la registrada, o la implícita en la FPP). */
    fur: string
    /** true si la FUR se dedujo de la FPP porque no había FUR registrada. */
    furDerivada: boolean
    edad: EdadGestacional
    proxima: ProximaRevision | null
}

/**
 * Resume la datación de un embarazo para mostrarla en el expediente.
 *
 * Prefiere la FUR registrada; si solo hay FPP, deduce la FUR restando los 280
 * días de Naegele para poder seguir mostrando la edad gestacional.
 * Devuelve `null` cuando no hay datación utilizable.
 */
export const resumirEmbarazo = (
    pregnancy: DatosDatacion | null | undefined,
    referencia: string | null | undefined = hoyIso(),
): ResumenEmbarazo | null => {
    if (!pregnancy) return null
    const registrada = (pregnancy.last_menstrual_period || '').slice(0, 10)
    const derivada = calcularFurDesdeFpp((pregnancy.estimated_delivery_date || '').slice(0, 10))
    const fur = esIsoValida(registrada) ? registrada : derivada
    const edad = calcularEdadGestacional(fur, referencia)
    if (!edad) return null
    return {
        fur,
        furDerivada: !esIsoValida(registrada),
        edad,
        proxima: proximaRevisionSugerida(fur, referencia),
    }
}
