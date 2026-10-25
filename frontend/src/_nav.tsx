import { ElementType, JSX } from 'react'
import CIcon from '@coreui/icons-react'
import {
  cilSpeedometer,
  cilHome,
  cilCalendar,
  cilPeople,
  cilUser,
  cilMedicalCross,
  cilChart,

  cilShieldAlt,
  cilCash,
  cilWallet,
  cilUserFollow,
  cilListRich,
  cilTask,
  cilBuilding,
  cilRoom,
  cilCloudUpload,
  // base-modulos-extra
  cilSettings,
  cilApplications,
} from '@coreui/icons'
import { CNavItem, CNavTitle } from '@coreui/react-pro'
import { Role } from './shared/types'
import { moduloPermitido } from './shared/utils/modulos'

// Helper: returns the given roles plus MASTER (who can see everything)
const orMaster = (...roles: Role[]): Role[] => [...roles, Role.MASTER]

export type Badge = {
  color: string
  text: string
  /** Lo que el número significa, para quien pasa el cursor o usa lector de pantalla. */
  title?: string
}

export type NavItem = {
  badge?: Badge
  component: string | ElementType
  href?: string
  icon?: string | JSX.Element
  items?: NavItem[]
  name: string | JSX.Element
  to?: string
  /**
   * Permisos que bastan para ver el ítem (basta uno). Es el criterio nuevo:
   * lo que autoriza es el permiso, no la etiqueta del rol.
   */
  requires?: string[]
  /**
   * Se oculta a quien tenga alguno de estos permisos: tiene otra entrada con
   * el mismo nombre que le sirve mejor (p. ej. la bandeja clínica).
   */
  ocultarSiTiene?: string[]
  /**
   * Roles permitidos. Se conserva como respaldo: mientras una sesión antigua no
   * traiga permisos en su perfil, el menú se sigue armando por rol y nadie se
   * queda sin poder trabajar. Se retira en la Fase 6 del plan 20.
   */
  roles?: Role[]
  /**
   * base-modulos-extra: id de un módulo opcional (`app/core/modulos.py`). Con
   * él, el ítem solo aparece si el módulo está encendido en el consultorio,
   * además del permiso. Lo del núcleo no lo lleva.
   */
  modulo?: string
}

/**
 * Destino simbólico del ítem «Inicio»: cada rol tiene su propio inicio
 * (`rutaDeInicioPermitida`) y el arreglo del menú es estático, así que la barra
 * lateral lo cambia por la ruta real con `resolverInicio` (plan 28, Fase 1).
 * «/» sirve de respaldo honesto: si algo no lo resuelve, `AppContent` también
 * manda «/» al inicio del rol.
 */
export const DESTINO_INICIO = '/'

