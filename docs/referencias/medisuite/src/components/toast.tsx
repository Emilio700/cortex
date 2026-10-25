// Avisos flotantes (toasts). `toast()` se puede llamar desde cualquier lugar (también desde lib/store).
// Montar <Toaster /> una vez en la app.
import { useSyncExternalStore } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cx } from '../lib/utils'

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger'
interface ToastItem {
  id: number
  tone: ToastTone
  text: string
  title?: string
  action?: { label: string; onClick: () => void }
}

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

/** Muestra un aviso. Los repetidos (mismo texto) no se apilan. */
export function toast(text: string, tone: ToastTone = 'info', opts: { title?: string; ms?: number; action?: { label: string; onClick: () => void } } = {}) {
  const dup = items.find((t) => t.text === text && t.tone === tone)
  if (dup) dismissToast(dup.id)
  const id = ++seq
  items = [...items.slice(-3), { id, tone, text, title: opts.title, action: opts.action }]
  emit()
  const ms = opts.ms ?? (tone === 'danger' || tone === 'warn' ? 7000 : 3500)
  if (ms > 0) setTimeout(() => dismissToast(id), ms)
  return id
}

const ICON = { info: Info, ok: CheckCircle2, warn: AlertTriangle, danger: XCircle }

export function Toaster() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => items,
  )
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-3 sm:items-end sm:p-4" aria-live="polite" role="status">
      {list.map((t) => {
        const Icon = ICON[t.tone]
        return (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border bg-surface px-3 py-2.5 text-sm shadow-lg',
              t.tone === 'info' && 'border-brand/40',
              t.tone === 'ok' && 'border-ok/50',
              t.tone === 'warn' && 'border-warn/50',
              t.tone === 'danger' && 'border-danger/50',
            )}
          >
            <Icon className={cx('mt-0.5 size-4 shrink-0', t.tone === 'info' && 'text-brand', t.tone === 'ok' && 'text-ok', t.tone === 'warn' && 'text-warn', t.tone === 'danger' && 'text-danger')} />
            <div className="min-w-0 flex-1">
              {t.title && <div className="font-medium">{t.title}</div>}
              <div className={cx('break-words', t.title && 'text-muted')}>{t.text}</div>
              {t.action && (
                <button
                  className="mt-1.5 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-strong dark:text-black"
                  onClick={() => {
                    t.action!.onClick()
                    dismissToast(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismissToast(t.id)} aria-label="Cerrar aviso" className="text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
