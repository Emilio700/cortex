// Tareas de ejemplo para el modo demo (sin información clínica: son visibles para recepción).
import type { Registro } from '../../lib/types'
import { fechaLocal } from './tareas'

export function demoTareas(now: number): Registro[] {
  const DIA = 864e5
  const iso = (t: number) => new Date(t).toISOString()
  const d = (dias: number) => fechaLocal(now + dias * DIA)
  const DRA = 'Dra. Andrea Morales Peña'
  const REC = 'Laura (recepción)'
  const ENF = 'Enf. Patricia Juárez'
  return [
    {
      id: 'demo-tarea-1',
      tipo: 'tarea',
      patientId: 'p1',
      fecha: iso(now - 6 * DIA),
      estado: 'abierta',
      titulo: 'Llamar para agendar control trimestral',
      datos: {
        descripcion: 'Ofrecer horario por la mañana; prefiere WhatsApp.',
        asignadoNombre: REC,
        prioridad: 'alta',
        vence: d(-2),
        etiquetas: ['llamar-paciente'],
        comentarios: [
          {
            fecha: iso(now - 3 * DIA),
            autor: REC,
            texto: 'Primer intento sin respuesta; se dejó mensaje.',
          },
        ],
        creadoPorNombre: DRA,
      },
    },
    {
      id: 'demo-tarea-2',
      tipo: 'tarea',
      patientId: 'p2',
      fecha: iso(now - 4 * DIA),
      estado: 'en-curso',
      titulo: 'Resultado de laboratorio listo: avisar para cita de revisión',
      datos: {
        descripcion: 'El laboratorio envió el resultado al correo de la clínica. Agendar revisión con la doctora.',
        asignadoNombre: REC,
        prioridad: 'media',
        vence: d(-1),
        etiquetas: ['resultado-pendiente', 'llamar-paciente'],
        comentarios: [],
        creadoPorNombre: DRA,
      },
    },
    {
      id: 'demo-tarea-3',
      tipo: 'tarea',
      fecha: iso(now - 2 * DIA),
      estado: 'abierta',
      titulo: 'Pedir guantes de nitrilo y abatelenguas',
      datos: {
        descripcion: 'Quedan 2 cajas de guantes talla M.',
        asignadoNombre: ENF,
        prioridad: 'media',
        vence: d(1),
        etiquetas: ['insumos'],
        comentarios: [],
        recurrencia: 'mensual',
        creadoPorNombre: ENF,
      },
    },
    {
      id: 'demo-tarea-4',
      tipo: 'tarea',
      patientId: 'p6',
      fecha: iso(now - 1 * DIA),
      estado: 'abierta',
      titulo: 'Enviar factura pendiente de la consulta',
      datos: {
        descripcion: 'Ya proporcionó RFC y constancia fiscal.',
        asignadoNombre: REC,
        prioridad: 'baja',
        vence: d(3),
        etiquetas: ['cobro'],
        comentarios: [],
        creadoPorNombre: REC,
      },
    },
    {
      id: 'demo-tarea-5',
      tipo: 'tarea',
      fecha: iso(now - 8 * DIA),
      estado: 'hecha',
      titulo: 'Renovar aviso de funcionamiento ante COFEPRIS',
      datos: {
        descripcion: '',
        asignadoNombre: DRA,
        prioridad: 'alta',
        vence: d(-3),
        etiquetas: ['administrativo'],
        comentarios: [
          {
            fecha: iso(now - 5 * DIA),
            autor: DRA,
            texto: 'Trámite enviado; acuse guardado en la carpeta de la clínica.',
          },
        ],
        creadoPorNombre: DRA,
        completadaEn: iso(now - 5 * DIA),
      },
    },
    {
      id: 'demo-tarea-6',
      tipo: 'tarea',
      patientId: 'p8',
      fecha: iso(now - 7 * DIA),
      estado: 'cancelada',
      titulo: 'Confirmar cita de seguimiento',
      datos: {
        descripcion: 'La familia reagendó directamente por teléfono.',
        asignadoNombre: REC,
        prioridad: 'media',
        vence: d(-4),
        etiquetas: ['llamar-paciente'],
        comentarios: [],
        creadoPorNombre: REC,
      },
    },
    {
      id: 'demo-tarea-7',
      tipo: 'tarea',
      fecha: iso(now - 1 * DIA),
      estado: 'abierta',
      titulo: 'Revisar caducidades del botiquín',
      datos: {
        descripcion: '',
        asignadoNombre: DRA,
        prioridad: 'urgente',
        vence: d(0),
        etiquetas: ['insumos'],
        comentarios: [],
        recurrencia: 'mensual',
        creadoPorNombre: DRA,
      },
    },
  ]
}
