// Definiciones de calculadoras: campos, autollenado desde el expediente, cálculo, fórmula y referencia.
import * as c from './calc'
import type { Tone } from './calc'

export type Vals = Record<string, string>
export interface Campo {
  id: string
  label: string
  tipo?: 'num' | 'sel' | 'chk' | 'fecha'
  unidad?: string
  opciones?: [string, string][] // [valor, texto]
  puntos?: number // para casillas de escalas de riesgo
  def?: string
}
export interface Resultado {
  valor: string
  unidad?: string
  banda?: string
  tono?: Tone
  extra?: string[]
  avisos?: string[]
  obs?: { codigo: string; valor: number; unidad: string; etiqueta?: string }
}
export interface Ctx {
  edad?: number
  sexo?: 'F' | 'M'
  obs: Record<string, number>
}
export interface Calc {
  id: string
  nombre: string
  area: string
  desc: string
  campos: Campo[]
  prefill?: (x: Ctx) => Vals
  calc: (v: Vals) => Resultado | null
  formula: string
  ref: string
}

const n = (s?: string) => (s === undefined || s.trim() === '' ? NaN : Number(s.replace(',', '.')))
const ok = (...xs: number[]) => xs.every((x) => isFinite(x) && x > 0)
const f = (x: number, d = 1) => x.toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d })
const sexoCampo: Campo = { id: 'sexo', label: 'Sexo', tipo: 'sel', opciones: [['F', 'Femenino'], ['M', 'Masculino']], def: 'F' }
const s = (x?: number) => (x === undefined || isNaN(x) ? '' : String(Math.round(x * 100) / 100))
const base = (x: Ctx): Vals => ({ edad: x.edad !== undefined ? String(Math.floor(x.edad)) : '', sexo: x.sexo ?? 'F', peso: s(x.obs.peso), talla: s(x.obs.talla) })
const sumaPuntos = (campos: Campo[], v: Vals) => campos.reduce((a, k) => a + (k.tipo === 'chk' && v[k.id] === '1' ? (k.puntos ?? 1) : 0), 0)
const hoy = () => new Date().toISOString().slice(0, 10)
const fecha = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

const chaCampos: Campo[] = [
  { id: 'icc', label: 'Insuficiencia cardiaca / disfunción VI', tipo: 'chk', puntos: 1 },
  { id: 'hta', label: 'Hipertensión', tipo: 'chk', puntos: 1 },
  { id: 'dm', label: 'Diabetes mellitus', tipo: 'chk', puntos: 1 },
  { id: 'evc', label: 'EVC / AIT / tromboembolia previa', tipo: 'chk', puntos: 2 },
  { id: 'vasc', label: 'Enfermedad vascular (IAM, EAP, placa aórtica)', tipo: 'chk', puntos: 1 },
]
const hasCampos: Campo[] = [
  { id: 'h', label: 'Hipertensión no controlada (PAS > 160)', tipo: 'chk' },
  { id: 'r', label: 'Función renal anormal (diálisis, trasplante, Cr ≥ 2.26)', tipo: 'chk' },
  { id: 'l', label: 'Función hepática anormal (cirrosis, bili > 2×, AST/ALT > 3×)', tipo: 'chk' },
  { id: 's', label: 'EVC previo', tipo: 'chk' },
  { id: 'b', label: 'Sangrado previo o predisposición', tipo: 'chk' },
  { id: 'inr', label: 'INR lábil (TTR < 60 %)', tipo: 'chk' },
  { id: 'e', label: 'Edad > 65 años', tipo: 'chk' },
  { id: 'd', label: 'Fármacos (antiagregantes, AINE)', tipo: 'chk' },
  { id: 'a', label: 'Alcohol (≥ 8 bebidas/semana)', tipo: 'chk' },
]
const wellsCampos: Campo[] = [
  { id: 'ca', label: 'Cáncer activo (tratamiento en 6 meses o paliativo)', tipo: 'chk', puntos: 1 },
  { id: 'par', label: 'Parálisis, paresia o inmovilización con yeso reciente de MI', tipo: 'chk', puntos: 1 },
  { id: 'cama', label: 'Encamado > 3 días o cirugía mayor en 12 semanas', tipo: 'chk', puntos: 1 },
  { id: 'dolor', label: 'Dolor localizado en el trayecto del sistema venoso profundo', tipo: 'chk', puntos: 1 },
  { id: 'edema', label: 'Edema de toda la pierna', tipo: 'chk', puntos: 1 },
  { id: 'pant', label: 'Pantorrilla > 3 cm mayor que la contralateral', tipo: 'chk', puntos: 1 },
  { id: 'fovea', label: 'Edema con fóvea en la pierna sintomática', tipo: 'chk', puntos: 1 },
  { id: 'col', label: 'Venas superficiales colaterales (no varicosas)', tipo: 'chk', puntos: 1 },
  { id: 'prev', label: 'TVP previa documentada', tipo: 'chk', puntos: 1 },
  { id: 'alt', label: 'Diagnóstico alternativo igual o más probable', tipo: 'chk', puntos: -2 },
]
const curbCampos: Campo[] = [
  { id: 'c', label: 'Confusión (desorientación nueva)', tipo: 'chk' },
  { id: 'u', label: 'Urea > 7 mmol/L (BUN > 19 mg/dL)', tipo: 'chk' },
  { id: 'r', label: 'Frecuencia respiratoria ≥ 30', tipo: 'chk' },
  { id: 'b', label: 'PAS < 90 o PAD ≤ 60 mmHg', tipo: 'chk' },
  { id: 'e', label: 'Edad ≥ 65 años', tipo: 'chk' },
]
const qsofaCampos: Campo[] = [
  { id: 'fr', label: 'Frecuencia respiratoria ≥ 22', tipo: 'chk' },
  { id: 'men', label: 'Alteración del estado mental (Glasgow < 15)', tipo: 'chk' },
  { id: 'pas', label: 'PAS ≤ 100 mmHg', tipo: 'chk' },
]

