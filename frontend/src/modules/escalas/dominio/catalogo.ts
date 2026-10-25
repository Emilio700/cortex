/**
 * Las escalas que ofrece Cortex, en el orden del selector: primero las del
 * paciente agudo, luego las de función y seguimiento.
 */
import {
  FISHER_MODIFICADA,
  GLASGOW,
  HUNT_HESS,
  NIHSS,
  SPETZLER_MARTIN,
  WFNS,
} from './catalogoAgudo'
import {
  ASIA,
  BARTHEL,
  ENA_DOLOR,
  KARNOFSKY,
  MJOA,
  NDI,
  OSWESTRY,
  RANKIN_MODIFICADA,
} from './catalogoFuncional'
import type { Escala } from './tipos'

export const GRUPOS: { nombre: string; escalas: Escala[] }[] = [
  {
    nombre: 'Conciencia, evento vascular y hemorragia',
    escalas: [GLASGOW, NIHSS, HUNT_HESS, WFNS, FISHER_MODIFICADA, SPETZLER_MARTIN],
  },
  {
    nombre: 'Función y seguimiento',
    escalas: [RANKIN_MODIFICADA, ASIA, KARNOFSKY, MJOA, OSWESTRY, NDI, ENA_DOLOR, BARTHEL],
  },
]

export const ESCALAS: Escala[] = GRUPOS.flatMap((g) => g.escalas)

export const escalaPorId = (id: string): Escala | undefined => ESCALAS.find((e) => e.id === id)
