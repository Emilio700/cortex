/**
 * El centro de avisos (plan 27, Fase 2). Vive en un panel que se abre con la
 * campana, así que el recorrido sólo aplica con el panel abierto; desde ahí lo
 * arranca su botón «¿Cómo funciona?», porque el panel tapa el «?» del
 * encabezado.
 */
import type { Recorrido } from '../tipos'

export const RECORRIDOS_AVISOS: Recorrido[] = [
  {
    id: 'avisos',
    version: 4,
    titulo: 'Tus avisos',
    resumen: 'Qué está por atender, cómo se resuelve un aviso y cómo activar sonido o notificaciones.',
    grupo: 'General',
    contexto: 'avisos-centro',
    comoLlegar:
      'Pulsa la <b>campana</b> de arriba a la derecha y, dentro del panel de avisos, <b>¿Cómo funciona?</b>. Abrir el panel no atiende ni borra nada.',
    pasos: [
      {
        titulo: 'Tus avisos',
        texto:
          'Aquí llega lo que pasa mientras trabajas. Hay dos clases: lo que <b>te pide hacer algo</b> (un paciente en sala, una consulta por cobrar, un resultado por revisar) y lo que <b>sólo informa</b> (una cita que te agendaron, un documento nuevo).',
      },
      {
        elemento: 'avisos-pestanas',
        titulo: 'Por atender y Todos',
        texto:
          '<b>Por atender</b> tiene todo lo que sigue pendiente, lo más antiguo primero. El número rojo de la campana cuenta esto mismo. <b>Todos</b> es el historial: ahí ves quién atendió cada aviso y a qué hora.',
        lado: 'bottom',
      },
      {
        elemento: 'avisos-por-atender',
        titulo: 'Un aviso se resuelve solo',
        texto:
          'Leer un aviso no lo atiende. Se quita de aquí cuando el sistema ve que ya se hizo: se cobró la consulta, el paciente pasó a consulta, se revisó el resultado. Con <b>Atender</b> o <b>Ir</b> llegas a la pantalla. Si ya no aplica, <b>Descartar</b> lo quita y queda registrado quién lo hizo.',
        lado: 'left',
      },
      {
        titulo: 'Resultados críticos',
        texto:
          'Para los médicos: si un resultado que pediste se valora <b>Crítico</b>, aparece una <b>franja roja</b> debajo de la barra en cualquier pantalla, salvo en tu <b>Inicio</b>, donde ya lo dice la tarjeta de resultados críticos. No es un aviso que se descarte: se quita sola cuando le comunicas o entregas el resultado al paciente, o cuando lo revisas dentro de una consulta suya. Puedes <b>posponerla 15 minutos</b> en este equipo; si llega otro crítico, vuelve a salir.',
      },
      {
        elemento: 'avisos-preferencias',
        titulo: 'Sonido y notificaciones',
        texto:
          'Puedes activar un <b>sonido</b> y la <b>notificación del navegador</b> para cuando GEMS está en otra pestaña; las dos vienen apagadas. La notificación no dice el nombre del paciente. Los médicos pueden, además, pedir un aviso una hora antes de cada cita y dejar de recibir los avisos que sólo informan. Lo que pide hacer algo siempre llega.',
        lado: 'left',
      },
    ],
  },
]
