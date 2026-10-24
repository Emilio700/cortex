/**
 * La pantalla de inicio de cada rol (plan 26, D-6).
 *
 * Antes esto vivía repetido en el login y en el cambio de contraseña, y el
 * resto de la aplicación mandaba a «/» o a «/dashboard»: «/» no tiene pantalla
 * (se veía «Inicio» y «Selecciona una sección del menú») y «/dashboard» es la
 * página genérica de accesos, no el tablero de la doctora con sus métricas.
 * Ahora todos los caminos de regreso al inicio salen de aquí.
 */
import { Role } from '../types'
import routes from '../../routes'

export const RUTA_DE_INICIO_POR_ROL: Record<Role, string> = {
  [Role.MASTER]: '/master',
  [Role.ADMIN]: '/admin/dashboard',
  // Recepción no tiene tablero propio: su día empieza en la agenda.
  [Role.SECRETARIA]: '/secretaria/agenda',
  [Role.DOCTOR]: '/doctor/dashboard',
}

/**
 * Sin rol conocido no hay inicio propio: «/» deja que `AppContent` lo resuelva
 * con los permisos de la sesión. Antes caía en «/dashboard», la página genérica
 * de accesos, que se retiró en el plan 28 (Fase 1) y hoy solo redirige aquí.
 */
export const RUTA_DE_INICIO_GENERICA = '/'

/**
 * Último recurso cuando la sesión no puede abrir ninguna pantalla: la 403 dice
 * la verdad («no tienes permisos») en vez de una pantalla en blanco o un bucle
 * de redirecciones.
 */
export const RUTA_SIN_ACCESO = '/403'

export const rutaDeInicio = (role?: string | null): string =>
  (role && RUTA_DE_INICIO_POR_ROL[role as Role]) || RUTA_DE_INICIO_GENERICA

/**
 * ¿Puede esta sesión abrir la ruta? Mismo criterio que `AccessGuard`: basta un
 * permiso de los que pide la ruta o, como respaldo, el rol.
 */
export const puedeAbrirRuta = (
  path: string,
  role?: string | null,
  permisos: string[] = [],
): boolean => {
  const ruta = routes.find((r) => r.path === path)
  if (!ruta) return false
  if (!ruta.requires?.length && !ruta.roles?.length) return true
  const porPermiso =
    Boolean(ruta.requires?.length) &&
    permisos.length > 0 &&
    ruta.requires!.some((accion) => permisos.includes(accion))
  const porRol = Boolean(ruta.roles?.length) && Boolean(role) && ruta.roles!.includes(role as Role)
  return porPermiso || porRol
}

/**
 * El inicio al que esta sesión **sí** puede entrar (plan 26, M9).
 *
 * Si a un rol le quitan el permiso de su propio tablero, «Volver al inicio» en
 * la pantalla 403 lo regresaba a la misma 403. Se prueba primero su inicio; si
 * no puede verlo, el inicio de otro rol que sí pueda abrir (una doctora que
 * también hace recepción) y, si no, la primera pantalla fija que le dejen ver.
 * Nunca devuelve «/» ni «/dashboard»: los dos redirigen aquí y harían un bucle.
 */
export const rutaDeInicioPermitida = (role?: string | null, permisos: string[] = []): string => {
  const candidatas = [
    rutaDeInicio(role),
    // El tablero con datos antes que la agenda y la administración.
    ...[Role.DOCTOR, Role.ADMIN, Role.SECRETARIA, Role.MASTER].map((r) => RUTA_DE_INICIO_POR_ROL[r]),
    ...routes
      .map((r) => r.path)
      .filter((path): path is string => Boolean(path) && !path!.includes(':')),
  ]
  const destino = candidatas.find(
    (path) =>
      Boolean(routes.find((r) => r.path === path)?.element) && puedeAbrirRuta(path, role, permisos),
  )
  return destino ?? RUTA_SIN_ACCESO
}
