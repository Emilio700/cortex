// Datos demo: hoja de enfermería de hoy para José Luis (p2, 70 a, cardiópata).
import type { Observation, Registro } from '../../lib/types'
import { fmtFecha } from '../../lib/utils'
import { diaISO, inicioDia, programarDosis, type Movimiento } from './calc'
import type { Aplicacion, DatosHoja, OrdenManual } from './hoja'

const H = 3600000

/** Observaciones de signos vitales capturadas en la hoja (solo las horas ya transcurridas). */
export function demoEnfermeriaObs(now: number): Observation[] {
  const d0 = inicioDia(now)
  const tomas: [number, Record<string, number>][] = [
    [1, { pas: 128, pad: 78, fc: 66, fr: 16, temp: 36.4, spo2: 96, glucosa: 112 }],
    [5, { pas: 134, pad: 82, fc: 70, fr: 18, temp: 36.6, spo2: 95 }],
    [9, { pas: 126, pad: 76, fc: 64, fr: 16, temp: 36.5, spo2: 96 }],
    [13, { pas: 122, pad: 74, fc: 62, fr: 16, temp: 36.3, spo2: 97, glucosa: 128 }],
    [17, { pas: 118, pad: 72, fc: 60, fr: 15, temp: 36.2, spo2: 96 }],
  ]
  const unidades: Record<string, string> = { pas: 'mmHg', pad: 'mmHg', fc: 'lpm', fr: 'rpm', temp: '°C', spo2: '%', glucosa: 'mg/dL' }
  const out: Observation[] = []
  for (const [h, vals] of tomas) {
    const t = d0 + h * H
    if (t > now) continue
    for (const [k, v] of Object.entries(vals)) out.push({ id: `enf-demo-o${h}-${k}`, patientId: 'p2', fecha: new Date(t).toISOString(), codigo: k, valor: v, unidad: unidades[k], fuente: 'manual', etiqueta: 'Hoja de enfermería' })
  }
  return out
}

export function demoEnfermeria(now: number): Registro[] {
  const d0 = inicioDia(now)
  const iso = (h: number) => new Date(d0 + h * H).toISOString()
  const ya = (h: number) => d0 + h * H <= now
  const ordenes: OrdenManual[] = [
    { id: 'asa', medicamento: 'Ácido acetilsalicílico tab. 100 mg', dosis: '100 mg', via: 'Oral', frecuencia: 'Cada 24 horas', indicaciones: 'Con alimentos' },
    { id: 'meto', medicamento: 'Metoprolol tab. 50 mg', dosis: '50 mg', via: 'Oral', frecuencia: 'Cada 12 horas', indicaciones: 'No administrar si FC < 55 o TAS < 100' },
    { id: 'ator', medicamento: 'Atorvastatina tab. 40 mg', dosis: '40 mg', via: 'Oral', frecuencia: 'Cada 24 horas' },
    { id: 'enox', medicamento: 'Enoxaparina sol. iny. 40 mg/0.4 mL', dosis: '40 mg', via: 'Subcutánea', frecuencia: 'Cada 24 horas' },
    { id: 'para', medicamento: 'Paracetamol tab. 500 mg', dosis: '1 g', via: 'Oral', frecuencia: 'En caso de dolor o fiebre, máximo cada 8 horas' },
  ]
  const horarios: Record<string, string> = { 'm:asa': '09:00', 'm:meto': '08:00', 'm:ator': '22:00', 'm:enox': '10:00' }
  const mar: Record<string, Aplicacion> = {}
  const correctos = ['Paciente correcto', 'Medicamento correcto', 'Dosis correcta', 'Vía correcta', 'Hora correcta']
  const intervalos: Record<string, number> = { asa: 24, meto: 12, ator: 24, enox: 24 }
  for (const [id, h] of Object.entries(intervalos)) {
    for (const t of programarDosis(h, horarios[`m:${id}`], d0)) {
      if (t + 10 * 60000 > now) continue
      mar[`m:${id}@${new Date(t).toISOString()}`] = { estado: 'aplicado', programada: new Date(t).toISOString(), hora: new Date(t + 10 * 60000).toISOString(), enfermera: 'Enf. Laura Pérez (demo)', correctos }
    }
  }
  if (ya(6)) mar[`m:para@prn-${d0 + 6 * H}`] = { estado: 'aplicado', hora: iso(6), enfermera: 'Enf. Laura Pérez (demo)', correctos, nota: 'Cefalea 4/10' }
  const movs: [number, Movimiento['tipo'], Movimiento['via'], number, string?][] = [
    [0.5, 'ingreso', 'iv', 250, 'Solución salina 0.9 % 1000 mL p/ 24 h (40 mL/h)'],
    [1, 'ingreso', 'oral', 240, 'Desayuno'],
    [2, 'egreso', 'diuresis', 300],
    [5, 'ingreso', 'oral', 350, 'Comida'],
    [6.5, 'ingreso', 'iv', 250],
    [7, 'egreso', 'diuresis', 420],
    [9, 'egreso', 'evacuaciones', 150, 'Formada'],
    [11, 'ingreso', 'oral', 300, 'Cena'],
    [12.5, 'ingreso', 'iv', 250],
    [13, 'egreso', 'diuresis', 380],
    [18.5, 'ingreso', 'iv', 250],
    [20, 'egreso', 'diuresis', 450],
  ]
  const datos: DatosHoja = {
    dia: diaISO(d0),
    peso: 76,
    movimientos: movs.filter(([h]) => ya(h)).map(([h, tipo, via, ml, nota], i) => ({ id: `mv${i}`, hora: iso(h), tipo, via, ml, nota })),
    ordenes,
    horarios,
    mar,
    notas: ya(3)
      ? [{ id: 'n1', hora: iso(3), turno: 'matutino', formato: 'soapie', autor: 'Enf. Laura Pérez (demo)', soapie: { s: 'Refiere descansar bien; niega dolor torácico.', o: 'Consciente, orientado, TA 128/78, FC 66, SpO₂ 96 % al aire ambiente. Venoclisis permeable en antebrazo izquierdo.', a: 'Riesgo de disminución del gasto cardiaco.', p: 'Vigilar signos vitales c/4 h, balance hídrico estricto.', i: 'Se administra medicación del horario con los 5 correctos. Se instruye sobre deambulación asistida.', e: 'Paciente estable, colabora.' } }]
      : [],
    entregas: {},
  }
  return [{ id: 'enf-demo-p2', patientId: 'p2', fecha: new Date(d0).toISOString(), tipo: 'enfermeria', estado: 'abierta', titulo: `Hoja de enfermería ${fmtFecha(new Date(d0).toISOString())}`, datos: datos as unknown as Record<string, unknown> }]
}
