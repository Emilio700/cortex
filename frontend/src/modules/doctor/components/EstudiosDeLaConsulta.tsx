/**
 * «Estudios de esta consulta» (plan 26, fase 2, §3.3).
 *
 * Antes la tarjeta del plan clínico decía «10 en esta consulta», el badge
 * contaba toda el paciente (con tope de 30) y la lista enseñaba las 3 órdenes
 * más recientes del paciente, fueran de esta consulta o no: tres números y
 * ninguno coincidía con lo que se veía (C-1). Aquí se cargan las órdenes de
 * esta cita, todas, con sus resultados, y el título cuenta exactamente las
 * filas que se ven. El historial completo queda a un enlace.
 *
 * Las filas se agrupan por lote y por destino físico (laboratorio, imagen y
 * gabinete, otros), igual que el papel. La acción principal es «Imprimir
 * todo»: el papel consolidado de la cita, con vista previa. La hoja suelta de
 * un estudio vive en el menú de su fila.
 */
import { useEffect, useMemo, useState } from 'react'
import { CAlert, CBadge, CButton, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilWarning } from '@coreui/icons'

import { useAuth } from '../../../shared/context/AuthContext'
import VisorDocumentos from '../../../shared/components/VisorDocumentos'
import FormularioOrdenEstudios from './FormularioOrdenEstudios'
import MenuAccionesOrden, { type AccionExtra } from './MenuAccionesOrden'
import AnexarResultadoModal from './AnexarResultadoModal'
import VistaPreviaOrden from './VistaPreviaOrden'
import ResultadosPorAtender from './ResultadosPorAtender'
import BotonVistaPreviaOrden from './BotonVistaPreviaOrden'
import { archivosDeResultados, type VisorAbierto } from '../utils/archivosDeResultados'
import {
  DESTINOS_FISICOS,
  colorEstadoVisible,
  destinoFisico,
  estadoVisibleDe,
  etiquetaEstadoVisible,
  etiquetaPrioridad,
} from '../utils/etiquetasOrden'
import {
  nombreArchivoConsulta,
  nombreArchivoOrden,
  obtenerPdfOrden,
  obtenerPdfOrdenesDeConsulta,
  ordenImprimible,
} from '../utils/ordenEstudioPdf'
import type { OrdenConResultados, OrdenEnBandeja } from '../types/clinicalTracking'
import PanelResultado, { incidenciaAbierta, type ModoPanel } from './PanelResultado'
import { datosValoracion } from '../utils/valoracion'
import { useOrdenesDeLaConsulta } from '../hooks/useFuenteDeOrdenes'

interface Props {
  patientId: number
  appointmentId: number
  /** El médico puede crear, anexar y cancelar (no en una consulta cerrada). */
  canWrite: boolean
  pregnancyContext: Record<string, number>
  /** Lleva a la pestaña Estudios, con el historial completo del paciente. */
  onVerHistorial?: () => void
  /** Nombre del paciente, para el encabezado del panel de resultados. */
  patientName?: string
  /** Informa cuántos estudios hay en esta consulta y en todo el expediente. */
  onConteo?: (conteo: { consulta: number; expediente: number | null }) => void
}

interface Grupo {
  clave: string
  titulo: string | null
  destinos: { clave: string; etiqueta: string; ordenes: OrdenConResultados[] }[]
}

/** Lo que el panel de resultados necesita de una orden de la consulta. */
const comoOrdenDePanel = (orden: OrdenConResultados): OrdenEnBandeja => {
  const comunicada = orden.results.some((r) => r.communicated_at)
  const abierta = orden.results.some((r) => r.incidencia_abierta)
  // Un servidor viejo no manda la incidencia: se deduce del crítico sin comunicar.
  const deducida =
    !comunicada && orden.results.some((r) => r.valoracion === 'critico' || r.is_critical)
  const tieneDato = orden.results.some((r) => r.incidencia_abierta !== undefined)
  const incidencia = tieneDato ? abierta : deducida
  return { ...orden, comunicada, critico_sin_comunicar: incidencia, incidencia_abierta: incidencia }
}

