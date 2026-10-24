/**
 * AccessGuard — deja pasar por permiso, con el rol como respaldo.
 *
 * Sustituye a `RoleGuard`. La diferencia importa: con `RoleGuard`, conceder un
 * permiso desde la pantalla de Master no abría ninguna ruta, porque la ruta
 * miraba la etiqueta del rol y no lo concedido.
 *
 * El criterio es un OR deliberado entre permiso y rol mientras conviven las dos
 * fuentes: así el cambio sólo puede abrir rutas que ya estaban abiertas, nunca
 * cerrar una que alguien usaba. Cuando ninguna pantalla declare `allowedRoles`
 * (Fase 6 del plan 20), el respaldo desaparece.
 */
import { Navigate, useNavigate } from 'react-router-dom'
import { CButton, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilLockLocked } from '@coreui/icons'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'
import { rutaDeInicioPermitida } from '../utils/inicio'

/**
 * «Acceso denegado» dentro de la pestaña (plan 29, lote 5).
 *
 * Dentro de las pestañas, redirigir a /403 no funcionaba: la pestaña
 * sincroniza la URL con su ruta en un efecto que corre después del de la
 * redirección y regresaba a la ruta negada, y la pestaña quedaba en blanco
 * (p. ej. un médico que abría /admin/salas). Aquí se dice en el lugar.
 */
const AccesoDenegadoEnPestana = () => {
  const navigate = useNavigate()
  const { user, permissions } = useAuth()
  return (
    <div className="text-center py-5" role="alert">
      <CIcon icon={cilLockLocked} size="3xl" className="text-body-secondary mb-3" />
      <h4>Acceso denegado</h4>
      <p className="text-body-secondary">
        No tienes permisos para esta sección. Si la necesitas, pídesela a la administración.
      </p>
      <CButton color="primary" onClick={() => navigate(rutaDeInicioPermitida(user?.role, permissions))}>
        Volver al inicio
      </CButton>
    </div>
  )
}

interface AccessGuardProps {
  children: React.ReactNode
  /** Basta uno de estos permisos. */
  requires?: string[]
  /** Respaldo por rol, en retirada. */
  allowedRoles?: Role[]
  /**
   * `pestana`: al negar, dice «Acceso denegado» en el lugar en vez de
   * redirigir a /403 (las pestañas deshacen la redirección).
   */
  alNegar?: 'redirigir' | 'pestana'
}

export const AccessGuard = ({ children, requires, allowedRoles, alNegar = 'redirigir' }: AccessGuardProps) => {
  const { user, permissions, loading } = useAuth()
  // Defensivo: un contexto de prueba o una sesión antigua pueden no traer el campo.
  const efectivos = permissions ?? []

  // Esperar a que hidrate el perfil antes de decidir: redirigir a /403 mientras
  // carga sería echar a alguien que sí tiene acceso.
  if (loading) {
    return (
      <div className="text-center py-5">
        <CSpinner color="primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Sin restricción declarada, cualquier sesión autenticada pasa.
  if (!requires?.length && !allowedRoles?.length) {
    return <>{children}</>
  }

  // Los permisos sólo se consultan si el perfil los trae: una sesión vieja no
  // debe leerse como "no tiene ninguno".
  const porPermiso =
    Boolean(requires?.length) &&
    efectivos.length > 0 &&
    requires!.some((accion) => efectivos.includes(accion))

  const porRol = Boolean(allowedRoles?.length) && allowedRoles!.includes(user.role)

  if (!porPermiso && !porRol) {
    if (alNegar === 'pestana') return <AccesoDenegadoEnPestana />
    return <Navigate to="/403" replace />
  }

  return <>{children}</>
}

export default AccessGuard
