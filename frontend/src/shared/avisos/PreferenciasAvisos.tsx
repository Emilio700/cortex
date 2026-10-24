/**
 * Preferencias de avisos, al pie del centro de avisos (plan 27, §3.7).
 *
 * Se guardan en el servidor: siguen a la persona de un equipo a otro. Todo lo
 * que hace ruido arranca apagado. Si guardar falla, el interruptor vuelve a
 * como estaba y se dice: un interruptor que se queda encendido sin que el
 * servidor lo guardara es el «interruptor que miente» que se quitó en la
 * Fase 0.
 */
import { useState } from 'react'
import { CButton, CFormCheck, CFormSwitch } from '@coreui/react-pro'
import { useAuth } from '../context/AuthContext'
import { Role } from '../types'
import type { PreferenciasAvisos as Preferencias } from '../types/notification'
import { useAvisos } from './AvisosContext'
import { tocarSonido } from './sonido'
import { pedirPermiso, permisoDelNavegador, type EstadoPermiso } from './notificacionNavegador'

/** Nombres para los tipos informativos que se pueden silenciar. */
const NOMBRES_SILENCIABLES: Record<string, string> = {
  appointment_scheduled: 'Citas que te agenda alguien más',
  appointment_today: 'Resumen de la agenda del día',
  document_uploaded: 'Documentos nuevos de tus pacientes',
  appointment_cancelled: 'Citas canceladas de otros días',
  appointment_rescheduled: 'Citas reprogramadas de otros días',
}

const PreferenciasAvisos = () => {
  const { preferencias, guardarPreferencias } = useAvisos()
  const { user } = useAuth()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permiso, setPermiso] = useState<EstadoPermiso>(permisoDelNavegador)
  const [sinSonido, setSinSonido] = useState(false)

  if (!preferencias) {
    return <p className="small text-body-secondary mb-0">No se pudieron cargar tus preferencias de avisos.</p>
  }

  const guardar = async (cambios: Partial<Preferencias>) => {
    setGuardando(true)
    setError(null)
    try {
      await guardarPreferencias(cambios)
    } catch {
      setError('No se guardó el cambio. Tus preferencias siguen como estaban; inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const probarSonido = async () => {
    setSinSonido(!(await tocarSonido('accionable')))
  }

  const alCambiarNavegador = async (encender: boolean) => {
    if (!encender) {
      await guardar({ navegador: false })
      return
    }
    // El permiso se pide sólo aquí, cuando la persona lo activa; nunca al cargar.
    const resultado = await pedirPermiso()
    setPermiso(resultado)
    if (resultado === 'granted') await guardar({ navegador: true })
  }

  const silenciables = preferencias.tipos_silenciables.filter((t) => t in NOMBRES_SILENCIABLES)
  // El recordatorio de una hora sale para el médico de la cita, que siempre
  // tiene rol de doctora; administración con permiso de ver consultas nunca lo
  // recibiría (plan 29, N-1). Los tipos que se pueden silenciar ya llegan
  // filtrados por rol desde el servidor.
  const esDoctora = user?.role === Role.DOCTOR

  return (
    <div data-tour="avisos-preferencias">
      <h6 className="mb-2">Preferencias</h6>

      <CFormSwitch
        id="avisos-sonido"
        label="Sonido al llegar un aviso que pide hacer algo"
        checked={preferencias.sonido}
        disabled={guardando}
        onChange={(e) => void guardar({ sonido: e.target.checked })}
      />
      <div className="ms-4 mb-2">
        <CButton color="link" size="sm" className="p-0" onClick={() => void probarSonido()}>
          Probar sonido
        </CButton>
        {sinSonido && (
          <div className="small text-body-secondary">
            El navegador no dejó sonar nada. Toca cualquier parte de la página y vuelve a probar.
          </div>
        )}
      </div>

      <CFormSwitch
        id="avisos-navegador"
        label="Notificación del navegador si Cortex está en otra pestaña"
        checked={preferencias.navegador && permiso === 'granted'}
        disabled={guardando || permiso === 'no-disponible'}
        onChange={(e) => void alCambiarNavegador(e.target.checked)}
      />
      <div className="ms-4 mb-2 small text-body-secondary">
        {permiso === 'no-disponible' && 'Este navegador no ofrece notificaciones.'}
        {permiso === 'denied' &&
          'El navegador las tiene bloqueadas para Cortex. Para activarlas, permite las notificaciones de este sitio en la configuración del navegador (el candado junto a la dirección).'}
        {permiso !== 'no-disponible' && permiso !== 'denied' && 'No dicen el nombre del paciente; lo ves al abrir el aviso.'}
      </div>

      {esDoctora && (
        <CFormSwitch
          id="avisos-recordatorio"
          className="mb-2"
          label="Recordarme cada cita una hora antes"
          checked={preferencias.recordatorio_una_hora}
          disabled={guardando}
          onChange={(e) => void guardar({ recordatorio_una_hora: e.target.checked })}
        />
      )}

      {silenciables.length > 0 && (
        <fieldset className="mt-2">
          <legend className="small fw-semibold mb-1" style={{ fontSize: '0.875rem' }}>
            Avisos que sólo informan: ¿cuáles quieres recibir?
          </legend>
          {silenciables.map((tipo) => (
            <CFormCheck
              key={tipo}
              id={`avisos-tipo-${tipo}`}
              label={NOMBRES_SILENCIABLES[tipo]}
              checked={!preferencias.tipos_silenciados.includes(tipo)}
              disabled={guardando}
              onChange={(e) => {
                const silenciados = new Set(preferencias.tipos_silenciados)
                if (e.target.checked) silenciados.delete(tipo)
                else silenciados.add(tipo)
                void guardar({ tipos_silenciados: Array.from(silenciados) })
              }}
            />
          ))}
          <div className="small text-body-secondary mt-1">
            Lo que te pide hacer algo (un paciente en sala, una consulta por cobrar) siempre llega.
          </div>
        </fieldset>
      )}

      {error && (
        <div className="small text-danger mt-2" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}

export default PreferenciasAvisos
