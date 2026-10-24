import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { getAge, formatEdad, FECHA_NACIMIENTO_RELLENO_LEGACY } from './date'

// Se congela el reloj para que la edad esperada no cambie con el paso de los
// dias: una prueba de edades que depende de "hoy" falla sola en algun cumpleanos.
const HOY = new Date('2026-09-24T12:00:00')

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(HOY)
})

afterEach(() => {
    vi.useRealTimers()
})

describe('getAge', () => {
    it('calcula los anios cumplidos de una fecha real', () => {
        expect(getAge('1990-05-10')).toBe(36)
    })

    it('todavia no cuenta el cumpleanios que no ha llegado', () => {
        expect(getAge('1990-12-31')).toBe(35)
    })

    it('cuenta el cumpleanios el mismo dia, sin correrse por la zona horaria', () => {
        // Con `new Date('2000-09-24')` la fecha cae el dia anterior en Mexico y
        // el paciente aparecia con un anio de mas justo el dia de su cumpleanios.
        expect(getAge('2000-09-24')).toBe(26)
    })

    it('no inventa una edad cuando no hay fecha capturada', () => {
        // `new Date(null)` es el 1 de enero de 1970: de ahi salia el fantasma de
        // "56 anios" en la lista de pacientes.
        expect(getAge(null)).toBeNull()
        expect(getAge(undefined)).toBeNull()
        expect(getAge('')).toBeNull()
        expect(getAge('   ')).toBeNull()
    })

    it('no inventa una edad cuando la fecha es invalida', () => {
        expect(getAge('no es una fecha')).toBeNull()
        expect(getAge('2026-02-31')).toBeNull()
        expect(getAge(new Date('vaya fecha'))).toBeNull()
    })

    it('trata el relleno 1900-01-01 de la migracion como fecha sin capturar', () => {
        expect(getAge(FECHA_NACIMIENTO_RELLENO_LEGACY)).toBeNull()
        expect(getAge('1900-01-01T00:00:00')).toBeNull()
    })

    it('no reporta edades negativas por una fecha capturada en el futuro', () => {
        expect(getAge('2030-01-01')).toBeNull()
    })

    it('acepta tambien un objeto Date ya construido', () => {
        expect(getAge(new Date(1990, 4, 10))).toBe(36)
    })
})

describe('formatEdad', () => {
    it('escribe los anios cuando se conocen', () => {
        expect(formatEdad('1990-05-10')).toBe('36 años')
    })

    it('deja un guion en vez de afirmar una edad que el sistema no sabe', () => {
        expect(formatEdad(null)).toBe('—')
        expect(formatEdad(FECHA_NACIMIENTO_RELLENO_LEGACY)).toBe('—')
    })

    it('admite un texto propio para el hueco', () => {
        expect(formatEdad(null, 'Sin capturar')).toBe('Sin capturar')
    })
})
