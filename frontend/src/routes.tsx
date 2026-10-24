import React, { LazyExoticComponent, FC, ReactNode } from 'react'
import { Role } from './shared/types'

export type Route = {
  element?: LazyExoticComponent<FC>
  exact?: boolean
  name?: ReactNode
  path?: string
  routes?: Route[]
  /**
   * Permisos que abren la pantalla (basta uno). Tiene que coincidir con el
   * `requires` de su ítem en `_nav.tsx`: si el menú ofrece el ítem y la ruta no
   * lo deja pasar, la persona ve la opción y al abrirla la echan a /403.
   */
  requires?: string[]
  /** Respaldo por rol mientras convive con los permisos (Fase 6 del plan 20). */
  roles?: Role[]
  /**
   * Ruta retirada que manda a otra pantalla (no al inicio del rol): así un
   * marcador o una pestaña guardada llegan a donde vive ahora lo que buscaban.
   */
  redirigeA?: string
}

// Helper: returns the given roles plus MASTER (who can see everything)
const orMaster = (...roles: Role[]): Role[] => [...roles, Role.MASTER]


// Secretaria Module
const AgendaPage = React.lazy(() => import('./modules/secretaria/pages/AgendaPage'))
const PacientesPage = React.lazy(() => import('./modules/secretaria/pages/PacientesPage'))
const TriagePage = React.lazy(() => import('./modules/secretaria/pages/TriagePage'))
const SubirResultadosPage = React.lazy(() => import('./modules/secretaria/pages/SubirResultadosPage'))

// Doctor Module
const DoctorDashboard = React.lazy(() => import('./modules/doctor/pages/DoctorDashboard'))
const DoctorAppointmentsPage = React.lazy(() => import('./modules/doctor/pages/DoctorAppointmentsPage'))
const ConsultationPage = React.lazy(() => import('./modules/doctor/pages/ConsultationPage'))
const DoctorProfilePage = React.lazy(() => import('./modules/doctor/pages/DoctorProfilePage'))
const ExpedientePage = React.lazy(() => import('./modules/expediente/ExpedientePage'))
const ResultsInboxPage = React.lazy(() => import('./modules/doctor/pages/ResultsInboxPage'))

// Admin Module
const AdminDashboard = React.lazy(() => import('./modules/admin/pages/AdminDashboard'))
const UsersPage = React.lazy(() => import('./modules/admin/pages/UsersPage'))
const ServicesPage = React.lazy(() => import('./modules/admin/pages/ServicesPage'))
const SalasPage = React.lazy(() => import('./modules/admin/pages/SalasPage'))
const ReportsPage = React.lazy(() => import('./modules/admin/pages/ReportsPage'))
const AuditLogsPage = React.lazy(() => import('./modules/admin/pages/AuditLogsPage'))

// Finanzas Module
const FinanzasDashboard = React.lazy(() => import('./modules/finanzas/pages/FinanzasDashboard'))
const PagosPage = React.lazy(() => import('./modules/finanzas/pages/PagosPage'))

// Master Module
const MasterDashboard = React.lazy(() => import('./modules/master/pages/MasterDashboard'))
const RolesPage = React.lazy(() => import('./modules/master/pages/RolesPage'))
const PermissionsPage = React.lazy(() => import('./modules/master/pages/PermissionsPage'))
const TenantsPage = React.lazy(() => import('./modules/master/pages/TenantsPage'))

