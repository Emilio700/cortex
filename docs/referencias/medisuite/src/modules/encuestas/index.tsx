import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, Download, MonitorSmartphone, Plus, QrCode, RotateCcw, Save, Tablet, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Input, Notice, Page, Select, Stat, Tabs, Textarea } from '../../components/ui'
import { useRegistros, useCanRegistro } from '../../lib/registros'
import { usePreferencia } from '../../lib/preferencias'
import { cx, downloadBlob, fmtFecha } from '../../lib/utils'
import { registrarExportacion } from '../../lib/auditoria'
import { toast } from '../../components/toast'
import { confirmar } from '../../components/dialogos'
import {
  ESCALA5,
  PLANTILLA_BASE,
  agruparComentarios,
  aRespuesta,
  calcularNps,
  clasificarNps,
  comentarios,
  filtrarRespuestas,
  normalizarPlantilla,
  promediosPorPregunta,
  TEMAS,
  tendenciaMensual,
  valorNps,
  type Plantilla,
  type Pregunta,
  type TipoPregunta,
} from './nps'
import { CLAVE_PLANTILLA } from './comun'

const Kiosco = lazy(() => import('./Kiosco'))

type Tab = 'resultados' | 'aplicar' | 'plantilla'

export default function Encuestas() {
  const [sp, setSp] = useSearchParams()
  if (sp.get('kiosco') === '1')
    return (
      <Suspense fallback={null}>
        <Kiosco />
      </Suspense>
    )
  const t = sp.get('tab')
  const tab: Tab = t === 'aplicar' || t === 'plantilla' ? t : 'resultados'
  return (
    <Page title="Satisfacción de pacientes" subtitle="Encuestas en sala de espera, Net Promoter Score (NPS) y comentarios.">
      <Tabs<Tab>
        value={tab}
        onChange={(v) => setSp(v === 'resultados' ? {} : { tab: v }, { replace: true })}
        tabs={[
          { id: 'resultados', label: 'Resultados' },
          { id: 'aplicar', label: 'Aplicar encuesta' },
          { id: 'plantilla', label: 'Plantilla' },
        ]}
      />
      {tab === 'resultados' && <Resultados />}
      {tab === 'aplicar' && <Aplicar />}
      {tab === 'plantilla' && <Editor />}
    </Page>
  )
}

function usePlantilla() {
  const [raw, set, meta] = usePreferencia<Plantilla>(CLAVE_PLANTILLA, 'org', PLANTILLA_BASE)
  const pl = useMemo(() => normalizarPlantilla(raw), [raw])
  return [pl, set, meta] as const
}

// ---------- Resultados ----------
type Periodo = '30' | '90' | '365' | 'todo' | 'rango'
const fechaLocal = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtMes = (k: string) => `${MESES[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`

