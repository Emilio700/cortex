/**
 * Lógica pura del formulario de pacientes (captura express).
 *
 * Se mantiene fuera del JSX para poder probarla sin navegador.
 */

/** Días que suma la regla de Naegele para estimar la FPP a partir de la FUR. */
export const DIAS_NAEGELE = 280

const ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/

/** Valida que el trío año/mes/día exista realmente en el calendario. */
const esFechaReal = (anio: number, mes: number, dia: number): boolean => {
    if (anio < 1 || mes < 1 || mes > 12 || dia < 1) return false
    const fecha = new Date(Date.UTC(anio, mes - 1, dia))
    return (
        fecha.getUTCFullYear() === anio &&
        fecha.getUTCMonth() === mes - 1 &&
        fecha.getUTCDate() === dia
    )
}

/** true si el texto es una fecha ISO (yyyy-MM-dd) válida. */
export const esIsoValida = (valor: string | null | undefined): boolean => {
    const encaje = ISO_FECHA.exec((valor || '').trim())
    if (!encaje) return false
    return esFechaReal(Number(encaje[1]), Number(encaje[2]), Number(encaje[3]))
}

/** Convierte yyyy-MM-dd a dd/MM/yyyy. Devuelve '' si la entrada no es válida. */
export const isoADisplay = (valor: string | null | undefined): string => {
    const encaje = ISO_FECHA.exec((valor || '').trim())
    if (!encaje || !esIsoValida(valor)) return ''
    return `${encaje[3]}/${encaje[2]}/${encaje[1]}`
}

/** Convierte dd/MM/yyyy a yyyy-MM-dd. Devuelve '' si la entrada no es válida. */
export const displayAIso = (valor: string | null | undefined): string => {
    const encaje = DISPLAY_FECHA.exec((valor || '').trim())
    if (!encaje) return ''
    const dia = Number(encaje[1])
    const mes = Number(encaje[2])
    const anio = Number(encaje[3])
    if (!esFechaReal(anio, mes, dia)) return ''
    return `${encaje[3]}-${encaje[2]}-${encaje[1]}`
}

/**
 * Deja que la asistente teclee libremente: solo admite dígitos e inserta las
 * diagonales por su cuenta, sin tocar lo que ya escribió.
 */
export const formatearTecleoFecha = (valor: string): string => {
    const digitos = (valor || '').replace(/\D/g, '').slice(0, 8)
    if (digitos.length <= 2) return digitos
    if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`
    return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`
}

/** FPP por regla de Naegele: FUR + 280 días. Devuelve '' si la FUR no es válida. */
export const calcularFpp = (fur: string | null | undefined): string => {
    if (!esIsoValida(fur)) return ''
    const encaje = ISO_FECHA.exec((fur as string).trim()) as RegExpExecArray
    const base = Date.UTC(Number(encaje[1]), Number(encaje[2]) - 1, Number(encaje[3]))
    const fpp = new Date(base + DIAS_NAEGELE * 24 * 60 * 60 * 1000)
    const mes = String(fpp.getUTCMonth() + 1).padStart(2, '0')
    const dia = String(fpp.getUTCDate()).padStart(2, '0')
    return `${fpp.getUTCFullYear()}-${mes}-${dia}`
}

// Aquí vivían `normalizarTipoPaciente`, `esPacienteObstetrica` y
// `esPacienteGinecologica`. Se fueron con el selector de tipo de paciente:
// un paciente no *es* obstétrica, *está* embarazada, y eso lo dice su
// registro de embarazo activo, no una bandera del expediente que nadie apaga.

/** Campos del formulario de pacientes que se capturan en MAYÚSCULAS. */
export const CAMPOS_EN_MAYUSCULAS = [
    'first_name',
    'last_name',
    'address',
    'allergies',
    'personal_history',
    'family_history',
    'gynecological_history',
    'religion',
    'blood_type',
    'menstrual_rhythm',
    'birth_control',
] as const

export type CampoEnMayusculas = (typeof CAMPOS_EN_MAYUSCULAS)[number]

/** true si el campo debe teclearse en mayúsculas. El correo nunca lo es. */
export const campoRequiereMayusculas = (campo: string): boolean =>
    (CAMPOS_EN_MAYUSCULAS as readonly string[]).includes(campo)

/**
 * Normaliza el valor tecleado según el campo: mayúsculas en los campos de
 * texto clínico y minúsculas en el correo electrónico.
 */
export const normalizarValorCampo = (campo: string, valor: string): string => {
    if (campo === 'email') return (valor || '').toLowerCase()
    if (campoRequiereMayusculas(campo)) return (valor || '').toUpperCase()
    return valor
}
