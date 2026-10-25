// Facturación real con el PAC del servidor (modo servidor): timbrado, descargas, envío por correo y cancelación.
// docs/api.md v1.1 «Facturas CFDI 4.0».
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Download, FileText, Loader2, Mail, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Input, Modal, Notice, Select } from '../../components/ui'
import { toast } from '../../components/toast'
import { api, apiDownload, ApiError, errorMessage } from '../../lib/api'
import { refreshServer } from '../../lib/store'
import { useCan } from '../../lib/session'
import type { Factura } from '../../lib/types'
import { fmtFechaHora, mxn } from '../../lib/utils'

export const MOTIVOS_CANCELACION: ['01' | '02' | '03' | '04', string][] = [
  ['01', '01 – Comprobante emitido con errores con relación (requiere UUID sustituto)'],
  ['02', '02 – Comprobante emitido con errores sin relación'],
  ['03', '03 – No se llevó a cabo la operación'],
  ['04', '04 – Operación nominativa relacionada en una factura global'],
]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function FacturaStatus({ f }: { f: Factura }) {
  if (f.status === 'valid') {
    if (f.cancellationStatus && f.cancellationStatus !== 'none') return <Badge tone="warn">Cancelación en proceso</Badge>
    return <Badge tone="ok">Vigente</Badge>
  }
  if (f.status === 'canceled') return <Badge tone="danger">Cancelada</Badge>
  if (f.status === 'pendiente') return <Badge tone="warn">Pendiente</Badge>
  if (f.status === 'error') return <Badge tone="danger">Error</Badge>
  return <Badge>{f.status}</Badge>
}

const folioDe = (f: Factura) => [f.serie, f.folio].filter(Boolean).join('-') || '—'

export async function descargarFactura(f: Factura, kind: 'pdf' | 'xml') {
  try {
    await apiDownload(`/facturas/${encodeURIComponent(f.id)}/${kind}`, `CFDI_${folioDe(f)}_${f.uuid ?? f.id}.${kind}`)
  } catch (e) {
    toast(errorMessage(e), 'danger', { title: `No se descargó el ${kind.toUpperCase()}` })
  }
}

/** Detalle de una factura timbrada con sus acciones. */
export function FacturaPanel({ f, onChange }: { f: Factura; onChange: (f: Factura) => void }) {
  const puede = useCan('pagos.escribir')
  const [modal, setModal] = useState<'cancelar' | 'enviar' | null>(null)
  const vigente = f.status === 'valid'
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">Estado</dt>
        <dd>
          <FacturaStatus f={f} />
        </dd>
        <dt className="text-muted">Folio fiscal (UUID)</dt>
        <dd className="break-all font-mono text-xs">{f.uuid ?? '—'}</dd>
        <dt className="text-muted">Serie y folio</dt>
        <dd>{folioDe(f)}</dd>
        <dt className="text-muted">Receptor</dt>
        <dd>
          {f.receptor.nombre} · <span className="font-mono">{f.receptor.rfc}</span>
        </dd>
        {f.total !== undefined && (
          <>
            <dt className="text-muted">Total</dt>
            <dd className="tabular-nums">{mxn.format(f.total)}</dd>
          </>
        )}
        <dt className="text-muted">Emitida</dt>
        <dd>{fmtFechaHora(f.creadoEn)}</dd>
        {f.cancelacion && (
          <>
            <dt className="text-muted">Cancelación</dt>
            <dd>
              Motivo {f.cancelacion.motivo}
              {f.cancelacion.sustitucion ? ` · sustituye ${f.cancelacion.sustitucion}` : ''} · {fmtFechaHora(f.cancelacion.solicitadaEn)}
            </dd>
          </>
        )}
        {f.error && (
          <>
            <dt className="text-muted">Error</dt>
            <dd className="text-danger">{f.error}</dd>
          </>
        )}
      </dl>
      {f.status !== 'error' && f.status !== 'pendiente' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => descargarFactura(f, 'pdf')}>
            <Download className="size-4" /> PDF
          </Button>
          <Button size="sm" onClick={() => descargarFactura(f, 'xml')}>
            <Download className="size-4" /> XML
          </Button>
          {puede && vigente && (
            <Button size="sm" onClick={() => setModal('enviar')}>
              <Mail className="size-4" /> Enviar por correo
            </Button>
          )}
          {puede && vigente && (
            <Button size="sm" variant="danger" onClick={() => setModal('cancelar')}>
              <Ban className="size-4" /> Cancelar
            </Button>
          )}
        </div>
      )}
      <CancelarFactura f={f} open={modal === 'cancelar'} onClose={() => setModal(null)} onDone={onChange} />
      <EnviarFactura f={f} open={modal === 'enviar'} onClose={() => setModal(null)} />
    </div>
  )
}

