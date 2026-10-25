import { useEffect, useMemo, useRef, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ScatterChart, Scatter, ReferenceLine } from 'recharts'
import { Activity, FileUp, Save, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, ImageUp, Trash, FileText } from 'lucide-react'
import { Page, Card, Button, Field, Input, Select, Textarea, Tabs, Notice, Badge, Stat, PatientBar, Disclaimer, Empty } from '../../components/ui'
import { add, remove, useActivePatient, useCollection } from '../../lib/store'
import { cx, downloadBlob, fileToDataUrl, fmtFecha, nombreCompleto } from '../../lib/utils'
import { generate, panTompkins, hrv, parseCSV, toCSV, PRESETS, type Preset, type Signal, type Parsed } from './signal'
import Strip, { stripRows, type Layout } from './Strip'
import { confirmar } from '../../components/dialogos'

type Tab = 'generar' | 'archivo' | 'papel'

function Slider({ label, value, min, max, step = 1, onChange, fmt }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-ink">{fmt ? fmt(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-[var(--color-brand)]" />
    </label>
  )
}

function PaperECG() {
  const { patient } = useActivePatient()
  const docs = useCollection('documents', (d) => d.patientId === patient?.id && d.tipo === 'ecg', [patient?.id])
  const [file, setFile] = useState<{ name: string; mime: string; url: string } | null>(null)
  const [notas, setNotas] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [ok, setOk] = useState('')
  const save = () => {
    if (!file || !patient) return
    add('documents', { patientId: patient.id, tipo: 'ecg', nombre: `ECG en papel · ${file.name}`, mime: file.mime, dataUrl: file.url, fecha: new Date(fecha + 'T12:00:00').toISOString(), meta: { origen: 'papel', notas } })
    setFile(null)
    setNotas('')
    setOk('ECG guardado en el expediente.')
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Archivar ECG en papel">
        <Notice>
          La digitalización automática de ECG en papel (foto → señal) sigue siendo tema de investigación (p. ej. PhysioNet Challenge 2024). Aquí se archiva la imagen con tus notas; no se mide automáticamente.
        </Notice>
        {ok && <Notice onClose={() => setOk('')}>{ok}</Notice>}
        <div className="grid gap-3">
          <Field label="Foto o PDF del trazo">
            <Input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              data-testid="ecg-paper"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) setFile({ name: f.name, mime: f.type || 'application/octet-stream', url: await fileToDataUrl(f) })
              }}
            />
          </Field>
          {file &&
            (file.mime.startsWith('image/') ? (
              <img src={file.url} alt="Vista previa del ECG" className="max-h-72 w-full rounded-lg border border-line object-contain" />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm">
                <FileText className="size-5" /> {file.name}
              </div>
            ))}
          <Field label="Fecha del estudio">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Notas / interpretación del médico">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ritmo sinusal, FC 72 lpm, eje normal, sin alteraciones del ST…" />
          </Field>
          <Button variant="primary" onClick={save} disabled={!file || !patient}>
            <Save className="size-4" /> Guardar en expediente
          </Button>
        </div>
      </Card>
      <Card title={`ECG del paciente${patient ? ` · ${nombreCompleto(patient)}` : ''}`}>
        {!docs.length ? (
          <Empty>Sin ECG guardados.</Empty>
        ) : (
          <ul className="space-y-2">
            {[...docs].reverse().map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-lg border border-line p-2">
                {d.mime.startsWith('image/') ? <img src={d.dataUrl} alt="" className="h-14 w-20 rounded bg-white object-cover" /> : <FileText className="size-8 text-muted" />}
                <div className="min-w-0 flex-1 text-sm">
                  <a href={d.dataUrl} download={d.nombre} className="block truncate font-medium hover:underline">
                    {d.nombre}
                  </a>
                  <div className="text-xs text-muted">{fmtFecha(d.fecha)}</div>
                  {typeof d.meta?.notas === 'string' && d.meta.notas && <div className="truncate text-xs text-muted">{d.meta.notas}</div>}
                </div>
                <button aria-label="Eliminar" className="text-muted hover:text-danger" onClick={() => void confirmar('¿Eliminar este documento?', { peligro: true }).then((ok) => ok && remove('documents', d.id))}>
                  <Trash className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default function Modulo() {
  const [tab, setTab] = useState<Tab>('generar')
  const [gen, setGen] = useState({ preset: 'sinusal' as Preset, hr: 72, hrv: 40, noise: 0.3, seconds: 10, twelve: true, seed: 1 })
  const [signal, setSignal] = useState<Signal | null>(null)
  const [leadIdx, setLeadIdx] = useState(1)
  const [layout, setLayout] = useState<Layout>('12')
  const [start, setStart] = useState(0)
  const [pxmm, setPxmm] = useState(4)
  const [csv, setCsv] = useState<{ name: string; parsed: Parsed; fs: number; unit: 'mV' | 'uV' | 'auto' } | null>(null)
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { patient } = useActivePatient()

  // generador (se actualiza al mover los controles)
  useEffect(() => {
    if (tab !== 'generar') return
    const t = setTimeout(() => {
      const s = generate(gen)
      setSignal(s)
      setLeadIdx(gen.twelve ? 1 : 0)
      setLayout(gen.twelve ? '12' : 'lead')
      setStart(0)
    }, 120)
    return () => clearTimeout(t)
  }, [gen, tab])

  const lead = signal?.leads[Math.min(leadIdx, signal.leads.length - 1)]
  const det = useMemo(() => (signal && lead ? panTompkins(lead.data, signal.fs) : null), [signal, lead])
  const h = useMemo(() => (det && signal ? hrv(det.peaks, signal.fs) : null), [det, signal])
  const dur = signal ? signal.leads[0].data.length / signal.fs : 0
  const rowSec = 10
  const maxRows = 6
  const { rows, sec } = signal ? stripRows(signal, layout, start, rowSec, maxRows) : { rows: 0, sec: 10 }
  const page = layout === '12' ? sec : rows * rowSec

  const setPreset = (p: Preset) => setGen((g) => ({ ...g, preset: p, hr: PRESETS[p].hr, hrv: PRESETS[p].hrv, seed: g.seed + 1 }))

  const loadCsvFile = async (f: File) => {
    try {
      const parsed = parseCSV(await f.text())
      const sig = parsed.cols.filter((_, i) => i !== parsed.timeCol)
      if (!sig.length) throw new Error('sin columnas de señal')
      setCsv({ name: f.name, parsed, fs: parsed.fsGuess ?? 250, unit: 'auto' })
      setMsg(null)
    } catch (e) {
      setMsg({ tone: 'danger', text: `No se pudo leer el archivo: ${(e as Error).message}` })
    }
  }

  const applyCsv = () => {
    if (!csv) return
    const { parsed, fs } = csv
    const leads = parsed.cols
      .map((c, i) => ({ name: parsed.names[i], data: c }))
      .filter((_, i) => i !== parsed.timeCol)
      .map((l) => {
        let k = csv.unit === 'uV' ? 0.001 : 1
        if (csv.unit === 'auto') {
          let mn = Infinity, mx = -Infinity
          for (const v of l.data) (mn = Math.min(mn, v)), (mx = Math.max(mx, v))
          const p2p = mx - mn
          k = p2p > 20 ? 2 / p2p : 1 // unidades ADC/µV → normaliza a ~2 mV pico a pico
        }
        return { name: l.name, data: k === 1 ? l.data : l.data.map((v) => v * k) }
      })
    setSignal({ fs, leads, source: `Archivo · ${csv.name}` })
    const ii = leads.findIndex((l) => /^(ii|mlii|lead ?ii)$/i.test(l.name))
    setLeadIdx(ii >= 0 ? ii : 0)
    setLayout(leads.length >= 12 && leads.some((l) => l.name === 'aVR') ? '12' : 'lead')
    setStart(0)
    setMsg({ tone: 'info', text: `${leads.length} canal(es), ${(leads[0].data.length / fs).toFixed(1)} s a ${fs} Hz.` })
  }

  const composite = () => {
    const c = canvasRef.current
    if (!c || !signal) return null
    const head = 70
    const o = document.createElement('canvas')
    o.width = c.width
    o.height = c.height + head
    const g = o.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, o.width, o.height)
    g.drawImage(c, 0, head)
    g.fillStyle = '#111827'
    g.font = 'bold 20px system-ui, sans-serif'
    g.fillText(`ECG · ${patient ? nombreCompleto(patient) : ''}`, 16, 28)
    g.font = '15px system-ui, sans-serif'
    g.fillText(
      `${new Date().toLocaleString('es-MX')} · ${signal.source} · ${h ? `FC ${h.hr.toFixed(0)} lpm · RR ${h.meanRR.toFixed(0)} ms · SDNN ${h.sdnn.toFixed(0)} ms · ${h.flags.map((f) => f.text).join(' · ')}` : 'sin análisis'}`,
      16,
      54,
    )
    return o.toDataURL('image/png')
  }

  const save = () => {
    if (!patient || !signal) return
    if (h) {
      add('observations', {
        patientId: patient.id,
        codigo: 'fc',
        valor: Math.round(h.hr),
        unidad: 'lpm',
        fuente: 'ecg',
        etiqueta: `ECG ${lead?.name ?? ''}`.trim(),
        interpretacion: h.flags.map((f) => f.text).join('; '),
      })
    }
    const url = composite()
    if (url)
      add('documents', {
        patientId: patient.id,
        tipo: 'ecg',
        nombre: `ECG ${signal.source} ${start.toFixed(0)}–${(start + page).toFixed(0)} s.png`,
        mime: 'image/png',
        dataUrl: url,
        meta: { origen: 'ecg', fs: signal.fs, derivacion: lead?.name, fc: h?.hr, sdnn: h?.sdnn, rmssd: h?.rmssd, pnn50: h?.pnn50 },
      })
    setMsg({ tone: 'info', text: `Guardado en el expediente de ${patient.nombre}: ${h ? `FC ${h.hr.toFixed(0)} lpm y ` : ''}trazo PNG.` })
  }

  const tach = h?.rr.map((v, i) => ({ i: i + 1, rr: Math.round(v) })) ?? []
  const poin = h?.rr.slice(1).map((v, i) => ({ x: Math.round(h.rr[i]), y: Math.round(v) })) ?? []
  const lim = poin.length ? [Math.min(...poin.flatMap((p) => [p.x, p.y])) - 50, Math.max(...poin.flatMap((p) => [p.x, p.y])) + 50] : [0, 1]

  return (
    <Page title="ECG" subtitle="Trazo en papel milimétrico, detección de QRS (Pan-Tompkins), frecuencia y variabilidad.">
      <PatientBar />
      <Tabs
        tabs={[
          { id: 'generar', label: 'Generador sintético' },
          { id: 'archivo', label: 'Cargar señal (CSV/TXT)' },
          { id: 'papel', label: 'ECG en papel' },
        ]}
        value={tab}
        onChange={(t) => (setTab(t), setMsg(null))}
      />
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      {tab === 'papel' ? (
        <PaperECG />
      ) : (
        <>
          {tab === 'generar' ? (
            <Card className="mb-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Ritmo">
                  <Select value={gen.preset} onChange={(e) => setPreset(e.target.value as Preset)}>
                    {Object.entries(PRESETS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Slider label="Frecuencia" value={gen.hr} min={30} max={200} onChange={(hr) => setGen((g) => ({ ...g, hr }))} fmt={(v) => `${v} lpm`} />
                <Slider label="Variabilidad (DE RR)" value={gen.hrv} min={0} max={120} onChange={(hrv) => setGen((g) => ({ ...g, hrv }))} fmt={(v) => (gen.preset === 'fa' ? 'irregular' : `${v} ms`)} />
                <Slider label="Ruido" value={gen.noise} min={0} max={1.5} step={0.05} onChange={(noise) => setGen((g) => ({ ...g, noise }))} fmt={(v) => v.toFixed(2)} />
                <Field label="Duración">
                  <Select value={gen.seconds} onChange={(e) => setGen((g) => ({ ...g, seconds: +e.target.value }))}>
                    {[10, 30, 60, 120, 300].map((s) => (
                      <option key={s} value={s}>
                        {s < 60 ? `${s} s` : `${s / 60} min`}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Derivaciones">
                  <Select value={gen.twelve ? '12' : '1'} onChange={(e) => setGen((g) => ({ ...g, twelve: e.target.value === '12' }))}>
                    <option value="12">12 derivaciones</option>
                    <option value="1">1 derivación (II)</option>
                  </Select>
                </Field>
                <div className="flex items-end gap-2 sm:col-span-2">
                  <Button onClick={() => setGen((g) => ({ ...g, seed: g.seed + 1 }))}>
                    <Activity className="size-4" /> Nueva muestra
                  </Button>
                  <Button variant="ghost" onClick={() => signal && downloadBlob(new Blob([toCSV(signal)], { type: 'text/csv' }), `ecg-sintetico-${gen.preset}.csv`)}>
                    <Download className="size-4" /> CSV
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="mb-4">
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Archivo CSV/TXT (columnas; opcional columna de tiempo)">
                  <Input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" data-testid="ecg-csv" onChange={(e) => e.target.files?.[0] && loadCsvFile(e.target.files[0])} />
                </Field>
                <Field label="Frecuencia de muestreo (Hz)" hint={csv?.parsed.fsGuess ? `Detectada por la columna de tiempo: ${csv.parsed.fsGuess} Hz` : 'MIT-BIH: 360 · PTB-XL: 500'}>
                  <Input type="number" min={50} max={10000} value={csv?.fs ?? 250} disabled={!csv} onChange={(e) => csv && setCsv({ ...csv, fs: Math.max(1, +e.target.value || 250) })} />
                </Field>
                <Field label="Unidades">
                  <Select value={csv?.unit ?? 'auto'} disabled={!csv} onChange={(e) => csv && setCsv({ ...csv, unit: e.target.value as 'mV' })}>
                    <option value="auto">Automático</option>
                    <option value="mV">mV</option>
                    <option value="uV">µV</option>
                  </Select>
                </Field>
                <Button variant="primary" onClick={applyCsv} disabled={!csv}>
                  <FileUp className="size-4" /> Mostrar señal
                </Button>
              </div>
              {csv && (
                <p className="mt-2 text-xs text-muted">
                  {csv.name}: {csv.parsed.cols[0].length} muestras · columnas {csv.parsed.names.map((n, i) => (i === csv.parsed.timeCol ? `${n} (tiempo)` : n)).join(', ')}
                </p>
              )}
            </Card>
          )}

          {signal && (
            <>
              <Card pad={false} className="mb-4">
                <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
                  <Select aria-label="Formato" className="h-9 w-auto! py-1" value={layout} onChange={(e) => (setLayout(e.target.value as Layout), setStart(0))}>
                    {signal.leads.length >= 12 && <option value="12">12 derivaciones (3×4 + ritmo)</option>}
                    <option value="lead">Tira de ritmo</option>
                  </Select>
                  <Select aria-label="Derivación analizada" className="h-9 w-auto! py-1" value={leadIdx} onChange={(e) => setLeadIdx(+e.target.value)}>
                    {signal.leads.map((l, i) => (
                      <option key={i} value={i}>
                        Derivación {l.name}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" variant="ghost" aria-label="Alejar" onClick={() => setPxmm((p) => Math.max(2, p - 1))}>
                    <ZoomOut className="size-4" />
                  </Button>
                  <span className="text-xs tabular-nums text-muted">{pxmm} px/mm</span>
                  <Button size="sm" variant="ghost" aria-label="Acercar" onClick={() => setPxmm((p) => Math.min(10, p + 1))}>
                    <ZoomIn className="size-4" />
                  </Button>
                  {dur > page + 0.01 && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" aria-label="Anterior" onClick={() => setStart((s) => Math.max(0, s - page))}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <input
                        type="range"
                        aria-label="Inicio"
                        min={0}
                        max={Math.max(0, dur - page)}
                        step={0.5}
                        value={start}
                        onChange={(e) => setStart(+e.target.value)}
                        className="w-28 accent-[var(--color-brand)] sm:w-48"
                      />
                      <Button size="sm" variant="ghost" aria-label="Siguiente" onClick={() => setStart((s) => Math.min(dur - page, s + page))}>
                        <ChevronRight className="size-4" />
                      </Button>
                      <span className="text-xs tabular-nums text-muted">
                        {start.toFixed(1)}–{Math.min(dur, start + page).toFixed(1)} / {dur.toFixed(0)} s
                      </span>
                    </div>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => {
                      const u = composite()
                      if (u) downloadBlob(u, 'ecg.png')
                    }}>
                      <ImageUp className="size-4" /> PNG
                    </Button>
                    <Button size="sm" variant="primary" onClick={save} disabled={!patient}>
                      <Save className="size-4" /> Guardar en expediente
                    </Button>
                  </div>
                </div>
                <div className="overflow-auto bg-[#fff7f7]" style={{ maxHeight: '75vh' }}>
                  <Strip signal={signal} layout={layout} lead={leadIdx} peaks={det?.peaks ?? []} start={start} rowSec={rowSec} maxRows={maxRows} pxmm={pxmm} canvasRef={canvasRef} />
                </div>
              </Card>

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Frecuencia cardiaca" value={h ? `${h.hr.toFixed(0)}` : '—'} sub="lpm" tone={h ? (h.hr < 60 || h.hr > 100 ? 'warn' : 'ok') : undefined} />
                <Stat label="Latidos detectados" value={det?.peaks.length ?? 0} sub={`en ${dur.toFixed(0)} s`} />
                <Stat label="RR medio" value={h ? h.meanRR.toFixed(0) : '—'} sub="ms" />
                <Stat label="SDNN" value={h ? h.sdnn.toFixed(0) : '—'} sub="ms" />
                <Stat label="RMSSD" value={h ? h.rmssd.toFixed(0) : '—'} sub="ms" />
                <Stat label="pNN50" value={h ? h.pnn50.toFixed(1) : '—'} sub="%" />
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {h?.flags.map((f) => (
                  <Badge key={f.text} tone={f.tone}>
                    {f.text}
                  </Badge>
                ))}
                {!h && <Badge tone="warn">Latidos insuficientes para el análisis</Badge>}
                {h && dur < 120 && <Badge>VFC en registros &lt; 2 min es solo orientativa (estándar: 5 min)</Badge>}
              </div>
              {h && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card title="Tacograma RR">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={tach} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                          <XAxis dataKey="i" tick={{ fontSize: 11 }} stroke="var(--color-muted)" />
                          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} stroke="var(--color-muted)" unit=" ms" width={70} />
                          <Tooltip formatter={(v) => [`${v} ms`, 'RR']} labelFormatter={(l) => `Latido ${l}`} />
                          <Line type="monotone" dataKey="rr" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                  <Card title="Gráfica de Poincaré (RRn vs RRn+1)">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                          <XAxis type="number" dataKey="x" name="RRn" domain={lim} tick={{ fontSize: 11 }} stroke="var(--color-muted)" unit=" ms" />
                          <YAxis type="number" dataKey="y" name="RRn+1" domain={lim} tick={{ fontSize: 11 }} stroke="var(--color-muted)" unit=" ms" width={70} />
                          <ReferenceLine segment={[{ x: lim[0], y: lim[0] }, { x: lim[1], y: lim[1] }]} stroke="var(--color-muted)" strokeDasharray="4 4" />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                          <Scatter data={poin} fill="var(--color-brand)" isAnimationActive={false} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              )}
              <p className={cx('mt-3 text-xs text-muted')}>
                Detección: filtro pasa-banda 5–15 Hz, derivada, cuadrado, integración en ventana de 150 ms y umbrales adaptativos con búsqueda hacia atrás (Pan &amp; Tompkins, 1985). Triángulos azules = picos R; números = intervalos RR en ms.
              </p>
              <Disclaimer>Análisis automático orientativo: no sustituye la interpretación del ECG por un médico. Las señales sintéticas son solo para demostración y enseñanza.</Disclaimer>
            </>
          )}
        </>
      )}
    </Page>
  )
}
