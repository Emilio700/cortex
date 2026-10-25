// Página pública de verificación de recetas (se muestra sin el menú de la app).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react'
import { ready, useSettings } from '../../lib/store'
import { api, errorMessage, getMode } from '../../lib/api'
import { Button, Textarea } from '../../components/ui'
import { decodificar, verificarReceta, type PayloadReceta, type Verificacion } from '../receta/firma'

type Resultado = Verificacion & { cancelada?: boolean; emisor?: { clinica?: string; medico?: string; cedula?: string } }
interface RespuestaServidor {
  valida: boolean
  cancelada?: boolean
  payload?: PayloadReceta
  emisor?: { clinica?: string; medico?: string; cedula?: string }
}

/** Modo servidor: GET /api/public/verificar (sin sesión). Modo demo: llave pública de este navegador. */
async function verificar(token: string, pub?: JsonWebKey): Promise<Resultado> {
  await ready
  if (getMode() !== 'server') return verificarReceta(token, pub)
  const t = token.trim()
  if (t.split('.').length !== 3) return { ok: false, error: 'El texto no tiene formato de token JWS (tres partes separadas por puntos).' }
  try {
    const r = await api<RespuestaServidor>('/public/verificar', { query: { t }, noAuthRedirect: true, timeout: 10_000 })
    const payload = r.payload ?? decodificar(t)
    if (r.valida && !r.cancelada && payload) return { ok: true, payload, emisor: r.emisor }
    return {
      ok: false,
      cancelada: r.cancelada,
      emisor: r.emisor,
      payload,
      error: r.cancelada
        ? 'Esta receta fue CANCELADA por el médico que la emitió. No debe surtirse.'
        : 'La firma no es válida o la receta no existe en el sistema: el documento fue alterado o no fue emitido por esta clínica.',
    }
  } catch (e) {
    return { ok: false, error: 'No se pudo verificar en este momento: ' + errorMessage(e), payload: decodificar(t) }
  }
}

export default function Verificar() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const token = sp.get('t') ?? ''
  const settings = useSettings()
  const [res, setRes] = useState<Resultado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let vivo = true
    if (!token) return setRes(null)
    setCargando(true)
    // esperar a que el almacén cargue la llave pública desde IndexedDB
    verificar(token, settings.llavePublica)
      .then((r) => vivo && setRes(r))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [token, settings.llavePublica])

  const verificarTexto = () => {
    let t = texto.trim()
    const m = t.match(/[?&]t=([^&\s]+)/)
    if (m) t = decodeURIComponent(m[1])
    if (t) nav('/verificar?t=' + encodeURIComponent(t))
  }

  const p = res?.payload
  return (
    <div className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-brand text-white dark:text-black">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Verificación de receta médica</h1>
            <p className="text-xs text-muted">{res?.emisor?.clinica ?? settings.clinica}</p>
          </div>
        </div>

        {cargando && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-6 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Verificando firma…
          </div>
        )}

        {!cargando && res && (
          <div className={`overflow-hidden rounded-xl border-2 bg-surface shadow-sm ${res.ok ? 'border-ok' : 'border-danger'}`}>
            <div className={`flex items-center gap-3 px-5 py-4 ${res.ok ? 'bg-ok/10' : 'bg-danger/10'}`}>
              {res.ok ? <CheckCircle2 className="size-9 shrink-0 text-ok" /> : <XCircle className="size-9 shrink-0 text-danger" />}
              <div>
                <div className={`text-lg font-semibold ${res.ok ? 'text-ok' : 'text-danger'}`}>{res.ok ? 'Receta auténtica' : res.cancelada ? 'Receta CANCELADA' : 'Receta NO válida'}</div>
                <div className="text-sm text-muted">{res.ok ? 'La firma electrónica es válida y el contenido no ha sido modificado.' : res.error}</div>
              </div>
            </div>
            {p && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
                {!res.ok && !res.cancelada && <dd className="col-span-2 text-xs font-medium text-danger">Datos contenidos en el token (no confiables):</dd>}
                {res.emisor?.clinica && (
                  <>
                    <dt className="text-muted">Clínica</dt>
                    <dd>{res.emisor.clinica}</dd>
                  </>
                )}
                <dt className="text-muted">Folio</dt>
                <dd className="font-mono font-semibold">{p.folio}</dd>
                <dt className="text-muted">Fecha</dt>
                <dd>{p.fecha ? new Date(p.fecha).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }) : '—'}</dd>
                <dt className="text-muted">Paciente</dt>
                <dd>{p.paciente}</dd>
                {p.medico && (
                  <>
                    <dt className="text-muted">Médico</dt>
                    <dd>{p.medico}</dd>
                  </>
                )}
                <dt className="text-muted">Cédula</dt>
                <dd className="font-mono">{p.cedula}</dd>
                <dt className="text-muted">Medicamentos</dt>
                <dd>
                  <ul className="list-disc pl-4">
                    {(p.medicamentos ?? []).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </dd>
              </dl>
            )}
            {res.ok && (
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                Puedes validar la cédula en el{' '}
                <a className="text-brand underline" href="https://cedulaprofesional.sep.gob.mx/" target="_blank" rel="noreferrer">
                  Registro Nacional de Profesionistas (SEP)
                </a>
                .
              </p>
            )}
          </div>
        )}

        {!cargando && !token && (
          <div className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">Escanea el código QR de la receta o pega el token de verificación abajo.</div>
        )}

        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor="tok">
            Pegar token o enlace de verificación
          </label>
          <Textarea id="tok" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="eyJhbGciOiJFUzI1NiIs… o https://…#/verificar?t=…" className="font-mono text-xs" />
          <Button variant="primary" className="mt-2 w-full" onClick={verificarTexto} disabled={!texto.trim()}>
            Verificar
          </Button>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          {getMode() === 'server'
            ? 'La receta está firmada con ECDSA P-256 (ES256) por el servidor de la clínica. La verificación comprueba la firma, que la receta exista y que no haya sido cancelada. La llave pública está disponible en /api/public/jwks.'
            : 'La receta está firmada con ECDSA P-256 (ES256). Esta demostración verifica con la llave pública guardada en este navegador; en producción la llave pública la sirve el servidor del consultorio (endpoint JWKS) para que cualquier farmacia pueda verificar desde su propio dispositivo.'}
        </p>
        <p className="mt-3 text-center text-xs">
          <Link to="/" className="text-brand underline">
            Ir a MediSuite
          </Link>
        </p>
      </div>
    </div>
  )
}
