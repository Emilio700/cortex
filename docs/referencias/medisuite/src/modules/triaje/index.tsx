import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, ArrowRightCircle, Clock, ListChecks, LogOut, RefreshCw, Save, Settings2, Siren, UserPlus } from 'lucide-react'
import { Page, Card, Button, Badge, Field, Input, Select, Textarea, Notice, Empty, Modal, Disclaimer, Tabs } from '../../components/ui'
import { toast } from '../../components/toast'
import { confirmar } from '../../components/dialogos'
import { add, update, useActivePatient, useCollection } from '../../lib/store'
import { useCan, useSession } from '../../lib/session'
import { usePreferencia } from '../../lib/preferencias'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import { cx, edad, fmtHora, nombreCompleto } from '../../lib/utils'
import type { Patient, Registro } from '../../lib/types'
import {
  ALTO_RIESGO_EJEMPLOS, NIVELES, NO_RECURSOS, RECURSOS, SALVAVIDAS, ZONA_PELIGRO, SPO2_PELIGRO,
  clasificarESI, contarRecursos, espera, metasPorOmision, ordenarCola, type NivelESI, type ResultadoESI, type Vitales,
} from './esi'

// ---------- Tipos del registro ----------
export interface DatosTriaje {
  llegada: string
  nombreTemporal?: string
  edadMeses: number
  motivo: string
  dolor?: number
  vitales: Vitales
  salvavidas: boolean
  altoRiesgo: boolean
  confusion: boolean
  dolorIntenso: boolean
  recursos: string[]
  aceptarSubirPorVitales: boolean
  vacunasIncompletasOSinFoco?: boolean
  nivel: NivelESI
  punto: ResultadoESI['punto']
  razones: string[]
  zonaPeligro: string[]
  evaluadoPor?: string
  evaluadoEn: string
  obsIds?: string[]
  historial?: { fecha: string; nivel: NivelESI; razones: string[]; vitales: Vitales; dolor?: number; por?: string }[]
  appointmentId?: string
  inicioAtencion?: string
  notas?: string
}
type EstadoTriaje = 'espera' | 'consulta' | 'retirado'

const datosDe = (r: Registro) => r.datos as unknown as DatosTriaje

function edadMesesDe(p: Patient, ref = Date.now()) {
  const n = new Date(p.fechaNac + 'T00:00:00')
  const h = new Date(ref)
  let m = (h.getFullYear() - n.getFullYear()) * 12 + (h.getMonth() - n.getMonth())
  if (h.getDate() < n.getDate()) m--
  const dias = (ref - n.getTime()) / 864e5
  return m < 1 ? Math.max(0, dias / 30.4375) : m
}

function useAhora(ms = 30_000) {
  const [t, set] = useState(() => Date.now())
  useEffect(() => {
    const i = setInterval(() => set(Date.now()), ms)
    return () => clearInterval(i)
  }, [ms])
  return t
}

function useMetas() {
  return usePreferencia<Record<NivelESI, number>>('triaje.metas', 'org', metasPorOmision())
}

export function ChipESI({ nivel, grande }: { nivel: NivelESI; grande?: boolean }) {
  const n = NIVELES[nivel]
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-lg font-bold tabular-nums', n.clase, grande ? 'h-16 min-w-16 px-3 text-3xl' : 'h-9 min-w-9 px-2 text-base')} aria-label={`ESI ${nivel}, ${n.color}`}>
      {nivel}
    </span>
  )
}

const VITALES: { k: keyof Vitales; label: string; unidad: string; step?: string; min: number; max: number }[] = [
  { k: 'fc', label: 'FC', unidad: 'lpm', min: 0, max: 300 },
  { k: 'fr', label: 'FR', unidad: 'rpm', min: 0, max: 120 },
  { k: 'spo2', label: 'SpO₂', unidad: '%', min: 0, max: 100 },
  { k: 'temp', label: 'Temp.', unidad: '°C', step: '0.1', min: 25, max: 45 },
  { k: 'pas', label: 'TA sistólica', unidad: 'mmHg', min: 0, max: 300 },
  { k: 'pad', label: 'TA diastólica', unidad: 'mmHg', min: 0, max: 200 },
  { k: 'glucosa', label: 'Glucemia capilar', unidad: 'mg/dL', min: 0, max: 1000 },
]

