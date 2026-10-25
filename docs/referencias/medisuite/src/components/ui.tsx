// Componentes de interfaz compartidos. Úsalos en todos los módulos para un look consistente.
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cx, iniciales, nombreCompleto, edad } from '../lib/utils'
import { useActivePatient, useCollection } from '../lib/store'
import { AlertTriangle, Info, X } from 'lucide-react'

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-xl border border-line bg-surface shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-strong dark:text-black',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-surface-2',
        variant === 'ghost' && 'hover:bg-surface-2',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90 dark:text-black',
        className,
      )}
    />
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20'
export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, p.className)} />
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, 'min-h-20', p.className)} />
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, p.className)} />
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-surface-2 text-muted',
        tone === 'brand' && 'bg-brand-soft text-brand-strong',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'danger' && 'bg-danger/15 text-danger',
      )}
    >
      {children}
    </span>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular-nums', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx('-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium', value === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Notice({ tone = 'info', children, onClose }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; onClose?: () => void }) {
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div
      className={cx(
        'mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        tone === 'info' && 'border-brand/30 bg-brand-soft/50',
        tone === 'warn' && 'border-warn/30 bg-warn/10',
        tone === 'danger' && 'border-danger/30 bg-danger/10',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="Cerrar">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>
}

export function Avatar({ p, size = 36 }: { p: { nombre: string; apellidos: string; sexo?: string }; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand-strong"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {iniciales(p)}
    </div>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary'

/**
 * Comportamiento accesible de un diálogo: foco inicial dentro, Tab atrapado, Escape cierra y,
 * al cerrar, el foco vuelve al elemento que lo abrió.
 */
export function useDialog(open: boolean, onClose: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onClose)
  cerrar.current = onClose
  useEffect(() => {
    if (!open) return
    const previo = document.activeElement as HTMLElement | null
    const el = ref.current
    // foco inicial: el elemento con autoFocus, si no el primer campo, si no el diálogo
    const t = setTimeout(() => {
      if (!el || el.contains(document.activeElement)) return
      const campo = el.querySelector<HTMLElement>('[autofocus], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')
      ;(campo ?? el).focus()
    }, 0)
    const onKey = (e: KeyboardEvent) => {
      if (!el) return
      if (e.key === 'Escape') {
        // solo el diálogo de más arriba
        const abiertos = document.querySelectorAll('[aria-modal="true"]')
        if (abiertos[abiertos.length - 1] !== el) return
        e.stopPropagation()
        cerrar.current()
        return
      }
      if (e.key !== 'Tab') return
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement)
      if (!f.length) return e.preventDefault()
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      if (previo && document.contains(previo)) previo.focus()
    }
  }, [open])
  return ref
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useDialog(open, onClose)
  const id = useId()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={cx('max-h-[90vh] w-full overflow-auto rounded-xl bg-surface shadow-xl outline-none', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-0.5 text-muted hover:text-ink">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

/** Selector del paciente activo. Las herramientas guardan sus resultados en este paciente. */
export function PatientPicker({ compact }: { compact?: boolean }) {
  const { id, setActive } = useActivePatient()
  const patients = useCollection('patients')
  return (
    <Select value={id ?? ''} onChange={(e) => setActive(e.target.value || null)} className={compact ? 'h-9 py-1' : ''} aria-label="Paciente activo">
      {patients.map((p) => (
        <option key={p.id} value={p.id}>
          {nombreCompleto(p)} · {edad(p.fechaNac).texto}
        </option>
      ))}
    </Select>
  )
}

/** Barra con el paciente activo; útil al inicio de cada herramienta que guarda datos. */
export function PatientBar() {
  const { patient } = useActivePatient()
  if (!patient) return <Notice tone="warn">Selecciona un paciente para guardar resultados.</Notice>
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <Avatar p={patient} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{nombreCompleto(patient)}</div>
        <div className="text-xs text-muted">
          {edad(patient.fechaNac).texto} · {patient.sexo === 'F' ? 'Femenino' : patient.sexo === 'M' ? 'Masculino' : 'Otro'}
          {patient.alergias.length > 0 && <span className="ml-2 font-medium text-danger">Alergias: {patient.alergias.join(', ')}</span>}
        </div>
      </div>
      <div className="w-full sm:w-72">
        <PatientPicker compact />
      </div>
    </div>
  )
}

/** Mensaje estándar cuando el navegador no soporta una API (Bluetooth, cámara, etc.) */
export function Unsupported({ api, children }: { api: string; children?: ReactNode }) {
  return (
    <Notice tone="warn">
      <b>{api}</b> no está disponible en este navegador o en este contexto. {children ?? 'Ábrelo en Chrome o Edge (PC o Android) desde tu propio dominio con HTTPS.'}
    </Notice>
  )
}

export function useToggle(init = false) {
  const [v, set] = useState(init)
  return [v, () => set((x) => !x), set] as const
}

export function Disclaimer({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-3 text-xs text-muted">
      {children ?? 'Herramienta de apoyo. No sustituye el juicio clínico; la interpretación y decisión final corresponden al médico.'}
    </p>
  )
}
