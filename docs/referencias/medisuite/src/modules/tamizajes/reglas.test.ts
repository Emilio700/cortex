// npx vitest run src/modules/tamizajes
import { describe, expect, it } from 'vitest'
import { REGLAS, edadAnios, evaluar, evaluarRegla, intervaloTexto, sumarMeses, tabaquismo, type CtxPaciente } from './reglas'

const NOW = Date.parse('2026-10-24T12:00:00Z')
const DAY = 86_400_000
const hace = (dias: number) => new Date(NOW - dias * DAY).toISOString()
const regla = (id: string) => REGLAS.find((r) => r.id === id)!
const ctx = (p: Partial<CtxPaciente>): CtxPaciente => ({ sexo: 'F', fechaNac: '1968-03-14', observations: [], registros: [], documentos: [], ...p })
const manual = (reglaId: string, dias: number, extra: Record<string, unknown> = {}) => ({ tipo: 'tamizaje', fecha: hace(dias), datos: { regla: reglaId, resultado: 'normal', ...extra } })

describe('utilidades', () => {
  it('edad en años', () => {
    expect(Math.floor(edadAnios('1968-03-14', NOW))).toBe(58)
    expect(Math.floor(edadAnios('2021-06-20', NOW))).toBe(5)
  })
  it('suma meses respetando fin de mes', () => {
    expect(sumarMeses('2024-01-31T12:00:00.000Z', 1).slice(0, 10)).toBe('2024-02-29')
    expect(sumarMeses('2023-10-24T12:00:00.000Z', 24).slice(0, 10)).toBe('2025-10-24')
  })
  it('tabaquismo con negaciones', () => {
    expect(tabaquismo(ctx({ antecedentes: 'Cardiopatía isquémica. Exfumador.' }))).toBe(true)
    expect(tabaquismo(ctx({ antecedentes: 'Niega tabaquismo' }))).toBe(false)
    expect(tabaquismo(ctx({ antecedentes: '' }))).toBe(false)
  })
})

describe('mastografía (NOM-041: 40–69 años cada 2 años)', () => {
  const r = regla('mama-mastografia')
  it('mastografía hace 3 años → vencida', () => {
    const res = evaluarRegla(r, ctx({ registros: [manual('mama-mastografia', 3 * 365)] }), NOW)
    expect(res.estado).toBe('vencido')
  })
  it('hace 1 año → al día, próxima en 2 años desde la fecha', () => {
    const res = evaluarRegla(r, ctx({ registros: [manual('mama-mastografia', 365)] }), NOW)
    expect(res.estado).toBe('al-dia')
    expect(res.proxima?.slice(0, 10)).toBe(sumarMeses(hace(365), 24).slice(0, 10))
  })
  it('hace 23 meses → próxima (≤ 60 días)', () => {
    expect(evaluarRegla(r, ctx({ registros: [manual('mama-mastografia', 700)] }), NOW).estado).toBe('proximo')
  })
  it('sin registro → vencido', () => {
    expect(evaluarRegla(r, ctx({}), NOW).motivo).toBe('Sin registro')
  })
  it('no aplica en hombres ni a los 39 o 70 años', () => {
    expect(evaluarRegla(r, ctx({ sexo: 'M' }), NOW).estado).toBe('no-aplica')
    expect(evaluarRegla(r, ctx({ fechaNac: '1987-01-01' }), NOW).estado).toBe('no-aplica')
    expect(evaluarRegla(r, ctx({ fechaNac: '1956-01-01' }), NOW).estado).toBe('no-aplica')
    expect(evaluarRegla(r, ctx({ fechaNac: '1957-01-01' }), NOW).estado).not.toBe('no-aplica') // 69 años
  })
  it('detecta un documento de mastografía', () => {
    const res = evaluarRegla(r, ctx({ documentos: [{ nombre: 'Mastografía bilateral BI-RADS 1', fecha: hace(100) }] }), NOW)
    expect(res.estado).toBe('al-dia')
  })
  it('registro manual «no aplica» (p. ej. mastectomía)', () => {
    const res = evaluarRegla(r, ctx({ registros: [manual('mama-mastografia', 10, { noAplica: 'Mastectomía bilateral' })] }), NOW)
    expect(res.estado).toBe('no-aplica')
    expect(res.motivo).toBe('Mastectomía bilateral')
  })
})

