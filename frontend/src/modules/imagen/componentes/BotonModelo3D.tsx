/**
 * «Generar modelo 3D» en el visor de una TC o RM (feat/modelo-3d-desde-tc).
 *
 * Manda la serie que se está viendo al segmentador y dice en qué va, **sólo con
 * lo que confirma el servidor**: «Procesando…» mientras la fila esté pendiente o
 * en proceso, «Listo» cuando el servidor la dio por lista (con el enlace a Neuro
 * 3D) y «No se pudo: motivo» si falló. Nunca dice «listo» por haber mandado la
 * petición: la segmentación tarda minutos y puede fallar.
 *
 * Mientras está en curso, consulta el estado cada pocos segundos y deja de
 * hacerlo al salir de la pantalla o al cambiar de serie.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CBadge, CButton, CSpinner } from '@coreui/react-pro'

import type { Modelo3D } from '../../neuro3d/dominio/modeloPaciente'
import { pedirModelo } from '../../neuro3d/servicios/modeloPedido'
import { modelo3dApi } from '../servicios/estudiosApi'
import { mensajeDeFallo } from '../servicios/mensajes'

export const INTERVALO_DE_CONSULTA_MS = 5000

interface Props {
  patientId: number | string
  estudioId: number | string
  serieId: number
  /** Permiso `neuro3d.generar_modelo`. Sin él sólo se ve el estado. */
  puedeGenerar: boolean
}

type Vista =
  | { tipo: 'consultando' }
  | { tipo: 'sin-modelo' }
  | { tipo: 'modelo'; modelo: Modelo3D }
  | { tipo: 'error'; texto: string }

const enCurso = (m: Modelo3D) => m.estado === 'pendiente' || m.estado === 'procesando'

export default function BotonModelo3D({ patientId, estudioId, serieId, puedeGenerar }: Props) {
  const [vista, setVista] = useState<Vista>({ tipo: 'consultando' })
  const [enviando, setEnviando] = useState(false)
  const vigente = useRef(true)

  const consultar = useCallback(async () => {
    try {
      const modelo = await modelo3dApi.estado(estudioId, serieId)
      if (!vigente.current) return
      setVista(modelo ? { tipo: 'modelo', modelo } : { tipo: 'sin-modelo' })
    } catch (err) {
      if (vigente.current) setVista({ tipo: 'error', texto: `No se pudo consultar el modelo 3D: ${mensajeDeFallo(err)}` })
    }
  }, [estudioId, serieId])

  useEffect(() => {
    vigente.current = true
    setVista({ tipo: 'consultando' })
    void consultar()
    return () => {
      vigente.current = false
    }
  }, [consultar])

  const procesando = vista.tipo === 'modelo' && enCurso(vista.modelo)
  useEffect(() => {
    if (!procesando) return
    const id = window.setInterval(() => void consultar(), INTERVALO_DE_CONSULTA_MS)
    return () => window.clearInterval(id)
  }, [procesando, consultar])

  const generar = async () => {
    setEnviando(true)
    try {
      const modelo = await modelo3dApi.generar(estudioId, serieId)
      if (vigente.current) setVista({ tipo: 'modelo', modelo })
    } catch (err) {
      if (vigente.current) setVista({ tipo: 'error', texto: `No se pudo: ${mensajeDeFallo(err)}` })
    } finally {
      if (vigente.current) setEnviando(false)
    }
  }

  const botonGenerar = (texto: string) =>
    puedeGenerar ? (
      <CButton
        size="sm"
        color="primary"
        variant="outline"
        disabled={enviando}
        onClick={() => void generar()}
        title="Arma la columna 3D del paciente desde esta serie con un segmentador automático. Tarda unos minutos."
      >
        {enviando ? 'Enviando…' : texto}
      </CButton>
    ) : null

  let contenido: ReactNode = null
  if (vista.tipo === 'sin-modelo') {
    contenido = botonGenerar('Generar modelo 3D')
  } else if (vista.tipo === 'error') {
    contenido = (
      <>
        <span className="visor-modelo3d__texto visor-modelo3d__texto--error" role="alert">
          {vista.texto}
        </span>
        {botonGenerar('Intentar de nuevo')}
      </>
    )
  } else if (vista.tipo === 'modelo') {
    const m = vista.modelo
    if (enCurso(m)) {
      contenido = (
        <div className="visor-modelo3d__texto" role="status">
          <CSpinner size="sm" className="me-2" />
          Procesando el modelo 3D… puede tardar varios minutos.
        </div>
      )
    } else if (m.estado === 'listo') {
      contenido = (
        <>
          <CBadge color="success">Modelo 3D listo{m.sintetico ? ' (sintético, de prueba)' : ''}</CBadge>
          <Link
            className="btn btn-sm btn-primary"
            to={`/pacientes/${patientId}/neuro-3d?modelo=${m.id}`}
            onClick={() => pedirModelo(m.id)}
          >
            Ver en Neuro 3D
          </Link>
        </>
      )
    } else {
      contenido = (
        <>
          <span className="visor-modelo3d__texto visor-modelo3d__texto--error" role="alert">
            No se pudo: {m.motivo_fallo ?? 'el segmentador no dio motivo.'}
          </span>
          {botonGenerar('Intentar de nuevo')}
        </>
      )
    }
  }

  if (!contenido) return null
  return (
    <div className="visor-modelo3d" data-tour="visor-modelo-3d">
      {contenido}
    </div>
  )
}
