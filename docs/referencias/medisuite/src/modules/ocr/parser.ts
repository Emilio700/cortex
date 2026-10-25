// Extrae analitos de texto OCR de un reporte de laboratorio (español, tolerante a errores de OCR).

export interface Analito {
  id: string
  label: string
  codigo: string // código de Observation (usa los de OBS_LABELS cuando existen)
  unidad: string
  sinonimos: string[]
  ref: [number | null, number | null] // rango de referencia por defecto (adulto)
  plausible: [number, number]
}

export const ANALITOS: Analito[] = [
  { id: 'glucosa', label: 'Glucosa', codigo: 'glucosa', unidad: 'mg/dL', sinonimos: ['glucosa', 'glucosa en ayuno', 'glucosa serica', 'glicemia', 'glucemia', 'glu'], ref: [70, 100], plausible: [20, 900] },
  { id: 'hba1c', label: 'HbA1c', codigo: 'hba1c', unidad: '%', sinonimos: ['hemoglobina glucosilada', 'hemoglobina glicosilada', 'hemoglobina glicada', 'hb glucosilada', 'hba1c', 'a1c'], ref: [4, 5.6], plausible: [3, 20] },
  { id: 'colesterol', label: 'Colesterol total', codigo: 'colesterol', unidad: 'mg/dL', sinonimos: ['colesterol total', 'colesterol'], ref: [null, 200], plausible: [50, 600] },
  { id: 'hdl', label: 'HDL', codigo: 'hdl', unidad: 'mg/dL', sinonimos: ['colesterol hdl', 'hdl colesterol', 'c hdl', 'hdl'], ref: [40, null], plausible: [5, 150] },
  { id: 'ldl', label: 'LDL', codigo: 'ldl', unidad: 'mg/dL', sinonimos: ['colesterol ldl', 'ldl colesterol', 'c ldl', 'ldl'], ref: [null, 100], plausible: [10, 400] },
  { id: 'trigliceridos', label: 'Triglicéridos', codigo: 'trigliceridos', unidad: 'mg/dL', sinonimos: ['trigliceridos', 'trigliceridos sericos', 'tg'], ref: [null, 150], plausible: [20, 3000] },
  { id: 'creatinina', label: 'Creatinina', codigo: 'creatinina', unidad: 'mg/dL', sinonimos: ['creatinina', 'creatinina serica'], ref: [0.6, 1.2], plausible: [0.1, 20] },
  { id: 'urea', label: 'Urea', codigo: 'urea', unidad: 'mg/dL', sinonimos: ['urea', 'urea serica'], ref: [15, 45], plausible: [2, 400] },
  { id: 'bun', label: 'BUN (nitrógeno ureico)', codigo: 'bun', unidad: 'mg/dL', sinonimos: ['nitrogeno ureico', 'nitrogeno de urea', 'bun'], ref: [7, 20], plausible: [1, 200] },
  { id: 'acido-urico', label: 'Ácido úrico', codigo: 'acido-urico', unidad: 'mg/dL', sinonimos: ['acido urico', 'ac urico', 'ac. urico'], ref: [2.4, 7], plausible: [0.5, 20] },
  { id: 'hemoglobina', label: 'Hemoglobina', codigo: 'hemoglobina', unidad: 'g/dL', sinonimos: ['hemoglobina', 'hb', 'hgb'], ref: [12, 17.5], plausible: [3, 25] },
  { id: 'hematocrito', label: 'Hematocrito', codigo: 'hematocrito', unidad: '%', sinonimos: ['hematocrito', 'hto', 'hct'], ref: [36, 52], plausible: [10, 75] },
  { id: 'leucocitos', label: 'Leucocitos', codigo: 'leucocitos', unidad: '10³/µL', sinonimos: ['leucocitos', 'leucocitos totales', 'globulos blancos', 'wbc'], ref: [4.5, 11], plausible: [0.5, 100] },
  { id: 'plaquetas', label: 'Plaquetas', codigo: 'plaquetas', unidad: '10³/µL', sinonimos: ['plaquetas', 'recuento de plaquetas', 'plt'], ref: [150, 450], plausible: [5, 2000] },
  { id: 'tsh', label: 'TSH', codigo: 'tsh', unidad: 'µUI/mL', sinonimos: ['tsh', 'tirotropina', 'hormona estimulante de tiroides', 'hormona estimulante de la tiroides'], ref: [0.4, 4], plausible: [0.005, 150] },
  { id: 'alt', label: 'ALT (TGP)', codigo: 'alt', unidad: 'U/L', sinonimos: ['alanino aminotransferasa', 'alanina aminotransferasa', 'tgp', 'alt', 'tgp alt', 'alt tgp'], ref: [7, 40], plausible: [1, 5000] },
  { id: 'ast', label: 'AST (TGO)', codigo: 'ast', unidad: 'U/L', sinonimos: ['aspartato aminotransferasa', 'tgo', 'ast', 'tgo ast', 'ast tgo'], ref: [8, 40], plausible: [1, 5000] },
  { id: 'sodio', label: 'Sodio', codigo: 'sodio', unidad: 'mEq/L', sinonimos: ['sodio', 'sodio serico', 'na'], ref: [135, 145], plausible: [100, 180] },
  { id: 'potasio', label: 'Potasio', codigo: 'potasio', unidad: 'mEq/L', sinonimos: ['potasio', 'potasio serico', 'k'], ref: [3.5, 5.1], plausible: [1.5, 9] },
]

