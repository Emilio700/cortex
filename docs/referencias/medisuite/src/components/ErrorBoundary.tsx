// Captura errores de render de un módulo para que no tumben toda la app.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  label?: string
  resetKey?: string // al cambiar (p. ej. la ruta) se limpia el error
}
interface State {
  error: Error | null
  info: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, info: '' })
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? '' })
    console.warn('[MediSuite] Error en módulo', this.props.label ?? '', error)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    // Un módulo diferido que no se pudo descargar (nueva versión publicada o sin red)
    const chunk = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(error.message)
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-xl border border-danger/30 bg-surface p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-6 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{this.props.label ? `${this.props.label} tuvo un problema` : 'Algo salió mal'}</h2>
              <p className="mt-1 text-sm text-muted">
                {chunk
                  ? 'No se pudo cargar esta sección. Revisa tu conexión o recarga la página (puede haber una versión nueva).'
                  : 'Ocurrió un error inesperado al mostrar esta sección. Tus datos guardados no se perdieron.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong dark:text-black"
                  onClick={() => (chunk ? location.reload() : this.setState({ error: null, info: '' }))}
                >
                  <RotateCcw className="size-4" /> Reintentar
                </button>
                <button className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-surface-2" onClick={() => (location.hash = '#/')}>
                  Ir al inicio
                </button>
              </div>
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-muted">Detalles técnicos</summary>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2">
                  {error.name}: {error.message}
                  {info}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
