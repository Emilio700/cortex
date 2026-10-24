import { describe, it, expect, vi } from 'vitest'
import { aMayusculas, admiteSeleccion, enMayusculas } from './mayusculas'

/** Evento de cambio falso sobre un elemento real del DOM. */
const eventoDe = (el: HTMLInputElement | HTMLTextAreaElement) =>
    ({ target: el }) as unknown as React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>

describe('aMayusculas', () => {
    it('pasa el texto a mayusculas', () => {
        expect(aMayusculas('dolor abdominal')).toBe('DOLOR ABDOMINAL')
    })

    it('respeta acentos y enies', () => {
        expect(aMayusculas('niña con migraña')).toBe('NIÑA CON MIGRAÑA')
    })

    it('devuelve cadena vacia con null o undefined', () => {
        expect(aMayusculas(null)).toBe('')
        expect(aMayusculas(undefined)).toBe('')
    })
})

describe('admiteSeleccion', () => {
    it('acepta los textarea', () => {
        expect(admiteSeleccion(document.createElement('textarea'))).toBe(true)
    })

    it('acepta los input de texto', () => {
        const el = document.createElement('input')
        el.type = 'text'
        expect(admiteSeleccion(el)).toBe(true)
    })

    it('rechaza los input numericos y de fecha', () => {
        const numero = document.createElement('input')
        numero.type = 'number'
        const fecha = document.createElement('input')
        fecha.type = 'date'
        expect(admiteSeleccion(numero)).toBe(false)
        expect(admiteSeleccion(fecha)).toBe(false)
    })
})

describe('enMayusculas', () => {
    it('avisa a React con el texto ya en mayusculas', () => {
        const aplicar = vi.fn()
        const el = document.createElement('textarea')
        el.value = 'cefalea'
        enMayusculas(aplicar)(eventoDe(el))
        expect(aplicar).toHaveBeenCalledWith('CEFALEA')
    })

    it('corrige el valor en el propio DOM', () => {
        const el = document.createElement('textarea')
        el.value = 'cefalea'
        enMayusculas(vi.fn())(eventoDe(el))
        expect(el.value).toBe('CEFALEA')
    })

    it('mantiene el cursor donde estaba al escribir en medio de una palabra', () => {
        const el = document.createElement('input')
        el.type = 'text'
        document.body.appendChild(el)
        el.value = 'DOLxOR'
        el.setSelectionRange(4, 4)
        enMayusculas(vi.fn())(eventoDe(el))
        expect(el.value).toBe('DOLXOR')
        expect(el.selectionStart).toBe(4)
        expect(el.selectionEnd).toBe(4)
        el.remove()
    })

    it('no toca el DOM cuando el texto ya venia en mayusculas', () => {
        const el = document.createElement('textarea')
        el.value = 'FIEBRE'
        const mover = vi.spyOn(el, 'setSelectionRange')
        enMayusculas(vi.fn())(eventoDe(el))
        expect(mover).not.toHaveBeenCalled()
        mover.mockRestore()
    })
})
