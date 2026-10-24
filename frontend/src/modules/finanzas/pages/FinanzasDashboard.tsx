/**
 * Corte de caja.
 *
 * Además del desglose por método trae dos más (plan 23, "Dinero físico"):
 * por doctora —de quién es el ingreso— y por quién lo recibió —quién tiene el
 * efectivo—. Sin el segundo, el corte de recepción no cuadra con la caja cuando
 * la doctora cobró en efectivo en su consultorio.
 *
 * La doctora ve sólo su corte (lo limita el servidor), así que no se le ofrece
 * elegir doctora. La secretaria con permiso de corte ve el de las doctoras que
 * apoya (plan 23, ajustes del 2026-09-28): el selector se arma con las que el
 * servidor dice que son suyas, no con el directorio, y si no tiene ninguna se
 * le dice en vez de pintar un día en ceros que parecería sin cobros.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  CAlert,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CRow,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCash, cilChart, cilPeople, cilUser, cilWallet } from '@coreui/icons'

import { useAuth } from '../../../shared/context/AuthContext'
import { Role } from '../../../shared/types'
import { useFinanzas } from '../hooks/useFinanzas'
import { useDoctoras } from '../hooks/useDoctoras'
import type { CashCutFilters, CashCutReport } from '../types'
import { etiquetaMetodo, formatoMoneda } from '../utils/cobro'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

interface FilaDesglose {
  clave: string
  nombre: string
  count: number
  total_amount: string
}

const TablaDesglose: React.FC<{
  titulo: string
  icono: any
  columna: string
  filas: FilaDesglose[] | null
  corte: CashCutReport | null
  tour?: string
  /** Cuando se quitaron filas, el total del corte ya no es la suma: no se pinta. */
  sinTotal?: boolean
  nota?: React.ReactNode
  /** Qué decir si no quedan filas; por omisión, que no hubo movimientos. */
  vacio?: string
}> = ({ titulo, icono, columna, filas, corte, tour, sinTotal, nota, vacio }) => (
  <CCard className="glass-card mb-4" data-tour={tour}>
    <CCardHeader className="fw-semibold">
      <CIcon icon={icono} className="me-2" />
      {titulo}
    </CCardHeader>
    <CCardBody>
      {filas === null ? (
        // Un backend que todavía no manda este desglose no es lo mismo que
        // "no hubo movimientos": se dice cuál de las dos es.
        <p className="text-muted small mb-0">Este desglose todavía no está disponible.</p>
      ) : (
        <CTable small hover responsive>
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>{columna}</CTableHeaderCell>
              <CTableHeaderCell>Transacciones</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Total</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {filas.map((f) => (
              <CTableRow key={f.clave}>
                <CTableDataCell>
                  <span className="fw-semibold">{f.nombre}</span>
                </CTableDataCell>
                <CTableDataCell>{f.count}</CTableDataCell>
                <CTableDataCell className="text-end fw-bold">{formatoMoneda(f.total_amount)}</CTableDataCell>
              </CTableRow>
            ))}
            {filas.length === 0 && (
              <CTableRow>
                <CTableDataCell colSpan={3} className="text-center text-muted small py-3">
                  {vacio ?? 'No hay movimientos en este periodo.'}
                </CTableDataCell>
              </CTableRow>
            )}
          </CTableBody>
          {corte && !sinTotal && filas.length > 0 && (
            <tfoot>
              <CTableRow className="table-active fw-bold">
                <CTableDataCell>Total</CTableDataCell>
                <CTableDataCell>{corte.total_count}</CTableDataCell>
                <CTableDataCell className="text-end">{formatoMoneda(corte.total_amount)}</CTableDataCell>
              </CTableRow>
            </tfoot>
          )}
        </CTable>
      )}
      {nota && <p className="small text-muted mb-0">{nota}</p>}
    </CCardBody>
  </CCard>
)