const _nav: NavItem[] = [
  {
    // Un solo «Inicio» que lleva al de cada rol. Antes había tres ítems
    // «Dashboard» (el genérico, el del médico y el de administración) que
    // llevaban a sitios distintos, y el médico caía en la página de accesos
    // la mitad de las veces (plan 28, D-2).
    component: CNavItem,
    name: 'Inicio',
    to: DESTINO_INICIO,
    icon: <CIcon icon={cilHome} customClassName="nav-icon" />,
  },
  {
    component: CNavTitle,
    name: 'Desarrollador',
    requires: ['settings.global'],
    roles: [Role.MASTER],
  },
  {
    component: CNavItem,
    name: 'Panel de Control',
    to: '/master',
    requires: ['settings.global'],
    icon: <CIcon icon={cilSpeedometer} customClassName="nav-icon" />,
    roles: [Role.MASTER],
  },
  {
    component: CNavItem,
    name: 'Gestión de Sucursales',
    to: '/master/sucursales',
    requires: ['settings.global'],
    icon: <CIcon icon={cilBuilding} customClassName="nav-icon" />,
    roles: [Role.MASTER],
  },
  {
    component: CNavItem,
    name: 'Gestión de Roles',
    to: '/master/roles',
    requires: ['permissions.manage'],
    icon: <CIcon icon={cilUserFollow} customClassName="nav-icon" />,
    roles: [Role.MASTER],
  },
  {
    component: CNavItem,
    name: 'Gestión de Permisos',
    to: '/master/permisos',
    requires: ['permissions.manage'],
    icon: <CIcon icon={cilShieldAlt} customClassName="nav-icon" />,
    roles: [Role.MASTER],
  },
  {
    component: CNavTitle,
    name: 'Administración',
    requires: ['users.read', 'reports.read', 'audit.read', 'services.create'],
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Usuarios',
    to: '/admin/usuarios',
    requires: ['users.read'],
    icon: <CIcon icon={cilUser} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Servicios',
    to: '/admin/servicios',
    requires: ['services.create'],
    icon: <CIcon icon={cilMedicalCross} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Salas',
    // Salas aún no tiene permiso en el catálogo: su router gatea por rol, así
    // que aquí tampoco se inventa uno. Queda para la Fase 3 del plan 20.
    to: '/admin/salas',
    icon: <CIcon icon={cilRoom} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Reportes',
    to: '/admin/reportes',
    requires: ['reports.read'],
    icon: <CIcon icon={cilChart} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Auditoría',
    to: '/admin/auditoria',
    requires: ['audit.read'],
    icon: <CIcon icon={cilListRich} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavTitle,
    name: 'Consultorio',
    requires: ['appointments.read', 'patients.read', 'triage.create', 'documents.read', 'clinical_tracking.attach_result'],
    roles: orMaster(Role.SECRETARIA, Role.ADMIN, Role.DOCTOR),
  },
  {
    component: CNavItem,
    name: 'Agenda',
    to: '/secretaria/agenda',
    requires: ['appointments.read'],
    icon: <CIcon icon={cilCalendar} customClassName="nav-icon" />,
    roles: orMaster(Role.SECRETARIA, Role.ADMIN, Role.DOCTOR),
  },
  {
    component: CNavItem,
    name: 'Pacientes',
    to: '/secretaria/pacientes',
    requires: ['patients.read'],
    icon: <CIcon icon={cilPeople} customClassName="nav-icon" />,
    roles: orMaster(Role.SECRETARIA, Role.ADMIN, Role.DOCTOR),
  },
  // «Triage» sale del menú: los signos vitales se toman desde la cita, en la
  // Agenda —donde además se ve al paciente que llegó sin confirmar— y el médico
  // los toma al abrir la consulta si faltan. La pantalla era una segunda puerta
  // al mismo formulario, y la única que se saltaba a los agendados.
  // «Documentos» sale del menú (plan 32, punto 6): es la pestaña Documentos
  // del expediente de cada paciente.
  {
    // Mostrador de órdenes: entregar la orden (O-09) y subir el resultado
    // (O-04). Cada pestaña se gatea con su permiso; basta uno para abrir la
    // pantalla. Los dos vienen por defecto en recepción, administración y la
    // doctora (respaldo por rol mientras conviven las fuentes).
    component: CNavItem,
    // Un solo nombre para los dos lados (plan 32, punto 6). En el menú sale
    // solo a recepción: el médico y la administración tienen su propia
    // «Órdenes y resultados» (la bandeja clínica) y dos entradas con el mismo
    // nombre confundían. La ruta les sigue abriendo por enlace.
    name: 'Órdenes y resultados',
    to: '/secretaria/resultados',
    requires: ['clinical_tracking.deliver_order', 'clinical_tracking.attach_result'],
    ocultarSiTiene: ['clinical_tracking.read'],
    icon: <CIcon icon={cilCloudUpload} customClassName="nav-icon" />,
    roles: [Role.SECRETARIA],
  },
  // Plan 23: el médico recibe payments.read y payments.cashcut ("Mis cobros" y
  // su corte). Llega aquí sólo por permiso, a propósito sin respaldo por rol:
  // si el frontend se desplegara antes que el backend que le limita el alcance,
  // el rol le abriría pantallas con el dinero de toda la sucursal.
  {
    component: CNavTitle,
    name: 'Finanzas',
    requires: ['payments.read', 'payments.cashcut'],
    roles: orMaster(Role.ADMIN, Role.SECRETARIA),
  },
  // Plan 23, ajustes del 2026-09-28: nombres neutrales e iguales para todos los
  // roles. Nombres distintos por rol obligaban a condiciones en el menú y a
  // mantener recorridos por separado; la pantalla ya le dice "Mis cobros" y
  // "Mi corte de caja" al médico. Las rutas no cambian.
  {
    component: CNavItem,
    name: 'Corte de caja',
    to: '/finanzas',
    requires: ['payments.cashcut'],
    icon: <CIcon icon={cilCash} customClassName="nav-icon" />,
    // Sin respaldo por rol para la secretaria: el corte se le concede por
    // usuaria (payments.cashcut) y sólo abarca a los médicos que apoya.
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Cobros',
    to: '/finanzas/pagos',
    requires: ['payments.read'],
    icon: <CIcon icon={cilWallet} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN, Role.SECRETARIA),
  },
  {
    component: CNavTitle,
    name: 'Médico',
    requires: ['doctor.appointments.read', 'clinical_tracking.read', 'doctor_profile.read'],
    roles: orMaster(Role.DOCTOR, Role.ADMIN),
  },
  {
    component: CNavItem,
    // El mismo nombre que la pantalla y sus recorridos.
    name: 'Mis Consultas',
    to: '/doctor/appointments',
    requires: ['doctor.appointments.read'],
    icon: <CIcon icon={cilCalendar} customClassName="nav-icon" />,
    // Sin administración a propósito (revisión de flujos, 2026-10-04): su
    // perfil no trae doctor.appointments.read, el servidor le niega la agenda
    // y el ítem sólo llevaba a una pantalla en error. El médico la conserva.
    roles: orMaster(Role.DOCTOR),
  },
  {
    component: CNavItem,
    name: 'Órdenes y resultados',
    to: '/doctor/results',
    requires: ['clinical_tracking.read'],
    icon: <CIcon icon={cilTask} customClassName="nav-icon" />,
    roles: orMaster(Role.DOCTOR, Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Mi Perfil',
    to: '/doctor/profile',
    requires: ['doctor_profile.read'],
    icon: <CIcon icon={cilUser} customClassName="nav-icon" />,
    roles: orMaster(Role.DOCTOR, Role.ADMIN),
  },
  // ── base-modulos-extra (tramo A): grupo «Sistema» ──
  // Respaldo por rol como el resto de Administración: admin y master.
  {
    component: CNavTitle,
    name: 'Sistema',
    requires: ['servicios.read', 'modulos.manage'],
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    // «Estado de servicios» y no «Servicios»: ese nombre ya es el catálogo de
    // servicios médicos de Administración.
    name: 'Estado de servicios',
    to: '/sistema/servicios',
    requires: ['servicios.read'],
    icon: <CIcon icon={cilApplications} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN),
  },
  {
    component: CNavItem,
    name: 'Módulos',
    to: '/sistema/modulos',
    requires: ['modulos.manage'],
    icon: <CIcon icon={cilSettings} customClassName="nav-icon" />,
    roles: orMaster(Role.ADMIN),
  },
  // ── fin base-modulos-extra ──
]

