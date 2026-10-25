/**
 * Ícono de cada pantalla en su pestaña (plan 32, punto 2).
 *
 * Es el mismo del menú lateral: con ocho pestañas el nombre se corta con «…» y
 * el ícono es lo que deja reconocer cada una de un vistazo. Las pantallas que
 * no están en el menú (la consulta, el expediente) toman el de su módulo.
 * Hay prueba de que cada ruta con pantalla tiene el suyo.
 */
import {
    cil3d,
    cilBuilding,
    cilCalendar,
    cilCash,
    cilChart,
    cilCloudUpload,
    cilHome,
    cilImage,
    cilListRich,
    cilMedicalCross,
    cilFolderOpen,
    cilPeople,
    cilRoom,
    cilShieldAlt,
    cilSpeedometer,
    cilTask,
    cilUser,
    cilUserFollow,
    cilUserPlus,
    cilWallet,
    // base-modulos-extra
    cilApplications,
    cilSettings,
} from '@coreui/icons'
import { buildRouteEntries, matchRoutePath } from './routeMatch'

export const ICONOS_DE_MODULO: Record<string, string[]> = {
    '/': cilHome,
    '/dashboard': cilHome,
    '/doctor/dashboard': cilHome,
    '/admin/dashboard': cilHome,
    '/secretaria/preregistro': cilUserPlus,
    '/secretaria/agenda': cilCalendar,
    '/secretaria/pacientes': cilPeople,
    '/pacientes/:patientId/expediente': cilFolderOpen,
    '/pacientes/:patientId/estudios/:studyId': cilImage,
    '/secretaria/resultados': cilCloudUpload,
    '/doctor/appointments': cilCalendar,
    '/doctor/consultation/:appointmentId': cilMedicalCross,
    '/doctor/profile': cilUser,
    '/doctor/results': cilTask,
    '/admin/usuarios': cilUser,
    '/admin/servicios': cilMedicalCross,
    '/admin/salas': cilRoom,
    '/admin/reportes': cilChart,
    '/admin/auditoria': cilListRich,
    '/finanzas': cilCash,
    '/finanzas/pagos': cilWallet,
    '/master': cilSpeedometer,
    '/master/permisos': cilShieldAlt,
    '/master/roles': cilUserFollow,
    '/master/sucursales': cilBuilding,
    // Neuro 3D (tramo C).
    '/imagen/neuro-3d': cil3d,
    '/pacientes/:patientId/neuro-3d': cil3d,
    // base-modulos-extra (tramo A): los mismos íconos que el menú.
    '/sistema/servicios': cilApplications,
    '/sistema/modulos': cilSettings,
}

const entradas = buildRouteEntries()

/** El ícono de una ruta concreta (`/doctor/consultation/41`); el de inicio si no se conoce. */
export function iconoDeRuta(path: string): string[] {
    if (ICONOS_DE_MODULO[path]) return ICONOS_DE_MODULO[path]
    const ruta = matchRoutePath(path, entradas)
    return (ruta && ICONOS_DE_MODULO[ruta.path]) || cilHome
}
