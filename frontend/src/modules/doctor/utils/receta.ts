/**
 * Utilidades puras de la receta medica.
 *
 * El contrato de datos que viaja al backend (y que imprime el PDF) es
 * MedicationItem: { name, dosage, frequency, duration, intake_time?, notes?,
 * presentation?, route?, quantity? }. Aqui solo se arma texto legible a partir
 * de esas claves; no se inventan campos nuevos.
 */
import type { MedicationItem } from '../types'

export interface MedicamentoFrecuente {
    id: number
    nombre: string
    presentacion: string | null
    detalle: string | null
    veces_recetado: number
}

/**
 * Resumen de una linea para el medicamento ya agregado.
 * Ej: "PARACETAMOL Tabletas 500 mg — Via oral cada 8 h por 5 dias · surtir 15 tabletas"
 */
export function resumenMedicamento(med: MedicationItem): string {
    const titulo = [med.name, med.presentation, med.dosage]
        .map((p) => (p || '').trim())
        .filter(Boolean)
        .join(' ')
    const pauta = [
        (med.route || '').trim(),
        (med.frequency || '').trim(),
        (med.duration || '').trim() ? `por ${(med.duration || '').trim()}` : '',
        (med.intake_time || '').trim(),
    ].filter(Boolean)
    const cola = [
        pauta.join(' '),
        (med.quantity || '').trim() ? `surtir ${(med.quantity || '').trim()}` : '',
    ].filter(Boolean)
    if (!cola.length) return titulo
    if (!titulo) return cola.join(' · ')
    return `${titulo} — ${cola.join(' · ')}`
}

/** Un medicamento se puede agregar solo si tiene lo minimo que exige el backend. */
export function medicamentoCompleto(med: MedicationItem): boolean {
    return Boolean(
        (med.name || '').trim() && (med.dosage || '').trim() && (med.frequency || '').trim(),
    )
}

/** Agrega una sugerencia al texto de indicaciones sin duplicarla ni pasarse del limite. */
export function agregarIndicacion(texto: string, sugerencia: string, limite = 200): string {
    const actual = (texto || '').trim()
    if (actual.toLowerCase().includes(sugerencia.toLowerCase())) return actual
    const nuevo = actual ? `${actual}. ${sugerencia}` : sugerencia
    return nuevo.length > limite ? actual : nuevo
}

/** Medicamento vacio para la captura. */
export function medicamentoVacio(): MedicationItem {
    return {
        name: '',
        dosage: '',
        frequency: '',
        duration: '',
        intake_time: '',
        presentation: '',
        route: '',
        quantity: '',
        notes: '',
    }
}

/** Quita acentos y pasa a minusculas para comparar sin sorpresas. */
export function normalizarTexto(texto: string): string {
    return (texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

/** Etiqueta legible de un medicamento del vademecario: "FOLIVITAL · Tabletas · 4 MG". */
export function etiquetaFrecuente(med: MedicamentoFrecuente): string {
    return [med.nombre, med.presentacion, med.detalle]
        .map((p) => (p || '').trim())
        .filter(Boolean)
        .join(' · ')
}

/**
 * Filtra el vademecario por lo que va tecleando el doctor.
 * Coincide en cualquier parte de nombre/presentacion/detalle, sin distinguir
 * mayusculas ni acentos, y devuelve lo mas recetado primero.
 */
export function filtrarMedicamentos(
    lista: MedicamentoFrecuente[],
    texto: string,
    limite = 8,
): MedicamentoFrecuente[] {
    const busqueda = normalizarTexto(texto)
    if (!busqueda) return []
    return (lista || [])
        .filter((med) => normalizarTexto(etiquetaFrecuente(med)).includes(busqueda))
        .sort((a, b) => (b.veces_recetado || 0) - (a.veces_recetado || 0))
        .slice(0, limite)
}
