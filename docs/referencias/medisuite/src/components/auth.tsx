// Pantallas y controles de sesión (modo servidor): login, menú del usuario, contraseña, 2FA e inactividad.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { ChevronDown, KeyRound, Loader2, LogIn, LogOut, Mail, Plus, ShieldCheck, ShieldOff, Timer, UserRound } from 'lucide-react'
import { PasswordStrength } from './PasswordStrength'
import { useServicio } from '../lib/health'
import { Button, Field, Input, Modal, Notice } from './ui'
import { toast } from './toast'
import { api, ApiError, errorMessage } from '../lib/api'
import { getLastActivity, keepAlive, login, logout, patchUser, ROL_LABEL, touchActivity, useSession } from '../lib/session'
import type { Rol } from '../lib/types'
import { cx } from '../lib/utils'

const ROL_TONE: Record<Rol, string> = {
  admin: 'bg-danger/12 text-danger',
  medico: 'bg-brand-soft text-brand-strong',
  enfermeria: 'bg-ok/15 text-ok',
  recepcion: 'bg-warn/15 text-warn',
}
export function RolBadge({ rol, className }: { rol: Rol; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', ROL_TONE[rol], className)}>{ROL_LABEL[rol]}</span>
}

function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className={cx('grid place-items-center rounded-xl bg-brand text-white dark:text-black', size === 'lg' ? 'size-11' : 'size-8')}>
      <Plus className={size === 'lg' ? 'size-7' : 'size-5'} strokeWidth={3} />
    </div>
  )
}

