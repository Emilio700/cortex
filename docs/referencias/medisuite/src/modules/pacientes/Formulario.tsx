import { useState, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, X } from 'lucide-react'
import type { Patient } from '../../lib/types'
import { add, getDB, setActivePatient, update } from '../../lib/store'
import { cx } from '../../lib/utils'
import { useCan } from '../../lib/session'
import { Button, Card, Field, Input, Notice, Page, Select, Textarea } from '../../components/ui'

const ESTADOS_CURP = 'AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE'
export const CURP_RE = new RegExp(`^[A-Z][AEIOUX][A-Z]{2}\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])[HMX](${ESTADOS_CURP})[B-DF-HJ-NP-TV-Z]{3}[A-Z\\d]\\d$`)

/** Fecha de nacimiento y sexo codificados en la CURP */
export function datosCurp(curp: string): { fechaNac: string; sexo: Patient['sexo'] } | null {
  if (!CURP_RE.test(curp)) return null
  const yy = curp.slice(4, 6)
  const siglo = /\d/.test(curp[16]) ? '19' : '20'
  return { fechaNac: `${siglo}${yy}-${curp.slice(6, 8)}-${curp.slice(8, 10)}`, sexo: curp[10] === 'H' ? 'M' : curp[10] === 'M' ? 'F' : 'O' }
}

const vacio = (): Omit<Patient, 'id' | 'creado'> => ({
  nombre: '', apellidos: '', sexo: 'F', fechaNac: '', curp: '', telefono: '', email: '', tipoSangre: '', alergias: [], antecedentes: '', medicamentosActuales: [], notas: '',
})

