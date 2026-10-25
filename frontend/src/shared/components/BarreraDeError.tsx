/**
 * Barrera de error de una pantalla.
 *
 * Sin esto, cualquier fallo al dibujar una pantalla —o una pestaña que no se
 * pudo descargar después de un despliegue— deja el sitio en blanco y el médico
 * sin expediente. Con la barrera, el menú y las demás pestañas siguen vivos y
 * lo único que se pierde es la pantalla que falló.
 *
 * No muestra datos del paciente: solo el mensaje del error, que sirve para
 * soporte.
 */
import React from 'react'
import { CAlert, CButton } from '@coreui/react-pro'

interface Props {
  children: React.ReactNode
  /** Qué se rompió, dicho en palabras del consultorio. */
  mensaje?: string
  /** A dónde puede irse mientras tanto. */
  respaldo?: { etiqueta: string; ruta: string }
}

interface State {
  error: Error | null
}

export default class BarreraDeError extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Sin datos clínicos en el registro: mensaje y componente, nada más.
    console.error('Pantalla con error:', error.message, info.componentStack)
  }

  private irA = (ruta: string) => {
    window.location.hash = `#${ruta}`
  }

  render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="p-3" data-tour="error-pantalla">
        <CAlert color="danger" className="mb-0">
          <h3 className="h6 mb-2">No se pudo mostrar esta pantalla</h3>
          <p className="mb-2">
            {this.props.mensaje ??
              'El resto del sistema sigue funcionando: lo que ya estaba guardado no se perdió y puedes seguir en otra pestaña.'}
          </p>
          <div className="d-flex gap-2 flex-wrap">
            <CButton size="sm" color="danger" onClick={() => window.location.reload()}>
              Recargar la página
            </CButton>
            {this.props.respaldo && (
              <CButton
                size="sm"
                color="secondary"
                variant="outline"
                onClick={() => this.irA(this.props.respaldo!.ruta)}
              >
                {this.props.respaldo.etiqueta}
              </CButton>
            )}
            <CButton
              size="sm"
              color="secondary"
              variant="ghost"
              onClick={() => this.setState({ error: null })}
            >
              Volver a intentar
            </CButton>
          </div>
          <details className="mt-2">
            <summary className="small">Detalle técnico para soporte</summary>
            <pre className="small mb-0 mt-1" style={{ whiteSpace: 'pre-wrap' }}>
              {error.message}
            </pre>
          </details>
        </CAlert>
      </div>
    )
  }
}