describe('intervalo según la prueba', () => {
  it('cervicouterino: VPH hace 4 años → al día (5 años); citología hace 4 años → vencida (3 años)', () => {
    const r = regla('cacu')
    expect(evaluarRegla(r, ctx({ registros: [manual('cacu', 4 * 365, { prueba: 'vph' })] }), NOW).estado).toBe('al-dia')
    expect(evaluarRegla(r, ctx({ registros: [manual('cacu', 4 * 365, { prueba: 'citologia' })] }), NOW).estado).toBe('vencido')
  })
  it('colorrectal: colonoscopía hace 4 años → al día (10 años)', () => {
    const r = regla('colorrectal')
    expect(evaluarRegla(r, ctx({ sexo: 'M', fechaNac: '1955-11-02', registros: [manual('colorrectal', 4 * 365, { prueba: 'colonoscopia' })] }), NOW).estado).toBe('al-dia')
  })
  it('texto del intervalo', () => {
    expect(intervaloTexto(regla('mama-mastografia'))).toBe('cada 2 años')
    expect(intervaloTexto(regla('vih'))).toBe('una vez')
  })
})

describe('evidencia del expediente', () => {
  it('glucosa en los últimos 3 años → diabetes al día', () => {
    const res = evaluarRegla(regla('diabetes'), ctx({ sexo: 'M', observations: [{ codigo: 'glucosa', fecha: hace(400), valor: 98 }] }), NOW)
    expect(res.estado).toBe('al-dia')
  })
  it('glucosa hace 4 años → vencido', () => {
    expect(evaluarRegla(regla('diabetes'), ctx({ observations: [{ codigo: 'glucosa', fecha: hace(4 * 365), valor: 98 }] }), NOW).estado).toBe('vencido')
  })
  it('diabetes diagnosticada → no aplica tamizaje', () => {
    expect(evaluarRegla(regla('diabetes'), ctx({ antecedentes: 'Diabetes mellitus tipo 2 (2015)' }), NOW).estado).toBe('no-aplica')
  })
  it('PHQ-9 reciente → depresión al día', () => {
    expect(evaluarRegla(regla('depresion'), ctx({ observations: [{ codigo: 'escala', etiqueta: 'PHQ-9', fecha: hace(30), valor: 5 }] }), NOW).estado).toBe('al-dia')
  })
  it('registro de agudeza visual → visión escolar al día (14 años)', () => {
    const c = ctx({ sexo: 'M', fechaNac: '2012-09-18', registros: [{ tipo: 'agudeza-visual', fecha: hace(10), datos: { resultados: [] } }] })
    expect(evaluarRegla(regla('vision-escolar'), c, NOW).estado).toBe('al-dia')
  })
  it('una rejilla de Amsler no cuenta como agudeza visual', () => {
    const c = ctx({ sexo: 'M', fechaNac: '2012-09-18', registros: [{ tipo: 'agudeza-visual', fecha: hace(10), datos: { amsler: {} } }] })
    expect(evaluarRegla(regla('vision-escolar'), c, NOW).estado).toBe('vencido')
  })
  it('AAA: solo hombres 65–75 con tabaquismo', () => {
    const base = { sexo: 'M' as const, fechaNac: '1955-11-02' }
    expect(evaluarRegla(regla('aaa'), ctx({ ...base, antecedentes: 'Exfumador' }), NOW).estado).toBe('vencido')
    expect(evaluarRegla(regla('aaa'), ctx({ ...base, antecedentes: '' }), NOW).estado).toBe('no-aplica')
  })
  it('ignora evidencias con fecha futura', () => {
    expect(evaluarRegla(regla('vih'), ctx({ registros: [manual('vih', -30)] }), NOW).estado).toBe('vencido')
  })
})

describe('evaluación completa', () => {
  it('niña de 5 años: no aplican tamizajes de adulto', () => {
    const res = evaluar(ctx({ fechaNac: '2021-06-20' }), NOW)
    const aplican = res.filter((r) => r.estado !== 'no-aplica').map((r) => r.regla.id)
    expect(aplican).toContain('vision-preescolar')
    expect(aplican).toContain('audicion-escolar')
    expect(aplican).not.toContain('mama-mastografia')
    expect(aplican).not.toContain('diabetes')
  })
  it('todas las reglas tienen fuente', () => {
    for (const r of REGLAS) expect(r.fuente.length).toBeGreaterThan(10)
  })
})
