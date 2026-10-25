// Datos demo: tres pacientes de llegada espontánea hoy en sala de espera.
import type { Registro } from '../../lib/types'
import { clasificarESI, contarRecursos, type Vitales } from './esi'

const NACIMIENTOS: Record<string, string> = { p3: '2021-06-20', p4: '1990-08-09', p8: '2012-09-18' }
const meses = (pid: string, now: number) => (now - Date.parse(NACIMIENTOS[pid])) / (30.4375 * 864e5)

export function demoTriaje(now: number): Registro[] {
  const casos: { id: string; pid: string; hace: number; motivo: string; dolor?: number; vitales: Vitales; recursos: string[]; altoRiesgo?: boolean }[] = [
    { id: 'tri-demo-1', pid: 'p4', hace: 48, motivo: 'Torcedura de tobillo derecho jugando futbol, no puede apoyar', dolor: 6, vitales: { fc: 88, fr: 16, spo2: 98, temp: 36.6, pas: 124, pad: 78 }, recursos: ['ecg-rx'] },
    { id: 'tri-demo-2', pid: 'p8', hace: 22, motivo: 'Dificultad para respirar y sibilancias desde anoche; asma conocida', dolor: 2, vitales: { fc: 112, fr: 28, spo2: 91, temp: 36.9 }, recursos: ['meds', 'ecg-rx'] },
    { id: 'tri-demo-3', pid: 'p3', hace: 9, motivo: 'Fiebre y dolor de oído izquierdo desde ayer', dolor: 4, vitales: { fc: 118, fr: 24, spo2: 98, temp: 38.4 }, recursos: [] },
  ]
  return casos.map((c) => {
    const edadMeses = Math.floor(meses(c.pid, now))
    const llegada = new Date(now - c.hace * 60000).toISOString()
    const recursos = contarRecursos(c.recursos)
    const res = clasificarESI({ edadMeses, salvavidas: false, altoRiesgo: !!c.altoRiesgo, confusion: false, dolorIntenso: false, recursos, vitales: c.vitales, aceptarSubirPorVitales: true })
    return {
      id: c.id,
      patientId: c.pid,
      fecha: llegada,
      tipo: 'triaje',
      estado: 'espera',
      titulo: `Triaje ESI ${res.nivel} · ${c.motivo.slice(0, 60)}`,
      datos: {
        llegada, edadMeses, motivo: c.motivo, dolor: c.dolor, vitales: c.vitales, salvavidas: false, altoRiesgo: !!c.altoRiesgo, confusion: false, dolorIntenso: false,
        recursos: c.recursos, aceptarSubirPorVitales: true, nivel: res.nivel, punto: res.punto, razones: res.razones, zonaPeligro: res.zonaPeligro,
        evaluadoPor: 'Enf. Laura Pérez (demo)', evaluadoEn: llegada, obsIds: [], historial: [],
      },
    }
  })
}
