import { describe, expect, it } from 'vitest'
import type { Registro } from '../../lib/types'
import { CATALOGO, PAQUETES, buscarEstudios, catalogoCompleto } from './catalogo'
import { alertaOrden, ayunoMaximo, datosOrden, estadoOrden, estadoRegistro, type EstadoOrden, preparacionCombinada, siguienteEstado, tituloOrden } from './ordenes'

const day = 86_400_000
const now = Date.parse('2026-10-20T12:00:00Z')
const orden = (fase: string, diasAtras: number, extra: Record<string, unknown> = {}): Registro => ({
  id: 'o',
  tipo: 'orden',
  fecha: new Date(now - diasAtras * day).toISOString(),
  estado: estadoRegistro(fase as EstadoOrden),
  datos: { folio: 'OR-000001', items: [], urgencia: 'ordinaria', historial: [], fase, ...extra },
})

describe('catálogo', () => {
  it('ids únicos y paquetes válidos', () => {
    const ids = CATALOGO.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CATALOGO.length).toBeGreaterThanOrEqual(120)
    for (const p of PAQUETES) for (const id of p.ids) expect(ids).toContain(id)
  })
  it('códigos LOINC con formato válido (número-dígito verificador)', () => {
    for (const e of CATALOGO) if (e.loinc) expect(e.loinc).toMatch(/^\d{1,6}-\d$/)
  })
  it('LOINC: dígito verificador mod 10 correcto', () => {
    // Algoritmo de LOINC (Mod 10): duplicar dígitos alternos desde la derecha
    const ok = (code: string) => {
      const [num, chk] = code.split('-')
      const digits = num.split('').reverse().map(Number)
      let s = 0
      digits.forEach((d, i) => {
        if (i % 2 === 0) {
          const x = d * 2
          s += x > 9 ? x - 9 : x
        } else s += d
      })
      return (10 - (s % 10)) % 10 === Number(chk)
    }
    for (const e of CATALOGO) if (e.loinc) expect(ok(e.loinc), `${e.nombre} ${e.loinc}`).toBe(true)
  })
  it('búsqueda insensible a acentos', () => {
    expect(buscarEstudios(CATALOGO, 'tórax').some((e) => e.id === 'rxtorax')).toBe(true)
    expect(buscarEstudios(CATALOGO, 'hemoglobina glucosilada')[0].id).toBe('a1c')
    expect(buscarEstudios(CATALOGO, '4548-4')[0].id).toBe('a1c')
  })
  it('estudios de la clínica se agregan o sobrescriben', () => {
    const c = catalogoCompleto([{ id: 'x1', nombre: 'Panel alergias', grupo: 'Clínica', tipo: 'laboratorio' }])
    expect(c.find((e) => e.id === 'x1')?.personalizado).toBe(true)
  })
})

describe('flujo de órdenes', () => {
  it('siguiente estado', () => {
    expect(siguienteEstado('pendiente')).toBe('muestra')
    expect(siguienteEstado('resultado')).toBe('revisado')
    expect(siguienteEstado('revisado')).toBeNull()
    expect(siguienteEstado('cancelada')).toBeNull()
  })
  it('alerta por retraso según umbral y urgencia', () => {
    expect(alertaOrden(orden('pendiente', 3), now, 7)).toBeNull()
    expect(alertaOrden(orden('pendiente', 8), now, 7)).toMatch(/8 días/)
    expect(alertaOrden(orden('muestra', 2, { urgencia: 'urgente' }), now, 7)).toMatch(/2 días/)
    expect(alertaOrden(orden('revisado', 30), now, 7)).toBeNull()
    expect(alertaOrden(orden('resultado', 10, { historial: [{ estado: 'resultado', fecha: new Date(now - 3 * day).toISOString() }] }), now, 7)).toMatch(/sin revisar/)
  })
  it('el registro queda en estado pendiente mientras está abierta', () => {
    expect(orden('resultado', 1).estado).toBe('pendiente')
    expect(estadoOrden(orden('resultado', 1))).toBe('resultado')
    expect(estadoOrden(orden('revisado', 1))).toBe('revisado')
    expect(estadoRegistro('cancelada')).toBe('cancelada')
  })
  it('datosOrden tolera datos incompletos', () => {
    const d = datosOrden({ id: 'x', tipo: 'orden', fecha: '', datos: { resultadoDocId: 'd1' } })
    expect(d.items).toEqual([])
    expect(d.resultadoDocIds).toEqual(['d1'])
  })
})

describe('preparación', () => {
  const it2 = (nombre: string, preparacion?: string) => ({ id: nombre, nombre, tipo: 'laboratorio' as const, preparacion })
  it('agrupa instrucciones repetidas y quita "no requiere ayuno" si otro lo pide', () => {
    const r = preparacionCombinada([it2('BH', 'No requiere ayuno.'), it2('Glucosa', 'Ayuno de 8 horas (puede tomar agua natural).'), it2('Urea', 'Ayuno de 8 horas (puede tomar agua natural).')])
    expect(r).toHaveLength(1)
    expect(r[0].estudios).toEqual(['Glucosa', 'Urea'])
  })
  it('ayuno máximo', () => {
    expect(ayunoMaximo([it2('a', 'Ayuno de 8 horas.'), it2('b', 'Ayuno de 9 a 12 horas (solo agua).')])).toBe(12)
    expect(ayunoMaximo([it2('a', 'No requiere ayuno.')])).toBe(0)
  })
  it('título', () => {
    expect(tituloOrden('OR-000002', [{ nombre: 'BH' }, { nombre: 'QS (6)' }, { nombre: 'EGO' }, { nombre: 'Rx' }])).toBe('Orden OR-000002: BH, QS, EGO y 1 más')
  })
})
