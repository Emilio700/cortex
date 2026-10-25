// Bitácora de auditoría (solo administrador, modo servidor): quién vio o cambió qué y cuándo.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Filter, Loader2, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Input, Notice, Page, Select } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { useCollection } from '../../lib/store'
import { registroLabel } from '../../lib/registros'
import type { User } from '../../lib/types'
import { downloadBlob, fmtFecha, fmtFechaHora, nombreCompleto } from '../../lib/utils'

interface Evento {
  id: string
  fecha: string
  userId?: string | null
  userNombre?: string | null
  accion: string
  recurso?: string | null
  recursoId?: string | null
  patientId?: string | null
  ip?: string | null
  detalle?: unknown
}

const ACCIONES: Record<string, { label: string; tone: 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' }> = {
  login: { label: 'Inicio de sesión', tone: 'ok' },
  login_fallido: { label: 'Inicio fallido', tone: 'danger' },
  logout: { label: 'Cierre de sesión', tone: 'neutral' },
  crear: { label: 'Crear', tone: 'brand' },
  actualizar: { label: 'Actualizar', tone: 'brand' },
  borrar: { label: 'Borrar', tone: 'danger' },
  firmar: { label: 'Firmar', tone: 'ok' },
  adenda: { label: 'Adenda', tone: 'brand' },
  ver_expediente: { label: 'Ver expediente', tone: 'neutral' },
  descargar_archivo: { label: 'Descargar archivo', tone: 'neutral' },
  exportar: { label: 'Exportar', tone: 'warn' },
}
const RECURSOS: Record<string, string> = {
  patients: 'Paciente',
  appointments: 'Cita',
  encounters: 'Nota',
  observations: 'Observación',
  prescriptions: 'Receta',
  documents: 'Documento',
  files: 'Archivo',
  payments: 'Pago',
  users: 'Usuario',
  settings: 'Configuración',
  auth: 'Sesión',
  registros: 'Registro',
  preferencias: 'Preferencia',
  mensajes: 'Mensaje',
  facturas: 'Factura',
  org_keys: 'Llave de firma',
  org: 'Organización',
}
/** Recurso legible; para `registros` agrega el tipo que registra el servidor (detalle.tipo). */
function recursoTxt(r: { recurso?: string | null; detalle?: unknown }): string {
  if (!r.recurso) return ''
  const base = RECURSOS[r.recurso] ?? r.recurso
  const tipo = r.recurso === 'registros' && r.detalle && typeof r.detalle === 'object' ? (r.detalle as { tipo?: unknown }).tipo : undefined
  return typeof tipo === 'string' ? `${base} · ${registroLabel(tipo)}` : base
}

const hoy = () => new Date().toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
// Fechas locales → ISO (inicio y fin del día en la zona del usuario)
const inicioDia = (d: string) => (d ? new Date(d + 'T00:00:00').toISOString() : undefined)
const finDia = (d: string) => (d ? new Date(d + 'T23:59:59.999').toISOString() : undefined)
const detalleTxt = (d: unknown) => (d === undefined || d === null || d === '' ? '' : typeof d === 'string' ? d : JSON.stringify(d))

