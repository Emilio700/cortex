// Datos demo: tamiz auditivo escolar de Sofía (p3, audiómetro de tamiz) y presbiacusia de José (p2).
import type { Registro } from '../../lib/types'
import { FRECUENCIAS, interpretar, vacio, type Umbrales } from './audiograma'

const DAY = 86_400_000

function umbrales(der: (number | null)[], izq: (number | null)[], oseaDer?: (number | null)[], oseaIzq?: (number | null)[]): Umbrales {
  const u = vacio()
  FRECUENCIAS.forEach((f, i) => {
    if (der[i] != null) u.der.aerea[f] = { db: der[i] }
    if (izq[i] != null) u.izq.aerea[f] = { db: izq[i] }
    if (oseaDer?.[i] != null) u.der.osea[f] = { db: oseaDer[i] }
    if (oseaIzq?.[i] != null) u.izq.osea[f] = { db: oseaIzq[i] }
  })
  return u
}

function registro(id: string, patientId: string, fecha: string, u: Umbrales, equipo: string, notas: string): Registro {
  const it = interpretar(u)
  const g = it.global.grado
  return {
    id,
    patientId,
    fecha,
    tipo: 'audiometria',
    estado: 'completada',
    titulo: `Audiometría: ${g ? g.nombre.toLowerCase() : 'umbrales capturados'} · PTA OD ${it.ptaDer} · OI ${it.ptaIzq} dB HL`,
    datos: {
      modo: 'audiograma',
      umbrales: u,
      pta: { der: it.ptaDer, izq: it.ptaIzq },
      grado: g?.id ?? null,
      unilateral: it.global.unilateral,
      asimetria: it.asim.frecuencias,
      brecha: { der: it.brechaDer.frecuencias, izq: it.brechaIzq.frecuencias },
      hallazgos: it.referir,
      equipo,
      notas,
    },
  }
}

export function demoAudiometria(now: number): Registro[] {
  //                     250 500 1k  2k  3k  4k  6k  8k
  const sofia = umbrales([15, 10, 10, 5, null, 10, null, 10], [15, 15, 10, 10, null, 5, null, 10])
  const jose = umbrales([15, 20, 25, 35, 45, 55, 60, 65], [15, 20, 25, 30, 40, 50, 60, 70], [null, 15, 25, 30, null, 50, null, null], [null, 15, 20, 30, null, 45, null, null])
  return [
    registro('reg-aud-p3-1', 'p3', new Date(now - 45 * DAY).toISOString(), sofia, 'Audiómetro de tamiz escolar', 'Tamiz auditivo preescolar: pasa en ambos oídos. Otoscopia normal.'),
    registro('reg-aud-p2-1', 'p2', new Date(now - 120 * DAY).toISOString(), jose, 'Audiómetro clínico, cabina', 'Patrón descendente en agudos, simétrico: compatible con presbiacusia. Valorar auxiliares auditivos.'),
  ]
}
