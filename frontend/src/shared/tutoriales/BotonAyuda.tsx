/**
 * Botón «?» del encabezado. Abre el centro de ayuda; no arranca nada por sí
 * mismo, y sin recorridos para la persona no se pinta.
 *
 * El centro se trae con `React.lazy` y se monta recién cuando se pide: quien
 * nunca abre la ayuda no descarga ni su panel ni la maquinaria de driver.js
 * que trae detrás (ver `motor.ts`). Después de la primera apertura queda
 * montado, para conservar su animación de cierre y lo que ya tenga armado.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { CButton } from '@coreui/react-pro'
import { useTutoriales } from './TutorialesContext'
import LimiteDeError from './LimiteDeError'

const CentroAyuda = lazy(() => import('./CentroAyuda'))

const Boton = () => {
  const { disponibles, centroAbierto, abrirCentro } = useTutoriales()
  const [seAbrioAlgunaVez, setSeAbrioAlgunaVez] = useState(false)

  useEffect(() => {
    if (centroAbierto) setSeAbrioAlgunaVez(true)
  }, [centroAbierto])

  if (disponibles.length === 0) return null

  return (
    <>
      <CButton
        color="link"
        className="nav-link py-0 px-2 d-flex align-items-center text-decoration-none"
        aria-label="Ayuda y tutoriales"
        title="Ayuda y tutoriales"
        aria-haspopup="dialog"
        aria-expanded={centroAbierto}
        data-tour="ayuda"
        onClick={abrirCentro}
      >
        <span
          className="rounded-circle d-inline-flex align-items-center justify-content-center fw-bold border border-2 border-primary text-primary"
          style={{ width: 32, height: 32, fontSize: '1.05rem' }}
          aria-hidden="true"
        >
          ?
        </span>
        <span className="ms-2 d-none d-md-inline small fw-semibold">Ayuda</span>
      </CButton>
      {seAbrioAlgunaVez && (
        <Suspense fallback={null}>
          <CentroAyuda />
        </Suspense>
      )}
    </>
  )
}

const BotonAyuda = () => (
  <LimiteDeError>
    <Boton />
  </LimiteDeError>
)

export default BotonAyuda
