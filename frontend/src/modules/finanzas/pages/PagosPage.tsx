/**
 * Historial de pagos ("Mis cobros" para el médico).
 *
 * Qué ve cada quien lo decide el servidor (plan 23, "Alcance por rol"): la
 * doctora sólo recibe sus pagos, así que aquí no se le ofrece elegir doctora.
 * Secretaria y admin arrancan en "Todas" para que nadie deje de ver lo que ya
 * veía.
 */
import React, { useEffect, useState, useCallback } from 'react'
import {
  CAlert, CCard, CCardBody, CCol, CRow, CSpinner, CBadge, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow,
  CButton, CFormSelect, CInputGroup, CInputGroupText, CFormInput, CFormLabel,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilEnvelopeClosed, cilPlus, cilBan, cilPrint, cilWallet } from '@coreui/icons'

import { useAuth } from '../../../shared/context/AuthContext'
import { Role } from '../../../shared/types'
import { useFinanzas } from '../hooks/useFinanzas'
import { useDoctoras } from '../hooks/useDoctoras'
import { RegistrarPagoModal } from '../components/RegistrarPagoModal'
import { useAtenderPedido } from '../../../shared/utils/pedidos'
import { AnularPagoModal } from '../components/AnularPagoModal'
import type { Payment, PaymentFilters } from '../types'
import { METODOS, etiquetaMetodo, formatoMoneda } from '../utils/cobro'
import { imprimirComprobante, pagoConComprobante, type DatosClinica } from '../utils/comprobante'
import { listTenants } from '../../../shared/services/tenants'
import { diaDelConsultorio, formatearInstante, hoyLocalISO } from '../../../shared/utils/date'
import TablaResponsiva from '../../../shared/components/TablaResponsiva'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

/** Tope que se pide al servidor; el contador no puede leerse como el total del periodo. */
const LIMITE_PAGOS = 100

/**
 * «Mismo día» como lo decide el servidor: `created_at` en hora del consultorio
 * (cobro_service.puede_anular). Antes se comparaba con el reloj del navegador y
 * sobre `paid_at || created_at`, así que la pantalla ofrecía anular donde el
 * servidor lo negaría —y escondía el botón donde sí se podía.
 */
const mismoDiaDelConsultorio = (iso: string): boolean => diaDelConsultorio(iso) === hoyLocalISO()

