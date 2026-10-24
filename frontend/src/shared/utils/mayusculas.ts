/**
 * Captura en MAYÚSCULAS compartida por las pantallas clínicas.
 *
 * El doctor y la asistente escriben en minúsculas y el expediente debe quedar
 * en mayúsculas. Se normaliza mientras teclean, corrigiendo el valor en el
 * propio DOM y devolviendo el cursor a su sitio antes de avisar a React: si se
 * dejara solo al re-render, el cursor saltaría al final al escribir en medio de
 * una palabra.
 *
 * No se aplica a correos, contraseñas, ni a campos numéricos o de fecha.
 */
import type React from 'react'

/** Tipos de input donde el navegador permite mover la selección del cursor. */
const TIPOS_CON_SELECCION = ['text', 'search', 'url', 'tel', 'password', '']

/** Pasa el texto a mayúsculas respetando null/undefined. */
export const aMayusculas = (valor: string | null | undefined): string =>
    (valor || '').toUpperCase()

/** true si en ese elemento se puede reposicionar el cursor sin que el navegador falle. */
export const admiteSeleccion = (
    el: HTMLInputElement | HTMLTextAreaElement,
): boolean => el instanceof HTMLTextAreaElement || TIPOS_CON_SELECCION.includes(el.type)

/**
 * Manejador de onChange para un campo de texto que se captura en mayúsculas.
 *
 * Uso: `onChange={enMayusculas((valor) => setDiagnostico(valor))}`
 */
export const enMayusculas =
    (aplicar: (valor: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
        const el = e.target
        const normalizado = aMayusculas(el.value)
        if (normalizado !== el.value) {
            const inicio = admiteSeleccion(el) ? el.selectionStart : null
            const fin = admiteSeleccion(el) ? el.selectionEnd : null
            el.value = normalizado
            if (inicio !== null && fin !== null) el.setSelectionRange(inicio, fin)
        }
        aplicar(normalizado)
    }
