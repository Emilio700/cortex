/**
 * Registrar un pago: el de una cita atendida o un cobro suelto.
 *
 * El caso que lo motivó (plan 23): el médico cobraba en consultorio y la
 * secretaria, sin saberlo, volvía a cobrar la misma cita. Aquí cada cita
 * atendida dice si ya se cobró, quién y cuánto, y la cobrada queda bloqueada.
 * Cobrarla otra vez (un estudio agregado) es una acción aparte y confirmada.
 *
 * El servidor es quien de verdad impide el cobro doble (409); esta pantalla
 * sólo evita que se llegue a intentarlo y, si pasa, muestra lo que él dijo.
 *
 * Cobro suelto (ajustes del 2026-09-28): la primera pregunta es "¿Qué se
 * cobra?". Una consulta que no se agendó va como "express": el servidor crea
 * la cita ya atendida y el pago juntos, para que la consulta quede en la agenda.
 * Otro concepto (producto, estudio) sigue sin cita.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useCierreSeguro } from '../../../shared/hooks/useCierreSeguro'
import {
  CAlert,
  CBadge,
  CButton,
  CCloseButton,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CInputGroup,
  CInputGroupText,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CNav,
  CNavItem,
  CNavLink,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilDollar } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import type { User } from '../../../shared/types'
import { useFinanzas } from '../hooks/useFinanzas'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import type { CamposCobroDeCita, Payment, PaymentCreate, PaymentMethod } from '../types'
import {
  ESTADO_COBRO,
  describirCobro,
  formatoMoneda,
  nuevoIdDeIntento,
  pideReferencia,
  type ErrorDeCobro,
} from '../utils/cobro'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'
import { formatearHoraDeCita, inicioDelDiaEnConsultorio } from '../../../shared/utils/date'

interface CitaDeHoy extends CamposCobroDeCita {
  id: number
  patient_id: number
  status?: string
  doctor_id?: number
  scheduled_at: string
  notes?: string | null
  patient?: { first_name: string; last_name: string }
  doctor?: { full_name?: string; tratamiento?: string | null }
}

interface PacienteEncontrado {
  id: number
  first_name: string
  last_name: string
}

interface ServicioDelCatalogo {
  id: number
  name: string
  price: string
  is_active?: boolean
}

interface Props {
  visible: boolean
  onClose: () => void
  /**
   * Recibe el pago tal como lo devolvió el servidor: es lo único que se
   * anuncia. `express` dice que se pidió como consulta express; quien anuncia
   * sólo lo menciona si el pago trae su cita (el servidor la creó).
   */
  onRegistrado: (pago: Payment, detalle?: { express: boolean }) => void
  /** El médico cobra a su nombre: el servidor le fuerza el médico, no se le pregunta. */
  esDoctora: boolean
  doctoras: User[]
  /**
   * Cobrar una cita concreta desde la agenda (S-03): la lista se reduce a esa
   * cita y no se ofrece el cobro suelto. Todo lo demás (idempotencia, cita ya
   * cobrada, cobro adicional) es el mismo camino que desde Pagos.
   */
  citaFija?: number | null
}

type Pestana = 'cita' | 'suelto'
/** Qué se cobra en el cobro suelto; `null` mientras no se contesta. */
type QueSeCobra = 'express' | 'otro' | null

const FORMULARIO_VACIO = {
  serviceId: '',
  amount: '',
  method: 'cash',
  referencia: '',
  description: '',
  notes: '',
}

/** Lo que falta cobrar va arriba: en un día lleno, lo pendiente no puede quedar al fondo. */
const PRIORIDAD_DE_COBRO: Record<string, number> = { pendiente: 0, sin_cargo: 2, cobrada: 3 }

/**
 * Une las dos listas (en sala y atendidas) sin repetir una cita que cambió de
 * estado entre una lectura y otra, y las ordena: pendientes primero, luego por
 * hora.
 */