// ---------- Login ----------
export function LoginPage() {
  const ses = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [paso, setPaso] = useState<'cred' | 'totp' | 'recuperar' | 'enviado'>('cred')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ tone: 'warn' | 'danger'; text: string } | null>(null)
  const correo = useServicio('correo')
  const [sinCorreo, setSinCorreo] = useState(false)
  const recuperarDisponible = correo !== false && !sinCorreo

  const recuperar = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setErr(null)
    setBusy(true)
    try {
      await api('/auth/recuperar', { method: 'POST', body: { email: email.trim() }, noAuthRedirect: true })
      setPaso('enviado')
    } catch (ex) {
      const a = ex instanceof ApiError ? ex : null
      if (a?.code === 'correo_no_configurado') {
        setSinCorreo(true)
        setPaso('cred')
        setErr({ tone: 'warn', text: 'Este servidor no puede enviar correos. Pide al administrador de la clínica que restablezca tu contraseña.' })
      } else if (a?.status === 429) setErr({ tone: 'warn', text: 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.' })
      else setErr({ tone: 'danger', text: errorMessage(ex) })
    } finally {
      setBusy(false)
    }
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setErr(null)
    setBusy(true)
    try {
      await login(email.trim(), password, paso === 'totp' ? totp.replace(/\s/g, '') : undefined)
    } catch (ex) {
      const a = ex instanceof ApiError ? ex : null
      if (a?.code === 'totp_requerido') {
        if (paso === 'totp') setErr({ tone: 'danger', text: 'Código incorrecto o vencido. Revisa la hora de tu teléfono e inténtalo de nuevo.' })
        setPaso('totp')
        setTotp('')
      } else if (a?.status === 423) setErr({ tone: 'danger', text: a.message || 'Cuenta bloqueada por 15 minutos tras 5 intentos fallidos.' })
      else if (a?.status === 429) setErr({ tone: 'warn', text: a.message })
      else if (a?.status === 401) {
        setErr({ tone: 'danger', text: paso === 'totp' ? 'Código incorrecto. Inténtalo de nuevo.' : a.message || 'Correo o contraseña incorrectos.' })
        if (paso === 'totp') setTotp('')
      } else setErr({ tone: 'danger', text: errorMessage(ex) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight">MediSuite</h1>
          <p className="text-sm text-muted">
            {paso === 'totp' ? 'Verificación en dos pasos' : paso === 'recuperar' || paso === 'enviado' ? 'Recuperar contraseña' : 'Inicia sesión para continuar'}
          </p>
        </div>
        {paso === 'recuperar' || paso === 'enviado' ? (
          <form onSubmit={recuperar} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            {err && <Notice tone={err.tone}>{err.text}</Notice>}
            {paso === 'enviado' ? (
              <div role="status" className="space-y-2 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Mail className="size-4 text-ok" aria-hidden /> Revisa tu correo
                </p>
                <p className="text-muted">
                  Si <b className="text-ink">{email.trim()}</b> tiene una cuenta, te enviamos un enlace para crear una nueva contraseña. Es válido por 30 minutos y solo funciona una vez.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva contraseña.</p>
                <Field label="Correo electrónico">
                  <Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@clinica.mx" />
                </Field>
                <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Enviar enlace
                </Button>
              </div>
            )}
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-muted underline hover:text-ink"
              onClick={() => {
                setPaso('cred')
                setErr(null)
              }}
            >
              Volver a iniciar sesión
            </button>
          </form>
        ) : (
        <form onSubmit={enviar} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          {ses.message && !err && <Notice tone="warn">{ses.message}</Notice>}
          {err && <Notice tone={err.tone}>{err.text}</Notice>}
          {paso === 'cred' ? (
            <div className="space-y-3">
              <Field label="Correo electrónico">
                <Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@clinica.mx" />
              </Field>
              <Field label="Contraseña">
                <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">Escribe el código de 6 dígitos de tu app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
              <Field label="Código">
                <Input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  maxLength={7}
                  required
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/[^\d ]/g, ''))}
                  className="text-center font-mono text-lg tracking-[0.4em]"
                  placeholder="000000"
                />
              </Field>
            </div>
          )}
          <Button type="submit" variant="primary" className="mt-4 w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />} {paso === 'totp' ? 'Verificar y entrar' : 'Entrar'}
          </Button>
          {paso === 'totp' && (
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-muted hover:text-ink"
              onClick={() => {
                setPaso('cred')
                setErr(null)
              }}
            >
              Usar otra cuenta
            </button>
          )}
          {paso === 'cred' && recuperarDisponible && (
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-brand underline hover:text-brand-strong"
              onClick={() => {
                setPaso('recuperar')
                setErr(null)
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
        </form>
        )}
        <p className="mt-4 text-center text-xs text-muted">
          La sesión se cierra tras 30 minutos sin actividad.
          {!recuperarDisponible && ' ¿Olvidaste tu contraseña? Pide al administrador que la restablezca.'}
        </p>
        <p className="mt-3 text-center text-xs">
          <Link to="/verificar" className="text-brand underline">
            Verificar una receta
          </Link>
        </p>
      </div>
    </main>
  )
}

// ---------- Menú del usuario ----------
export function UserMenu() {
  const { user, org } = useSession()
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<'pass' | 'totp' | 'totp-off' | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [open])
  if (!user) return null
  const ini = user.nombre
    .replace(/^(dr|dra|lic|enf)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2'
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-1.5 hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">{ini || <UserRound className="size-4" />}</span>
        <span className="sr-only xl:hidden">Menú de cuenta de {user.nombre}</span>
        <span className="hidden max-w-36 flex-col items-start leading-tight xl:flex">
          <span className="sr-only">Menú de cuenta de </span>
          <span className="max-w-36 truncate text-xs font-medium">{user.nombre}</span>
          <span className="text-[10px] text-muted">{ROL_LABEL[user.rol]}</span>
        </span>
        <ChevronDown className="hidden size-3.5 text-muted sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <div className="truncate font-medium">{user.nombre}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <RolBadge rol={user.rol} />
              {org && <span className="truncate text-xs text-muted">{org.nombre}</span>}
            </div>
          </div>
          <div className="pt-1">
            <button role="menuitem" className={item} onClick={() => (setOpen(false), setModal('pass'))}>
              <KeyRound className="size-4 text-muted" /> Cambiar contraseña
            </button>
            {user.totp ? (
              <button role="menuitem" className={item} onClick={() => (setOpen(false), setModal('totp-off'))}>
                <ShieldOff className="size-4 text-muted" /> Desactivar verificación en dos pasos
              </button>
            ) : (
              <button role="menuitem" className={item} onClick={() => (setOpen(false), setModal('totp'))}>
                <ShieldCheck className="size-4 text-muted" /> Activar verificación en dos pasos
              </button>
            )}
            <button role="menuitem" className={cx(item, 'text-danger')} onClick={() => logout('Cerraste sesión.')}>
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
      <PasswordModal open={modal === 'pass'} onClose={() => setModal(null)} />
      <TotpModal open={modal === 'totp'} onClose={() => setModal(null)} />
      <TotpOffModal open={modal === 'totp-off'} onClose={() => setModal(null)} />
    </div>
  )
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [conf, setConf] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setActual('')
      setNueva('')
      setConf('')
      setErr('')
    }
  }, [open])
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (nueva.length < 10) return setErr('La nueva contraseña debe tener al menos 10 caracteres.')
    if (nueva !== conf) return setErr('La confirmación no coincide.')
    if (nueva === actual) return setErr('La nueva contraseña debe ser distinta de la actual.')
    setBusy(true)
    setErr('')
    try {
      await api('/auth/password', { method: 'POST', body: { actual, nueva } })
      toast('Contraseña actualizada.', 'ok')
      onClose()
    } catch (ex) {
      setErr(errorMessage(ex))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Cambiar contraseña">
      <form onSubmit={enviar} className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Contraseña actual">
          <Input type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 10 caracteres. Usa una frase fácil de recordar y difícil de adivinar.">
          <Input type="password" autoComplete="new-password" required minLength={10} value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </Field>
        <PasswordStrength value={nueva} />
        <Field label="Confirmar nueva contraseña">
          <Input type="password" autoComplete="new-password" required value={conf} onChange={(e) => setConf(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TotpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    let vivo = true
    setSetup(null)
    setCode('')
    setErr('')
    api<{ secret: string; otpauthUrl: string }>('/auth/totp/setup', { method: 'POST' })
      .then(async (r) => {
        const qr = await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
        if (vivo) setSetup({ ...r, qr })
      })
      .catch((e) => vivo && setErr(errorMessage(e)))
    return () => {
      vivo = false
    }
  }, [open])
  const activar = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api('/auth/totp/enable', { method: 'POST', body: { code: code.replace(/\s/g, '') } })
      patchUser({ totp: true })
      toast('Verificación en dos pasos activada. Se pedirá un código al iniciar sesión.', 'ok')
      onClose()
    } catch (ex) {
      setErr(errorMessage(ex))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Activar verificación en dos pasos">
      <form onSubmit={activar} className="space-y-3 text-sm">
        {err && <Notice tone="danger">{err}</Notice>}
        <p>1. Escanea este código con tu app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
        <div className="flex flex-col items-center gap-2">
          {setup ? (
            <img src={setup.qr} alt="Código QR para la app autenticadora" className="size-48 rounded-lg border border-line bg-white p-1" />
          ) : (
            <div className="grid size-48 place-items-center rounded-lg border border-line bg-surface-2">{!err && <Loader2 className="size-6 animate-spin text-muted" />}</div>
          )}
          {setup && (
            <details className="w-full text-xs text-muted">
              <summary className="cursor-pointer text-center">¿No puedes escanear? Escribe la clave</summary>
              <code className="mt-1 block break-all rounded bg-surface-2 p-2 text-center font-mono text-ink">{setup.secret}</code>
            </details>
          )}
        </div>
        <p>2. Escribe el código de 6 dígitos que muestra la app.</p>
        <Input
          aria-label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
          className="text-center font-mono text-lg tracking-[0.4em]"
          placeholder="000000"
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !setup || code.replace(/\s/g, '').length < 6}>
            {busy && <Loader2 className="size-4 animate-spin" />} Activar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TotpOffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setPassword('')
      setErr('')
    }
  }, [open])
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api('/auth/totp/disable', { method: 'POST', body: { password } })
      patchUser({ totp: false })
      toast('Verificación en dos pasos desactivada.', 'warn')
      onClose()
    } catch (ex) {
      setErr(errorMessage(ex))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Desactivar verificación en dos pasos">
      <form onSubmit={enviar} className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <Notice tone="warn">Tu cuenta quedará protegida solo con la contraseña. Recomendamos mantener la verificación activa.</Notice>
        <Field label="Confirma tu contraseña">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Desactivar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ---------- Cierre por inactividad ----------
const IDLE_WARN = 28 * 60_000
const IDLE_MAX = 30 * 60_000

/** Aviso a los 28 min sin actividad; cierra la sesión a los 30 (igual que el servidor). */
export function IdleWatcher() {
  const [restante, setRestante] = useState<number | null>(null)
  useEffect(() => {
    const t = setInterval(() => {
      const idle = Date.now() - getLastActivity()
      if (idle >= IDLE_MAX) {
        clearInterval(t)
        logout('Cerramos tu sesión por 30 minutos de inactividad.')
      } else if (idle >= IDLE_WARN) setRestante(Math.ceil((IDLE_MAX - idle) / 1000))
      else setRestante(null)
    }, 1000)
    return () => clearInterval(t)
  }, [])
  if (restante === null) return null
  const mm = Math.floor(restante / 60)
  const ss = String(restante % 60).padStart(2, '0')
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 text-center shadow-2xl" role="alertdialog" aria-labelledby="idle-t">
        <Timer className="mx-auto size-8 text-warn" />
        <h3 id="idle-t" className="mt-2 font-semibold">¿Sigues ahí?</h3>
        <p className="mt-1 text-sm text-muted">Por seguridad, tu sesión se cerrará en</p>
        <div className="mt-1 text-3xl font-semibold tabular-nums">
          {mm}:{ss}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => logout('Cerraste sesión.')}>Cerrar sesión</Button>
          <Button
            variant="primary"
            onClick={() => {
              touchActivity()
              setRestante(null)
              keepAlive().catch(() => undefined)
            }}
          >
            Seguir conectado
          </Button>
        </div>
      </div>
    </div>
  )
}
