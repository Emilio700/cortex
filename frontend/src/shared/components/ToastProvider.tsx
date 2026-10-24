/**
 * Global toast notification system.
 *
 * Provides a `useToast()` hook so any component rendered inside the provider can
 * surface success/error feedback instead of failing silently (console.error).
 *
 * Los mensajes viven en una lista propia y no en el `push` de `CToaster`: ese
 * `push` es un solo valor, y cuando dos avisos llegaban en el mismo ciclo React
 * juntaba los cambios y sólo se veía el último (plan 27, F-2). Con la lista,
 * N llamadas producen N mensajes.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CToast, CToastBody, CToastClose, CToaster } from '@coreui/react-pro'

type ToastColor = 'success' | 'danger' | 'info' | 'warning'

interface ToastContextValue {
  showToast: (message: string, color?: ToastColor) => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
}

interface MensajeEnPantalla {
  id: number
  message: string
  color: ToastColor
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Access the toast API. Must be used within a <ToastProvider>. */
export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [mensajes, setMensajes] = useState<MensajeEnPantalla[]>([])
  const siguienteId = useRef(0)

  const showToast = useCallback((message: string, color: ToastColor = 'info') => {
    siguienteId.current += 1
    const id = siguienteId.current
    // Forma funcional: dos llamadas en el mismo ciclo ven cada una la lista
    // que dejó la anterior, y ninguna pisa a la otra.
    setMensajes((actuales) => [...actuales, { id, message, color }])
  }, [])

  const quitar = useCallback((id: number) => {
    setMensajes((actuales) => actuales.filter((m) => m.id !== id))
  }, [])

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast])
  const showError = useCallback((message: string) => showToast(message, 'danger'), [showToast])

  const valor = useMemo(() => ({ showToast, showSuccess, showError }), [showToast, showSuccess, showError])

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <CToaster placement="top-end" className="p-3">
        {mensajes.map((m) => (
          <CToast
            key={m.id}
            visible
            autohide
            delay={5000}
            color={m.color}
            className="text-white align-items-center"
            onClose={() => quitar(m.id)}
          >
            <div className="d-flex">
              <CToastBody>{m.message}</CToastBody>
              <CToastClose className="me-2 m-auto" white />
            </div>
          </CToast>
        ))}
      </CToaster>
    </ToastContext.Provider>
  )
}

export default ToastProvider
