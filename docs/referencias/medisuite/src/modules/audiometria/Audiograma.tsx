import { useMemo, useState } from 'react'
import { FileDown, Minus, Plus, Save, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Field, Input, Notice, Select, Textarea } from '../../components/ui'
import { toast } from '../../components/toast'
import { confirmar } from '../../components/dialogos'
import { add, useActivePatient, useSettings } from '../../lib/store'
import { useCanRegistro } from '../../lib/registros'
import { cx, downloadBlob, fmtFecha, nombreCompleto } from '../../lib/utils'
import { DB_MAX, DB_MIN, FRECUENCIAS, etiquetaFrec, interpretar, vacio, type Frecuencia, type Oido, type Umbral, type Umbrales, type Via } from './audiograma'
import { audiogramaPNG } from './dibujo'
import { Grafico, Leyenda, SimboloSVG } from './Grafico'
import { audiometriaPDF } from './pdf'

interface Sel {
  oido: Oido
  via: Via
  f: Frecuencia
}
const COLS: { oido: Oido; via: Via; label: string }[] = [
  { oido: 'der', via: 'aerea', label: 'Aérea der.' },
  { oido: 'der', via: 'osea', label: 'Ósea der.' },
  { oido: 'izq', via: 'aerea', label: 'Aérea izq.' },
  { oido: 'izq', via: 'osea', label: 'Ósea izq.' },
]

