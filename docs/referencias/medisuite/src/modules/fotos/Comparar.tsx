import { useRef, useState, type PointerEvent as RPE } from 'react'
import { ChevronsLeftRight } from 'lucide-react'
import type { DocumentFile } from '../../lib/types'
import { Card, Field, Select, Tabs, Empty } from '../../components/ui'
import { fmtFecha } from '../../lib/utils'
import { meta } from './img'

const etiqueta = (f: DocumentFile) => `${meta(f).zona ?? 'Foto'} · ${fmtFecha(f.fecha)}`

export default function Comparar({ fotos, sel, setSel }: { fotos: DocumentFile[]; sel: string[]; setSel: (s: string[]) => void }) {
  const [modo, setModo] = useState<'slider' | 'lado'>('slider')
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const ordenadas = [...fotos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const A = fotos.find((f) => f.id === sel[0])
  const B = fotos.find((f) => f.id === sel[1])

  const mover = (e: RPE) => {
    const r = box.current!.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
  }
  const sele = (i: 0 | 1, id: string) => { const s = [...sel]; s[i] = id; setSel(s) }
  const m = A ? meta(A) : null

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Antes">
            <Select value={sel[0] ?? ''} onChange={(e) => sele(0, e.target.value)}>
              <option value="">Elegir…</option>
              {ordenadas.map((f) => <option key={f.id} value={f.id}>{etiqueta(f)}</option>)}
            </Select>
          </Field>
          <Field label="Después">
            <Select value={sel[1] ?? ''} onChange={(e) => sele(1, e.target.value)}>
              <option value="">Elegir…</option>
              {ordenadas.map((f) => <option key={f.id} value={f.id}>{etiqueta(f)}</option>)}
            </Select>
          </Field>
        </div>
      </Card>
      {!A || !B ? (
        <Empty>Elige dos fotos (o márcalas en la galería) para compararlas.</Empty>
      ) : (
        <Card pad={false}>
          <div className="px-4 pt-3"><Tabs tabs={[{ id: 'slider', label: 'Deslizador' }, { id: 'lado', label: 'Lado a lado' }]} value={modo} onChange={setModo} /></div>
          {modo === 'slider' ? (
            <div className="px-4 pb-4">
              <div
                ref={box}
                className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-lg bg-black"
                style={{ aspectRatio: m?.ancho && m.alto ? `${m.ancho}/${m.alto}` : '4/3', maxHeight: '70vh' }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); mover(e) }}
                onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) mover(e) }}
              >
                <img src={B.dataUrl} alt="Después" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
                <img src={A.dataUrl} alt="Antes" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
                <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow" style={{ left: `${pos}%` }}>
                  <div className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-black shadow-lg">
                    <ChevronsLeftRight className="size-5" />
                  </div>
                </div>
                <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Antes · {fmtFecha(A.fecha)}</span>
                <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Después · {fmtFecha(B.fecha)}</span>
              </div>
              <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(+e.target.value)} className="mt-3 w-full accent-[var(--color-brand)]" aria-label="Posición del divisor" />
            </div>
          ) : (
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
              {[A, B].map((f, i) => (
                <figure key={f.id}>
                  <img src={f.dataUrl} alt="" className="w-full rounded-lg bg-black object-contain" />
                  <figcaption className="mt-1 text-xs text-muted"><b>{i ? 'Después' : 'Antes'}</b> · {etiqueta(f)}{meta(f).nota ? ` · ${meta(f).nota}` : ''}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