function Resultados() {
  const regs = useRegistros('encuesta')
  const [ahora] = useState(() => Date.now())
  const todas = useMemo(() => regs.map(aRespuesta), [regs])
  const [pl] = usePlantilla()
  const [periodo, setPeriodo] = useState<Periodo>('90')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [medico, setMedico] = useState('')
  const [tema, setTema] = useState('')

  const medicos = useMemo(() => [...new Set(todas.map((r) => r.medico).filter((x): x is string => !!x))].sort(), [todas])
  const filtro = useMemo(() => {
    if (periodo === 'rango')
      return {
        desde: desde || undefined,
        hasta: hasta || undefined,
        medico: medico || undefined,
      }
    if (periodo === 'todo') return { medico: medico || undefined }
    return {
      desde: fechaLocal(ahora - (Number(periodo) - 1) * 864e5),
      medico: medico || undefined,
    }
  }, [periodo, desde, hasta, medico, ahora])
  const rs = useMemo(() => filtrarRespuestas(todas, filtro), [todas, filtro])
  // la tendencia usa todo el historial con el filtro de médico (12 meses), para ver la evolución
  const tendencia = useMemo(
    () =>
      tendenciaMensual(
        filtrarRespuestas(todas, {
          medico: medico || undefined,
          desde: fechaLocal(ahora - 365 * 864e5),
        }),
      ),
    [todas, medico, ahora],
  )
  const nps = calcularNps(rs.map((r) => valorNps(r)).filter((v): v is number => v !== undefined))
  // preguntas: las de la plantilla actual + las que aparezcan en respuestas viejas
  const preguntas = useMemo(() => {
    const xs: Pregunta[] = [...pl.preguntas]
    for (const r of regs) {
      const ps = (r.datos as { preguntas?: Pregunta[] }).preguntas
      for (const q of ps ?? []) if (q && !xs.some((x) => x.id === q.id)) xs.push(q)
    }
    return xs
  }, [pl, regs])
  const promedios = promediosPorPregunta(rs, preguntas)
  const idTexto = preguntas.find((q) => q.tipo === 'texto')?.id ?? 'comentarios'
  const coms = comentarios(rs, idTexto)
  const grupos = agruparComentarios(coms)
  const comsVis = tema ? coms.filter((c) => (tema === 'otros' ? c.temas.length === 0 : c.temas.includes(tema))) : coms

  function csv() {
    const cols = preguntas.map((q) => q.id)
    const esc = (v: unknown) => {
      const s = v === undefined || v === null ? '' : String(v)
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const filas = [
      ['fecha', 'medico', 'canal', 'vinculada', ...cols].join(','),
      ...rs.map((r) => [r.fecha, r.medico ?? '', r.canal, r.patientId ? 'sí' : 'no', ...cols.map((c) => r.respuestas[c])].map(esc).join(',')),
    ]
    downloadBlob(new Blob(['﻿' + filas.join('\n')], { type: 'text/csv;charset=utf-8' }), `encuestas-${fechaLocal(Date.now())}.csv`)
    void registrarExportacion('encuestas', { formato: 'csv', recursos: rs.length })
  }

  if (!todas.length)
    return (
      <Empty>
        Aún no hay respuestas. Abre la pestaña <b>Aplicar encuesta</b> para iniciar el modo kiosco en una tableta de la sala de espera.
      </Empty>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Periodo" className="w-40">
          <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Últimos 12 meses</option>
            <option value="todo">Todo</option>
            <option value="rango">Rango…</option>
          </Select>
        </Field>
        {periodo === 'rango' && (
          <>
            <Field label="Desde" className="w-40">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Field>
            <Field label="Hasta" className="w-40">
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Médico" className="w-56 max-w-full">
          <Select value={medico} onChange={(e) => setMedico(e.target.value)}>
            <option value="">Todos</option>
            {medicos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={csv} disabled={!rs.length} className="ml-auto">
          <Download className="size-4" /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="NPS"
          value={nps.nps === null ? '—' : (nps.nps > 0 ? '+' : '') + nps.nps}
          sub="−100 a +100"
          tone={nps.nps === null ? undefined : nps.nps > 0 ? 'ok' : nps.nps < 0 ? 'danger' : 'warn'}
        />
        <Stat label="Respuestas" value={rs.length} sub={`${rs.filter((r) => r.patientId).length} vinculadas a paciente`} />
        <Stat label="Promotores (9–10)" value={`${Math.round(nps.pctPromotores)} %`} sub={`${nps.promotores} respuestas`} />
        <Stat label="Detractores (0–6)" value={`${Math.round(nps.pctDetractores)} %`} sub={`${nps.detractores} respuestas`} />
      </div>

      {nps.n > 0 && (
        <Card title="Distribución de la recomendación">
          <div
            className="flex h-6 w-full gap-0.5 overflow-hidden rounded-md"
            role="img"
            aria-label={`Detractores ${Math.round(nps.pctDetractores)} %, pasivos ${Math.round(nps.pctPasivos)} %, promotores ${Math.round(nps.pctPromotores)} %`}
          >
            {nps.detractores > 0 && <div className="bg-danger" style={{ width: `${nps.pctDetractores}%` }} title={`Detractores ${nps.detractores}`} />}
            {nps.pasivos > 0 && <div className="bg-warn" style={{ width: `${nps.pctPasivos}%` }} title={`Pasivos ${nps.pasivos}`} />}
            {nps.promotores > 0 && <div className="bg-ok" style={{ width: `${nps.pctPromotores}%` }} title={`Promotores ${nps.promotores}`} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Leyenda cls="bg-danger" label="Detractores 0–6" n={nps.detractores} pct={nps.pctDetractores} />
            <Leyenda cls="bg-warn" label="Pasivos 7–8" n={nps.pasivos} pct={nps.pctPasivos} />
            <Leyenda cls="bg-ok" label="Promotores 9–10" n={nps.promotores} pct={nps.pctPromotores} />
          </div>
          <p className="mt-3 text-xs text-muted">
            NPS = % promotores − % detractores. Fuente: Reichheld FF. «The One Number You Need to Grow». <i>Harvard Business Review</i>, dic. 2003. Con pocas respuestas (&lt; 30)
            el valor cambia mucho de un mes a otro: interprétalo con cautela.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="NPS por mes (últimos 12 meses)">
          {tendencia.length === 0 ? (
            <Empty>Sin datos.</Empty>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart
                    data={tendencia.map((t) => ({
                      ...t,
                      etiqueta: fmtMes(t.mes),
                    }))}
                    margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} stroke="var(--color-line)" />
                    <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} stroke="var(--color-line)" />
                    <ReferenceLine y={0} stroke="var(--color-muted)" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-line)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--color-ink)',
                      }}
                      formatter={(v, _n, item) => [`${v} (n = ${(item?.payload as { n?: number })?.n ?? '?'})`, 'NPS']}
                    />
                    <Line type="monotone" dataKey="nps" name="NPS" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted">Ver tabla</summary>
                <table className="mt-2 w-full text-left tabular-nums">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 font-medium">Mes</th>
                      <th className="font-medium">n</th>
                      <th className="font-medium">NPS</th>
                      <th className="font-medium">Prom.</th>
                      <th className="font-medium">Detr.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tendencia.map((t) => (
                      <tr key={t.mes} className="border-t border-line">
                        <td className="py-1">{fmtMes(t.mes)}</td>
                        <td>{t.n}</td>
                        <td>{t.nps}</td>
                        <td>{Math.round(t.pctPromotores)} %</td>
                        <td>{Math.round(t.pctDetractores)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </Card>

        <Card title="Promedio por pregunta">
          <ul className="space-y-3">
            {promedios.map((p) => (
              <li key={p.id}>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">{p.texto}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {p.promedio === null ? '—' : p.promedio.toFixed(1)}
                    <span className="font-normal text-muted"> / {p.tipo === 'nps' ? 10 : p.tipo === 'escala5' ? 5 : ''}</span>
                  </span>
                </div>
                {p.tipo !== 'opciones' && p.promedio !== null ? (
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{
                        width: `${(p.tipo === 'nps' ? p.promedio / 10 : (p.promedio - 1) / 4) * 100}%`,
                      }}
                    />
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted">
                    {Object.entries(p.distribucion).map(([k, n]) => (
                      <span key={k} className="rounded-full border border-line px-2">
                        {k}: {n}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-muted">
                  n = {p.n}
                  {p.tipo === 'escala5' && ` · 1 = ${ESCALA5[0]}, 5 = ${ESCALA5[4]}`}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={`Comentarios (${coms.length})`}>
        {coms.length === 0 ? (
          <Empty>Sin comentarios en este periodo.</Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Agrupar por tema">
              <TemaChip on={!tema} onClick={() => setTema('')} label={`Todos (${coms.length})`} />
              {grupos.map((g) => (
                <TemaChip key={g.id} on={tema === g.id} onClick={() => setTema(g.id)} label={`${g.label} (${g.n})`} />
              ))}
            </div>
            <ul className="divide-y divide-line">
              {comsVis.map((c) => {
                const cl = c.nps !== undefined ? clasificarNps(c.nps) : undefined
                return (
                  <li key={c.id} className="py-2 text-sm">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {fmtFecha(c.fecha)}
                      {cl && <Badge tone={cl === 'promotor' ? 'ok' : cl === 'pasivo' ? 'warn' : 'danger'}>{`${c.nps}/10 · ${cl}`}</Badge>}
                      {c.temas.map((t) => (
                        <span key={t} className="rounded-full border border-line px-1.5">
                          {TEMAS.find((x) => x.id === t)?.label}
                        </span>
                      ))}
                    </div>
                    <p className="break-words">{c.texto}</p>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">Agrupación automática por palabras clave (aproximada): un comentario puede aparecer en varios temas.</p>
          </>
        )}
      </Card>
    </div>
  )
}

function Leyenda({ cls, label, n, pct }: { cls: string; label: string; n: number; pct: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('size-2.5 rounded-sm', cls)} aria-hidden />
      {label}: <b className="tabular-nums">{Math.round(pct)} %</b> <span className="text-muted">({n})</span>
    </span>
  )
}

function TemaChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-muted hover:bg-surface-2')}
    >
      {label}
    </button>
  )
}

// ---------- Aplicar ----------
function urlKiosco(origen?: 'qr') {
  const base = location.href.split('#')[0]
  return `${base}#/encuestas?kiosco=1${origen ? '&origen=' + origen : ''}`
}

function Aplicar() {
  const [, setSp] = useSearchParams()
  const [qr, setQr] = useState('')
  const url = urlKiosco('qr')
  useEffect(() => {
    let vivo = true
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 360 })
      .then((d) => vivo && setQr(d))
      .catch(() => vivo && setQr(''))
    return () => {
      vivo = false
    }
  }, [url])
  const puede = useCanRegistro('encuesta', 'write')
  const [ahora] = useState(() => Date.now())
  const recientes = useRegistros('encuesta').filter((r) => ahora - Date.parse(r.fecha) < 864e5)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Modo kiosco (tableta en sala de espera)">
        <div className="flex items-start gap-3">
          <Tablet className="mt-1 size-8 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>Pantalla completa, botones grandes y una pregunta por pantalla.</li>
              <li>Anónima por defecto. El personal puede vincularla a una cita de hoy desde el botón «Personal».</li>
              <li>Tras enviar, agradece y vuelve sola al inicio; si el paciente la deja a medias, se descarta tras 90 s sin uso.</li>
              <li>Para que el paciente no salga de la encuesta, activa el modo de app fijada del dispositivo (Android: «Fijar app»; iPad: «Acceso guiado»).</li>
            </ul>
            <p className="mt-2 text-xs text-muted">Respuestas en las últimas 24 h: {recientes.length}</p>
          </div>
        </div>
        {!puede && <Notice tone="warn">Tu rol no puede registrar respuestas de encuesta.</Notice>}
        <Button variant="primary" className="mt-4" disabled={!puede} onClick={() => setSp({ kiosco: '1' })}>
          <MonitorSmartphone className="size-4" /> Iniciar modo kiosco
        </Button>
      </Card>

      <Card title="Código QR">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="grid size-44 shrink-0 place-items-center self-center rounded-lg bg-white p-2">
            {qr ? <img src={qr} alt="Código QR que abre la encuesta en modo kiosco" className="size-full" /> : <QrCode className="size-16 text-muted" aria-hidden />}
          </div>
          <div className="min-w-0 text-sm">
            <p>
              El QR abre la encuesta en modo kiosco <b>en un dispositivo de la clínica con sesión iniciada</b> (p. ej. otra tableta), sin teclear la dirección.
            </p>
            <Notice tone="warn">
              <span className="text-xs">
                Todavía no hay un enlace público para que el paciente responda desde su celular: requiere el <b>portal del paciente</b> (próximamente), con un enlace de un solo uso
                que no dé acceso al sistema. No compartas este QR con pacientes.
              </span>
            </Notice>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => qr && downloadBlob(qr, 'qr-encuesta-kiosco.png')} disabled={!qr}>
                <Download className="size-4" /> Descargar QR
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(url)
                    .then(() => toast('Enlace copiado.', 'ok'))
                    .catch(() => toast('No se pudo copiar.', 'warn'))
                }
              >
                Copiar enlace
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ---------- Editor de plantilla ----------
const TIPOS: { id: TipoPregunta; label: string }[] = [
  { id: 'nps', label: 'Recomendación 0–10 (NPS)' },
  { id: 'escala5', label: 'Escala 1–5 (Muy malo → Excelente)' },
  { id: 'opciones', label: 'Opción múltiple' },
  { id: 'texto', label: 'Texto libre' },
]

function Editor() {
  const [pl, setPl, meta] = usePlantilla()
  const [borrador, setBorrador] = useState<Plantilla>(pl)
  useEffect(() => setBorrador(pl), [pl])
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(pl)
  const ro = !meta.puedeEscribir
  const hayNps = borrador.preguntas.some((q) => q.tipo === 'nps')

  const setQ = (i: number, patch: Partial<Pregunta>) =>
    setBorrador((b) => ({
      ...b,
      preguntas: b.preguntas.map((q, j) => (j === i ? { ...q, ...patch } : q)),
    }))
  const mover = (i: number, d: -1 | 1) =>
    setBorrador((b) => {
      const ps = [...b.preguntas]
      const j = i + d
      if (j < 0 || j >= ps.length) return b
      ;[ps[i], ps[j]] = [ps[j], ps[i]]
      return { ...b, preguntas: ps }
    })

  function guardar() {
    const n = normalizarPlantilla(borrador)
    if (borrador.preguntas.some((q) => !q.texto.trim())) return toast('Hay preguntas sin texto.', 'warn')
    if (borrador.preguntas.some((q) => q.tipo === 'opciones' && (q.opciones ?? []).filter((o) => o.trim()).length < 2))
      return toast('Las preguntas de opción múltiple necesitan al menos 2 opciones.', 'warn')
    setPl(n)
    toast('Plantilla guardada para toda la clínica.', 'ok')
  }

  return (
    <div className="space-y-4">
      {ro && <Notice tone="info">Solo el administrador y los médicos pueden cambiar la plantilla de la clínica.</Notice>}
      <Notice tone="info">
        Las respuestas ya recibidas guardan una copia de sus preguntas. Si cambias el texto de una pregunta existente, sus resultados se seguirán sumando con los anteriores (mismo
        identificador): cambia solo la redacción, no el sentido.
      </Notice>
      <Card title="Textos">
        <fieldset disabled={ro} className="grid gap-3">
          <Field label="Título">
            <Input value={borrador.titulo} maxLength={80} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} />
          </Field>
          <Field label="Introducción">
            <Textarea rows={2} value={borrador.intro} maxLength={300} onChange={(e) => setBorrador({ ...borrador, intro: e.target.value })} />
          </Field>
          <Field label="Mensaje de agradecimiento">
            <Input value={borrador.gracias} maxLength={160} onChange={(e) => setBorrador({ ...borrador, gracias: e.target.value })} />
          </Field>
        </fieldset>
      </Card>
      <Card title={`Preguntas (${borrador.preguntas.length})`}>
        <fieldset disabled={ro}>
          <ol className="space-y-3">
            {borrador.preguntas.map((q, i) => (
              <li key={q.id} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted">
                    {i + 1}. <span className="font-mono">{q.id}</span>
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Subir pregunta ${i + 1}`} onClick={() => mover(i, -1)} disabled={i === 0}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Bajar pregunta ${i + 1}`} onClick={() => mover(i, 1)} disabled={i === borrador.preguntas.length - 1}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      aria-label={`Quitar pregunta ${i + 1}`}
                      onClick={() =>
                        setBorrador((b) => ({
                          ...b,
                          preguntas: b.preguntas.filter((_, j) => j !== i),
                        }))
                      }
                      disabled={borrador.preguntas.length <= 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_16rem]">
                  <Field label="Pregunta">
                    <Input value={q.texto} maxLength={200} onChange={(e) => setQ(i, { texto: e.target.value })} />
                  </Field>
                  <Field label="Tipo">
                    <Select
                      value={q.tipo}
                      onChange={(e) =>
                        setQ(i, {
                          tipo: e.target.value as TipoPregunta,
                          opciones: e.target.value === 'opciones' ? (q.opciones ?? ['Sí', 'No']) : undefined,
                        })
                      }
                    >
                      {TIPOS.map((t) => (
                        <option key={t.id} value={t.id} disabled={t.id === 'nps' && hayNps && q.tipo !== 'nps'}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {q.tipo === 'opciones' && (
                  <Field label="Opciones (una por renglón)" className="mt-2">
                    <Textarea rows={3} value={(q.opciones ?? []).join('\n')} onChange={(e) => setQ(i, { opciones: e.target.value.split('\n') })} />
                  </Field>
                )}
                <label className="mt-2 inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!q.opcional} onChange={(e) => setQ(i, { opcional: e.target.checked || undefined })} /> Opcional
                </label>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() =>
                setBorrador((b) => ({
                  ...b,
                  preguntas: [
                    ...b.preguntas,
                    {
                      id: 'q-' + Math.random().toString(36).slice(2, 7),
                      tipo: 'escala5',
                      texto: '',
                    },
                  ],
                }))
              }
            >
              <Plus className="size-4" /> Agregar pregunta
            </Button>
          </div>
        </fieldset>
        {!hayNps && <p className="mt-3 text-xs text-warn">Sin una pregunta de recomendación 0–10 no se puede calcular el NPS.</p>}
      </Card>
      {!ro && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={async () => {
              if (!(await confirmar('Se reemplazarán las preguntas actuales por las 6 preguntas originales (NPS, atención, espera, trato, limpieza y comentarios).', { titulo: '¿Restaurar la plantilla base?', aceptar: 'Restaurar' }))) return
              setPl(null)
              setBorrador(PLANTILLA_BASE)
              toast('Plantilla base restaurada.', 'ok')
            }}>
            <RotateCcw className="size-4" /> Restaurar plantilla base
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => setBorrador(pl)} disabled={!cambiado}>
              Descartar cambios
            </Button>
            <Button variant="primary" onClick={guardar} disabled={!cambiado}>
              <Save className="size-4" /> Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