export const ordenarPorCobrar = <T extends { id: number; scheduled_at: string; estado_cobro?: string | null }>(
  citas: T[],
): T[] => {
  const unicas = [...new Map(citas.map((c) => [c.id, c])).values()]
  const prioridad = (c: T) => PRIORIDAD_DE_COBRO[c.estado_cobro ?? ''] ?? 1
  return unicas.sort(
    (a, b) => prioridad(a) - prioridad(b) || a.scheduled_at.localeCompare(b.scheduled_at),
  )
}

const nombreDe = (p?: { first_name: string; last_name: string }) =>
  p ? `${p.first_name} ${p.last_name}` : ''

/** La nota que el médico dejó al cerrar ("💬 cobrar sólo $500") llega en `notes`. */
const notaDeDoctora = (cita: CitaDeHoy): string =>
  cita.notes?.includes('💬') ? cita.notes.split('💬')[1]?.trim() || '' : ''

export const RegistrarPagoModal: React.FC<Props> = ({
  visible,
  onClose,
  onRegistrado,
  esDoctora,
  doctoras,
  citaFija = null,
}) => {
  const { createPayment, createConsultaExpress } = useFinanzas()
  const [pestana, setPestana] = useState<Pestana>('cita')
  const [queSeCobra, setQueSeCobra] = useState<QueSeCobra>(null)
  /** La express chocó con una consulta de hoy: se pregunta antes de registrarla. */
  const [otraConsultaPorConfirmar, setOtraConsultaPorConfirmar] = useState(false)
  const [citas, setCitas] = useState<CitaDeHoy[]>([])
  const [cargandoCitas, setCargandoCitas] = useState(false)
  const [errorCitas, setErrorCitas] = useState<string | null>(null)
  const [servicios, setServicios] = useState<ServicioDelCatalogo[]>([])
  // La lista vacía por un fallo se veía igual que un catálogo sin servicios
  // (plan 29, $-1): se dice, y se puede cobrar igual capturando el monto.
  const [errorServicios, setErrorServicios] = useState(false)
  const [citaId, setCitaId] = useState<number | null>(null)
  const [adicional, setAdicional] = useState(false)
  /** Cita cobrada (o sin cargo) cuyo cobro extra se está por confirmar. */
  const [porConfirmar, setPorConfirmar] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [pacientes, setPacientes] = useState<PacienteEncontrado[]>([])
  const [paciente, setPaciente] = useState<PacienteEncontrado | null>(null)
  const [doctorId, setDoctorId] = useState('')
  const [form, setForm] = useState(FORMULARIO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Errores junto al campo: se validan todos los faltantes en el submit y cada
  // aviso se pinta debajo del campo que lo causó, no en un bloque al pie.
  const [errores, setErrores] = useState<{
    cita?: string
    paciente?: string
    monto?: string
    queSeCobra?: string
    doctora?: string
    concepto?: string
  }>({})
  const limpiarError = (campo: keyof typeof errores) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
  // Con algo capturado (monto, concepto, paciente elegida), la X, Cancelar y
  // Esc preguntan antes de descartar (plan 29, lote 8).
  const cobroSucio =
    visible && (JSON.stringify(form) !== JSON.stringify(FORMULARIO_VACIO) || (paciente !== null && pestana !== 'cita'))
  const { propsModal, pedirCierre } = useCierreSeguro({ visible, sucio: cobroSucio, onClose })
  // Un id por intento, que se conserva si hay que reintentar tras un error de
  // red. Se descarta en cuanto cambia A QUIÉN se le cobra: reutilizarlo para
  // otra cita haría que el servidor devolviera el pago de la anterior.
  const idIntento = useRef<string | null>(null)

  const cargarCitas = async () => {
    setCargandoCitas(true)
    setErrorCitas(null)
    try {
      // Medianoche del consultorio sin zona, como scheduled_at (no la UTC).
      const hoy = inicioDelDiaEnConsultorio()
      // En sala Y atendidas: recepción muchas veces cobra antes de la consulta
      // (plan 23, cobro anticipado). Si la cita en sala no estuviera aquí, el
      // único camino era registrar "otra consulta" y la cita real quedaba
      // pendiente: cuando el médico la cerrara, se volvía a cobrar.
      // «En consulta» también: el servidor ya la acepta para cobro (plan 28).
      const [enSala, enConsulta, atendidas] = await Promise.all(
        (['en_sala', 'en_consulta', 'atendida'] as const).map((status) =>
          apiClient.get<CitaDeHoy[]>('/appointments', {
            params: { start_date: hoy, status, limit: 200 },
          }),
        ),
      )
      const ordenadas = ordenarPorCobrar([
        ...(enSala?.data ?? []),
        ...(enConsulta?.data ?? []),
        ...(atendidas?.data ?? []),
      ])
      setCitas(ordenadas)
      // Desde la agenda la cita ya está decidida: se elige sola, salvo que ya
      // esté cobrada o sin cargo, que se queda bloqueada como en Pagos.
      const fija = citaFija ? ordenadas.find((c) => c.id === citaFija) : undefined
      if (fija && fija.estado_cobro !== 'cobrada' && fija.estado_cobro !== 'sin_cargo') elegirCita(fija)
    } catch {
      // Sin la lista no se sabe qué citas ya se cobraron: se dice, no se calla.
      setErrorCitas(
        'No se pudieron cargar las citas de hoy, así que no se sabe cuáles ya se cobraron.',
      )
    } finally {
      setCargandoCitas(false)
    }
  }

  useEffect(() => {
    if (!visible) return
    setPestana('cita')
    setQueSeCobra(null)
    setOtraConsultaPorConfirmar(false)
    setCitaId(null)
    setAdicional(false)
    setPorConfirmar(null)
    setPaciente(null)
    setPacientes([])
    setBusqueda('')
    setDoctorId('')
    setForm(FORMULARIO_VACIO)
    setError(null)
    setErrores({})
    idIntento.current = null
    void cargarCitas()
    void cargarServicios()
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargarServicios = () =>
    apiClient
      .get<ServicioDelCatalogo[]>('/services')
      .then((res) => {
        if (!Array.isArray(res?.data)) throw new Error('Respuesta sin la lista de servicios.')
        setServicios(res.data.filter((s) => s.is_active !== false))
        setErrorServicios(false)
      })
      .catch(() => {
        setServicios([])
        setErrorServicios(true)
      })

  const cambiarDestino = () => {
    idIntento.current = null
    setError(null)
    // Cambió a quién o qué se cobra: los avisos del intento anterior ya no aplican.
    setErrores({})
    setOtraConsultaPorConfirmar(false)
  }

  const elegirQueSeCobra = (opcion: Exclude<QueSeCobra, null>) => {
    cambiarDestino()
    setQueSeCobra(opcion)
    // El concepto por omisión cambia con la respuesta, salvo que ya se haya
    // escrito otro: no se pisa lo que tecleó la secretaria.
    setForm((f) =>
      opcion === 'express' && !f.description.trim()
        ? { ...f, description: 'CONSULTA EXPRESS' }
        : opcion === 'otro' && f.description === 'CONSULTA EXPRESS'
          ? { ...f, description: '' }
          : f,
    )
  }

  const elegirCita = (cita: CitaDeHoy, esAdicional = false) => {
    cambiarDestino()
    setCitaId(cita.id)
    setAdicional(esAdicional)
    setPorConfirmar(null)
    setForm({
      ...FORMULARIO_VACIO,
      description: `CONSULTA — ${nombreDe(cita.patient)}`.trim(),
      notes: notaDeDoctora(cita),
    })
  }

  const buscarPacientes = async () => {
    const termino = busqueda.trim()
    if (!termino) return
    try {
      const { data } = await apiClient.get<PacienteEncontrado[]>('/patients', {
        params: { search: termino, limit: 20 },
      })
      setPacientes(Array.isArray(data) ? data : [])
    } catch {
      setPacientes([])
      setError('No se pudo buscar al paciente. Inténtalo de nuevo.')
    }
  }

  const citaElegida = citas.find((c) => c.id === citaId) ?? null
  const pacienteId = pestana === 'cita' ? citaElegida?.patient_id : paciente?.id

  const validar = (): typeof errores => {
    const faltas: typeof errores = {}
    if (!pacienteId) {
      if (pestana === 'cita') faltas.cita = 'Elige la cita que vas a cobrar.'
      else faltas.paciente = 'Busca y elige al paciente.'
    }
    const monto = Number(form.amount)
    if (!form.amount || !Number.isFinite(monto) || monto <= 0) faltas.monto = 'Escribe el monto (mayor a cero).'
    if (pestana === 'suelto') {
      if (!queSeCobra) faltas.queSeCobra = 'Contesta primero qué se cobra: consulta sin cita o otro concepto.'
      if (!esDoctora && !doctorId) faltas.doctora = 'Elige el médico a la que pertenece el ingreso.'
      if (queSeCobra === 'otro' && !form.serviceId && !form.description.trim())
        faltas.concepto = 'Elige un servicio o escribe el concepto.'
    }
    return faltas
  }

  const registrarExpress = async (confirmarOtra: boolean) => {
    const referencia = form.referencia.trim()
    setGuardando(true)
    setError(null)
    try {
      const pago = await createConsultaExpress({
        patient_id: paciente!.id,
        amount: Number(form.amount).toFixed(2),
        method: form.method as PaymentMethod,
        client_request_id: idIntento.current!,
        ...(esDoctora ? {} : { doctor_id: Number(doctorId) }),
        ...(form.serviceId ? { service_id: Number(form.serviceId) } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        ...(referencia && pideReferencia(form.method) ? { referencia } : {}),
        ...(confirmarOtra ? { confirmar_otra_consulta: true } : {}),
      })
      idIntento.current = null
      setOtraConsultaPorConfirmar(false)
      onRegistrado(pago, { express: true })
    } catch (err) {
      const e = err as ErrorDeCobro
      setError(e.message)
      // 409 con la consulta de hoy: no se creó nada. Se pregunta si de verdad
      // es otra consulta; el mismo intento sirve, porque nada quedó guardado.
      setOtraConsultaPorConfirmar(e.status === 409 && Boolean(e.citaExistente))
    } finally {
      setGuardando(false)
    }
  }

  const registrar = async () => {
    const faltas = validar()
    if (Object.keys(faltas).length > 0) {
      setErrores(faltas)
      return
    }
    setErrores({})
    if (!idIntento.current) idIntento.current = nuevoIdDeIntento()
    if (pestana === 'suelto' && queSeCobra === 'express') {
      await registrarExpress(false)
      return
    }
    const referencia = form.referencia.trim()
    const datos: PaymentCreate = {
      patient_id: pacienteId!,
      amount: Number(form.amount).toFixed(2),
      method: form.method as PaymentMethod,
      client_request_id: idIntento.current,
      ...(form.serviceId ? { service_id: Number(form.serviceId) } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      ...(referencia && pideReferencia(form.method) ? { referencia } : {}),
    }
    if (pestana === 'cita') {
      datos.appointment_id = citaId
      if (adicional) datos.cobro_adicional = true
    } else if (!esDoctora) {
      datos.doctor_id = Number(doctorId)
    }

    setGuardando(true)
    setError(null)
    try {
      const pago = await createPayment(datos)
      idIntento.current = null
      onRegistrado(pago)
    } catch (err) {
      const e = err as ErrorDeCobro
      setError(e.message)
      // 409: alguien la cobró mientras tanto. Lo que dijo el servidor pasa a
      // ser la verdad de la lista, y la cita se suelta para no reintentarla.
      if (e.status === 409 && e.cobroExistente && pestana === 'cita') {
        const existente = e.cobroExistente
        setCitas((actuales) =>
          actuales.map((c) =>
            c.id === citaId
              ? { ...c, estado_cobro: 'cobrada', cobro_resumen: [existente, ...(c.cobro_resumen ?? [])] }
              : c,
          ),
        )
        setCitaId(null)
        setAdicional(false)
        idIntento.current = null
      }
    } finally {
      setGuardando(false)
    }
  }

  const campo = (parcial: Partial<typeof FORMULARIO_VACIO>) => setForm((f) => ({ ...f, ...parcial }))

  const citasVisibles = citaFija ? citas.filter((c) => c.id === citaFija) : citas

  const listaDeCitas = (
    <div data-tour="pago-citas">
      <CFormLabel className="small fw-bold">
        {citaFija ? '🕐 Cita a cobrar' : '🕐 Citas de hoy en sala y atendidas'}
      </CFormLabel>
      {cargandoCitas && (
        <div className="py-2">
          <CSpinner size="sm" /> <span className="small">Cargando citas…</span>
        </div>
      )}
      {errorCitas && (
        <CAlert color="danger" className="py-2 small">
          {errorCitas}{' '}
          <CButton color="link" size="sm" className="p-0" onClick={() => void cargarCitas()}>
            Reintentar
          </CButton>
        </CAlert>
      )}
      {citaFija && !cargandoCitas && !errorCitas && citasVisibles.length === 0 && (
        <CAlert color="warning" className="py-2 small">
          Esta cita no está entre las de hoy en sala o atendidas, así que no se puede cobrar aquí. Puede que
          haya cambiado de estado: actualiza la agenda.
        </CAlert>
      )}
      {!citaFija && !cargandoCitas && !errorCitas && citas.length === 0 && (
        <p className="text-muted small">
          No hay citas en sala ni atendidas hoy. Para cobrar sin cita, usa “Cobro suelto”.
        </p>
      )}
      {/* Más alta que antes (240 px): en un día lleno cabían tres citas y lo
          pendiente se perdía bajo el scroll. Lo pendiente ya va primero. */}
      <div className="list-group small" style={{ maxHeight: 'min(55vh, 480px)', overflowY: 'auto' }}>
        {citasVisibles.map((cita) => {
          const estado = cita.estado_cobro ?? null
          const bloqueada = estado === 'cobrada' || estado === 'sin_cargo'
          const elegida = citaId === cita.id
          const cobros = cita.cobro_resumen ?? []
          return (
            <div key={cita.id} className={`list-group-item p-0 ${elegida ? 'active' : ''}`}>
              <button
                type="button"
                className={`btn w-100 text-start py-2 px-3 border-0 rounded-0 ${elegida ? 'text-white' : ''}`}
                // Sólo uno a la vez: `aria-pressed` anuncia cuál quedó elegida a
                // quien usa lector de pantalla, no sólo a quien distingue el azul.
                aria-pressed={elegida}
                disabled={bloqueada || guardando}
                onClick={() => elegirCita(cita)}
              >
                <strong>{nombreDe(cita.patient)}</strong>
                <span className={`ms-2 ${elegida ? '' : 'text-muted'}`}>
                  {formatearHoraDeCita(cita.scheduled_at, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {cita.doctor?.full_name && (
                  <span className={`ms-2 ${elegida ? '' : 'text-muted'}`}>· {nombreConTratamiento(cita.doctor)}</span>
                )}
                {estado && (
                  <CBadge color={ESTADO_COBRO[estado].color} className="ms-2">
                    {ESTADO_COBRO[estado].label}
                  </CBadge>
                )}
                {elegida && adicional && estado === 'cobrada' && (
                  <CBadge color="warning" textColor="dark" className="ms-2">Cobro adicional</CBadge>
                )}
                {cita.status === 'en_sala' && (
                  // Se cobra antes de la consulta: que se vea que todavía no
                  // la atienden, para no confundirla con una ya atendida.
                  <CBadge color="info" className="ms-2">En sala</CBadge>
                )}
                {cita.status === 'en_consulta' && (
                  <CBadge color="dark" className="ms-2">En consulta</CBadge>
                )}
                {notaDeDoctora(cita) && <span className="badge bg-warning text-dark ms-2">💬 Nota del médico</span>}
                {estado === 'cobrada' && (
                  <div className="small mt-1" data-tour="pago-cita-cobrada">
                    {cobros.length > 0 ? cobros.map((c) => <div key={c.id}>{describirCobro(c)}</div>) : 'Ya cobrada.'}
                  </div>
                )}
                {estado === 'sin_cargo' && (
                  <div className="small mt-1">
                    El médico la marcó sin cargo{cita.cobro_sin_cargo_motivo ? `: ${cita.cobro_sin_cargo_motivo}` : ''}.
                  </div>
                )}
              </button>
              {bloqueada && !elegida && (
                <div className="px-3 pb-2">
                  {porConfirmar === cita.id ? (
                    <div className="border rounded-2 p-2 bg-warning-subtle">
                      <div className="small mb-2">
                        {estado === 'cobrada'
                          ? '¿Registrar un cobro ADICIONAL a esta cita (servicio extra, estudio agregado)? No es para volver a cobrar la consulta.'
                          : 'El médico dijo que no tiene cargo. ¿Cobrarla de todos modos?'}
                      </div>
                      <CButton
                        color="warning"
                        size="sm"
                        className="me-2"
                        // También la sin cargo va como adicional: el servidor
                        // rechaza con 409 cobrar una cita exenta sin esa marca.
                        onClick={() => elegirCita(cita, true)}
                      >
                        Sí, {estado === 'cobrada' ? 'es un cobro adicional' : 'cobrarla'}
                      </CButton>
                      <CButton color="secondary" variant="outline" size="sm" onClick={() => setPorConfirmar(null)}>
                        No
                      </CButton>
                    </div>
                  ) : (
                    <CButton
                      color="link"
                      size="sm"
                      className="p-0"
                      data-tour="pago-cobro-adicional"
                      disabled={guardando}
                      onClick={() => setPorConfirmar(cita.id)}
                    >
                      {estado === 'cobrada' ? 'Cobro adicional…' : 'Cobrar de todos modos…'}
                    </CButton>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <ErrorDeCampo id="error-pago-cita" mensaje={errores.cita} />
    </div>
  )

  const cobroSuelto = (
    <div data-tour="pago-cobro-suelto">
      <fieldset
        className="mb-3"
        data-tour="pago-que-se-cobra"
        aria-describedby={errores.queSeCobra ? 'error-pago-que-se-cobra' : undefined}
      >
        <legend className="small fw-bold mb-1">
          ¿Qué se cobra? <span className="text-danger">*</span>
        </legend>
        <div className="d-flex flex-wrap gap-2">
          <CButton
            type="button"
            color="primary"
            variant={queSeCobra === 'express' ? undefined : 'outline'}
            aria-pressed={queSeCobra === 'express'}
            data-tour="pago-express"
            disabled={guardando}
            onClick={() => elegirQueSeCobra('express')}
          >
            Consulta sin cita (express)
          </CButton>
          <CButton
            type="button"
            color="primary"
            variant={queSeCobra === 'otro' ? undefined : 'outline'}
            aria-pressed={queSeCobra === 'otro'}
            disabled={guardando}
            onClick={() => elegirQueSeCobra('otro')}
          >
            Otro concepto
          </CButton>
        </div>
        {queSeCobra === 'express' && (
          <p className="small text-muted mt-2 mb-0">
            Una consulta rápida que no se agendó. Al registrar el pago queda también en la agenda, como
            atendida a esta hora y marcada «Express · registrada al cobrar».
          </p>
        )}
        {queSeCobra === 'otro' && (
          <p className="small text-muted mt-2 mb-0">
            Un producto, un estudio u otro concepto. No se crea ninguna cita: queda el pago con paciente,
            concepto, quién lo recibió y la hora.
          </p>
        )}
      </fieldset>
      <ErrorDeCampo id="error-pago-que-se-cobra" mensaje={errores.queSeCobra} />
      <CFormLabel htmlFor="suelto-busqueda" className="small">
        Paciente <span className="text-danger">*</span>
      </CFormLabel>
      {paciente ? (
        <div className="d-flex align-items-center gap-2 mb-2">
          <strong>{nombreDe(paciente)}</strong>
          <CButton
            color="link"
            size="sm"
            className="p-0"
            onClick={() => {
              cambiarDestino()
              setPaciente(null)
            }}
          >
            Cambiar
          </CButton>
        </div>
      ) : (
        <>
          <CInputGroup size="sm" className="mb-1">
            <CFormInput
              id="suelto-busqueda"
              placeholder="Nombre del paciente"
              value={busqueda}
              invalid={Boolean(errores.paciente)}
              aria-invalid={Boolean(errores.paciente) || undefined}
              aria-describedby={errores.paciente ? 'error-pago-paciente' : undefined}
              onChange={enMayusculas((v) => {
                setBusqueda(v)
                limpiarError('paciente')
              })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void buscarPacientes()
                }
              }}
            />
            <CButton color="primary" variant="outline" onClick={() => void buscarPacientes()}>
              Buscar
            </CButton>
          </CInputGroup>
          <div className="list-group small mb-2" style={{ maxHeight: '140px', overflowY: 'auto' }}>
            {pacientes.map((p) => (
              <button
                key={p.id}
                type="button"
                className="list-group-item list-group-item-action py-1"
                onClick={() => {
                  cambiarDestino()
                  setPaciente(p)
                }}
              >
                {nombreDe(p)}
              </button>
            ))}
          </div>
        </>
      )}
      <ErrorDeCampo id="error-pago-paciente" mensaje={errores.paciente} />
      {!esDoctora && (
        <>
          <CFormLabel htmlFor="suelto-doctora" className="small">
            Médico a la que pertenece el ingreso <span className="text-danger">*</span>
          </CFormLabel>
          <CFormSelect
            id="suelto-doctora"
            size="sm"
            value={doctorId}
            invalid={Boolean(errores.doctora)}
            aria-invalid={Boolean(errores.doctora) || undefined}
            aria-describedby={errores.doctora ? 'error-pago-doctora' : undefined}
            onChange={(e) => {
              setDoctorId(e.target.value)
              limpiarError('doctora')
            }}
          >
            <option value="">— Elige el médico —</option>
            {doctoras.map((d) => (
              <option key={d.id} value={d.id}>
                {nombreConTratamiento(d)}
              </option>
            ))}
          </CFormSelect>
          <ErrorDeCampo id="error-pago-doctora" mensaje={errores.doctora} />
        </>
      )}
    </div>
  )

  return (
    <CModal visible={visible} onClose={onClose} size="lg" {...propsModal} backdrop="static">
      <CModalHeader closeButton={false}>
        <CModalTitle>
          <CIcon icon={cilDollar} className="me-2" />
          Registrar pago
        </CModalTitle>
        {/* Con el modal abierto el "?" del encabezado queda tapado. */}
        <BotonAyudaContextual recorridoId="pago-registrar" />
        <CCloseButton className="ms-auto" onClick={pedirCierre} aria-label="Cerrar" />
      </CModalHeader>
      <CModalBody data-tour="pago-modal">
        {!citaFija && (
        <CNav variant="tabs" className="mb-3">
          <CNavItem>
            <CNavLink
              active={pestana === 'cita'}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                cambiarDestino()
                setPestana('cita')
              }}
            >
              Cobro de cita
            </CNavLink>
          </CNavItem>
          <CNavItem>
            <CNavLink
              active={pestana === 'suelto'}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                cambiarDestino()
                setPestana('suelto')
              }}
            >
              Cobro suelto (sin cita)
            </CNavLink>
          </CNavItem>
        </CNav>
        )}

        {pestana === 'cita' ? listaDeCitas : cobroSuelto}

        <CRow className="g-2 mt-2">
          <CCol md={12}>
            <CFormLabel htmlFor="pago-servicio" className="small">
              Servicio
            </CFormLabel>
            <CFormSelect
              id="pago-servicio"
              value={form.serviceId}
              invalid={Boolean(errores.concepto)}
              aria-invalid={Boolean(errores.concepto) || undefined}
              aria-describedby={errores.concepto ? 'error-pago-concepto' : undefined}
              onChange={(e) => {
                const servicio = servicios.find((s) => String(s.id) === e.target.value)
                // Precio del catálogo precargado, pero editable: descuentos y
                // precios especiales son de todos los días.
                campo({
                  serviceId: e.target.value,
                  amount: servicio ? Number(servicio.price).toFixed(2) : form.amount,
                })
                limpiarError('concepto')
                if (servicio) limpiarError('monto')
              }}
            >
              <option value="">— Sin servicio del catálogo —</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatoMoneda(s.price)})
                </option>
              ))}
            </CFormSelect>
            {errorServicios && (
              <div className="small text-danger mt-1" role="alert">
                No se pudo cargar el catálogo de servicios. Puedes cobrar escribiendo el monto, o{' '}
                <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => void cargarServicios()}>
                  reintentar
                </button>
                .
              </div>
            )}
          </CCol>
          <CCol md={6}>
            <CFormLabel htmlFor="pago-monto" className="small">
              Monto <span className="text-danger">*</span>
            </CFormLabel>
            <CInputGroup>
              <CInputGroupText>$</CInputGroupText>
              <CFormInput
                id="pago-monto"
                type="number"
                inputMode="decimal"
                enterKeyHint="next"
                min="0"
                step="0.01"
                placeholder="500.00"
                value={form.amount}
                invalid={Boolean(errores.monto)}
                aria-invalid={Boolean(errores.monto) || undefined}
                aria-describedby={errores.monto ? 'error-pago-monto' : undefined}
                onChange={(e) => {
                  campo({ amount: e.target.value })
                  limpiarError('monto')
                }}
              />
            </CInputGroup>
            <ErrorDeCampo id="error-pago-monto" mensaje={errores.monto} />
          </CCol>
          <CCol md={6}>
            <CFormLabel htmlFor="pago-metodo" className="small">
              Método de pago
            </CFormLabel>
            <CFormSelect id="pago-metodo" value={form.method} onChange={(e) => campo({ method: e.target.value })}>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="other">Otro</option>
            </CFormSelect>
          </CCol>
          {pideReferencia(form.method) && (
            <CCol md={12}>
              <CFormLabel htmlFor="pago-referencia" className="small">
                Referencia (folio o últimos dígitos del voucher)
              </CFormLabel>
              <CFormInput
                id="pago-referencia"
                maxLength={60}
                value={form.referencia}
                onChange={enMayusculas((v) => campo({ referencia: v }))}
              />
            </CCol>
          )}
          <CCol md={6}>
            <CFormLabel htmlFor="pago-concepto" className="small">
              Concepto
            </CFormLabel>
            <CFormInput
              id="pago-concepto"
              placeholder="Ej. CONSULTA GINECOLÓGICA"
              value={form.description}
              invalid={Boolean(errores.concepto)}
              aria-invalid={Boolean(errores.concepto) || undefined}
              aria-describedby={errores.concepto ? 'error-pago-concepto' : undefined}
              onChange={enMayusculas((v) => {
                campo({ description: v })
                limpiarError('concepto')
              })}
            />
            <ErrorDeCampo id="error-pago-concepto" mensaje={errores.concepto} />
          </CCol>
          <CCol md={6}>
            <CFormLabel htmlFor="pago-notas" className="small">
              Notas adicionales
            </CFormLabel>
            <CFormInput
              id="pago-notas"
              placeholder="Nota del médico o descuento..."
              value={form.notes}
              onChange={enMayusculas((v) => campo({ notes: v }))}
            />
          </CCol>
        </CRow>

        {error && (
          <CAlert color="danger" className="py-2 mt-3 mb-0" role="alert">
            {error}
            {otraConsultaPorConfirmar && (
              <div className="mt-2">
                <CButton
                  color="warning"
                  size="sm"
                  className="me-2"
                  disabled={guardando}
                  onClick={() => void registrarExpress(true)}
                >
                  Sí, fue otra consulta: registrarla
                </CButton>
                <CButton
                  color="secondary"
                  variant="outline"
                  size="sm"
                  disabled={guardando}
                  onClick={() => {
                    setOtraConsultaPorConfirmar(false)
                    setError(null)
                  }}
                >
                  No
                </CButton>
              </div>
            )}
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" onClick={pedirCierre} disabled={guardando}>
          Cancelar
        </CButton>
        <CButton color="success" onClick={() => void registrar()} disabled={guardando}>
          {guardando
            ? 'Registrando...'
            : adicional
              ? // También la sin cargo que se cobra de todos modos: es un cobro
                // aparte de lo que decidió el médico, y el botón lo dice.
                'Registrar cobro adicional'
              : pestana === 'suelto' && queSeCobra === 'express'
                ? 'Registrar consulta y pago'
                : 'Registrar pago'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default RegistrarPagoModal
