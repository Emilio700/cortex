import { describe, expect, it } from 'vitest'
import { ESQUEMA, dosisPorId, evaluarCartilla, evaluarDosis, gruposVisibles, inicioTemporada, mesesCumplidos, sumarMeses, type Aplicacion, type Contexto } from './esquema'

const ap = (dosisId: string, fecha: string): Aplicacion => ({ dosisId, vacunaId: dosisPorId(dosisId)?.vacunaId ?? dosisId, fecha })
const ctx = (p: Partial<Contexto>): Contexto => ({ fechaNac: '2024-01-15', sexo: 'F', hoy: '2024-06-20', aplicaciones: [], ...p })
const est = (id: string, c: Contexto) => evaluarDosis(dosisPorId(id)!, c)

describe('fechas', () => {
  it('sumarMeses respeta fin de mes', () => {
    expect(sumarMeses('2024-01-31', 1)).toBe('2024-02-29')
    expect(sumarMeses('2021-06-20', 18)).toBe('2022-12-20')
  })
  it('meses cumplidos', () => {
    expect(mesesCumplidos('2024-01-15', '2024-03-14')).toBe(1)
    expect(mesesCumplidos('2024-01-15', '2024-03-15')).toBe(2)
  })
  it('temporada de influenza', () => {
    expect(inicioTemporada('2026-10-24')).toBe('2026-10-01')
    expect(inicioTemporada('2027-02-10')).toBe('2026-10-01')
    expect(inicioTemporada('2027-07-10')).toBe('2026-10-01')
  })
})

describe('esquema', () => {
  it('ids únicos', () => expect(new Set(ESQUEMA.map((d) => d.id)).size).toBe(ESQUEMA.length))
  it('niña de 5 meses: BCG aplicada, 2 meses atrasada, 4 meses en tolerancia, 6 meses pendiente', () => {
    const c = ctx({ aplicaciones: [ap('bcg-u', '2024-01-15'), ap('hb-1', '2024-01-15')] })
    expect(est('bcg-u', c).estado).toBe('aplicada')
    expect(est('hexa-1', c).estado).toBe('atrasada') // objetivo 2024-03-15
    const c2 = ctx({ hoy: '2024-05-30' })
    expect(est('hexa-2', c2).estado).toBe('pendiente') // objetivo 2024-05-15, 15 días
    expect(est('hexa-2', c2).toca).toBe(true)
    expect(est('hexa-3', c).estado).toBe('pendiente')
    expect(est('hexa-3', c).toca).toBe(false)
  })
  it('rotavirus no aplica después de 8 meses', () => {
    expect(est('rota-1', ctx({ hoy: '2024-10-20' })).estado).toBe('no-aplica')
  })
  it('SRP 2.ª dosis a los 18 meses', () => {
    expect(est('srp-2', ctx({ fechaNac: '2021-06-20', hoy: '2022-12-01' })).estado).toBe('pendiente')
    expect(est('srp-2', ctx({ fechaNac: '2021-06-20', hoy: '2023-03-01' })).estado).toBe('atrasada')
  })
  it('influenza anual: aplicada en la temporada vigente; atrasada después del primer mes', () => {
    const base = { fechaNac: '2022-01-10', hoy: '2026-11-15' }
    expect(est('flu-inf', ctx({ ...base, aplicaciones: [{ dosisId: 'flu-inf', vacunaId: 'flu', fecha: '2026-10-10' }] })).estado).toBe('aplicada')
    expect(est('flu-inf', ctx({ ...base, aplicaciones: [{ dosisId: 'flu-inf', vacunaId: 'flu', fecha: '2025-10-10' }] })).estado).toBe('atrasada')
    expect(est('flu-inf', ctx({ ...base, hoy: '2026-10-15' })).estado).toBe('pendiente')
    expect(est('flu-inf', ctx({ ...base, hoy: '2026-06-15' })).toca).toBe(false)
  })
  it('Td cada 10 años', () => {
    const c = ctx({ fechaNac: '1980-05-01', sexo: 'M', hoy: '2026-10-24', aplicaciones: [{ dosisId: 'td-ado', vacunaId: 'td', fecha: '2020-01-01' }] })
    expect(est('td-ado', c).estado).toBe('aplicada')
    expect(est('td-ado', { ...c, aplicaciones: [{ dosisId: 'td-ado', vacunaId: 'td', fecha: '2010-01-01' }] }).estado).toBe('atrasada')
    expect(est('td-ado', ctx({ fechaNac: '2012-09-18', hoy: '2026-10-24' })).estado).toBe('pendiente')
  })
  it('Tdpa en embarazo desde la semana 20', () => {
    const c = ctx({ fechaNac: '1995-01-27', hoy: '2026-10-24', embarazoFum: '2026-05-23' }) // 22 SDG
    expect(est('tdpa-emb', c).estado).toBe('pendiente')
    expect(est('tdpa-emb', c).toca).toBe(true)
    expect(est('tdpa-emb', { ...c, embarazoFum: '2026-07-01' }).toca).toBe(false)
    expect(est('tdpa-emb', { ...c, embarazoFum: null }).estado).toBe('no-aplica')
    expect(est('tdpa-emb', { ...c, sexo: 'M' }).estado).toBe('no-aplica')
  })
  it('neumocócica 23 a los 65', () => {
    expect(est('neumo23-am', ctx({ fechaNac: '1956-03-01', hoy: '2026-10-24' })).estado).toBe('atrasada')
    expect(est('neumo23-am', ctx({ fechaNac: '1968-03-01', hoy: '2026-10-24' })).estado).toBe('pendiente')
  })
  it('esquema infantil completo sin atrasos a los 5 años (fuera de temporada)', () => {
    const nac = '2021-06-20'
    const apl = ESQUEMA.filter((d) => d.grupo === 'infantil' && (d.regla ?? 'unica') === 'unica').map((d) => ap(d.id, sumarMeses(nac, d.edadMeses)))
    const e = evaluarCartilla(ctx({ fechaNac: nac, hoy: '2026-07-01', aplicaciones: apl }))
    expect(e.filter((x) => x.estado === 'atrasada')).toEqual([])
  })
  it('adulto sin registros: dosis infantiles no cuentan como atrasadas', () => {
    const e = evaluarCartilla(ctx({ fechaNac: '1995-01-27', hoy: '2026-10-24' }))
    expect(e.filter((x) => x.dosis.grupo === 'infantil' && x.estado === 'atrasada')).toEqual([])
    expect(e.find((x) => x.dosis.id === 'td-ado')!.estado).toBe('atrasada')
  })
  it('grupos visibles', () => {
    expect(gruposVisibles('2021-06-20', '2026-10-24', 'F', false)).toEqual(['infantil', 'adulto'])
    expect(gruposVisibles('1995-01-27', '2026-10-24', 'F', true)).toContain('embarazo')
    expect(gruposVisibles('1956-01-27', '2026-10-24', 'M', false)).toContain('adulto-mayor')
  })
})