export interface Resultado {
  key: string
  analito: Analito
  valor: number
  unidad: string
  refBaja: number | null
  refAlta: number | null
  refTexto: boolean // true si el rango vino del reporte
  linea: string
  incluir: boolean
  verificar?: string // motivo para revisar con cuidado (posible error de OCR)
}

export function bandera(r: Pick<Resultado, 'valor' | 'refBaja' | 'refAlta'>): 'alto' | 'bajo' | 'normal' {
  if (r.refAlta != null && r.valor > r.refAlta) return 'alto'
  if (r.refBaja != null && r.valor < r.refBaja) return 'bajo'
  return 'normal'
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Corrige confusiones típicas del OCR dentro de palabras (0→o, 1→l, 5→s) y en números (O→0, l→1).
function normalizaPalabra(w: string) {
  const letras = w.replace(/[^a-z]/g, '').length
  if (/^[a-z0-9]+$/.test(w) && /\d/.test(w) && !/^\d/.test(w) && letras > w.length - letras) return w.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's')
  return w
}

export function normaliza(s: string) {
  let t = sinAcentos(s).toLowerCase().replace(/µ|μ/g, 'u').replace(/[|_]/g, ' ')
  t = t.replace(/(?<=\d[.,]?)[o](?=[\s.,\d%]|$)|(?<=^|\s|[<>])[o](?=[.,]?\d)/g, '0')
  t = t.replace(/(?<=\d)[il](?=\d)|(?<=^|\s)[il](?=\d{1,3}[.,]?\d*\s)/g, '1')
  return t
    .split(/\s+/)
    .map(normalizaPalabra)
    .join(' ')
    .replace(/[^a-z0-9.,%<>\-–/^³+\s()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function lev(a: string, b: string) {
  const m = a.length, n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

const SIN_NORM = ANALITOS.map((a) => ({ a, sins: a.sinonimos.map((s) => normaliza(s).replace(/[().]/g, '')) }))

// Busca el analito cuyo sinónimo coincide con la etiqueta (exacto por palabras o difuso). Gana el más largo.
function buscaAnalito(etiqueta: string): Analito | null {
  const words = etiqueta.replace(/[().,:\-–/]/g, ' ').split(/\s+/).filter(Boolean)
  const joined = ' ' + words.join(' ') + ' '
  let best: { a: Analito; score: number } | null = null
  for (const { a, sins } of SIN_NORM) {
    for (const s of sins) {
      const exacto = joined.includes(' ' + s + ' ')
      let ok = exacto
      if (!ok && s.length >= 5) {
        const k = s.split(' ').length
        for (let i = 0; i + k <= words.length && !ok; i++) {
          const w = words.slice(i, i + k).join(' ')
          ok = lev(w, s) <= Math.floor(s.length * 0.2)
        }
      }
      const score = s.length + (exacto ? 100 : 0)
      if (ok && (!best || score > best.score)) best = { a, score }
    }
  }
  return best?.a ?? null
}

const UNIDADES: [RegExp, string][] = [
  [/x?\s?10\s?(\^|e)?\s?(3|³)\s?\/\s?(ul|mm3|mm³)|mil\s?\/\s?(ul|mm3)|k\s?\/\s?ul/, '10³/µL'],
  [/x?\s?10\s?(\^|e)?\s?(6|⁶)\s?\/\s?(ul|mm3)/, '10⁶/µL'],
  [/\/\s?(mm3|mm³|ul)\b/, '/µL'],
  [/mg\s?\/\s?d[li1]/, 'mg/dL'],
  [/g\s?\/\s?d[li1]/, 'g/dL'],
  [/mmol\s?\/\s?[li1]/, 'mmol/L'],
  [/meq\s?\/\s?[li1]/, 'mEq/L'],
  [/(uui|uiu|miu|mui)\s?\/\s?m[li1]|(uui|miu|mui)\s?\/\s?[li1]/, 'µUI/mL'],
  [/u[i]?\s?\/\s?[li1]\b/, 'U/L'],
  [/mg\s?\/\s?[li1]\b/, 'mg/L'],
  [/%/, '%'],
]

const NUM = String.raw`\d+(?:[.,]\d+)?`

function num(s: string) {
  return parseFloat(s.replace(',', '.'))
}

function parseLinea(raw: string): Omit<Resultado, 'key' | 'incluir'> | null {
  const t = normaliza(raw)
  const m = t.match(/(?<=\s|^)[<>]?\s?\d/)
  if (!m || m.index === undefined) return null
  const etiqueta = t.slice(0, m.index)
  // etiquetas de una sola letra solo se aceptan si son un símbolo químico conocido (K = potasio)
  if (etiqueta.replace(/[^a-z]/g, '').length < 2 && etiqueta.trim() !== 'k') return null
  const a = buscaAnalito(etiqueta)
  if (!a) return null
  let resto = ' ' + t.slice(m.index) + ' '

  let unidad = ''
  for (const [re, u] of UNIDADES) {
    const um = resto.match(re)
    if (um) {
      unidad = u
      resto = resto.replace(re, ' ')
      break
    }
  }
  // Rango: "70 - 100", "70 a 100", "< 200", "> 40", "hasta 200"
  let refBaja: number | null = null, refAlta: number | null = null, refTexto = false
  const rr = resto.match(new RegExp(String.raw`(${NUM})\s*(?:-|–|a)\s*(${NUM})`))
  if (rr && rr.index !== undefined) {
    // si el primer número de la línea forma parte del rango, el valor está antes o no hay valor
    const antes = resto.slice(0, rr.index)
    if (new RegExp(NUM).test(antes)) {
      refBaja = num(rr[1]); refAlta = num(rr[2]); refTexto = true
      resto = antes + ' ' + resto.slice(rr.index + rr[0].length)
    }
  }
  if (!refTexto) {
    const lt = resto.match(new RegExp(String.raw`(?:<|menor a|menor de|hasta)\s*=?\s*(${NUM})`))
    const gt = resto.match(new RegExp(String.raw`(?:>|mayor a|mayor de)\s*=?\s*(${NUM})`))
    if (lt && lt.index! > 0) { refAlta = num(lt[1]); refTexto = true; resto = resto.replace(lt[0], ' ') }
    if (gt && gt.index! > 0) { refBaja = num(gt[1]); refTexto = true; resto = resto.replace(gt[0], ' ') }
  }
  const vm = resto.match(new RegExp(NUM))
  if (!vm) return null
  let valor = num(vm[0])
  // miles con coma (7,500 /mm3) o recuentos absolutos → 10³/µL
  if (/[.,]\d{3}$/.test(vm[0]) && valor < a.plausible[0]) valor = parseFloat(vm[0].replace(/[.,]/, ''))
  if (valor > a.plausible[1] && valor / 1000 >= a.plausible[0] && valor / 1000 <= a.plausible[1]) {
    valor = valor / 1000
    if (refBaja != null && refBaja > a.plausible[1]) refBaja /= 1000
    if (refAlta != null && refAlta > a.plausible[1]) refAlta /= 1000
    unidad = a.unidad
  }
  if (valor < a.plausible[0] || valor > a.plausible[1]) return null
  if (unidad === '/µL' && a.unidad === '10³/µL') unidad = a.unidad
  if (!refTexto) [refBaja, refAlta] = a.ref
  let verificar: string | undefined
  // Rango leído sin punto decimal (35-51 en vez de 3.5-5.1): se corrige comparando con el rango típico
  const cerca = (x: number | null, y: number | null) => x != null && y != null && y > 0 && x / y > 0.5 && x / y < 2
  if (refTexto && cerca((refBaja ?? 0) / 10, a.ref[0]) && cerca((refAlta ?? 0) / 10, a.ref[1]) && !cerca(refBaja, a.ref[0])) {
    refBaja = refBaja! / 10
    refAlta = refAlta! / 10
    verificar = 'Rango corregido: posible punto decimal perdido'
  }
  if (refBaja != null && refAlta != null && refBaja > refAlta) verificar = 'Rango de referencia incoherente'
  if ((refAlta != null && valor > refAlta * 4) || (refBaja != null && valor < refBaja / 4)) verificar = 'Muy fuera de rango: confirma el punto decimal'
  return { analito: a, valor, unidad: unidad || a.unidad, refBaja, refAlta, refTexto, linea: raw.trim(), verificar }
}

export function extraer(texto: string): Resultado[] {
  const out: Resultado[] = []
  const vistos = new Set<string>()
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim())
  lineas.forEach((l, i) => {
    let r = parseLinea(l)
    // etiqueta y valor en renglones distintos (OCR por columnas)
    if (!r && i + 1 < lineas.length && !/\d/.test(normaliza(l)) && buscaAnalito(normaliza(l)) && /^\s*[<>]?\s*\d/.test(normaliza(lineas[i + 1])))
      r = parseLinea(l + ' ' + lineas[i + 1])
    if (!r) return
    out.push({ ...r, key: r.analito.id + i, incluir: !vistos.has(r.analito.id) })
    vistos.add(r.analito.id)
  })
  return out
}
