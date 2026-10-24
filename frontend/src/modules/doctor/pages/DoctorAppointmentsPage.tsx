/**
 * Mis Consultas (plan 32, punto 4): el historial y la búsqueda de consultas.
 *
 * La Agenda programa y el Inicio lleva lo de hoy; aquí se encuentra una
 * consulta pasada o próxima para reabrir la nota, reimprimir o revisar. Por
 * eso el periodo por omisión es «Últimos 30 días y próximas».
 *
 * La lista la pagina y la filtra el servidor (`X-Total-Count`): con el tope
 * de 100 no se llegaba a la consulta 101. Los filtros y la página se guardan
 * en la URL de la pestaña, así que una recarga o un enlace la dejan igual; y
 * como la pestaña no se desmonta, al volver de una consulta todo sigue donde
 * estaba.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton, CCollapse, CFormInput, CFormLabel, CFormSelect } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilArrowRight, cilCalendar, cilFilter, cilList, cilSearch } from '@coreui/icons'

import { useDoctorAppointments } from '../hooks/useDoctorAppointments'
import { TableSkeleton } from '../../../shared/components/TableSkeleton'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { APPOINTMENT_STATUS_LABELS } from '../../../shared/constants/statusLabels'
import { hoyLocalISO } from '../../../shared/utils/date'
import { pedir, useAtenderPedido } from '../../../shared/utils/pedidos'
import type { Appointment } from '../../secretaria/types'
import {
  TAMANOS_DE_PAGINA,
  atajosDePeriodo,
  filtrosAURL,
  filtrosDesdeURL,
  type ClavePeriodo,
  type FiltrosConsultas,
} from '../utils/misConsultas'
import { obtenerResumenDelDia, type ResumenDelDia as Resumen } from '../utils/resumenDelDia'
import RenglonConsulta from '../components/misConsultas/RenglonConsulta'
import ResumenDelDia from '../components/misConsultas/ResumenDelDia'
import VistaCalendario from '../components/misConsultas/VistaCalendario'
import './misConsultas.css'
import { rutaDelExpediente } from '../../expediente/rutas'

export const RUTA_MIS_CONSULTAS = '/doctor/appointments'

const ESTADOS = ['agendada', 'confirmada', 'en_sala', 'en_consulta', 'atendida', 'cancelada']
const TIPOS = [
  { valor: 'consulta', etiqueta: 'Consulta' },
  { valor: 'cirugia', etiqueta: 'Cirugía' },
  { valor: 'procedimiento', etiqueta: 'Procedimiento' },
]

/**
 * Lo que dice la URL, solo si es la de esta pantalla. Las pestañas reciben una
 * ubicación sintética sin `search`, así que se lee la real (como la Agenda).
 */
