/**
 * Panel para registrar, revisar o comunicar un resultado (plan 26, §3.4).
 *
 * Antes el formulario aparecía hasta abajo de la bandeja, después de la
 * paginación, sin la indicación ni el archivo a la vista (B-3). Aquí se abre
 * junto a la fila que se pulsó: el archivo a la izquierda, en el visor, con la
 * indicación clínica y la preparación; el formulario a la derecha. En pantallas
 * chicas es un modal a pantalla completa.
 *
 * Valoración (D-9): cada resultado lleva la suya, opcional (Excelente…Crítico).
 * Antes había una sola casilla «crítico» que se encendía si cualquier resultado
 * de la orden lo era, y al guardar solo tocaba el más nuevo: un crítico viejo
 * no se podía desmarcar (M6).
 *
 * Incidencia crítica (D-8): se cierra al documentar que se le comunicó o
 * entregó al paciente (con el medio), o al revisarla **dentro de una consulta**
 * del paciente (`appointmentId`). Revisarla desde la bandeja no la cierra, y
 * el aviso lo dice con lo que contestó el servidor.
 *
 * Regla de oro (plan 22): el panel solo se cierra y la fila solo cambia cuando
 * el servidor confirma. Si falla, el formulario se queda con lo escrito y el
 * motivo del servidor a la vista.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CAlert,
  CButton,
  CCol,
  CFormCheck,
  CFormLabel,
  CFormSelect,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalHeader,
  CModalTitle,
  COffcanvas,
  COffcanvasBody,
  COffcanvasHeader,
  COffcanvasTitle,
  CCloseButton,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import { formatearFechaISO, formatearInstante } from '../../../shared/utils/date'
import VisorDocumentos from '../../../shared/components/VisorDocumentos'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import AnularResultado from './AnularResultado'
import { LeyendasDeResultado } from './RastroDeEstudio'
import { archivosDeResultados } from '../utils/archivosDeResultados'
import { estadoVisibleDe, etiquetaPrioridad, etiquetaTipoEstudio } from '../utils/etiquetasOrden'
import { CANALES, VALORACIONES, etiquetaCanal, type CanalComunicacion } from '../utils/valoracion'
import type { DiagnosticResult, OrdenEnBandeja } from '../types/clinicalTracking'

export type ModoPanel = 'registrar' | 'revisar' | 'comunicar'

interface Props {
  orden: OrdenEnBandeja
  pacienteNombre: string
  modo: ModoPanel
  onClose: () => void
  /** La orden como quedó después de lo que el servidor confirmó. */
  onGuardado: (orden: OrdenEnBandeja, mensaje: string) => void
  /** Abre «Anexar resultado» para esta orden. */
  onAnexar?: () => void
  /**
   * La consulta abierta del paciente, cuando se revisa desde ella. Revisar
   * dentro de una consulta cierra la incidencia crítica (D-8).
   */
  appointmentId?: number
}

type Accion = 'received' | 'reviewed' | 'communicated'

const TITULOS: Record<ModoPanel, string> = {
  registrar: 'Registrar resultado',
  revisar: 'Revisar resultado',
  comunicar: 'Documentar comunicación',
}

/** Pantalla ancha: panel lateral; si no, modal a pantalla completa. */
const esPantallaAncha = () =>
  typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 992px)').matches

/** ¿La orden tiene una incidencia crítica abierta? Lo que diga el servidor manda. */
export const incidenciaAbierta = (orden: {
  incidencia_abierta?: boolean
  critico_sin_comunicar?: boolean
}) => Boolean(orden.incidencia_abierta ?? orden.critico_sin_comunicar)

/**
 * Cómo queda la orden después de guardar, para que la fila cambie en su lugar
 * sin recargar la página (y sin saltar a otra). El estado de la orden y si la
 * incidencia sigue abierta son lo que devuelve el servidor; solo si un servidor
 * viejo no lo manda se deduce. Al revisar, el servidor da por revisados también
 * los demás archivos que seguían «recibidos»; aquí se refleja igual.
 */
