/**
 * Las cuentas de fecha y hora del modal de cita, aisladas.
 *
 * Lo que más puede doler aquí es el huso horario: `scheduled_at` guarda hora
 * local del consultorio, así que cualquier paso por UTC desfasa la agenda
 * siete horas. Varias de estas pruebas existen sólo para atrapar eso.
 */
import { describe, it, expect } from 'vitest'
import type { Franja, DiaDisponible } from '../../../shared/services/disponibilidad'
import {
    aClaveFecha,
    casillasDelMes,
    cambiarDia,
    contarLibres,
    deClaveFecha,
    desplazarMes,
    estadoDeCasilla,
    fechaDeIso,
    fechaLarga,
    indexarDias,
    meridianoInicial,
    mesYAnio,
    mismoDia,
    repartirPorMeridiano,
} from './horarios'

const franja = (inicio: string, disponible = true): Franja => ({
    inicio,
    hora: inicio.slice(11, 16),
    meridiano: Number(inicio.slice(11, 13)) < 12 ? 'am' : 'pm',
    disponible,
    motivo: disponible ? null : 'El doctor ya tiene otra cita a esa hora. Elige un horario libre.',
})

describe('claves de fecha', () => {
    it('no pasa por UTC al construir la clave del día', () => {
        // Un 1 de enero a las 00:30 local: con `toISOString()` en Mazatlán
        // esta fecha se convertiría en el 1 de enero 07:30 UTC, y con husos
        // al este del meridiano saltaría al día anterior.
        expect(aClaveFecha(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
        expect(aClaveFecha(new Date(2026, 11, 31, 23, 45))).toBe('2026-12-31')
    })

    it('ida y vuelta entre clave y Date local', () => {
        const fecha = deClaveFecha('2026-09-19')
        expect(fecha.getFullYear()).toBe(2026)
        expect(fecha.getMonth()).toBe(8)
        expect(fecha.getDate()).toBe(19)
        expect(aClaveFecha(fecha)).toBe('2026-09-19')
    })

    it('corta la fecha de un scheduled_at sin interpretarlo', () => {
        expect(fechaDeIso('2026-09-19T14:30:00')).toBe('2026-09-19')
    })

    it('cambia el día conservando la hora', () => {
        expect(cambiarDia('2026-09-19T14:30:00', '2026-10-02')).toBe('2026-10-02T14:30:00')
    })

    it('mismoDia ignora la hora', () => {
        expect(mismoDia(new Date(2026, 8, 19, 1), new Date(2026, 8, 19, 23))).toBe(true)
        expect(mismoDia(new Date(2026, 8, 19), new Date(2026, 8, 20))).toBe(false)
    })
})

describe('textos en español', () => {
    it('el subtítulo de la rejilla', () => {
        expect(fechaLarga(new Date(2026, 8, 19))).toBe('19 de septiembre de 2026')
    })

    it('el encabezado del calendario', () => {
        expect(mesYAnio(new Date(2026, 8, 19))).toBe('septiembre 2026')
    })
})

describe('casillas del calendario', () => {
    it('siempre son 42, para que la rejilla no cambie de alto al pasar de mes', () => {
        expect(casillasDelMes(new Date(2026, 1, 1))).toHaveLength(42) // febrero
        expect(casillasDelMes(new Date(2026, 7, 1))).toHaveLength(42) // agosto
    })

    it('la semana empieza en lunes', () => {
        // El 1 de septiembre de 2026 es martes: la primera casilla es el lunes 31.
        const casillas = casillasDelMes(new Date(2026, 8, 1))
        expect(casillas[0].clave).toBe('2026-08-31')
        expect(casillas[0].delMes).toBe(false)
        expect(casillas[1].clave).toBe('2026-09-01')
        expect(casillas[1].delMes).toBe(true)
    })

    it('un mes que empieza en domingo no se descoloca', () => {
        // 1 de febrero de 2026 es domingo: siete casillas de relleno delante.
        const casillas = casillasDelMes(new Date(2026, 1, 1))
        expect(casillas[0].clave).toBe('2026-01-26')
        expect(casillas[6].clave).toBe('2026-02-01')
    })

    it('desplazarMes se queda en el día 1 y cruza el año', () => {
        expect(aClaveFecha(desplazarMes(new Date(2026, 11, 15), 1))).toBe('2027-01-01')
        expect(aClaveFecha(desplazarMes(new Date(2026, 0, 15), -1))).toBe('2025-12-01')
    })
})

describe('estado de cada casilla (la leyenda)', () => {
    const dias: DiaDisponible[] = [
        { fecha: '2026-09-19', disponible: true, huecos: 4 },
        { fecha: '2026-09-20', disponible: false, huecos: 0 },
    ]
    const porFecha = indexarDias(dias)
    const casilla = (clave: string, delMes = true) => ({
        fecha: deClaveFecha(clave),
        clave,
        delMes,
    })

    it('la elegida manda sobre todo lo demás', () => {
        expect(estadoDeCasilla(casilla('2026-09-20'), '2026-09-20', porFecha)).toBe('seleccionada')
    })

    it('verde si el servidor dice que hay hueco', () => {
        expect(estadoDeCasilla(casilla('2026-09-19'), null, porFecha)).toBe('disponible')
    })

    it('tachada si el servidor dice que no queda ninguno', () => {
        expect(estadoDeCasilla(casilla('2026-09-20'), null, porFecha)).toBe('no-disponible')
    })

    it('neutra mientras no se sepa: no se inventa disponibilidad', () => {
        expect(estadoDeCasilla(casilla('2026-09-21'), null, porFecha)).toBe('sin-datos')
        expect(estadoDeCasilla(casilla('2026-09-19', false), null, porFecha)).toBe('sin-datos')
        expect(estadoDeCasilla(casilla('2026-09-19'), null, {})).toBe('sin-datos')
    })
})

describe('reparto a. m. / p. m.', () => {
    const franjas = [
        franja('2026-09-19T09:00:00'),
        franja('2026-09-19T11:45:00'),
        franja('2026-09-19T12:00:00'),
        franja('2026-09-19T17:30:00'),
    ]

    it('separa las dos mitades del día', () => {
        const { am, pm } = repartirPorMeridiano(franjas)
        expect(am.map((f) => f.hora)).toEqual(['09:00', '11:45'])
        expect(pm.map((f) => f.hora)).toEqual(['12:00', '17:30'])
    })

    it('abre en la mitad de la franja ya elegida', () => {
        expect(meridianoInicial(franjas, '2026-09-19T17:30:00')).toBe('pm')
        expect(meridianoInicial(franjas, '2026-09-19T09:00:00')).toBe('am')
    })

    it('sin nada elegido, abre donde queda hueco', () => {
        const soloTarde = [
            franja('2026-09-19T09:00:00', false),
            franja('2026-09-19T16:00:00', true),
        ]
        expect(meridianoInicial(soloTarde, null)).toBe('pm')
    })

    it('si no queda ningún hueco, abre en a. m. y no adivina', () => {
        expect(meridianoInicial([franja('2026-09-19T16:00:00', false)], null)).toBe('am')
        expect(meridianoInicial([], null)).toBe('am')
    })

    it('cuenta los huecos libres', () => {
        expect(contarLibres([franja('2026-09-19T09:00:00'), franja('2026-09-19T10:00:00', false)])).toBe(1)
    })
})