const parametrosDeLaURL = (): URLSearchParams => {
  const [ruta, consulta] = window.location.hash.replace(/^#/, '').split('?')
  return new URLSearchParams(ruta === RUTA_MIS_CONSULTAS ? consulta ?? '' : '')
}

const escribirEnLaURL = (f: FiltrosConsultas) => {
  const [ruta] = window.location.hash.replace(/^#/, '').split('?')
  // Con otra pestaña al frente no se toca su URL.
  if (ruta !== RUTA_MIS_CONSULTAS) return
  const consulta = filtrosAURL(f).toString()
  const destino = `#${RUTA_MIS_CONSULTAS}${consulta ? `?${consulta}` : ''}`
  if (window.location.hash !== destino) window.history.replaceState(window.history.state, '', destino)
}

/**
 * «Fecha» depende del periodo: el historial (30 días y próximas, todo) va de lo
 * más reciente a lo más antiguo, para que al abrir se vea lo de estos días y no
 * lo de hace un mes; un periodo hacia adelante (hoy, mañana, la semana) va en
 * el orden en que se atiende.
 */
const ordenEfectivo = (f: FiltrosConsultas): 'asc' | 'desc' =>
  f.orden !== 'fecha' ? f.orden : f.periodo === 'reciente' || f.periodo === 'todo' ? 'desc' : 'asc'

const fechaCorta = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')

const DoctorAppointmentsPage: React.FC = () => {
  const navigate = useNavigate()
  const { loading, error, appointments, total, fetchMyAppointments } = useDoctorAppointments()
  const hoy = hoyLocalISO()
  const atajos = useMemo(() => atajosDePeriodo(hoy), [hoy])
  const [f, setF] = useState<FiltrosConsultas>(() => filtrosDesdeURL(parametrosDeLaURL(), hoy))
  const [texto, setTexto] = useState(f.q)
  const [avanzados, setAvanzados] = useState(f.periodo === 'rango' || !!f.tipo)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [errorResumen, setErrorResumen] = useState(false)

  /** Cambia filtros; todo cambio que no sea de página vuelve a la página 1. */
  const cambiar = useCallback((cambios: Partial<FiltrosConsultas>) => {
    setF((actual) => ({ ...actual, ...cambios, pagina: cambios.pagina ?? 1 }))
  }, [])

  // La búsqueda va al servidor; se espera a que termine de teclear.
  useEffect(() => {
    if (texto.trim() === f.q) return
    const espera = setTimeout(() => cambiar({ q: texto.trim() }), 300)
    return () => clearTimeout(espera)
  }, [texto, f.q, cambiar])

  useEffect(() => { escribirEnLaURL(f) }, [f])

  useEffect(() => {
    if (f.vista !== 'lista') return
    fetchMyAppointments({
      fecha_desde: f.desde || undefined,
      fecha_hasta: f.hasta || undefined,
      q: f.q || undefined,
      status: f.estado || undefined,
      orden: ordenEfectivo(f),
      appointment_type: f.tipo || undefined,
      skip: (f.pagina - 1) * f.porPagina,
      limit: f.porPagina,
    })
  }, [f, fetchMyAppointments])

  const cargarResumen = useCallback(async () => {
    setErrorResumen(false)
    try {
      setResumen(await obtenerResumenDelDia())
    } catch {
      setResumen(null)
      setErrorResumen(true)
    }
  }, [])
  useEffect(() => { void cargarResumen() }, [cargarResumen])

  const elegirAtajo = (clave: ClavePeriodo) => {
    const atajo = atajos.find((a) => a.clave === clave)
    if (atajo) cambiar({ periodo: clave, desde: atajo.desde, hasta: atajo.hasta, vista: 'lista' })
  }

  // El inicio pide «Ver todas» (todo el historial) o la agenda de hoy (plan 28).
  useAtenderPedido('consultas:periodo', (periodo) => elegirAtajo(periodo === 'todo' ? 'todo' : 'hoy'))

  const paginas = total !== null ? Math.max(1, Math.ceil(total / f.porPagina)) : null
  const desde = (f.pagina - 1) * f.porPagina + 1
  const hasta = (f.pagina - 1) * f.porPagina + appointments.length

  const abrir = (cita: Appointment) => navigate(`/doctor/consultation/${cita.id}`)
  const expediente = (patientId: number) => navigate(rutaDelExpediente(patientId))
  const verEnAgenda = (dia: string) => {
    pedir('agenda:dia', { fecha: dia })
    navigate('/secretaria/agenda')
  }

  const hayFiltros = !!(f.q || f.estado || f.tipo)
  const vacio = hayFiltros
    ? { titulo: 'Sin resultados', texto: 'Ninguna consulta coincide con la búsqueda o los filtros.' }
    : { titulo: 'No hay consultas en este periodo', texto: 'Prueba con otro periodo o con «Todo mi historial».' }

  return (
    <div className="mis-consultas">
      <EncabezadoPantalla
        titulo="Mis Consultas"
        descripcion="Busca, reabre y da seguimiento a tus consultas, pasadas y próximas."
        icono={cilCalendar}
        acciones={<ResumenDelDia resumen={resumen} error={errorResumen} onReintentar={() => void cargarResumen()} />}
      />

      <section className="consultas-filtros" aria-label="Filtros de consultas" data-tour="consultas-filtros">
        <div className="consultas-filtros__fila">
          <div className="consultas-filtros__campo consultas-filtros__periodo">
            <span className="consultas-filtros__etiqueta" id="consultas-periodo-etiqueta">Periodo de consulta</span>
            <button
              type="button"
              className="consultas-periodo"
              id="consultas-periodo-boton"
              // Etiqueta y luego el propio texto: el nombre incluye las fechas
              // que se ven (axe, label-content-name-mismatch; plan 32).
              aria-labelledby="consultas-periodo-etiqueta consultas-periodo-boton"
              aria-expanded={avanzados}
              onClick={() => setAvanzados((v) => !v)}
            >
              <CIcon icon={cilCalendar} aria-hidden="true" />
              <span>{f.desde ? fechaCorta(f.desde) : 'Desde siempre'}</span>
              <CIcon icon={cilArrowRight} size="sm" aria-hidden="true" />
              <span>{f.hasta ? fechaCorta(f.hasta) : 'En adelante'}</span>
            </button>
          </div>
          <div className="consultas-filtros__campo consultas-filtros__buscar" data-tour="consultas-buscar">
            <label className="consultas-filtros__etiqueta" htmlFor="consultas-buscar">Búsqueda rápida</label>
            <div className="consultas-buscador">
              <CIcon icon={cilSearch} aria-hidden="true" />
              <input
                id="consultas-buscar"
                type="search"
                placeholder="Paciente, expediente o teléfono…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>
          </div>
          <CButton
            color="secondary"
            variant="outline"
            className="consultas-filtros__plegar d-md-none"
            aria-expanded={filtrosAbiertos}
            aria-controls="consultas-mas-filtros"
            onClick={() => setFiltrosAbiertos((v) => !v)}
          >
            <CIcon icon={cilFilter} className="me-1" aria-hidden="true" /> Filtros
          </CButton>
          <div id="consultas-mas-filtros" className={`consultas-filtros__mas ${filtrosAbiertos ? 'is-abierto' : ''}`}>
            <div className="consultas-filtros__campo">
              <CFormLabel htmlFor="consultas-estado" className="consultas-filtros__etiqueta">Estado</CFormLabel>
              <CFormSelect id="consultas-estado" value={f.estado} onChange={(e) => cambiar({ estado: e.target.value })}>
                <option value="">Todos los estados</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{APPOINTMENT_STATUS_LABELS[e]}</option>
                ))}
              </CFormSelect>
            </div>
            <div className="consultas-filtros__campo">
              <CFormLabel htmlFor="consultas-orden" className="consultas-filtros__etiqueta">Ordenar por</CFormLabel>
              <CFormSelect
                id="consultas-orden"
                value={f.orden}
                onChange={(e) => cambiar({ orden: e.target.value as FiltrosConsultas['orden'] })}
              >
                <option value="fecha">Fecha</option>
                <option value="desc">Más reciente primero</option>
                <option value="asc">Más antigua primero</option>
              </CFormSelect>
            </div>
            <CButton
              color="primary"
              variant="outline"
              className="consultas-filtros__avanzados"
              aria-expanded={avanzados}
              aria-controls="consultas-avanzados"
              onClick={() => setAvanzados((v) => !v)}
            >
              <CIcon icon={cilFilter} className="me-1" aria-hidden="true" /> Filtros avanzados
            </CButton>
          </div>
        </div>

        <CCollapse visible={avanzados} id="consultas-avanzados">
          <div className="consultas-filtros__avanzado">
            <div className="consultas-filtros__campo">
              <CFormLabel htmlFor="consultas-desde" className="consultas-filtros__etiqueta">Desde</CFormLabel>
              <CFormInput
                id="consultas-desde"
                type="date"
                value={f.desde}
                max={f.hasta || undefined}
                onChange={(e) => cambiar({ periodo: 'rango', desde: e.target.value })}
              />
            </div>
            <div className="consultas-filtros__campo">
              <CFormLabel htmlFor="consultas-hasta" className="consultas-filtros__etiqueta">Hasta</CFormLabel>
              <CFormInput
                id="consultas-hasta"
                type="date"
                value={f.hasta}
                min={f.desde || undefined}
                onChange={(e) => cambiar({ periodo: 'rango', hasta: e.target.value })}
              />
            </div>
            <div className="consultas-filtros__campo">
              <CFormLabel htmlFor="consultas-tipo" className="consultas-filtros__etiqueta">Tipo de cita</CFormLabel>
              <CFormSelect id="consultas-tipo" value={f.tipo} onChange={(e) => cambiar({ tipo: e.target.value })}>
                <option value="">Todos los tipos</option>
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                ))}
              </CFormSelect>
            </div>
          </div>
        </CCollapse>

        <div className="consultas-filtros__pie">
          <div className="consultas-pildoras" role="group" aria-label="Atajos de periodo" data-tour="consultas-periodos">
            {atajos.map((a) => (
              <button
                key={a.clave}
                type="button"
                className={`consultas-pildora ${f.periodo === a.clave ? 'is-activa' : ''}`}
                aria-pressed={f.periodo === a.clave}
                onClick={() => elegirAtajo(a.clave)}
              >
                {a.etiqueta}
              </button>
            ))}
          </div>
          <div className="consultas-filtros__vista">
            {f.vista === 'lista' && total !== null && !error && (
              <span className="consultas-conteo" role="status">
                {total} {total === 1 ? 'resultado' : 'resultados'}
              </span>
            )}
            <div className="consultas-vista" role="group" aria-label="Cómo ver las consultas" data-tour="consultas-vista">
              <button
                type="button"
                className={f.vista === 'lista' ? 'is-activa' : ''}
                aria-pressed={f.vista === 'lista'}
                onClick={() => cambiar({ vista: 'lista', pagina: f.pagina })}
              >
                <CIcon icon={cilList} aria-hidden="true" /> Lista
              </button>
              <button
                type="button"
                className={f.vista === 'calendario' ? 'is-activa' : ''}
                aria-pressed={f.vista === 'calendario'}
                onClick={() => cambiar({ vista: 'calendario', pagina: f.pagina })}
              >
                <CIcon icon={cilCalendar} aria-hidden="true" /> Calendario
              </button>
            </div>
          </div>
        </div>
      </section>

      {f.vista === 'calendario' ? (
        <VistaCalendario
          onElegirDia={(dia) => cambiar({ periodo: 'rango', desde: dia, hasta: dia, vista: 'lista' })}
        />
      ) : loading && appointments.length === 0 ? (
        <TableSkeleton rows={4} columns={3} />
      ) : error ? (
        <div className="alert alert-danger" role="alert">{error}</div>
      ) : appointments.length === 0 ? (
        <div className="consultas-vacio">
          <h2 className="h5">{vacio.titulo}</h2>
          <p className="text-body-secondary mb-0">{vacio.texto}</p>
        </div>
      ) : (
        <>
          <h2 className="visually-hidden">Consultas</h2>
          <ul className={`consultas-lista ${loading ? 'is-cargando' : ''}`} data-tour="consultas-lista" aria-busy={loading}>
            {appointments.map((cita, i) => (
              <RenglonConsulta
                key={cita.id}
                cita={cita}
                hoy={hoy}
                primero={i === 0}
                onAbrir={abrir}
                onExpediente={expediente}
                onVerEnAgenda={verEnAgenda}
              />
            ))}
          </ul>
          {total !== null && total > 0 && (
            <nav className="consultas-paginas" aria-label="Páginas de consultas" data-tour="consultas-paginas">
              <span className="text-body-secondary small" role="status">
                Mostrando {desde} a {hasta} de {total} {total === 1 ? 'consulta' : 'consultas'}
              </span>
              <div className="consultas-paginas__controles">
                <label className="visually-hidden" htmlFor="consultas-por-pagina">Consultas por página</label>
                <CFormSelect
                  id="consultas-por-pagina"
                  size="sm"
                  className="consultas-paginas__tamano"
                  value={f.porPagina}
                  onChange={(e) => cambiar({ porPagina: Number(e.target.value) })}
                >
                  {TAMANOS_DE_PAGINA.map((n) => (
                    <option key={n} value={n}>{n} por página</option>
                  ))}
                </CFormSelect>
                <CButton
                  size="sm"
                  color="primary"
                  variant="outline"
                  disabled={loading || f.pagina <= 1}
                  onClick={() => cambiar({ pagina: f.pagina - 1 })}
                >
                  Anterior
                </CButton>
                <span className="small">Página {f.pagina} de {paginas}</span>
                <CButton
                  size="sm"
                  color="primary"
                  variant="outline"
                  disabled={loading || paginas === null || f.pagina >= paginas}
                  onClick={() => cambiar({ pagina: f.pagina + 1 })}
                >
                  Siguiente
                </CButton>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

export default DoctorAppointmentsPage
