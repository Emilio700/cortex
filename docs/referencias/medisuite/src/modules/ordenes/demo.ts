// Datos demo: una orden de laboratorio pendiente para p1 (DM2/HAS) y una ya revisada.
import type { Registro } from '../../lib/types'
import { CATALOGO } from './catalogo'
import { tituloOrden, type ItemOrden } from './ordenes'

const item = (id: string): ItemOrden => {
  const e = CATALOGO.find((x) => x.id === id)!
  return { id: e.id, nombre: e.nombre, tipo: e.tipo, ...(e.loinc ? { loinc: e.loinc } : {}), ...(e.preparacion ? { preparacion: e.preparacion } : {}), ...(e.muestra ? { muestra: e.muestra } : {}) }
}

export function demoOrdenes(now: number): Registro[] {
  const day = 86_400_000
  const iso = (t: number) => new Date(t).toISOString()
  const medico = 'Dra. Andrea Morales Peña'
  const items1 = ['a1c', 'qs6', 'lipidos', 'acr', 'ego'].map(item)
  const items2 = ['bh', 'tsh', 'ecg'].map(item)
  return [
    {
      id: 'demo-orden-1',
      patientId: 'p1',
      fecha: iso(now - 9 * day),
      tipo: 'orden',
      estado: 'pendiente',
      titulo: tituloOrden('OR-000002', items1),
      datos: {
        folio: 'OR-000002',
        items: items1,
        diagnosticos: [
          { codigo: 'E11.9', nombre: 'Diabetes mellitus tipo 2 sin complicaciones' },
          { codigo: 'I10', nombre: 'Hipertensión esencial (primaria)' },
        ],
        diagnosticoTexto: 'Control trimestral',
        urgencia: 'ordinaria',
        laboratorio: 'Laboratorio Clínico Central',
        indicaciones: 'Paciente en tratamiento con metformina y losartán.',
        medico,
        historial: [{ estado: 'pendiente', fecha: iso(now - 9 * day), por: medico }],
      },
    },
    {
      id: 'demo-orden-0',
      patientId: 'p1',
      fecha: iso(now - 120 * day),
      tipo: 'orden',
      estado: 'revisado',
      titulo: tituloOrden('OR-000001', items2),
      datos: {
        folio: 'OR-000001',
        items: items2,
        diagnosticos: [{ codigo: 'I10', nombre: 'Hipertensión esencial (primaria)' }],
        urgencia: 'ordinaria',
        medico,
        notaRevision: 'BH y TSH normales. ECG en ritmo sinusal sin alteraciones agudas.',
        historial: [
          { estado: 'pendiente', fecha: iso(now - 120 * day), por: medico },
          { estado: 'muestra', fecha: iso(now - 117 * day) },
          { estado: 'resultado', fecha: iso(now - 115 * day) },
          { estado: 'revisado', fecha: iso(now - 112 * day), por: medico },
        ],
      },
    },
  ]
}
