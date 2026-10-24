/**
 * Admin dashboard (Fase 3.4) - Admin's first real home screen.
 *
 * Before this, Admin landed on the generic /dashboard (a role-aware quick
 * links screen from Fase 1, itself a replacement for the CoreUI demo with
 * fake social-media stats). This shows real numbers: today's cash-cut,
 * how many active services and users exist, sourced from the endpoints
 * built in Fase 3.1/3.2/3.3.
 *
 * Plan 28 (Fase 1): es el «Inicio» de administración en el menú, y cada número
 * carga por separado; si uno no llega se ve «—» y el error, nunca un 0.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CAlert, CButton, CCard, CCardBody, CCol, CRow, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCash, cilPeople, cilMedicalCross, cilListRich, cilHome } from '@coreui/icons'
import { usePayments } from '../hooks/usePayments'
import { useServices } from '../hooks/useServices'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { CardGridSkeleton } from '../../../shared/components/TableSkeleton'
import type { CashCutReport } from '../types'
import { mensajeDeError } from '../../../shared/utils/errors'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const formatCurrency = (value: string) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value))

const METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    other: 'Otro',
}

/** Lo que se sabe de un dato: cargando, con valor o con el error que lo impidió. */
type Dato<T> = { estado: 'cargando' } | { estado: 'listo'; valor: T } | { estado: 'error'; mensaje: string }

const CARGANDO = { estado: 'cargando' } as const

/**
 * Número que no se sabe: raya, nunca «0». Antes una carga fallida pintaba
 * «0 servicios» y «0 usuarios», y eso se lee como un dato (plan 28, Fase 1).
 */
const SIN_DATO = '—'

const mostrar = <T,>(dato: Dato<T>, formato: (valor: T) => React.ReactNode): React.ReactNode =>
    dato.estado === 'listo' ? formato(dato.valor) : SIN_DATO

type TarjetaProps = {
    icono: string[]
    color: string
    valor: React.ReactNode
    etiqueta: string
    /**
     * Lo que hace al pulsarla, sólo para el lector («Abre el corte de caja»).
     * El resto del nombre es el texto visible: un aria-label aparte no
     * coincidía con lo que se ve y el control por voz no la encontraba (axe,
     * label-content-name-mismatch; plan 32).
     */
    accion: string
    destino: string
}

const Tarjeta: React.FC<TarjetaProps> = ({ icono, color, valor, etiqueta, accion, destino }) => {
    const navigate = useNavigate()
    return (
        <button
            type="button"
            className="kpi-tile h-100 w-100 text-start text-body border-0"
            onClick={() => navigate(destino)}
        >
            <div className={`kpi-icon bg-${color} bg-opacity-25 text-${color}`}>
                <CIcon icon={icono} size="lg" />
            </div>
            <div>
                <div className="kpi-value">
                    {valor === SIN_DATO ? (
                        <>
                            {/* La raya se ve; el lector oye «sin dato». */}
                            <span aria-hidden="true">{SIN_DATO}</span>
                            <span className="visually-hidden">Sin dato:</span>
                        </>
                    ) : (
                        valor
                    )}
                </div>
                <div className="kpi-label">{etiqueta}</div>
            </div>
            <span className="visually-hidden">. {accion}</span>
        </button>
    )
}

