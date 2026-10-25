/**
 * La sección «Escalas neurológicas» de la consulta.
 *
 * Elegir una escala, responder sus ítems viendo el puntaje sugerido, guardar,
 * y ver cómo salió las veces anteriores. Reglas:
 *
 * - **Sugerir, no decidir.** El puntaje que se ve mientras se llena es una
 *   sugerencia; el que se guarda lo calcula el servidor, y es el que se
 *   anuncia al guardar. Si no coinciden, se dice.
 * - **Si el sistema no lo hizo, no se dice que sí.** «Guardada» solo aparece
 *   con la respuesta del servidor. Si falla, lo capturado se queda en pantalla.
 * - Cada escala conserva su borrador mientras se cambia a otra.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CAlert, CButton, CFormLabel, CFormSelect, CFormTextarea, CSpinner } from '@coreui/react-pro'
import { useAuth } from '../../../shared/context/AuthContext'
import { Role } from '../../../shared/types'
import { mensajeDeError } from '../../../shared/utils/errors'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { GRUPOS, escalaPorId } from '../dominio/catalogo'
import { calcular, formatearPuntaje } from '../dominio/motor'
import type { Respuestas } from '../dominio/tipos'
import { escalasApi, type EscalaAplicada } from '../servicios/escalasApi'
import FormularioEscala from './FormularioEscala'
import HistorialEscala from './HistorialEscala'
import ResultadoSugerido from './ResultadoSugerido'
import '../ui/escalas.css'

export interface ResumenEscalas {
  /** Vigentes aplicadas en esta consulta. */
  enConsulta: number
  /** Vigentes en el expediente. */
  total: number
}

interface Props {
  patientId: number
  appointmentId?: number
  readOnly?: boolean
  onSummaryChange?: (resumen: ResumenEscalas) => void
}

