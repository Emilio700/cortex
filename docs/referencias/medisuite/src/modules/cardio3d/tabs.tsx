import { useMemo, useState } from 'react'
import { Syringe, Crosshair } from 'lucide-react'
import { Card, Button, Field, Select, Badge } from '../../components/ui'
import { cx } from '../../lib/utils'
import { SEG, SEGMENTS, type Artery, type Dominance, type Model, type Sys } from './anatomy'
import { CAM_VIEWS, CARM_PRESETS } from './data'
import { Viewer3D, FluoroView, angLabel, type ViewReq } from './viewers'
import { carmDir } from './anatomy'

export interface Carm { lao: number; cra: number; sys: Sys | 'both' }
export const ARTERY_NAME: Record<Artery, string> = { TCI: 'Tronco (TCI)', DA: 'Descendente anterior (DA)', Cx: 'Circunfleja (Cx)', CD: 'Coronaria derecha (CD)' }

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
export function Range({ label, value, min, max, step = 1, onChange, fmt }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <Field label={`${label}: ${fmt ? fmt(value) : value}`}>
      <input type="range" className="w-full accent-[var(--color-brand)]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </Field>
  )
}
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', value === o.id ? 'bg-brand text-white dark:text-black' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SegList({ model, sel, onSel }: { model: Model; sel: string | null; onSel: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {(['TCI', 'DA', 'Cx', 'CD'] as Artery[]).filter((a) => SEGMENTS.some((s) => s.artery === a && model.available.includes(s.id))).map((a) => (
        <div key={a}>
          <div className="mb-1 text-xs font-semibold text-muted">{ARTERY_NAME[a]}</div>
          <div className="flex flex-wrap gap-1">
            {SEGMENTS.filter((s) => s.artery === a && model.available.includes(s.id)).map((s) => (
              <button key={s.id} title={s.name} onClick={() => onSel(s.id)} className={cx('rounded-md border px-2 py-0.5 text-xs', sel === s.id ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line hover:bg-surface-2')}>
                {s.num === '—' ? s.id : s.num}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TabAnatomia(p: { model: Model; dom: Dominance; setDom: (d: Dominance) => void; ramus: boolean; setRamus: (v: boolean) => void; hr: number; setHr: (v: number) => void }) {
  const [sel, setSel] = useState<string | null>('6')
  const [hover, setHover] = useState<string | null>(null)
  const [beat, setBeat] = useState(false)
  const [op, setOp] = useState(1)
  const [labels, setLabels] = useState(true)
  const [view, setView] = useState<ViewReq | null>(null)
  const info = SEG[hover ?? sel ?? '']
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="relative">
        <Viewer3D model={p.model} highlight={sel ? [sel] : []} onPick={(id) => id && setSel(id)} onHover={setHover} beating={beat} hr={p.hr} opacity={op} labels={labels} view={view} className="h-[400px] sm:h-[560px]" />
        <div className="pointer-events-none absolute left-2 top-2 max-w-[80%] rounded-lg bg-black/60 px-2.5 py-1.5 text-xs text-white">
          {info ? (
            <>
              <b>Segmento {info.num}</b> · {info.name}
              <div className="text-white/70">{ARTERY_NAME[info.artery]}</div>
            </>
          ) : (
            'Pasa el cursor o toca un segmento'
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CAM_VIEWS.map((v) => (
            <Button key={v.id} size="sm" onClick={() => setView({ dir: v.dir, up: v.up, key: Date.now() })}>
              {v.name}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Card title="Modelo">
          <div className="space-y-3">
            <Field label="Dominancia">
              <Seg value={p.dom} onChange={p.setDom} options={[{ id: 'R', label: 'Derecha (≈85 %)' }, { id: 'L', label: 'Izquierda' }]} />
            </Field>
            <Check label="Ramo intermedio (12)" checked={p.ramus} onChange={p.setRamus} />
            <Check label="Números de segmento" checked={labels} onChange={setLabels} />
            <Check label="Latido" checked={beat} onChange={setBeat} />
            {beat && <Range label="Frecuencia cardiaca" value={p.hr} min={40} max={160} onChange={p.setHr} fmt={(v) => `${v} lpm`} />}
            <Range label="Opacidad del miocardio" value={op} min={0.15} max={1} step={0.05} onChange={setOp} fmt={(v) => `${Math.round(v * 100)} %`} />
          </div>
        </Card>
        <Card title="Segmentos (AHA/SYNTAX)">
          <SegList model={p.model} sel={sel} onSel={setSel} />
          <p className="mt-3 text-xs text-muted">
            Numeración SYNTAX: 1–3 CD, 4 DP, 16 PL; 5 TCI; 6–8 DA, 9–10 diagonales; 11 y 13 Cx, 12 intermedio, 12a/12b obtusas marginales, 14 PL izq., 15 DP de Cx (dominancia izquierda).
          </p>
        </Card>
      </div>
    </div>
  )
}

export function CarmControls({ carm, setCarm, onInject }: { carm: Carm; setCarm: (c: Carm) => void; onInject: () => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Range label="LAO (+) / RAO (−)" value={carm.lao} min={-90} max={90} onChange={(lao) => setCarm({ ...carm, lao })} fmt={(v) => (v === 0 ? 'AP' : `${v > 0 ? 'LAO' : 'RAO'} ${Math.abs(v)}°`)} />
      <Range label="CRA (+) / CAU (−)" value={carm.cra} min={-45} max={45} onChange={(cra) => setCarm({ ...carm, cra })} fmt={(v) => (v === 0 ? '0°' : `${v > 0 ? 'CRA' : 'CAU'} ${Math.abs(v)}°`)} />
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Seg value={carm.sys} onChange={(sys) => setCarm({ ...carm, sys })} options={[{ id: 'L', label: 'Izquierda' }, { id: 'R', label: 'Derecha' }, { id: 'both', label: 'Ambas' }]} />
        <Button variant="primary" size="sm" onClick={onInject}>
          <Syringe className="size-4" /> Inyección de contraste
        </Button>
      </div>
    </div>
  )
}

export function TabAngio(p: { model: Model; carm: Carm; setCarm: (c: Carm) => void }) {
  const [inj, setInj] = useState(0)
  const [preset, setPreset] = useState<string | null>(null)
  const [view, setView] = useState<ViewReq | null>(null)
  const pr = CARM_PRESETS.find((x) => x.id === preset && x.lao === p.carm.lao && x.cra === p.carm.cra)
  const carm3d = useMemo(() => ({ lao: p.carm.lao, cra: p.carm.cra }), [p.carm.lao, p.carm.cra])
  const align = () => {
    const d = carmDir(p.carm.lao, p.carm.cra)
    setView({ dir: [d.x, d.y, d.z], key: Date.now() })
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative">
          <Viewer3D model={p.model} carm={carm3d} highlight={pr?.best ?? []} labels={false} view={view} className="aspect-square w-full" />
          <Button size="sm" className="absolute bottom-2 left-2" onClick={align}>
            <Crosshair className="size-4" /> Ver desde el arco en C
          </Button>
        </div>
        <FluoroView model={p.model} lao={p.carm.lao} cra={p.carm.cra} sys={p.carm.sys} injectKey={inj} className="aspect-square w-full" />
      </div>
      <Card title={`Arco en C virtual · ${angLabel(p.carm.lao, p.carm.cra)}`}>
        <CarmControls carm={p.carm} setCarm={(c) => (setPreset(null), p.setCarm(c))} onInject={() => setInj((k) => k + 1)} />
        <p className="mt-2 text-xs text-muted">
          LAO/RAO: rotación alrededor del eje largo del paciente (posición del intensificador de imagen). CRA/CAU: inclinación hacia la cabeza o los pies. En LAO la columna aparece a la derecha de la imagen; en RAO, a la izquierda.
        </p>
      </Card>
      <Card title="Proyecciones estándar">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CARM_PRESETS.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                setPreset(x.id)
                p.setCarm({ lao: x.lao, cra: x.cra, sys: x.sys })
                setInj((k) => k + 1)
              }}
              className={cx('rounded-lg border p-2.5 text-left text-sm transition', preset === x.id ? 'border-brand bg-brand-soft/60' : 'border-line hover:bg-surface-2')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{x.name}</span>
                <Badge tone={x.sys === 'L' ? 'brand' : 'warn'}>{x.sys === 'L' ? 'Izq.' : 'Der.'}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-muted">{x.note}</div>
              <div className="mt-1 text-[11px] text-muted">Segmentos: {x.best.join(', ')}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function PresetSelect({ carm, setCarm }: { carm: Carm; setCarm: (c: Carm) => void }) {
  const cur = CARM_PRESETS.find((x) => x.lao === carm.lao && x.cra === carm.cra && x.sys === carm.sys)
  return (
    <Select value={cur?.id ?? ''} onChange={(e) => { const x = CARM_PRESETS.find((y) => y.id === e.target.value); if (x) setCarm({ lao: x.lao, cra: x.cra, sys: x.sys }) }}>
      <option value="">{angLabel(carm.lao, carm.cra)} (personalizada)</option>
      {CARM_PRESETS.map((x) => (
        <option key={x.id} value={x.id}>{x.name}</option>
      ))}
    </Select>
  )
}
