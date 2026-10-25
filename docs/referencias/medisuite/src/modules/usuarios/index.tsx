// Usuarios (solo administrador, modo servidor): alta, rol, activo, perfil profesional y restablecer contraseña.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { KeyRound, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, UserPlus, Wand2 } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Input, Modal, Notice, Page, Select } from '../../components/ui'
import { RolBadge } from '../../components/auth'
import { toast } from '../../components/toast'
import { api, errorMessage } from '../../lib/api'
import { ROL_LABEL, useSession } from '../../lib/session'
import type { Rol, User } from '../../lib/types'
import { cx } from '../../lib/utils'

const ROLES: Rol[] = ['admin', 'medico', 'enfermeria', 'recepcion']
const ROL_AYUDA: Record<Rol, string> = {
  admin: 'Usuarios, bitácora, configuración, caja; lectura del expediente clínico.',
  medico: 'Expediente completo, notas (firma), recetas, observaciones; caja en lectura.',
  enfermeria: 'Signos y observaciones; lectura de notas y recetas. Sin caja.',
  recepcion: 'Pacientes (datos generales), agenda, caja, consentimientos y facturas. Sin expediente clínico.',
}

type Form = {
  email: string
  nombre: string
  rol: Rol
  activo: boolean
  password: string
  especialidad: string
  cedula: string
  cedulaEspecialidad: string
  universidad: string
  direccion: string
  telefono: string
  rfc: string
}
const vacio = (): Form => ({ email: '', nombre: '', rol: 'medico', activo: true, password: '', especialidad: '', cedula: '', cedulaEspecialidad: '', universidad: '', direccion: '', telefono: '', rfc: '' })

function generarPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const a = new Uint32Array(14)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => abc[n % abc.length]).join('')
}

