/**
 * Recorridos del grupo «Sistema» (base-modulos-extra): estado de los servicios
 * auxiliares y módulos opcionales del consultorio.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

const ADMIN = [Role.ADMIN, Role.MASTER]

export const RECORRIDOS_SISTEMA: Recorrido[] = [
  {
    id: 'sistema-servicios',
    version: 1,
    titulo: 'Estado de servicios',
    resumen: 'Si Orthanc, el dictado, Presidio, el segmentador y la IA están listos.',
    grupo: 'Administración',
    ruta: '/sistema/servicios',
    requiere: ['servicios.read'],
    roles: ADMIN,
    pasos: [
      {
        elemento: 'servicios-estado-lista',
        titulo: 'Cada servicio y su estado',
        texto:
          '<b>En línea</b>: respondió. <b>Sin respuesta</b>: está configurado pero no contestó o rechazó la contraseña. <b>No configurado</b>: falta su dirección en el servidor. La IA dice <b>Configurado, sin probar</b>: no se le hace una consulta de prueba porque cada una cuesta.',
        lado: 'top',
      },
      {
        elemento: 'servicios-estado-revisar',
        titulo: 'Volver a revisar',
        texto: 'Pregunta otra vez a cada servicio. Úsalo después de que alguien levante o configure uno.',
        lado: 'bottom',
        alinear: 'end',
      },
    ],
  },
  {
    id: 'sistema-modulos',
    version: 1,
    titulo: 'Módulos del consultorio',
    resumen: 'Encender o apagar las funciones opcionales para todo el consultorio.',
    grupo: 'Administración',
    ruta: '/sistema/modulos',
    requiere: ['modulos.manage'],
    roles: ADMIN,
    pasos: [
      {
        elemento: 'modulos-explicacion',
        titulo: 'Qué hace un módulo',
        texto:
          'Encenderlo lo muestra a <b>todo el consultorio</b>, según el permiso de cada quien. Apagarlo solo lo oculta: <b>no borra nada</b>.',
        lado: 'bottom',
      },
      {
        elemento: 'modulos-lista',
        titulo: 'Un interruptor por módulo',
        texto:
          'El interruptor muestra lo que guardó el servidor. Solo dice <b>Guardado</b> cuando el servidor lo confirmó; si falla, se queda como estaba y te dice por qué. Si un módulo necesita un servicio que no está configurado, el interruptor queda deshabilitado con la explicación.',
        lado: 'top',
      },
    ],
  },
]
