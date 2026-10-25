// Mensajes y recordatorios (modo servidor): historial con filtros, estado de los canales y mensaje de prueba (admin).
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, RefreshCw, Send, XCircle } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Input, Modal, Notice, Page, Select } from '../../components/ui'
import { toast } from '../../components/toast'
import { api, ApiError, errorMessage } from '../../lib/api'
import { useHealth } from '../../lib/health'
import { ESTADO_MENSAJE, mensajePrueba } from '../../lib/mensajes'
import { useSession } from '../../lib/session'
import { useCollection } from '../../lib/store'
import type { EstadoMensaje, Mensaje } from '../../lib/types'
import { fmtFechaHora, nombreCompleto } from '../../lib/utils'

const diaLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

export default function Mensajes() {
  const { user } = useSession()
  const admin = user?.rol === 'admin'
  const health = useHealth()
  const patients = useCollection('patients')
  const nombre = useMemo(() => {
    const m = new Map(patients.map((p) => [p.id, nombreCompleto(p)]))
    return (id?: string) => (id ? (m.get(id) ?? '—') : '—')
  }, [patients])
  const [estado, setEstado] = useState<'' | EstadoMensaje>('')
  const [canal, setCanal] = useState<'' | 'whatsapp' | 'email'>('')
  const [tipo, setTipo] = useState<'' | Mensaje['tipo']>('')
  const [desde, setDesde] = useState(() => diaLocal(new Date(Date.now() - 7 * 86400000)))
  const [hasta, setHasta] = useState(() => diaLocal(new Date()))
  const [lista, setLista] = useState<Mensaje[] | null>(null)
  const [err, setErr] = useState('')
  const [prueba, setPrueba] = useState(false)

  const cargar = useCallback(() => {
    setErr('')
    const q = {
      estado: estado || undefined,
      canal: canal || undefined,
      tipo: tipo || undefined,
      desde: desde ? new Date(desde + 'T00:00:00').toISOString() : undefined,
      hasta: hasta ? new Date(hasta + 'T23:59:59.999').toISOString() : undefined,
      limit: 200,
    }
    api<Mensaje[]>('/mensajes', { query: q })
      .then((r) => setLista(Array.isArray(r) ? r : []))
      .catch((e) => setErr(errorMessage(e)))
  }, [estado, canal, tipo, desde, hasta])
  useEffect(cargar, [cargar])

  const conteo = useMemo(() => {
    const c: Partial<Record<EstadoMensaje, number>> = {}
    for (const m of lista ?? []) c[m.estado] = (c[m.estado] ?? 0) + 1
    return c
  }, [lista])

  const srv = health?.servicios
  return (
    <Page
      title="Mensajes"
      subtitle="Recordatorios de citas por WhatsApp y correo, con su estado de entrega y respuestas"
      actions={
        <>
          <Button onClick={cargar}>
            <RefreshCw className="size-4" /> Actualizar
          </Button>
          {admin && (
            <Button variant="primary" onClick={() => setPrueba(true)}>
              <Send className="size-4" /> Mensaje de prueba
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
        <span className="font-medium">Canales:</span>
        <Canal ok={srv?.whatsapp} label="WhatsApp Cloud API" />
        <Canal ok={srv?.correo} label="Correo (SMTP)" />
        {health?.scheduler && (
          <span className="text-muted">
            Envío automático: {health.scheduler.activo ? 'activo' : 'inactivo'}
            {health.scheduler.ultimaEjecucion ? ` · última revisión ${fmtFechaHora(health.scheduler.ultimaEjecucion)}` : ''}
            {health.scheduler.error ? ` · error: ${health.scheduler.error}` : ''}
          </span>
        )}
      </div>
      {srv && !srv.whatsapp && !srv.correo && (
        <Notice tone="warn">
          El servidor no tiene WhatsApp ni correo configurados: los recordatorios no se envían automáticamente. Desde la <Link to="/agenda" className="underline">agenda</Link> puedes abrir WhatsApp
          con el mensaje listo.
        </Notice>
      )}
      <Card pad={false}>
        <div className="grid grid-cols-2 gap-2 border-b border-line p-3 md:grid-cols-5">
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoMensaje | '')}>
              <option value="">Todos</option>
              {Object.entries(ESTADO_MENSAJE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                  {conteo[k as EstadoMensaje] ? ` (${conteo[k as EstadoMensaje]})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Canal">
            <Select value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)}>
              <option value="">Todos</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Correo</option>
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option value="">Todos</option>
              <option value="recordatorio">Automático</option>
              <option value="manual">Manual</option>
              <option value="prueba">Prueba</option>
            </Select>
          </Field>
          <Field label="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
        {err && (
          <div className="p-3">
            <Notice tone="danger">{err}</Notice>
          </div>
        )}
        {lista === null && !err ? (
          <div className="p-6 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-muted" aria-label="Cargando" />
          </div>
        ) : !lista?.length ? (
          <div className="p-4">
            <Empty>Sin mensajes con estos filtros</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Creado</th>
                  <th className="px-4 py-2">Paciente</th>
                  <th className="px-4 py-2">Cita</th>
                  <th className="px-4 py-2">Canal / destino</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lista.map((m) => {
                  const e = ESTADO_MENSAJE[m.estado] ?? { label: m.estado, tone: 'neutral' as const }
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fmtFechaHora(m.creadoEn)}</td>
                      <td className="px-4 py-2">{m.tipo === 'prueba' ? <span className="text-muted">Prueba</span> : nombre(m.patientId)}</td>
                      <td className="whitespace-nowrap px-4 py-2">{m.citaInicio ? fmtFechaHora(m.citaInicio) : '—'}</td>
                      <td className="px-4 py-2">
                        <div>{m.canal === 'email' ? 'Correo' : 'WhatsApp'}</div>
                        <div className="font-mono text-xs text-muted">{m.destino}</div>
                      </td>
                      <td className="px-4 py-2">{m.tipo === 'recordatorio' ? `Automático${m.horas ? ` · ${m.horas} h` : ''}` : m.tipo === 'manual' ? 'Manual' : 'Prueba'}</td>
                      <td className="px-4 py-2">
                        <Badge tone={e.tone}>{e.label}</Badge>
                        {m.respuesta && <div className="mt-0.5 text-xs">Respondió: {m.respuesta === 'CONFIRMAR' ? 'confirmar' : 'reagendar'}</div>}
                        {m.error && <div className="mt-0.5 max-w-64 text-xs text-danger">{m.error}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <PruebaModal open={prueba} onClose={() => setPrueba(false)} onSent={cargar} />
    </Page>
  )
}

function Canal({ ok, label }: { ok?: boolean; label: string }) {
  if (ok === undefined) return <span className="text-muted">{label}: …</span>
  return (
    <span className="inline-flex items-center gap-1">
      {ok ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
      {label}: <b>{ok ? 'configurado' : 'no configurado'}</b>
    </span>
  )
}

function PruebaModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const [tel, setTel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) setErr('')
  }, [open])
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const m = await mensajePrueba(tel.trim())
      toast(`Mensaje de prueba enviado a ${m.destino}.`, 'ok')
      onSent()
      onClose()
    } catch (ex) {
      const a = ex instanceof ApiError ? ex : null
      if (a?.code === 'whatsapp_no_configurado') setErr('WhatsApp no está configurado en el servidor (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE).')
      else if (a?.code === 'telefono_invalido') setErr('Teléfono inválido: usa 10 dígitos de México (ej. 55 1234 5678).')
      else {
        const det = (a?.body as { detalles?: { mensaje?: string } } | undefined)?.detalles?.mensaje
        setErr(errorMessage(ex) + (det ? ` (${det})` : ''))
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Mensaje de prueba por WhatsApp">
      <form onSubmit={enviar} className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <p className="text-sm text-muted">Envía la plantilla de recordatorio con datos de ejemplo para comprobar la configuración de WhatsApp Cloud API.</p>
        <Field label="Teléfono (México)">
          <Input type="tel" required value={tel} onChange={(e) => setTel(e.target.value)} placeholder="55 1234 5678" autoComplete="tel" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !tel.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar prueba
          </Button>
        </div>
      </form>
    </Modal>
  )
}