export default function Usuarios() {
  const { user: yo } = useSession()
  const [users, setUsers] = useState<User[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filtroRol, setFiltroRol] = useState<Rol | ''>('')
  const [editar, setEditar] = useState<User | 'nuevo' | null>(null)

  const cargar = useCallback(async () => {
    setErr('')
    try {
      setUsers(await api<User[]>('/users'))
    } catch (e) {
      setErr(errorMessage(e))
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  const lista = useMemo(() => {
    const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return (users ?? [])
      .filter((u) => (!filtroRol || u.rol === filtroRol) && n(u.nombre + ' ' + u.email).includes(n(q)))
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre))
  }, [users, q, filtroRol])
  const adminsActivos = (users ?? []).filter((u) => u.rol === 'admin' && u.activo).length

  return (
    <Page
      title="Usuarios"
      subtitle="Cuentas del personal de la clínica y su rol"
      actions={
        <>
          <Button onClick={cargar} aria-label="Actualizar">
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="primary" onClick={() => setEditar('nuevo')}>
            <UserPlus className="size-4" /> Nuevo usuario
          </Button>
        </>
      }
    >
      {err && <Notice tone="danger">{err}</Notice>}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-0 flex-1 basis-48">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" className="pl-8" />
          </div>
          <div className="w-full sm:w-52">
          <Select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as Rol | '')} aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </Select>
          </div>
        </div>
        {users === null && !err ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Cargando usuarios…
          </div>
        ) : lista.length === 0 ? (
          <div className="p-4">
            <Empty>Sin usuarios que coincidan.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((u) => (
              <li key={u.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-3', !u.activo && 'opacity-60')}>
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
                  {u.nombre
                    .replace(/^(dr|dra|lic|enf)\.?\s+/i, '')
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('')}
                </div>
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium">{u.nombre}</span>
                    {u.id === yo?.id && <Badge tone="brand">Tú</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {u.email}
                    {u.rol === 'medico' && u.cedula ? ` · Céd. ${u.cedula}` : ''}
                    {u.especialidad ? ` · ${u.especialidad}` : ''}
                  </div>
                </div>
                <div className="ml-12 flex flex-wrap items-center gap-1.5 sm:ml-0">
                  <RolBadge rol={u.rol} />
                  {u.activo ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}
                  {u.totp && (
                    <Badge tone="brand">
                      <ShieldCheck className="mr-1 size-3" /> 2FA
                    </Badge>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditar(u)} aria-label={`Editar ${u.nombre}`}>
                  <Pencil className="size-4" /> Editar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Por seguridad no puedes desactivarte a ti mismo ni quitar el último administrador activo. Las contraseñas deben tener al menos 10 caracteres; pide a cada persona que la cambie
        al entrar y que active la verificación en dos pasos.
      </p>
      {editar && (
        <UsuarioModal
          user={editar === 'nuevo' ? null : editar}
          yo={yo}
          adminsActivos={adminsActivos}
          onClose={() => setEditar(null)}
          onSaved={(u) => {
            setUsers((arr) => {
              const a = arr ?? []
              return a.some((x) => x.id === u.id) ? a.map((x) => (x.id === u.id ? u : x)) : [...a, u]
            })
            setEditar(null)
          }}
        />
      )}
    </Page>
  )
}

function UsuarioModal({ user, yo, adminsActivos, onClose, onSaved }: { user: User | null; yo: User | null; adminsActivos: number; onClose: () => void; onSaved: (u: User) => void }) {
  const nuevo = !user
  const [f, setF] = useState<Form>(() => (user ? { ...vacio(), ...user, password: '', especialidad: user.especialidad ?? '', cedula: user.cedula ?? '', cedulaEspecialidad: user.cedulaEspecialidad ?? '', universidad: user.universidad ?? '', direccion: user.direccion ?? '', telefono: user.telefono ?? '', rfc: user.rfc ?? '' } : vacio()))
  const [resetPass, setResetPass] = useState(false)
  const [reset2fa, setReset2fa] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }))
  const esYo = !!user && user.id === yo?.id
  const ultimoAdmin = !!user && user.rol === 'admin' && user.activo && adminsActivos <= 1

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!f.nombre.trim()) return setErr('Escribe el nombre.')
    if (nuevo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr('Correo inválido.')
    if ((nuevo || resetPass) && f.password.length < 10) return setErr('La contraseña debe tener al menos 10 caracteres.')
    if (esYo && !f.activo) return setErr('No puedes desactivar tu propia cuenta.')
    if (ultimoAdmin && (f.rol !== 'admin' || !f.activo)) return setErr('Debe quedar al menos un administrador activo.')
    if (f.rol === 'medico' && f.rfc.trim() && !/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(f.rfc.trim().toUpperCase())) return setErr('El RFC no tiene un formato válido.')
    // Al editar, un campo vaciado se envía como null (el servidor lo quita); uno que ya estaba vacío no se envía
    const campo = (k: 'especialidad' | 'cedula' | 'cedulaEspecialidad' | 'universidad' | 'direccion' | 'telefono' | 'rfc') => {
      const v = k === 'rfc' ? f[k].trim().toUpperCase() : f[k].trim()
      return v || (!nuevo && user?.[k] ? null : undefined)
    }
    const perfil =
      f.rol === 'medico'
        ? Object.fromEntries(
            (['especialidad', 'cedula', 'cedulaEspecialidad', 'universidad', 'direccion', 'telefono', 'rfc'] as const).map((k) => [k, campo(k)]).filter(([, v]) => v !== undefined),
          )
        : {}
    setBusy(true)
    try {
      let u: User
      if (nuevo) u = await api<User>('/users', { method: 'POST', body: { email: f.email.trim().toLowerCase(), nombre: f.nombre.trim(), rol: f.rol, password: f.password, ...perfil } })
      else {
        const body: Record<string, unknown> = { nombre: f.nombre.trim(), ...perfil }
        if (f.rol !== user!.rol) body.rol = f.rol
        if (f.activo !== user!.activo) body.activo = f.activo
        if (resetPass) body.password = f.password
        if (reset2fa) body.totp = false
        u = await api<User>(`/users/${encodeURIComponent(user!.id)}`, { method: 'PATCH', body })
      }
      toast(nuevo ? `Usuario ${u.nombre} creado.` : resetPass ? 'Usuario actualizado y contraseña restablecida.' : 'Usuario actualizado.', 'ok')
      onSaved(u ?? { ...user!, ...f })
    } catch (ex) {
      setErr(errorMessage(ex))
    } finally {
      setBusy(false)
    }
  }

  const passField = (
    <Field label={nuevo ? 'Contraseña inicial' : 'Nueva contraseña'} hint="Mínimo 10 caracteres. Compártela por un medio seguro.">
      <div className="flex gap-2">
        <Input value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" className="font-mono" minLength={10} required />
        <Button type="button" onClick={() => set({ password: generarPassword() })} aria-label="Generar contraseña" title="Generar contraseña segura">
          <Wand2 className="size-4" />
        </Button>
      </div>
    </Field>
  )

  return (
    <Modal open onClose={onClose} title={nuevo ? 'Nuevo usuario' : `Editar · ${user!.nombre}`}>
      <form onSubmit={enviar} className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo" className="sm:col-span-2">
            <Input value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} required placeholder="Dra. Ana López Ruiz" />
          </Field>
          <Field label="Correo (usuario)" className="sm:col-span-2" hint={!nuevo ? 'El correo no se puede cambiar.' : undefined}>
            <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} disabled={!nuevo} required autoComplete="off" />
          </Field>
          <Field label="Rol" hint={ROL_AYUDA[f.rol]} className="sm:col-span-2">
            <Select value={f.rol} onChange={(e) => set({ rol: e.target.value as Rol })} disabled={esYo || ultimoAdmin}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!nuevo && (
          <label className={cx('flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm', (esYo || ultimoAdmin) && 'opacity-60')}>
            <input type="checkbox" checked={f.activo} disabled={esYo || ultimoAdmin} onChange={(e) => set({ activo: e.target.checked })} className="size-4 accent-[var(--color-brand)]" />
            <span className="flex-1">Cuenta activa</span>
            {esYo && <span className="text-xs text-muted">(es tu cuenta)</span>}
            {!esYo && ultimoAdmin && <span className="text-xs text-muted">(último administrador)</span>}
          </label>
        )}
        {f.rol === 'medico' && (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-medium text-muted">Perfil profesional (aparece en recetas)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Especialidad">
                <Input value={f.especialidad} onChange={(e) => set({ especialidad: e.target.value })} />
              </Field>
              <Field label="Universidad">
                <Input value={f.universidad} onChange={(e) => set({ universidad: e.target.value })} />
              </Field>
              <Field label="Cédula profesional">
                <Input value={f.cedula} onChange={(e) => set({ cedula: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="Cédula de especialidad">
                <Input value={f.cedulaEspecialidad} onChange={(e) => set({ cedulaEspecialidad: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="Teléfono del consultorio">
                <Input type="tel" value={f.telefono} onChange={(e) => set({ telefono: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="RFC" hint="Para facturación (persona física: 13 caracteres).">
                <Input value={f.rfc} onChange={(e) => set({ rfc: e.target.value.toUpperCase() })} maxLength={13} className="font-mono uppercase" autoComplete="off" />
              </Field>
              <Field label="Dirección del consultorio" className="sm:col-span-2">
                <Input value={f.direccion} onChange={(e) => set({ direccion: e.target.value })} autoComplete="off" />
              </Field>
            </div>
          </fieldset>
        )}
        {!nuevo && user!.totp && (
          <label className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <input type="checkbox" checked={reset2fa} onChange={(e) => setReset2fa(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
            <span className="flex-1">Reiniciar verificación en dos pasos (perdió su teléfono)</span>
          </label>
        )}
        {nuevo ? (
          passField
        ) : resetPass ? (
          passField
        ) : (
          <Button type="button" size="sm" onClick={() => (setResetPass(true), set({ password: generarPassword() }))}>
            <KeyRound className="size-4" /> Restablecer contraseña
          </Button>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : nuevo ? <Plus className="size-4" /> : null} {nuevo ? 'Crear usuario' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
