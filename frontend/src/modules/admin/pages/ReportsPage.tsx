/**
 * Reports page (Admin module - Fase 3.7)
 *
 * Fase 7.4 added charts (CChart/Chart.js, both already installed) alongside
 * the existing tables - deliberately not replacing them: the table remains
 * the exact-numbers source of truth, the chart is a faster visual read of
 * the same data. Colors are read from CoreUI's own --cui-* custom
 * properties via getStyle() so they react to light/dark mode, same pattern
 * as the CoreUI template chart this project started from.
 */
import React, { useEffect, useState } from 'react'
import {
    CAlert,
    CButton,
    CCard,
    CCardBody,
    CCardHeader,
    CCol,
    CFormInput,
    CFormLabel,
    CRow,
    CSpinner,
    CTable,
    CTableBody,
    CTableDataCell,
    CTableHead,
    CTableHeaderCell,
    CTableRow,
} from '@coreui/react-pro'
import { CChart } from '@coreui/react-chartjs'
import { getStyle } from '@coreui/utils'
import { formatearFechaISO, formatearFechaISOCon, hoyLocalISO, primerDiaDelMesLocalISO } from '../../../shared/utils/date'
import CIcon from '@coreui/icons-react'
import { cilCalendar, cilPeople, cilChart } from '@coreui/icons'
import { useReports } from '../hooks/useReports'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { pedir } from '../../../shared/utils/pedidos'
import { useToast } from '../../../shared/components/ToastProvider'
import { CardGridSkeleton } from '../../../shared/components/TableSkeleton'
import type { ReportsSummary } from '../types'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const formatCurrency = (value: string) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value))

const STATUS_LABELS: Record<string, string> = {
    agendada: 'Agendada',
    confirmada: 'Confirmada',
    en_sala: 'En Sala',
    en_consulta: 'En Consulta',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
}

// Same semantic status colors used in AgendaCalendar.tsx, so a status means
// the same color everywhere in the app - CoreUI CSS var names, resolved at
// render time via getStyle() so they still work if the theme's palette changes.
const STATUS_CHART_COLOR_VARS: Record<string, string> = {
    agendada: '--cui-primary',
    confirmada: '--cui-success',
    en_sala: '--cui-warning',
    en_consulta: '--cui-purple',
    atendida: '--cui-secondary',
    cancelada: '--cui-danger',
}

// En hora local: con `toISOString()` el rango del reporte terminaba «mañana»
// cuando se abría después de las 17:00 en Mazatlán (plan 26, F-1).
const firstDayOfMonth = () => primerDiaDelMesLocalISO()

const today = () => hoyLocalISO()