const AdminDashboard: React.FC = () => {
    const { getCashCut } = usePayments()
    const { fetchServices } = useServices()
    const { fetchUsers } = useAdminUsers()

    // Cada dato carga y falla por separado: si la lista de usuarios no
    // responde, el corte de caja sigue a la vista.
    const [cashCut, setCashCut] = useState<Dato<CashCutReport>>(CARGANDO)
    const [serviceCount, setServiceCount] = useState<Dato<number>>(CARGANDO)
    const [userCount, setUserCount] = useState<Dato<number>>(CARGANDO)

    const cargar = useCallback((silencioso = false) => {
        const seguir = <T, R>(
            promesa: Promise<T>,
            fijar: (dato: Dato<R>) => void,
            convertir: (valor: T) => R,
        ) => {
            // En un regreso los números que ya están se conservan hasta que
            // lleguen los nuevos: sin skeleton en cada visita.
            if (!silencioso) fijar(CARGANDO)
            promesa
                .then((valor) => fijar({ estado: 'listo', valor: convertir(valor) }))
                .catch((err) =>
                    // Los hooks ya convierten la respuesta del servidor en un
                    // `Error` con mensaje legible; si no, el traductor común.
                    fijar({
                        estado: 'error',
                        mensaje: err instanceof Error && err.message ? err.message : mensajeDeError(err),
                    }),
                )
        }
        seguir(getCashCut(), setCashCut, (corte) => corte)
        seguir(fetchServices(false), setServiceCount, (servicios) => servicios.length)
        seguir(fetchUsers(), setUserCount, (usuarios) => usuarios.length)
        // Los hooks de datos devuelven funciones nuevas en cada render; cargar
        // solo al montar y al pedir «Reintentar».
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        cargar()
    }, [cargar])

    // El resumen operativo cambia con el día (corte de caja, usuarios): al
    // volver a la pestaña se refresca en silencio, sin borrar lo que se veía.
    useAlReactivarPestana(() => { cargar(true) })

    const datos = [cashCut, serviceCount, userCount]
    const errores = [
        cashCut.estado === 'error' ? `Corte de caja: ${cashCut.mensaje}` : null,
        serviceCount.estado === 'error' ? `Servicios: ${serviceCount.mensaje}` : null,
        userCount.estado === 'error' ? `Usuarios: ${userCount.mensaje}` : null,
    ].filter((texto): texto is string => Boolean(texto))
    const cargando = datos.some((dato) => dato.estado === 'cargando')
    const todoCargando = datos.every((dato) => dato.estado === 'cargando')

    const encabezado = (
        <EncabezadoPantalla
            titulo="Inicio"
            descripcion="Resumen operativo de la clínica"
            icono={cilHome}
        />
    )

    if (todoCargando) {
        return (
            <div>
                {encabezado}
                <CardGridSkeleton count={4} />
            </div>
        )
    }

    const corte = cashCut.estado === 'listo' ? cashCut.valor : null

    return (
        <div>
            {encabezado}

            <div aria-live="polite">
                {errores.length > 0 && (
                    <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2">
                        <div className="flex-grow-1">
                            <strong>No se pudo cargar todo el resumen.</strong> Donde ves «—» el dato no
                            llegó; no quiere decir cero.
                            <ul className="mb-0 mt-1 small">
                                {errores.map((texto) => (
                                    <li key={texto}>{texto}</li>
                                ))}
                            </ul>
                        </div>
                        <CButton color="danger" variant="outline" size="sm" onClick={() => cargar()} disabled={cargando}>
                            Reintentar
                        </CButton>
                    </CAlert>
                )}
            </div>

            <CRow className="g-3 mb-4" data-tour="admin-kpis">
                <CCol xs={12} sm={6} lg={3}>
                    <Tarjeta
                        icono={cilCash}
                        color="success"
                        valor={mostrar(cashCut, (c) => formatCurrency(c.total_amount))}
                        etiqueta="Cobrado hoy"
                        accion="Abre el corte de caja"
                        destino="/finanzas"
                    />
                </CCol>
                <CCol xs={12} sm={6} lg={3}>
                    <Tarjeta
                        icono={cilListRich}
                        color="info"
                        valor={mostrar(cashCut, (c) => c.total_count)}
                        etiqueta="Cobros hoy"
                        accion="Abre la lista de cobros"
                        destino="/finanzas/pagos"
                    />
                </CCol>
                <CCol xs={12} sm={6} lg={3}>
                    <Tarjeta
                        icono={cilMedicalCross}
                        color="primary"
                        valor={mostrar(serviceCount, (n) => n)}
                        etiqueta="Servicios activos"
                        accion="Abre el catálogo"
                        destino="/admin/servicios"
                    />
                </CCol>
                <CCol xs={12} sm={6} lg={3}>
                    <Tarjeta
                        icono={cilPeople}
                        color="warning"
                        valor={mostrar(userCount, (n) => n)}
                        etiqueta="Usuarios"
                        accion="Abre la lista del personal"
                        destino="/admin/usuarios"
                    />
                </CCol>
            </CRow>

            <CCard className="glass-card" data-tour="admin-corte">
                <CCardBody>
                    {/* h2 con la clase de h5: la página ya va en h1 y un h5
                        saltándose niveles era error de orden (paso axe). */}
                    <h2 className="h5 mb-3">Corte de caja de hoy por método de pago</h2>
                    {cashCut.estado === 'cargando' ? (
                        <p className="text-muted text-center py-3">Cargando el corte de caja…</p>
                    ) : cashCut.estado === 'error' ? (
                        // Sin corte no se sabe si hubo cobros: decir «no hay
                        // cobros» afirmaría algo que el sistema no comprobó.
                        <p className="text-danger text-center py-3">
                            No se pudo cargar el corte de caja. {cashCut.mensaje}
                        </p>
                    ) : !corte || corte.by_method.length === 0 ? (
                        <p className="text-muted text-center py-3">No hay cobros registrados hoy.</p>
                    ) : (
                        <CTable striped responsive>
                            <CTableHead>
                                <CTableRow>
                                    <CTableHeaderCell>Método</CTableHeaderCell>
                                    <CTableHeaderCell>Transacciones</CTableHeaderCell>
                                    <CTableHeaderCell>Total</CTableHeaderCell>
                                </CTableRow>
                            </CTableHead>
                            <CTableBody>
                                {corte.by_method.map((row) => (
                                    <CTableRow key={row.method}>
                                        <CTableDataCell>{METHOD_LABELS[row.method] || row.method}</CTableDataCell>
                                        <CTableDataCell>{row.count}</CTableDataCell>
                                        <CTableDataCell>{formatCurrency(row.total_amount)}</CTableDataCell>
                                    </CTableRow>
                                ))}
                            </CTableBody>
                        </CTable>
                    )}
                </CCardBody>
            </CCard>
        </div>
    )
}

export default AdminDashboard
