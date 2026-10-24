/**
 * Franja de resultados críticos, debajo del encabezado y en cualquier pantalla
 * (plan 27, Fase 3; D-2 ajustada a la D-8 del plan 26).
 *
 * No es una notificación que alguien pueda dar por atendida: se deriva de lo
 * que el servidor tiene abierto (`GET /clinical-tracking/critical-results`) y
 * se quita SOLO cuando la incidencia se cierra, al comunicarle o entregarle el
 * resultado al paciente, o al revisarlo dentro de una consulta suya.
 *
 * - Se puede posponer 15 minutos en este equipo, no descartar. Un crítico
 *   nuevo la vuelve a mostrar aunque esté pospuesta.
 * - Si no se pudo consultar, lo dice: un fallo nunca se lee como «no hay
 *   críticos» (misma regla que `IncidenciasCriticas`).
 * - No lleva el nombre del paciente: la pantalla del médico la puede ver
 *   quien esté en el consultorio. El detalle está en la bandeja.
 * - Un renglón, también a 360 px; nada de modal ni de robar el foco.
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilWarning } from '@coreui/icons'
import { useAuth } from '../context/AuthContext'
import { pedirFiltroBandeja } from '../../modules/doctor/utils/filtroBandeja'
import { RUTA_DE_INICIO_POR_ROL } from '../utils/inicio'
import { Role } from '../types'
import { useAvisos } from './AvisosContext'
import './avisos.css'
import { conLimite } from './LimiteAvisos'

export const POSPONER_MS = 15 * 60 * 1000

interface Pospuesta {
  hasta: number
  /** Los críticos que había al posponer: uno nuevo la vuelve a mostrar. */
  ids: number[]
}

const llave = (usuarioId: number) => `gems_criticos_pospuesto_${usuarioId}`

function leerPospuesta(usuarioId: number): Pospuesta | null {
  try {
    const crudo = localStorage.getItem(llave(usuarioId))
    if (!crudo) return null
    const valor = JSON.parse(crudo) as Pospuesta
    return typeof valor?.hasta === 'number' && Array.isArray(valor?.ids) ? valor : null
  } catch {
    return null
  }
}

function guardarPospuesta(usuarioId: number, valor: Pospuesta): void {
  try {
    localStorage.setItem(llave(usuarioId), JSON.stringify(valor))
  } catch {
    /* sin localStorage, posponer dura lo que dure la pestaña */
  }
}

const FranjaCriticos = () => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { criticos, refrescar } = useAvisos()
  const [pospuesta, setPospuesta] = useState<Pospuesta | null>(() =>
    user ? leerPospuesta(user.id) : null,
  )
  const [, setAhora] = useState(Date.now())

  // Al vencer el plazo, la franja vuelve sola.
  useEffect(() => {
    if (!pospuesta) return undefined
    const falta = pospuesta.hasta - Date.now()
    if (falta <= 0) return undefined
    const t = setTimeout(() => setAhora(Date.now()), falta + 50)
    return () => clearTimeout(t)
  }, [pospuesta])

  if (!criticos || !user) return null
  // En el inicio del médico la tarjeta de incidencias críticas ya lo dice,
  // con más detalle: la franja encima repetía lo mismo (decisión del
  // coordinador, plan 29). En las demás pantallas sigue igual.
  if (pathname === RUTA_DE_INICIO_POR_ROL[Role.DOCTOR]) return null

  const ids = criticos.estado === 'ok' ? criticos.items.map((c) => c.result_id) : []
  const vigente =
    pospuesta !== null &&
    pospuesta.hasta > Date.now() &&
    ids.every((id) => pospuesta.ids.includes(id))
  if (criticos.estado === 'ok' && criticos.total === 0) return null
  if (vigente) return null

  const posponer = () => {
    const valor = { hasta: Date.now() + POSPONER_MS, ids }
    guardarPospuesta(user.id, valor)
    setPospuesta(valor)
  }

  if (criticos.estado === 'fallo') {
    return (
      <div className="franja-criticos franja-criticos--fallo" role="alert" data-testid="franja-criticos">
        <CIcon icon={cilWarning} className="flex-shrink-0" aria-hidden="true" />
        <span className="franja-criticos__texto">
          No se pudo consultar si tienes resultados críticos sin cerrar.
        </span>
        <CButton color="dark" variant="outline" size="sm" onClick={() => void refrescar()}>
          Reintentar
        </CButton>
      </div>
    )
  }

  const total = criticos.total
  return (
    <div className="franja-criticos" role="alert" data-testid="franja-criticos">
      <CIcon icon={cilWarning} className="flex-shrink-0" aria-hidden="true" />
      <span className="franja-criticos__texto">
        <b>{total === 1 ? '1 resultado crítico' : `${total} resultados críticos`} sin cerrar</b>
        <span className="franja-criticos__detalle">
          {' '}
          · Se quita al comunicárselo al paciente o al revisarlo en una consulta suya.
        </span>
      </span>
      <CButton
        color="light"
        size="sm"
        onClick={() => {
          pedirFiltroBandeja('criticos')
          navigate('/doctor/results')
        }}
      >
        Ver
      </CButton>
      <CButton
        color="light"
        variant="outline"
        size="sm"
        onClick={posponer}
        title="Ocultar 15 minutos en este equipo"
        aria-label="Posponer 15 minutos"
      >
        Posponer<span className="d-none d-sm-inline"> 15 min</span>
      </CButton>
    </div>
  )
}

export default conLimite(FranjaCriticos, 'la franja de críticos')
