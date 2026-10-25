import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CircleSlash, Clock, Plus, X, Ban } from 'lucide-react'
import { Card, Button, Field, Input, Select, Modal, Notice, Empty, Badge, Textarea } from '../../components/ui'
import { useCollection } from '../../lib/store'
import { cx } from '../../lib/utils'
import { CINCO_CORRECTOS } from './calc'
import { dosisDelDia, ordenDeManual, ordenesDeRecetas, type Aplicacion, type Dosis, type Orden, type OrdenManual } from './hoja'
import { horaEnDia, hhmm, nuevoId, type Ctx } from './ctx'

export function useOrdenes(ctx: Ctx): Orden[] {
  const rxs = useCollection('prescriptions', (r) => r.patientId === ctx.pid, [ctx.pid])
  return useMemo(
    () => [...ordenesDeRecetas(rxs, ctx.dia0), ...ctx.datos.ordenes.filter((o) => !o.suspendida).map(ordenDeManual)],
    [rxs, ctx.dia0, ctx.datos.ordenes],
  )
}

const ESTADO: Record<Aplicacion['estado'], { label: string; tone: 'ok' | 'warn' | 'danger'; Icon: typeof Check }> = {
  aplicado: { label: 'Aplicado', tone: 'ok', Icon: Check },
  omitido: { label: 'Omitido', tone: 'warn', Icon: CircleSlash },
  rechazado: { label: 'Rechazado', tone: 'danger', Icon: Ban },
}

function Registrar({ ctx, orden, programada, onClose }: { ctx: Ctx; orden: Orden; programada: number | null; onClose: () => void }) {
  const [estado, setEstado] = useState<Aplicacion['estado']>('aplicado')
  const [correctos, setCorrectos] = useState<string[]>([])
  const [hora, setHora] = useState(hhmm(Date.now()))
  const [enf, setEnf] = useState(ctx.enfermera)
  const [nota, setNota] = useState('')
  const alergias = ctx.patient?.alergias ?? []
  const posibleAlergia = alergias.find((a) => orden.medicamento.toLowerCase().includes(a.toLowerCase()))
  const ok = enf.trim() && (estado === 'aplicado' ? correctos.length === CINCO_CORRECTOS.length : nota.trim())
  function guardar() {
    const real = horaEnDia(hora, ctx.dia0)
    const ap: Aplicacion = { estado, hora: new Date(real).toISOString(), enfermera: enf.trim(), correctos, nota: nota.trim() || undefined, programada: programada != null ? new Date(programada).toISOString() : undefined }
    const clave = programada != null ? `${orden.clave}@${new Date(programada).toISOString()}` : `${orden.clave}@prn-${real}`
    ctx.guardar((d) => ({ ...d, mar: { ...d.mar, [clave]: ap } }))
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={programada != null ? `Dosis de las ${hhmm(programada)}` : 'Dosis por razón necesaria'}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="font-medium">{orden.medicamento}</div>
          <div className="text-muted">{orden.dosis} · {orden.via} · {orden.frecuencia}</div>
          {orden.indicaciones && <div className="text-muted">{orden.indicaciones}</div>}
        </div>
        {posibleAlergia && <Notice tone="danger">El paciente es alérgico a <b>{posibleAlergia}</b>. Verifique antes de administrar.</Notice>}
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-muted">Resultado</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ESTADO) as Aplicacion['estado'][]).map((e) => (
              <label key={e} className={cx('flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5', estado === e ? 'border-brand bg-brand-soft/40' : 'border-line')}>
                <input type="radio" name="estado" checked={estado === e} onChange={() => setEstado(e)} className="accent-[var(--color-brand)]" /> {ESTADO[e].label}
              </label>
            ))}
          </div>
        </fieldset>
        {estado === 'aplicado' && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-muted">Los 5 correctos (todos obligatorios)</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {CINCO_CORRECTOS.map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={correctos.includes(c)} onChange={(e) => setCorrectos(e.target.checked ? [...correctos, c] : correctos.filter((x) => x !== c))} />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora real"><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
          <Field label="Enfermera(o)"><Input value={enf} onChange={(e) => setEnf(e.target.value)} /></Field>
        </div>
        <Field label={estado === 'aplicado' ? 'Observaciones (opcional)' : 'Motivo (obligatorio)'}>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} className="min-h-14" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!ok} onClick={guardar}>Registrar</Button>
      </div>
    </Modal>
  )
}

