// Estructura de los registros de control prenatal (colección `registros`, tipo 'prenatal').
//
// Decisión: cada embarazo es un Registro (datos.clase = 'embarazo') y cada consulta prenatal es un
// Registro aparte (datos.clase = 'consulta', datos.embarazoId). Así cada consulta aparece en la línea de
// tiempo del paciente, se crea/borra de forma independiente (sin reescribir todo el embarazo y sin perder
// cambios si dos personas capturan a la vez) y el servidor audita cada consulta por separado.
import type { Registro } from '../../lib/types'
import { datar, sdgEn, type ConsultaPrenatal, type Datacion } from './calc'

export interface Biometria {
  fecha: string
  sdgDias?: number // EG por datación al momento del USG
  lcc?: number // mm
  cc?: number // cm
  ca?: number
  lf?: number
  pfe?: number // g
  percentil?: number
  notas?: string
}

export interface Resolucion {
  fecha: string
  tipo: 'parto' | 'cesarea' | 'aborto' | 'ectopico' | 'otro'
  sdgDias?: number
  rnSexo?: 'F' | 'M' | ''
  rnPeso?: number
  apgar?: string
  notas?: string
}

export interface DatosEmbarazo {
  clase: 'embarazo'
  fum?: string
  fumConfiable?: boolean
  usg?: { fecha: string; sdgDias: number; lcc?: number } // USG de datación (idealmente < 14 sem)
  gesta: number
  para: number
  cesareas: number
  abortos: number
  grupoRh?: string
  pesoPre?: number
  talla?: number
  riesgos: string[]
  riesgoNotas?: string
  resolucion?: Resolucion
  biometrias?: Biometria[]
}

export interface DatosConsulta extends ConsultaPrenatal {
  clase: 'consulta'
  embarazoId: string
  sdgDias?: number
  obsIds?: string[]
}

export const RIESGOS = [
  'Edad < 18 o > 35 años',
  'Preeclampsia en embarazo previo',
  'Hipertensión arterial crónica',
  'Diabetes pregestacional',
  'Diabetes gestacional previa',
  'Cesárea previa / cirugía uterina',
  'Parto pretérmino previo',
  'Pérdida gestacional recurrente',
  'Embarazo múltiple',
  'Enfermedad renal o autoinmune',
  'Obesidad (IMC ≥ 30)',
  'Tabaquismo, alcohol u otras sustancias',
  'Isoinmunización / Rh negativo',
  'VIH, sífilis u otra infección',
]

export const esEmbarazo = (r: Registro) => (r.datos as { clase?: string }).clase === 'embarazo'
export const esConsulta = (r: Registro) => (r.datos as { clase?: string }).clase === 'consulta'
export const datosEmb = (r: Registro) => r.datos as unknown as DatosEmbarazo
export const datosCons = (r: Registro) => r.datos as unknown as DatosConsulta

export function datacionDe(e: DatosEmbarazo): Datacion {
  return datar(e.fum, e.usg)
}

/** Edad gestacional (días) hoy o a la fecha de resolución; null si no se puede datar. */
export function sdgActual(e: DatosEmbarazo, hoy: string): number | null {
  const d = datacionDe(e)
  if (!d.fumEfectiva) return null
  return sdgEn(d.fumEfectiva, e.resolucion?.fecha ?? hoy)
}

export function rhNegativo(grupo?: string) {
  return !!grupo && /(-|neg)/i.test(grupo)
}

export function tituloEmbarazo(d: DatosEmbarazo) {
  const fpp = datacionDe(d).fpp
  const f = fpp ? new Date(fpp + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  return `Embarazo G${d.gesta}${f ? ` · FPP ${f}` : ''}`
}