export const ordenTrasGuardar = (
  orden: OrdenEnBandeja,
  resultado: DiagnosticResult,
  accion: Accion,
  otrosActualizados: DiagnosticResult[] = [],
  /**
   * Esta acción cierra la incidencia de toda la orden: documentar la
   * comunicación o revisar dentro de una consulta (D-8). El servidor cierra la
   * de todos los resultados, aunque aquí solo vuelva el que se guardó.
   */
  cierraLaOrden = accion === 'communicated',
): OrdenEnBandeja => {
  const porId = new Map(otrosActualizados.map((r) => [r.id, r]))
  const otros = orden.results
    .filter((r) => r.id !== resultado.id)
    .map((r) => porId.get(r.id) ?? r)
    .map((r) =>
      accion !== 'received' && r.review_status === 'received'
        ? { ...r, review_status: 'reviewed' }
        : r,
    )
  const resultados = [
    resultado,
    ...(cierraLaOrden && resultado.incidencia_abierta === false
      ? otros.map((r) => ({ ...r, incidencia_abierta: false }))
      : otros),
  ]
  const comunicada =
    orden.comunicada || accion === 'communicated' || Boolean(resultado.communicated_at)
  const status = resultado.order_status || (accion === 'received' ? 'result_received' : 'reviewed')
  // La incidencia es de la orden: sigue abierta si CUALQUIERA de sus resultados
  // la tiene abierta, no solo el que se acaba de guardar (N2). Si el servidor no
  // manda el dato (versión vieja), se deduce del crítico sin comunicar.
  const conDato = resultados.some((r) => r.incidencia_abierta !== undefined)
  const abierta = conDato
    ? resultados.some((r) => r.incidencia_abierta === true)
    : !comunicada && resultados.some((r) => r.valoracion === 'critico' || r.is_critical)
  return {
    ...orden,
    results: resultados,
    status,
    estado_visible: estadoVisibleDe({ status }),
    comunicada,
    critico_sin_comunicar: abierta,
    incidencia_abierta: abierta,
    // Ya no se cancela ni rechaza una orden con resultado revisado.
    acciones_de_estado: status === 'result_received' ? orden.acciones_de_estado : [],
  }
}

/** Lo que dice el aviso después de guardar, según lo que contestó el servidor. */
const mensajeTrasGuardar = (
  estudio: string,
  accion: Accion,
  orden: OrdenEnBandeja,
  resultado: DiagnosticResult,
): string => {
  const base: Record<Accion, string> = {
    received: `Se registró el resultado de ${estudio}.`,
    reviewed: `${estudio}: marcada como revisada.`,
    communicated: `${estudio}: se documentó la comunicación al paciente.`,
  }
  if (incidenciaAbierta(orden) && resultado.cierre_en_consulta === 'cita_de_otro_dia') {
    return `${base[accion]} La incidencia crítica sigue abierta: esta consulta no es de hoy. Se cierra al documentar que se le comunicó o entregó al paciente, o al revisarlo en una consulta de hoy.`
  }
  if (incidenciaAbierta(orden)) {
    return `${base[accion]} La incidencia crítica sigue abierta: se cierra al documentar que se le comunicó o entregó al paciente, o al revisarlo dentro de una consulta suya de hoy.`
  }
  if (
    resultado.cierre_en_consulta === 'aplicada' ||
    resultado.incidencia_cerrada_por === 'consulta'
  ) {
    return `${base[accion]} La incidencia crítica quedó cerrada porque lo revisaste en la consulta.`
  }
  if (resultado.incidencia_cerrada_por === 'comunicacion') {
    return `${base[accion]} La incidencia crítica quedó cerrada.`
  }
  return base[accion]
}