const PagosPage: React.FC = () => {
  const { fetchPayments, sendReceipt, loading } = useFinanzas()
  const { user, can, permissions } = useAuth()
  const esDoctora = user?.role === Role.DOCTOR
  const esAdmin = user?.role === Role.ADMIN || user?.role === Role.MASTER
  // Una sesión vieja sin permisos en el perfil no debe perder los botones que
  // ya tenía; el servidor sigue siendo quien autoriza.
  const sinPermisosEnPerfil = !permissions || permissions.length === 0
  const puede = (accion: string) => sinPermisosEnPerfil || can(accion)

  const { doctoras } = useDoctoras(!esDoctora)
  const [payments, setPayments] = useState<Payment[]>([])
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [filterMethod, setFilterMethod] = useState('')
  const [filterDoctor, setFilterDoctor] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  // «Registrar cobro» desde el inicio del médico abre el registro (plan 28).
  useAtenderPedido('pagos:registrar', () => setShowPaymentModal(true))
  const [porAnular, setPorAnular] = useState<Payment | null>(null)
  // `pago`: el recién registrado, para ofrecer su comprobante ahí mismo, que es
  // cuando el paciente sigue en el mostrador.
  const [aviso, setAviso] = useState<{ color: string; texto: string; pago?: Payment } | null>(null)

  const loadPayments = useCallback(async () => {
    const filtros: PaymentFilters = {}
    if (filterMethod) filtros.method = filterMethod
    if (filterDoctor && !esDoctora) filtros.doctor_id = Number(filterDoctor)
    if (desde) filtros.start_date = desde
    if (hasta) filtros.end_date = hasta
    // El tope se pide explícito para poder decir con verdad cuántos se muestran:
    // el servidor recorta en 100 por su cuenta y una lista cortada sin avisar
    // hacía pasar el tope por el total del periodo.
    filtros.limit = LIMITE_PAGOS
    try {
      setPayments(await fetchPayments(filtros))
      setErrorLista(null)
    } catch (err: any) {
      // Una lista vacía por error se leería como "no hay pagos": se dice.
      setErrorLista(err?.message || 'No se pudieron cargar los pagos.')
    }
  }, [fetchPayments, filterMethod, filterDoctor, desde, hasta, esDoctora])

  useEffect(() => { void loadPayments() }, [loadPayments])

  // Pestaña keep-alive: al volver a «Cobros» la tabla muestra los pagos del
  // momento en que se abrió. Se vuelven a pedir al activar la pestaña (o al
  // volver a la ventana) para que un cobro hecho mientras tanto se vea solo.
  // `loadPayments` conserva los filtros y la búsqueda; sólo reemplaza la lista.
  useAlReactivarPestana(loadPayments)

  // Datos de la clínica para el comprobante: se piden al primer uso y se
  // guardan, no en cada impresión.
  const [clinicas, setClinicas] = useState<Record<number, DatosClinica> | null>(null)

  const handleImprimir = async (pago: Payment) => {
    try {
      let porId = clinicas
      if (!porId) {
        const sucursales = await listTenants()
        porId = Object.fromEntries(sucursales.map((t) => [t.id, t]))
        setClinicas(porId)
      }
      const clinica = porId[pago.tenant_id]
      // Sin la sucursal no hay a nombre de quién emitir el comprobante; no se
      // imprime uno con la clínica en blanco.
      if (!clinica) {
        setAviso({
          color: 'danger',
          texto: 'No se encontraron los datos de la clínica de este pago; no se imprimió el comprobante.',
        })
        return
      }
      imprimirComprobante(pago, clinica)
      setAviso({ color: 'info', texto: 'Se abrió la impresión del comprobante.' })
    } catch (err: any) {
      setAviso({
        color: 'danger',
        texto: `${err?.message || 'No se pudieron cargar los datos de la clínica.'} No se imprimió el comprobante.`,
      })
    }
  }

  const handleSendReceipt = async (paymentId: number) => {
    try {
      const { to_email } = await sendReceipt(paymentId)
      setAviso({ color: 'success', texto: `Recibo enviado a ${to_email}.` })
    } catch (err: any) {
      setAviso({ color: 'danger', texto: err?.message || 'No se pudo enviar el recibo.' })
    }
  }

  const alRegistrar = (pago: Payment, detalle?: { express: boolean }) => {
    setShowPaymentModal(false)
    // Se anuncia lo que devolvió el servidor, no lo que se tecleó. La agenda se
    // menciona sólo si el pago volvió ligado a su cita: si no, no se puede
    // afirmar que la consulta express quedó registrada.
    const enAgenda = detalle?.express && pago.appointment_id ? ' La consulta express quedó en la agenda.' : ''
    setAviso({
      color: 'success',
      texto: `Pago registrado: ${formatoMoneda(pago.amount)} con ${etiquetaMetodo(pago.method).toLowerCase()}${
        pago.patient_name ? ` de ${pago.patient_name}` : ''
      }.${enAgenda}`,
      pago,
    })
    void loadPayments()
  }

  const alAnular = (pago: Payment, detalle?: { consultaCancelada: boolean }) => {
    setPorAnular(null)
    setPayments((actuales) => actuales.map((p) => (p.id === pago.id ? { ...p, ...pago } : p)))
    setAviso({
      color: 'success',
      texto: `Pago anulado. Ya no cuenta en los totales.${
        detalle?.consultaCancelada ? ' La consulta express quedó cancelada en la agenda.' : ''
      }`,
    })
  }

  const puedeAnular = (p: Payment) =>
    p.status !== 'anulado' &&
    (esAdmin || (p.received_by_user_id === user?.id && mismoDiaDelConsultorio(p.created_at)))

  const termino = searchTerm.toLowerCase()
  const filtered = payments.filter(p =>
    !termino ||
    (p.patient_name || '').toLowerCase().includes(termino) ||
    (p.description || '').toLowerCase().includes(termino) ||
    (p.service_name || '').toLowerCase().includes(termino)
  )
  // Con el tope alcanzado hay (o puede haber) más pagos que los mostrados: el
  // contador lo dice en vez de leerse como el total del periodo.
  const hayMasPagos = payments.length >= LIMITE_PAGOS

  return (
    <>
      <EncabezadoPantalla
        titulo={esDoctora ? 'Mis cobros' : 'Cobros'}
        descripcion={
          esDoctora
            ? 'Los pagos de tus pacientes, los cobres tú o recepción.'
            : 'Consulta y administra los pagos registrados.'
        }
        icono={cilWallet}
        data-tour="pagos-mis-cobros"
      />

      {aviso && (
        <CAlert color={aviso.color} dismissible onClose={() => setAviso(null)} className="py-2">
          {aviso.texto}
          {aviso.pago && pagoConComprobante(aviso.pago) && (
            <CButton
              color="link"
              size="sm"
              className="p-0 ms-2 align-baseline"
              onClick={() => void handleImprimir(aviso.pago as Payment)}
            >
              Imprimir comprobante
            </CButton>
          )}
        </CAlert>
      )}

      {/* Filtros */}
      <CCard className="glass-card mb-4" data-tour="pagos-filtros">
        <CCardBody>
          <CRow className="g-2 align-items-end">
            {/* En tablet (md) los cuatro filtros en una fila cortaban "Todos los
                métodos" y "Todos los médicos": van de dos en dos hasta lg. */}
            <CCol sm={6} lg={3}>
              <CInputGroup size="sm">
                <CInputGroupText className="bg-transparent">
                  <CIcon icon={cilSearch} />
                </CInputGroupText>
                <CFormInput
                  placeholder="Buscar por paciente o concepto..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </CInputGroup>
            </CCol>
            <CCol sm={6} lg={2}>
              <CFormSelect size="sm" aria-label="Método" value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
                <option value="">Todos los métodos</option>
                {Object.entries(METODOS).map(([valor, { label }]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </CFormSelect>
            </CCol>
            {!esDoctora && (
              <CCol sm={6} lg={2} data-tour="pagos-selector-doctora">
                <CFormSelect
                  size="sm"
                  aria-label="Médico"
                  value={filterDoctor}
                  onChange={e => setFilterDoctor(e.target.value)}
                >
                  <option value="">Todos los médicos</option>
                  {doctoras.map(d => (
                    <option key={d.id} value={d.id}>{d.full_name}</option>
                  ))}
                </CFormSelect>
              </CCol>
            )}
            <CCol xs={6} sm={3} lg="auto">
              <CFormLabel htmlFor="pagos-desde" className="small mb-0">Desde</CFormLabel>
              <CFormInput id="pagos-desde" size="sm" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
            </CCol>
            <CCol xs={6} sm={3} lg="auto">
              <CFormLabel htmlFor="pagos-hasta" className="small mb-0">Hasta</CFormLabel>
              <CFormInput id="pagos-hasta" size="sm" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
            </CCol>
            <CCol lg="auto" className="ms-auto d-flex gap-2 align-items-center">
              {puede('payments.create') && (
                <CButton color="success" size="sm" data-tour="pagos-registrar" onClick={() => setShowPaymentModal(true)}>
                  <CIcon icon={cilPlus} className="me-1" />Registrar pago
                </CButton>
              )}
              <span className="small text-muted">
                {hayMasPagos
                  ? termino
                    ? `${filtered.length} de los ${payments.length} más recientes del periodo`
                    : `Mostrando los ${payments.length} más recientes del periodo`
                  : `${filtered.length} pago(s)`}
              </span>
            </CCol>
          </CRow>
        </CCardBody>
      </CCard>

      {errorLista && (
        <CAlert color="danger" className="py-2">
          {errorLista}{' '}
          <CButton color="link" size="sm" className="p-0" onClick={() => void loadPayments()}>
            Reintentar
          </CButton>
        </CAlert>
      )}

      {/* Tabla de pagos */}
      <CCard className="glass-card" data-tour="pagos-tabla">
        <CCardBody>
          {loading ? (
            <div className="text-center py-4"><CSpinner color="primary" /></div>
          ) : (
            <TablaResponsiva small hover responsive>
              <CTableHead>
                <CTableRow>
                  {/* En el teléfono el paciente va de título y la fecha como dato. */}
                  <CTableHeaderCell data-tarjeta="dato">Fecha</CTableHeaderCell>
                  <CTableHeaderCell data-tarjeta="titulo">Paciente</CTableHeaderCell>
                  <CTableHeaderCell>Concepto</CTableHeaderCell>
                  <CTableHeaderCell>Médico</CTableHeaderCell>
                  <CTableHeaderCell>Recibió</CTableHeaderCell>
                  <CTableHeaderCell>Método</CTableHeaderCell>
                  <CTableHeaderCell data-tarjeta="ocultar">Referencia</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Monto</CTableHeaderCell>
                  <CTableHeaderCell className="text-center">Acciones</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {filtered.map(p => {
                  const anulado = p.status === 'anulado'
                  // El anulado se ve, tachado: borrarlo de la vista haría que
                  // el historial y el voucher de la terminal no cuadren.
                  const tachado = anulado ? { textDecoration: 'line-through' } : undefined
                  return (
                    <CTableRow key={p.id} className={anulado ? 'text-body-secondary' : ''} data-anulado={anulado || undefined}>
                      <CTableDataCell className="small" style={tachado}>
                        {formatearInstante(p.paid_at || p.created_at, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </CTableDataCell>
                      <CTableDataCell className="small fw-semibold" style={tachado}>
                        {p.patient_name || `Paciente #${p.patient_id}`}
                      </CTableDataCell>
                      <CTableDataCell className="small text-muted" style={tachado}>
                        {p.description || p.service_name || '-'}
                      </CTableDataCell>
                      <CTableDataCell className="small" style={tachado}>
                        {p.doctor_name || 'Sin doctora asignada'}
                      </CTableDataCell>
                      <CTableDataCell className="small" style={tachado}>
                        {p.received_by_name || '-'}
                      </CTableDataCell>
                      <CTableDataCell>
                        <CBadge color={METODOS[p.method]?.color || 'secondary'} shape="rounded-pill" className="small">
                          {etiquetaMetodo(p.method)}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="small" style={tachado}>{p.referencia || '-'}</CTableDataCell>
                      <CTableDataCell className="text-end fw-bold">
                        <span style={tachado}>{formatoMoneda(p.amount)}</span>
                        {anulado && (
                          <div>
                            <CBadge color="danger" title={p.void_reason || undefined}>Anulado</CBadge>
                            {p.void_reason && <div className="small fw-normal">{p.void_reason}</div>}
                          </div>
                        )}
                      </CTableDataCell>
                      <CTableDataCell className="text-center text-nowrap">
                        {pagoConComprobante(p) && (
                          <CButton
                            color="secondary"
                            variant="ghost"
                            size="sm"
                            data-tour="pagos-imprimir"
                            onClick={() => void handleImprimir(p)}
                            title="Imprimir comprobante"
                            aria-label="Imprimir comprobante"
                          >
                            <CIcon icon={cilPrint} />
                          </CButton>
                        )}
                        {!anulado && puede('payments.send_receipt') && (
                          <CButton
                            color="primary"
                            variant="ghost"
                            size="sm"
                            data-tour="pagos-recibo"
                            onClick={() => void handleSendReceipt(p.id)}
                            title="Enviar recibo por correo"
                            aria-label="Enviar recibo por correo"
                          >
                            <CIcon icon={cilEnvelopeClosed} />
                          </CButton>
                        )}
                        {puedeAnular(p) && (
                          <CButton
                            color="danger"
                            variant="ghost"
                            size="sm"
                            data-tour="pagos-anular"
                            onClick={() => setPorAnular(p)}
                            title="Anular pago"
                            aria-label="Anular pago"
                          >
                            <CIcon icon={cilBan} />
                          </CButton>
                        )}
                      </CTableDataCell>
                    </CTableRow>
                  )
                })}
                {filtered.length === 0 && !errorLista && (
                  <CTableRow>
                    <CTableDataCell colSpan={9} className="text-center text-muted small py-4">
                      <div className="mb-3">No hay pagos registrados.</div>
                      {/* U-03: estado vacío con acción. Mismo permiso y misma acción
                          que el botón del encabezado. */}
                      {puede('payments.create') && (
                        <CButton color="success" size="sm" onClick={() => setShowPaymentModal(true)}>
                          <CIcon icon={cilPlus} className="me-1" />
                          Registrar pago
                        </CButton>
                      )}
                    </CTableDataCell>
                  </CTableRow>
                )}
              </CTableBody>
            </TablaResponsiva>
          )}
        </CCardBody>
      </CCard>

      <RegistrarPagoModal
        visible={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onRegistrado={alRegistrar}
        esDoctora={esDoctora}
        doctoras={doctoras}
      />
      <AnularPagoModal pago={porAnular} onClose={() => setPorAnular(null)} onAnulado={alAnular} />
    </>
  )
}

export default PagosPage