/** Identidad de la sesión con la que se decide qué ítems se muestran. */
export type NavAccess = {
  role?: Role
  permissions?: string[]
  /** base-modulos-extra: módulos opcionales encendidos en el consultorio. */
  modulos?: string[]
}

const itemPermitido = (item: NavItem, { role, permissions, modulos }: NavAccess): boolean => {
  // base-modulos-extra: el módulo apagado se oculta antes de mirar permisos. Es
  // un Y, no un O: ningún permiso ni rol abre un módulo que el consultorio no usa.
  if (!moduloPermitido(item.modulo, modulos)) return false

  // Sin restricción declarada, se muestra a cualquier sesión (p. ej. Inicio).
  if (!item.requires && !item.roles) return true

  if (item.ocultarSiTiene && permissions?.some((accion) => item.ocultarSiTiene!.includes(accion))) return false

  // El permiso manda. Sólo se consulta si la sesión trae permisos: un perfil
  // viejo en localStorage no los tiene y no debe interpretarse como "ninguno".
  if (item.requires && permissions && permissions.length > 0) {
    if (item.requires.some((accion) => permissions.includes(accion))) return true
  }

  // Respaldo por rol. Es deliberadamente un OR y no un reemplazo: mientras
  // convivan las dos fuentes, el cambio sólo puede agregar ítems, nunca quitar
  // los que alguien ya veía. Se retira en la Fase 6 del plan 20.
  return Boolean(item.roles && role !== undefined && item.roles.includes(role))
}

const esEncabezado = (item: NavItem): boolean => item.component === CNavTitle

/**
 * Filtra el menú por permisos, con el rol como respaldo.
 *
 * Los encabezados de sección se calculan a partir de lo que quedó visible: una
 * doctora que además hace recepción ve un menú coherente en vez de un título
 * huérfano sobre una sección vacía.
 */
export const filterNavByAccess = (items: NavItem[], access: NavAccess): NavItem[] => {
  const visibles = items.filter((item) => itemPermitido(item, access))

  return visibles.filter((item, i) => {
    if (!esEncabezado(item)) return true
    const siguiente = visibles[i + 1]
    return Boolean(siguiente) && !esEncabezado(siguiente)
  })
}

/**
 * Cambia el destino simbólico de «Inicio» por el inicio real de la sesión.
 *
 * Si ese inicio ya es otro ítem visible del menú (recepción empieza en la
 * Agenda; master, en su Panel de Control), «Inicio» se quita: dos entradas al
 * mismo sitio con nombres distintos hacen dudar cuál es la buena, que es justo
 * lo que este plan corrige.
 */
export const resolverInicio = (items: NavItem[], rutaInicio: string): NavItem[] => {
  const yaEnElMenu = items.some((item) => item.to === rutaInicio && item.to !== DESTINO_INICIO)
  return items.flatMap((item) => {
    if (item.to !== DESTINO_INICIO) return [item]
    return yaEnElMenu ? [] : [{ ...item, to: rutaInicio }]
  })
}

/**
 * @deprecated Filtra sólo por rol. Se conserva para las pruebas de línea base
 * del plan 20; el código de producción usa `filterNavByAccess`.
 */
export const filterNavByRole = (items: NavItem[], role?: Role): NavItem[] =>
  items.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role)))

export default _nav