/** Agrupa por lote (solo si hay más de uno) y, dentro, por destino físico. */
const agrupar = (ordenes: OrdenConResultados[]): Grupo[] => {
  const lotes = new Map<string, OrdenConResultados[]>()
  for (const orden of ordenes) {
    const clave = orden.order_group_id ? `G-${orden.order_group_id}` : 'sueltas'
    lotes.set(clave, [...(lotes.get(clave) ?? []), orden])
  }
  const variosLotes = lotes.size > 1
  return [...lotes.entries()].map(([clave, deLote]) => ({
    clave,
    titulo: variosLotes ? (clave === 'sueltas' ? 'Órdenes sueltas' : `Lote ${clave}`) : null,
    destinos: DESTINOS_FISICOS.map(({ valor, etiqueta }) => ({
      clave: valor,
      etiqueta,
      ordenes: deLote.filter((o) => destinoFisico(o.category) === valor),
    })).filter((d) => d.ordenes.length > 0),
  }))
}

const EstudiosDeLaConsulta = ({
  patientId,
  appointmentId,
  canWrite,
  pregnancyContext,
  onVerHistorial,
  onConteo,
  patientName,
}: Props) => {
  const { can } = useAuth()
  // La fuente compartida por paciente (una sola por consulta): aquí ya no se
  // pide nada al servidor; la entrada se recarga tras cada mutación.
  const { ordenes, totalConsulta, totalExpediente, cargando, error, recargar } =
    useOrdenesDeLaConsulta(patientId, appointmentId)
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [visor, setVisor] = useState<VisorAbierto | null>(null)
  const [anexando, setAnexando] = useState<OrdenConResultados | null>(null)
  const [reimprimiendo, setReimprimiendo] = useState<OrdenConResultados | null>(null)
  const [revisando, setRevisando] = useState<{ orden: OrdenEnBandeja; modo: ModoPanel } | null>(
    null,
  )
  const [aviso, setAviso] = useState<string | null>(null)

  const puedeAnexar = canWrite && can('clinical_tracking.attach_result')

  useEffect(() => {
    if (!cargando && !error) onConteo?.({ consulta: totalConsulta, expediente: totalExpediente })
  }, [cargando, error, totalConsulta, totalExpediente, onConteo])

  const grupos = useMemo(() => agrupar(ordenes), [ordenes])
  const hayImprimibles = ordenes.some((o) => ordenImprimible(o.status))
  const criticos = ordenes.filter((o) => incidenciaAbierta(comoOrdenDePanel(o))).length

  const verResultado = (orden: OrdenConResultados) =>
    setVisor({
      titulo: orden.study_name,
      archivos: archivosDeResultados(orden.results),
      inicial: 0,
    })

  const filaDe = (orden: OrdenConResultados) => {
    const estado = estadoVisibleDe(orden)
    const conArchivo = orden.results.some((r) => r.patient_document_id)
    const paraPanel = comoOrdenDePanel(orden)
    const critico = incidenciaAbierta(paraPanel)
    const ultimaValoracion = datosValoracion(orden.results[0]?.valoracion)
    const conResultado = orden.results.length > 0
    // Se puede anexar mientras la orden siga viva, también ya revisada: lo que la
    // paciente manda por WhatsApp después también se guarda (M8).
    const anexable = ['pendiente', 'resultado_recibido', 'revisada'].includes(estado)
    // Revisar aquí, dentro de la consulta, cierra la incidencia crítica (D-8).
    const principal: { etiqueta: string; accion: () => void; tour: string } | null =
      canWrite && conResultado && (estado === 'resultado_recibido' || critico)
        ? {
            etiqueta: 'Revisar resultado',
            accion: () => setRevisando({ orden: paraPanel, modo: 'revisar' }),
            tour: 'consulta-revisar-resultado',
          }
        : conArchivo
          ? {
              etiqueta: 'Ver resultado',
              accion: () => verResultado(orden),
              tour: 'consulta-ver-resultado',
            }
          : puedeAnexar && estado === 'pendiente'
            ? {
                etiqueta: 'Anexar resultado',
                accion: () => setAnexando(orden),
                tour: 'consulta-anexar-resultado',
              }
            : null
    const extras: AccionExtra[] = []
    if (conArchivo && principal?.etiqueta !== 'Ver resultado') {
      extras.push({ etiqueta: 'Ver resultado', onClick: () => verResultado(orden) })
    }
    if (puedeAnexar && anexable && principal?.etiqueta !== 'Anexar resultado') {
      extras.push({ etiqueta: 'Anexar archivo', onClick: () => setAnexando(orden) })
    }
    if (canWrite && estado === 'pendiente') {
      extras.push({
        etiqueta: 'Registrar nota rápida (sin archivo)',
        onClick: () => setRevisando({ orden: paraPanel, modo: 'registrar' }),
      })
    }
    if (canWrite && estado === 'revisada' && !paraPanel.comunicada) {
      extras.push({
        etiqueta: 'Documentar comunicación',
        onClick: () => setRevisando({ orden: paraPanel, modo: 'comunicar' }),
      })
    }
    if (ordenImprimible(orden.status) && can('clinical_tracking.print_order')) {
      extras.push({
        etiqueta: 'Reimprimir solo este estudio',
        onClick: () => setReimprimiendo(orden),
      })
    }
    return (
      <div
        key={orden.id}
        className="d-flex flex-wrap align-items-center gap-2 py-2 border-top"
        data-tour="consulta-estudio-fila"
      >
        <div className="flex-grow-1" style={{ minWidth: 200 }}>
          <span className="fw-semibold">{orden.study_name}</span>
          {critico && (
            <CBadge color="danger" className="ms-2">
              <CIcon icon={cilWarning} size="sm" className="me-1" />
              Crítico sin cerrar
            </CBadge>
          )}
          {ultimaValoracion && !critico && (
            <CBadge color={ultimaValoracion.color} className="ms-2">
              {ultimaValoracion.etiqueta}
            </CBadge>
          )}
          <div className="small text-body-secondary">
            Orden n.º {orden.id}
            {orden.priority !== 'routine' ? ` · ${etiquetaPrioridad(orden.priority)}` : ''}
          </div>
        </div>
        <CBadge color={colorEstadoVisible(estado)} className="text-wrap">
          {etiquetaEstadoVisible(estado)}
        </CBadge>
        <div style={{ minWidth: 150 }} className="text-end">
          {principal && (
            <CButton
              size="sm"
              color="primary"
              variant="outline"
              onClick={principal.accion}
              data-tour={principal.tour}
            >
              {principal.etiqueta}
            </CButton>
          )}
        </div>
        <MenuAccionesOrden
          orderId={orden.id}
          nombreEstudio={orden.study_name}
          acciones={canWrite ? (orden.acciones_de_estado ?? orden.allowed_transitions ?? []) : []}
          extras={extras}
          onChanged={() => void recargar()}
        />
      </div>
    )
  }

  return (
    <div className="border rounded p-3" data-tour="consulta-estudios">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <strong>Estudios de esta consulta ({totalConsulta})</strong>
        {criticos > 0 && <CBadge color="danger">{criticos} con resultado crítico</CBadge>}
        <div className="ms-auto d-flex flex-wrap gap-2">
          {hayImprimibles && (
            <BotonVistaPreviaOrden
              etiqueta="Imprimir todo"
              titulo="Órdenes de estudio de esta consulta"
              nombreArchivo={nombreArchivoConsulta(appointmentId)}
              obtener={(modo) => obtenerPdfOrdenesDeConsulta(appointmentId, modo)}
              conModo
              orderIds={ordenes.filter((o) => ordenImprimible(o.status)).map((o) => o.id)}
              folio={`C-${appointmentId}`}
              dataTour="consulta-imprimir-todo"
            />
          )}
          {canWrite && (
            <CButton
              size="sm"
              color="primary"
              variant={formularioAbierto ? undefined : 'outline'}
              onClick={() => setFormularioAbierto((v) => !v)}
              aria-expanded={formularioAbierto}
              data-tour="consulta-nueva-orden"
            >
              <CIcon icon={cilPlus} className="me-1" />
              {formularioAbierto ? 'Ocultar formulario' : 'Nueva orden'}
            </CButton>
          )}
        </div>
      </div>

      {aviso && (
        <CAlert color="success" dismissible onClose={() => setAviso(null)} className="small py-2">
          {aviso}
        </CAlert>
      )}

      {canWrite && (
        <ResultadosPorAtender
          patientId={patientId}
          appointmentId={appointmentId}
          patientName={patientName}
          puedeAnexar={puedeAnexar}
          onAviso={setAviso}
        />
      )}

      {canWrite && formularioAbierto && (
        <div className="border rounded p-3 mb-3 bg-body-tertiary">
          <FormularioOrdenEstudios
            patientId={patientId}
            appointmentId={appointmentId}
            pregnancyContext={pregnancyContext}
            onCreated={() => void recargar()}
          />
        </div>
      )}

      {cargando ? (
        <div className="text-center py-3">
          <CSpinner size="sm" />
        </div>
      ) : error ? (
        <CAlert
          color="danger"
          className="d-flex justify-content-between align-items-center gap-2 flex-wrap"
        >
          <span>{error}</span>
          <CButton size="sm" color="danger" variant="outline" onClick={() => void recargar()}>
            Reintentar
          </CButton>
        </CAlert>
      ) : ordenes.length === 0 ? (
        <div className="small text-body-secondary py-2">
          En esta consulta todavía no se piden estudios.
        </div>
      ) : (
        <div>
          {totalConsulta > ordenes.length && (
            <div className="small text-warning-emphasis mb-2">
              Se muestran {ordenes.length} de {totalConsulta} estudios de esta consulta.
            </div>
          )}
          {grupos.map((grupo) => (
            <div key={grupo.clave} className="mb-2">
              {grupo.titulo && <div className="fw-semibold small mt-2">{grupo.titulo}</div>}
              {grupo.destinos.map((destino) => (
                <div key={destino.clave} className="mt-2">
                  <div className="small text-uppercase text-body-secondary fw-semibold">
                    {destino.etiqueta} ({destino.ordenes.length})
                  </div>
                  {destino.ordenes.map(filaDe)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {onVerHistorial && (totalExpediente ?? 0) > 0 && (
        <div className="mt-2">
          <CButton color="link" size="sm" className="px-0" onClick={onVerHistorial}>
            Ver historial de estudios del paciente ({totalExpediente}) →
          </CButton>
        </div>
      )}

      <VisorDocumentos
        visible={visor !== null}
        onClose={() => setVisor(null)}
        titulo={visor?.titulo ?? ''}
        archivos={visor?.archivos ?? []}
        inicial={visor?.inicial ?? 0}
      />
      {anexando && (
        <AnexarResultadoModal
          visible
          orden={anexando}
          onClose={() => setAnexando(null)}
          onAnexado={(confirmados) => {
            setAviso(
              `Se anexó ${confirmados.length === 1 ? '1 archivo' : `${confirmados.length} archivos`} a ${anexando.study_name}.`,
            )
            void recargar()
          }}
        />
      )}
      {revisando && (
        <PanelResultado
          key={`${revisando.orden.id}-${revisando.modo}`}
          orden={revisando.orden}
          pacienteNombre={patientName || 'Paciente de esta consulta'}
          modo={revisando.modo}
          appointmentId={appointmentId}
          onClose={() => setRevisando(null)}
          onAnexar={puedeAnexar ? () => setAnexando(revisando.orden) : undefined}
          onGuardado={(_, mensaje) => {
            setAviso(mensaje)
            setRevisando(null)
            void recargar()
          }}
        />
      )}
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
    </div>
  )
}

export default EstudiosDeLaConsulta
