// Página pública: nueva contraseña con el enlace del correo (#/restablecer?t=<token>). docs/api.md v1.1.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, KeyRound, Loader2, Plus } from 'lucide-react'
import { Button, Field, Input, Notice } from '../../components/ui'
import { PasswordStrength, fuerzaPassword } from '../../components/PasswordStrength'
import { api, ApiError, errorMessage } from '../../lib/api'

export default function Restablecer() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  // El token se lee una vez y se quita de la URL (no debe quedar en el historial ni en capturas)
  const [token] = useState(() => (sp.get('t') ?? '').trim())
  useEffect(() => {
    if (sp.has('t')) nav('/restablecer', { replace: true })
  }, [sp, nav])
  const [nueva, setNueva] = useState('')
  const [conf, setConf] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [listo, setListo] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (nueva.length < 10) return setErr('La contraseña debe tener al menos 10 caracteres.')
    if (nueva !== conf) return setErr('La confirmación no coincide.')
    if (fuerzaPassword(nueva).score < 2) return setErr('La contraseña es demasiado débil. Usa una frase más larga o mezcla mayúsculas, números y símbolos.')
    setBusy(true)
    setErr('')
    try {
      await api('/auth/restablecer', { method: 'POST', body: { token, nueva }, noAuthRedirect: true })
      setListo(true)
    } catch (ex) {
      const a = ex instanceof ApiError ? ex : null
      if (a?.code === 'token_invalido') setErr('El enlace no es válido: ya se usó, venció (30 min) o se pidió uno más nuevo. Solicita otro desde «¿Olvidaste tu contraseña?».')
      else if (a?.code === 'contrasena_debil') setErr(a.message || 'La contraseña es demasiado débil.')
      else setErr(errorMessage(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid size-11 place-items-center rounded-xl bg-brand text-white dark:text-black">
            <Plus className="size-7" strokeWidth={3} aria-hidden />
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Nueva contraseña</h1>
          <p className="text-sm text-muted">MediSuite</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          {listo ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-10 text-ok" aria-hidden />
              <p className="mt-2 font-medium">Contraseña actualizada</p>
              <p className="mt-1 text-sm text-muted">Cerramos todas tus sesiones abiertas. Inicia sesión con tu nueva contraseña.</p>
              <Link to="/" className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong dark:text-black">
                Ir a iniciar sesión
              </Link>
            </div>
          ) : !token ? (
            <Notice tone="warn">El enlace está incompleto. Ábrelo directamente desde el correo o solicita otro desde la pantalla de inicio de sesión.</Notice>
          ) : (
            <form onSubmit={enviar} className="space-y-3">
              {err && <Notice tone="danger">{err}</Notice>}
              <Field label="Nueva contraseña" hint="Mínimo 10 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.">
                <Input type="password" autoComplete="new-password" required minLength={10} autoFocus value={nueva} onChange={(e) => setNueva(e.target.value)} aria-describedby="fuerza" />
              </Field>
              <PasswordStrength value={nueva} id="fuerza" />
              <Field label="Confirmar contraseña">
                <Input type="password" autoComplete="new-password" required value={conf} onChange={(e) => setConf(e.target.value)} />
              </Field>
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Guardar contraseña
              </Button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs">
          <Link to="/" className="text-brand underline">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </main>
  )
}