export default function Bitacora() {
  const patients = useCollection('patients')
  const [users, setUsers] = useState<User[]>([])
  const [f, setF] = useState({ patientId: '', userId: '', desde: haceDias(7), hasta: hoy(), accion: '', limit: '200' })
  const [rows, setRows] = useState<Evento[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  useEffect(() => {
    api<User[]>('/users')
      .then(setUsers)
      .catch(() => undefined)
  }, [])

  const buscar = useCallback(async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await api<Evento[]>('/audit', { query: { patientId: f.patientId, userId: f.userId, desde: inicioDia(f.desde), hasta: finDia(f.hasta), limit: f.limit } })
      setRows(Array.isArray(r) ? r : [])
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [f.patientId, f.userId, f.desde, f.hasta, f.limit])
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pacNombre = useMemo(() => new Map(patients.map((p) => [p.id, nombreCompleto(p)])), [patients])
  // La API no filtra por acción: se filtra aquí
  const visibles = useMemo(() => (rows ?? []).filter((r) => !f.accion || r.accion === f.accion), [rows, f.accion])

  const exportar = () => {
    const cols = ['fecha', 'usuario', 'accion', 'recurso', 'recursoId', 'paciente', 'patientId', 'ip', 'detalle']
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lineas = visibles.map((r) =>
      [r.fecha, r.userNombre ?? r.userId ?? '', r.accion, r.recurso ?? '', r.recursoId ?? '', (r.patientId && pacNombre.get(r.patientId)) || '', r.patientId ?? '', r.ip ?? '', detalleTxt(r.detalle)].map(esc).join(','),
    )
    // BOM para que Excel respete los acentos
    downloadBlob(new Blob(['﻿' + [cols.join(','), ...lineas].join('\r\n')], { type: 'text/csv;charset=utf-8' }), `bitacora-${f.desde || 'inicio'}_${f.hasta || hoy()}.csv`)
  }

  return (
    <Page
      title="Bitácora"
      subtitle="Registro de accesos y cambios al expediente (solo inserción, no se puede modificar)"
      actions={
        <Button onClick={exportar} disabled={!visibles.length}>
          <Download className="size-4" /> Exportar CSV
        </Button>
      }
    >
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Paciente" className="col-span-2 md:col-span-1">
            <Select value={f.patientId} onChange={(e) => set({ patientId: e.target.value })}>
              <option value="">Todos</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {nombreCompleto(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usuario" className="col-span-2 md:col-span-1">
            <Select value={f.userId} onChange={(e) => set({ userId: e.target.value })}>
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Acción" className="col-span-2 md:col-span-1">
            <Select value={f.accion} onChange={(e) => set({ accion: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(ACCIONES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Desde">
            <Input type="date" value={f.desde} max={f.hasta || undefined} onChange={(e) => set({ desde: e.target.value })} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={f.hasta} min={f.desde || undefined} onChange={(e) => set({ hasta: e.target.value })} />
          </Field>
          <Field label="Máximo">
            <Select value={f.limit} onChange={(e) => set({ limit: e.target.value })}>
              {['100', '200', '500', '1000'].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={buscar} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Filter className="size-4" />} Aplicar filtros
          </Button>
          <Button variant="ghost" onClick={buscar} disabled={busy} aria-label="Actualizar">
            <RefreshCw className="size-4" />
          </Button>
          {rows && (
            <span className="text-xs text-muted">
              {visibles.length} evento(s){rows.length >= Number(f.limit) ? ` · se alcanzó el máximo de ${f.limit}; acota las fechas para ver más` : ''}
            </span>
          )}
        </div>
      </Card>
      {err && <Notice tone="danger">{err}</Notice>}
      <Card pad={false}>
        {rows === null ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Cargando bitácora…
          </div>
        ) : visibles.length === 0 ? (
          <div className="p-4">
            <Empty>Sin eventos con estos filtros.</Empty>
          </div>
        ) : (
          <>
            {/* Tabla en pantallas medianas y grandes */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-2/60 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Usuario</th>
                    <th className="px-3 py-2 font-medium">Acción</th>
                    <th className="px-3 py-2 font-medium">Recurso</th>
                    <th className="px-3 py-2 font-medium">Paciente</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                    <th className="px-3 py-2 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibles.map((r) => {
                    const a = ACCIONES[r.accion] ?? { label: r.accion, tone: 'neutral' as const }
                    return (
                      <tr key={r.id} className="align-top hover:bg-surface-2/40">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {fmtFecha(r.fecha, { day: '2-digit', month: 'short' })}
                          <div className="text-xs text-muted">{new Date(r.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                        </td>
                        <td className="px-3 py-2">{r.userNombre ?? <span className="text-muted">{r.userId ?? '—'}</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <Badge tone={a.tone}>{a.label}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {recursoTxt(r) || '—'}
                          {r.recursoId && <div className="max-w-40 truncate font-mono text-[11px] text-muted">{r.recursoId}</div>}
                        </td>
                        <td className="px-3 py-2">{r.patientId ? pacNombre.get(r.patientId) ?? <span className="font-mono text-xs text-muted">{r.patientId}</span> : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">{r.ip ?? '—'}</td>
                        <td className="max-w-56 px-3 py-2 text-xs text-muted">
                          <span className="line-clamp-2 break-words" title={detalleTxt(r.detalle)}>
                            {detalleTxt(r.detalle) || '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Lista en teléfono */}
            <ul className="divide-y divide-line md:hidden">
              {visibles.map((r) => {
                const a = ACCIONES[r.accion] ?? { label: r.accion, tone: 'neutral' as const }
                return (
                  <li key={r.id} className="space-y-1 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={a.tone}>{a.label}</Badge>
                      <span className="text-xs tabular-nums text-muted">{fmtFechaHora(r.fecha)}</span>
                    </div>
                    <div className="truncate">
                      <b className="font-medium">{r.userNombre ?? r.userId ?? '—'}</b>
                      {r.recurso && <span className="text-muted"> · {recursoTxt(r)}</span>}
                    </div>
                    {r.patientId && <div className="truncate text-xs text-muted">Paciente: {pacNombre.get(r.patientId) ?? r.patientId}</div>}
                    {(r.ip || r.detalle !== undefined) && (
                      <div className="break-words text-xs text-muted">
                        {r.ip && <span className="font-mono">{r.ip}</span>} {detalleTxt(r.detalle)}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>
    </Page>
  )
}