// ---------- Formulario de triaje ----------
interface FormState {
  patientId: string // '' = no registrado
  nombreTemporal: string
  edadAnios: string
  motivo: string
  dolor: string
  vit: Record<string, string>
  salvavidas: boolean
  altoRiesgo: boolean
  confusion: boolean
  dolorIntenso: boolean
  recursos: string[]
  subir: boolean
  vacunas: boolean
  notas: string
}

function formDesde(r: Registro | null, activo: string | null): FormState {
  if (!r)
    return { patientId: activo ?? '', nombreTemporal: '', edadAnios: '', motivo: '', dolor: '', vit: {}, salvavidas: false, altoRiesgo: false, confusion: false, dolorIntenso: false, recursos: [], subir: true, vacunas: false, notas: '' }
  const d = datosDe(r)
  return {
    patientId: r.patientId ?? '', nombreTemporal: d.nombreTemporal ?? '', edadAnios: r.patientId ? '' : String(Math.floor(d.edadMeses / 12)), motivo: d.motivo, dolor: d.dolor != null ? String(d.dolor) : '',
    vit: {}, salvavidas: d.salvavidas, altoRiesgo: d.altoRiesgo, confusion: d.confusion, dolorIntenso: d.dolorIntenso, recursos: d.recursos, subir: d.aceptarSubirPorVitales, vacunas: !!d.vacunasIncompletasOSinFoco, notas: d.notas ?? '',
  }
}

const num = (s: string | undefined) => (s != null && s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined)

function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm', checked ? 'border-brand bg-brand-soft/40' : 'border-line hover:bg-surface-2', disabled && 'opacity-60')}>
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  )
}

