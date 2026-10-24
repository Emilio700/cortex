/**
 * Límite de error para todo lo que pintan los avisos.
 *
 * La campana, los emergentes, la franja de críticos y el centro están en todas
 * las pantallas: un error al pintar cualquiera de ellos dejaba la aplicación
 * entera en blanco, a media consulta. Con este límite se apaga sólo esa pieza
 * y el resto sigue funcionando. Es la última red: los datos del servidor ya se
 * revisan antes de usarlos (`validar.ts`).
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  nombre: string
  children: ReactNode
  alternativa?: ReactNode
}

interface Estado {
  fallo: boolean
}

export class LimiteAvisos extends Component<Props, Estado> {
  state: Estado = { fallo: false }

  static getDerivedStateFromError(): Estado {
    return { fallo: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[avisos] ${this.props.nombre} falló al pintarse y se apagó`, error, info.componentStack)
  }

  render() {
    if (this.state.fallo) return this.props.alternativa ?? null
    return this.props.children
  }
}

/** Envuelve un componente de avisos en su propio límite de error. */
export function conLimite<P extends object>(Componente: ComponentType<P>, nombre: string, alternativa?: ReactNode) {
  const Envuelto = (props: P) => (
    <LimiteAvisos nombre={nombre} alternativa={alternativa}>
      <Componente {...props} />
    </LimiteAvisos>
  )
  Envuelto.displayName = `ConLimite(${nombre})`
  return Envuelto
}