export function Audiograma() {
  const { id: pid, patient } = useActivePatient()
  const settings = useSettings()
  const puede = useCanRegistro('audiometria', 'write')
  const [u, setU] = useState<Umbrales>(vacio)
  const [sel, setSel] = useState<Sel>({ oido: 'der', via: 'aerea', f: 1000 })
  const [equipo, setEquipo] = useState('')
  const [notas, setNotas] = useState('')
  const it = useMemo(() => interpretar(u), [u])
  const actual = u[sel.oido][sel.via][sel.f]

  const fijar = (s: Sel, patch: Partial<Umbral> | null) =>
    setU((prev) => {
      const n: Umbrales = { der: { aerea: { ...prev.der.aerea }, osea: { ...prev.der.osea } }, izq: { aerea: { ...prev.izq.aerea }, osea: { ...prev.izq.osea } } }
      if (patch === null) delete n[s.oido][s.via][s.f]
      else n[s.oido][s.via][s.f] = { db: null, ...n[s.oido][s.via][s.f], ...patch }
      return n
    })

  const paso = (d: number) => {
    const v = actual?.db ?? 20
    fijar(sel, { db: Math.max(DB_MIN, Math.min(DB_MAX, v + d)) })
  }

  const hayDatos = it.ptaDer !== null || it.ptaIzq !== null || FRECUENCIAS.some((f) => u.der.aerea[f]?.db != null || u.izq.aerea[f]?.db != null)

  function png() {
    return audiogramaPNG(u, 'Audiograma', patient ? `${nombreCompleto(patient)} · ${fmtFecha(new Date().toISOString())}${equipo ? ' · ' + equipo : ''}` : '')
  }

  function guardar() {
    if (!pid || !patient) return
    const fecha = new Date().toISOString()
    const imagen = png()
    const grado = it.global.grado
    add('documents', { patientId: pid, tipo: 'estudio', nombre: `Audiograma ${fmtFecha(fecha)}`, mime: 'image/png', dataUrl: imagen, meta: { modulo: 'audiometria' } })
    add('registros', {
      patientId: pid,
      tipo: 'audiometria',
      estado: 'completada',
      titulo: `Audiometría: ${grado ? grado.nombre.toLowerCase() : 'umbrales capturados'}${it.ptaDer !== null ? ` · PTA OD ${it.ptaDer}` : ''}${it.ptaIzq !== null ? ` · OI ${it.ptaIzq} dB HL` : ''}`,
      datos: {
        modo: 'audiograma',
        umbrales: u,
        pta: { der: it.ptaDer, izq: it.ptaIzq },
        grado: grado?.id ?? null,
        unilateral: it.global.unilateral,
        asimetria: it.asim.asimetrica ? it.asim.frecuencias : [],
        brecha: { der: it.brechaDer.frecuencias, izq: it.brechaIzq.frecuencias },
        hallazgos: it.referir,
        equipo: equipo || undefined,
        notas: notas || undefined,
      },
    })
    toast('Audiometría guardada (registro e imagen en documentos).', 'ok')
  }

  function pdf() {
    if (!patient) return
    const blob = audiometriaPDF({ u, png: png(), p: patient, s: settings, it, equipo, notas, fecha: new Date().toISOString() })
    downloadBlob(blob, `audiometria-${patient.apellidos.split(' ')[0].toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div className="space-y-4">
      <Notice>
        Capture los umbrales obtenidos con un <b>audiómetro calibrado</b> (ISO 389 / ANSI S3.6) en cabina o ambiente silencioso. Toque una celda de la tabla o un punto del
        audiograma para editar.
      </Notice>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Audiograma">
          <div className="flex justify-center">
            <Grafico u={u} titulo="Audiograma capturado" onPunto={(f, db) => {
              const s = { ...sel, f }
              setSel(s)
              fijar(s, { db })
            }} />
          </div>
          <div className="mt-3">
            <Leyenda />
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Editar umbral">
            <div className="grid grid-cols-2 gap-2">
              <div role="radiogroup" aria-label="Oído" className="col-span-2 grid grid-cols-2 gap-2">
                {(['der', 'izq'] as Oido[]).map((o) => (
                  <button
                    key={o}
                    role="radio"
                    aria-checked={sel.oido === o}
                    onClick={() => setSel({ ...sel, oido: o })}
                    className={cx('rounded-lg border px-2 py-1.5 text-sm font-medium', sel.oido === o ? (o === 'der' ? 'border-red-600 bg-red-600/10 text-red-600 dark:text-red-400' : 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400') : 'border-line')}
                  >
                    {o === 'der' ? 'Derecho (rojo)' : 'Izquierdo (azul)'}
                  </button>
                ))}
              </div>
              <Field label="Vía">
                <Select value={sel.via} onChange={(e) => setSel({ ...sel, via: e.target.value as Via })}>
                  <option value="aerea">Aérea</option>
                  <option value="osea">Ósea</option>
                </Select>
              </Field>
              <Field label="Frecuencia">
                <Select value={sel.f} onChange={(e) => setSel({ ...sel, f: Number(e.target.value) as Frecuencia })}>
                  {FRECUENCIAS.map((f) => (
                    <option key={f} value={f}>
                      {f} Hz
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Umbral (dB HL)" className="col-span-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => paso(-5)} aria-label="Bajar 5 dB">
                    <Minus className="size-4" />
                  </Button>
                  <Select value={actual?.db ?? ''} onChange={(e) => (e.target.value === '' ? fijar(sel, null) : fijar(sel, { db: Number(e.target.value) }))}>
                    <option value="">— sin dato —</option>
                    {Array.from({ length: (DB_MAX - DB_MIN) / 5 + 1 }, (_, i) => DB_MIN + i * 5).map((v) => (
                      <option key={v} value={v}>
                        {v} dB
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" onClick={() => paso(5)} aria-label="Subir 5 dB">
                    <Plus className="size-4" />
                  </Button>
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!actual?.enmascarado} disabled={actual?.db == null} onChange={(e) => fijar(sel, { enmascarado: e.target.checked })} /> Enmascarado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!actual?.sinRespuesta} disabled={actual?.db == null} onChange={(e) => fijar(sel, { sinRespuesta: e.target.checked })} /> Sin respuesta
              </label>
            </div>
          </Card>
          <Card title="Interpretación">
            <Resumen it={it} />
          </Card>
        </div>
      </div>

      <Card title="Tabla de umbrales (dB HL)" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 text-left font-medium">Hz</th>
                {COLS.map((c) => (
                  <th key={c.label} className="px-1 py-2 text-center font-medium">
                    <span className="inline-flex items-center gap-1">
                      <svg width={18} height={16} aria-hidden="true">
                        <SimboloSVG oido={c.oido} via={c.via} enm={false} x={c.via === 'osea' ? (c.oido === 'der' ? 14 : 4) : 9} y={8} s={9} />
                      </svg>
                      {c.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FRECUENCIAS.map((f) => (
                <tr key={f} className="border-b border-line last:border-0">
                  <th className="px-2 py-1 text-left font-medium tabular-nums">{etiquetaFrec(f)}</th>
                  {COLS.map((c) => {
                    const t = u[c.oido][c.via][f]
                    const activo = sel.oido === c.oido && sel.via === c.via && sel.f === f
                    return (
                      <td key={c.label} className="px-1 py-1 text-center">
                        <button
                          onClick={() => setSel({ oido: c.oido, via: c.via, f })}
                          aria-label={`${c.label} ${f} Hz: ${t?.db != null ? `${t.db} dB` : 'sin dato'}`}
                          aria-pressed={activo}
                          className={cx('h-8 w-full min-w-14 rounded-md border text-sm tabular-nums', activo ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:bg-surface-2')}
                        >
                          {t?.db != null ? (
                            <>
                              {t.db}
                              {t.enmascarado && <sup className="ml-0.5 text-[10px] text-muted">M</sup>}
                              {t.sinRespuesta && <sup className="ml-0.5 text-[10px] text-muted">NR</sup>}
                            </>
                          ) : (
                            <span className="text-muted">·</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Datos del estudio">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Equipo / lugar (opcional)">
            <Input value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="Audiómetro, cabina, calibración vigente…" />
          </Field>
          <Field label="Notas">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Otoscopia, timpanometría, logoaudiometría…" className="min-h-10" />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={async () => {
              if (await confirmar('Se borrarán los umbrales capturados que aún no se guardaron.', { titulo: '¿Limpiar audiograma?', aceptar: 'Limpiar', peligro: true })) setU(vacio())
            }} disabled={!hayDatos}>
            <Trash2 className="size-4" /> Limpiar
          </Button>
          <Button onClick={pdf} disabled={!hayDatos || !patient}>
            <FileDown className="size-4" /> Reporte PDF
          </Button>
          {puede && (
            <Button variant="primary" onClick={guardar} disabled={!hayDatos || !patient}>
              <Save className="size-4" /> Guardar en expediente
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

export function Resumen({ it }: { it: ReturnType<typeof interpretar> }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        {([
          ['Derecho', it.ptaDer, it.gradoDer],
          ['Izquierdo', it.ptaIzq, it.gradoIzq],
        ] as const).map(([n, v, g]) => (
          <div key={n} className="rounded-lg border border-line p-2">
            <div className="text-xs text-muted">PTA {n}</div>
            <div className="text-lg font-semibold tabular-nums">{v ?? '—'}{v !== null && <span className="text-xs font-normal text-muted"> dB HL</span>}</div>
            {g && <Badge tone={g.tono}>{g.nombre}</Badge>}
          </div>
        ))}
      </div>
      {it.global.grado ? (
        <p>
          <b>Grado OMS (mejor oído):</b> {it.global.grado.nombre} ({it.global.grado.rango})
          {it.global.unilateral && <Badge tone="warn">Pérdida unilateral</Badge>}
        </p>
      ) : (
        <p className="text-muted">Capture 500, 1000, 2000 y 4000 Hz por vía aérea para calcular el PTA.</p>
      )}
      {it.referir.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs">
          {it.referir.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Grados OMS 2021: normal &lt;20 · leve 20–&lt;35 · moderada 35–&lt;50 · mod. severa 50–&lt;65 · severa 65–&lt;80 · profunda 80–&lt;95 · completa ≥95 dB HL. Brecha
        aéreo-ósea ≥15 dB en ≥2 frecuencias (criterio convencional, verificar según su protocolo).
      </p>
    </div>
  )
}
