/**
 * Centro de avisos: panel lateral que abre la campana (plan 27, §3.3).
 *
 * Reemplaza al menú desplegable de 320 px, que mostraba los últimos 20 avisos
 * revueltos y daba todo por leído al abrirse. Aquí:
 *
 * - «Por atender»: TODO lo que sigue pidiendo algo, del más viejo al más nuevo
 *   (lo que lleva más tiempo esperando, primero), agrupado por tipo.
 * - «Todos»: el historial, con el estado de cada aviso (sin leer, leído,
 *   atendido por quién y a qué hora, descartado).
 * - «Ir» sólo si el servidor dio una pantalla que la persona puede abrir.
 * - Abrir no atiende nada. Lo que estuvo a la vista unos segundos se da por
 *   leído, que no es lo mismo.
 * - Si la última consulta falló, se dice, en vez de mostrar la foto vieja como
 *   vigente (F-7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CBadge,
  CButton,
  CCloseButton,
  CNav,
  CNavLink,
  COffcanvas,
  COffcanvasBody,
  COffcanvasHeader,
  COffcanvasTitle,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBell, cilCheckCircle, cilInfo, cilTrash, cilWarning } from '@coreui/icons'
import BotonAyudaContextual from '../tutoriales/BotonAyudaContextual'
import { formatearInstante, instanteDelServidor } from '../utils/date'
import type { Notification } from '../types/notification'
import { pideAlgo, useAvisos } from './AvisosContext'
import { etiquetaIr } from './EmergentesDeAvisos'
import PreferenciasAvisos from './PreferenciasAvisos'
import './avisos.css'
import { conLimite } from './LimiteAvisos'

/** Margen antes de dar por leído lo que quedó a la vista: rozar la campana no es leer. */
const MS_PARA_DAR_POR_LEIDO = 2000
const POR_PAGINA = 30

