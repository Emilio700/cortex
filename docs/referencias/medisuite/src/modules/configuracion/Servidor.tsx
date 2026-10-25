// Administración del servidor (admin): llaves de firma (rotación) y estado de los servicios (GET /api/health).
import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, KeyRound, Loader2, RefreshCw, RotateCw, XCircle } from 'lucide-react'
import { Badge, Button, Card, Notice } from '../../components/ui'
import { toast } from '../../components/toast'
import { api, errorMessage } from '../../lib/api'
import { refreshHealth, useHealth } from '../../lib/health'
import { refreshServer } from '../../lib/store'
import { fmtFechaHora } from '../../lib/utils'
import { confirmar } from '../../components/dialogos'

interface Llave {
  kid: string
  activa: boolean
  creadaEn: string
  llavePublica?: JsonWebKey
}

export function LlavesFirma() {
  const [llaves, setLlaves] = useState<Llave[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cargar = useCallback(() => {
    api<Llave[]>('/admin/llaves')
      .then((r) => setLlaves(Array.isArray(r) ? [...r].sort((a, b) => Number(b.activa) - Number(a.activa) || b.creadaEn.localeCompare(a.creadaEn)) : []))
      .catch((e) => setErr(errorMessage(e)))
  }, [])
  useEffect(cargar, [cargar])
  const rotar = async () => {
    if (!(await confirmar('Las recetas nuevas se firmarán con una llave nueva; las anteriores seguirán verificándose con su llave (publicada en el JWKS).', { titulo: '¿Rotar la llave de firma?', aceptar: 'Rotar llave' }))) return
    setBusy(true)
    setErr('')
    try {
      const r = await api<Llave>('/admin/llaves/rotar', { method: 'POST' })
      toast(`Llave rotada. Nueva llave activa: ${r.kid}.`, 'ok')
      cargar()
      refreshServer() // settings.llavePublica cambia
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden /> Llaves de firma (ES256)
        </span>
      }
      actions={
        <Button size="sm" onClick={rotar} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />} Rotar llave
        </Button>
      }
    >
      {err && <Notice tone="danger">{err}</Notice>}
      {!llaves ? (
        !err && <Loader2 className="mx-auto size-5 animate-spin text-muted" aria-label="Cargando llaves" />
      ) : (
        <ul className="divide-y divide-line text-sm">
          {llaves.map((k) => (
            <li key={k.kid} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={k.kid}>
                {k.kid}
              </span>
              <span className="text-xs text-muted">{fmtFechaHora(k.creadaEn)}</span>
              {k.activa ? <Badge tone="ok">Activa</Badge> : <Badge>Solo verificación</Badge>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Rota la llave si sospechas que el servidor o un respaldo se vieron comprometidos, o como práctica periódica (p. ej. cada año).</p>
    </Card>
  )
}

function Estado({ ok, label, detalle }: { ok: boolean | undefined; label: string; detalle?: string }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      {ok === undefined ? (
        <span className="mt-0.5 size-4 rounded-full bg-surface-2" aria-hidden />
      ) : ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      )}
      <div className="min-w-0">
        <div>
          {label}: <b>{ok === undefined ? 'desconocido' : ok ? 'OK' : 'no disponible'}</b>
        </div>
        {detalle && <div className="text-xs text-muted">{detalle}</div>}
      </div>
    </li>
  )
}

export function EstadoServidor() {
  const h = useHealth()
  const [busy, setBusy] = useState(false)
  const sch = h?.scheduler
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Activity className="size-4" aria-hidden /> Estado del servidor
        </span>
      }
      actions={
        <Button
          size="sm"
          variant="ghost"
          aria-label="Actualizar estado del servidor"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await refreshHealth()
            setBusy(false)
          }}
        >
          <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      }
    >
      {!h ? (
        <Loader2 className="mx-auto size-5 animate-spin text-muted" aria-label="Cargando estado" />
      ) : (
        <ul className="text-sm">
          <Estado ok={h.db === 'ok'} label="Base de datos" detalle={`MediSuite API ${h.version ?? ''}`} />
          <Estado ok={h.storage ? h.storage.estado === 'ok' : undefined} label="Almacenamiento de archivos" detalle={h.storage ? (h.storage.tipo === 's3' ? 'S3 compatible' : 'Disco local') : undefined} />
          <Estado
            ok={sch ? sch.activo && !sch.error : undefined}
            label="Recordatorios automáticos"
            detalle={
              sch
                ? sch.activo
                  ? `Última revisión ${sch.ultimaEjecucion ? fmtFechaHora(sch.ultimaEjecucion) : '—'}${sch.ultimosEnviados !== undefined ? ` · ${sch.ultimosEnviados} enviados` : ''}${sch.error ? ` · error: ${sch.error}` : ''}`
                  : 'Inactivo (requiere WhatsApp o correo configurado y SCHEDULER=true)'
                : undefined
            }
          />
          <Estado ok={h.servicios?.whatsapp} label="WhatsApp Cloud API" detalle={h.servicios?.whatsapp ? undefined : 'WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE'} />
          <Estado ok={h.servicios?.correo} label="Correo saliente (SMTP)" detalle={h.servicios?.correo ? undefined : 'SMTP_URL o SMTP_HOST y PUBLIC_URL (recuperar contraseña)'} />
          <Estado ok={h.servicios?.pac} label="Facturación electrónica (PAC)" detalle={h.servicios?.pac ? undefined : 'FACTURAPI_KEY'} />
        </ul>
      )}
    </Card>
  )
}
