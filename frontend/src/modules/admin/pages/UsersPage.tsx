/**
 * Users management page (Admin module - Fase 3.4)
 *
 * The backend endpoints (GET/POST/PUT /users) have existed since early in
 * the project, but had no interface - an Admin's only way to manage users
 * was to hit the API directly via /docs. This is the UI for that.
 */
import React, { useEffect, useState } from 'react'
import {
    CBadge,
    CButton,
    CCard,
    CCardBody,
    CCol,
    CRow,
    CTableBody,
    CTableDataCell,
    CTableHead,
    CTableHeaderCell,
    CTableRow,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilPencil, cilPlus, cilUser } from '@coreui/icons'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { UserForm } from '../components/UserForm'
import { useToast } from '../../../shared/components/ToastProvider'
import { TableSkeleton } from '../../../shared/components/TableSkeleton'
import { Role, type User } from '../../../shared/types'
import type { UserCreate, UserUpdate } from '../types'
import TablaResponsiva from '../../../shared/components/TablaResponsiva'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const ROLE_LABELS: Partial<Record<Role, string>> = {
    [Role.ADMIN]: 'Administrador',
    [Role.SECRETARIA]: 'Secretaria',
    [Role.DOCTOR]: 'Doctor',
}

const UsersPage: React.FC = () => {
    const { fetchUsers, createUser, updateUser } = useAdminUsers()
    const { showSuccess } = useToast()

    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)

    const [errorCarga, setErrorCarga] = useState<string | null>(null)

    const loadUsers = async (silencioso = false) => {
        try {
            // En un regreso la tabla ya tiene datos: sin skeleton que borre lo
            // que se estaba leyendo; los datos se reemplazan al llegar.
            if (!silencioso) setLoading(true)
            setErrorCarga(null)
            const data = await fetchUsers()
            // MASTER accounts are governed from the master module and must not
            // be editable from a tenant administrator screen.
            setUsers(data.filter((user) => user.role !== Role.MASTER))
        } catch (err) {
            console.error('Error loading users:', err)
            setUsers([])
            setErrorCarga(err instanceof Error && err.message ? err.message : 'No se pudieron cargar los usuarios.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadUsers()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Al volver a la pestaña la lista se recarga en silencio: otra persona
    // pudo crear o desactivar una cuenta mientras ésta estaba en el fondo.
    useAlReactivarPestana(() => { void loadUsers(true) })

    const handleCreate = () => {
        setSelectedUser(null)
        setShowForm(true)
    }

    const handleEdit = (user: User) => {
        setSelectedUser(user)
        setShowForm(true)
    }

    const handleSubmit = async (data: UserCreate | UserUpdate) => {
        if (selectedUser) {
            await updateUser(selectedUser.id, data as UserUpdate)
        } else {
            await createUser(data as UserCreate)
        }
        await loadUsers()
    }

    // El éxito se anuncia hasta que el formulario confirma que guardó todo.
    const alGuardar = () =>
        showSuccess(selectedUser ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.')

    return (
        <>
            <EncabezadoPantalla
                titulo="Usuarios"
                descripcion="Gestiona las cuentas del personal de la clínica"
                icono={cilUser}
                acciones={
                    <>
                        <CButton color="light" onClick={handleCreate} data-tour="usuarios-nuevo">
                            <CIcon icon={cilPlus} className="me-2" />
                            Nuevo Usuario
                        </CButton>
                    </>
                }
            />
            <CRow>
                <CCol xs={12}>
                    <CCard className="mb-4 glass-card">
                        <CCardBody>
                            {loading ? (
                                <TableSkeleton rows={5} columns={5} />
                            ) : (
                                <TablaResponsiva striped hover responsive data-tour="usuarios-tabla">
                                    <CTableHead>
                                        <CTableRow>
                                            <CTableHeaderCell>Nombre</CTableHeaderCell>
                                            <CTableHeaderCell>Correo</CTableHeaderCell>
                                            <CTableHeaderCell>Rol</CTableHeaderCell>
                                            <CTableHeaderCell>Estado</CTableHeaderCell>
                                            <CTableHeaderCell>Acciones</CTableHeaderCell>
                                        </CTableRow>
                                    </CTableHead>
                                    <CTableBody>
                                        {errorCarga ? (
                                            // Un fallo no se ve como «no hay» (plan 29, T-1).
                                            <CTableRow>
                                                <CTableDataCell colSpan={5} className="text-center text-danger py-3" role="alert">
                                                    {errorCarga}{' '}
                                                    <CButton color="danger" variant="outline" size="sm" className="ms-2" onClick={() => void loadUsers()}>
                                                        Reintentar
                                                    </CButton>
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : users.length === 0 ? (
                                            <CTableRow>
                                                <CTableDataCell colSpan={5} className="text-center text-muted">
                                                    No hay usuarios registrados
                                                </CTableDataCell>
                                            </CTableRow>
                                        ) : (
                                            users.map((user) => (
                                                <CTableRow key={user.id}>
                                                    <CTableDataCell>{user.full_name}</CTableDataCell>
                                                    <CTableDataCell>{user.email}</CTableDataCell>
                                                    <CTableDataCell>{ROLE_LABELS[user.role] || user.role}</CTableDataCell>
                                                    <CTableDataCell>
                                                        <CBadge color={user.is_active ? 'success' : 'secondary'}>
                                                            {user.is_active ? 'Activo' : 'Inactivo'}
                                                        </CBadge>
                                                    </CTableDataCell>
                                                    <CTableDataCell>
                                                        <CButton
                                                            color="info"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEdit(user)}
                                                            data-tour="usuarios-editar"
                                                            title="Editar"
                                                        >
                                                            <CIcon icon={cilPencil} />
                                                        </CButton>
                                                    </CTableDataCell>
                                                </CTableRow>
                                            ))
                                        )}
                                    </CTableBody>
                                </TablaResponsiva>
                            )}
                        </CCardBody>
                    </CCard>
                </CCol>
            </CRow>

            <UserForm
                visible={showForm}
                onClose={() => setShowForm(false)}
                onSubmit={handleSubmit}
                onGuardado={alGuardar}
                user={selectedUser}
            />
        </>
    )
}

export default UsersPage
