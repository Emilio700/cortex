import { describe, expect, it } from 'vitest'

import {
  accionPrincipal,
  atajosDePeriodo,
  bloqueDeFecha,
  filtrosAURL,
  filtrosDesdeURL,
  horaDeCita,
  tonoDeAvatar,
} from './misConsultas'

const HOY = '2026-10-09' // viernes

describe('Mis Consultas: reglas (plan 32, punto 4)', () => {
  it('el periodo por omisión es «Últimos 30 días y próximas»', () => {
    const f = filtrosDesdeURL(new URLSearchParams(), HOY)
    expect(f.periodo).toBe('reciente')
    expect(f.desde).toBe('2026-09-09')
    expect(f.hasta).toBe('')
    expect(f.pagina).toBe(1)
    expect(f.porPagina).toBe(25)
  })

  it('los atajos usan el día del consultorio; la semana va de lunes a domingo', () => {
    const porClave = Object.fromEntries(atajosDePeriodo(HOY).map((a) => [a.clave, a]))
    expect(porClave.manana).toMatchObject({ desde: '2026-10-10', hasta: '2026-10-10' })
    expect(porClave.semana).toMatchObject({ desde: '2026-10-05', hasta: '2026-10-11' })
    expect(porClave.proximos30).toMatchObject({ desde: HOY, hasta: '2026-11-08' })
    expect(porClave.todo).toMatchObject({ desde: '', hasta: '' })
  })

  it('filtros y página viajan por la URL y vuelven iguales', () => {
    const f = {
      ...filtrosDesdeURL(new URLSearchParams(), HOY),
      periodo: 'rango' as const,
      desde: '2026-01-01',
      hasta: '2026-02-01',
      q: 'ana',
      estado: 'atendida',
      orden: 'asc' as const,
      pagina: 3,
      porPagina: 50,
    }
    const url = filtrosAURL(f)
    expect(filtrosDesdeURL(url, HOY)).toEqual(f)
    // Lo de omisión no ensucia la URL.
    expect(filtrosAURL(filtrosDesdeURL(new URLSearchParams(), HOY)).toString()).toBe('')
  })

  it('una URL con basura cae en lo de omisión', () => {
    const f = filtrosDesdeURL(new URLSearchParams('periodo=x&pagina=-2&por=7&orden=zz&vista=raro'), HOY)
    expect(f).toMatchObject({ periodo: 'reciente', pagina: 1, porPagina: 25, orden: 'fecha', vista: 'lista' })
  })

  it.each([
    ['atendida', '2026-10-01T10:00:00', 'Ver consulta', false],
    ['en_consulta', '2026-10-09T10:00:00', 'Continuar consulta', true],
    ['confirmada', '2026-10-09T10:00:00', 'Iniciar consulta', true],
    ['en_sala', '2026-10-09T10:00:00', 'Iniciar consulta', true],
    // De otro día no se «inicia»: abrirla no la pasa a en consulta (plan 28).
    ['agendada', '2026-10-12T10:00:00', 'Ver detalles', false],
    ['cancelada', '2026-10-09T10:00:00', 'Ver detalles', false],
  ])('acción principal de %s', (status, scheduled_at, etiqueta, solida) => {
    expect(accionPrincipal({ status, scheduled_at } as never, HOY)).toMatchObject({ etiqueta, solida })
  })

  it('bloque de fecha y hora sin pasar por la zona del navegador', () => {
    expect(bloqueDeFecha('2026-09-27T09:00:00')).toEqual({ dia: 'DOM', numero: '27', mes: 'SEP' })
    expect(horaDeCita('2026-09-27T09:00:00')).toBe('09:00 a.m.')
    expect(horaDeCita('2026-09-27T13:30:00')).toBe('01:30 p.m.')
    expect(horaDeCita('2026-09-27T00:15:00')).toBe('12:15 a.m.')
  })

  it('el color del avatar es estable por paciente', () => {
    expect(tonoDeAvatar(7)).toBe(tonoDeAvatar(7))
    expect(tonoDeAvatar(1)).not.toBe(tonoDeAvatar(2))
  })
})