const routes: Route[] = [
  { path: '/', exact: true, name: 'Inicio' },
  {
    // La página genérica de accesos se retiró (plan 28, Fase 1): repetía el
    // menú y el médico caía ahí creyendo que era su inicio. Se conserva la
    // ruta sin pantalla para que marcadores y pestañas guardadas no den 404:
    // `AppContent` manda toda ruta sin pantalla al inicio del rol.
    path: '/dashboard',
    name: 'Inicio',
  },
  {
    // El preregistro se quitó (plan 32, punto 5): el paciente nuevo se da de
    // alta al agendar, con el alta exprés de la ventana de cita. La ruta queda
    // sin pantalla y lleva a la Agenda para no romper marcadores ni pestañas
    // guardadas. La tabla y su lectura en el servidor se conservan, como
    // historial.
    path: '/secretaria/preregistro',
    name: 'Agenda',
    redirigeA: '/secretaria/agenda',
  },
  {
    path: '/secretaria/agenda',
    requires: ['appointments.read'],
    name: 'Agenda',
    element: AgendaPage,
    roles: orMaster(Role.SECRETARIA, Role.ADMIN, Role.DOCTOR),
  },
  {
    path: '/secretaria/pacientes',
    requires: ['patients.read'],
    name: 'Pacientes',
    element: PacientesPage,
    roles: orMaster(Role.SECRETARIA, Role.ADMIN, Role.DOCTOR),
  },
  {
    path: '/secretaria/triage',
    requires: ['triage.create'],
    name: 'Triage',
    element: TriagePage,
    roles: orMaster(Role.SECRETARIA, Role.ADMIN),
  },
  {
    // Documentos deja de ser pantalla (plan 32, punto 6): es la pestaña
    // Documentos del expediente de cada paciente. La ruta lleva al
    // directorio, desde donde se abre el expediente.
    path: '/secretaria/documentos',
    name: 'Pacientes',
    redirigeA: '/secretaria/pacientes',
  },
  {
    // El «Historial» de recepción era otra copia parcial: ahora es el expediente.
    path: '/secretaria/pacientes/:patientId/historial',
    name: 'Expediente',
    redirigeA: '/pacientes/:patientId/expediente',
  },
  {
    // El expediente único: un solo destino para todos los roles. Cada pestaña
    // la decide el servidor por permiso, así que basta poder ver pacientes.
    path: '/pacientes/:patientId/expediente',
    requires: ['patients.read'],
    name: 'Expediente',
    element: ExpedientePage,
    roles: orMaster(Role.SECRETARIA, Role.ADMIN, Role.DOCTOR),
  },
  {
    // Mostrador de órdenes: entregar la orden (O-09) y subir el resultado
    // (O-04). Basta uno de los dos permisos acotados; ninguno da el seguimiento
    // clínico. Mismo `requires` que su ítem del menú (hay prueba).
    path: '/secretaria/resultados',
    requires: ['clinical_tracking.deliver_order', 'clinical_tracking.attach_result'],
    name: 'Órdenes y resultados',
    element: SubirResultadosPage,
    roles: orMaster(Role.SECRETARIA, Role.ADMIN, Role.DOCTOR),
  },
  {
    path: '/doctor/dashboard',
    requires: ['doctor.dashboard.read'],
    name: 'Inicio',
    element: DoctorDashboard,
    // Administración queda fuera a propósito (revisión de flujos, 2026-10-04):
    // su perfil no trae doctor.dashboard.read y el inicio llama a «mis citas»,
    // que el servidor le niega; la puerta sólo daba errores. Su lectura clínica
    // vive en el Expediente Clínico y en la bandeja de resultados.
    roles: orMaster(Role.DOCTOR),
  },
  {
    path: '/doctor/appointments',
    requires: ['doctor.appointments.read'],
    name: 'Mis Consultas',
    element: DoctorAppointmentsPage,
    // Sin administración (2026-10-04): el servidor exige
    // doctor.appointments.read, que su perfil no trae —«mis citas» de una
    // administradora estaría siempre vacía— y la pantalla abría en error.
    roles: orMaster(Role.DOCTOR),
  },
  {
    path: '/doctor/consultation/:appointmentId',
    requires: ['doctor.appointments.read'],
    name: 'Consulta Médica',
    element: ConsultationPage,
    // Es el espacio de escritura de la consulta, del médico; administración
    // revisa por el Expediente Clínico, no aquí (revisión de flujos, 2026-10-04).
    roles: orMaster(Role.DOCTOR),
  },
  {
    path: '/doctor/profile',
    requires: ['doctor_profile.read'],
    name: 'Mi Perfil Médico',
    element: DoctorProfilePage,
    roles: orMaster(Role.DOCTOR, Role.ADMIN),
  },
  {
    path: '/doctor/patients/:patientId/record',
    name: 'Expediente',
    redirigeA: '/pacientes/:patientId/expediente',
  },
  {
    path: '/doctor/results',
    requires: ['clinical_tracking.read'],
    name: 'Órdenes y resultados',
    element: ResultsInboxPage,
    roles: orMaster(Role.DOCTOR, Role.ADMIN),
  },
  {
    path: '/admin/dashboard',
    requires: ['admin.dashboard.read'],
    name: 'Inicio',
    element: AdminDashboard,
    roles: orMaster(Role.ADMIN),
  },
  {
    path: '/admin/usuarios',
    requires: ['users.read'],
    name: 'Usuarios',
    element: UsersPage,
    roles: orMaster(Role.ADMIN),
  },
  {
    path: '/admin/servicios',
    requires: ['services.create'],
    name: 'Servicios',
    element: ServicesPage,
    roles: orMaster(Role.ADMIN),
  },
  {
    path: '/admin/salas',
    name: 'Salas',
    element: SalasPage,
    roles: orMaster(Role.ADMIN),
  },
  {
    path: '/admin/reportes',
    requires: ['reports.read'],
    name: 'Reportes',
    element: ReportsPage,
    roles: orMaster(Role.ADMIN),
  },
  {
    path: '/admin/auditoria',
    requires: ['audit.read'],
    name: 'Auditoría',
    element: AuditLogsPage,
    roles: orMaster(Role.ADMIN),
  },
  // ── Finanzas ──────────────────────────────────────────
  {
    path: '/finanzas',
    requires: ['payments.cashcut'],
    // Mismo nombre que el menú: es el que lleva la pestaña abierta.
    name: 'Corte de caja',
    element: FinanzasDashboard,
    // La secretaria NO entra por su rol: el corte se le concede por usuaria
    // (payments.cashcut) y acotado a los médicos que apoya (plan 23). Antes
    // el respaldo por rol la dejaba entrar a una pantalla que el servidor le
    // negaba con 403 (visto en el ambiente local; decisión de Emilio,
    // 2026-10-04).
    roles: orMaster(Role.ADMIN),
  },
  {
    path: '/finanzas/pagos',
    requires: ['payments.read'],
    name: 'Cobros',
    element: PagosPage,
    roles: orMaster(Role.ADMIN, Role.SECRETARIA),
  },
  // ── Master ────────────────────────────────────────────
  {
    path: '/master',
    requires: ['settings.global'],
    name: 'Panel de Desarrollador',
    element: MasterDashboard,
    roles: [Role.MASTER],
  },
  {
    path: '/master/permisos',
    requires: ['permissions.manage'],
    name: 'Gestión de Permisos',
    element: PermissionsPage,
    roles: [Role.MASTER],
  },
  {
    path: '/master/roles',
    requires: ['permissions.manage'],
    name: 'Gestión de Roles',
    element: RolesPage,
    roles: [Role.MASTER],
  },
  {
    path: '/master/sucursales',
    requires: ['settings.global'],
    name: 'Gestión de Sucursales',
    element: TenantsPage,
    roles: [Role.MASTER],
  },
]

export default routes
