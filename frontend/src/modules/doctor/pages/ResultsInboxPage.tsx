/**
 * Bandeja «Órdenes y resultados» del médico, por paciente (plan 26, fase 3).
 *
 * Antes era una tarjeta por estudio con hasta nueve botones del mismo peso, y
 * un paciente con tres estudios salía en tres tarjetas, a veces partidas entre
 * páginas (B-1, B-2). Ahora el servidor pagina pacientes
 * (`GET /orders/inbox-by-patient`) y cada paciente es una tarjeta con una fila
 * compacta por estudio. Cada fila tiene una sola acción principal según su
 * estado; lo demás va al menú «⋯».
 *
 * Registrar o revisar se hace en un panel junto a la fila, con el archivo a la
 * vista, y al guardar la fila cambia en su lugar, sin recargar ni saltar de
 * página. Un fallo al cargar nunca se lee como «no hay pendientes».
 */
import { useCallback, useEffect, useState } from 'react'
import './bandejaPlegable.css'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CFormInput,
  CFormSelect,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilChevronBottom, cilClock, cilWarning, cilTask } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { useAuth } from '../../../shared/context/AuthContext'
import { mensajeDeError } from '../../../shared/utils/errors'
import { formatearFechaISO } from '../../../shared/utils/date'
import VisorDocumentos from '../../../shared/components/VisorDocumentos'
import MenuAccionesOrden, { type AccionExtra } from '../components/MenuAccionesOrden'
import AnexarResultadoModal from '../components/AnexarResultadoModal'
import PanelResultado, { incidenciaAbierta, type ModoPanel } from '../components/PanelResultado'
import { datosValoracion } from '../utils/valoracion'
import VistaPreviaOrden from '../components/VistaPreviaOrden'
import BotonVistaPreviaOrden from '../components/BotonVistaPreviaOrden'
import { avisarResultadosActualizados } from '../hooks/useResultadosSinRevisar'
import { archivosDeResultados, type VisorAbierto } from '../utils/archivosDeResultados'
import {
  colorEstadoVisible,
  estadoVisibleDe,
  etiquetaEstadoVisible,
  etiquetaPrioridad,
} from '../utils/etiquetasOrden'
import {
  nombreArchivoOrden,
  nombreArchivoPaciente,
  obtenerPdfOrden,
  obtenerPdfOrdenesDePaciente,
  obtenerPdfPendientesDePaciente,
  ordenImprimible,
} from '../utils/ordenEstudioPdf'
import type { ResultadoAdjuntado } from '../utils/anexarResultado'
import type {
  DiagnosticResult,
  FiltroBandeja,
  OrdenEnBandeja,
  PacienteEnBandeja,
  RespuestaBandeja,
  ResumenBandeja,
} from '../types/clinicalTracking'
import FranjaEstadoBandeja from '../components/FranjaEstadoBandeja'
import RegistrarSeguimientoModal from '../components/RegistrarSeguimientoModal'
import SeguimientoDeLaFila from '../components/SeguimientoDeLaFila'
import { LeyendaUltimaActualizacion } from '../components/RastroDeEstudio'
import { obtenerResumenBandeja } from '../utils/resumenBandeja'
import { EVENTO_FILTRO_BANDEJA, tomarFiltroPendiente } from '../utils/filtroBandeja'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
import { estaAbierta, gruposDe, guardarEleccion, leerEleccion, useRecorridoActivo, type Eleccion } from '../utils/plegadoBandeja'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

const PAGE_SIZE = 20

const FILTROS: ReadonlyArray<{ valor: FiltroBandeja; etiqueta: string }> = [
  { valor: 'activas', etiqueta: 'Todo lo pendiente' },
  { valor: 'pendientes', etiqueta: 'Pendientes de resultado' },
  { valor: 'por_revisar', etiqueta: 'Resultado por revisar' },
  { valor: 'sin_comunicar', etiqueta: 'Revisadas sin comunicar' },
  { valor: 'criticos', etiqueta: 'Resultados críticos' },
  { valor: 'atrasados', etiqueta: 'Atrasados' },
  { valor: 'urgentes', etiqueta: 'Urgentes y preferentes pendientes' },
  { valor: 'todos', etiqueta: 'Todos (incluye cerradas)' },
]

