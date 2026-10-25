/**
 * Recorridos del trabajo clínico: el día del médico, la consulta y el expediente.
 *
 * Ninguno arranca solo: al abrir una consulta suele haber un paciente
 * enfrente, y un recuadro que tapa la pantalla en ese momento estorba más de lo
 * que enseña. Se ven desde el centro de ayuda cuando el médico lo pide.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

const CLINICO = [Role.DOCTOR, Role.ADMIN, Role.MASTER]

export const RECORRIDOS_DOCTORA: Recorrido[] = [
  {
    id: 'doctora-dashboard',
    version: 7,
    titulo: 'Tu inicio',
    resumen:
      'Tu día de un vistazo: citas de hoy, quién espera en sala, resultados y pendientes, y las acciones de siempre.',
    grupo: 'Consulta médica',
    ruta: '/doctor/dashboard',
    requiere: ['doctor.dashboard.read'],
    roles: CLINICO,
    pasos: [
      {
        elemento: 'doctora-saludo',
        titulo: 'Tu pantalla de inicio',
        texto:
          'Aquí empieza tu día. Arriba ves la fecha, la sucursal y cuándo se actualizó: la pantalla se refresca sola cada minuto y al volver a ella. Si algo no se pudo actualizar, lo dice aquí.',
        lado: 'bottom',
      },
      {
        // Solo aparece cuando hay alguno; si no, el paso se salta.
        elemento: 'doctora-criticos',
        titulo: 'Resultados críticos sin cerrar',
        texto:
          'Si valoraste un resultado como <b>Crítico</b>, aparece aquí hasta que se cierra: al documentar que se lo comunicaste o entregaste al paciente (en mano, llamada, WhatsApp o correo), o al revisarlo dentro de una consulta suya de hoy. Revisarlo desde la bandeja <b>no</b> lo cierra.',
        lado: 'bottom',
      },
      {
        elemento: 'doctora-indicadores',
        titulo: 'Cómo va el día',
        texto:
          '<b>Citas de hoy</b> (sin las canceladas) y cuántas faltan, quién está <b>en sala de espera</b> y si ya tiene signos vitales, cuántas <b>atendiste</b> y los <b>resultados por revisar</b>. Toca uno para ir directo. Si un número no se pudo cargar verás «—», no un cero.',
        lado: 'bottom',
      },
      {
        elemento: 'doctora-citas-hoy',
        titulo: 'Tu agenda de hoy',
        texto:
          'En orden de hora y con la edad de cada paciente. Las pestañas filtran: <b>Por atender</b>, <b>En sala</b>, <b>En consulta</b> y <b>Atendidas</b>. Cada cita dice su estado en palabras y avisa si está en sala <b>Sin signos</b>.',
        lado: 'top',
      },
      {
        elemento: 'doctora-cita',
        titulo: 'Para empezar una consulta',
        texto:
          'Toca la cita y se abre su consulta en una pestaña nueva. Si es de hoy, la cita pasa sola a <b>En consulta</b> en la agenda de recepción.',
        lado: 'bottom',
      },
      {
        elemento: 'doctora-pendientes',
        titulo: 'Pendientes y seguimiento',
        texto:
          'Resultados críticos y sin revisar, y las cirugías programadas de las próximas dos semanas, cada uno con su número. Cuando están en cero lo dicen («al día»); si no se pudieron consultar, también, con <b>Reintentar</b>.',
        lado: 'left',
      },
      {
        elemento: 'doctora-acciones',
        titulo: 'Acciones rápidas',
        texto:
          '<b>Siguiente paciente</b> abre la consulta de quien espera en sala (o la siguiente por hora). Además, agendar, buscar paciente, órdenes y resultados y cobrar. Solo ves las que tu cuenta puede usar.',
        lado: 'left',
      },
      {
        elemento: 'doctora-calendario',
        titulo: 'Tu mes',
        texto:
          'Los días con punto tienen citas. Toca un día para abrir la <b>Agenda</b> en esa fecha.',
        lado: 'left',
      },
      {
        elemento: 'doctora-recientes',
        titulo: 'Pacientes recientes',
        texto:
          'Las últimas pacientes que atendiste, sin repetir. Tócala para abrir su expediente; <b>Ver todas</b> te lleva a tu historial de consultas.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'doctora-mis-consultas',
    version: 6,
    titulo: 'Mis consultas',
    resumen: 'Buscar una consulta pasada o próxima y abrirla: el historial de tus consultas.',
    grupo: 'Consulta médica',
    ruta: '/doctor/appointments',
    requiere: ['doctor.appointments.read'],
    roles: CLINICO,
    pasos: [
      {
        elemento: 'consultas-resumen',
        titulo: 'Tu día',
        texto: 'Cuántas consultas tienes hoy, cuántas faltan y cuántas ya atendiste. Lo de hoy, paso a paso, está en tu <b>Inicio</b>; aquí buscas en tu historial.',
        lado: 'bottom',
      },
      {
        elemento: 'consultas-periodos',
        titulo: 'Elige el periodo',
        texto: 'Abre en <b>Últimos 30 días y próximas</b>. También: <b>Hoy</b>, <b>Mañana</b>, <b>Esta semana</b>, <b>Próximos 30 días</b> o <b>Todo mi historial</b>.',
        lado: 'bottom',
      },
      {
        elemento: 'consultas-filtros',
        titulo: 'Filtra la lista',
        texto: 'Por <b>Estado</b> y en qué orden. En <b>Filtros avanzados</b> eliges un rango exacto de fechas y el tipo de cita. La pantalla recuerda los filtros y la página: al volver de una consulta sigues donde estabas.',
        lado: 'bottom',
      },
      {
        elemento: 'consultas-buscar',
        titulo: 'Busca al paciente',
        texto: 'Escribe parte del nombre, su <b>número de expediente</b> o su <b>teléfono</b>. Busca en todo el periodo, no solo en la página que ves.',
        lado: 'bottom',
      },
      {
        elemento: 'consultas-vista',
        titulo: 'Lista o calendario',
        texto: 'En <b>Calendario</b> ves los días con consultas del mes; toca uno para ver sus consultas en la lista.',
        lado: 'left',
      },
      {
        elemento: 'consultas-lista',
        titulo: 'Tus consultas',
        texto: 'Cada renglón trae fecha y hora, el paciente con su expediente y teléfono, el estado y el motivo en una línea (<b>ver más</b> lo abre). La carpeta abre su expediente y el menú <b>⋯</b> lleva al día en la agenda.',
        lado: 'top',
      },
      {
        elemento: 'agenda-insignia-express',
        titulo: 'Consultas express',
        texto:
          '<b>«Express · registrada al cobrar»</b> quiere decir que el paciente llegó sin cita y la consulta se registró al cobrarla, en recepción o tú misma desde <b>Cobros → Registrar pago → Cobro suelto</b>. Cuenta como una consulta atendida más.',
        lado: 'top',
      },
      {
        elemento: 'consultas-iniciar',
        titulo: 'Un botón según el estado',
        texto:
          '<b>Iniciar consulta</b> si es de hoy y está por atender; <b>Continuar consulta</b> si ya la empezaste; <b>Ver consulta</b> si ya se atendió (modo lectura); <b>Ver detalles</b> si es de otro día o se canceló.',
        lado: 'left',
      },
      {
        elemento: 'consultas-paginas',
        titulo: 'Todas tus consultas, por páginas',
        texto: 'Abajo dice cuántas hay en total y eliges 25, 50 o 100 por página. Con <b>Anterior</b> y <b>Siguiente</b> llegas a las más viejas.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'doctora-consulta',
    version: 16,
    titulo: 'La consulta, paso a paso',
    resumen: 'Signos vitales, nota, receta, plan, escalas, certificado y cómo finalizar sin perder nada.',
    grupo: 'Consulta médica',
    ruta: '/doctor/consultation/:appointmentId',
    requiere: ['doctor.appointments.read'],
    roles: CLINICO,
    comoLlegar:
      'Se ve dentro de una consulta. Ábrela desde tu <b>Inicio</b> o desde <b>Mis consultas</b>. Para practicar sin tocar nada, usa <b>Ver consulta</b> en una ya finalizada: se abre en modo lectura. <b>Iniciar consulta</b>, en cambio, sí empieza la atención de ese paciente: si la cita es de hoy, pasa a <b>En consulta</b> en la agenda de recepción. Úsalo sólo cuando la vayas a atender.',
    irA: { ruta: '/doctor/appointments', nombre: 'Mis consultas' },
    pasos: [
      {
        titulo: 'La consulta en una sola pantalla',
        texto:
          'Todo lo de este paciente está aquí, de arriba hacia abajo en el orden en que se atiende. Este recorrido sólo señala: <b>no guarda, no cambia ni finaliza nada</b>.',
      },
      {
        elemento: 'consulta-estado',
        titulo: 'En consulta',
        texto:
          'Al abrir la consulta de hoy, la cita pasa sola a <b>En consulta</b>: recepción y la agenda saben que el paciente está contigo. Si sale sin que termines (a un estudio, a que le tomen los signos), usa <b>Regresar a sala</b>; si la abriste antes de que llegara, <b>Salir sin atender</b> la deja como estaba. Al finalizar queda <b>Atendida</b>.',
        lado: 'left',
      },
      {
        elemento: 'consulta-pestanas',
        titulo: 'Pestañas del paciente',
        texto:
          '<b>Consulta</b> es la atención de hoy. <b>Expediente</b> es el mismo expediente del paciente, con sus secciones (Resumen, Consultas, Estudios, Escalas, Documentos, Imágenes, Consentimientos…), y se consulta sin salir: lo que llevas escrito en la nota no se pierde al cambiar de pestaña. En su sección <b>Estudios</b> está la gráfica de cómo han ido las valoraciones de sus resultados, y en <b>Escalas</b>, la evolución de cada escala (por ejemplo, el ODI antes y después de la cirugía).',
        lado: 'bottom',
      },
      {
        elemento: 'consulta-paciente',
        titulo: 'El paciente',
        texto: 'Nombre, edad, teléfono y, si tiene, sus <b>alergias</b> resaltadas en amarillo. Si a su ficha le falta la fecha de nacimiento, abajo aparece una línea gris, «Completa sus datos»: se llena con el lápiz junto a su edad, o se oculta con la ×. No detiene la consulta.',
        lado: 'bottom',
      },
      {
        elemento: 'consulta-datos-paciente',
        titulo: 'Completar sus datos aquí mismo',
        texto:
          'Si falta la fecha de nacimiento o el teléfono, lo capturas desde aquí sin salir de la consulta.',
        lado: 'bottom',
      },
      {
        elemento: 'consulta-signos',
        titulo: 'Signos vitales',
        texto:
          'Presión, temperatura, peso e IMC que tomaron en sala. Si nadie los tomó, lo verás dicho aquí: <b>Sin signos vitales</b>.',
        lado: 'left',
      },
      {
        elemento: 'consulta-signos-boton',
        titulo: 'Registrar o corregir los signos',
        texto:
          'Si no hubo quien pasara al paciente por triage, tómalos tú con <b>Registrar signos vitales</b>. Si hay un dato mal capturado, <b>Corregir signos vitales</b>. Es el mismo formulario que usa recepción.',
        lado: 'left',
      },
      {
        elemento: ['consulta-nota', 'nota-formulario'],
        titulo: '1. Nota de consulta',
        texto:
          'Síntomas, exploración, diagnóstico y plan. Se guarda con su botón <b>Guardar Notas</b>; ya guardada, el botón cambia a <b>Actualizar</b> y a su lado dice <b>Actualizado:</b> con la fecha. Puedes guardarla incompleta y terminarla después.',
        lado: 'top',
      },
      {
        elemento: ['consulta-receta', 'receta-formulario'],
        titulo: '2. Receta',
        texto:
          'Agregas los medicamentos uno por uno y la guardas o la imprimes. Si necesitas otra receta en la misma consulta, hay un botón aparte para eso. El recorrido detallado de la receta está en el botón <b>?</b> de arriba.',
        lado: 'top',
      },
      {
        elemento: 'consulta-seccion-plan-clinico',
        titulo: '3. Plan clínico',
        texto:
          'Órdenes de estudios, vacunas y seguimiento de medicamentos. Viene cerrado para no alargar la pantalla: ábrelo con el interruptor <b>Mostrar</b>. Adentro, <b>Estudios de esta consulta</b> enseña todos los que pediste hoy, agrupados por destino (laboratorio, imagen, otros), y el número del título es el de la lista. <b>Nueva orden</b> abre el formulario: agrega varios estudios con <b>Agregar otro estudio</b> o precárgalos con <b>Usar una plantilla</b>; cada uno puede llevar su propia prioridad (si no, toma la de la orden). Al crearla sale un solo botón, <b>Imprimir orden</b>. <b>Imprimir todo</b> junta en un papel los estudios de la consulta; antes de imprimir ves el PDF y eliges <b>Separado por destino</b> o <b>Todo en una hoja</b>. En cada estudio, <b>Ver resultado</b> abre sus archivos y <b>Anexar resultado</b> sube el que te mandó el paciente; en el menú <b>⋯</b> están <b>Reimprimir solo este estudio</b> y cancelar. <b>Vacunas y medicamentos</b> va abajo, en su propio bloque plegable.',
        lado: 'top',
      },
      {
        // Solo se ve con el plan clínico abierto y algún estudio pedido; si no, se salta.
        elemento: 'consulta-imprimir-todo',
        titulo: 'Imprimir todo',
        texto:
          'Un papel con todos los estudios de esta consulta. Primero ves el PDF real: ahí eliges <b>Separado por destino</b> (una hoja para cada lugar al que va el paciente) o <b>Todo en una hoja</b>, y desde ahí imprimes o descargas. En el celular, en vez de <b>Imprimir</b> sale <b>Abrir / Compartir</b>, que lo manda a la impresora o al WhatsApp del teléfono.',
        lado: 'bottom',
      },
      {
        elemento: [
          'consulta-resultados-pendientes',
          'consulta-revisar-resultado',
          'consulta-ver-resultado',
        ],
        titulo: 'Revisar el resultado con el paciente',
        texto:
          'Arriba, <b>Resultados pendientes del paciente</b> junta los resultados de consultas anteriores que siguen sin revisar o con un crítico abierto; <b>Revisar</b> los abre con la consulta de hoy. En los estudios de esta consulta, <b>Revisar resultado</b> abre el archivo y el formulario. Revisarlo aquí, con el paciente y en la consulta de hoy, cierra la incidencia si era <b>Crítico</b>. <b>Ver resultado</b> abre el PDF y las fotos en un carrusel. En el menú <b>⋯</b> puedes anexar un archivo (también a una ya revisada), registrar una nota rápida sin archivo o documentar que se lo comunicaste.',
        lado: 'left',
      },
      // Escalas neurológicas (Cortex, feat/escalas-neuro)
      {
        elemento: 'consulta-seccion-escalas-neurologicas',
        titulo: '4. Escalas neurológicas',
        texto:
          'Glasgow, NIHSS, Hunt y Hess, WFNS, Fisher modificada, Spetzler-Martin, Rankin, ASIA, Karnofsky, mJOA, ODI, NDI, dolor (ENA) y Barthel. Viene cerrada: ábrela con <b>Mostrar</b>. Con la sección cerrada, una insignia dice cuántas escalas lleva esta consulta.',
        lado: 'top',
      },
      {
        // Solo se ve con la sección abierta; si no, se salta.
        elemento: 'escalas-selector',
        titulo: 'Elegir la escala',
        texto:
          'En <b>¿Qué escala vas a aplicar?</b> eliges una. Cada ítem se responde tocando su opción; el número de la izquierda son sus puntos. Si cambias a otra escala, lo que llevabas respondido en la primera se queda guardado en pantalla hasta que regreses.',
        lado: 'bottom',
      },
      {
        elemento: 'escalas-resultado',
        titulo: 'Puntaje sugerido',
        texto:
          'Se calcula mientras respondes, con su interpretación y la fuente de la escala. Es una sugerencia: el puntaje que queda en el expediente lo calcula el sistema al guardar. Lo marcado <b>(verificar)</b> está pendiente de revisión médica contra la fuente.',
        lado: 'left',
      },
      {
        elemento: 'escalas-guardar',
        titulo: 'Guardar y ver el historial',
        texto:
          '<b>Guardar escala</b> se activa cuando no falta ningún ítem. Solo después de que el sistema la registra aparece el aviso verde con el puntaje guardado; si algo falla, tus respuestas se quedan y puedes reintentar. Abajo está el <b>Historial</b> de esa escala; una mal capturada se <b>Anula</b> con su motivo: no se borra, queda tachada.',
        lado: 'left',
      },
      {
        elemento: 'consulta-seccion-consentimiento-informado',
        titulo: '5. Consentimiento informado',
        texto:
          'Para procedimientos: lo preparas aquí y el paciente lo revisa y firma en la misma pantalla.',
        lado: 'top',
      },
      {
        elemento: 'consulta-seccion-certificado-medico',
        titulo: '6. Certificado médico',
        texto: 'Incapacidad, aptitud u otro. Ábrelo con <b>Mostrar</b> sólo si lo necesitas.',
        lado: 'top',
      },
      {
        elemento: 'consulta-finalizar',
        titulo: 'Finalizar la consulta',
        texto:
          'Cuando termines, <b>Finalizar consulta</b> pide confirmación antes de cerrar. Ahí mismo indicas el <b>cobro</b>: si lo cobraste tú, si lo cobra recepción, o si fue sin cargo. Al finalizar, la cita queda como atendida. En el celular el botón se esconde mientras escribes, para no tapar el campo, y vuelve al salir de él.',
        lado: 'top',
      },
      {
        elemento: 'consulta-reabrir',
        titulo: 'Consulta cerrada',
        texto:
          'Esta consulta ya se finalizó y está en modo lectura. Si faltó algo, <b>Reabrir consulta</b> la vuelve a abrir; queda registrado quién y cuándo.',
        lado: 'bottom',
      },
      {
        titulo: 'Eso es todo',
        texto:
          'Puedes repetir este recorrido cuando quieras desde el botón <b>?</b> de arriba. Ahí también están los detallados de la nota, la receta, el certificado y los signos vitales.',
      },
    ],
  },
  {
    id: 'doctora-nota',
    version: 3,
    titulo: 'La nota de consulta (SOAP)',
    resumen: 'Qué va en cada campo de la nota y cómo guardarla.',
    grupo: 'Consulta médica',
    ruta: '/doctor/consultation/:appointmentId',
    requiere: ['doctor.appointments.read'],
    roles: CLINICO,
    comoLlegar:
      'Se ve dentro de una consulta en curso, que es donde está el formulario de la nota (en una ya finalizada sólo se lee). Ábrela desde tu <b>Inicio</b> o <b>Mis consultas</b> cuando vayas a atender al paciente.',
    irA: { ruta: '/doctor/appointments', nombre: 'Mis consultas' },
    pasos: [
      {
        elemento: 'nota-sintomas',
        titulo: 'S · Síntomas',
        texto: 'Lo que refiere el paciente: qué siente, desde cuándo y cómo.',
        lado: 'top',
      },
      {
        elemento: 'nota-exploracion',
        titulo: 'O · Exploración',
        texto: 'Hallazgos de la exploración física y resultados que tengas a la mano.',
        lado: 'top',
      },
      {
        elemento: 'nota-diagnostico',
        titulo: 'A · Diagnóstico',
        texto: 'Diagnóstico principal y diferenciales.',
        lado: 'top',
      },
      {
        elemento: 'nota-plan',
        titulo: 'P · Plan',
        texto: 'Tratamiento, estudios y seguimiento. Lo que escribas aquí acompaña a la receta.',
        lado: 'top',
      },
      {
        elemento: 'nota-guardar',
        titulo: 'Guardar',
        texto:
          'La nota se guarda sólo al pulsar <b>Guardar Notas</b>. Ya guardada, el botón dice <b>Actualizar</b> y a su lado ves <b>Actualizado:</b> con la fecha. Si la dejas incompleta te avisa, pero te deja guardarla y terminarla después.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'doctora-receta',
    version: 4,
    titulo: 'La receta',
    resumen: 'Agregar medicamentos, indicaciones, imprimir y hacer una segunda receta.',
    grupo: 'Consulta médica',
    ruta: '/doctor/consultation/:appointmentId',
    requiere: ['doctor.appointments.read'],
    roles: CLINICO,
    comoLlegar:
      'Se ve dentro de una consulta en curso, que es donde está el formulario de la receta (en una ya finalizada sólo se lee). Ábrela desde tu <b>Inicio</b> o <b>Mis consultas</b> cuando vayas a atender al paciente.',
    irA: { ruta: '/doctor/appointments', nombre: 'Mis consultas' },
    pasos: [
      {
        elemento: 'receta-alergias',
        titulo: 'Primero, las alergias',
        texto:
          'Arriba de la receta se repiten las alergias registradas del paciente. Si dice que <b>no se pudieron leer</b>, no des por hecho que no tiene: pulsa <b>Reintentar</b> o pregúntale antes de recetar. «Sin alergias registradas» quiere decir que nadie las capturó, no que no tenga.',
        lado: 'bottom',
      },
      {
        elemento: 'receta-captura',
        titulo: 'Agrega un medicamento',
        texto:
          'Busca el medicamento y completa dosis, frecuencia y duración. Luego <b>Agregar a receta</b>. Repite por cada medicamento.',
        lado: 'top',
      },
      {
        elemento: 'receta-detalles',
        titulo: 'Presentación, vía, cantidad e indicaciones',
        texto:
          'Opcionales, por medicamento. La <b>cantidad a surtir</b> es lo que más ayuda en la farmacia. Las <b>indicaciones de este medicamento</b> se imprimen debajo de él; las generales van al pie.',
        lado: 'top',
      },
      {
        elemento: 'receta-lista',
        titulo: 'Lo que lleva la receta',
        texto: 'Se apilan aquí. Con el lápiz corriges uno; con el bote lo quitas.',
        lado: 'top',
      },
      {
        elemento: 'receta-indicaciones',
        titulo: 'Indicaciones adicionales',
        texto:
          'Opcional. Se imprimen al pie. Los botones de abajo son atajos para las más comunes.',
        lado: 'top',
      },
      {
        elemento: 'receta-motivo',
        titulo: '¿Imprimir el motivo de la consulta?',
        texto:
          'Viene apagado a propósito: la receta viaja a la farmacia y cualquiera la puede leer. Enciéndelo sólo cuando convenga para este paciente; propone lo que dijo en el triage y lo puedes corregir.',
        lado: 'top',
      },
      {
        elemento: 'receta-botones',
        titulo: 'Vista previa, guardar o imprimir',
        texto:
          '<b>Vista previa</b> muestra cómo saldrá. <b>Guardar e imprimir</b> es lo habitual. Si sólo guardas, puedes imprimirla después.',
        lado: 'top',
      },
      {
        elemento: 'receta-otra',
        titulo: '¿Otra receta en la misma consulta?',
        texto:
          'Para eso es <b>Agregar otra receta</b>. Así nunca se mezcla por descuido con la que ya imprimiste.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'doctora-certificado',
    version: 1,
    titulo: 'El certificado médico',
    resumen: 'Elegir el tipo, llenar el diagnóstico y descargar el PDF.',
    grupo: 'Consulta médica',
    ruta: '/doctor/consultation/:appointmentId',
    requiere: ['doctor.appointments.read'],
    roles: CLINICO,
    // Sólo aplica con la sección abierta; cerrada, no hay nada que señalar.
    contexto: 'certificado-formulario',
    comoLlegar:
      'Dentro de una consulta en curso, abre la sección <b>5. Certificado médico</b> con <b>Mostrar</b>. Abrirla no genera nada: el certificado sólo se guarda con <b>Generar certificado</b>.',
    irA: { ruta: '/doctor/appointments', nombre: 'Mis consultas' },
    pasos: [
      {
        elemento: 'certificado-tipo',
        titulo: 'Tipo de certificado',
        texto:
          '<b>Incapacidad laboral</b> (con días de reposo), <b>aptitud</b> u <b>otro</b>. Cada uno pide sus datos.',
        lado: 'bottom',
      },
      {
        elemento: 'certificado-botones',
        titulo: 'Generar y descargar',
        texto:
          '<b>Generar certificado</b> lo guarda en el expediente; después aparece <b>Descargar PDF</b> para imprimirlo o enviarlo.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'doctora-expediente',
    version: 9,
    titulo: 'El expediente de un paciente',
    resumen: 'Todo lo de un paciente en un solo lugar: resumen, consultas, estudios, escalas, documentos, imágenes y consentimientos.',
    grupo: 'Consulta médica',
    ruta: '/pacientes/:patientId/expediente',
    requiere: ['patients.read'],
    roles: [Role.DOCTOR, Role.SECRETARIA, Role.ADMIN, Role.MASTER],
    comoLlegar:
      'Se ve en el expediente de un paciente. En <b>Pacientes</b> (o con el buscador de arriba), busca al paciente y abre su <b>Expediente</b>.',
    irA: { ruta: '/secretaria/pacientes', nombre: 'Pacientes' },
    pasos: [
      {
        elemento: 'expediente-encabezado',
        titulo: 'Quién es',
        texto:
          'Su nombre, edad, número de expediente y teléfono, y sus <b>alergias</b>: «sin registro» quiere decir que nadie las capturó, no que no tenga. Quien lleva lo clínico ve además los resultados críticos o atrasados; tócalos para ir a sus estudios. Un punto junto al nombre avisa que a su ficha le falta la fecha de nacimiento.',
        lado: 'bottom',
      },
      {
        elemento: ['expediente-consulta-hoy', 'expediente-agendar'],
        titulo: 'Su consulta de hoy o agendarla',
        texto:
          'Si tiene cita contigo hoy, <b>Abrir la consulta de hoy</b>. Si no, <b>Agendar</b> abre la Agenda con ella ya elegida: en GEMS una consulta siempre nace de una cita.',
        lado: 'left',
      },
      {
        // Solo el médico lo ve; para los demás este paso se salta.
        elemento: 'expediente-resumen',
        titulo: 'Resumen clínico en PDF',
        texto:
          'Para referir al paciente o entregarlo a una aseguradora. Eliges qué incluir, lo revisas en la vista previa y solo entonces se emite con su folio. Lo que no esté capturado sale como «Sin registro».',
        lado: 'left',
      },
      {
        elemento: 'expediente-pestanas',
        titulo: 'Sus secciones',
        texto:
          '<b>Resumen</b>, <b>Consultas</b> (cada cita con su nota, receta y certificado), <b>Estudios</b>, <b>Escalas</b>, <b>Documentos</b>, <b>Imágenes</b>, <b>Consentimientos</b> y <b>Equipo</b>. Cada quien ve las que le tocan: recepción ve la ficha, las citas, los documentos de referencia y si sus estudios ya tienen resultado, sin lo clínico. Cada sección se carga al abrirla, y el expediente recuerda cuál dejaste abierta.',
        lado: 'bottom',
      },
      {
        elemento: 'expediente-fotografia',
        titulo: 'Cómo va hoy',
        texto: 'Su última consulta y el motivo, la próxima cita, cuántos estudios esperan resultado o tu revisión y sus últimos resultados con su valoración.',
        lado: 'top',
      },
      // Escalas neurológicas (Cortex, feat/escalas-neuro)
      {
        elemento: 'expediente-escalas',
        titulo: 'Evolución de las escalas',
        texto:
          'En <b>Escalas</b> eliges una de las que tiene aplicadas y ves su gráfica en el tiempo, con el cambio escrito desde la primera aplicación (en verde si mejoró, en ámbar si empeoró). Debajo, la tabla con todas, incluidas las anuladas, tachadas y con su motivo; las anuladas no entran en la gráfica.',
        lado: 'top',
      },
      {
        elemento: 'expediente-imagenes',
        titulo: 'Todas sus imágenes',
        texto:
          'En <b>Imágenes</b> salen juntas las fotos de la consulta y los estudios de imagen (ultrasonidos, rayos X, mastografías) que trajo o que son resultado de una orden, de lo más nuevo a lo más viejo. Filtra por categoría o año. Recepción ve solo los estudios que ella recibió.',
        lado: 'top',
      },
      {
        elemento: 'expediente-episodios',
        titulo: 'Episodios y seguimiento',
        texto: 'Un episodio agrupa un motivo de seguimiento (una hernia de disco, un tumor en vigilancia) a lo largo de varias consultas.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'historial-paciente',
    version: 3,
    titulo: 'Las consultas de un paciente',
    resumen: 'Sus citas anteriores y lo que se hizo en cada una.',
    grupo: 'Consulta médica',
    ruta: '/pacientes/:patientId/expediente',
    requiere: ['patients.read'],
    roles: [Role.DOCTOR, Role.SECRETARIA, Role.ADMIN, Role.MASTER],
    comoLlegar:
      'En el expediente del paciente, abre la pestaña <b>Consultas</b>. Desde <b>Pacientes</b> o el buscador de arriba se abre su expediente.',
    irA: { ruta: '/secretaria/pacientes', nombre: 'Pacientes' },
    pasos: [
      {
        elemento: 'historial-resumen',
        titulo: 'Resumen',
        texto: 'Datos del paciente y cuántas citas lleva.',
        lado: 'bottom',
      },
      {
        elemento: 'historial-citas',
        titulo: 'Cita por cita',
        texto:
          'De la más reciente a la más antigua. Toca una para desplegarla: el personal médico ve sus signos vitales, la nota y las recetas; recepción ve la cita y su estado.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'doctora-perfil',
    version: 9,
    titulo: 'Tu perfil médico',
    resumen:
      'Cédulas, logo, firma, horario y cómo salen impresas tu receta y tus órdenes de estudio.',
    grupo: 'Consulta médica',
    ruta: '/doctor/profile',
    requiere: ['doctor_profile.read'],
    roles: CLINICO,
    pasos: [
      {
        titulo: 'Tu perfil sale en cada receta',
        texto:
          'Lo que llenes aquí se imprime en tus recetas, certificados y órdenes de estudio. Vale la pena completarlo una vez, con calma. Va en orden: primero tus datos, el logo y la firma; después cómo se ven la receta y la orden. En el celular cada sección se abre con su botón.',
      },
      {
        elemento: 'perfil-incompleto',
        titulo: 'Lo que falta',
        texto:
          'Este aviso dice qué te falta para que la receta salga completa; tócalo y te lleva a esa sección. Desaparece cuando ya está todo.',
        lado: 'bottom',
      },
      {
        elemento: 'perfil-datos',
        titulo: 'Datos profesionales',
        texto:
          'Especialidad, cédula profesional y de especialidad, R.G.P., SSA y consejo, y cómo te contacta el paciente: teléfono del consultorio, <b>celular/WhatsApp</b> y <b>correo de contacto</b>. En la receta, el celular y el correo salen solo si los enciendes; en la orden salen de fábrica (puedes apagarlos en <b>Mi orden de estudio</b>). No olvides <b>Guardar cambios</b> al final del bloque.',
        lado: 'right',
      },
      {
        elemento: 'perfil-consultorios',
        titulo: 'Tus consultorios',
        texto: 'Las sucursales donde atiendes.',
        lado: 'left',
      },
      {
        elemento: 'perfil-logo',
        titulo: 'Logo',
        texto: 'Una imagen PNG del logo del consultorio. Va en el encabezado de la receta.',
        lado: 'left',
      },
      {
        elemento: 'perfil-firma',
        titulo: 'Firma',
        texto:
          'Tu firma en PNG (de preferencia con fondo transparente). Se imprime en recetas, certificados y órdenes. Aquí va sólo la firma: el logo del consultorio se sube en <b>Logo</b>.',
        lado: 'left',
      },
      {
        elemento: 'perfil-receta',
        titulo: 'Así se ve tu receta',
        texto:
          'Ajusta el nombre y lo que se muestra, y revisa la vista previa de la hoja antes de imprimir la primera.',
        lado: 'bottom',
      },
      {
        elemento: 'perfil-estilo-firma',
        titulo: 'Cómo se ve tu firma',
        texto:
          'Letra, tamaño, negritas, cursiva y color de tu nombre. Si subes una imagen de firma, la imagen va arriba y tu nombre debajo.',
        lado: 'top',
      },
      {
        elemento: 'perfil-color-leyenda',
        titulo: 'Color y leyenda',
        texto:
          'Un solo color tiñe títulos, marcos y subrayados; si es muy claro, el sistema lo oscurece para que se lea impreso. La leyenda del pie la escribes tú. Las alergias siempre salen en rojo.',
        lado: 'top',
      },
      {
        elemento: 'perfil-orden',
        titulo: 'Tu orden de estudio',
        texto:
          'La orden tiene su propio membrete, igual de editable que la receta: nombre, qué datos salen, color, letra de la firma y una leyenda adicional (la advertencia de que es una solicitud sale siempre). Empezó como una copia de tu receta y lo que ves aquí es lo que se imprime hoy. La <b>cédula profesional sale siempre</b>, porque el laboratorio la exige.',
        lado: 'top',
      },
      {
        elemento: 'perfil-orden-copiar',
        titulo: 'Volver a copiar de la receta',
        texto:
          'Si cambias tu receta y quieres lo mismo en la orden, esto vuelve a traerlo. No se guarda solo: revísalo y pulsa <b>Guardar configuración de la orden</b>.',
        lado: 'left',
      },
      {
        elemento: 'perfil-orden-modo',
        titulo: 'Cómo se reparte el papel',
        texto:
          '<b>Separado por destino</b> saca una hoja para laboratorio, otra para imagen y otra para lo demás; <b>Todo en una hoja</b> los junta. Es con lo que abre la vista previa al imprimir, y ahí lo puedes cambiar para una orden.',
        lado: 'top',
      },
      {
        elemento: 'perfil-plazos-atrasado',
        titulo: 'Cuándo está atrasado un estudio',
        texto:
          'Los días sin resultado para que un estudio salga como <b>Atrasado</b> en tu bandeja: de fábrica 7 si es urgente, 15 si es preferente y 30 si es rutinario. Cámbialos y pulsa <b>Guardar plazos</b>. Si el estudio tiene «realizar a más tardar», cuenta esa fecha.',
        lado: 'top',
      },
      {
        elemento: 'perfil-orden-vista-previa',
        titulo: 'Vista previa de la orden',
        texto:
          'Es la orden real con un paciente de ejemplo, con lo que tienes en pantalla aunque no lo hayas guardado. Nada cambia hasta que pulsas <b>Guardar configuración de la orden</b>.',
        lado: 'left',
      },
      {
        elemento: 'perfil-recordatorios',
        titulo: 'Recordatorios',
        texto:
          'Con cuánta anticipación le llega al paciente el <b>correo</b> que le recuerda su cita. El aviso para ti, una hora antes, se activa en la campana, en <b>Preferencias</b>.',
        lado: 'right',
      },
      {
        elemento: 'perfil-horario',
        titulo: 'Horario y bloqueos',
        texto:
          'Tu horario semanal y los días que no atiendes (vacaciones, congresos). Recepción sólo ofrece citas dentro de lo que pongas aquí.',
        lado: 'right',
      },
    ],
  },
  {
    id: 'ordenes-resultados',
    version: 8,
    titulo: 'Órdenes y resultados',
    resumen:
      'Tu bandeja de estudios por paciente: registras, anexas, revisas y comunicas cada resultado, e imprimes la orden.',
    grupo: 'Consulta médica',
    ruta: '/doctor/results',
    requiere: ['clinical_tracking.read'],
    roles: CLINICO,
    pasos: [
      {
        titulo: 'La bandeja de estudios',
        texto:
          'Aquí no se te escapa un estudio: cada paciente es una tarjeta con los estudios que le pediste, desde que falta el resultado hasta que ya se lo comunicaste. Este recorrido sólo señala, no cambia nada.',
      },
      {
        elemento: 'bandeja-franja',
        titulo: 'Cómo va tu bandeja',
        texto:
          'Cuántos estudios esperan resultado, cuántos esperan tu revisión, los <b>Críticos abiertos</b>, los <b>Atrasados</b> y los urgentes o preferentes. Cuenta todas las páginas. Toca un segmento para ver solo eso; tócalo otra vez para volver a todo lo pendiente.',
        lado: 'bottom',
      },
      {
        elemento: 'bandeja-buscar',
        titulo: 'Buscar',
        texto: 'Escribe el nombre del paciente, el estudio o el número de orden.',
        lado: 'bottom',
      },
      {
        elemento: 'bandeja-filtro',
        titulo: 'Qué mostrar',
        texto:
          '<b>Todo lo pendiente</b> junta lo que falta por hacer. También puedes ver sólo los <b>Pendientes de resultado</b>, los de <b>Resultado por revisar</b>, las <b>Revisadas sin comunicar</b>, los <b>Resultados críticos</b>, los <b>Atrasados</b> o los <b>Urgentes y preferentes pendientes</b>. <b>Todos</b> incluye las cerradas.',
        lado: 'bottom',
      },
      {
        elemento: 'bandeja-paciente',
        titulo: 'Una tarjeta por paciente',
        texto:
          'Cerrada es un solo renglón: su nombre, cuántos estudios tiene, cuántos siguen pendientes y cuántos esperan tu revisión. Tócala para abrirla o cerrarla. Un paciente con un resultado <b>Crítico</b> sube al principio de la bandeja con su marca en rojo y se abre sola.',
        lado: 'top',
      },
      {
        elemento: 'bandeja-plegar',
        titulo: 'Abrir o cerrar todas',
        texto: '<b>Expandir todo</b> y <b>Contraer todo</b>. La bandeja recuerda en este equipo cuáles dejaste abiertas.',
        lado: 'bottom',
      },
      {
        elemento: 'bandeja-grupo',
        titulo: 'De dónde salió cada estudio',
        texto:
          'Cada grupo dice de qué consulta y de qué fecha viene, y si fue un lote. Si la consulta ya se atendió, <b>Ver la consulta</b> la abre en modo de lectura.',
        lado: 'top',
      },
      {
        elemento: 'bandeja-orden',
        titulo: 'Cada estudio',
        texto:
          'Una fila por estudio, con su prioridad y su estado: <b>Pendiente de resultado</b>, <b>Resultado recibido</b> o <b>Revisada</b>.',
        lado: 'top',
      },
      {
        elemento: 'bandeja-rastro',
        titulo: 'Qué pasó y quién',
        texto:
          'Cada estudio dice su <b>Última actualización</b> con fecha y quién la hizo. <b>Ver historial</b> abre su línea de tiempo: solicitud, impresión, cada archivo, cada seguimiento, revisión y comunicación. Lo de antes de que el sistema guardara quién dice <b>sin registro</b>.',
        lado: 'top',
      },
      {
        elemento: 'bandeja-registrar',
        titulo: 'Lo que toca hacer',
        texto:
          'Cada fila tiene un solo botón con lo que sigue: <b>Registrar resultado</b>, <b>Revisar resultado</b> o <b>Documentar comunicación</b>. Se abre un panel a un lado con el archivo a la vista y el formulario; al guardar, la fila cambia ahí mismo.',
        lado: 'left',
      },
      {
        elemento: 'orden-mas-acciones',
        titulo: 'Más acciones',
        texto:
          'En el menú <b>⋯</b>: <b>Ver resultado</b>, <b>Anexar archivo</b> (el estudio que el paciente te mandó por WhatsApp o correo, aunque ya esté revisada), <b>Registrar seguimiento</b> (por qué sigue sin resultado y cuándo volver a revisarlo), <b>Imprimir solo este estudio</b>, y cancelar o rechazar la orden con su motivo. Un estudio <b>Atrasado</b> lo dice en su fila, con los días que lleva sin resultado.',
        lado: 'left',
      },
      {
        elemento: 'bandeja-imprimir-paciente',
        titulo: 'Imprimir sus pendientes',
        texto:
          '<b>Imprimir pendientes del paciente</b> junta en un papel sólo los estudios que siguen sin resultado; lo que ya tiene resultado no se vuelve a mandar. Antes de imprimir ves el PDF y eliges <b>Separado por destino</b> o <b>Todo en una hoja</b>. Un estudio suelto se imprime desde el menú <b>⋯</b>.',
        lado: 'top',
      },
      {
        titulo: 'Eso es todo',
        texto: 'Puedes repetir este recorrido cuando quieras desde el botón <b>?</b> de arriba.',
      },
    ],
  },
  {
    id: 'resultado-revisar',
    version: 4,
    titulo: 'Registrar o revisar un resultado',
    resumen: 'El panel con el archivo a un lado y lo que escribes del otro.',
    grupo: 'Consulta médica',
    // Sin ruta: el mismo panel se abre en la bandeja y dentro de la consulta.
    requiere: ['clinical_tracking.read'],
    roles: CLINICO,
    contexto: 'resultado-panel',
    comoLlegar:
      'En <b>Órdenes y resultados</b> o en los estudios de una consulta, pulsa <b>Registrar resultado</b>, <b>Revisar resultado</b> o <b>Documentar comunicación</b> en un estudio y, dentro del panel, <b>¿Cómo se llena?</b>. Abrir el panel no guarda nada.',
    irA: { ruta: '/doctor/results', nombre: 'Órdenes y resultados' },
    pasos: [
      {
        elemento: 'resultado-panel',
        titulo: 'El archivo y el formulario juntos',
        texto:
          'A la izquierda, los archivos del resultado (pasa de uno a otro con las flechas o las miniaturas), la indicación clínica y la preparación. A la derecha, lo que escribes.',
        lado: 'left',
      },
      {
        elemento: 'resultado-anexar',
        titulo: 'Anexar un archivo',
        texto:
          'Si el paciente te mandó el estudio por WhatsApp o correo, súbelo aquí: PDF o fotos, uno o varios.',
        lado: 'top',
      },
      {
        elemento: 'resultado-incidencia',
        titulo: 'Cuándo se cierra un crítico',
        texto:
          'Un resultado valorado <b>Crítico</b> queda abierto en tu inicio hasta que documentes que se lo comunicaste o entregaste al paciente, o lo revises dentro de una consulta suya de hoy. Desde la bandeja, <b>Marcar revisada</b> no lo cierra. La revisión siempre se guarda; al guardar, el aviso te dice si la incidencia quedó cerrada o sigue abierta.',
        lado: 'left',
      },
      {
        elemento: 'resultado-comunicacion',
        titulo: 'Comunicación o entrega',
        texto:
          'Elige el medio (en mano, llamada, WhatsApp o correo) y escribe cuándo y a quién. Sin las dos cosas no se puede documentar.',
        lado: 'top',
      },
      {
        elemento: 'resultado-anular',
        titulo: 'Un archivo equivocado',
        texto:
          'Si el archivo es de otro paciente o de otro estudio, pulsa <b>Anular resultado…</b> debajo de ese resultado y escribe el motivo. El resultado y su archivo dejan de contar en la bandeja y en la gráfica, pero no se borran. El aviso te dice cómo quedó la orden y si la incidencia crítica se cerró o sigue abierta. Después sube el correcto. Solo lo puede hacer quien pidió el estudio o la administración.',
        lado: 'top',
      },
      {
        elemento: 'resultado-guardar',
        titulo: 'Guardar',
        texto:
          'Cada resultado lleva su <b>valoración</b>, opcional: Excelente, Bien, Regular, Malo o Crítico; también puedes cambiar la de un resultado anterior. Sin archivo, basta una nota rápida. <b>Marcar revisada</b> cierra la revisión y <b>Documentar comunicación</b> deja constancia de que el paciente ya lo sabe.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'resultado-anexar',
    version: 1,
    titulo: 'Anexar el resultado de un estudio',
    resumen: 'Subir el PDF o las fotos que trajo o mandó el paciente.',
    grupo: 'Consulta médica',
    requiere: ['clinical_tracking.attach_result'],
    roles: [...CLINICO, Role.SECRETARIA],
    contexto: 'anexar-formulario',
    comoLlegar:
      'Pulsa <b>Anexar resultado</b> en un estudio de la consulta, o <b>Anexar archivo</b> en el menú <b>⋯</b> de la bandeja, y dentro del formulario <b>¿Cómo se llena?</b>. Abrirlo no sube nada.',
    pasos: [
      {
        elemento: 'anexar-archivos',
        titulo: 'Los archivos',
        texto:
          'Elige uno o varios: el PDF del laboratorio, la interpretación, las fotos del ultrasonido. Se suben uno por uno y, si alguno falla, se queda en la lista con el motivo.',
        lado: 'bottom',
      },
      {
        elemento: 'anexar-guardar',
        titulo: 'Anexar',
        texto:
          'La fecha del reporte y quién lo emitió son opcionales. El estudio pasa a <b>Resultado recibido</b> sólo cuando el sistema confirma que guardó el archivo.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'resumen-clinico',
    version: 1,
    titulo: 'Emitir el resumen clínico',
    resumen: 'Elegir las secciones, revisar la vista previa y emitirlo con folio.',
    grupo: 'Consulta médica',
    ruta: '/pacientes/:patientId/expediente',
    // El permiso de la pantalla (el expediente); el botón además pide
    // soap_notes.read, y solo lo ve el médico.
    requiere: ['patients.read'],
    roles: [Role.DOCTOR],
    contexto: 'resumen-formulario',
    comoLlegar:
      'En el expediente de un paciente, botón <b>Resumen clínico</b> arriba a la derecha. Abrirlo no emite nada: el folio solo se asigna con <b>Emitir con folio</b>.',
    irA: { ruta: '/secretaria/pacientes', nombre: 'Pacientes' },
    pasos: [
      {
        elemento: 'resumen-secciones',
        titulo: 'Qué incluir',
        texto:
          'Marca las secciones y cuántas consultas. Los datos del paciente, la firma, la fecha y el folio van siempre. La medicación sale como <b>Última receta</b>: GEMS no sabe cuándo termina un tratamiento.',
        lado: 'bottom',
      },
      {
        elemento: 'resumen-vista-previa',
        titulo: 'La vista previa',
        texto: 'Así saldrá el papel, con la marca «Vista previa» y sin folio. Cada cambio en las secciones la vuelve a generar.',
        lado: 'top',
      },
      {
        elemento: 'resumen-emitir',
        titulo: 'Emitir con folio',
        texto:
          'Se activa cuando la vista previa de lo que elegiste ya está a la vista. Al emitir recibe su folio (p. ej. GYG-RES-2026-0001) y queda en la bitácora; si no se pudo emitir, te lo dice y no hay folio.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'seguimiento-registrar',
    version: 2,
    titulo: 'Registrar el seguimiento de un estudio atrasado',
    resumen: 'Dejar escrito por qué un estudio sigue sin resultado y cuándo volver a revisarlo.',
    grupo: 'Consulta médica',
    requiere: ['clinical_tracking.follow_up'],
    roles: [...CLINICO, Role.SECRETARIA],
    contexto: 'seguimiento-formulario',
    comoLlegar:
      'En <b>Órdenes y resultados</b>, menú <b>⋯</b> de un estudio pendiente, <b>Registrar seguimiento</b>; en recepción, el mismo botón en <b>Órdenes y resultados</b> (recepción). Dentro del formulario, <b>¿Cómo se llena?</b>. Abrirlo no guarda nada.',
    pasos: [
      {
        elemento: 'seguimiento-motivo',
        titulo: 'Por qué sigue sin resultado',
        texto:
          'El paciente no se lo ha hecho, está en proceso en el laboratorio, se reagendó, no se localiza al paciente u otro. Con <b>Otro</b>, escribe en la nota qué pasó.',
        lado: 'bottom',
      },
      {
        elemento: 'seguimiento-revisar',
        titulo: 'Volver a revisar el',
        texto:
          'Hasta esa fecha el estudio sale de <b>Atrasados</b>. Al llegar, vuelve a contar si sigue sin resultado.',
        lado: 'top',
      },
      {
        elemento: 'seguimiento-guardar',
        titulo: 'Guardar',
        texto:
          'Queda en el historial del estudio con tu nombre y la fecha. Si no se pudo guardar, el formulario te lo dice y no se cierra.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'subir-archivo',
    version: 1,
    titulo: 'Subir un archivo del paciente',
    resumen: 'Un resultado de su orden, un estudio de otro lugar, una referencia u otro archivo, desde un solo botón.',
    grupo: 'Consulta médica',
    requiere: ['documents.upload', 'clinical_tracking.attach_result'],
    roles: [...CLINICO, Role.SECRETARIA],
    contexto: 'subir-archivo-formulario',
    comoLlegar:
      'En el expediente del paciente, pestaña <b>Estudios</b> o <b>Documentos</b>, botón <b>Subir archivo</b>; dentro, <b>¿Cómo se llena?</b>. Abrirlo no sube nada.',
    pasos: [
      {
        elemento: 'subir-archivo-pregunta',
        titulo: 'La pregunta clave',
        texto:
          '<b>¿Es el resultado de un estudio que se le pidió?</b> Si sí, eliges su orden pendiente y el archivo se adjunta a ella: al médico le llega como resultado por revisar.',
        lado: 'bottom',
      },
      {
        elemento: 'subir-archivo-que',
        titulo: 'Si no es de una orden',
        texto:
          '<b>Estudio de otro lugar</b> va a Estudios (del catálogo o escrito a mano) y se revisa igual que uno propio. Una <b>referencia de otro médico</b> va a Documentos. <b>Otro archivo</b> lo guarda solo el médico.',
        lado: 'bottom',
      },
      {
        elemento: 'subir-archivo-guardar',
        titulo: 'Subir',
        texto: 'Solo dice que se subió cuando el sistema lo confirma. Si algo falla, el formulario se queda abierto con el motivo.',
        lado: 'top',
      },
    ],
  },
]
