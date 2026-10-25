// Datos demo: cartilla de Sofía (p3, nacida 2021-06-20) con esquema infantil completo y de Miguel
// (p8, nacido 2012-09-18, asma) con esquema infantil de su época (pentavalente) e influenza.
import type { Registro } from '../../lib/types'
import { ESQUEMA, dosisPorId, inicioTemporada, sumarMeses, vacunaPorId, type Aplicacion } from './esquema'

const LAB: Record<string, string> = { bcg: 'BIRMEX', hb: 'GSK', hexa: 'Sanofi Pasteur', rota: 'GSK', pcv: 'Pfizer', flu: 'Sanofi Pasteur', srp: 'MSD', dpt: 'BIRMEX', td: 'BIRMEX', vph: 'MSD' }

function reg(pid: string, a: Aplicacion, i: number): Registro {
  const d = dosisPorId(a.dosisId)
  const v = vacunaPorId(a.vacunaId)
  return {
    id: `demo-vac-${pid}-${i}`,
    patientId: pid,
    tipo: 'vacuna',
    estado: 'aplicada',
    fecha: new Date(a.fecha + 'T12:00:00').toISOString(),
    titulo: `${a.nombre ?? v?.nombre ?? a.vacunaId}${d ? ` · ${d.dosis}` : ''}`,
    datos: { ...a } as unknown as Registro['datos'],
  }
}

function infantiles(nac: string, hasta: string, prefLote: string, nombres: Record<string, string> = {}): Aplicacion[] {
  return ESQUEMA.filter((d) => d.grupo === 'infantil' && (d.regla ?? 'unica') === 'unica')
    .map((d, i) => {
      const fecha = sumarMeses(nac, d.edadMeses)
      const v = vacunaPorId(d.vacunaId)!
      return { dosisId: d.id, vacunaId: d.vacunaId, fecha, lote: `${prefLote}${(1000 + i * 37).toString(36).toUpperCase()}`, laboratorio: LAB[d.vacunaId], via: v.via, sitio: v.sitio, aplicador: 'Enf. Laura Méndez', ...(nombres[d.vacunaId] ? { nombre: nombres[d.vacunaId] } : {}) }
    })
    .filter((a) => a.fecha <= hasta)
}

export function demoVacunacion(now: number): Registro[] {
  const hoy = new Date(now).toISOString().slice(0, 10)
  // Temporada de influenza anterior a la vigente (la de este año queda pendiente para mostrar recordatorios)
  const tempPrev = `${Number(inicioTemporada(hoy).slice(0, 4)) - 1}-10-20`
  const sofia: Aplicacion[] = [
    ...infantiles('2021-06-20', hoy, 'S'),
    { dosisId: 'flu-inf', vacunaId: 'flu', fecha: '2022-10-25', lote: 'FLU22A', laboratorio: LAB.flu, via: 'Intramuscular', sitio: 'Deltoides izquierdo', aplicador: 'Enf. Laura Méndez' },
    { dosisId: 'flu-inf', vacunaId: 'flu', fecha: '2023-10-18', lote: 'FLU23B', laboratorio: LAB.flu, via: 'Intramuscular', sitio: 'Deltoides izquierdo', aplicador: 'Enf. Laura Méndez' },
    { dosisId: 'flu-inf', vacunaId: 'flu', fecha: '2024-11-05', lote: 'FLU24C', laboratorio: LAB.flu, via: 'Intramuscular', sitio: 'Deltoides izquierdo', aplicador: 'Enf. Laura Méndez' },
  ]
  // Miguel: esquema infantil de 2012 (pentavalente acelular, no hexavalente; SRP 2.ª a los 6 años en ese esquema)
  const miguel: Aplicacion[] = [
    ...infantiles('2012-09-18', hoy, 'M', { hexa: 'Pentavalente acelular (DPaT+VIP+Hib)' }).map((a) => (a.dosisId === 'srp-2' ? { ...a, fecha: '2018-09-20' } : a)),
    { dosisId: 'otra', vacunaId: 'flu', nombre: 'Influenza estacional (grupo de riesgo: asma)', fecha: tempPrev, lote: 'FLU-AS', laboratorio: LAB.flu, via: 'Intramuscular', sitio: 'Deltoides izquierdo', aplicador: 'Enf. Laura Méndez' },
    { dosisId: 'otra', vacunaId: 'covid', nombre: 'COVID-19 (campaña)', fecha: '2022-03-10', lote: 'CV-221', laboratorio: 'Pfizer-BioNTech', via: 'Intramuscular', sitio: 'Deltoides izquierdo', aplicador: 'Brigada de vacunación' },
  ]
  return [...sofia.map((a, i) => reg('p3', a, i)), ...miguel.map((a, i) => reg('p8', a, i))]
}