function CancelarFactura({ f, open, onClose, onDone }: { f: Factura; open: boolean; onClose: () => void; onDone: (f: Factura) => void }) {
  const [motivo, setMotivo] = useState<'01' | '02' | '03' | '04'>('02')
  const [sust, setSust] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setMotivo('02')
      setSust('')
      setErr('')
    }
  }, [open])
  const sustOk = motivo !== '01' || UUID_RE.test(sust.trim())
  const enviar = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await api<Factura>(`/facturas/${encodeURIComponent(f.id)}/cancelar`, { method: 'POST', body: { motivo, ...(motivo === '01' ? { sustitucion: sust.trim().toUpperCase() } : {}) } })
      onDone(r)
      refreshServer()
      toast(r.status === 'canceled' ? 'Factura cancelada ante el SAT.' : 'Cancelación solicitada; el SAT puede tardar en confirmarla.', 'ok')
      onClose()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Cancelar factura">
      <div className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <p className="text-sm">
          UUID <span className="break-all font-mono text-xs">{f.uuid}</span>
        </p>
        <Field label="Motivo de cancelación (SAT)">
          <Select value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)}>
            {MOTIVOS_CANCELACION.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {motivo === '01' && (
          <Field label="UUID de la factura que la sustituye" hint={sust && !sustOk ? <span className="text-danger">UUID inválido</span> : 'Primero timbra la factura correcta y copia aquí su folio fiscal.'}>
            <Input value={sust} onChange={(e) => setSust(e.target.value)} className="font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Volver</Button>
          <Button variant="danger" disabled={busy || !sustOk} onClick={enviar}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />} Cancelar factura
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function EnviarFactura({ f, open, onClose }: { f: Factura; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setEmail(f.receptor.email ?? '')
      setErr('')
    }
  }, [open, f.receptor.email])
  const enviar = async () => {
    setBusy(true)
    setErr('')
    try {
      await api(`/facturas/${encodeURIComponent(f.id)}/enviar`, { method: 'POST', body: email.trim() ? { email: email.trim() } : {} })
      toast('Factura enviada por correo.', 'ok')
      onClose()
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'sin_correo' ? 'Escribe un correo: el receptor no tiene uno registrado.' : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Enviar factura por correo">
      <div className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Correo del receptor" hint="El PAC envía el PDF y el XML a este correo.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="paciente@correo.mx" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy} onClick={enviar}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Enviar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Una factura por id (para abrirla desde un cobro facturado). */
export function FacturaModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [f, setF] = useState<Factura | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    api<Factura>(`/facturas/${encodeURIComponent(id)}`)
      .then(setF)
      .catch((e) => setErr(errorMessage(e)))
  }, [id])
  return (
    <Modal open onClose={onClose} title="Factura electrónica (CFDI 4.0)">
      {err ? <Notice tone="danger">{err}</Notice> : f ? <FacturaPanel f={f} onChange={setF} /> : <Loader2 className="mx-auto size-5 animate-spin text-muted" />}
    </Modal>
  )
}

/** Pestaña «Facturas»: lista con filtros y acciones. */
export function FacturasTab({ nombre }: { nombre: (id: string) => string }) {
  const [lista, setLista] = useState<Factura[] | null>(null)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState<Factura | null>(null)
  const cargar = useCallback(() => {
    setErr('')
    api<Factura[]>('/facturas', { query: { status: status || undefined, limit: 500 } })
      .then((r) => setLista(Array.isArray(r) ? r : []))
      .catch((e) => setErr(errorMessage(e)))
  }, [status])
  useEffect(cargar, [cargar])
  const vis = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (lista ?? []).filter((f) => !n || [f.uuid, f.receptor.rfc, f.receptor.nombre, f.patientId ? nombre(f.patientId) : '', folioDe(f)].join(' ').toLowerCase().includes(n))
  }, [lista, q, nombre])
  const actualizar = (f: Factura) => {
    setLista((l) => (l ?? []).map((x) => (x.id === f.id ? f : x)))
    setAbierta(f)
  }
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
        <Field label="Estado">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="valid">Vigentes</option>
            <option value="canceled">Canceladas</option>
            <option value="error">Con error</option>
            <option value="pendiente">Pendientes</option>
          </Select>
        </Field>
        <Field label="Buscar" className="min-w-48 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="UUID, RFC, receptor o paciente" />
        </Field>
        <Button onClick={cargar} aria-label="Actualizar lista de facturas">
          <RefreshCw className="size-4" /> Actualizar
        </Button>
      </div>
      {err && (
        <div className="p-3">
          <Notice tone="danger">{err}</Notice>
        </div>
      )}
      {lista === null && !err ? (
        <div className="p-6 text-center">
          <Loader2 className="mx-auto size-5 animate-spin text-muted" />
        </div>
      ) : vis.length === 0 ? (
        <div className="p-4">
          <Empty>Sin facturas timbradas</Empty>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Paciente / receptor</th>
                <th className="px-4 py-2">Folio</th>
                <th className="px-4 py-2">UUID</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {vis.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap px-4 py-2">{fmtFechaHora(f.creadoEn)}</td>
                  <td className="px-4 py-2">
                    <div>{f.patientId ? nombre(f.patientId) : '—'}</div>
                    <div className="text-xs text-muted">
                      {f.receptor.nombre} · {f.receptor.rfc}
                    </div>
                  </td>
                  <td className="px-4 py-2">{folioDe(f)}</td>
                  <td className="max-w-40 truncate px-4 py-2 font-mono text-xs" title={f.uuid}>
                    {f.uuid ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{f.total !== undefined ? mxn.format(f.total) : '—'}</td>
                  <td className="px-4 py-2">
                    <FacturaStatus f={f} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" onClick={() => setAbierta(f)}>
                      <FileText className="size-4" /> Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abierta && (
        <Modal open onClose={() => setAbierta(null)} title="Factura electrónica (CFDI 4.0)">
          <FacturaPanel f={abierta} onChange={actualizar} />
        </Modal>
      )}
    </Card>
  )
}
