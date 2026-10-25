import { describe, expect, it } from 'vitest'
import { bandera, extraer, normaliza } from './parser'
import { FILAS_EJEMPLO } from './ejemplo'

const uno = (linea: string) => {
  const r = extraer(linea)
  expect(r).toHaveLength(1)
  return r[0]
}

describe('extraer() con el reporte de ejemplo', () => {
  const texto = FILAS_EJEMPLO.map((f) => f.join('   ')).join('\n')
  const res = extraer(texto)

  it('reconoce los 16 analitos del ejemplo', () => {
    expect(res.map((r) => r.analito.id)).toEqual([
      'glucosa', 'hba1c', 'colesterol', 'hdl', 'ldl', 'trigliceridos', 'creatinina', 'urea',
      'acido-urico', 'hemoglobina', 'leucocitos', 'plaquetas', 'tsh', 'alt', 'sodio', 'potasio',
    ])
  })
  it.each(FILAS_EJEMPLO.map((f, i) => [f[0], i, Number(f[1])] as const))('%s: valor %#', (_n, i, v) => {
    expect(res[i].valor).toBe(v)
    expect(res[i].incluir).toBe(true)
  })
  it('unidades normalizadas', () => {
    const u = Object.fromEntries(res.map((r) => [r.analito.id, r.unidad]))
    expect(u).toMatchObject({ glucosa: 'mg/dL', hba1c: '%', hemoglobina: 'g/dL', leucocitos: '10³/µL', plaquetas: '10³/µL', tsh: 'µUI/mL', alt: 'U/L', sodio: 'mEq/L' })
  })
  it('rangos del reporte: "a - b", "< x" y "> x"', () => {
    const g = res.find((r) => r.analito.id === 'glucosa')!
    expect([g.refBaja, g.refAlta, g.refTexto]).toEqual([70, 100, true])
    const col = res.find((r) => r.analito.id === 'colesterol')!
    expect([col.refBaja, col.refAlta]).toEqual([null, 200])
    const hdl = res.find((r) => r.analito.id === 'hdl')!
    expect([hdl.refBaja, hdl.refAlta]).toEqual([40, null])
  })
  it('banderas alto/normal', () => {
    const b = Object.fromEntries(res.map((r) => [r.analito.id, bandera(r)]))
    expect(b).toMatchObject({ glucosa: 'alto', hba1c: 'alto', colesterol: 'alto', hdl: 'normal', creatinina: 'normal', 'acido-urico': 'alto', alt: 'alto', potasio: 'normal' })
  })
})

describe('extraer() casos de OCR real', () => {
  it('etiqueta con dos puntos y rango entre paréntesis', () => {
    expect(uno('Glucosa en ayuno: 95 mg/dl (70-100)')).toMatchObject({ valor: 95, refBaja: 70, refAlta: 100 })
  })
  it('rango con "a"', () => {
    expect(uno('Glucosa 126 mg/dL 70 a 100')).toMatchObject({ valor: 126, refBaja: 70, refAlta: 100 })
  })
  it('coma decimal', () => {
    expect(uno('TSH 0,85 uUI/mL 0,4 - 4,0')).toMatchObject({ valor: 0.85, refBaja: 0.4, refAlta: 4, unidad: 'µUI/mL' })
  })
  it('recuentos absolutos se pasan a 10³/µL', () => {
    expect(uno('Leucocitos 7,500 /mm3 4,500 - 11,000')).toMatchObject({ valor: 7.5, unidad: '10³/µL', refBaja: 4.5, refAlta: 11 })
    expect(uno('Plaquetas 250000 /uL 150000-450000')).toMatchObject({ valor: 250, unidad: '10³/µL', refBaja: 150, refAlta: 450 })
  })
  it('confusiones típicas del OCR: O→0, l→1, 0→o en palabras', () => {
    expect(uno('Creatinina O.9 mg/dL').valor).toBe(0.9)
    expect(uno('Hemoglobina l3.5 g/dL').valor).toBe(13.5)
    expect(uno('GLUC0SA 110 mg/dL').analito.id).toBe('glucosa')
  })
  it('rango sin punto decimal se corrige y se marca para verificar', () => {
    const r = uno('Potasio 4.2 mEq/L 35 - 51')
    expect([r.refBaja, r.refAlta]).toEqual([3.5, 5.1])
    expect(r.verificar).toMatch(/punto decimal/)
  })
  it('rango invertido se marca como incoherente', () => {
    expect(uno('Hemoglobina 13.5 g/dL 17.5 - 12.0').verificar).toMatch(/incoherente/)
  })
  it('"hasta" y "mayor de"', () => {
    expect(uno('Acido urico 5.1 mg/dl hasta 7')).toMatchObject({ refBaja: null, refAlta: 7 })
    expect(uno('HDL 55 mg/dL mayor de 40')).toMatchObject({ refBaja: 40, refAlta: null })
  })
  it('sin rango usa el de referencia del adulto', () => {
    expect(uno('Hb 14 g/dl')).toMatchObject({ valor: 14, refBaja: 12, refAlta: 17.5, refTexto: false })
  })
  it('etiqueta y valor en renglones distintos', () => {
    expect(extraer('Sodio\n138 mEq/L').map((r) => [r.analito.id, r.valor])).toEqual([['sodio', 138]])
  })
  it('duplicados: solo el primero queda incluido', () => {
    const r = extraer('Glucosa 90 mg/dL\nGlucosa 92 mg/dL')
    expect(r.map((x) => x.incluir)).toEqual([true, false])
  })
  it('descarta valores fuera de lo plausible y líneas sin analito', () => {
    expect(extraer('Glucosa 1500 mg/dl')).toEqual([])
    expect(extraer('Fecha 15/09/2026')).toEqual([])
    expect(extraer('')).toEqual([])
  })
  it('reconoce "K 4.0 mEq/L" como potasio', () => {
    const r = extraer('K 4.0 mEq/L')
    expect(r).toHaveLength(1)
    expect(r[0].analito.codigo).toBe('potasio')
    expect(r[0].valor).toBe(4)
  })
})

describe('normaliza()', () => {
  it('quita acentos, minúsculas, µ→u y separadores |', () => {
    expect(normaliza('Ácido Úrico  |  5.1 mg/dL')).toBe('acido urico 5.1 mg/dl')
    expect(normaliza('10.0 µUI/mL')).toBe('10.0 uui/ml')
  })
  it('corrige 0→o dentro de palabras', () => {
    expect(normaliza('HEM0GL0BINA')).toBe('hemoglobina')
  })
})
