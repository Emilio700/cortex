// Datos demo: evaluación de hitos de Sofía (p3, nacida 2021-06-20) con la lista de 4 años (48 meses).
import type { Registro } from '../../lib/types'
import { checkpointLabel, edadParaEvaluar, evaluar, hitosDe, type DatosDesarrollo, type Respuesta } from './hitos'

export function demoDesarrollo(now: number): Registro[] {
  void now // la fecha depende del nacimiento fijo de la paciente del seed
  const fechaEval = '2025-06-23'
  const e = edadParaEvaluar('2021-06-20', fechaEval, 39)
  const respuestas: Record<string, Respuesta> = Object.fromEntries(hitosDe(48).map((h) => [h.id, 'si' as Respuesta]))
  respuestas['48-cognitivo-3'] = 'nose' // dibujo de la figura humana: no lo han observado en casa
  const res = evaluar(48, respuestas)
  const datos: DatosDesarrollo = {
    fechaEval,
    sdgNacimiento: 39,
    edadCronologicaMeses: +e.cronologicaMeses.toFixed(2),
    edadCorregidaMeses: +e.corregidaMeses.toFixed(2),
    usaCorregida: false,
    checkpoint: 48,
    respuestas,
    perdidaHabilidades: false,
    preocupaciones: 'La mamá comenta que es tímida con adultos desconocidos.',
    notas: 'Pedir a la familia que observe si dibuja una persona con 3 o más partes; revalorar en la visita de 5 años.',
    nivel: res.nivel,
    noCumplidos: res.no.map((h) => h.id),
  }
  return [
    {
      id: 'demo-desarrollo-p3-48m',
      patientId: 'p3',
      tipo: 'desarrollo',
      estado: res.nivel,
      fecha: new Date(fechaEval + 'T12:00:00').toISOString(),
      titulo: `Hitos del desarrollo ${checkpointLabel(48)} · ${res.nivel === 'ok' ? 'Hitos cumplidos' : 'Por confirmar'}`,
      datos: datos as unknown as Registro['datos'],
    },
  ]
}
