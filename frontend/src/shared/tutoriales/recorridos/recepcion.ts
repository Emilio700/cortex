/**
 * Recorridos de recepción: agenda, citas, signos vitales, pacientes y órdenes de estudio.
 *
 * El de la agenda también lo ven doctoras y administración (tienen la pantalla),
 * por eso sus textos no dan por hecho quién está leyendo.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

export const RECORRIDOS_RECEPCION: Recorrido[] = [
  {
    id: 'agenda',
    version: 8,
    titulo: 'La agenda',
    resumen: 'Ver las citas, filtrarlas, crear una nueva y abrir una existente.',
    grupo: 'Recepción',
    ruta: '/secretaria/agenda',
    requiere: ['appointments.read'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.DOCTOR, Role.MASTER],
    pasos: [
      {
        titulo: 'La agenda de la clínica',
        texto:
          'Aquí se ven, se crean y se mueven las citas de todos los médicos. Te enseñamos cada parte en menos de un minuto.',
      },
      {
        elemento: 'agenda-nueva-cita',
        titulo: 'Nueva cita',
        texto:
          'Abre el formulario para agendar. También puedes tocar un hueco libre del calendario y la fecha y hora ya vienen puestas.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'agenda-exportar',
        titulo: 'Exportar',
        texto: 'Descarga en una hoja de cálculo las citas que estás viendo, con los filtros aplicados.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'agenda-imprimir',
        titulo: 'Imprimir agenda',
        texto:
          'Desde la vista <b>Lista</b>, imprime las citas del periodo que estás viendo, con los filtros aplicados: hora, paciente, teléfono, doctora, servicio y estado. En las otras vistas el botón queda apagado.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'agenda-filtros',
        titulo: 'Filtros',
        texto:
          'Por doctora, sucursal, tipo de cita o sala. Abajo dice siempre <b>qué estás viendo</b>, para que nadie crea que no hay citas cuando sólo están filtradas. <b>Ver todas las citas</b> quita los filtros.',
        lado: 'bottom',
      },
      {
        elemento: 'agenda-vistas',
        titulo: 'Tres formas de verla',
        texto:
          '<b>Calendario</b> por día o semana, <b>Lista</b> para leerla de corrido, y <b>Por salas</b> para ver qué consultorio está ocupado a qué hora.',
        lado: 'bottom',
      },
      {
        elemento: 'agenda-buscar',
        titulo: 'Buscar en la lista',
        texto:
          'En la vista <b>Lista</b>, este buscador filtra las citas del periodo que estás viendo por <b>nombre</b>, <b>teléfono</b> o <b>folio</b> de la cita. No trae citas de otras fechas: acota lo que ya ves.',
        lado: 'bottom',
      },
      {
        elemento: 'agenda-calendario',
        titulo: 'El calendario',
        texto:
          'Cada cita tiene el color de su estado. <b>Tócala para abrirla</b>: ahí se confirma, se pasa a sala, se reagenda o se cancela. Toca un hueco vacío para agendar ahí. En el celular abre en el <b>Día</b>; con las flechas cambias de día.',
        lado: 'top',
      },
      {
        elemento: 'agenda-insignia-cobro',
        titulo: 'Estado del cobro',
        texto:
          'En las citas atendidas, esta insignia dice si ya se cobró (<b>Cobrada</b>) o si falta (<b>Por cobrar</b>). Revísala antes de cobrar para no cobrar dos veces; al abrir <b>Registrar pago</b>, el formulario te dice además quién la cobró y cuándo.',
        lado: 'top',
      },
      {
        elemento: 'agenda-insignia-express',
        titulo: 'Consultas express',
        texto:
          'Las citas marcadas <b>Express</b> (en la vista Lista, «Express · registrada al cobrar») no se agendaron antes: se crearon solas al cobrar una consulta sin cita en <b>Cobros</b>. Salen como atendidas y cobradas; no hace falta agendarlas ni cobrarlas otra vez. Si después se anula ese pago, queda atendida y <b>Por cobrar</b>, salvo que al anular se cancele también la consulta.',
        lado: 'top',
      },
      {
        elemento: 'agenda-leyenda',
        titulo: 'Qué significa cada color',
        texto: 'La leyenda de estados y salas, siempre al pie del calendario.',
        lado: 'top',
      },
      {
        elemento: 'agenda-mini-calendario',
        titulo: 'Salta a otro día',
        texto: 'Los números indican cuántas citas hay cada día. Toca uno para ver sus citas abajo.',
        lado: 'left',
      },
      {
        elemento: 'agenda-citas-dia',
        titulo: 'Las citas del día elegido',
        texto: 'Cada una dice su estado en palabras (Agendada, En sala, Atendida…). Toca una para abrirla.',
        lado: 'left',
      },
      {
        elemento: 'agenda-tarjeta-menu',
        titulo: 'Más acciones',
        texto: 'Con los tres puntos abres el historial del paciente o filtras la agenda sólo a sus citas.',
        lado: 'left',
      },
      {
        elemento: 'agenda-cita-en-dia',
        titulo: 'Agendar en ese día',
        texto: 'Abre una cita nueva con la fecha del día elegido ya puesta.',
        lado: 'left',
      },
      {
        elemento: 'agenda-resumen-mes',
        titulo: 'Resumen del mes',
        texto: 'Cuántas citas hay programadas, pendientes y canceladas en el mes, y cómo va la asistencia.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'cita-formulario',
    version: 9,
    titulo: 'Agendar o editar una cita',
    resumen: 'Cada campo del formulario de cita, y cómo pasar al paciente a sala.',
    grupo: 'Recepción',
    ruta: '/secretaria/agenda',
    requiere: ['appointments.read'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.DOCTOR, Role.MASTER],
    contexto: 'cita-formulario',
    comoLlegar:
      'En la <b>Agenda</b>, pulsa <b>Nueva Cita</b> (o abre una cita para editarla) y, dentro del formulario, <b>¿Cómo se llena?</b>. Abrir el formulario no agenda nada: sólo se guarda con <b>Guardar</b>.',
    irA: { ruta: '/secretaria/agenda', nombre: 'Agenda' },
    pasos: [
      {
        elemento: 'cita-identificacion',
        titulo: 'Tipo de cita',
        texto: '<b>Consulta</b>, <b>cirugía</b> o <b>procedimiento</b>. Una cirugía pide además qué cirugía es.',
        lado: 'bottom',
      },
      {
        elemento: 'cita-paciente',
        titulo: 'Paciente',
        texto:
          'Escribe su nombre o teléfono y elígela de la lista. Si es nueva, regístrala ahí mismo con <b>+ Registrar paciente nuevo</b>: basta con nombre, apellidos y celular; si los da, el <b>correo</b> y sus <b>alergias</b>. Si se parece a alguien ya registrado, te lo avisa antes de crearla otra vez: elige <b>Es este paciente</b> o <b>Es otra persona, continuar</b>. Al guardarla queda elegida, y lo que ya capturaste de la cita no se pierde, aunque canceles el alta. (Ya no hay pantalla de Preregistro: este es el camino para un paciente nuevo.)',
        lado: 'bottom',
      },
      {
        elemento: 'cita-doctor',
        titulo: 'Médico',
        texto: 'Con quién es la cita. Los horarios que se ofrecen después son los de su disponibilidad. Si eres doctora, la cita queda en tu propia agenda.',
        lado: 'bottom',
      },
      {
        elemento: 'cita-fecha-hora',
        titulo: 'Fecha y hora',
        texto:
          'Elige el día y luego un horario libre. Si la cita ya existe, <b>Reagendar</b> te deja moverla.',
        lado: 'top',
      },
      {
        elemento: 'cita-duracion-sala',
        titulo: 'Duración y sala',
        texto: 'Cuánto dura la cita y en qué consultorio será.',
        lado: 'top',
      },
      {
        elemento: 'cita-motivo',
        titulo: 'Motivo (opcional)',
        texto:
          'Una nota corta para el médico: <i>Control</i>, <i>Primera vez</i>, <i>Ultrasonido</i>… Los botones son atajos; puedes escribir otra cosa.',
        lado: 'top',
      },
      {
        elemento: 'cita-triage',
        titulo: 'Signos vitales (triage)',
        texto:
          'Cuando llegue el paciente, tómale los signos aquí con <b>Registrar triage</b>. Sin ellos no se puede pasar a sala.',
        lado: 'top',
      },
      {
        elemento: 'cita-estado',
        titulo: 'El camino de una cita',
        texto:
          '<b>Confirmar</b> cuando el paciente confirme → <b>Pasar a sala</b> cuando ya tenga signos vitales (el médico recibe el aviso) → cuando el médico abre la consulta, la cita pasa sola a <b>En consulta</b> → el médico la finaliza al terminar. Si el paciente sale a mitad de la consulta, <b>Regresar a sala</b>; si el médico la abrió antes de que llegara, <b>Salir sin atender</b> la deja como estaba. <b>Cancelar cita</b> pide el motivo.',
        lado: 'top',
      },
      {
        elemento: 'cita-cobrar',
        titulo: 'Cobrar la cita',
        texto:
          'Si el paciente ya está en sala o ya la atendieron hoy, <b>Cobrar</b> abre el registro de pago con esta cita elegida. Si ya se cobró, lo dice y no deja cobrarla otra vez. Sólo lo ves si tienes permiso de cobrar.',
        lado: 'top',
      },
      {
        elemento: 'cita-reenviar-confirmacion',
        titulo: 'Reenviar la confirmación',
        texto:
          'Si cambiaste la fecha o la hora, <b>Reenviar confirmación</b> le manda al paciente el correo con la cita actualizada. Sólo dice «se reenvió» si de verdad se envió; si el paciente no tiene correo, te lo avisa.',
        lado: 'top',
      },
      {
        elemento: 'cita-guardar',
        titulo: 'Guardar',
        texto:
          'Los cambios de los campos se guardan con este botón. Los cambios de estado (confirmar, pasar a sala, cancelar) se aplican en cuanto los pulsas.',
        lado: 'top',
        alinear: 'end',
      },
    ],
  },
  {
    id: 'signos-formulario',
    version: 1,
    titulo: 'Tomar los signos vitales',
    resumen: 'Peso, talla, presión, temperatura y motivo de consulta.',
    grupo: 'Recepción',
    // Sin ruta: el mismo formulario se abre desde la agenda, desde Triage y
    // desde la consulta del médico.
    requiere: ['triage.create'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.MASTER],
    // El médico lo ve por permiso: desde el commit 4c7dce6 recibe triage.create
    // para tomar los signos en consulta cuando nadie lo hizo en sala.
    contexto: 'signos-formulario',
    comoLlegar:
      'Abre el formulario de signos vitales: en recepción, desde <b>Triage</b> o la <b>Agenda</b>; en consulta, con <b>Registrar signos vitales</b>. Dentro, pulsa <b>¿Cómo se llena?</b>. Nada se guarda hasta que pulses <b>Guardar</b>.',
    pasos: [
      {
        elemento: 'signos-peso-talla',
        titulo: 'Peso y talla',
        texto: 'En kilos y centímetros. Con los dos, el sistema calcula el <b>IMC</b> solo.',
        lado: 'bottom',
      },
      {
        elemento: 'signos-presion',
        titulo: 'Presión y temperatura',
        texto: 'Presión en mmHg (la alta y la baja) y temperatura en °C.',
        lado: 'bottom',
      },
      {
        elemento: 'signos-motivo',
        titulo: 'Motivo de consulta',
        texto: 'Lo que el paciente dice que la trae hoy, con sus palabras. El médico lo ve al abrir la consulta.',
        lado: 'top',
      },
      {
        elemento: 'signos-guardar',
        titulo: 'Guardar',
        texto:
          'Al guardar, el médico ya ve estos signos en su consulta. Si te equivocaste, vuelve a abrirlo y corrígelo.',
        lado: 'top',
        alinear: 'end',
      },
    ],
  },
  {
    id: 'triage',
    version: 3,
    titulo: 'Triage del día',
    resumen: 'Los pacientes de hoy que todavía no tienen signos vitales.',
    grupo: 'Recepción',
    ruta: '/secretaria/triage',
    requiere: ['triage.create'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.MASTER],
    pasos: [
      {
        elemento: 'triage-lista',
        titulo: 'Quién falta por signos vitales',
        texto:
          'Las citas de hoy confirmadas o en sala, por hora. Se actualiza sola cuando vuelves a esta ventana. Si ya le tomaste los signos, sigue en la lista: el botón abre lo que registraste para corregirlo. La que ya está <b>En consulta</b> no sale: está con el médico, que le toma los signos ahí si faltan.',
        lado: 'top',
      },
      {
        elemento: 'triage-signos',
        titulo: 'Tomar los signos',
        texto:
          'Abre el formulario de ese paciente. Después, desde la <b>Agenda</b>, ya la puedes pasar a sala.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'pacientes',
    version: 5,
    titulo: 'Pacientes',
    resumen: 'El directorio: buscar, registrar y abrir el expediente de cada paciente.',
    grupo: 'Recepción',
    ruta: '/secretaria/pacientes',
    requiere: ['patients.read'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.DOCTOR, Role.MASTER],
    pasos: [
      {
        elemento: 'pacientes-nuevo',
        titulo: 'Registrar un paciente',
        texto:
          'Antes de registrar, búscala: registrarla dos veces parte su expediente en dos y el médico no ve todo su historial.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'pacientes-buscar',
        titulo: 'Buscar',
        texto: 'Por nombre, teléfono o correo.',
        lado: 'bottom',
      },
      {
        elemento: 'pacientes-incompletas',
        titulo: 'Fichas incompletas',
        texto:
          'Un paciente dado de alta al agendar puede quedar sin fecha de nacimiento. Este filtro muestra solo esas, para completarlas cuando venga a consulta.',
        lado: 'bottom',
      },
      {
        elemento: 'pacientes-tabla',
        titulo: 'La lista',
        texto: 'Nombre, número de expediente, teléfono, edad y sucursal. Un <b>punto amarillo</b> junto al nombre quiere decir que a su ficha le falta algo; pasa el cursor para ver qué. Nunca impide agendarla ni atenderla.',
        lado: 'top',
      },
      {
        elemento: 'pacientes-historial',
        titulo: 'Abrir expediente',
        texto: 'Todo lo del paciente está en su expediente: sus consultas, estudios, documentos e imágenes. Es el mismo para todos; cada quien ve ahí lo que le toca. Los archivos se suben desde el expediente.',
        lado: 'left',
      },
      {
        elemento: 'pacientes-mas',
        titulo: 'Más acciones',
        texto: 'En <b>⋯</b>: <b>Editar ficha</b> (teléfono, dirección, fecha de nacimiento, alergias o su médico titular; los antecedentes los captura el médico en el expediente), <b>Agendar</b> y <b>Ver sus citas</b>.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'documentos',
    version: 5,
    titulo: 'Documentos del paciente',
    resumen: 'Ver, subir y corregir los documentos de un paciente, desde su expediente.',
    grupo: 'Recepción',
    ruta: '/pacientes/:patientId/expediente',
    // El permiso de la pantalla (el expediente); la pestaña pide documents.read.
    requiere: ['patients.read'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.DOCTOR, Role.MASTER],
    // «Documentos» ya no es una pantalla del menú (plan 32, punto 6): vive en
    // el expediente de cada paciente.
    comoLlegar:
      'Los documentos ya no tienen pantalla propia: viven en el expediente de cada paciente. En <b>Pacientes</b> (o con el buscador de arriba) abre su <b>Expediente</b> y elige la pestaña <b>Documentos</b>.',
    irA: { ruta: '/secretaria/pacientes', nombre: 'Pacientes' },
    pasos: [
      {
        titulo: 'Los documentos, en el expediente',
        texto:
          'Las referencias y notas de otro médico y los demás archivos del paciente están en la pestaña <b>Documentos</b> de su expediente. Este recorrido sólo señala, no sube ni borra nada.',
      },
      {
        elemento: 'expediente-pestanas',
        titulo: 'La pestaña Documentos',
        texto: 'Ábrela para ver sus documentos con su tipo y fecha, abrirlos o descargarlos, y subir uno nuevo.',
        lado: 'bottom',
      },
      {
        elemento: 'expediente-subir',
        titulo: 'Subir archivo',
        texto:
          'Un solo botón para todo. Si es el resultado de un estudio que se le pidió, se adjunta a su orden; si es un estudio de otro lugar, va a <b>Estudios</b>; una referencia de otro médico va aquí, a <b>Documentos</b>. Los resultados ya no se repiten en Documentos: un aviso dice cuántos hay y te lleva a Estudios.',
        lado: 'left',
      },
      {
        // Solo aparece si la sesión puede corregir ese documento; si no, se salta.
        elemento: 'documentos-corregir',
        titulo: 'Si se subió al paciente equivocado',
        texto:
          'Con los tres puntos lo <b>mueves al paciente correcto</b> o lo <b>anulas</b>, siempre con el motivo. Nada se borra: el archivo se conserva y queda registrado quién lo corrigió. Si tú lo subiste, puedes corregirlo en las primeras 24 horas; después, pídeselo al médico o a la administración.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'recepcion-entrega',
    version: 6,
    titulo: 'Entregar órdenes de estudio',
    resumen: 'Imprimir a cada paciente su orden, con vista previa, y marcarla como entregada.',
    grupo: 'Recepción',
    ruta: '/secretaria/resultados',
    requiere: ['clinical_tracking.deliver_order'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.DOCTOR, Role.MASTER],
    contexto: 'panel-entrega',
    comoLlegar:
      'En <b>Órdenes y resultados</b>, abre la pestaña <b>Por entregar</b>. Este recorrido sólo señala: no imprime ni marca nada.',
    irA: { ruta: '/secretaria/resultados', nombre: 'Órdenes y resultados' },
    pasos: [
      {
        elemento: 'resultados-pestanas',
        titulo: 'Las dos tareas del mostrador',
        texto:
          '<b>Por entregar</b>: darle al paciente el papel de su orden. <b>Subir resultado</b>: adjuntar lo que entregó el laboratorio.',
        lado: 'bottom',
      },
      {
        elemento: 'entrega-buscar',
        titulo: 'Buscar',
        texto: 'Por nombre del paciente, estudio o folio. Marca <b>Ver también las ya entregadas</b> si buscas una que ya salió.',
        lado: 'bottom',
      },
      {
        elemento: 'entrega-paciente',
        titulo: 'Una tarjeta por paciente',
        texto: 'Todos los estudios del día de ese paciente juntos, cada uno con su folio.',
        lado: 'top',
      },
      {
        elemento: 'entrega-imprimir-paciente',
        titulo: 'Imprimir su orden de hoy',
        texto:
          '<b>Imprimir orden de hoy</b> junta en un papel solo los estudios de hoy que se le están entregando. Si necesitas todos sus estudios pendientes, de cualquier día, están en la pestaña <b>Subir resultado</b>. Si el paciente tiene órdenes de dos doctoras sale un botón por doctora, porque cada papel lleva la firma de quien lo pidió. Primero ves el PDF y eliges <b>Separado por destino</b> (una hoja por lugar al que va) o <b>Todo en una hoja</b>; desde ahí imprimes (en una tableta o celular, con <b>Abrir / Compartir</b>). <b>Solo este estudio</b> reimprime una hoja suelta.',
        lado: 'left',
      },
      {
        elemento: 'entrega-marcar',
        titulo: 'Marcar entregada',
        texto:
          'Cuando el paciente ya tiene su papel. Sólo dice «entregada» si el sistema lo guardó, y no cambia el estado del estudio.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'recepcion-resultados',
    version: 3,
    titulo: 'Subir resultados de estudios',
    resumen: 'Adjuntar a cada estudio el archivo del laboratorio y revisar lo que ya se subió.',
    grupo: 'Recepción',
    ruta: '/secretaria/resultados',
    requiere: ['clinical_tracking.attach_result'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.DOCTOR, Role.MASTER],
    contexto: 'panel-resultados',
    comoLlegar:
      'En <b>Órdenes y resultados</b>, abre la pestaña <b>Subir resultado</b>. Este recorrido sólo señala: no sube nada.',
    irA: { ruta: '/secretaria/resultados', nombre: 'Órdenes y resultados' },
    pasos: [
      {
        elemento: 'resultados-buscar',
        titulo: 'Buscar',
        texto: 'Por nombre del paciente, estudio o folio (el número que trae impreso la orden).',
        lado: 'bottom',
      },
      {
        elemento: 'resultados-atrasados',
        titulo: 'Los atrasados',
        texto:
          '<b>Solo atrasados</b> deja los estudios que ya pasaron su plazo sin resultado. Cada uno dice cuántos días lleva. Normalmente eres tú quien llama al paciente o al laboratorio.',
        lado: 'bottom',
      },
      {
        elemento: 'resultados-lista',
        titulo: 'Una tarjeta por paciente',
        texto: 'Sus estudios que esperan resultado, cada uno con su folio y su estado.',
        lado: 'top',
      },
      {
        elemento: 'resultados-subir',
        titulo: 'Adjuntar el resultado',
        texto:
          'Elige uno o varios archivos (PDF o fotos) para ese estudio. Si alguno no se sube, se queda en la lista con el motivo.',
        lado: 'left',
      },
      {
        elemento: 'resultados-seguimiento',
        titulo: 'Registrar seguimiento',
        texto:
          'Si llamaste y todavía no hay resultado, escribe por qué y cuándo volver a revisarlo. Hasta esa fecha deja de salir como atrasado, y el médico ve quién lo registró y cuándo.',
        lado: 'left',
      },
      {
        elemento: 'resultados-ver-archivo',
        titulo: 'Ver lo que ya subiste',
        texto:
          'Abre aquí mismo los archivos ya subidos, para confirmar que es el sobre correcto y que no se subió dos veces.',
        lado: 'left',
      },
    ],
  },
]
