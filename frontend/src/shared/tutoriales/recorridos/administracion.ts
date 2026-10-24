/**
 * Recorridos de administración: el tablero, usuarios, servicios, reportes,
 * auditoría, y los de Master (roles, permisos, sucursales).
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

const ADMIN = [Role.ADMIN, Role.MASTER]

export const RECORRIDOS_ADMINISTRACION: Recorrido[] = [
  {
    id: 'admin-dashboard',
    version: 3,
    titulo: 'Tu inicio de administración',
    resumen: 'Cómo va la clínica hoy: lo cobrado, los servicios y el personal.',
    grupo: 'Administración',
    ruta: '/admin/dashboard',
    requiere: ['admin.dashboard.read'],
    roles: ADMIN,
    pasos: [
      {
        elemento: 'admin-kpis',
        titulo: 'Los números del día',
        texto:
          'Lo <b>cobrado hoy</b> y cuántos cobros, los <b>servicios activos</b> y los <b>usuarios</b>. Toca uno para ir a su pantalla. Si un número no se pudo cargar verás «—» y un aviso con <b>Reintentar</b>: no quiere decir cero.',
        lado: 'bottom',
      },
      {
        elemento: 'admin-corte',
        titulo: 'Corte de caja de hoy',
        texto: 'Lo cobrado hoy por método de pago. El detalle completo está en <b>Corte de caja</b>, en el menú.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'usuarios',
    version: 2,
    titulo: 'Usuarios',
    resumen: 'Dar de alta a doctoras y recepción, editar y desactivar cuentas.',
    grupo: 'Administración',
    ruta: '/admin/usuarios',
    requiere: ['users.read'],
    roles: ADMIN,
    pasos: [
      {
        elemento: 'usuarios-nuevo',
        titulo: 'Nuevo usuario',
        texto:
          'Correo, nombre y rol (doctora, secretaria, administración). El rol decide qué ve en el menú; lo fino se ajusta en <b>Permisos</b>.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'usuarios-tabla',
        titulo: 'El personal',
        texto: 'Cada cuenta con su rol y si está activa.',
        lado: 'top',
      },
      {
        elemento: 'usuarios-editar',
        titulo: 'Editar',
        texto:
          'Corrige datos o <b>desactiva</b> la cuenta de quien ya no trabaja aquí. Desactivar no borra lo que registró: su historial sigue en los expedientes.',
        lado: 'left',
      },
      {
        titulo: 'Recepción y sus doctoras',
        texto:
          'Al <b>editar</b> a una secretaria eliges las <b>doctoras que apoya</b> y si <b>puede ver el corte de caja</b> de ellas. En el formulario, el botón <b>¿Cómo se llena?</b> te lo explica paso a paso.',
      },
      {
        titulo: 'Después del alta',
        texto:
          'Cada doctora debe completar <b>Mi perfil médico</b> (cédula, especialidad, logo y firma): con eso salen bien sus recetas y certificados.',
      },
    ],
  },
  {
    id: 'usuario-formulario',
    version: 1,
    titulo: 'Alta y edición de un usuario',
    resumen: 'El tratamiento Dr./Dra., las doctoras que apoya recepción y el permiso de ver su corte.',
    grupo: 'Administración',
    ruta: '/admin/usuarios',
    requiere: ['users.read'],
    roles: ADMIN,
    contexto: 'usuario-modal',
    comoLlegar:
      'En <b>Usuarios</b>, pulsa <b>Nuevo Usuario</b> o <b>Editar</b> y, dentro del formulario, <b>¿Cómo se llena?</b>. Abrirlo no crea ni cambia a nadie: sólo se guarda con su botón.',
    irA: { ruta: '/admin/usuarios', nombre: 'Usuarios' },
    pasos: [
      {
        titulo: 'El formulario de usuario',
        texto:
          'Correo, nombre y rol, como siempre. Aquí te enseñamos los campos nuevos. Algunos sólo aparecen al <b>editar</b> a una secretaria ya dada de alta.',
      },
      {
        elemento: 'usuario-tratamiento',
        titulo: 'Tratamiento',
        texto:
          '<b>Dra.</b>, <b>Dr.</b> o <b>Sin tratamiento</b>: es como aparece la doctora en la agenda, los cobros, las recetas y los avisos.',
        lado: 'bottom',
      },
      {
        elemento: 'usuario-doctoras-que-apoya',
        titulo: 'Doctoras que apoya',
        texto:
          'Las doctoras con las que trabaja esta secretaria. Decide de quién puede ver el corte de caja si se lo concedes abajo.',
        lado: 'top',
      },
      {
        elemento: 'usuario-corte-permiso',
        titulo: 'Puede ver el corte de caja',
        texto:
          'Si lo marcas, en <b>Corte de caja</b> verá lo cobrado de <b>esas doctoras</b>, nada más. Sin la casilla no ve esa pantalla. Si la marcas sin asignarle doctoras, verá un aviso en lugar de los totales.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'servicios',
    version: 1,
    titulo: 'Servicios y precios',
    resumen: 'El catálogo de servicios con su precio y duración.',
    grupo: 'Administración',
    ruta: '/admin/servicios',
    requiere: ['services.create'],
    roles: ADMIN,
    pasos: [
      {
        titulo: 'Para qué sirve este catálogo',
        texto:
          'Es la lista de lo que cobra la clínica. Al cobrar, el precio sale de aquí ya puesto, y así cada quien no escribe uno distinto.',
      },
      {
        elemento: 'servicios-nuevo',
        titulo: 'Nuevo servicio',
        texto: 'Nombre, precio, duración en minutos y, si quieres, una descripción.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'servicios-tabla',
        titulo: 'El catálogo',
        texto: 'Con su precio, duración y si está activo.',
        lado: 'top',
      },
      {
        elemento: 'servicios-editar',
        titulo: 'Cambiar un precio',
        texto: 'Aplica a los cobros nuevos; lo ya cobrado conserva el precio con que se cobró.',
        lado: 'left',
      },
      {
        elemento: 'servicios-desactivar',
        titulo: 'Desactivar',
        texto: 'Deja de ofrecerse al cobrar, pero no desaparece de los cobros anteriores.',
        lado: 'left',
      },
    ],
  },
  {
    id: 'reportes',
    version: 1,
    titulo: 'Reportes',
    resumen: 'Citas, pacientes atendidas y servicios más solicitados en un periodo.',
    grupo: 'Administración',
    ruta: '/admin/reportes',
    requiere: ['reports.read'],
    roles: ADMIN,
    pasos: [
      {
        elemento: 'reportes-periodo',
        titulo: 'Elige el periodo',
        texto: 'Pon las fechas y pulsa <b>Aplicar</b>. Todo lo de abajo se recalcula para ese periodo.',
        lado: 'bottom',
      },
      {
        elemento: 'reportes-indicadores',
        titulo: 'Los totales',
        texto: 'Citas del periodo y pacientes atendidas (cada paciente cuenta una vez).',
        lado: 'bottom',
      },
      {
        elemento: 'reportes-graficas',
        titulo: 'Por estado y por servicio',
        texto: 'Cuántas citas quedaron en cada estado (agendada, atendida, cancelada…) y qué servicios se cobran más.',
        lado: 'top',
      },
      {
        elemento: 'reportes-por-dia',
        titulo: 'Día por día',
        texto: 'Para ver qué días se llena la agenda y cuáles no.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'auditoria',
    version: 4,
    titulo: 'Bitácora de auditoría',
    resumen: 'Quién consultó o cambió información sensible, y cuándo.',
    grupo: 'Administración',
    ruta: '/admin/auditoria',
    requiere: ['audit.read'],
    roles: ADMIN,
    pasos: [
      {
        titulo: 'Para qué sirve',
        texto:
          'Aquí queda registro de los accesos y cambios sensibles a la información de las pacientes: quién, cuándo y desde dónde. Sirve para aclarar cualquier duda sobre qué pasó.',
      },
      {
        elemento: 'auditoria-vistas',
        titulo: 'Cambios, accesos o folios',
        texto:
          '<b>Cambios y eventos</b> es lo que se hizo. <b>Accesos a expedientes</b> es quién abrió qué sección clínica (consultas, recetas, estudios, imágenes…) del expediente de cada paciente y cuándo, una fila por visita. <b>Verificar folio</b> confirma que un folio impreso (p. ej. GYG-REC-2026-0042) es de un documento real de la clínica: de qué es, de qué paciente, quién lo emitió y cuándo.',
        lado: 'bottom',
      },
      {
        elemento: 'auditoria-filtro',
        titulo: 'Filtra por acción',
        texto: 'Escribe parte del código de la acción (el que sale en gris debajo de cada una, p. ej. <b>soap_note</b> o <b>payment</b>) para encontrarla.',
        lado: 'bottom',
      },
      {
        elemento: 'auditoria-tabla',
        titulo: 'Cada evento',
        texto:
          'Fecha, usuario, qué hizo (en palabras, con su código debajo), paciente, dispositivo, motivo y resultado. La IP se guarda sólo como huella anonimizada.',
        lado: 'top',
      },
      {
        elemento: 'auditoria-paginas',
        titulo: 'Más eventos',
        texto: 'Los más recientes primero; con <b>Siguiente</b> vas a los anteriores.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'permisos',
    version: 1,
    titulo: 'Permisos por usuario',
    resumen: 'Dar o quitar acciones concretas a una persona sin cambiarle el rol.',
    grupo: 'Administración',
    ruta: '/master/permisos',
    requiere: ['permissions.manage'],
    roles: [Role.MASTER],
    pasos: [
      {
        elemento: 'permisos-usuarios',
        titulo: '1. Elige a la persona',
        texto: 'Búscala por nombre o correo y tócala.',
        lado: 'right',
      },
      {
        elemento: 'permisos-panel',
        titulo: '2. Sus permisos',
        texto:
          'Parte de lo que trae su rol. Lo que cambies aquí es una <b>excepción</b> sólo para ella; se cuentan arriba como «overrides».',
        lado: 'left',
      },
      {
        elemento: 'permisos-modulos',
        titulo: 'Por módulo',
        texto: 'Agrupados por sección del sistema. Activa o desactiva cada acción.',
        lado: 'top',
      },
      {
        elemento: 'permisos-guardar',
        titulo: '3. Guardar',
        texto:
          'Nada cambia hasta guardar. La persona recibe los permisos nuevos sin tener que cerrar sesión.',
        lado: 'bottom',
        alinear: 'end',
      },
    ],
  },
  {
    id: 'roles',
    version: 1,
    titulo: 'Roles',
    resumen: 'Los roles del sistema y los personalizados.',
    grupo: 'Administración',
    ruta: '/master/roles',
    requiere: ['permissions.manage'],
    roles: [Role.MASTER],
    pasos: [
      {
        elemento: 'roles-sistema',
        titulo: 'Roles del sistema',
        texto: 'Master, administración, doctora y secretaria. No se editan: son la base de los demás.',
        lado: 'right',
      },
      {
        elemento: 'roles-personalizados',
        titulo: 'Roles personalizados',
        texto: 'Para un puesto que no encaja en los de siempre (por ejemplo, una asistente con acceso a triage).',
        lado: 'left',
      },
      {
        elemento: 'roles-nuevo',
        titulo: 'Nuevo rol',
        texto: 'Se crea a partir de un rol base y hereda sus permisos.',
        lado: 'bottom',
        alinear: 'end',
      },
    ],
  },
  {
    id: 'sucursales',
    version: 1,
    titulo: 'Sucursales',
    resumen: 'Dar de alta, editar y activar sucursales.',
    grupo: 'Administración',
    ruta: '/master/sucursales',
    requiere: ['settings.global'],
    roles: [Role.MASTER],
    pasos: [
      {
        titulo: 'Cada sucursal es independiente',
        texto:
          'Sus pacientes, citas y cobros no se mezclan con los de otra. Quien trabaja en varias elige la sucursal arriba a la derecha.',
      },
      {
        elemento: 'sucursales-nueva',
        titulo: 'Nueva sucursal',
        texto: 'Se le da un nombre; después aparece en el selector de sucursal del encabezado.',
        lado: 'bottom',
        alinear: 'end',
      },
      {
        elemento: 'sucursales-tabla',
        titulo: 'Las sucursales',
        texto: 'Con su estado.',
        lado: 'top',
      },
      {
        elemento: 'sucursales-activar',
        titulo: 'Activar o desactivar',
        texto: 'Desactivar una sucursal no borra su información.',
        lado: 'left',
      },
    ],
  },
]