/** Lo que significa «vacío» en cada filtro, para no decir «no hay pendientes» a secas. */
const VACIO: Record<FiltroBandeja, string> = {
  activas: 'No tienes estudios pendientes.',
  pendientes: 'No hay estudios esperando resultado.',
  por_revisar: 'No hay resultados por revisar.',
  sin_comunicar: 'No hay resultados revisados sin comunicar.',
  criticos: 'No hay incidencias críticas abiertas.',
  atrasados: 'No hay estudios atrasados.',
  urgentes: 'No hay estudios urgentes ni preferentes esperando resultado.',
  todos: 'No hay órdenes de estudio.',
}

/**
 * Filtro con el que se abre. El inicio enlaza con `?filtro=por_revisar` (y
 * antes con `?estado=result_received`, que se sigue entendiendo). Se lee de la
 * URL (el router usa el hash); cualquier otra cosa abre «Todo lo pendiente».
 */
const filtroInicial = (): FiltroBandeja => {
  const pedido = tomarFiltroPendiente()
  if (pedido) return pedido
  const consulta = window.location.hash.split('?')[1] ?? window.location.search.slice(1)
  const params = new URLSearchParams(consulta)
  const filtro = params.get('filtro') ?? ''
  if (FILTROS.some((f) => f.valor === filtro)) return filtro as FiltroBandeja
  if (params.get('estado') === 'result_received') return 'por_revisar'
  return 'activas'
}

/** La acción principal de una fila, según el estado (§3.4). */
const accionPrincipal = (orden: OrdenEnBandeja): { modo: ModoPanel; etiqueta: string } | null => {
  const estado = estadoVisibleDe(orden)
  if (estado === 'pendiente') return { modo: 'registrar', etiqueta: 'Registrar resultado' }
  if (estado === 'resultado_recibido') return { modo: 'revisar', etiqueta: 'Revisar resultado' }
  if (estado === 'revisada' && !orden.comunicada) {
    return { modo: 'comunicar', etiqueta: 'Documentar comunicación' }
  }
  return null
}

const colorPrioridad = (priority: string) =>
  priority === 'urgent' ? 'danger' : priority === 'preferential' ? 'warning' : 'light'

type ConPaciente = { paciente: PacienteEnBandeja; orden: OrdenEnBandeja }

