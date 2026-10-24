/**
 * Recorridos de cobros: registrar pagos sin cobrar doble, la consulta express,
 * "Mis cobros" del médico y el corte de caja.
 *
 * En el menú, /finanzas/pagos se llama «Cobros» y /finanzas «Corte de caja»;
 * los textos usan esos nombres porque son los que la persona ve.
 *
 * Estas pantallas las está rediseñando el plan 23 (cobros por doctora). Los
 * pasos apuntan a los ids acordados con ese trabajo; mientras no existan, se
 * saltan solos y el recorrido muestra sólo lo que sí hay.
 *
 * El médico y recepción comparten rutas (/finanzas/pagos, /finanzas) pero no
 * el trabajo que hacen ahí, así que además del permiso sus recorridos se
 * separan con `soloRoles`: ambas tienen payments.read.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

const RECEPCION = [Role.SECRETARIA, Role.ADMIN, Role.MASTER]

export const RECORRIDOS_COBROS: Recorrido[] = [
  {
    id: 'pagos-recepcion',
    version: 6,
    titulo: 'Cobros y recibos',
    resumen: 'Registrar un pago, revisar lo cobrado y no cobrar dos veces la misma cita.',
    grupo: 'Cobros',
    ruta: '/finanzas/pagos',
    requiere: ['payments.read'],
    roles: RECEPCION,
    soloRoles: RECEPCION,
    pasos: [
      {
        titulo: 'Los cobros de la clínica',
        texto:
          'Aquí se registra lo que paga cada paciente y se envían recibos. Una regla antes de empezar: <b>antes de cobrar, revisa si el médico ya cobró esa cita</b>.',
      },
      {
        elemento: 'pagos-registrar',
        titulo: 'Registrar un pago',
        texto:
          '<b>Registrar pago</b> abre el formulario de cobro. Ahí eliges la cita atendida del paciente, el monto y cómo pagó (efectivo, tarjeta o transferencia). Si el paciente llegó <b>sin cita</b>, también se cobra desde aquí, como consulta express.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'pagos-selector-doctora',
        titulo: 'Por doctora',
        texto: 'Por omisión ves <b>todas</b>. Elige un médico para ver sólo sus cobros.',
        lado: 'bottom',
      },
      {
        elemento: 'pagos-filtros',
        titulo: 'Filtros',
        texto: 'Por fechas, por método de pago o buscando al paciente o el concepto.',
        lado: 'bottom',
      },
      {
        elemento: 'pagos-tabla',
        titulo: 'Lo cobrado',
        texto:
          'Cada pago con el paciente, el médico, el concepto, el monto, el método, <b>quién lo recibió</b> y la referencia si fue con tarjeta o transferencia.',
        lado: 'top',
      },
      {
        elemento: 'pagos-imprimir',
        titulo: 'Imprimir comprobante',
        texto:
          'El botón de la impresora abre la impresión de un comprobante sencillo: datos de la clínica, folio del pago, fecha, concepto, monto y método. No es factura, y así lo dice el papel. Sirve también para el paciente que no tiene correo.',
        lado: 'left',
      },
      {
        elemento: 'pagos-recibo',
        titulo: 'Enviar recibo',
        texto: 'Le llega al paciente por correo, con el recibo en PDF.',
        lado: 'left',
      },
      {
        elemento: 'pagos-anular',
        titulo: 'Anular un pago',
        texto:
          'Si se registró por error. Pide el motivo y el pago no se borra: queda anulado y a la vista, para que el corte cuadre. Si era de una consulta express, aparece además una casilla, ya marcada, para cancelar también esa consulta si no ocurrió.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'pago-registrar',
    version: 7,
    titulo: 'Registrar un pago sin cobrar doble',
    resumen: 'Cómo leer el formulario de cobro y qué hacer si la cita ya se cobró.',
    grupo: 'Cobros',
    ruta: '/finanzas/pagos',
    requiere: ['payments.read'],
    roles: RECEPCION,
    soloRoles: RECEPCION,
    contexto: 'pago-modal',
    comoLlegar:
      'En <b>Cobros</b>, pulsa <b>Registrar pago</b> y, dentro del formulario, <b>¿Cómo se llena?</b>. Abrir el formulario no cobra nada: sólo se registra si lo guardas.',
    irA: { ruta: '/finanzas/pagos', nombre: 'Cobros' },
    pasos: [
      {
        elemento: 'pago-citas',
        titulo: 'Las citas de hoy en sala, en consulta y atendidas',
        texto:
          'Aquí eliges qué cita se está cobrando: las de hoy <b>En sala</b> o <b>En consulta</b> (si se cobra antes de que termine) y las atendidas. Lo pendiente va arriba, y cada una dice su estado de cobro. Una cita que sigue agendada o confirmada no sale aquí: pásala a sala desde la <b>Agenda</b> para cobrarla. Si llegaste con <b>Cobrar</b> desde una cita de la Agenda, aquí sale sólo esa cita, ya elegida.',
        lado: 'bottom',
      },
      {
        elemento: 'pago-cita-cobrada',
        titulo: 'Esta cita ya está cobrada',
        texto:
          'Las que ya se cobraron llevan la insignia <b>Cobrada</b> y quedan bloqueadas. Debajo dice quién la cobró, a qué hora, cuánto y cómo, por ejemplo <i>«Ya la cobró Sofía a las 3:25 p. m.: $800.00 con efectivo»</i>. No se vuelven a cobrar.',
        lado: 'bottom',
      },
      {
        elemento: 'pago-cobro-adicional',
        titulo: '¿De verdad hay que cobrar algo más?',
        texto:
          'Por ejemplo un estudio que se hizo después. Para eso es <b>cobro adicional</b>: es una acción aparte, pide confirmación y se guarda con <b>Registrar cobro adicional</b>, para que nunca pase por accidente. Lo mismo con una cita que el médico marcó sin cargo.',
        lado: 'top',
      },
      {
        // Los pasos del cobro sin cita viven en la otra pestaña del formulario
        // y no se ven desde ésta; sin este paso, quien abre el recorrido aquí
        // nunca se entera de la consulta express.
        elemento: 'pago-citas',
        titulo: '¿Y si llegó sin cita?',
        texto:
          'Abre la pestaña <b>Cobro suelto (sin cita)</b> y vuelve a tocar <b>¿Cómo se llena?</b>: ahí se explica la consulta express y el cobro de otros conceptos.',
        lado: 'bottom',
      },
      {
        elemento: 'pago-cobro-suelto',
        titulo: 'Cobro sin cita',
        texto:
          'En la pestaña <b>Cobro suelto (sin cita)</b>: para cuando no hay una cita agendada que cobrar. Busca al paciente y elige doctora.',
        lado: 'top',
      },
      {
        elemento: 'pago-que-se-cobra',
        titulo: '¿Qué se cobra?',
        texto:
          'Lo primero es decir qué es:<ul><li><b>Consulta sin cita (express)</b>: el paciente pasó a consulta sin haber agendado.</li><li><b>Otro concepto</b>: un estudio, un producto o cualquier cosa que no sea una consulta.</li></ul>',
        lado: 'bottom',
      },
      {
        elemento: 'pago-express',
        titulo: 'La consulta express',
        texto:
          'Al cobrarla, el sistema <b>crea la cita por ti</b>, ya como atendida, y en la agenda sale marcada <b>Express</b>. Así la consulta queda registrada y cobrada una sola vez: no la agendes aparte. Se guarda con <b>Registrar consulta y pago</b>; si el paciente ya tuvo consulta hoy, el sistema te lo avisa para que no se registre dos veces, y sólo si de verdad fue otra consulta eliges <b>«Sí, fue otra consulta: registrarla»</b>.',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'mis-cobros',
    version: 2,
    titulo: 'Mis cobros',
    resumen: 'Lo que cobraste tú en consulta y lo que cobró recepción por tus consultas.',
    grupo: 'Cobros',
    ruta: '/finanzas/pagos',
    requiere: ['payments.read'],
    roles: [Role.DOCTOR],
    soloRoles: [Role.DOCTOR],
    pasos: [
      {
        elemento: 'pagos-mis-cobros',
        titulo: 'Tus cobros',
        texto:
          'Sólo lo tuyo: lo que cobraste tú al finalizar la consulta y lo que cobró recepción por tus pacientes.',
        lado: 'bottom',
      },
      {
        elemento: 'pagos-filtros',
        titulo: 'Filtra por fechas',
        texto: 'Para revisar un día, una semana o el mes.',
        lado: 'bottom',
      },
      {
        elemento: 'pagos-tabla',
        titulo: 'Cada cobro',
        texto: 'Con el paciente, el monto, el método y <b>quién lo recibió</b>: tú o recepción.',
        lado: 'top',
      },
      {
        elemento: 'pagos-imprimir',
        titulo: 'Imprimir comprobante',
        texto:
          'El botón de la impresora abre la impresión de un comprobante sencillo: datos de la clínica, folio del pago, fecha, concepto, monto y método. No es factura, y así lo dice el papel. Sirve también para el paciente que no tiene correo.',
        lado: 'left',
      },
      {
        elemento: 'pagos-anular',
        titulo: 'Si te equivocaste',
        texto: 'Anúlalo indicando el motivo. No se borra: queda anulado a la vista, para que el corte cuadre.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'corte-caja',
    version: 4,
    titulo: 'El corte de caja',
    resumen: 'Cuánto entró, por método de pago y por doctora.',
    grupo: 'Cobros',
    ruta: '/finanzas',
    requiere: ['payments.cashcut'],
    roles: [Role.SECRETARIA, Role.ADMIN, Role.DOCTOR, Role.MASTER],
    pasos: [
      {
        elemento: 'finanzas-fechas',
        titulo: 'El periodo',
        texto: 'Elige el día (o rango) del corte.',
        lado: 'bottom',
      },
      {
        // Sólo lo ve la secretaria con corte acotado a sus doctoras.
        elemento: 'finanzas-mi-caja',
        titulo: 'Mi caja: lo que recibí',
        texto:
          'Todo lo que recibiste tú en la sucursal, de cualquier doctora, sin importar el selector de doctoras. Su <b>efectivo</b> es el que debe coincidir con tu caja al cerrar.',
        lado: 'bottom',
      },
      {
        elemento: 'finanzas-selector-doctora',
        titulo: 'Por doctora',
        texto:
          'Todas juntas o una sola. Útil para entregarle a cada médico lo suyo. En recepción sólo aparecen <b>los médicos que apoyas</b> (con «Todas mis doctoras» para verlas juntas): administración decide a quién apoyas y si puedes ver su corte. Ese corte suma sólo a tus doctoras: tu caja es <b>Mi caja</b>, arriba.',
        lado: 'bottom',
      },
      {
        elemento: 'finanzas-sin-asignadas',
        titulo: 'Todavía no apoyas a ninguna doctora',
        texto:
          'Administración aún no te asignó doctoras, así que el corte por doctora no puede mostrarte nada. <b>Mi caja</b> sí muestra lo que recibiste. Para lo demás, pide que te asignen en <b>Usuarios</b>.',
        lado: 'bottom',
      },
      {
        elemento: 'finanzas-resumen',
        titulo: 'Los totales',
        texto: 'Lo que entró en el periodo.',
        lado: 'bottom',
      },
      {
        elemento: ['finanzas-bloque-doctoras', 'finanzas-por-doctora'],
        titulo: 'Por doctora',
        texto: 'Cuánto corresponde a cada médico en el periodo.',
        lado: 'top',
      },
      {
        elemento: 'finanzas-por-quien-recibio',
        titulo: 'Por quién lo recibió',
        texto:
          'Lo que cobró recepción y lo que cobró cada médico en su consultorio: quién tiene el dinero y quién tiene que entregar qué. En recepción tu propia fila no sale aquí: lo tuyo está en <b>Mi caja</b>.',
        lado: 'top',
      },
      {
        elemento: 'finanzas-corte',
        titulo: 'Desglose por método',
        texto:
          'Efectivo, tarjeta y transferencia por separado. Este <b>efectivo</b> incluye lo que cada médico cobró en su consultorio, que no está en la caja de recepción: para cuadrar una caja, mira lo que recibió cada quien (en recepción, <b>Mi caja</b>).',
        lado: 'top',
      },
    ],
  },
  {
    id: 'consulta-cobro',
    version: 1,
    titulo: 'El cobro al finalizar la consulta',
    resumen: 'Si lo cobraste tú, si lo cobra recepción, o si fue sin cargo.',
    grupo: 'Cobros',
    ruta: '/doctor/consultation/:appointmentId',
    requiere: ['doctor.appointments.read'],
    roles: [Role.DOCTOR, Role.ADMIN, Role.MASTER],
    contexto: 'consulta-cobro',
    comoLlegar:
      'Dentro de una consulta en curso, pulsa <b>Finalizar consulta</b>: se abre la confirmación con el cobro y ahí está <b>¿Cómo se llena?</b>. Abrirla no finaliza nada; la consulta sólo se cierra si confirmas.',
    irA: { ruta: '/doctor/appointments', nombre: 'Mis consultas' },
    pasos: [
      {
        elemento: 'consulta-cobro',
        titulo: '¿Quién cobra esta consulta?',
        texto:
          '<ul><li><b>Lo cobré yo</b>: ya recibiste el pago en el consultorio. Eliges el servicio (el precio viene puesto y lo puedes ajustar) y el método; con tarjeta, la referencia.</li><li><b>Lo cobra recepción</b>: es lo que viene marcado; secretaría recibe el aviso para cobrar.</li><li><b>Sin cargo</b>: cortesía o revisión incluida; pide el motivo.</li></ul>Así recepción sabe si ya se cobró y nadie cobra dos veces.',
        lado: 'top',
      },
    ],
  },
]
