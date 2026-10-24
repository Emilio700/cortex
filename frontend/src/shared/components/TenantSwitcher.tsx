/**
 * Selector de sucursal — muestra la sucursal actual y permite cambiarla.
 *
 * La visibilidad sigue las reglas de pertenencia del backend, para no ofrecer
 * un cambio que terminaría en 403:
 *   - MASTER: puede cambiar a cualquier sucursal.
 *   - DOCTOR: sólo a las que tiene asignadas en `doctor-clinics`.
 *   - ADMIN y SECRETARIA: están acotados a su propia sucursal, así que no ven
 *     el selector; sólo la etiqueta con el nombre de su sucursal.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
    CDropdown,
    CDropdownItem,
    CDropdownMenu,
    CDropdownToggle,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBuilding, cilCheck } from '@coreui/icons'
import { listMyClinics, listTenants, switchTenant } from '../services/tenants'
import { useToast } from './ToastProvider'
import { useAuth } from '../context/AuthContext'
import { Role } from '../types'
import { rutaDeInicioPermitida } from '../utils/inicio'

/** Sucursal tal como se pinta en el selector. */
interface SwitchableTenant {
    id: number
    name: string
    address?: string | null
}

const displayName = (name: string) => name.replace('GEMS - ', '')

export const TenantSwitcher: React.FC = () => {
    const { user, permissions } = useAuth()
    const { showError } = useToast()
    const [tenants, setTenants] = useState<SwitchableTenant[]>([])
    const [switching, setSwitching] = useState(false)

    const currentTenantId = user?.tenant_id ?? null
    // Sólo estos roles pueden cambiar de sucursal; el resto queda fijo al suyo.
    const canSwitch = user?.role === Role.MASTER || user?.role === Role.DOCTOR

    const loadTenants = useCallback(async () => {
        if (!user) return
        try {
            if (user.role !== Role.DOCTOR) {
                // GET /tenants ya viene filtrado por el backend: MASTER recibe
                // todas y los demás roles únicamente la suya.
                setTenants(await listTenants())
                return
            }
            // Un doctor cambia entre su propia sucursal y los consultorios que
            // tiene asignados; se unen ambas listas sin repetir.
            const [own, clinics] = await Promise.all([listTenants(), listMyClinics()])
            const byId = new Map<number, SwitchableTenant>()
            own.forEach((tenant) => byId.set(tenant.id, tenant))
            clinics.forEach((clinic) => {
                if (!byId.has(clinic.tenant_id)) {
                    byId.set(clinic.tenant_id, { id: clinic.tenant_id, name: clinic.tenant_name })
                }
            })
            setTenants([...byId.values()])
        } catch {
            // El selector no es crítico: si falla se muestra sin lista.
            setTenants([])
        }
    }, [user])

    useEffect(() => {
        loadTenants()
    }, [loadTenants])

    const handleSwitch = async (tenantId: number) => {
        if (tenantId === currentTenantId || switching) return
        setSwitching(true)
        try {
            const data = await switchTenant(tenantId)
            // El switch emite un par nuevo de tokens: hay que guardar los dos o
            // la sesión muere en el primer refresh.
            localStorage.setItem('access_token', data.access_token)
            localStorage.setItem('refresh_token', data.refresh_token)
            const storedUser = localStorage.getItem('user')
            if (storedUser) {
                const parsed = JSON.parse(storedUser)
                parsed.tenant_id = data.tenant_id
                localStorage.setItem('user', JSON.stringify(parsed))
            }
            // Recarga sobre el inicio de su rol para que todo el árbol vuelva a
            // pedir los datos con el token de la nueva sucursal.
            window.location.href = `/#${rutaDeInicioPermitida(user?.role, permissions)}`
            window.location.reload()
        } catch (err) {
            showError(err instanceof Error ? err.message : 'No se pudo cambiar de sucursal.')
        } finally {
            setSwitching(false)
        }
    }

    const currentTenant = tenants.find((tenant) => tenant.id === currentTenantId)

    // Sin selector: roles acotados a su sucursal, o cuando no hay a dónde
    // cambiar. Se muestra sólo la etiqueta informativa.
    if (!canSwitch || tenants.length <= 1) {
        return currentTenant ? (
            <span className="d-flex align-items-center gap-1 px-2" title={currentTenant.name}>
                <CIcon icon={cilBuilding} size="sm" className="text-info" />
                {/* En el teléfono el nombre se recorta para caber en el encabezado. */}
                <span className="encabezado-sucursal-nombre small fw-medium text-body-secondary">
                    {displayName(currentTenant.name)}
                </span>
            </span>
        ) : null
    }

    return (
        <CDropdown variant="btn-group" autoClose="outside" direction="center">
            <CDropdownToggle
                color="light"
                size="sm"
                className="d-flex align-items-center gap-1 border-0"
                caret={true}
            >
                <CIcon icon={cilBuilding} size="sm" className="text-info" />
                <span className="d-none d-lg-inline small fw-medium">
                    {currentTenant ? displayName(currentTenant.name) : 'Sucursal'}
                </span>
            </CDropdownToggle>
            <CDropdownMenu className="pt-0" style={{ minWidth: '240px' }}>
                <div className="px-3 py-2 border-bottom">
                    <small className="text-muted text-uppercase fw-semibold">Cambiar sucursal</small>
                </div>
                {tenants.map((tenant) => (
                    <CDropdownItem
                        key={tenant.id}
                        as="button"
                        className="d-flex align-items-center justify-content-between"
                        active={tenant.id === currentTenantId}
                        onClick={() => handleSwitch(tenant.id)}
                        disabled={switching}
                    >
                        <div>
                            <div className="fw-medium small">{tenant.name}</div>
                            {tenant.address && (
                                <small className="text-muted d-block text-truncate" style={{ maxWidth: '200px' }}>
                                    {tenant.address}
                                </small>
                            )}
                        </div>
                        {tenant.id === currentTenantId && (
                            <CIcon icon={cilCheck} className="text-success ms-2" />
                        )}
                    </CDropdownItem>
                ))}
            </CDropdownMenu>
        </CDropdown>
    )
}