/**
 * "Mi caja: lo que recibí". El arqueo de la secretaria: todo lo que ella
 * cobró en el periodo, de cualquier doctora (plan 23, revisión de flujos). Si
 * saliera del corte acotado a sus doctoras no cuadraría con el cajón.
 */
const MiCaja: React.FC<{ caja: NonNullable<CashCutReport['mi_caja']>; periodo: string }> = ({ caja, periodo }) => {
  const efectivo = caja.by_method.find((m) => m.method === 'cash')
  return (
    <CCard className="glass-card mb-4 border-start border-4 border-primary" data-tour="finanzas-mi-caja">
      <CCardHeader className="fw-semibold">
        <CIcon icon={cilWallet} className="me-2" />
        Mi caja: lo que recibí
      </CCardHeader>
      <CCardBody>
        <p className="small text-muted">
          Todo lo que cobraste tú, de cualquier doctora de la sucursal. No cambia con el selector de doctora.
          El <strong>efectivo</strong> es lo que debe haber en tu caja.
        </p>
        <CRow className="mb-3 g-3">
          <CCol xs={6} md={4}>
            <div className="text-muted small">{periodo}</div>
            <div className="fw-bold fs-5">{formatoMoneda(caja.total_amount)}</div>
          </CCol>
          <CCol xs={6} md={4}>
            <div className="text-muted small">En efectivo</div>
            <div className="fw-bold fs-5">{formatoMoneda(efectivo?.total_amount ?? 0)}</div>
          </CCol>
          <CCol xs={6} md={4}>
            <div className="text-muted small">Transacciones</div>
            <div className="fw-bold fs-5">{caja.count}</div>
          </CCol>
        </CRow>
        <CTable small hover responsive className="mb-0">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Método</CTableHeaderCell>
              <CTableHeaderCell>Transacciones</CTableHeaderCell>
              <CTableHeaderCell className="text-end">Total</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {caja.by_method.map((m) => (
              <CTableRow key={m.method}>
                <CTableDataCell className="fw-semibold">{etiquetaMetodo(m.method)}</CTableDataCell>
                <CTableDataCell>{m.count}</CTableDataCell>
                <CTableDataCell className="text-end fw-bold">{formatoMoneda(m.total_amount)}</CTableDataCell>
              </CTableRow>
            ))}
            {caja.by_method.length === 0 && (
              <CTableRow>
                <CTableDataCell colSpan={3} className="text-center text-muted small py-3">
                  No recibiste cobros en este periodo.
                </CTableDataCell>
              </CTableRow>
            )}
          </CTableBody>
        </CTable>
      </CCardBody>
    </CCard>
  )
}

