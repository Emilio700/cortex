/**
 * RoleGuard — adaptador sobre `AccessGuard`.
 *
 * @deprecated Filtra por rol, que es justamente lo que el plan 20 retira: un
 * permiso concedido desde Master no abría la ruta. Se conserva para las
 * pantallas que aún declaran `allowedRoles`; las nuevas usan `AccessGuard` con
 * `requires`. Desaparece en la Fase 6.
 */
import { AccessGuard } from './AccessGuard'
import type { Role } from '../types'

interface RoleGuardProps {
    children: React.ReactNode
    allowedRoles: Role[]
}

export const RoleGuard = ({ children, allowedRoles }: RoleGuardProps) => (
    <AccessGuard allowedRoles={allowedRoles}>{children}</AccessGuard>
)