const PanelResultado = ({
  orden: ordenRecibida,
  pacienteNombre,
  modo,
  onClose,
  onGuardado,
  onAnexar,
  appointmentId,
}: Props) => {
  // Los anulados (plan 29, lote 9) solo le llegan a la administración y no
  // se revisan: el panel trabaja con los vigentes.
  const orden = useMemo(
    () => ({ ...ordenRecibida, results: ordenRecibida.results.filter((r) => !r.anulado_at) }),
    [ordenRecibida],
  )
  const ultimo = orden.results[0] ?? null
  const [resumen, setResumen] = useState('')
  const [interpretacion, setInterpretacion] = useState(ultimo?.clinician_interpretation ?? '')
  const [siguiente, setSiguiente] = useState(ultimo?.next_action ?? '')
  const [comunicacion, setComunicacion] = useState('')
  const [canal, setCanal] = useState<CanalComunicacion | ''>('')
  // La valoración de cada resultado; '' = sin valorar. Para uno nuevo, la clave es 0.
  const inicial = useMemo(
    () =>
      Object.fromEntries(
        orden.results.map((r) => [r.id, r.valoracion ?? (r.is_critical ? 'critico' : '')]),
      ),
    [orden.results],
  )
  const [valoraciones, setValoraciones] = useState<Record<number, string>>(inicial)
  const [valoracionNueva, setValoracionNueva] = useState('')
  const [guardando, setGuardando] = useState<Accion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ancha] = useState(esPantallaAncha)
  const primerCampo = useRef<HTMLTextAreaElement | null>(null)
  const campoComunicacion = useRef<HTMLTextAreaElement | null>(null)

  const archivos = useMemo(() => archivosDeResultados(orden.results), [orden.results])
  const enConsulta = appointmentId !== undefined

  // El foco entra al panel, al campo que toca llenar.
  useEffect(() => {
    const t = window.setTimeout(() => {
      ;(modo === 'comunicar' ? campoComunicacion.current : primerCampo.current)?.focus()
    }, 50)
    return () => window.clearTimeout(t)
  }, [modo])

  const guardar = async (accion: Accion) => {
    setError(null)
    if (!ultimo && !resumen.trim() && !interpretacion.trim()) {
      setError('Escribe el resumen o la interpretación del resultado.')
      primerCampo.current?.focus()
      return
    }
    if (accion === 'communicated' && (!canal || !comunicacion.trim())) {
      setError('Elige el medio y escribe cuándo y a quién se le comunicó o entregó.')
      campoComunicacion.current?.focus()
      return
    }
    setGuardando(accion)
    // Primero las valoraciones de los resultados anteriores que cambiaron (M6):
    // solo la valoración, sin tocar su revisión. Si alguna falla, no se sigue:
    // el aviso dice exactamente qué se guardó y qué no (plan 22).
    const otrosActualizados: DiagnosticResult[] = []
    const fallidas: string[] = []
    const etiquetaDe = (r: DiagnosticResult) =>
      r.document_file_name ||
      (r.resulted_on ? `reporte del ${formatearFechaISO(r.resulted_on)}` : `resultado n.º ${r.id}`)
    for (const r of orden.results.slice(1)) {
      const nueva = valoraciones[r.id] ?? ''
      if (nueva === (inicial[r.id] ?? '')) continue
      try {
        const { data } = await apiClient.patch<DiagnosticResult>(
          `/clinical-tracking/results/${r.id}`,
          {
            valoracion: nueva || null,
          },
        )
        otrosActualizados.push(data)
      } catch (err) {
        fallidas.push(`${etiquetaDe(r)} (${mensajeDeError(err, 'no se pudo guardar')})`)
      }
    }
    const guardadas = otrosActualizados
      .map((d) => orden.results.find((r) => r.id === d.id))
      .filter((r): r is DiagnosticResult => Boolean(r))
      .map(etiquetaDe)
    if (fallidas.length > 0) {
      setError(
        `No se guardó la valoración de: ${fallidas.join('; ')}. ` +
          (guardadas.length ? `Sí se guardó la de: ${guardadas.join(', ')}. ` : '') +
          'La revisión de este resultado no se guardó: vuelve a intentarlo.',
      )
      setGuardando(null)
      return
    }
    try {
      const valoracionPrincipal = ultimo ? (valoraciones[ultimo.id] ?? '') : valoracionNueva
      // La cita solo va al revisar o comunicar: con «recibido» el servidor
      // responde 422 y la nota rápida de la consulta no se guardaba (N1).
      const conCita = enConsulta && accion !== 'received'
      const comunes = {
        review_status: accion,
        clinician_interpretation: interpretacion.trim() || null,
        next_action: siguiente.trim() || null,
        communication_note: comunicacion.trim() || null,
        ...(accion === 'communicated' ? { communication_channel: canal } : {}),
        valoracion: valoracionPrincipal || null,
        ...(conCita ? { appointment_id: appointmentId } : {}),
      }
      const respuesta = ultimo
        ? await apiClient.patch<DiagnosticResult>(
            `/clinical-tracking/results/${ultimo.id}`,
            comunes,
          )
        : await apiClient.post<DiagnosticResult>(`/clinical-tracking/orders/${orden.id}/results`, {
            ...comunes,
            report_text: resumen.trim() || null,
          })
      const actualizada = ordenTrasGuardar(
        orden,
        respuesta.data,
        accion,
        otrosActualizados,
        accion === 'communicated' || conCita,
      )
      onGuardado(
        actualizada,
        mensajeTrasGuardar(orden.study_name, accion, actualizada, respuesta.data),
      )
    } catch (err) {
      const motivo = mensajeDeError(err, 'No se pudo guardar el resultado.')
      setError(
        guardadas.length
          ? `Sí se guardó la valoración de: ${guardadas.join(', ')}. No se guardó la revisión de este resultado: ${motivo}`
          : motivo,
      )
    } finally {
      setGuardando(null)
    }
  }

  const selectorValoracion = (
    id: string,
    valor: string,
    alCambiar: (v: string) => void,
    etiqueta: string,
  ) => (
    <div>
      <CFormLabel htmlFor={id} className="small mb-1">
        {etiqueta}
      </CFormLabel>
      <CFormSelect id={id} size="sm" value={valor} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">Sin valorar</option>
        {VALORACIONES.map((v) => (
          <option key={v.valor} value={v.valor}>
            {v.etiqueta}
          </option>
        ))}
      </CFormSelect>
    </div>
  )

  const titulo = `${TITULOS[modo]}: ${orden.study_name}`
  const abierta = incidenciaAbierta(orden)

  const contenido = (
    <CRow className="g-3" data-tour="resultado-panel">
      <CCol lg={7}>
        {archivos.length > 0 ? (
          <VisorDocumentos
            enLinea
            alto={ancha ? '55vh' : '45vh'}
            titulo={orden.study_name}
            archivos={archivos}
          />
        ) : (
          <div className="border rounded p-4 text-center text-body-secondary">
            Sin archivo: el resultado se puede registrar solo con su nota o interpretación.
          </div>
        )}
        {onAnexar && (
          <CButton
            className="mt-2"
            size="sm"
            color="secondary"
            variant="outline"
            onClick={onAnexar}
            data-tour="resultado-anexar"
          >
            {archivos.length > 0 ? 'Anexar otro archivo' : 'Anexar archivo del resultado'}
          </CButton>
        )}
        <dl className="small mt-3 mb-0">
          <dt>Indicación clínica</dt>
          <dd>{orden.clinical_indication || '—'}</dd>
          {orden.preparation_instructions && (
            <>
              <dt>Preparación</dt>
              <dd>{orden.preparation_instructions}</dd>
            </>
          )}
          <dt>Orden</dt>
          <dd>
            n.º {orden.id} · {etiquetaTipoEstudio(orden.category)} ·{' '}
            {etiquetaPrioridad(orden.priority)} · solicitada {formatearFechaISO(orden.requested_on)}
          </dd>
        </dl>
      </CCol>
      <CCol lg={5}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void guardar(modo === 'comunicar' ? 'communicated' : ultimo ? 'reviewed' : 'received')
          }}
        >
          {error && (
            <CAlert color="danger" role="alert">
              {error}
            </CAlert>
          )}
          <CAlert
            color={abierta ? 'danger' : 'light'}
            className="small py-2"
            data-tour="resultado-incidencia"
          >
            {abierta ? <strong>Incidencia crítica abierta. </strong> : null}
            {enConsulta
              ? // No se promete el cierre: depende de que la consulta sea de hoy, y eso
                // lo decide el servidor; el aviso al guardar dice lo que contestó (R1).
                'Lo estás revisando dentro de la consulta. Si es una consulta de hoy, marcarlo revisado cierra la incidencia crítica; al guardar te decimos si quedó cerrada.'
              : 'Desde la bandeja, marcarlo revisado no cierra una incidencia crítica: se cierra al documentar que se le comunicó o entregó al paciente, o al revisarlo dentro de una consulta suya.'}
          </CAlert>
          {ultimo ? (
            <div className="small mb-3">
              <div className="fw-semibold mb-1">
                {orden.results.length === 1 ? 'Resultado registrado' : 'Resultados de esta orden'}
              </div>
              {orden.results.map((r, i) => (
                <div key={r.id} className="border rounded p-2 mb-2 bg-body-tertiary">
                  <div>{r.report_text || r.document_file_name || 'Sin resumen escrito.'}</div>
                  <div className="text-body-secondary">
                    {r.resulted_on
                      ? `Reporte del ${formatearFechaISO(r.resulted_on)}`
                      : `Recibido el ${formatearInstante(r.created_at, { dateStyle: 'medium' })}`}
                    {r.reporting_provider ? ` · ${r.reporting_provider}` : ''}
                    {i === 0 && orden.results.length > 1 ? ' · el más reciente' : ''}
                  </div>
                  {r.communicated_at && (
                    <div className="text-success">
                      Comunicado ({etiquetaCanal(r.communication_channel) || 'sin medio'}):{' '}
                      {r.communication_note}
                    </div>
                  )}
                  <LeyendasDeResultado resultado={r} />
                  <div className="mt-1" style={{ maxWidth: 220 }}>
                    {selectorValoracion(
                      `valoracion-${r.id}`,
                      valoraciones[r.id] ?? '',
                      (v) => setValoraciones((prev) => ({ ...prev, [r.id]: v })),
                      'Valoración (opcional)',
                    )}
                  </div>
                  <AnularResultado
                    orden={orden}
                    resultado={r}
                    deshabilitado={guardando !== null}
                    onAnulado={onGuardado}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
              <CFormTextarea
                ref={primerCampo}
                className="mb-3"
                rows={3}
                id="panel-resumen"
                label="Resumen del resultado (o nota rápida)"
                value={resumen}
                onChange={(e) => setResumen(e.target.value)}
              />
              <div className="mb-3" style={{ maxWidth: 260 }}>
                {selectorValoracion(
                  'valoracion-nueva',
                  valoracionNueva,
                  setValoracionNueva,
                  'Valoración (opcional)',
                )}
              </div>
            </>
          )}
          <div className="form-text mt-n2 mb-3">
            «Crítico» sube al paciente al principio de la bandeja y deja la incidencia en tu
            inicio hasta que se cierre.
          </div>
          <CFormTextarea
            ref={ultimo ? primerCampo : undefined}
            className="mb-3"
            rows={3}
            id="panel-interpretacion"
            label="Interpretación clínica"
            value={interpretacion}
            onChange={(e) => setInterpretacion(e.target.value)}
          />
          <CFormTextarea
            className="mb-3"
            rows={2}
            id="panel-siguiente"
            label="Siguiente acción"
            value={siguiente}
            onChange={(e) => setSiguiente(e.target.value)}
          />
          {(ultimo || modo === 'comunicar') && (
            <fieldset className="mb-3" data-tour="resultado-comunicacion">
              <legend className="small fw-semibold mb-1">
                Comunicación o entrega al paciente
              </legend>
              <div className="d-flex flex-wrap gap-3 mb-2">
                {CANALES.map((c) => (
                  <CFormCheck
                    key={c.valor}
                    type="radio"
                    name={`canal-${orden.id}`}
                    id={`canal-${orden.id}-${c.valor}`}
                    label={c.etiqueta}
                    checked={canal === c.valor}
                    onChange={() => setCanal(c.valor)}
                  />
                ))}
              </div>
              <CFormTextarea
                ref={campoComunicacion}
                rows={2}
                id="panel-comunicacion"
                label="Cuándo y a quién (p. ej. «3/10, al paciente»)"
                value={comunicacion}
                onChange={(e) => setComunicacion(e.target.value)}
              />
            </fieldset>
          )}
          <div className="d-flex gap-2 flex-wrap" data-tour="resultado-guardar">
            {!ultimo && (
              <CButton
                type="button"
                color="secondary"
                disabled={guardando !== null}
                onClick={() => void guardar('received')}
              >
                {guardando === 'received' ? <CSpinner size="sm" /> : 'Guardar como recibido'}
              </CButton>
            )}
            {modo !== 'comunicar' && (
              <CButton
                type="button"
                color="primary"
                disabled={guardando !== null}
                onClick={() => void guardar('reviewed')}
              >
                {guardando === 'reviewed' ? (
                  <CSpinner size="sm" />
                ) : ultimo ? (
                  'Marcar revisada'
                ) : (
                  'Guardar y marcar revisada'
                )}
              </CButton>
            )}
            {ultimo && (
              <CButton
                type="button"
                color={modo === 'comunicar' ? 'primary' : 'success'}
                variant={modo === 'comunicar' ? undefined : 'outline'}
                disabled={guardando !== null || !canal || !comunicacion.trim()}
                onClick={() => void guardar('communicated')}
              >
                {guardando === 'communicated' ? <CSpinner size="sm" /> : 'Documentar comunicación'}
              </CButton>
            )}
            <CButton type="button" color="light" disabled={guardando !== null} onClick={onClose}>
              Cancelar
            </CButton>
          </div>
        </form>
      </CCol>
    </CRow>
  )

  const encabezado = <div className="small text-body-secondary">{pacienteNombre}</div>

  if (!ancha) {
    return (
      <CModal visible fullscreen onClose={onClose} backdrop="static">
        <CModalHeader>
          <div>
            <CModalTitle>{titulo}</CModalTitle>
            {encabezado}
          </div>
          <BotonAyudaContextual recorridoId="resultado-revisar" />
        </CModalHeader>
        <CModalBody>{contenido}</CModalBody>
      </CModal>
    )
  }

  return (
    <COffcanvas
      visible
      placement="end"
      onHide={onClose}
      backdrop="static"
      style={{ width: 'min(1200px, 96vw)' }}
      aria-labelledby="panel-resultado-titulo"
    >
      <COffcanvasHeader>
        <div>
          <COffcanvasTitle id="panel-resultado-titulo">{titulo}</COffcanvasTitle>
          {encabezado}
        </div>
        <BotonAyudaContextual recorridoId="resultado-revisar" />
        <CCloseButton className="text-reset" onClick={onClose} aria-label="Cerrar" />
      </COffcanvasHeader>
      <COffcanvasBody>{contenido}</COffcanvasBody>
    </COffcanvas>
  )
}

export default PanelResultado