export const haceCuanto = (iso: string, ahora = Date.now()): string => {
  const segundos = Math.floor((ahora - instanteDelServidor(iso).getTime()) / 1000)
  if (segundos < 60) return 'hace un momento'
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

const hora = (iso: string) => formatearInstante(iso, { hour: '2-digit', minute: '2-digit' })

/** El estado del aviso en palabras: nunca sólo color (§3.8). */
export function estadoDelAviso(aviso: Notification): string {
  if (aviso.resolution === 'descartado') {
    return `Descartado${aviso.resolved_by_name ? ` por ${aviso.resolved_by_name}` : ''}${aviso.resolved_at ? ` a las ${hora(aviso.resolved_at)}` : ''}`
  }
  if (aviso.resolution === 'migracion') return 'Cerrado al estrenar el centro de avisos'
  if (aviso.resolved_at) {
    return `Atendido${aviso.resolved_by_name ? ` por ${aviso.resolved_by_name}` : ''} a las ${hora(aviso.resolved_at)}`
  }
  if (pideAlgo(aviso)) return aviso.is_read ? 'Por atender' : 'Por atender · sin leer'
  return aviso.is_read ? 'Leído' : 'Sin leer'
}

const iconoDe = (aviso: Notification) => {
  if (aviso.priority === 'urgente') return cilWarning
  if (aviso.resolved_at) return cilCheckCircle
  if (aviso.priority === 'accionable') return cilBell
  return cilInfo
}

interface FilaProps {
  aviso: Notification
  conEstado: boolean
  alIr: (aviso: Notification, ruta: string) => void
  alDescartar: (aviso: Notification) => void
  alBorrar: (aviso: Notification) => void
}

const FilaAviso = ({ aviso, conEstado, alIr, alDescartar, alBorrar }: FilaProps) => {
  const ruta = aviso.ruta ?? null
  const abierto = pideAlgo(aviso) && !aviso.resolved_at
  return (
    <li className={`centro-avisos__fila${aviso.is_read ? '' : ' centro-avisos__fila--sin-leer'}`}>
      <CIcon icon={iconoDe(aviso)} className={`centro-avisos__icono centro-avisos__icono--${aviso.priority ?? 'informativo'}`} aria-hidden="true" />
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="centro-avisos__titulo">{aviso.title}</div>
        <div className="small text-body-secondary">{aviso.message}</div>
        {aviso.de_otra_sucursal && (
          <div className="small">
            <CBadge color="secondary" className="me-1">
              {aviso.sucursal ?? 'Otra sucursal'}
            </CBadge>
            {!ruta && 'Cambia a esa sucursal (arriba a la derecha) para abrirlo.'}
          </div>
        )}
        <div className="small text-body-tertiary">
          {haceCuanto(aviso.created_at)}
          {conEstado && <> · {estadoDelAviso(aviso)}</>}
        </div>
        <div className="centro-avisos__acciones">
          {ruta && (
            <CButton color="primary" size="sm" onClick={() => alIr(aviso, ruta)}>
              {etiquetaIr(aviso)}
            </CButton>
          )}
          {abierto && (
            <CButton color="secondary" variant="outline" size="sm" onClick={() => alDescartar(aviso)} title="Ya no aplica: quitarlo de «Por atender». Queda registrado.">
              Descartar
            </CButton>
          )}
          {!pideAlgo(aviso) && (
            <CButton color="danger" variant="ghost" size="sm" onClick={() => alBorrar(aviso)} aria-label="Borrar aviso">
              <CIcon icon={cilTrash} size="sm" />
            </CButton>
          )}
        </div>
      </div>
    </li>
  )
}

/** «Por atender» agrupado por tipo, conservando el orden del más viejo al más nuevo. */
function agruparPorTipo(avisos: Notification[]): Array<{ tipo: string; titulo: string; avisos: Notification[] }> {
  const grupos = new Map<string, Notification[]>()
  for (const a of avisos) grupos.set(a.type, [...(grupos.get(a.type) ?? []), a])
  return Array.from(grupos, ([tipo, lista]) => ({ tipo, titulo: lista[0].title, avisos: lista }))
}

const CentroAvisos = () => {
  const navigate = useNavigate()
  const {
    centroAbierto,
    cerrarCentro,
    abiertos,
    porAtender,
    estado,
    fallo,
    actualizadoEn,
    cargando,
    cargarTodos,
    marcarLeidos,
    marcarTodasLeidas,
    descartar,
    borrar,
    borrarLeidas,
  } = useAvisos()

  const [pestana, setPestana] = useState<'por-atender' | 'todos'>('por-atender')
  const [todos, setTodos] = useState<Notification[]>([])
  const [totalTodos, setTotalTodos] = useState(0)
  const [cargandoTodos, setCargandoTodos] = useState(false)
  const [errorTodos, setErrorTodos] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargarTodos = useCallback(async () => {
    setCargandoTodos(true)
    setErrorTodos(false)
    try {
      const datos = await cargarTodos(0, POR_PAGINA)
      setTodos(datos.items)
      setTotalTodos(datos.total ?? datos.items.length)
    } catch {
      setErrorTodos(true)
    } finally {
      setCargandoTodos(false)
    }
  }, [cargarTodos])

  const verMas = async () => {
    setCargandoTodos(true)
    try {
      const datos = await cargarTodos(todos.length, POR_PAGINA)
      setTodos((actuales) => [...actuales, ...datos.items.filter((n) => !actuales.some((a) => a.id === n.id))])
      setTotalTodos(datos.total ?? totalTodos)
    } catch {
      setErrorTodos(true)
    } finally {
      setCargandoTodos(false)
    }
  }

  // «Todos» se pide al abrirlo y cada vez que el sondeo trae algo nuevo.
  const ultimoCambio = `${estado?.ultimo_id}-${estado?.ultima_resolucion}-${estado?.sin_leer}`
  useEffect(() => {
    if (centroAbierto && pestana === 'todos') void recargarTodos()
  }, [centroAbierto, pestana, ultimoCambio, recargarTodos])

  // Lo que estuvo a la vista unos segundos se da por leído. Leído, no atendido.
  const visibles = pestana === 'por-atender' ? abiertos : todos
  const visiblesRef = useRef(visibles)
  visiblesRef.current = visibles
  useEffect(() => {
    if (!centroAbierto) return undefined
    const t = setTimeout(() => {
      const ids = visiblesRef.current.filter((a) => !a.is_read).map((a) => a.id)
      marcarLeidos(ids).catch(() => undefined)
    }, MS_PARA_DAR_POR_LEIDO)
    return () => clearTimeout(t)
  }, [centroAbierto, pestana, marcarLeidos])

  const grupos = useMemo(() => agruparPorTipo(abiertos), [abiertos])

  const accion = async (hacer: () => Promise<void>, mensaje: string) => {
    setError(null)
    try {
      await hacer()
      if (pestana === 'todos') await recargarTodos()
    } catch {
      setError(mensaje)
    }
  }

  const alIr = (aviso: Notification, ruta: string) => {
    if (!aviso.is_read) marcarLeidos([aviso.id]).catch(() => undefined)
    cerrarCentro()
    navigate(ruta)
  }
  const alDescartar = (aviso: Notification) =>
    void accion(() => descartar(aviso.id), 'No se pudo descartar el aviso. Sigue por atender; inténtalo de nuevo.')
  const alBorrar = (aviso: Notification) =>
    void accion(() => borrar(aviso.id), 'No se pudo borrar el aviso. Inténtalo de nuevo.')

  const minutosSinActualizar = actualizadoEn ? Math.max(1, Math.round((Date.now() - actualizadoEn) / 60000)) : null
  const hayLeidasInformativas = todos.some((a) => a.is_read && !pideAlgo(a))

  return (
    <COffcanvas
      placement="end"
      visible={centroAbierto}
      onHide={cerrarCentro}
      className="centro-avisos"
      aria-labelledby="centro-avisos-titulo"
      data-tour="avisos-centro"
    >
      <COffcanvasHeader className="gap-2">
        <COffcanvasTitle id="centro-avisos-titulo">Avisos</COffcanvasTitle>
        <BotonAyudaContextual recorridoId="avisos" texto="¿Cómo funciona?" />
        <CCloseButton className="text-reset" onClick={cerrarCentro} aria-label="Cerrar avisos" />
      </COffcanvasHeader>
      <COffcanvasBody className="d-flex flex-column gap-3">
        {fallo && (
          <div className="alert alert-warning py-2 mb-0 small" role="status">
            No se pudieron actualizar los avisos
            {minutosSinActualizar ? ` (lo último que llegó es de hace ${minutosSinActualizar} min)` : ''}. Lo que ves
            puede no estar al día; se reintenta solo.
          </div>
        )}
        {error && (
          <div className="alert alert-danger py-2 mb-0 small" role="alert">
            {error}
          </div>
        )}

        <CNav variant="underline" role="tablist" data-tour="avisos-pestanas">
          <li className="nav-item" role="presentation">
            <CNavLink
              as="button"
              type="button"
              active={pestana === 'por-atender'}
              onClick={() => setPestana('por-atender')}
              role="tab"
              aria-selected={pestana === 'por-atender'}
            >
              Por atender{' '}
              {porAtender > 0 && (
                <CBadge color="danger" shape="rounded-pill">
                  {porAtender}
                </CBadge>
              )}
            </CNavLink>
          </li>
          <li className="nav-item" role="presentation">
            <CNavLink
              as="button"
              type="button"
              active={pestana === 'todos'}
              onClick={() => setPestana('todos')}
              role="tab"
              aria-selected={pestana === 'todos'}
            >
              Todos
            </CNavLink>
          </li>
        </CNav>

        {pestana === 'por-atender' ? (
          <section data-tour="avisos-por-atender" aria-label="Avisos por atender">
            {cargando && abiertos.length === 0 ? (
              <div className="text-center py-3">
                <CSpinner size="sm" />
              </div>
            ) : abiertos.length === 0 ? (
              <p className="text-body-secondary small mb-0">
                Nada por atender. Lo que te pida hacer algo —un paciente en sala, una consulta por cobrar— aparece
                aquí hasta que se resuelva.
              </p>
            ) : (
              grupos.map((grupo) => (
                <div key={grupo.tipo} className="mb-3">
                  <h6 className="small text-uppercase text-body-secondary mb-1">
                    {grupo.titulo} · {grupo.avisos.length}
                  </h6>
                  <ul className="list-unstyled mb-0">
                    {grupo.avisos.map((aviso) => (
                      <FilaAviso
                        key={aviso.id}
                        aviso={aviso}
                        conEstado={false}
                        alIr={alIr}
                        alDescartar={alDescartar}
                        alBorrar={alBorrar}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        ) : (
          <section data-tour="avisos-todos" aria-label="Todos los avisos">
            <div className="d-flex flex-wrap gap-2 mb-2">
              {(estado?.sin_leer ?? 0) > 0 && (
                <CButton
                  color="link"
                  size="sm"
                  className="p-0"
                  onClick={() => void accion(marcarTodasLeidas, 'No se pudieron marcar como leídos. Inténtalo de nuevo.')}
                >
                  Marcar todos como leídos
                </CButton>
              )}
              {hayLeidasInformativas && (
                <CButton
                  color="link"
                  size="sm"
                  className="p-0 text-danger"
                  onClick={() => void accion(borrarLeidas, 'No se pudieron borrar. Inténtalo de nuevo.')}
                >
                  Borrar los informativos leídos
                </CButton>
              )}
            </div>
            {errorTodos && (
              <div className="alert alert-warning py-2 small" role="status">
                No se pudo cargar el historial. <CButton color="link" size="sm" className="p-0 align-baseline" onClick={() => void recargarTodos()}>Reintentar</CButton>
              </div>
            )}
            {todos.length === 0 && !cargandoTodos && !errorTodos && (
              <p className="text-body-secondary small mb-0">Sin avisos.</p>
            )}
            <ul className="list-unstyled mb-0">
              {todos.map((aviso) => (
                <FilaAviso
                  key={aviso.id}
                  aviso={aviso}
                  conEstado
                  alIr={alIr}
                  alDescartar={alDescartar}
                  alBorrar={alBorrar}
                />
              ))}
            </ul>
            {cargandoTodos && (
              <div className="text-center py-2">
                <CSpinner size="sm" />
              </div>
            )}
            {!cargandoTodos && todos.length < totalTodos && (
              <CButton color="secondary" variant="outline" size="sm" className="w-100 mt-2" onClick={() => void verMas()}>
                Ver más
              </CButton>
            )}
          </section>
        )}

        <hr className="my-0" />
        <PreferenciasAvisos />
      </COffcanvasBody>
    </COffcanvas>
  )
}

export default conLimite(CentroAvisos, 'el centro de avisos')
