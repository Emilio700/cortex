import { describe, it, expect } from 'vitest'
import {
    calcularFpp,
    campoRequiereMayusculas,
    displayAIso,
    esIsoValida,
    formatearTecleoFecha,
    isoADisplay,
    normalizarValorCampo,
} from './patientForm'

describe('calcularFpp (regla de Naegele)', () => {
    it('suma 280 dias a la FUR', () => {
        expect(calcularFpp('2026-01-01')).toBe('2026-10-08')
    })

    it('cruza el cambio de anio', () => {
        expect(calcularFpp('2025-06-15')).toBe('2026-03-22')
    })

    it('respeta el 29 de febrero de un anio bisiesto', () => {
        // 2024 es bisiesto: el tramo incluye el 29 de febrero.
        expect(calcularFpp('2023-08-01')).toBe('2024-05-07')
    })

    it('acepta el 29 de febrero como FUR', () => {
        expect(calcularFpp('2024-02-29')).toBe('2024-12-05')
    })

    it('devuelve cadena vacia si la FUR es invalida o falta', () => {
        expect(calcularFpp('')).toBe('')
        expect(calcularFpp(null)).toBe('')
        expect(calcularFpp('2025-02-30')).toBe('')
        expect(calcularFpp('15/06/2025')).toBe('')
    })
})

describe('normalizacion de texto del formulario', () => {
    it('pasa a mayusculas los campos clinicos', () => {
        expect(normalizarValorCampo('first_name', 'maría josé')).toBe('MARÍA JOSÉ')
        expect(normalizarValorCampo('allergies', 'penicilina')).toBe('PENICILINA')
        expect(normalizarValorCampo('religion', 'católica')).toBe('CATÓLICA')
        expect(normalizarValorCampo('menstrual_rhythm', '28x4 eu')).toBe('28X4 EU')
    })

    it('deja el correo en minusculas', () => {
        expect(normalizarValorCampo('email', 'Paciente@GEMS.COM')).toBe('paciente@gems.com')
        expect(campoRequiereMayusculas('email')).toBe(false)
    })

    it('no toca los campos que no se normalizan', () => {
        expect(normalizarValorCampo('phone', '+52 669 123 4567')).toBe('+52 669 123 4567')
    })
})

describe('captura de fechas', () => {
    it('convierte entre ISO y dd/mm/aaaa', () => {
        expect(isoADisplay('1970-03-08')).toBe('08/03/1970')
        expect(displayAIso('08/03/1970')).toBe('1970-03-08')
    })

    it('rechaza fechas inexistentes', () => {
        expect(displayAIso('31/02/1970')).toBe('')
        expect(esIsoValida('2025-13-01')).toBe(false)
        expect(esIsoValida('2024-02-29')).toBe(true)
    })

    it('no devuelve nada para una fecha a medio teclear', () => {
        expect(displayAIso('08/03')).toBe('')
        expect(displayAIso('08/03/19')).toBe('')
    })

    it('inserta las diagonales mientras se teclea sin borrar lo escrito', () => {
        expect(formatearTecleoFecha('0')).toBe('0')
        expect(formatearTecleoFecha('08')).toBe('08')
        expect(formatearTecleoFecha('083')).toBe('08/3')
        expect(formatearTecleoFecha('08031970')).toBe('08/03/1970')
        expect(formatearTecleoFecha('08/03/1970')).toBe('08/03/1970')
        expect(formatearTecleoFecha('080319709')).toBe('08/03/1970')
    })
})
