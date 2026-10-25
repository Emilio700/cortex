// Menú «Herramientas» del encabezado del expediente: accesos a las herramientas de especialidad
// con el paciente ya activo. Sugiere las pertinentes (embarazo → control prenatal; niños → vacunación/desarrollo).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Apple, Baby, ChevronDown, ClipboardPlus, Ear, Eye, FileBadge, FlaskConical, LayoutGrid, ListTodo, Milestone, ShieldCheck, Siren, Syringe, type LucideIcon,
} from 'lucide-react'
import type { Patient } from '../../lib/types'
import { setActivePatient, useCollection } from '../../lib/store'
import { useSession } from '../../lib/session'
import { edad, cx } from '../../lib/utils'
import { Button } from '../../components/ui'
import { canOpenPath } from '../registry'

interface Herramienta {
  to: string
  label: string
  icon: LucideIcon
  sugerida?: string // motivo por el que se sugiere para este paciente
}

/** Herramientas aplicables al paciente (las sugeridas primero). Pura para poder probarla. */
export function herramientasPara(p: Pick<Patient, 'sexo' | 'fechaNac' | 'antecedentes'>, tienePrenatal: boolean, ref = new Date()): Herramienta[] {
  const { anios, meses } = edad(p.fechaNac, ref)
  const embarazo = p.sexo === 'F' && anios >= 10 && anios <= 55 && (tienePrenatal || /embaraz|gestaci|\bSDG\b|\bFUM\b/i.test(p.antecedentes ?? ''))
  const out: Herramienta[] = []
  if (p.sexo === 'F' && anios >= 10 && anios <= 55) out.push({ to: '/prenatal', label: 'Control prenatal', icon: Baby, sugerida: embarazo ? 'Embarazo' : undefined })
  out.push({ to: '/vacunacion', label: 'Vacunación', icon: Syringe, sugerida: anios < 18 ? 'Menor de edad' : anios >= 60 ? 'Adulto mayor' : undefined })
  if (meses < 72) out.push({ to: '/desarrollo', label: 'Desarrollo infantil', icon: Milestone, sugerida: 'Menor de 6 años' })
  out.push(
    { to: '/tamizajes', label: 'Prevención y tamizajes', icon: ShieldCheck },
    { to: '/triaje', label: 'Triaje', icon: Siren },
    { to: '/enfermeria', label: 'Hoja de enfermería', icon: ClipboardPlus },
    { to: '/ordenes', label: 'Órdenes de estudios', icon: FlaskConical },
    { to: '/nutricion', label: 'Nutrición', icon: Apple },
    { to: '/vision', label: 'Agudeza visual', icon: Eye },
    { to: '/audiometria', label: 'Audiometría', icon: Ear },
    { to: '/certificados', label: 'Certificados y referencias', icon: FileBadge },
    { to: '/tareas', label: 'Tareas', icon: ListTodo },
  )
  return [...out.filter((h) => h.sugerida), ...out.filter((h) => !h.sugerida)]
}

export default function HerramientasMenu({ p }: { p: Patient }) {
  const nav = useNavigate()
  const ses = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const prenatal = useCollection('registros', (r) => r.patientId === p.id && r.tipo === 'prenatal', [p.id])
  const lista = useMemo(
    () => herramientasPara(p, prenatal.length > 0).filter((h) => canOpenPath(h.to, ses.mode, ses.user)),
    [p, prenatal.length, ses.mode, ses.user],
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        ref.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Foco al primer elemento al abrir
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!lista.length) return null
  const ir = (to: string) => {
    setActivePatient(p.id)
    setOpen(false)
    nav(to)
  }
  const onMenuKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <div ref={ref} className="relative">
      <Button aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        <LayoutGrid className="size-4" /> Herramientas <ChevronDown className={cx('size-3.5 transition', open && 'rotate-180')} />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Herramientas para este paciente"
          onKeyDown={onMenuKey}
          className="fixed inset-x-4 bottom-4 z-30 max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:mt-1 sm:max-h-[70vh] sm:w-64"
        >
          {lista.map((h) => (
            <button
              key={h.to}
              role="menuitem"
              onClick={() => ir(h.to)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
            >
              <h.icon className={cx('size-4 shrink-0', h.sugerida ? 'text-brand' : 'text-muted')} aria-hidden />
              <span className="min-w-0 flex-1">{h.label}</span>
              {h.sugerida && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-strong">{h.sugerida}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