const ReportsPage: React.FC = () => {
    const { getSummary } = useReports()
    const { can } = useAuth()
    const navigate = useNavigate()
    const { showError } = useToast()

    const [startDate, setStartDate] = useState(firstDayOfMonth())
    const [endDate, setEndDate] = useState(today())
    const [summary, setSummary] = useState<ReportsSummary | null>(null)
    const [loading, setLoading] = useState(true)
    // El periodo de las cifras que se ven. Antes, si «Aplicar» fallaba, se
    // quedaban las del periodo anterior bajo las fechas nuevas, sin aviso
    // (plan 29, segunda vuelta).
    const [periodoMostrado, setPeriodoMostrado] = useState<{ desde: string; hasta: string } | null>(null)
    const [errorReporte, setErrorReporte] = useState<string | null>(null)

    const loadReport = async () => {
        const periodo = { desde: startDate, hasta: endDate }
        try {
            setLoading(true)
            setErrorReporte(null)
            const data = await getSummary(`${periodo.desde}T00:00:00`, `${periodo.hasta}T23:59:59`)
            setSummary(data)
            setPeriodoMostrado(periodo)
        } catch (err: any) {
            const mensaje = err.message || 'No se pudo cargar el reporte.'
            setSummary(null)
            setPeriodoMostrado(null)
            setErrorReporte(mensaje)
            showError(mensaje)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadReport()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div>
            <EncabezadoPantalla
                titulo="Reportes"
                descripcion="Estadísticas de citas, pacientes y servicios por periodo"
                icono={cilChart}
            />

            <CCard className="mb-4 glass-card" data-tour="reportes-periodo">
                <CCardBody>
                    <CRow className="align-items-end g-3">
                        <CCol xs={12} sm={4} md={3}>
                            <CFormLabel htmlFor="start_date">Desde</CFormLabel>
                            <CFormInput
                                id="start_date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </CCol>
                        <CCol xs={12} sm={4} md={3}>
                            <CFormLabel htmlFor="end_date">Hasta</CFormLabel>
                            <CFormInput id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </CCol>
                        <CCol xs={12} sm={4} md={3}>
                            <CButton color="primary" onClick={loadReport} disabled={loading}>
                                {loading ? <CSpinner size="sm" /> : 'Aplicar'}
                            </CButton>
                        </CCol>
                    </CRow>
                </CCardBody>
            </CCard>

            {loading ? (
                <CardGridSkeleton count={2} />
            ) : errorReporte ? (
                <CAlert color="danger" className="d-flex flex-wrap align-items-center gap-2" role="alert">
                    <span className="flex-grow-1">No se pudo cargar el reporte. {errorReporte}</span>
                    <CButton color="danger" variant="outline" size="sm" onClick={loadReport}>
                        Reintentar
                    </CButton>
                </CAlert>
            ) : summary ? (
                <>
                    {periodoMostrado &&
                        (periodoMostrado.desde !== startDate || periodoMostrado.hasta !== endDate) && (
                            <CAlert color="warning" className="py-2">
                                Las cifras son del {formatearFechaISO(periodoMostrado.desde)} al{' '}
                                {formatearFechaISO(periodoMostrado.hasta)}. Pulsa <b>Aplicar</b> para ver el
                                periodo nuevo.
                            </CAlert>
                        )}
                    <CRow className="g-3 mb-4" data-tour="reportes-indicadores">
                        <CCol xs={12} sm={6} lg={4}>
                            {/* Lleva a la Agenda en el primer día del periodo, si se
                                puede abrir; si no, es solo la cifra. */}
                            {can('appointments.read') && periodoMostrado ? (
                                <button
                                    type="button"
                                    className="kpi-tile h-100 w-100 text-start text-body border-0"
                                    onClick={() => {
                                        pedir('agenda:dia', { fecha: periodoMostrado.desde })
                                        navigate('/secretaria/agenda')
                                    }}
                                >
                                    <div className="kpi-icon bg-primary bg-opacity-25 text-primary">
                                        <CIcon icon={cilCalendar} size="lg" />
                                    </div>
                                    <div>
                                        <div className="kpi-value">{summary.appointments_total}</div>
                                        <div className="kpi-label">Citas en el periodo · ver agenda</div>
                                    </div>
                                </button>
                            ) : (
                                <div className="kpi-tile h-100">
                                    <div className="kpi-icon bg-primary bg-opacity-25 text-primary">
                                        <CIcon icon={cilCalendar} size="lg" />
                                    </div>
                                    <div>
                                        <div className="kpi-value">{summary.appointments_total}</div>
                                        <div className="kpi-label">Citas en el periodo</div>
                                    </div>
                                </div>
                            )}
                        </CCol>
                        <CCol xs={12} sm={6} lg={4}>
                            <div className="kpi-tile h-100">
                                <div className="kpi-icon bg-success bg-opacity-25 text-success">
                                    <CIcon icon={cilPeople} size="lg" />
                                </div>
                                <div>
                                    <div className="kpi-value">{summary.patients_attended_count}</div>
                                    <div className="kpi-label">Pacientes atendidos (únicos)</div>
                                </div>
                            </div>
                        </CCol>
                    </CRow>

                    <CRow className="g-3" data-tour="reportes-graficas">
                        <CCol xs={12} lg={6}>
                            <CCard className="h-100 glass-card">
                                <CCardHeader>
                                    <strong>Citas por estado</strong>
                                </CCardHeader>
                                <CCardBody>
                                    {summary.appointments_by_status.length === 0 ? (
                                        <p className="text-muted text-center py-3">Sin citas en este periodo.</p>
                                    ) : (
                                        <>
                                            <CChart
                                                type="doughnut"
                                                style={{ height: '220px' }}
                                                // Nombre de la gráfica para el lector (axe, role-img-alt).
                                                aria-label="Gráfica de citas por estado en el periodo"
                                                data={{
                                                    labels: summary.appointments_by_status.map(
                                                        (row) => STATUS_LABELS[row.status] || row.status,
                                                    ),
                                                    datasets: [
                                                        {
                                                            data: summary.appointments_by_status.map((row) => row.count),
                                                            backgroundColor: summary.appointments_by_status.map((row) =>
                                                                getStyle(STATUS_CHART_COLOR_VARS[row.status] || '--cui-secondary'),
                                                            ),
                                                            borderWidth: 2,
                                                            borderColor: getStyle('--cui-card-bg') || '#fff',
                                                        },
                                                    ],
                                                }}
                                                options={{
                                                    maintainAspectRatio: false,
                                                    plugins: {
                                                        legend: {
                                                            position: 'bottom',
                                                            labels: { color: getStyle('--cui-body-color'), boxWidth: 12, padding: 12 },
                                                        },
                                                    },
                                                }}
                                            />
                                            <CTable striped responsive className="mt-3">
                                                <CTableHead>
                                                    <CTableRow>
                                                        <CTableHeaderCell>Estado</CTableHeaderCell>
                                                        <CTableHeaderCell>Citas</CTableHeaderCell>
                                                    </CTableRow>
                                                </CTableHead>
                                                <CTableBody>
                                                    {summary.appointments_by_status.map((row) => (
                                                        <CTableRow key={row.status}>
                                                            <CTableDataCell>{STATUS_LABELS[row.status] || row.status}</CTableDataCell>
                                                            <CTableDataCell>{row.count}</CTableDataCell>
                                                        </CTableRow>
                                                    ))}
                                                </CTableBody>
                                            </CTable>
                                        </>
                                    )}
                                </CCardBody>
                            </CCard>
                        </CCol>

                        <CCol xs={12} lg={6}>
                            <CCard className="h-100 glass-card">
                                <CCardHeader>
                                    <strong>Servicios más solicitados</strong>
                                    {periodoMostrado && (
                                        // Qué se cuenta y de cuándo: «Total» sin periodo se leía
                                        // como lo de siempre (plan 29, lote 5).
                                        <div className="small text-body-secondary">
                                            Cobros vigentes del {formatearFechaISO(periodoMostrado.desde)} al{' '}
                                            {formatearFechaISO(periodoMostrado.hasta)}; «Total» es lo cobrado en ese periodo.
                                        </div>
                                    )}
                                </CCardHeader>
                                <CCardBody>
                                    {summary.top_services.length === 0 ? (
                                        <p className="text-muted text-center py-3">Sin cobros de servicios en este periodo.</p>
                                    ) : (
                                        <>
                                            <CChart
                                                type="bar"
                                                style={{ height: '220px' }}
                                                aria-label="Gráfica de los servicios más cobrados en el periodo"
                                                data={{
                                                    labels: summary.top_services.map((row) => row.service_name),
                                                    datasets: [
                                                        {
                                                            label: 'Veces cobrado',
                                                            data: summary.top_services.map((row) => row.times_charged),
                                                            backgroundColor: `rgba(${getStyle('--cui-primary-rgb')}, .7)`,
                                                            borderColor: getStyle('--cui-primary'),
                                                            borderWidth: 1,
                                                            borderRadius: 6,
                                                        },
                                                    ],
                                                }}
                                                options={{
                                                    indexAxis: 'y',
                                                    maintainAspectRatio: false,
                                                    plugins: { legend: { display: false } },
                                                    scales: {
                                                        x: {
                                                            beginAtZero: true,
                                                            ticks: { color: getStyle('--cui-body-color'), precision: 0 },
                                                            grid: { color: getStyle('--cui-border-color-translucent') },
                                                        },
                                                        y: {
                                                            ticks: { color: getStyle('--cui-body-color') },
                                                            grid: { display: false },
                                                        },
                                                    },
                                                }}
                                            />
                                            <CTable striped responsive className="mt-3">
                                                <CTableHead>
                                                    <CTableRow>
                                                        <CTableHeaderCell>Servicio</CTableHeaderCell>
                                                        <CTableHeaderCell>Veces</CTableHeaderCell>
                                                        <CTableHeaderCell>Total</CTableHeaderCell>
                                                    </CTableRow>
                                                </CTableHead>
                                                <CTableBody>
                                                    {summary.top_services.map((row) => (
                                                        <CTableRow key={row.service_id}>
                                                            <CTableDataCell>{row.service_name}</CTableDataCell>
                                                            <CTableDataCell>{row.times_charged}</CTableDataCell>
                                                            <CTableDataCell>{formatCurrency(row.total_amount)}</CTableDataCell>
                                                        </CTableRow>
                                                    ))}
                                                </CTableBody>
                                            </CTable>
                                        </>
                                    )}
                                </CCardBody>
                            </CCard>
                        </CCol>
                    </CRow>

                    <CCard className="mt-3 glass-card" data-tour="reportes-por-dia">
                        <CCardHeader>
                            <strong>Citas por día</strong>
                        </CCardHeader>
                        <CCardBody>
                            {summary.appointments_daily.length === 0 ? (
                                <p className="text-muted text-center py-3">Sin datos para este periodo.</p>
                            ) : (
                                <>
                                    <CChart
                                        type="line"
                                        style={{ height: '260px' }}
                                        aria-label="Gráfica de citas por día en el periodo"
                                        data={{
                                            labels: summary.appointments_daily.map((row) => formatearFechaISOCon(row.day, { day: 'numeric', month: 'short' })),
                                            datasets: [
                                                {
                                                    label: 'Citas',
                                                    data: summary.appointments_daily.map((row) => row.count),
                                                    backgroundColor: `rgba(${getStyle('--cui-primary-rgb')}, .12)`,
                                                    borderColor: getStyle('--cui-primary'),
                                                    pointBackgroundColor: getStyle('--cui-primary'),
                                                    borderWidth: 2,
                                                    fill: true,
                                                    tension: 0.35,
                                                },
                                            ],
                                        }}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: { legend: { display: false } },
                                            scales: {
                                                x: {
                                                    ticks: { color: getStyle('--cui-body-color'), maxTicksLimit: 12 },
                                                    grid: { display: false },
                                                },
                                                y: {
                                                    beginAtZero: true,
                                                    ticks: { color: getStyle('--cui-body-color'), precision: 0 },
                                                    grid: { color: getStyle('--cui-border-color-translucent') },
                                                },
                                            },
                                            elements: {
                                                point: { radius: 2, hoverRadius: 5 },
                                            },
                                        }}
                                    />
                                    <CTable striped responsive className="mt-3">
                                        <CTableHead>
                                            <CTableRow>
                                                <CTableHeaderCell>Día</CTableHeaderCell>
                                                <CTableHeaderCell>Citas</CTableHeaderCell>
                                            </CTableRow>
                                        </CTableHead>
                                        <CTableBody>
                                            {summary.appointments_daily.map((row) => (
                                                <CTableRow key={row.day}>
                                                    <CTableDataCell>{formatearFechaISO(row.day)}</CTableDataCell>
                                                    <CTableDataCell>{row.count}</CTableDataCell>
                                                </CTableRow>
                                            ))}
                                        </CTableBody>
                                    </CTable>
                                </>
                            )}
                        </CCardBody>
                    </CCard>
                </>
            ) : null}
        </div>
    )
}

export default ReportsPage