export const PRESETS_DOSIS: Record<string, Vals> = {
  paracetamol: { mgkg: '15', modo: 'dosis', cadaH: '6', mg: '160', ml: '5', maxDosis: '1000', maxDia: '4000' },
  ibuprofeno: { mgkg: '10', modo: 'dosis', cadaH: '8', mg: '100', ml: '5', maxDosis: '400', maxDia: '1200' },
  amoxicilina: { mgkg: '50', modo: 'dia', cadaH: '12', mg: '250', ml: '5', maxDosis: '1000', maxDia: '' },
}

export const CALCS: Calc[] = [
  // ---------- Antropometría y nutrición ----------
  {
    id: 'imc', nombre: 'Índice de masa corporal (IMC)', area: 'Antropometría y nutrición', desc: 'Clasificación OMS en adultos',
    campos: [{ id: 'peso', label: 'Peso', unidad: 'kg' }, { id: 'talla', label: 'Talla', unidad: 'cm' }],
    prefill: base,
    calc: (v) => {
      const p = n(v.peso), t = n(v.talla)
      if (!ok(p, t)) return null
      const x = c.imc(p, t), [b, tono] = c.imcCategoria(x)
      return { valor: f(x), unidad: 'kg/m²', banda: b, tono, avisos: ['En menores de 19 años usa IMC para la edad (módulo Crecimiento).'], obs: { codigo: 'imc', valor: +x.toFixed(1), unidad: 'kg/m²' } }
    },
    formula: 'IMC = peso (kg) / talla (m)²', ref: 'OMS. Obesity: preventing and managing the global epidemic. TRS 894, 2000.',
  },
  {
    id: 'sc', nombre: 'Superficie corporal (Mosteller)', area: 'Antropometría y nutrición', desc: 'Para dosificación y volúmenes',
    campos: [{ id: 'peso', label: 'Peso', unidad: 'kg' }, { id: 'talla', label: 'Talla', unidad: 'cm' }],
    prefill: base,
    calc: (v) => (ok(n(v.peso), n(v.talla)) ? { valor: f(c.scMosteller(n(v.peso), n(v.talla)), 2), unidad: 'm²', obs: { codigo: 'superficie-corporal', valor: +c.scMosteller(n(v.peso), n(v.talla)).toFixed(2), unidad: 'm²', etiqueta: 'Superficie corporal' } } : null),
    formula: 'SC (m²) = √( talla (cm) × peso (kg) / 3600 )', ref: 'Mosteller RD. Simplified calculation of body-surface area. N Engl J Med 1987;317:1098.',
  },
  {
    id: 'pi', nombre: 'Peso ideal (Devine)', area: 'Antropometría y nutrición', desc: 'Peso ideal y peso ajustado',
    campos: [{ id: 'talla', label: 'Talla', unidad: 'cm' }, sexoCampo, { id: 'peso', label: 'Peso real (opcional)', unidad: 'kg' }],
    prefill: base,
    calc: (v) => {
      const t = n(v.talla)
      if (!ok(t)) return null
      const pi = c.pesoIdealDevine(t, v.sexo as 'F' | 'M'), p = n(v.peso)
      const extra = ok(p) ? [`Peso real = ${f((p / pi) * 100, 0)} % del ideal`, `Peso ajustado = PI + 0.4 × (peso − PI) = ${f(pi + 0.4 * (p - pi))} kg`] : []
      return { valor: f(pi), unidad: 'kg', extra, avisos: t < 152.4 ? ['La fórmula de Devine es poco fiable en tallas menores de 152 cm (5 pies).'] : [] }
    },
    formula: 'Hombre: 50 + 2.3 × (talla en pulgadas − 60) · Mujer: 45.5 + 2.3 × (talla en pulgadas − 60)', ref: 'Devine BJ. Gentamicin therapy. Drug Intell Clin Pharm 1974;8:650-5.',
  },
  {
    id: 'get', nombre: 'Gasto energético (Harris-Benedict y Mifflin-St Jeor)', area: 'Antropometría y nutrición', desc: 'Metabolismo basal y requerimiento diario',
    campos: [
      { id: 'peso', label: 'Peso', unidad: 'kg' }, { id: 'talla', label: 'Talla', unidad: 'cm' }, { id: 'edad', label: 'Edad', unidad: 'años' }, sexoCampo,
      { id: 'af', label: 'Actividad física', tipo: 'sel', def: '1.2', opciones: [['1.2', 'Sedentaria (×1.2)'], ['1.375', 'Ligera (×1.375)'], ['1.55', 'Moderada (×1.55)'], ['1.725', 'Intensa (×1.725)'], ['1.9', 'Muy intensa (×1.9)']] },
    ],
    prefill: base,
    calc: (v) => {
      const p = n(v.peso), t = n(v.talla), e = n(v.edad), af = n(v.af), sx = v.sexo as 'F' | 'M'
      if (!ok(p, t, e)) return null
      const m = c.mifflin(p, t, e, sx), hb = c.harrisBenedict(p, t, e, sx)
      return { valor: f(m, 0), unidad: 'kcal/día (GEB Mifflin)', extra: [`Harris-Benedict: ${f(hb, 0)} kcal/día`, `Requerimiento total (Mifflin × ${af}): ${f(m * af, 0)} kcal/día`, `Requerimiento total (H-B × ${af}): ${f(hb * af, 0)} kcal/día`] }
    },
    formula: 'Mifflin: 10·P + 6.25·T − 5·E + 5 (H) / − 161 (M). Harris-Benedict (1919): H 66.473 + 13.7516·P + 5.0033·T − 6.755·E; M 655.0955 + 9.5634·P + 1.8496·T − 4.6756·E',
    ref: 'Mifflin MD et al. Am J Clin Nutr 1990;51:241-7. Harris JA, Benedict FG. A biometric study of basal metabolism in man. 1919.',
  },
  // ---------- Cardiovascular ----------
  {
    id: 'pam', nombre: 'Presión arterial media (PAM)', area: 'Cardiovascular', desc: 'A partir de PAS y PAD',
    campos: [{ id: 'pas', label: 'PAS', unidad: 'mmHg' }, { id: 'pad', label: 'PAD', unidad: 'mmHg' }],
    prefill: (x) => ({ pas: s(x.obs.pas), pad: s(x.obs.pad) }),
    calc: (v) => {
      const a = n(v.pas), d = n(v.pad)
      if (!ok(a, d)) return null
      const m = c.pam(a, d)
      return { valor: f(m, 0), unidad: 'mmHg', banda: m < 65 ? 'Baja (< 65): riesgo de hipoperfusión' : m > 100 ? 'Elevada (> 100)' : 'En rango (65–100)', tono: m < 65 ? 'danger' : m > 100 ? 'warn' : 'ok', obs: { codigo: 'pam', valor: Math.round(m), unidad: 'mmHg', etiqueta: 'PAM' } }
    },
    formula: 'PAM = PAD + (PAS − PAD) / 3', ref: 'Fórmula clásica; meta ≥ 65 mmHg en choque séptico (Surviving Sepsis Campaign 2021).',
  },
  {
    id: 'qtc', nombre: 'QT corregido (Bazett y Fridericia)', area: 'Cardiovascular', desc: 'Corrección del QT por frecuencia',
    campos: [{ id: 'qt', label: 'QT medido', unidad: 'ms' }, { id: 'fc', label: 'Frecuencia cardiaca', unidad: 'lpm' }, sexoCampo],
    prefill: (x) => ({ fc: s(x.obs.fc), sexo: x.sexo ?? 'F' }),
    calc: (v) => {
      const qt = n(v.qt), fc = n(v.fc)
      if (!ok(qt, fc)) return null
      const b = c.qtcBazett(qt, fc), fr = c.qtcFridericia(qt, fc), lim = v.sexo === 'F' ? 460 : 450
      const banda = fr >= 500 ? 'QTc ≥ 500 ms: riesgo alto de torsade de pointes' : fr > lim ? `Prolongado (> ${lim} ms)` : fr < 350 ? 'Corto (< 350 ms)' : 'Normal'
      return {
        valor: f(fr, 0), unidad: 'ms (Fridericia)', banda, tono: fr >= 500 ? 'danger' : fr > lim || fr < 350 ? 'warn' : 'ok',
        extra: [`Bazett: ${f(b, 0)} ms`, `RR = ${f(60 / fc, 3)} s`], avisos: fc > 90 || fc < 60 ? ['Con FC fuera de 60–90 lpm, Bazett sobre/infracorrige; prefiera Fridericia.'] : [],
        obs: { codigo: 'qtc', valor: Math.round(fr), unidad: 'ms', etiqueta: 'QTc Fridericia' },
      }
    },
    formula: 'Bazett: QTc = QT / √RR · Fridericia: QTc = QT / ∛RR (RR en s = 60 / FC)', ref: 'Rautaharju PM et al. AHA/ACCF/HRS recommendations for ECG interpretation, part IV. Circulation 2009;119:e241.',
  },
  {
    id: 'cha', nombre: 'CHA₂DS₂-VASc', area: 'Cardiovascular', desc: 'Riesgo de EVC en fibrilación auricular',
    campos: [{ id: 'edad', label: 'Edad', unidad: 'años' }, sexoCampo, ...chaCampos],
    prefill: (x) => ({ edad: base(x).edad, sexo: x.sexo ?? 'F', hta: x.obs.pas >= 140 ? '1' : '', dm: x.obs.hba1c >= 6.5 ? '1' : '' }),
    calc: (v) => {
      const e = n(v.edad)
      if (!ok(e)) return null
      const p = sumaPuntos(chaCampos, v) + (e >= 75 ? 2 : e >= 65 ? 1 : 0) + (v.sexo === 'F' ? 1 : 0)
      const pSinSexo = p - (v.sexo === 'F' ? 1 : 0)
      const [banda, tono]: [string, Tone] = pSinSexo === 0 ? ['Riesgo bajo: no se recomienda anticoagulación', 'ok'] : pSinSexo === 1 ? ['Considerar anticoagulación oral', 'warn'] : ['Anticoagulación oral recomendada', 'danger']
      return { valor: String(p), unidad: 'puntos', banda, tono, extra: [`Tasa ajustada de EVC ≈ ${c.CHA2DS2_RIESGO[Math.min(p, 9)]} %/año`], obs: { codigo: 'escala', valor: p, unidad: 'pts', etiqueta: 'CHA₂DS₂-VASc' } }
    },
    formula: 'ICC 1 · HTA 1 · Edad ≥ 75: 2 · DM 1 · EVC/AIT/TE 2 · Enf. vascular 1 · Edad 65–74: 1 · Sexo femenino 1',
    ref: 'Lip GYH et al. Chest 2010;137:263-72. Hindricks G et al. Guía ESC 2020 de FA (el sexo femenino es modificador de riesgo, no indicación por sí solo).',
  },
  {
    id: 'hasbled', nombre: 'HAS-BLED', area: 'Cardiovascular', desc: 'Riesgo de sangrado con anticoagulación',
    campos: hasCampos,
    prefill: (x) => ({ e: (x.edad ?? 0) > 65 ? '1' : '' }),
    calc: (v) => {
      const p = sumaPuntos(hasCampos, v)
      return { valor: String(p), unidad: 'puntos', banda: p >= 3 ? 'Riesgo alto de sangrado: corregir factores modificables y vigilar' : 'Riesgo bajo a moderado', tono: p >= 3 ? 'danger' : p === 2 ? 'warn' : 'ok', extra: ['Un HAS-BLED alto no contraindica por sí mismo la anticoagulación.'], obs: { codigo: 'escala', valor: p, unidad: 'pts', etiqueta: 'HAS-BLED' } }
    },
    formula: '1 punto por cada criterio (H, A renal, A hepática, S, B, L, E, D fármacos, D alcohol); máximo 9',
    ref: 'Pisters R et al. A novel user-friendly score (HAS-BLED). Chest 2010;138:1093-100.',
  },
  {
    id: 'wells', nombre: 'Wells para TVP', area: 'Cardiovascular', desc: 'Probabilidad clínica de trombosis venosa profunda',
    campos: wellsCampos,
    calc: (v) => {
      const p = sumaPuntos(wellsCampos, v)
      return { valor: String(p), unidad: 'puntos', banda: p >= 2 ? 'TVP probable: ultrasonido Doppler' : 'TVP improbable: dímero D; si es negativo, se descarta', tono: p >= 2 ? 'danger' : 'ok', extra: [`Modelo de 3 niveles: ${p >= 3 ? 'probabilidad alta' : p >= 1 ? 'probabilidad moderada' : 'probabilidad baja'}`], obs: { codigo: 'escala', valor: p, unidad: 'pts', etiqueta: 'Wells TVP' } }
    },
    formula: '1 punto por criterio; −2 si hay diagnóstico alternativo igual o más probable. ≥ 2 probable.',
    ref: 'Wells PS et al. Evaluation of D-dimer in the diagnosis of suspected DVT. N Engl J Med 2003;349:1227-35.',
  },
  // ---------- Renal y electrolitos ----------
  {
    id: 'tfg', nombre: 'TFG CKD-EPI 2021', area: 'Renal y electrolitos', desc: 'Ecuación sin coeficiente de raza',
    campos: [{ id: 'cr', label: 'Creatinina sérica', unidad: 'mg/dL' }, { id: 'edad', label: 'Edad', unidad: 'años' }, sexoCampo],
    prefill: (x) => ({ ...base(x), cr: s(x.obs.creatinina) }),
    calc: (v) => {
      const cr = n(v.cr), e = n(v.edad)
      if (!ok(cr, e)) return null
      const g = c.ckdEpi2021(cr, e, v.sexo as 'F' | 'M'), [b, tono] = c.kdigoG(g)
      return { valor: f(g, 0), unidad: 'mL/min/1.73 m²', banda: b, tono, avisos: e < 18 ? ['Válida en ≥ 18 años; en niños use Schwartz.'] : [], obs: { codigo: 'tfg', valor: Math.round(g), unidad: 'mL/min/1.73m²', etiqueta: 'CKD-EPI 2021' } }
    },
    formula: 'TFG = 142 × min(Cr/κ, 1)^α × max(Cr/κ, 1)^−1.200 × 0.9938^edad × 1.012 [mujer]; κ = 0.7 (M) / 0.9 (H); α = −0.241 (M) / −0.302 (H)',
    ref: 'Inker LA et al. New creatinine- and cystatin C–based equations to estimate GFR without race. N Engl J Med 2021;385:1737-49. Estadios KDIGO 2012.',
  },
  {
    id: 'cg', nombre: 'Depuración de creatinina (Cockcroft-Gault)', area: 'Renal y electrolitos', desc: 'Ajuste de dosis de fármacos',
    campos: [{ id: 'cr', label: 'Creatinina sérica', unidad: 'mg/dL' }, { id: 'edad', label: 'Edad', unidad: 'años' }, { id: 'peso', label: 'Peso', unidad: 'kg' }, sexoCampo],
    prefill: (x) => ({ ...base(x), cr: s(x.obs.creatinina) }),
    calc: (v) => {
      const cr = n(v.cr), e = n(v.edad), p = n(v.peso)
      if (!ok(cr, e, p)) return null
      const d = c.cockcroftGault(e, p, cr, v.sexo as 'F' | 'M')
      return { valor: f(d, 0), unidad: 'mL/min', banda: d < 30 ? 'Disminución grave' : d < 60 ? 'Disminución moderada' : 'Sin disminución relevante', tono: d < 30 ? 'danger' : d < 60 ? 'warn' : 'ok', avisos: ['En obesidad considere usar peso ideal o ajustado.'] }
    },
    formula: 'CrCl = (140 − edad) × peso (kg) / (72 × Cr) × 0.85 si mujer', ref: 'Cockcroft DW, Gault MH. Nephron 1976;16:31-41.',
  },
  {
    id: 'ca', nombre: 'Calcio corregido por albúmina', area: 'Renal y electrolitos', desc: 'Corrección de Payne',
    campos: [{ id: 'ca', label: 'Calcio total', unidad: 'mg/dL' }, { id: 'alb', label: 'Albúmina', unidad: 'g/dL' }],
    calc: (v) => {
      const ca = n(v.ca), a = n(v.alb)
      if (!ok(ca, a)) return null
      const x = c.calcioCorregido(ca, a)
      return { valor: f(x), unidad: 'mg/dL', banda: x < 8.5 ? 'Hipocalcemia' : x > 10.5 ? 'Hipercalcemia' : 'Normal (8.5–10.5)', tono: x < 8.5 || x > 10.5 ? 'warn' : 'ok', avisos: ['Si se dispone, prefiera calcio iónico.'] }
    },
    formula: 'Ca corregido = Ca medido + 0.8 × (4 − albúmina)', ref: 'Payne RB et al. BMJ 1973;4:643-6.',
  },
  {
    id: 'ag', nombre: 'Anion gap (brecha aniónica)', area: 'Renal y electrolitos', desc: 'Con corrección por albúmina',
    campos: [{ id: 'na', label: 'Sodio', unidad: 'mEq/L' }, { id: 'cl', label: 'Cloro', unidad: 'mEq/L' }, { id: 'hco3', label: 'Bicarbonato', unidad: 'mEq/L' }, { id: 'alb', label: 'Albúmina (opcional)', unidad: 'g/dL' }],
    calc: (v) => {
      const na = n(v.na), cl = n(v.cl), h = n(v.hco3), a = n(v.alb)
      if (!ok(na, cl, h)) return null
      const ag = c.anionGap(na, cl, h), agc = ok(a) ? c.agCorregido(ag, a) : ag
      return { valor: f(ag), unidad: 'mEq/L', banda: agc > 12 ? 'Elevado: acidosis metabólica de brecha aniónica alta' : agc < 6 ? 'Bajo' : 'Normal (≈ 8–12)', tono: agc > 12 ? 'warn' : 'ok', extra: ok(a) ? [`Corregido por albúmina: ${f(agc)} mEq/L`] : [] }
    },
    formula: 'AG = Na − (Cl + HCO₃⁻); corregido = AG + 2.5 × (4 − albúmina)', ref: 'Figge J et al. Crit Care Med 1998;26:1807-10. El rango normal depende del laboratorio.',
  },
  {
    id: 'agua', nombre: 'Déficit de agua libre', area: 'Renal y electrolitos', desc: 'En hipernatremia',
    campos: [
      { id: 'peso', label: 'Peso', unidad: 'kg' }, { id: 'na', label: 'Sodio sérico', unidad: 'mEq/L' },
      { id: 'act', label: 'Agua corporal total', tipo: 'sel', def: '0.6', opciones: [['0.6', 'Niño u hombre adulto (0.6)'], ['0.5', 'Mujer adulta u hombre > 65 (0.5)'], ['0.45', 'Mujer > 65 (0.45)']] },
    ],
    prefill: (x) => ({ peso: s(x.obs.peso), act: (x.edad ?? 30) > 65 ? (x.sexo === 'F' ? '0.45' : '0.5') : x.sexo === 'F' && (x.edad ?? 0) >= 18 ? '0.5' : '0.6' }),
    calc: (v) => {
      const p = n(v.peso), na = n(v.na)
      if (!ok(p, na)) return null
      const d = c.deficitAgua(p, na, n(v.act))
      return { valor: f(Math.max(d, 0)), unidad: 'L', banda: na <= 145 ? 'Sin hipernatremia' : 'Hipernatremia', tono: na > 145 ? 'warn' : 'ok', avisos: ['Corrija sin exceder 10–12 mEq/L de descenso de sodio en 24 h.'] }
    },
    formula: 'Déficit = ACT × peso × (Na / 140 − 1)', ref: 'Adrogué HJ, Madias NE. Hypernatremia. N Engl J Med 2000;342:1493-9.',
  },
  // ---------- Neumología e infectología ----------
  {
    id: 'curb', nombre: 'CURB-65', area: 'Neumología e infecciones', desc: 'Gravedad de neumonía adquirida en la comunidad',
    campos: curbCampos,
    prefill: (x) => ({ e: (x.edad ?? 0) >= 65 ? '1' : '', r: x.obs.fr >= 30 ? '1' : '' }),
    calc: (v) => {
      const p = sumaPuntos(curbCampos, v)
      const [b, t]: [string, Tone] = p <= 1 ? ['Bajo riesgo: manejo ambulatorio', 'ok'] : p === 2 ? ['Riesgo intermedio: hospitalización corta o ambulatorio supervisado', 'warn'] : ['Neumonía grave: hospitalizar; 4–5 valorar UCI', 'danger']
      return { valor: String(p), unidad: 'puntos', banda: b, tono: t, extra: [`Mortalidad a 30 días ≈ ${c.CURB65_MORT[p]} %`], obs: { codigo: 'escala', valor: p, unidad: 'pts', etiqueta: 'CURB-65' } }
    },
    formula: '1 punto por: Confusión, Urea > 7 mmol/L, FR ≥ 30, PA baja, edad ≥ 65', ref: 'Lim WS et al. Thorax 2003;58:377-82.',
  },
  {
    id: 'qsofa', nombre: 'qSOFA', area: 'Neumología e infecciones', desc: 'Tamizaje de mal pronóstico en sospecha de sepsis',
    campos: qsofaCampos,
    prefill: (x) => ({ fr: x.obs.fr >= 22 ? '1' : '', pas: x.obs.pas && x.obs.pas <= 100 ? '1' : '' }),
    calc: (v) => {
      const p = sumaPuntos(qsofaCampos, v)
      return { valor: String(p), unidad: 'de 3', banda: p >= 2 ? 'Positivo: alto riesgo de mala evolución; evaluar SOFA y disfunción orgánica' : 'Negativo (no descarta sepsis)', tono: p >= 2 ? 'danger' : 'ok', obs: { codigo: 'escala', valor: p, unidad: 'pts', etiqueta: 'qSOFA' } }
    },
    formula: '1 punto por: FR ≥ 22, alteración mental, PAS ≤ 100. ≥ 2 positivo.', ref: 'Seymour CW et al. JAMA 2016;315:762-74 (Sepsis-3). No se recomienda como única herramienta de tamizaje (SSC 2021).',
  },
  // ---------- Gineco-obstetricia ----------
  {
    id: 'fum', nombre: 'FPP y edad gestacional por FUM', area: 'Gineco-obstetricia', desc: 'Regla de Naegele',
    campos: [{ id: 'fum', label: 'Fecha de última menstruación', tipo: 'fecha' }, { id: 'ref', label: 'Fecha de referencia', tipo: 'fecha' }],
    prefill: () => ({ ref: hoy() }),
    calc: (v) => {
      if (!v.fum) return null
      const r = v.ref || hoy(), d = c.diffDays(v.fum, r)
      if (d < 0) return { valor: '—', banda: 'La FUM es posterior a la fecha de referencia', tono: 'warn' }
      return {
        valor: fecha(c.fppNaegele(v.fum)), banda: `Edad gestacional: ${c.fmtEG(d)}`, tono: d > 294 ? 'danger' : d >= 287 ? 'warn' : 'neutral',
        extra: [`Trimestre: ${d < 14 * 7 ? 'primero' : d < 28 * 7 ? 'segundo' : 'tercero'}`, d >= 259 && d < 294 ? 'Embarazo de término (37–41.6 sem)' : d >= 294 ? 'Embarazo postérmino (≥ 42 sem)' : ''].filter(Boolean),
        avisos: ['Asume ciclos regulares de 28 días; confirme con USG del primer trimestre.'],
        obs: { codigo: 'edad-gestacional', valor: +(d / 7).toFixed(1), unidad: 'sem', etiqueta: 'EG por FUM' },
      }
    },
    formula: 'FPP = FUM + 280 días (equivale a +7 días, −3 meses, +1 año). EG = (fecha − FUM) / 7', ref: 'ACOG Committee Opinion 700: Methods for estimating the due date, 2017.',
  },
  {
    id: 'usg', nombre: 'FPP y edad gestacional por USG', area: 'Gineco-obstetricia', desc: 'Con criterio de redatación ACOG',
    campos: [
      { id: 'fusg', label: 'Fecha del ultrasonido', tipo: 'fecha' }, { id: 'sem', label: 'EG por USG: semanas', unidad: 'sem' }, { id: 'dias', label: 'EG por USG: días', unidad: 'd', def: '0' },
      { id: 'fum', label: 'FUM (opcional, para comparar)', tipo: 'fecha' },
    ],
    calc: (v) => {
      const sem = n(v.sem), dd = n(v.dias || '0')
      if (!v.fusg || !(sem >= 0) || !(dd >= 0)) return null
      const egUsg = Math.round(sem * 7 + dd), egHoy = egUsg + c.diffDays(v.fusg, hoy())
      const fpp = c.addDays(v.fusg, 280 - egUsg)
      const extra = [`EG hoy: ${c.fmtEG(egHoy)}`]
      if (v.fum) {
        const egFum = c.diffDays(v.fum, v.fusg), dif = egUsg - egFum, um = c.umbralRedatar(egUsg)
        extra.push(`EG por FUM al USG: ${c.fmtEG(egFum)} (diferencia ${dif > 0 ? '+' : ''}${dif} d)`)
        extra.push(Math.abs(dif) > um ? `Diferencia > ${um} días: redatar con USG (FPP por USG).` : `Diferencia ≤ ${um} días: conservar FPP por FUM (${fecha(c.fppNaegele(v.fum))}).`)
      }
      return { valor: fecha(fpp), banda: `Edad gestacional actual: ${c.fmtEG(egHoy)}`, tono: 'neutral', extra, obs: { codigo: 'edad-gestacional', valor: +(egHoy / 7).toFixed(1), unidad: 'sem', etiqueta: 'EG por USG' } }
    },
    formula: 'FPP = fecha USG + (280 − EG al USG en días). Redatar si la diferencia con FUM supera: ≤ 8+6 sem 5 d; 9+0–15+6 sem 7 d; 16–21+6 sem 10 d; 22–27+6 sem 14 d; ≥ 28 sem 21 d.',
    ref: 'ACOG/AIUM/SMFM Committee Opinion 700, 2017.',
  },
  // ---------- Endocrinología y hepatología ----------
  {
    id: 'homa', nombre: 'HOMA-IR', area: 'Endocrinología', desc: 'Resistencia a la insulina',
    campos: [{ id: 'glu', label: 'Glucosa en ayuno', unidad: 'mg/dL' }, { id: 'ins', label: 'Insulina en ayuno', unidad: 'µU/mL' }],
    prefill: (x) => ({ glu: s(x.obs.glucosa) }),
    calc: (v) => {
      const g = n(v.glu), i = n(v.ins)
      if (!ok(g, i)) return null
      const h = c.homaIR(g, i)
      return { valor: f(h, 2), banda: h > 2.5 ? 'Sugiere resistencia a la insulina' : 'Sin resistencia evidente', tono: h > 2.5 ? 'warn' : 'ok', avisos: ['El punto de corte varía por población (≈ 2.5–3.8 en adultos mexicanos).'], obs: { codigo: 'homa-ir', valor: +h.toFixed(2), unidad: '', etiqueta: 'HOMA-IR' } }
    },
    formula: 'HOMA-IR = glucosa (mg/dL) × insulina (µU/mL) / 405', ref: 'Matthews DR et al. Diabetologia 1985;28:412-9.',
  },
  {
    id: 'eag', nombre: 'Glucosa promedio estimada (HbA1c)', area: 'Endocrinología', desc: 'Ecuación ADAG',
    campos: [{ id: 'a1c', label: 'HbA1c', unidad: '%' }],
    prefill: (x) => ({ a1c: s(x.obs.hba1c) }),
    calc: (v) => {
      const a = n(v.a1c)
      if (!ok(a)) return null
      const g = c.eAG(a)
      return { valor: f(g, 0), unidad: 'mg/dL', extra: [`${f(g / 18.016, 1)} mmol/L`], banda: a >= 6.5 ? 'HbA1c en rango de diabetes (≥ 6.5 %)' : a >= 5.7 ? 'Prediabetes (5.7–6.4 %)' : 'Normal (< 5.7 %)', tono: a >= 6.5 ? 'danger' : a >= 5.7 ? 'warn' : 'ok' }
    },
    formula: 'eAG (mg/dL) = 28.7 × HbA1c − 46.7', ref: 'Nathan DM et al. Translating the A1C assay into estimated average glucose values. Diabetes Care 2008;31:1473-8. ADA Standards of Care.',
  },
  {
    id: 'fib4', nombre: 'FIB-4', area: 'Hepatología', desc: 'Fibrosis hepática avanzada',
    campos: [{ id: 'edad', label: 'Edad', unidad: 'años' }, { id: 'ast', label: 'AST', unidad: 'U/L' }, { id: 'alt', label: 'ALT', unidad: 'U/L' }, { id: 'plq', label: 'Plaquetas', unidad: '×10⁹/L (miles/µL)' }],
    prefill: base,
    calc: (v) => {
      const e = n(v.edad), a = n(v.ast), l = n(v.alt), p = n(v.plq)
      if (!ok(e, a, l, p)) return null
      const x = c.fib4(e, a, l, p), bajo = e >= 65 ? 2.0 : 1.3
      return { valor: f(x, 2), banda: x < bajo ? 'Riesgo bajo de fibrosis avanzada' : x > 2.67 ? 'Riesgo alto de fibrosis avanzada' : 'Indeterminado: elastografía', tono: x < bajo ? 'ok' : x > 2.67 ? 'danger' : 'warn', avisos: e < 35 ? ['Poco fiable en menores de 35 años.'] : [], obs: { codigo: 'fib4', valor: +x.toFixed(2), unidad: '', etiqueta: 'FIB-4' } }
    },
    formula: 'FIB-4 = edad × AST / (plaquetas × √ALT). Cortes: < 1.30 (< 2.0 si ≥ 65 a) y > 2.67', ref: 'Sterling RK et al. Hepatology 2006;43:1317-25. McPherson S et al. Am J Gastroenterol 2017.',
  },
  {
    id: 'child', nombre: 'Child-Pugh', area: 'Hepatología', desc: 'Pronóstico en cirrosis',
    campos: [
      { id: 'bili', label: 'Bilirrubina total', unidad: 'mg/dL' }, { id: 'alb', label: 'Albúmina', unidad: 'g/dL' }, { id: 'inr', label: 'INR' },
      { id: 'asc', label: 'Ascitis', tipo: 'sel', def: '1', opciones: [['1', 'Ausente'], ['2', 'Leve'], ['3', 'Moderada a grave']] },
      { id: 'enc', label: 'Encefalopatía', tipo: 'sel', def: '1', opciones: [['1', 'Ausente'], ['2', 'Grado 1–2'], ['3', 'Grado 3–4']] },
    ],
    calc: (v) => {
      const b = n(v.bili), a = n(v.alb), i = n(v.inr)
      if (!ok(b, a, i)) return null
      const p = c.childPugh(b, a, i, n(v.asc), n(v.enc)), cl = c.childClase(p)
      return { valor: `${p} · Clase ${cl}`, banda: cl === 'A' ? 'Enfermedad compensada (sobrevida 1 año ≈ 100 %)' : cl === 'B' ? 'Compromiso funcional significativo (≈ 80 %)' : 'Enfermedad descompensada (≈ 45 %)', tono: cl === 'A' ? 'ok' : cl === 'B' ? 'warn' : 'danger', obs: { codigo: 'escala', valor: p, unidad: 'pts', etiqueta: 'Child-Pugh' } }
    },
    formula: 'Bilirrubina < 2 / 2–3 / > 3 · Albúmina > 3.5 / 2.8–3.5 / < 2.8 · INR < 1.7 / 1.7–2.3 / > 2.3 · Ascitis · Encefalopatía (1–3 pts c/u). A 5–6, B 7–9, C 10–15',
    ref: 'Pugh RN et al. Br J Surg 1973;60:646-9.',
  },
  {
    id: 'meld', nombre: 'MELD (UNOS) y MELD-Na', area: 'Hepatología', desc: 'Mortalidad a 3 meses en hepatopatía terminal',
    campos: [
      { id: 'cr', label: 'Creatinina', unidad: 'mg/dL' }, { id: 'bili', label: 'Bilirrubina total', unidad: 'mg/dL' }, { id: 'inr', label: 'INR' }, { id: 'na', label: 'Sodio (opcional)', unidad: 'mEq/L' },
      { id: 'dial', label: 'Diálisis ≥ 2 veces en la última semana (o TRRC 24 h)', tipo: 'chk' },
    ],
    prefill: (x) => ({ cr: s(x.obs.creatinina) }),
    calc: (v) => {
      const cr = n(v.cr), b = n(v.bili), i = n(v.inr)
      if (!ok(cr, b, i)) return null
      const r = c.meld(cr, b, i, v.dial === '1', n(v.na))
      const m = r.meldNa ?? r.meld
      return { valor: String(r.meld), unidad: 'MELD', banda: `Mortalidad a 3 meses ≈ ${c.meldMortalidad(m)} %`, tono: m >= 20 ? 'danger' : m >= 10 ? 'warn' : 'ok', extra: r.meldNa !== undefined ? [`MELD-Na: ${r.meldNa}`] : [], obs: { codigo: 'escala', valor: m, unidad: 'pts', etiqueta: r.meldNa !== undefined ? 'MELD-Na' : 'MELD' } }
    },
    formula: 'MELD = 10 × (0.957 ln Cr + 0.378 ln bili + 1.120 ln INR + 0.643). Valores < 1 se llevan a 1; Cr máx. 4 (o 4 si diálisis); tope 40. MELD-Na (si MELD > 11) = MELD + 1.32 × (137 − Na) − 0.033 × MELD × (137 − Na), Na acotado a 125–137.',
    ref: 'Kamath PS et al. Hepatology 2001;33:464-70. Wiesner R et al. Gastroenterology 2003;124:91-6. Kim WR et al. N Engl J Med 2008;359:1018-26.',
  },
  // ---------- Pediatría ----------
  {
    id: 'dosis', nombre: 'Dosis pediátrica por peso', area: 'Pediatría y fármacos', desc: 'mg/kg → mg y mL por dosis, con tope máximo',
    campos: [
      { id: 'preset', label: 'Plantilla (verifique siempre)', tipo: 'sel', def: '', opciones: [['', 'Personalizada'], ['paracetamol', 'Paracetamol 15 mg/kg c/6 h · 160 mg/5 mL'], ['ibuprofeno', 'Ibuprofeno 10 mg/kg c/8 h · 100 mg/5 mL'], ['amoxicilina', 'Amoxicilina 50 mg/kg/día c/12 h · 250 mg/5 mL']] },
      { id: 'peso', label: 'Peso', unidad: 'kg' },
      { id: 'mgkg', label: 'Dosis', unidad: 'mg/kg' },
      { id: 'modo', label: 'La dosis es', tipo: 'sel', def: 'dosis', opciones: [['dosis', 'mg/kg por dosis'], ['dia', 'mg/kg por día (dividido)']] },
      { id: 'cadaH', label: 'Cada', unidad: 'horas', def: '8' },
      { id: 'mg', label: 'Concentración: mg', unidad: 'mg', def: '' },
      { id: 'ml', label: '… por mL', unidad: 'mL', def: '5' },
      { id: 'maxDosis', label: 'Dosis máxima por toma', unidad: 'mg' },
      { id: 'maxDia', label: 'Dosis máxima al día', unidad: 'mg' },
    ],
    prefill: (x) => ({ peso: s(x.obs.peso) }),
    calc: (v) => {
      const p = n(v.peso), mk = n(v.mgkg), h = n(v.cadaH), mg = n(v.mg), ml = n(v.ml)
      if (!ok(p, mk, h, mg, ml)) return null
      const r = c.dosisPediatrica({ peso: p, mgkg: mk, modo: v.modo as 'dosis' | 'dia', cadaH: h, mg, ml, maxDosis: n(v.maxDosis) || undefined, maxDia: n(v.maxDia) || undefined })
      return {
        valor: `${f(r.ml, 1)} mL`, unidad: `cada ${h} h`, banda: `${f(r.dosisMg, 0)} mg por dosis · ${f(r.tomas, 0)} tomas/día`, tono: r.limitada ? 'warn' : 'ok',
        extra: [`Total diario: ${f(r.mgDia, 0)} mg (${f(r.mgkgDia, 1)} mg/kg/día)`, `Concentración: ${f(mg / ml, 1)} mg/mL`], avisos: r.avisos,
      }
    },
    formula: 'Dosis (mg) = peso × mg/kg (÷ tomas al día si es mg/kg/día), limitada al máximo. Volumen (mL) = dosis / (mg ÷ mL). Tomas/día = 24 / intervalo.',
    ref: 'Cálculo aritmético. Verifique dosis e intervalos en una referencia vigente (p. ej. Harriet Lane, Lexicomp pediátrico, IMSS/CENETEC).',
  },
]

export const AREAS = Array.from(new Set(CALCS.map((x) => x.area)))
