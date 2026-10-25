// Datos demo: agudeza visual de Miguel (p8, 14 años) medida a 3 m con letras tipo Sloan.
import type { Observation, Registro } from '../../lib/types'
import { logmarADecimal, snellen } from './optotipos'

const DAY = 86_400_000

function r(ojo: 'OD' | 'OI' | 'AO', correccion: 'sin' | 'con' | 'estenopeico', logmar: number, lineas?: Record<string, number>) {
  return { ojo, correccion, logmar, snellen20: snellen(logmar, 20), snellen6: snellen(logmar, 6), decimal: Math.round(logmarADecimal(logmar) * 100) / 100, lineas }
}

export function demoVision(now: number): Registro[] {
  const fecha = new Date(now - 10 * DAY).toISOString()
  return [
    {
      id: 'reg-av-p8-1',
      patientId: 'p8',
      fecha,
      tipo: 'agudeza-visual',
      estado: 'completada',
      titulo: `Agudeza visual lejana: OD ${snellen(0.22)} · OI ${snellen(0)} · AO ${snellen(-0.02)}`,
      datos: {
        distanciaM: 3,
        optotipo: 'sloan',
        pxPorMm: 3.78,
        calibrada: true,
        resultados: [
          r('OD', 'sin', 0.22, { '0.4': 5, '0.3': 5, '0.2': 4 }),
          r('OD', 'estenopeico', 0.0),
          r('OI', 'sin', 0.0, { '0.2': 5, '0.1': 5, '0': 5 }),
          r('AO', 'sin', -0.02, { '0.1': 5, '0': 5, '-0.1': 1 }),
        ],
        notas: 'Mejora con estenopeico en OD: probable error refractivo. Referir a optometría.',
      },
    },
  ]
}

export function demoVisionObs(now: number): Observation[] {
  const fecha = new Date(now - 10 * DAY).toISOString()
  return [
    { id: 'obs-av-p8-od', patientId: 'p8', fecha, codigo: 'agudeza-od', valor: 0.22, unidad: 'logMAR', etiqueta: 'Agudeza visual OD sin corrección', fuente: 'manual', interpretacion: `${snellen(0.22)} (${snellen(0.22, 6)}) · a 3 m` },
    { id: 'obs-av-p8-oi', patientId: 'p8', fecha, codigo: 'agudeza-oi', valor: 0, unidad: 'logMAR', etiqueta: 'Agudeza visual OI sin corrección', fuente: 'manual', interpretacion: '20/20 (6/6) · a 3 m' },
  ]
}
