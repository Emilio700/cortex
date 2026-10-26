/**
 * Franja del encabezado para lo que la ayuda tiene que decir sin que se lo
 * pidan: el aviso de la primera vez, el de que GEMS se actualizó (una vez por
 * usuaria y versión) y los mensajes breves de estado (un recorrido en pausa,
 * uno que se cerró porque cambió la pantalla).
 *
 * Va dentro del encabezado y ocupa su propio renglón en vez de flotar: así no
 * tapa ningún botón de la pantalla, ni en el celular. Nunca abre un recorrido;
 * como mucho ofrece abrir el centro de ayuda.
 */
import { CButton, CContainer } from '@coreui/react-pro'
import { useTutoriales } from './TutorialesContext'
import LimiteDeError from './LimiteDeError'
import { VERSION_NOVEDADES } from './novedades'
import './franja-ayuda.css'

const Franja = () => {
  const {
    aviso,
    descartarAviso,
    avisoNovedades,
    descartarAvisoNovedades,
    abrirNovedades,
    mensaje,
    descartarMensaje,
    abrirCentro,
  } = useTutoriales()

  if (!aviso && !mensaje && !avisoNovedades) return null

  const deNovedades = !mensaje && !aviso && avisoNovedades
  const texto =
    mensaje ??
    (deNovedades
      ? `Cortex se actualizó a la ${VERSION_NOVEDADES}: mira qué cambió en el ? de arriba.`
      : '¿Dudas? Aquí encuentras guías de cada pantalla.')
  const cerrar = mensaje ? descartarMensaje : deNovedades ? descartarAvisoNovedades : descartarAviso

  return (
    <div className="gems-franja-ayuda border-top" role="status" aria-live="polite">
      <CContainer
        fluid
        className="px-4 px-xl-5 py-1 d-flex align-items-center justify-content-end flex-wrap gap-2"
      >
        <span className="small">
          {texto}
          {!mensaje && (
            <span aria-hidden="true" className="ms-1">
              ↗
            </span>
          )}
        </span>
        {!mensaje && (
          <CButton
            size="sm"
            color="primary"
            variant="ghost"
            onClick={deNovedades ? abrirNovedades : abrirCentro}
          >
            {deNovedades ? 'Ver las novedades' : 'Ver la ayuda'}
          </CButton>
        )}
        <CButton
          size="sm"
          color="secondary"
          variant="ghost"
          onClick={cerrar}
          aria-label={
            mensaje
              ? 'Entendido: cerrar el mensaje'
              : deNovedades
                ? 'Entendido: cerrar el aviso de novedades'
                : 'Entendido: cerrar el aviso de ayuda'
          }
        >
          Entendido
        </CButton>
      </CContainer>
    </div>
  )
}

const FranjaAyuda = () => (
  <LimiteDeError>
    <Franja />
  </LimiteDeError>
)

export default FranjaAyuda