export default function ResultsInboxPage() {
  const { can } = useAuth()
  const [pacientes, setPacientes] = useState<PacienteEnBandeja[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filtro, setFiltro] = useState<FiltroBandeja>(filtroInicial)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  // Separado del aviso: sin esto un fallo de red dejaba la lista vacía y se
  // leía «No hay pendientes», y el médico podía dar por revisado un estudio
  // que nunca vio.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [panel, setPanel] = useState<(ConPaciente & { modo: ModoPanel }) | null>(null)
  const [anexando, setAnexando] = useState<ConPaciente | null>(null)
  const [siguiendo, setSiguiendo] = useState<ConPaciente | null>(null)
  const [visor, setVisor] = useState<VisorAbierto | null>(null)
  const [reimprimiendo, setReimprimiendo] = useState<OrdenEnBandeja | null>(null)
  const [recienCambiada, setRecienCambiada] = useState<number | null>(null)
  const [eleccion, setEleccion] = useState<Eleccion>(leerEleccion)
  const recorridoActivo = useRecorridoActivo()

  const elegir = (cambios: Eleccion) => {
    setEleccion((actual) => {
      const nueva = { ...actual, ...cambios }
      guardarEleccion(nueva)
      return nueva
    })
  }
  const todas = (abrir: boolean) =>
    elegir(Object.fromEntries(pacientes.map((p) => [p.patient_id, abrir])))

  const puedeAnexar = can('clinical_tracking.attach_result')
  const puedeSeguir = can('clinical_tracking.follow_up')
  const [resumen, setResumen] = useState<ResumenBandeja | null>(null)
  const [errorResumen, setErrorResumen] = useState(false)

  // Aparte de la lista: si el conteo falla la lista se sigue viendo, y al revés.
  const cargarResumen = useCallback(async () => {
    setErrorResumen(false)
    try {
      setResumen(await obtenerResumenBandeja())
    } catch {
      setResumen(null)
      setErrorResumen(true)
    }
  }, [])

  useEffect(() => { void cargarResumen() }, [cargarResumen])

  const load = useCallback(async (silencioso = false) => {
    // En un regreso la bandeja ya está a la vista (o un panel abierto): sin
    // spinner que la borre; los datos se reemplazan al llegar.
    if (!silencioso) setLoading(true)
    setLoadError(null)
    try {
      const response = await apiClient.get<RespuestaBandeja>(
        '/clinical-tracking/orders/inbox-by-patient',
        {
          params: {
            filtro,
            search: search.trim() || undefined,
            skip: page * PAGE_SIZE,
            limit: PAGE_SIZE,
          },
        },
      )
      setPacientes(response.data.items)
      setTotal(response.data.total)
    } catch (caught) {
      setLoadError(mensajeDeError(caught, 'No se pudo cargar la bandeja de resultados.'))
    } finally {
      setLoading(false)
    }
  }, [filtro, search, page])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])

  // Al volver a la pestaña se refresca la bandeja en silencio: un resultado
  // recién subido debe aparecer sin recargar a mano. El panel de revisar o
  // registrar queda intacto: `load` no toca `panel` ni sus formularios.
  useAlReactivarPestana(() => {
    void load(true)
    void cargarResumen()
  })

  // Con la bandeja ya abierta en su pestaña, el filtro pedido llega por evento (I2).
  useEffect(() => {
    const alPedir = (evento: Event) => {
      const filtro = (evento as CustomEvent<FiltroBandeja>).detail
      if (!FILTROS.some((f) => f.valor === filtro)) return
      tomarFiltroPendiente()
      setFiltro(filtro)
      setPage(0)
    }
    window.addEventListener(EVENTO_FILTRO_BANDEJA, alPedir)
    return () => window.removeEventListener(EVENTO_FILTRO_BANDEJA, alPedir)
  }, [])

  /** Cambia una orden en su lugar: la tarjeta no se mueve ni se recarga la página. */
  const reemplazarOrden = (patientId: number, actualizada: OrdenEnBandeja) => {
    setPacientes((lista) =>
      lista.map((p) => {
        if (p.patient_id !== patientId) return p
        const orders = p.orders.map((o) => (o.id === actualizada.id ? actualizada : o))
        return {
          ...p,
          orders,
          por_revisar: orders.filter((o) => estadoVisibleDe(o) === 'resultado_recibido').length,
          tiene_criticos: orders.some((o) => incidenciaAbierta(o)),
        }
      }),
    )
    setRecienCambiada(actualizada.id)
    avisarResultadosActualizados()
    void cargarResumen()
  }

  const alAnexar = ({ paciente, orden }: ConPaciente, nuevos: ResultadoAdjuntado[]) => {
    const resultados: DiagnosticResult[] = nuevos
      .map((n) => ({
        id: n.result_id,
        review_status: 'received',
        is_critical: false,
        patient_document_id: n.patient_document_id,
        document_file_name: n.file_name,
        document_mime_type: n.mime_type,
        created_at: n.uploaded_at,
      }))
      .reverse()
    const estado = nuevos[nuevos.length - 1].order_status
    const actualizada: OrdenEnBandeja = {
      ...orden,
      status: estado,
      estado_visible: estadoVisibleDe({ status: estado }),
      results: [...resultados, ...orden.results],
    }
    reemplazarOrden(paciente.patient_id, actualizada)
    setAviso(
      `Se anexó ${nuevos.length === 1 ? '1 archivo' : `${nuevos.length} archivos`} a ${orden.study_name} de ${paciente.patient_name}.`,
    )
    // Si el panel está abierto sobre esta orden, que vea el archivo nuevo.
    setPanel((actual) =>
      actual && actual.orden.id === orden.id ? { ...actual, orden: actualizada } : actual,
    )
  }

  const filaDe = (paciente: PacienteEnBandeja, orden: OrdenEnBandeja) => {
    const estado = estadoVisibleDe(orden)
    const principal = accionPrincipal(orden)
    const conArchivo = orden.results.some((r) => r.patient_document_id)
    const extras: AccionExtra[] = []
    if (conArchivo) {
      extras.push({
        etiqueta: 'Ver resultado',
        onClick: () =>
          setVisor({
            titulo: `${paciente.patient_name}: ${orden.study_name}`,
            archivos: archivosDeResultados(orden.results),
            inicial: 0,
          }),
      })
    }
    // También ya revisada: lo que llega por WhatsApp después se guarda (M8); la
    // orden vuelve a «Resultado recibido» porque hay algo que no ha visto.
    if (puedeAnexar && ['pendiente', 'resultado_recibido', 'revisada'].includes(estado)) {
      extras.push({ etiqueta: 'Anexar archivo', onClick: () => setAnexando({ paciente, orden }) })
    }
    if (puedeSeguir && estado === 'pendiente') {
      extras.push({ etiqueta: 'Registrar seguimiento', onClick: () => setSiguiendo({ paciente, orden }) })
    }
    if (ordenImprimible(orden.status) && can('clinical_tracking.print_order')) {
      extras.push({
        etiqueta: 'Imprimir solo este estudio',
        onClick: () => setReimprimiendo(orden),
      })
    }
    return (
      <div
        key={orden.id}
        className={`d-flex flex-wrap align-items-center gap-2 py-2 border-top ${
          recienCambiada === orden.id ? 'bg-success-subtle' : ''
        }`}
        data-tour="bandeja-orden"
      >
        <div className="flex-grow-1" style={{ minWidth: 180 }}>
          <span className="fw-semibold">{orden.study_name}</span>
          {incidenciaAbierta(orden) && (
            <CBadge color="danger" className="ms-2">
              <CIcon icon={cilWarning} size="sm" className="me-1" />
              Crítico sin cerrar
            </CBadge>
          )}
          {!incidenciaAbierta(orden) && datosValoracion(orden.results[0]?.valoracion) && (
            <CBadge color={datosValoracion(orden.results[0]?.valoracion)!.color} className="ms-2">
              {datosValoracion(orden.results[0]?.valoracion)!.etiqueta}
            </CBadge>
          )}
          <div className="small text-body-secondary">
            Orden n.º {orden.id} · solicitada{' '}
            {formatearFechaISO(orden.requested_on, 'sin fecha', 'short')}
            {orden.desired_on && (
              <> · realizar a más tardar el {formatearFechaISO(orden.desired_on, 'sin fecha', 'short')}</>
            )}
          </div>
          <SeguimientoDeLaFila orden={orden} />
          <LeyendaUltimaActualizacion
            orderId={orden.id}
            cuando={orden.ultima_actualizacion_at}
            por={orden.ultima_actualizacion_por}
          />
        </div>
        <CBadge
          color={colorPrioridad(orden.priority)}
          textColor={orden.priority === 'urgent' ? undefined : 'dark'}
        >
          {etiquetaPrioridad(orden.priority)}
        </CBadge>
        {/* Blanco sobre ámbar o celeste no llega a AA (axe): esos van en texto oscuro. */}
        <CBadge
          color={colorEstadoVisible(estado)}
          textColor={['warning', 'info'].includes(colorEstadoVisible(estado)) ? 'dark' : undefined}
        >
          {etiquetaEstadoVisible(estado)}
        </CBadge>
        <div style={{ minWidth: 190 }} className="text-end">
          {principal && (
            <CButton
              size="sm"
              color="primary"
              variant={principal.modo === 'registrar' ? 'outline' : undefined}
              data-tour="bandeja-registrar"
              onClick={() => setPanel({ paciente, orden, modo: principal.modo })}
            >
              {principal.etiqueta}
            </CButton>
          )}
        </div>
        <MenuAccionesOrden
          orderId={orden.id}
          nombreEstudio={orden.study_name}
          acciones={orden.acciones_de_estado ?? orden.allowed_transitions ?? []}
          extras={extras}
          onChanged={() => {
            avisarResultadosActualizados()
            void load()
            void cargarResumen()
          }}
        />
      </div>
    )
  }

  const tarjetaDe = (paciente: PacienteEnBandeja, indice: number) => {
    const abierta = estaAbierta(paciente, indice, eleccion, search.trim() !== '', recorridoActivo)
    const grupos = gruposDe(paciente.orders)
    const pendientes = paciente.orders.filter((o) => estadoVisibleDe(o) === 'pendiente').length
    // Plegada, la tarjeta también avisa del atraso (plan 32, punto 3.1): si no,
    // lo atrasado quedaba escondido hasta abrirla.
    const atrasadas = paciente.orders.filter((o) => o.atrasada).length
    const idCuerpo = `bandeja-paciente-${paciente.patient_id}`
    // Solo lo que sigue pendiente: lo que ya tiene resultado no se vuelve a
    // mandar al laboratorio (plan 26, I3). Lo demás se imprime suelto desde «⋯».
    const imprimibles = paciente.orders
      .filter((o) => estadoVisibleDe(o) === 'pendiente')
      .map((o) => o.id)
    return (
      <CCard
        key={paciente.patient_id}
        className={`bandeja-tarjeta ${paciente.tiene_criticos ? 'border-danger bandeja-tarjeta--critica' : ''}`}
        data-tour="bandeja-paciente"
      >
        <CCardHeader className="p-0">
          <button
            type="button"
            className="bandeja-tarjeta__cabecera"
            aria-expanded={abierta}
            aria-controls={idCuerpo}
            onClick={() => elegir({ [paciente.patient_id]: !abierta })}
          >
            <CIcon
              icon={cilChevronBottom}
              className={`bandeja-tarjeta__flecha ${abierta ? 'is-abierta' : ''}`}
              aria-hidden="true"
            />
            <span className="fw-semibold">{paciente.patient_name}</span>
            <span className="small text-body-secondary">
              {paciente.total_ordenes} {paciente.total_ordenes === 1 ? 'estudio' : 'estudios'}
              {pendientes > 0 && ` · ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}`}
              {paciente.por_revisar > 0 && ` · ${paciente.por_revisar} por revisar`}
              {' · '}desde el {formatearFechaISO(paciente.solicitada_mas_antigua)}
            </span>
            {paciente.tiene_criticos && <CBadge color="danger">Crítico</CBadge>}
            {atrasadas > 0 && (
              <span className="insignia-atrasado">
                <CIcon icon={cilClock} size="sm" aria-hidden="true" />
                {atrasadas === 1 ? 'Atrasado' : `${atrasadas} atrasados`}
              </span>
            )}
            {paciente.prioridad_maxima !== 'routine' && (
              <CBadge
                color={colorPrioridad(paciente.prioridad_maxima)}
                textColor={paciente.prioridad_maxima === 'preferential' ? 'dark' : undefined}
              >
                {etiquetaPrioridad(paciente.prioridad_maxima)}
              </CBadge>
            )}
          </button>
        </CCardHeader>
        {abierta && (
        <CCardBody className="py-1" id={idCuerpo}>
          {paciente.orders.length < paciente.total_ordenes && (
            <div className="small text-body-secondary pt-2">
              En este filtro se ven {paciente.orders.length} de sus {paciente.total_ordenes}{' '}
              estudios.
            </div>
          )}
          {grupos.map((grupo) => (
            <div key={grupo.clave} className="mt-2" data-tour="bandeja-grupo">
              <div className="d-flex flex-wrap align-items-baseline gap-2">
                <span className="small text-body-secondary fw-semibold bandeja-grupo__titulo">
                  {grupo.titulo}
                </span>
                {grupo.citaParaVer && (
                  <a className="small" href={`#/doctor/consultation/${grupo.citaParaVer}`}>
                    Ver la consulta
                  </a>
                )}
              </div>
              {grupo.ordenes.map((o) => filaDe(paciente, o))}
            </div>
          ))}
          {imprimibles.length > 0 && (
            <div className="border-top py-2">
              <BotonVistaPreviaOrden
                etiqueta="Imprimir pendientes del paciente"
                titulo={`Órdenes de estudio de ${paciente.patient_name}`}
                nombreArchivo={nombreArchivoPaciente(paciente.patient_id)}
                obtener={(modo) => {
                  // Con el médico conocida, todas sus pendientes del paciente,
                  // aunque el filtro de la bandeja no las enseñe (M5).
                  const doctorId = paciente.orders.find((o) => o.doctor_id != null)?.doctor_id
                  return doctorId != null
                    ? obtenerPdfPendientesDePaciente(paciente.patient_id, doctorId, modo)
                    : obtenerPdfOrdenesDePaciente(paciente.patient_id, imprimibles, modo)
                }}
                conModo
                orderIds={imprimibles}
                variant="outline"
                color="secondary"
                dataTour="bandeja-imprimir-paciente"
              />
            </div>
          )}
        </CCardBody>
        )}
      </CCard>
    )
  }

  return (
    <>
      <EncabezadoPantalla
        titulo="Órdenes y resultados"
        descripcion="Tus estudios por paciente: que ninguno se quede sin resultado, sin revisar o sin comunicar."
        icono={cilTask}
      />
      {/* Debajo del encabezado y no dentro: es la herramienta de la lista, no
          el nombre de la pantalla. */}
      <FranjaEstadoBandeja
        resumen={resumen}
        error={errorResumen}
        cargando={resumen === null}
        activo={filtro}
        onElegir={(f) => {
          setFiltro(f)
          setPage(0)
        }}
        onReintentar={() => void cargarResumen()}
      />
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <CFormInput
          data-tour="bandeja-buscar"
          style={{ maxWidth: 360 }}
          placeholder="Paciente, estudio o n.º de orden…"
          aria-label="Buscar en la bandeja"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
        <CFormSelect
          data-tour="bandeja-filtro"
          style={{ maxWidth: 260 }}
          aria-label="Qué mostrar"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value as FiltroBandeja)
            setPage(0)
          }}
        >
          {FILTROS.map(({ valor, etiqueta }) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </CFormSelect>
      </div>
      {aviso && (
        <CAlert color="success" dismissible onClose={() => setAviso(null)}>
          {aviso}
        </CAlert>
      )}
      {loading ? (
        <div className="text-center p-5">
          <CSpinner />
        </div>
      ) : loadError ? (
        <CAlert
          color="danger"
          className="d-flex justify-content-between align-items-center gap-3 flex-wrap"
        >
          <span>{loadError} La lista puede tener pendientes que no se están mostrando.</span>
          <CButton color="danger" variant="outline" onClick={() => void load()}>
            Reintentar
          </CButton>
        </CAlert>
      ) : pacientes.length === 0 ? (
        <CAlert color="success">{VACIO[filtro]}</CAlert>
      ) : (
        <>
          <div className="d-flex justify-content-end gap-2 mb-2" data-tour="bandeja-plegar">
            <CButton size="sm" color="secondary" variant="ghost" onClick={() => todas(true)}>
              Expandir todo
            </CButton>
            <CButton size="sm" color="secondary" variant="ghost" onClick={() => todas(false)}>
              Contraer todo
            </CButton>
          </div>
          <div className="d-flex flex-column gap-2">{pacientes.map(tarjetaDe)}</div>
        </>
      )}
      {!loadError && !loading && (
        <div className="d-flex justify-content-between mt-3">
          <span>
            {total} {total === 1 ? 'paciente' : 'pacientes'}
          </span>
          <div>
            <CButton disabled={!page} onClick={() => setPage(page - 1)}>
              Anterior
            </CButton>
            <CButton
              className="ms-2"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </CButton>
          </div>
        </div>
      )}

      {panel && (
        <PanelResultado
          key={`${panel.orden.id}-${panel.modo}`}
          orden={panel.orden}
          pacienteNombre={panel.paciente.patient_name}
          modo={panel.modo}
          onClose={() => setPanel(null)}
          onAnexar={
            puedeAnexar
              ? () => setAnexando({ paciente: panel.paciente, orden: panel.orden })
              : undefined
          }
          onGuardado={(actualizada, mensaje) => {
            reemplazarOrden(panel.paciente.patient_id, actualizada)
            setAviso(`${panel.paciente.patient_name} · ${mensaje}`)
            setPanel(null)
          }}
        />
      )}
      {siguiendo && (
        <RegistrarSeguimientoModal
          visible
          orden={{ ...siguiendo.orden, patient_name: siguiendo.paciente.patient_name }}
          onClose={() => setSiguiendo(null)}
          onGuardado={(seg) => {
            // Lo que el servidor confirmó: la fila deja de estar atrasada hasta su fecha.
            reemplazarOrden(siguiendo.paciente.patient_id, {
              ...siguiendo.orden,
              ultimo_seguimiento: seg,
              atrasada: false,
            })
            setAviso(`Seguimiento guardado: ${siguiendo.orden.study_name} de ${siguiendo.paciente.patient_name} se vuelve a revisar el ${formatearFechaISO(seg.revisar_el)}.`)
          }}
        />
      )}
      {anexando && (
        <AnexarResultadoModal
          visible
          orden={{ ...anexando.orden, patient_name: anexando.paciente.patient_name }}
          onClose={() => setAnexando(null)}
          onAnexado={(nuevos) => alAnexar(anexando, nuevos)}
        />
      )}
      <VisorDocumentos
        visible={visor !== null}
        onClose={() => setVisor(null)}
        titulo={visor?.titulo ?? ''}
        archivos={visor?.archivos ?? []}
        inicial={visor?.inicial ?? 0}
      />
      {reimprimiendo && (
        <VistaPreviaOrden
          visible
          onClose={() => setReimprimiendo(null)}
          titulo={`${reimprimiendo.study_name} · Orden n.º ${reimprimiendo.id}`}
          nombreArchivo={nombreArchivoOrden(reimprimiendo.id)}
          obtener={() => obtenerPdfOrden(reimprimiendo.id)}
          orderIds={[reimprimiendo.id]}
        />
      )}
    </>
  )
}
