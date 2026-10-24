/**
 * Cómo moverse por el sistema. Antes arrancaba sola la primera vez; ahora,
 * como todo recorrido, sólo cuando la persona lo pide desde el centro de ayuda.
 *
 * Hay una por rol porque "lo que haces aquí" cambia mucho entre una doctora y
 * recepción, pero la parte de cómo moverse por el sistema es la misma.
 */
import { Role } from '../../types'
import type { PasoRecorrido, Recorrido } from '../tipos'

/** Pasos comunes: cómo se mueve una por la aplicación. */
const navegacion: PasoRecorrido[] = [
  {
    elemento: 'menu-lateral',
    titulo: 'El menú',
    texto:
      'Desde aquí llegas a cada sección. Sólo ves las que te corresponden: si te falta alguna, pídesela a la administración.',
    lado: 'right',
  },
  {
    elemento: 'abrir-menu',
    titulo: 'Menú en pantallas pequeñas',
    texto: 'En el celular o la tableta el menú se esconde. Tócalo aquí para abrirlo.',
    lado: 'bottom',
  },
  {
    elemento: 'barra-pestanas',
    titulo: 'Pestañas, como en el navegador',
    texto:
      'En la computadora, cada sección que abres queda en una pestaña, con el mismo ícono del menú; la que estás viendo lleva una línea de color abajo. Puedes ir y volver entre ellas <b>sin perder lo que estabas escribiendo</b>: por ejemplo, revisar la agenda a media consulta. Con <b>clic derecho</b> sobre una pestaña eliges «Cerrar las demás» o «Cerrar todas». Caben 8: al abrir la novena se cierra la que usaste hace más tiempo, y el aviso te deja <b>Deshacer</b>. Si no caben a lo ancho, usa las flechas de los lados. En el celular no se muestran, para dejar lugar a la pantalla; lo que escribes tampoco se pierde al cambiar de sección desde el menú.',
    lado: 'bottom',
  },
  {
    elemento: 'encabezado-buscar',
    titulo: 'Buscar una paciente',
    texto:
      'Escribe su nombre, su teléfono o su número de expediente y elige de la lista: se abre su expediente. Funciona desde cualquier pantalla, también con <b>Ctrl K</b> (<b>⌘K</b> en Mac). En el celular es la lupa. Solo busca pacientes, no citas.',
    lado: 'bottom',
  },
  {
    elemento: 'notificaciones',
    titulo: 'Avisos',
    texto:
      'La campana abre tus <b>avisos</b>. Su número rojo cuenta lo que te pide hacer algo —una paciente en sala, una consulta por cobrar— y que sigue pendiente. Lo nuevo aparece además debajo de esta barra y <b>se queda hasta que lo cierres</b>, sin interrumpir lo que escribes. Si GEMS está en otra pestaña, su título cuenta lo pendiente: «(2) GEMS».',
    lado: 'bottom',
    alinear: 'end',
  },
  {
    elemento: 'perfil',
    titulo: 'Tu cuenta',
    texto: 'Aquí cambias tu contraseña y cierras sesión. Ciérrala siempre si la computadora es compartida.',
    lado: 'bottom',
    alinear: 'end',
  },
  {
    elemento: 'sucursal',
    titulo: 'Sucursal',
    texto: 'Si trabajas en más de una sucursal, aquí eliges en cuál estás. Lo que ves y registras es de esa sucursal.',
    lado: 'bottom',
    alinear: 'end',
  },
  {
    elemento: 'ayuda',
    titulo: 'Cuando tengas dudas, aquí',
    texto:
      'Aquí está el <b>centro de ayuda</b>: el recorrido de la pantalla en la que estés, un recorrido completo de tu trabajo y un buscador («receta», «cobrar», «signos»). Nada se abre solo y ningún recorrido guarda ni cambia nada: sólo señala y explica.',
    lado: 'bottom',
    alinear: 'end',
  },
]

const cierre = (texto: string): PasoRecorrido => ({
  titulo: '¡Listo!',
  texto,
})

export const RECORRIDOS_GENERALES: Recorrido[] = [
  {
    id: 'bienvenida-doctora',
    version: 9,
    titulo: 'Cómo moverte por el sistema',
    resumen: 'El menú, las pestañas, el buscador de pacientes, los avisos y dónde encontrar ayuda.',
    grupo: 'General',
    roles: [Role.DOCTOR],
    pasos: [
      {
        titulo: 'Te damos la bienvenida',
        texto:
          'Este recorrido dura un minuto. Te enseña dónde está cada cosa para que tu consulta fluya: la agenda del día, la nota, la receta y el cierre. Puedes cerrarlo cuando quieras con la ✕ o la tecla Esc.',
      },
      ...navegacion,
      cierre(
        'Al entrar llegas a tu tablero, con tus citas de hoy y lo que tienes pendiente; el logo de arriba del menú y <b>Inicio</b> te regresan ahí. Cuando tengas una duda en cualquier pantalla, el botón <b>?</b> te la explica paso a paso.',
      ),
    ],
  },
  {
    id: 'bienvenida-recepcion',
    version: 9,
    titulo: 'Cómo moverte por el sistema',
    resumen: 'El menú, las pestañas, el buscador de pacientes, los avisos y dónde encontrar ayuda.',
    grupo: 'General',
    roles: [Role.SECRETARIA],
    pasos: [
      {
        titulo: 'Te damos la bienvenida',
        texto:
          'Este recorrido dura un minuto. Te enseña dónde está cada cosa: la agenda, las pacientes, los signos vitales, los <b>Cobros</b> y el <b>Corte de caja</b>. Puedes cerrarlo cuando quieras con la ✕ o la tecla Esc.',
      },
      ...navegacion,
      cierre(
        'Al entrar llegas a la <b>Agenda</b>, y el logo de arriba del menú te regresa ahí. Cada pantalla tiene su propio recorrido en el botón <b>?</b>, y los formularios su botón <b>¿Cómo se llena?</b>. Sólo se abren cuando tú los pides.',
      ),
    ],
  },
  {
    id: 'bienvenida-administracion',
    version: 8,
    titulo: 'Cómo moverte por el sistema',
    resumen: 'El menú, las pestañas, el buscador de pacientes, los avisos y dónde encontrar ayuda.',
    grupo: 'General',
    roles: [Role.ADMIN, Role.MASTER],
    pasos: [
      {
        titulo: 'Te damos la bienvenida',
        texto:
          'Este recorrido dura un minuto. Te enseña cómo moverte por el sistema; cada pantalla de administración (usuarios, servicios, reportes, permisos) tiene además su propio recorrido.',
      },
      ...navegacion,
      cierre(
        'Al entrar llegas a tu pantalla de inicio (<b>Inicio</b> en el menú; a Master, su <b>Panel de Control</b>), y el logo de arriba del menú te regresa ahí. Cuando des de alta a alguien nuevo, cuéntale del botón <b>?</b>: ahí tiene las guías de cada pantalla y un recorrido completo de su trabajo.',
      ),
    ],
  },
]