function NuevaOrden({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [o, setO] = useState<Omit<OrdenManual, 'id'>>({ medicamento: '', dosis: '', via: 'Oral', frecuencia: 'Cada 8 horas', indicaciones: '' })
  const [primera, setPrimera] = useState('08:00')
  const set = (p: Partial<OrdenManual>) => setO({ ...o, ...p })
  function guardar() {
    const id = nuevoId()
    ctx.guardar((d) => ({ ...d, ordenes: [...d.ordenes, { ...o, id, indicaciones: o.indicaciones?.trim() || undefined }], horarios: { ...d.horarios, [`m:${id}`]: primera } }))
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Orden médica manual">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Medicamento y presentación" className="col-span-2"><Input value={o.medicamento} onChange={(e) => set({ medicamento: e.target.value })} placeholder="Ej. Paracetamol 1 g/100 mL" /></Field>
        <Field label="Dosis"><Input value={o.dosis} onChange={(e) => set({ dosis: e.target.value })} placeholder="1 g" /></Field>
        <Field label="Vía">
          <Select value={o.via} onChange={(e) => set({ via: e.target.value })}>
            {['Oral', 'Intravenosa', 'Intramuscular', 'Subcutánea', 'Sublingual', 'Inhalada', 'Tópica', 'Rectal', 'Oftálmica', 'Por sonda'].map((v) => <option key={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Frecuencia" hint="«Cada 8 horas», «c/12 h», «en caso de dolor», «dosis única»"><Input value={o.frecuencia} onChange={(e) => set({ frecuencia: e.target.value })} /></Field>
        <Field label="Primera dosis del horario"><Input type="time" value={primera} onChange={(e) => setPrimera(e.target.value)} /></Field>
        <Field label="Indicaciones" className="col-span-2"><Input value={o.indicaciones} onChange={(e) => set({ indicaciones: e.target.value })} placeholder="Ej. diluir en 100 mL, pasar en 30 min" /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!o.medicamento.trim() || !o.dosis.trim() || !o.frecuencia.trim()} onClick={guardar}>Agregar orden</Button>
      </div>
    </Modal>
  )
}

export function resumenMar(ctx: Ctx, dosis: Dosis[]) {
  const [a, b] = ctx.rango
  const turno = dosis.filter((d) => d.programada >= a && d.programada < b)
  const ahora = Date.now()
  return {
    turno,
    aplicadas: turno.filter((d) => d.aplicacion?.estado === 'aplicado').length,
    noAplicadas: turno.filter((d) => d.aplicacion && d.aplicacion.estado !== 'aplicado'),
    pendientes: turno.filter((d) => !d.aplicacion),
    atrasadas: turno.filter((d) => !d.aplicacion && d.programada + 30 * 60000 < ahora),
  }
}

export default function Mar({ ctx }: { ctx: Ctx }) {
  const ordenes = useOrdenes(ctx)
  const dosis = useMemo(() => dosisDelDia(ordenes, ctx.datos, ctx.dia0), [ordenes, ctx.datos, ctx.dia0])
  const [reg, setReg] = useState<{ orden: Orden; programada: number | null } | null>(null)
  const [nueva, setNueva] = useState(false)
  const [ver24, setVer24] = useState(false)
  const r = resumenMar(ctx, dosis)
  const [a, b] = ctx.rango
  const prn = Object.entries(ctx.datos.mar).filter(([k]) => k.includes('@prn-'))
  const ahora = Date.now()
  const alergias = ctx.patient?.alergias ?? []

  return (
    <div className="space-y-4">
      {alergias.length > 0 && <Notice tone="danger"><b>Alergias:</b> {alergias.join(', ')}</Notice>}
      <Card
        title="Órdenes vigentes"
        actions={ctx.puede && <Button size="sm" onClick={() => setNueva(true)}><Plus className="size-4" /> Orden manual</Button>}
        pad={false}
      >
        {ordenes.length === 0 ? (
          <div className="p-4"><Empty>Sin recetas vigentes ni órdenes manuales para este paciente.</Empty></div>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {ordenes.map((o) => (
              <li key={o.clave} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="font-medium">{o.medicamento}</div>
                  <div className="text-muted">{o.dosis} · {o.via} · {o.frecuencia}{o.indicaciones ? ` · ${o.indicaciones}` : ''}</div>
                </div>
                <Badge tone={o.origen === 'receta' ? 'brand' : 'neutral'}>{o.origen === 'receta' ? `Receta ${o.folio ?? ''}` : 'Manual'}</Badge>
                {o.intervalo === null && <Badge tone="warn">Frecuencia no reconocida</Badge>}
                {typeof o.intervalo === 'number' && (
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap text-muted">
                    1.ª dosis
                    <Input type="time" className="h-8 w-28 py-1" disabled={!ctx.puede} value={ctx.datos.horarios[o.clave] ?? '08:00'} onChange={(e) => ctx.guardar((d) => ({ ...d, horarios: { ...d.horarios, [o.clave]: e.target.value } }))} aria-label={`Hora de la primera dosis de ${o.medicamento}`} />
                  </label>
                )}
                {(o.intervalo === 'prn' || o.intervalo === null) && ctx.puede && <Button size="sm" onClick={() => setReg({ orden: o, programada: null })}><Plus className="size-4" /> Dosis</Button>}
                {o.origen === 'manual' && ctx.puede && (
                  <button className="rounded p-1 text-muted hover:text-danger" aria-label={`Suspender ${o.medicamento}`} onClick={() => ctx.guardar((d) => ({ ...d, ordenes: d.ordenes.map((x) => (`m:${x.id}` === o.clave ? { ...x, suspendida: true } : x)) }))}>
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={`Registro de administración (${ver24 ? '24 h' : 'turno'})`}
        actions={<label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={ver24} onChange={(e) => setVer24(e.target.checked)} className="accent-[var(--color-brand)]" /> Ver 24 h</label>}
      >
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="ok">{r.aplicadas} aplicadas</Badge>
          <Badge>{r.pendientes.length} pendientes</Badge>
          {r.atrasadas.length > 0 && <Badge tone="danger">{r.atrasadas.length} atrasadas &gt; 30 min</Badge>}
          {r.noAplicadas.length > 0 && <Badge tone="warn">{r.noAplicadas.length} omitidas/rechazadas</Badge>}
        </div>
        {(ver24 ? dosis : r.turno).length === 0 ? (
          <Empty>No hay dosis programadas en este periodo.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(ver24 ? dosis : r.turno).map((d) => {
              const ap = d.aplicacion
              const e = ap ? ESTADO[ap.estado] : null
              const atrasada = !ap && d.programada + 30 * 60000 < ahora
              const enTurno = d.programada >= a && d.programada < b
              return (
                <li key={d.clave}>
                  <button
                    disabled={!ctx.puede || !!ap}
                    onClick={() => setReg({ orden: d.orden, programada: d.programada })}
                    className={cx('flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm disabled:cursor-default', atrasada ? 'border-danger' : 'border-line', !ap && ctx.puede && 'hover:bg-surface-2', !enTurno && 'opacity-70')}
                  >
                    <span className="w-12 shrink-0 font-semibold tabular-nums">{hhmm(d.programada)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.orden.medicamento}</span>
                      <span className="block truncate text-xs text-muted">{d.orden.dosis} · {d.orden.via}</span>
                      {ap && <span className="mt-1 block text-xs text-muted">{hhmm(Date.parse(ap.hora))} · {ap.enfermera}{ap.nota ? ` · ${ap.nota}` : ''}</span>}
                    </span>
                    {e ? <Badge tone={e.tone}><e.Icon className="mr-0.5 size-3" /> {e.label}</Badge> : atrasada ? <Badge tone="danger"><AlertTriangle className="mr-0.5 size-3" /> Atrasada</Badge> : <Badge><Clock className="mr-0.5 size-3" /> Pendiente</Badge>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {prn.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-xs font-semibold text-muted uppercase">Dosis PRN registradas</h3>
            <ul className="divide-y divide-line text-sm">
              {prn.map(([k, ap]) => {
                const o = ordenes.find((x) => k.startsWith(x.clave + '@'))
                return (
                  <li key={k} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="w-12 tabular-nums">{hhmm(Date.parse(ap.hora))}</span>
                    <span className="flex-1">{o?.medicamento ?? 'Orden suspendida'} · {o?.dosis}</span>
                    <Badge tone={ESTADO[ap.estado].tone}>{ESTADO[ap.estado].label}</Badge>
                    <span className="text-xs text-muted">{ap.enfermera}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Las dosis se programan a partir de la frecuencia de la receta y la hora de la primera dosis. Una dosis registrada no se puede modificar; agregue una nota de enfermería si requiere aclaración.</p>
      </Card>
      {reg && <Registrar ctx={ctx} orden={reg.orden} programada={reg.programada} onClose={() => setReg(null)} />}
      {nueva && <NuevaOrden ctx={ctx} onClose={() => setNueva(false)} />}
    </div>
  )
}