export default function Formulario() {
  const { id } = useParams()
  const nav = useNavigate()
  const original = id ? getDB().patients.find((p) => p.id === id) : undefined
  const [f, setF] = useState(() => (original ? { ...vacio(), ...original } : vacio()))
  const [intento, setIntento] = useState(false)
  const clinico = useCan('pacientes.clinico') // recepción: el servidor omite e ignora antecedentes, notas y medicamentos
  const set = (patch: Partial<Patient>) => setF((x) => ({ ...x, ...patch }))

  if (id && !original) return <Page title="Paciente no encontrado"><Notice tone="warn">El paciente no existe.</Notice></Page>

  const curp = (f.curp ?? '').toUpperCase().trim()
  const curpOk = !curp || CURP_RE.test(curp)
  const dc = curp ? datosCurp(curp) : null
  const curpDiscrepa = dc && f.fechaNac && (dc.fechaNac !== f.fechaNac || dc.sexo !== f.sexo)
  const emailOk = !f.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)
  const errores = {
    nombre: !f.nombre.trim() && 'Requerido',
    apellidos: !f.apellidos.trim() && 'Requerido',
    fechaNac: (!f.fechaNac && 'Requerida') || (f.fechaNac > new Date().toISOString().slice(0, 10) && 'No puede ser futura'),
    curp: !curpOk && 'Formato de CURP inválido (18 caracteres, ej. LORM680314MDFPMR09)',
    email: !emailOk && 'Correo inválido',
  }
  const valido = !Object.values(errores).some(Boolean)

  const guardar = () => {
    setIntento(true)
    if (!valido) return
    const data = {
      ...f,
      nombre: f.nombre.trim(),
      apellidos: f.apellidos.trim(),
      curp: curp || undefined,
      telefono: f.telefono?.trim() || undefined,
      email: f.email?.trim() || undefined,
      tipoSangre: f.tipoSangre || undefined,
    }
    if (original) {
      update('patients', original.id, data)
      nav('/pacientes/' + original.id, { replace: true })
    } else {
      // add() pone id y fecha; Patient usa "creado"
      const p = add('patients', { ...data, creado: new Date().toISOString() } as Omit<Patient, 'id'>)
      setActivePatient(p.id)
      nav('/pacientes/' + p.id, { replace: true })
    }
  }

  const err = (k: keyof typeof errores) => intento && errores[k] ? <span className="text-danger">{errores[k]}</span> : undefined

  return (
    <Page
      title={original ? 'Editar paciente' : 'Nuevo paciente'}
      actions={
        <>
          <Button onClick={() => nav(-1)}>Cancelar</Button>
          <Button variant="primary" onClick={guardar}>
            <Save className="size-4" /> Guardar
          </Button>
        </>
      }
    >
      {intento && !valido && <Notice tone="danger">Revisa los campos marcados.</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Identificación">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre(s) *" hint={err('nombre')}>
              <Input value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} autoFocus />
            </Field>
            <Field label="Apellidos *" hint={err('apellidos')}>
              <Input value={f.apellidos} onChange={(e) => set({ apellidos: e.target.value })} />
            </Field>
            <Field
              label="CURP"
              className="sm:col-span-2"
              hint={
                (curp && !curpOk && <span className="text-danger">Formato de CURP inválido (18 caracteres, ej. LORM680314MDFPMR09)</span>) ||
                (curpDiscrepa && <span className="text-warn">La fecha de nacimiento o el sexo no coinciden con la CURP.</span>) ||
                (curp && curpOk && <span className="text-ok">Formato válido</span>)
              }
            >
              <Input
                value={curp}
                maxLength={18}
                className={cx('font-mono uppercase', curp && !curpOk && 'border-danger')}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  const d = datosCurp(v)
                  // si aún no hay fecha, la tomamos de la CURP
                  set(d && !f.fechaNac ? { curp: v, ...d } : { curp: v })
                }}
                placeholder="18 caracteres"
              />
            </Field>
            <Field label="Fecha de nacimiento *" hint={err('fechaNac')}>
              <Input type="date" value={f.fechaNac} onChange={(e) => set({ fechaNac: e.target.value })} />
            </Field>
            <Field label="Sexo">
              <Select value={f.sexo} onChange={(e) => set({ sexo: e.target.value as Patient['sexo'] })}>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="O">Otro</option>
              </Select>
            </Field>
            <Field label="Teléfono (celular, 10 dígitos)">
              <Input type="tel" value={f.telefono} onChange={(e) => set({ telefono: e.target.value })} placeholder="55 1234 5678" />
            </Field>
            <Field label="Correo electrónico" hint={err('email')}>
              <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Tipo de sangre">
              <Select value={f.tipoSangre} onChange={(e) => set({ tipoSangre: e.target.value })}>
                <option value="">Desconocido</option>
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card title="Datos clínicos">
          <div className="space-y-3">
            <Field label="Alergias" hint="Escribe y presiona Enter o coma. Déjalo vacío si niega alergias.">
              <TagInput value={f.alergias} onChange={(alergias) => set({ alergias })} tone="danger" placeholder="Ej. Penicilina" />
            </Field>
            {clinico && (<>
            <Field label="Medicamentos actuales" hint="Uno por etiqueta, con dosis si es posible.">
              <TagInput value={f.medicamentosActuales ?? []} onChange={(medicamentosActuales) => set({ medicamentosActuales })} placeholder="Ej. Metformina 850 mg c/12 h" />
            </Field>
            <Field label="Antecedentes (patológicos, quirúrgicos, familiares, gineco-obstétricos)">
              <Textarea value={f.antecedentes} onChange={(e) => set({ antecedentes: e.target.value })} className="min-h-28" />
            </Field>
            <Field label="Notas administrativas">
              <Textarea value={f.notas} onChange={(e) => set({ notas: e.target.value })} className="min-h-16" />
            </Field>
            </>)}
          </div>
        </Card>
      </div>
    </Page>
  )
}

export function TagInput({ value, onChange, placeholder, tone }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; tone?: 'danger' }) {
  const [txt, setTxt] = useState('')
  const agregar = () => {
    const t = txt.trim().replace(/,$/, '').trim()
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setTxt('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      agregar()
    } else if (e.key === 'Backspace' && !txt && value.length) onChange(value.slice(0, -1))
  }
  return (
    <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
      {value.map((v) => (
        <span
          key={v}
          className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-brand-soft text-brand-strong')}
        >
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Quitar ${v}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={onKey}
        onBlur={agregar}
        placeholder={value.length ? '' : placeholder}
        className="min-w-32 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  )
}