export default function EscalasEnConsulta({ patientId, appointmentId, readOnly, onSummaryChange }: Props) {
  const { can, user } = useAuth()
  const puedeAplicar = can('clinical_scales.write') && !readOnly
  const [registros, setRegistros] = useState<EscalaAplicada[] | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [elegida, setElegida] = useState('')
  const [borradores, setBorradores] = useState<Record<string, Respuestas>>({})
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setErrorLectura(null)
    try {
      setRegistros(await escalasApi.listar(patientId))
    } catch (err) {
      setErrorLectura(mensajeDeError(err, 'No se pudieron cargar las escalas del paciente.'))
    }
  }, [patientId])
  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!registros || !onSummaryChange) return
    const vigentes = registros.filter((r) => !r.anulado_at)
    onSummaryChange({
      enConsulta: appointmentId ? vigentes.filter((r) => r.appointment_id === appointmentId).length : 0,
      total: vigentes.length,
    })
  }, [registros, appointmentId, onSummaryChange])

  const escala = elegida ? escalaPorId(elegida) : undefined
  const respuestas = useMemo(() => (elegida ? borradores[elegida] ?? {} : {}), [borradores, elegida])
  const resultado = useMemo(() => (escala ? calcular(escala, respuestas) : null), [escala, respuestas])
  const historial = useMemo(
    () => (registros ?? []).filter((r) => r.escala === elegida),
    [registros, elegida],
  )

  const cambiar = (itemId: string, codigo: string | undefined) => {
    setConfirmacion(null)
    setErrorGuardar(null)
    setBorradores((b) => ({ ...b, [elegida]: { ...(b[elegida] ?? {}), [itemId]: codigo } }))
  }

  const guardar = async () => {
    if (!escala || !resultado?.completo) return
    setGuardando(true)
    setErrorGuardar(null)
    setConfirmacion(null)
    try {
      const guardada = await escalasApi.aplicar(patientId, {
        escala: escala.id,
        version_escala: escala.version,
        respuestas,
        appointment_id: appointmentId,
        notas: notas[escala.id]?.trim() || undefined,
      })
      const delServidor = formatearPuntaje(escala, guardada.puntaje)
      const sugerido = formatearPuntaje(escala, resultado.puntaje)
      setConfirmacion(
        `${escala.nombre} guardada: ${delServidor}${guardada.interpretacion ? ` · ${guardada.interpretacion}` : ''}.` +
          (delServidor !== sugerido ? ` El servidor calculó ${delServidor}; la sugerencia de la pantalla era ${sugerido}.` : ''),
      )
      setRegistros((actuales) => [guardada, ...(actuales ?? [])])
      setBorradores((b) => ({ ...b, [escala.id]: {} }))
      setNotas((n) => ({ ...n, [escala.id]: '' }))
    } catch (err) {
      setErrorGuardar(
        mensajeDeError(err, 'No se pudo guardar la escala. Tus respuestas siguen aquí; vuelve a intentarlo.'),
      )
    } finally {
      setGuardando(false)
    }
  }

  const anular = async (registro: EscalaAplicada, motivo: string) => {
    const anulada = await escalasApi.anular(patientId, registro.id, motivo)
    setRegistros((actuales) => (actuales ?? []).map((r) => (r.id === anulada.id ? anulada : r)))
  }

  return (
    <div className="d-flex flex-column gap-3">
      {errorLectura && (
        <CAlert color="danger" className="py-2 mb-0 d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <span>
            <strong>No se pudo cargar el historial de escalas.</strong> {errorLectura}
          </span>
          <CButton size="sm" color="danger" variant="outline" onClick={() => void cargar()}>
            Reintentar
          </CButton>
        </CAlert>
      )}

      <div data-tour="escalas-selector">
        <CFormLabel htmlFor="escala-elegida" className="fw-semibold">
          ¿Qué escala vas a aplicar?
        </CFormLabel>
        <CFormSelect
          id="escala-elegida"
          className="gems-campo"
          value={elegida}
          onChange={(e) => {
            setElegida(e.target.value)
            setConfirmacion(null)
            setErrorGuardar(null)
          }}
        >
          <option value="">Elige una escala…</option>
          {GRUPOS.map((g) => (
            <optgroup key={g.nombre} label={g.nombre}>
              {g.escalas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {e.descripcion}
                </option>
              ))}
            </optgroup>
          ))}
        </CFormSelect>
      </div>

      {confirmacion && (
        <CAlert color="success" className="py-2 mb-0" role="status">
          {confirmacion}
        </CAlert>
      )}

      {escala && resultado && (
        <>
          <h6 className="mb-0">{escala.titulo}</h6>
          {puedeAplicar ? (
            <div className="row g-3">
              <div className="col-lg-8">
                <FormularioEscala
                  escala={escala}
                  respuestas={respuestas}
                  onCambiar={cambiar}
                  deshabilitado={guardando}
                />
                <CFormLabel htmlFor={`escala-notas-${escala.id}`} className="small fw-semibold">
                  Notas (opcional)
                </CFormLabel>
                <CFormTextarea
                  id={`escala-notas-${escala.id}`}
                  className="gems-campo"
                  rows={2}
                  maxLength={2000}
                  value={notas[escala.id] ?? ''}
                  onChange={enMayusculas((valor) => setNotas((n) => ({ ...n, [escala.id]: valor })))}
                  disabled={guardando}
                />
              </div>
              <div className="col-lg-4">
                <div className="sticky-lg-top d-flex flex-column gap-2" style={{ top: '1rem' }}>
                  <ResultadoSugerido escala={escala} resultado={resultado} />
                  {errorGuardar && (
                    <CAlert color="danger" className="py-2 mb-0">
                      {errorGuardar}
                    </CAlert>
                  )}
                  <CButton
                    color="primary"
                    disabled={!resultado.completo || guardando}
                    onClick={() => void guardar()}
                    data-tour="escalas-guardar"
                  >
                    {guardando && <CSpinner size="sm" className="me-2" />}
                    Guardar escala
                  </CButton>
                </div>
              </div>
            </div>
          ) : (
            <p className="small text-body-secondary mb-0">
              {readOnly
                ? 'La consulta está cerrada: aquí solo se consulta el historial.'
                : 'Tu cuenta puede ver las escalas, pero no aplicarlas.'}
            </p>
          )}

          <div data-tour="escalas-historial">
            <h6 className="small fw-semibold text-uppercase text-body-secondary mb-2">
              Historial de {escala.nombre}
            </h6>
            {registros === null && !errorLectura ? (
              <CSpinner size="sm" />
            ) : (
              <HistorialEscala
                escala={escala}
                registros={historial}
                onAnular={puedeAplicar ? anular : undefined}
                usuarioId={user?.role === Role.DOCTOR ? user.id : undefined}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