function TriajeForm({ registro, onDone }: { registro: Registro | null; onDone: () => void }) {
  const { id: activo } = useActivePatient()
  const patients = useCollection('patients')
  const ses = useSession()
  const puede = useCanRegistro('triaje', 'write')
  const puedeObs = useCan('obs.escribir')
  const [metas] = useMetas()
  const [f, setF] = useState<FormState>(() => formDesde(registro, activo))
  const prevVit = registro ? datosDe(registro).vitales : undefined
  const set = (p: Partial<FormState>) => setF((x) => ({ ...x, ...p }))
  const paciente = patients.find((p) => p.id === f.patientId) ?? null
  const edadMeses = paciente ? edadMesesDe(paciente) : (num(f.edadAnios) ?? 30) * 12
  const vitales: Vitales = Object.fromEntries(VITALES.map((v) => [v.k, num(f.vit[v.k])]).filter(([, x]) => x != null))
  const dolor = num(f.dolor)
  const recursos = contarRecursos(f.recursos)
  const res = clasificarESI({ edadMeses, salvavidas: f.salvavidas, altoRiesgo: f.altoRiesgo, confusion: f.confusion, dolorIntenso: f.dolorIntenso, recursos, vitales, aceptarSubirPorVitales: f.subir, vacunasIncompletasOSinFoco: f.vacunas })
  const n = NIVELES[res.nivel]
  const umbral = ZONA_PELIGRO.find((z) => edadMeses >= z.desdeMeses && edadMeses < z.hastaMeses)!
  const listo = (f.patientId || f.nombreTemporal.trim()) && f.motivo.trim()

  function guardar() {
    if (!listo) return
    const ahora = new Date().toISOString()
    const por = ses.user?.nombre
    const obsIds: string[] = []
    if (f.patientId && puedeObs) {
      for (const v of VITALES) {
        const val = vitales[v.k]
        if (val == null) continue
        const o = add('observations', { patientId: f.patientId, codigo: v.k, valor: val, unidad: v.unidad, fuente: 'manual', etiqueta: 'Triaje' })
        obsIds.push(o.id)
      }
      if (dolor != null) obsIds.push(add('observations', { patientId: f.patientId, codigo: 'escala', valor: dolor, unidad: 'pts', fuente: 'escala', etiqueta: 'Dolor (EVN 0–10)', interpretacion: dolor >= 7 ? 'Intenso' : dolor >= 4 ? 'Moderado' : 'Leve' }).id)
    }
    const base: Omit<DatosTriaje, 'llegada' | 'historial'> = {
      nombreTemporal: f.patientId ? undefined : f.nombreTemporal.trim(), edadMeses, motivo: f.motivo.trim(), dolor, vitales,
      salvavidas: f.salvavidas, altoRiesgo: f.altoRiesgo, confusion: f.confusion, dolorIntenso: f.dolorIntenso, recursos: f.recursos,
      aceptarSubirPorVitales: f.subir, vacunasIncompletasOSinFoco: f.vacunas || undefined, nivel: res.nivel, punto: res.punto, razones: res.razones,
      zonaPeligro: res.zonaPeligro, evaluadoPor: por, evaluadoEn: ahora, obsIds, notas: f.notas.trim() || undefined,
    }
    const titulo = `Triaje ESI ${res.nivel} · ${f.motivo.trim().slice(0, 60)}`
    if (registro) {
      const prev = datosDe(registro)
      const historial = [...(prev.historial ?? []), { fecha: prev.evaluadoEn, nivel: prev.nivel, razones: prev.razones, vitales: prev.vitales, dolor: prev.dolor, por: prev.evaluadoPor }]
      update('registros', registro.id, { patientId: f.patientId || undefined, titulo, datos: { ...prev, ...base, obsIds: [...(prev.obsIds ?? []), ...obsIds], historial } as unknown as Record<string, unknown> })
      toast(`Re-triaje guardado: ESI ${res.nivel}${prev.nivel !== res.nivel ? ` (antes ESI ${prev.nivel})` : ''}`, 'ok')
    } else {
      add('registros', { patientId: f.patientId || undefined, fecha: ahora, tipo: 'triaje', estado: 'espera', titulo, datos: { ...base, llegada: ahora, historial: [] } as unknown as Record<string, unknown> })
      toast(`Paciente en sala de espera con ESI ${res.nivel}`, 'ok')
    }
    onDone()
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card title="Paciente y motivo">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paciente">
              <Select value={f.patientId} onChange={(e) => set({ patientId: e.target.value })}>
                <option value="">— Sin registro (llegada espontánea) —</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{nombreCompleto(p)} · {edad(p.fechaNac).texto}</option>
                ))}
              </Select>
            </Field>
            {!f.patientId && (
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                <Field label="Nombre">
                  <Input value={f.nombreTemporal} onChange={(e) => set({ nombreTemporal: e.target.value })} placeholder="Nombre y apellidos" />
                </Field>
                <Field label="Edad (años)">
                  <Input type="number" min={0} max={120} inputMode="numeric" value={f.edadAnios} onChange={(e) => set({ edadAnios: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
          {paciente && (
            <div className={cx('mt-3 rounded-lg px-3 py-2 text-sm', paciente.alergias.length ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-muted')}>
              <AlertTriangle className="mr-1 inline size-4" />
              {paciente.alergias.length ? <><b>Alergias:</b> {paciente.alergias.join(', ')}</> : 'Sin alergias registradas (confirme con el paciente).'}
            </div>
          )}
          {!f.patientId && <p className="mt-2 text-xs text-muted">Sin expediente, los signos vitales no se guardan como observaciones. Registre al paciente en Pacientes para conservarlos.</p>}
          <Field label="Motivo de consulta (queja principal)" className="mt-3">
            <Textarea value={f.motivo} onChange={(e) => set({ motivo: e.target.value })} placeholder="Ej. dolor abdominal de 6 horas, fiebre, herida en mano…" className="min-h-16" />
          </Field>
        </Card>

        <Card title="Signos vitales y dolor">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VITALES.map((v) => {
              const val = vitales[v.k]
              const peligro = (v.k === 'fc' && val != null && val > umbral.fc) || (v.k === 'fr' && val != null && val > umbral.fr) || (v.k === 'spo2' && val != null && val < SPO2_PELIGRO)
              return (
                <Field key={v.k} label={`${v.label} (${v.unidad})`}>
                  <Input type="number" inputMode="decimal" step={v.step ?? '1'} min={v.min} max={v.max} value={f.vit[v.k] ?? ''} onChange={(e) => set({ vit: { ...f.vit, [v.k]: e.target.value } })} placeholder={prevVit?.[v.k] != null ? `antes ${prevVit[v.k]}` : undefined} className={peligro ? 'border-danger text-danger' : ''} aria-invalid={peligro || undefined} />
                </Field>
              )
            })}
            <Field label="Dolor (EVN 0–10)">
              <Input
                type="number" min={0} max={10} inputMode="numeric" value={f.dolor}
                onChange={(e) => {
                  const d = num(e.target.value)
                  set({ dolor: e.target.value, ...(d != null && d >= 7 && !f.dolorIntenso ? { dolorIntenso: true } : {}) })
                }}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted">
            Zona de peligro para {umbral.rango}: FC &gt; {umbral.fc}, FR &gt; {umbral.fr}, SpO₂ &lt; {SPO2_PELIGRO} %.
          </p>
        </Card>

        <Card title="A · ¿Requiere intervención inmediata para salvar la vida?">
          <Check checked={f.salvavidas} onChange={(v) => set({ salvavidas: v })}>
            <b>Sí → ESI 1.</b> <span className="text-muted">{SALVAVIDAS.condiciones}</span>
          </Check>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-brand">Qué cuenta y qué no (tabla 2-1 del manual)</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{SALVAVIDAS.si.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="mt-2 font-medium">No son intervenciones salvavidas:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{SALVAVIDAS.no.map((s) => <li key={s}>{s}</li>)}</ul>
          </details>
        </Card>

        <Card title="B · ¿Es un paciente que no debe esperar?">
          <div className="grid gap-2">
            <Check checked={f.altoRiesgo} onChange={(v) => set({ altoRiesgo: v })}>
              <b>Situación de alto riesgo</b>
              <span className="block text-xs text-muted">Ej.: {ALTO_RIESGO_EJEMPLOS.join(' · ')}</span>
            </Check>
            <Check checked={f.confusion} onChange={(v) => set({ confusion: v })}><b>Confusión, letargo o desorientación</b> de inicio reciente</Check>
            <Check checked={f.dolorIntenso} onChange={(v) => set({ dolorIntenso: v })}>
              <b>Dolor o angustia intensos</b> <span className="text-muted">(observación clínica o dolor ≥ 7/10; la enfermera decide si aplica)</span>
            </Check>
          </div>
        </Card>

        <Card title={`C · ¿Cuántos recursos distintos necesitará? (${recursos})`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {RECURSOS.map((r) => (
              <Check key={r.id} checked={f.recursos.includes(r.id)} onChange={(v) => set({ recursos: v ? [...f.recursos, r.id] : f.recursos.filter((x) => x !== r.id) })}>
                {r.nombre}{r.cuenta > 1 && <span className="text-muted"> · cuenta {r.cuenta}</span>}
              </Check>
            ))}
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-brand">No cuentan como recursos</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{NO_RECURSOS.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="mt-2 text-muted">Varios estudios del mismo tipo (p. ej., biometría + química) cuentan como un solo recurso.</p>
          </details>
        </Card>

        <Card title="D · Signos vitales de zona de peligro">
          {res.zonaPeligro.length ? (
            <ul className="mb-2 list-disc pl-5 text-sm text-danger">{res.zonaPeligro.map((z) => <li key={z}>{z}</li>)}</ul>
          ) : (
            <p className="mb-2 text-sm text-muted">Sin signos vitales en zona de peligro.</p>
          )}
          <Check checked={f.subir} onChange={(v) => set({ subir: v })}>
            Aplicar la sugerencia del punto D (considerar ESI 2 si hay zona de peligro con ≥ 2 recursos) y de fiebre pediátrica
          </Check>
          {edadMeses < 36 && (
            <div className="mt-2">
              <Check checked={f.vacunas} onChange={(v) => set({ vacunas: v })}>Niño febril con esquema de vacunación incompleto o sin foco evidente de fiebre</Check>
            </div>
          )}
          <Field label="Notas de triaje (opcional)" className="mt-3">
            <Input value={f.notas} onChange={(e) => set({ notas: e.target.value })} />
          </Field>
        </Card>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card title="Resultado">
          <div className="flex items-center gap-3">
            <ChipESI nivel={res.nivel} grande />
            <div>
              <div className="text-lg font-semibold">ESI {res.nivel} · {n.nombre}</div>
              <div className="text-sm text-muted">{n.color} · punto de decisión {res.punto}</div>
              <div className="mt-1 text-sm"><Clock className="mr-1 inline size-4" />Meta para valoración médica: <b>{metas[res.nivel] === 0 ? 'inmediata' : `≤ ${metas[res.nivel]} min`}</b></div>
            </div>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{res.razones.map((r) => <li key={r}>{r}</li>)}</ul>
          {res.fiebre && <Notice tone="warn">{res.fiebre.texto}</Notice>}
          <Button variant="primary" className="mt-3 w-full" disabled={!listo || !puede} onClick={guardar}>
            <Save className="size-4" /> {registro ? 'Guardar re-triaje' : 'Enviar a sala de espera'}
          </Button>
          {!puede && <p className="mt-2 text-xs text-muted">Tu rol no puede registrar triajes.</p>}
          {!listo && puede && <p className="mt-2 text-xs text-muted">Falta {!(f.patientId || f.nombreTemporal.trim()) ? 'el paciente' : 'el motivo de consulta'}.</p>}
          <p className="mt-3 text-xs text-muted">
            Algoritmo: Gilboy N, et al. <i>Emergency Severity Index (ESI), Version 4. Implementation Handbook</i>, 2012 ed. AHRQ Pub. No. 12-0014 (dominio público); la v5 (ENA) conserva los puntos A–D. El ESI no define colores ni tiempos: los mostrados son configurables por la clínica (verificar con su política).
          </p>
          <Disclaimer />
        </Card>
      </div>
    </div>
  )
}

// ---------- Tablero ----------
function Tablero({ onRetriaje }: { onRetriaje: (r: Registro) => void }) {
  const ahora = useAhora()
  const [metas] = useMetas()
  const patients = useCollection('patients')
  const registros = useRegistros('triaje')
  const puede = useCanRegistro('triaje', 'write')
  const [pasar, setPasar] = useState<Registro | null>(null)
  async function retirar(r: Registro) {
    const ok = await confirmar('El paciente saldrá de la sala de espera y quedará registrado como «se retiró».', { titulo: '¿Se retiró sin ser atendido?', aceptar: 'Marcar como retirado', peligro: true })
    if (ok) update('registros', r.id, { estado: 'retirado' satisfies EstadoTriaje, datos: { ...r.datos, inicioAtencion: new Date().toISOString() } })
  }
  const pac = (id?: string) => patients.find((p) => p.id === id)
  const cola = useMemo(
    () => ordenarCola(registros.filter((r) => r.estado === 'espera').map((r) => ({ id: r.id, r, nivel: datosDe(r).nivel, llegada: datosDe(r).llegada }))),
    [registros],
  )
  const hoy = new Date(ahora).toDateString()
  const atendidos = registros.filter((r) => r.estado !== 'espera' && new Date(datosDe(r).llegada).toDateString() === hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const vencidos = cola.filter((c) => espera(c.llegada, c.nivel, ahora, metas).vencido).length

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-3"><div className="text-xs text-muted">En espera</div><div className="text-2xl font-semibold tabular-nums">{cola.length}</div></div>
        <div className="rounded-xl border border-line bg-surface p-3"><div className="text-xs text-muted">Fuera de meta</div><div className={cx('text-2xl font-semibold tabular-nums', vencidos > 0 && 'text-danger')}>{vencidos}</div></div>
        <div className="rounded-xl border border-line bg-surface p-3"><div className="text-xs text-muted">ESI 1–2 esperando</div><div className="text-2xl font-semibold tabular-nums">{cola.filter((c) => c.nivel <= 2).length}</div></div>
        <div className="rounded-xl border border-line bg-surface p-3"><div className="text-xs text-muted">Pasaron hoy</div><div className="text-2xl font-semibold tabular-nums">{atendidos.filter((r) => r.estado === 'consulta').length}</div></div>
      </div>
      {cola.length === 0 ? (
        <Empty>No hay pacientes en sala de espera.</Empty>
      ) : (
        <ol className="space-y-2" aria-label="Sala de espera ordenada por prioridad">
          {cola.map(({ r, nivel, llegada }) => {
            const d = datosDe(r)
            const p = pac(r.patientId)
            const e = espera(llegada, nivel, ahora, metas)
            return (
              <li key={r.id} className={cx('flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-3', e.vencido ? 'border-danger' : 'border-line')}>
                <ChipESI nivel={nivel} />
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate font-medium">{p ? nombreCompleto(p) : `${d.nombreTemporal} (sin registro)`}</div>
                  <div className="truncate text-sm text-muted">{p ? edad(p.fechaNac).texto : `${Math.floor(d.edadMeses / 12)} a`} · {d.motivo}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-xs">
                    {p?.alergias.length ? <Badge tone="danger">Alergias: {p.alergias.join(', ')}</Badge> : null}
                    {d.zonaPeligro.length > 0 && <Badge tone="warn">Zona de peligro</Badge>}
                    {d.dolor != null && <Badge>Dolor {d.dolor}/10</Badge>}
                    {(d.historial?.length ?? 0) > 0 && <Badge tone="brand">Re-triaje ×{d.historial!.length}</Badge>}
                  </div>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <div className={cx('font-semibold', e.vencido ? 'text-danger' : 'text-ink')}><Clock className="mr-1 inline size-4" />{e.min} min</div>
                  <div className="text-xs text-muted">llegó {fmtHora(llegada)} · meta {e.meta === 0 ? 'inmediata' : `${e.meta} min`}</div>
                </div>
                {puede && (
                  <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                    <Button size="sm" onClick={() => onRetriaje(r)} aria-label={`Re-triaje de ${p ? nombreCompleto(p) : d.nombreTemporal}`}><RefreshCw className="size-4" /> Re-triaje</Button>
                    <Button size="sm" variant="primary" onClick={() => setPasar(r)}><ArrowRightCircle className="size-4" /> Pasar a consulta</Button>
                    <Button size="sm" variant="ghost" onClick={() => retirar(r)} aria-label="Se retiró sin ser atendido"><LogOut className="size-4" /></Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {atendidos.length > 0 && (
        <Card title="Hoy" className="mt-4">
          <ul className="divide-y divide-line text-sm">
            {atendidos.map((r) => {
              const d = datosDe(r)
              const p = pac(r.patientId)
              return (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <ChipESI nivel={d.nivel} />
                  <span className="min-w-0 flex-1 truncate">{p ? nombreCompleto(p) : d.nombreTemporal} · {d.motivo}</span>
                  <Badge tone={r.estado === 'consulta' ? 'ok' : 'neutral'}>{r.estado === 'consulta' ? `Pasó ${d.inicioAtencion ? fmtHora(d.inicioAtencion) : ''}` : 'Se retiró'}</Badge>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      <PasarConsulta registro={pasar} onClose={() => setPasar(null)} />
    </>
  )
}

function PasarConsulta({ registro, onClose }: { registro: Registro | null; onClose: () => void }) {
  const nav = useNavigate()
  const { setActive } = useActivePatient()
  const patients = useCollection('patients')
  const citas = useCollection('appointments')
  const puedeCitas = useCan('citas.escribir')
  const puedeNotas = useCan('notas.escribir')
  const [asociar, setAsociar] = useState('')
  const pid = registro?.patientId || asociar
  const hoy = new Date().toDateString()
  const cita = citas
    .filter((c) => c.patientId === pid && new Date(c.inicio).toDateString() === hoy && !['atendida', 'cancelada', 'no-asistio'].includes(c.estado))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
  if (!registro) return null
  const d = datosDe(registro)

  function confirmar() {
    if (!registro) return
    const ahora = new Date()
    let appointmentId = cita?.id
    if (pid && puedeCitas) {
      if (cita) update('appointments', cita.id, { estado: 'en-consulta' })
      else
        appointmentId = add('appointments', {
          patientId: pid, inicio: ahora.toISOString(), fin: new Date(ahora.getTime() + 30 * 60000).toISOString(), tipo: 'primera-vez', estado: 'en-consulta',
          motivo: d.motivo, notas: `Urgencia sin cita · triaje ESI ${d.nivel}`,
        }).id
    }
    update('registros', registro.id, { patientId: pid || undefined, estado: 'consulta' satisfies EstadoTriaje, datos: { ...registro.datos, appointmentId, inicioAtencion: ahora.toISOString() } })
    setAsociar('')
    onClose()
    if (pid) {
      setActive(pid)
      if (puedeNotas) nav(`/consulta/nueva?p=${encodeURIComponent(pid)}${d.motivo ? `&motivo=${encodeURIComponent(d.motivo)}` : ''}`)
      else toast('Paciente enviado a consulta.', 'ok')
    } else toast('Paciente marcado en consulta (sin expediente).', 'ok')
  }

  return (
    <Modal open onClose={onClose} title="Pasar a consulta">
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2"><ChipESI nivel={d.nivel} /> <span>{d.motivo}</span></div>
        {!registro.patientId && (
          <Field label="Asociar a paciente registrado (opcional)" hint="Para abrir su nota de consulta y conservar sus signos.">
            <Select value={asociar} onChange={(e) => setAsociar(e.target.value)}>
              <option value="">— {d.nombreTemporal} (sin expediente) —</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}
            </Select>
          </Field>
        )}
        {pid && cita && <p>Se marcará su cita de hoy a las <b>{fmtHora(cita.inicio)}</b> como <b>en consulta</b>.</p>}
        {pid && !cita && puedeCitas && <p>No tiene cita hoy: se creará una cita de urgencia (ahora) en estado <b>en consulta</b>.</p>}
        {pid && !puedeCitas && <p className="text-muted">Tu rol no modifica la agenda; solo se registrará el paso a consulta.</p>}
        {pid && puedeNotas && <p>Después se abrirá una nota de consulta nueva para este paciente.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={confirmar}><ArrowRightCircle className="size-4" /> Confirmar</Button>
      </div>
    </Modal>
  )
}

function MetasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [metas, setMetas, meta] = useMetas()
  return (
    <Modal open={open} onClose={onClose} title="Tiempos meta por nivel">
      <p className="mb-3 text-sm text-muted">El ESI no establece tiempos oficiales; defina los de su clínica (minutos hasta la valoración médica).</p>
      <div className="grid gap-2">
        {([1, 2, 3, 4, 5] as NivelESI[]).map((n) => (
          <div key={n} className="flex items-center gap-3">
            <ChipESI nivel={n} />
            <Field label={`ESI ${n} · ${NIVELES[n].nombre} (min)`} className="flex-1">
              <Input type="number" min={0} max={1440} value={metas[n]} disabled={!meta.puedeEscribir} onChange={(e) => setMetas({ ...metas, [n]: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <Button variant="ghost" disabled={!meta.puedeEscribir} onClick={() => setMetas(null)}>Restablecer</Button>
        <Button variant="primary" onClick={onClose}>Listo</Button>
      </div>
    </Modal>
  )
}

export default function Triaje() {
  const [tab, setTab] = useState<'sala' | 'nuevo'>('sala')
  const [retri, setRetri] = useState<Registro | null>(null)
  const [metasAbierto, setMetasAbierto] = useState(false)
  const puede = useCanRegistro('triaje', 'write')
  const [k, setK] = useState(0)
  return (
    <Page
      title="Triaje"
      subtitle="Clasificación con el Emergency Severity Index (ESI) y sala de espera por prioridad"
      actions={
        <>
          <Button onClick={() => setMetasAbierto(true)}><Settings2 className="size-4" /> Tiempos meta</Button>
          {puede && <Button variant="primary" onClick={() => { setK((x) => x + 1); setTab('nuevo') }}><UserPlus className="size-4" /> Nuevo triaje</Button>}
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'sala', label: <span className="inline-flex items-center gap-1.5"><ListChecks className="size-4" /> Sala de espera</span> },
          { id: 'nuevo', label: <span className="inline-flex items-center gap-1.5"><Siren className="size-4" /> Nuevo triaje</span> },
        ]}
      />
      {tab === 'sala' ? (
        <>
          <Tablero onRetriaje={setRetri} />
          <Notice tone="info">
            <Activity className="mr-1 inline size-4" />
            En instituciones públicas de México se usa el <b>Triage IMSS</b> (5 colores) y en otros hospitales el sistema <b>Manchester</b>, que requiere licencia; esta herramienta implementa solo el ESI, de dominio público.
          </Notice>
        </>
      ) : (
        <TriajeForm key={k} registro={null} onDone={() => setTab('sala')} />
      )}
      <Modal open={!!retri} onClose={() => setRetri(null)} title="Re-triaje" wide>
        {retri && <TriajeForm registro={retri} onDone={() => setRetri(null)} />}
      </Modal>
      <MetasModal open={metasAbierto} onClose={() => setMetasAbierto(false)} />
    </Page>
  )
}