const FinanzasDashboard: React.FC = () => {
  const { getCashCut, loading } = useFinanzas()
  const { user } = useAuth()
  const esDoctora = user?.role === Role.DOCTOR
  // La secretaria no usa el directorio: sus doctoras las dice el corte.
  const esSecretaria = user?.role === Role.SECRETARIA
  const { doctoras: directorio } = useDoctoras(!esDoctora && !esSecretaria)
  const [cashCut, setCashCut] = useState<CashCutReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Vacías = "hoy" en hora de México, que es lo que decide el servidor.
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [doctorId, setDoctorId] = useState('')

  const cargar = useCallback(() => {
    const filtros: CashCutFilters = {}
    if (desde) filtros.start_date = desde
    if (hasta) filtros.end_date = hasta
    if (doctorId && !esDoctora) filtros.doctor_id = Number(doctorId)
    getCashCut(filtros)
      .then((corte) => {
        setCashCut(corte)
        setError(null)
      })
      .catch((e) => {
        // Se retira el corte anterior: dejarlo junto al error haría pasar los
        // números de otro periodo por los del que se pidió.
        setCashCut(null)
        setError(e.message)
      })
  }, [getCashCut, desde, hasta, doctorId, esDoctora])

  useEffect(() => {
    cargar()
  }, [cargar])

  const periodo = desde || hasta ? 'Total del periodo' : 'Total del día'

  const acotadaASusDoctoras = cashCut?.alcance === 'asignadas'
  const doctorasDelSelector = acotadaASusDoctoras
    ? (cashCut?.doctoras_del_alcance ?? []).map((d) => ({ id: d.doctor_id, full_name: d.doctor_name }))
    : directorio
  const sinAsignadas = acotadaASusDoctoras && doctorasDelSelector.length === 0

  const porMetodo: FilaDesglose[] | null = cashCut
    ? cashCut.by_method.map((m) => ({
        clave: m.method,
        nombre: etiquetaMetodo(m.method),
        count: m.count,
        total_amount: m.total_amount,
      }))
    : []
  const porDoctora: FilaDesglose[] | null = cashCut?.by_doctor
    ? cashCut.by_doctor.map((d) => ({
        clave: String(d.doctor_id ?? 'sin-doctora'),
        nombre: d.doctor_name || 'Sin doctora asignada',
        count: d.count,
        total_amount: d.total_amount,
      }))
    : cashCut
      ? null
      : []
  // Con "Mi caja" a la vista, su propia fila del corte acotado (sólo lo de sus
  // doctoras) diría otra cifra que su caja: se quita para no dar dos números.
  const miCaja = cashCut?.mi_caja ?? null
  const porQuienRecibio: FilaDesglose[] | null = cashCut?.by_received_by
    ? cashCut.by_received_by.filter((r) => !miCaja || r.user_id !== miCaja.user_id).map((r) => ({
        clave: String(r.user_id),
        nombre: r.user_name,
        count: r.count,
        total_amount: r.total_amount,
      }))
    : cashCut
      ? null
      : []

  return (
    <>
      <EncabezadoPantalla
        titulo={esDoctora ? 'Mi corte de caja' : 'Corte de caja'}
        descripcion={
          esDoctora
            ? 'Lo que ingresó a tu nombre y quién lo recibió.'
            : acotadaASusDoctoras
              ? 'El corte de las doctoras que apoyas: por método, por doctora y por quién recibió el dinero.'
              : 'Corte de caja por método, por doctora y por quién recibió el dinero.'
        }
        icono={cilCash}
      />
      <CCard className="glass-card mb-4">
        <CCardBody>
          <CRow className="g-2 align-items-end">
            <CCol xs={6} md="auto" data-tour="finanzas-fechas">
              <CFormLabel htmlFor="corte-desde" className="small mb-0">
                Desde
              </CFormLabel>
              <CFormInput id="corte-desde" size="sm" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </CCol>
            <CCol xs={6} md="auto">
              <CFormLabel htmlFor="corte-hasta" className="small mb-0">
                Hasta
              </CFormLabel>
              <CFormInput id="corte-hasta" size="sm" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </CCol>
            {!esDoctora && !sinAsignadas && (
              <CCol xs={12} md={3} data-tour="finanzas-selector-doctora">
                <CFormLabel htmlFor="corte-doctora" className="small mb-0">
                  Doctora
                </CFormLabel>
                <CFormSelect id="corte-doctora" size="sm" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">{acotadaASusDoctoras ? 'Todas mis doctoras' : 'Todas las doctoras'}</option>
                  {doctorasDelSelector.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </CFormSelect>
              </CCol>
            )}
            <CCol className="small text-muted">
              {desde || hasta ? '' : 'Sin fechas se muestra el corte de hoy.'}
            </CCol>
          </CRow>
        </CCardBody>
      </CCard>

      {/* Sin corte no se pintan los totales ni las tablas: con el error a la
          vista seguían diciendo «No hay movimientos en este periodo» y «-»,
          como si no se hubiera cobrado nada (plan 29, lote 6). */}
      {error && (
        <CAlert color="danger" className="py-2 small" role="alert">
          {error} No se muestra el corte: lo que hubiera abajo no sería cierto.
        </CAlert>
      )}

      {miCaja && <MiCaja caja={miCaja} periodo={periodo} />}

      {acotadaASusDoctoras && !sinAsignadas && (
        <h5 className="mb-3" data-tour="finanzas-bloque-doctoras">
          Por doctora (las que apoyo)
        </h5>
      )}

      {sinAsignadas ? (
        <CAlert color="warning" data-tour="finanzas-sin-asignadas">
          No tienes doctoras asignadas; pídele a administración que te asigne. Mientras tanto el corte por
          doctora no puede mostrarte nada, aunque sí haya habido cobros.
        </CAlert>
      ) : error && !cashCut ? null : loading && !cashCut ? (
        <div className="pt-3 text-center">
          <CSpinner color="primary" variant="grow" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <CRow className="mb-4" data-tour="finanzas-resumen">
            <CCol sm={6} xl={4}>
              <CCard className="glass-card border-start border-4 border-success h-100">
                <CCardBody className="d-flex align-items-center gap-3">
                  <div className="bg-success bg-opacity-10 rounded-3 p-3">
                    <CIcon icon={cilCash} size="xl" className="text-success" />
                  </div>
                  <div>
                    <div className="text-muted small">{periodo}</div>
                    <div className="fw-bold fs-5">{cashCut ? formatoMoneda(cashCut.total_amount) : '-'}</div>
                  </div>
                </CCardBody>
              </CCard>
            </CCol>
            <CCol sm={6} xl={4}>
              <CCard className="glass-card border-start border-4 border-info h-100">
                <CCardBody className="d-flex align-items-center gap-3">
                  <div className="bg-info bg-opacity-10 rounded-3 p-3">
                    <CIcon icon={cilWallet} size="xl" className="text-info" />
                  </div>
                  <div>
                    <div className="text-muted small">Transacciones</div>
                    <div className="fw-bold fs-5">{cashCut ? cashCut.total_count : '-'}</div>
                  </div>
                </CCardBody>
              </CCard>
            </CCol>
            <CCol sm={6} xl={4}>
              <CCard className="glass-card border-start border-4 border-warning h-100">
                <CCardBody className="d-flex align-items-center gap-3">
                  <div className="bg-warning bg-opacity-10 rounded-3 p-3">
                    <CIcon icon={cilChart} size="xl" className="text-warning" />
                  </div>
                  <div>
                    <div className="text-muted small">Métodos</div>
                    <div className="fw-bold fs-5">{cashCut ? cashCut.by_method.length : '-'}</div>
                  </div>
                </CCardBody>
              </CCard>
            </CCol>
          </CRow>

          <TablaDesglose
            tour="finanzas-corte"
            titulo="Corte de Caja — Desglose por método de pago"
            icono={cilCash}
            columna="Método"
            filas={porMetodo}
            corte={cashCut}
          />
          {!esDoctora && (
            <TablaDesglose
              tour="finanzas-por-doctora"
              titulo="Por doctora (de quién es el ingreso)"
              icono={cilUser}
              columna="Doctora"
              filas={porDoctora}
              corte={cashCut}
            />
          )}
          <TablaDesglose
            tour="finanzas-por-quien-recibio"
            titulo="Por quién lo recibió (quién tiene el dinero)"
            icono={cilPeople}
            columna="Recibió"
            filas={porQuienRecibio}
            corte={cashCut}
            sinTotal={Boolean(miCaja)}
            // Sin su propia fila, una tabla vacía no quiere decir que no hubo
            // cobros: quiere decir que sólo cobró ella.
            vacio={miCaja ? 'Nadie más recibió cobros de estas doctoras en este periodo.' : undefined}
            nota={
              miCaja
                ? 'Lo que recibiste tú está arriba, en «Mi caja». Aquí queda quién más cobró el ingreso de estas doctoras.'
                : undefined
            }
          />
        </>
      )}
    </>
  )
}

export default FinanzasDashboard
