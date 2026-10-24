/**
 * Límite de error para todo lo que pinta la ayuda.
 *
 * Si algo de la ayuda falla al pintarse (un recorrido mal escrito, un dato
 * inesperado), se apaga sólo la ayuda: el encabezado, la consulta y lo que se
 * estaba capturando siguen funcionando. De paso se cierra cualquier recorrido
 * abierto para que no quede el fondo oscurecido.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { detenerRecorrido, limpiarRestos } from './motor'

interface Props {
  children: ReactNode
  /** Qué mostrar en lugar de la ayuda. Por omisión, nada. */
  alternativa?: ReactNode
}

interface Estado {
  fallo: boolean
}

export default class LimiteDeError extends Component<Props, Estado> {
  state: Estado = { fallo: false }

  static getDerivedStateFromError(): Estado {
    return { fallo: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[tutoriales] la ayuda falló al pintarse y se apagó', error, info.componentStack)
    try {
      detenerRecorrido()
    } finally {
      limpiarRestos()
    }
  }

  render() {
    if (this.state.fallo) return this.props.alternativa ?? null
    return this.props.children
  }
}
