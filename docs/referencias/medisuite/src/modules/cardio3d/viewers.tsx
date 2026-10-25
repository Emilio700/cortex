import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { Heart3D, Fluoro } from './views'
import type { Model, Sys } from './anatomy'
import { cx } from '../../lib/utils'

export interface ViewReq { dir: [number, number, number]; up?: [number, number, number]; key: number }

export function Viewer3D(p: {
  model: Model
  highlight?: string[]
  onPick?: (id: string | null) => void
  onHover?: (id: string | null) => void
  beating?: boolean
  hr?: number
  opacity?: number
  labels?: boolean
  view?: ViewReq | null
  carm?: { lao: number; cra: number } | null
  inst?: RefObject<Heart3D | null>
  className?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const h = useRef<Heart3D | null>(null)
  const cb = useRef(p)
  cb.current = p
  useEffect(() => {
    const v = new Heart3D(el.current!)
    v.onPick = (id) => cb.current.onPick?.(id)
    v.onHover = (id) => cb.current.onHover?.(id)
    h.current = v
    if (p.inst) p.inst.current = v
    return () => {
      v.dispose()
      h.current = null
      if (p.inst) p.inst.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => h.current?.setModel(p.model), [p.model])
  const hl = (p.highlight ?? []).join(',')
  useEffect(() => h.current?.setHighlight(hl ? hl.split(',') : []), [hl, p.model])
  useEffect(() => h.current?.setBeating(!!p.beating, p.hr ?? 70), [p.beating, p.hr])
  useEffect(() => h.current?.setOpacity(p.opacity ?? 1), [p.opacity])
  useEffect(() => h.current?.setLabels(p.labels ?? true), [p.labels])
  useEffect(() => h.current?.setCarm(p.carm ? p.carm.lao : null, p.carm?.cra ?? 0), [p.carm?.lao, p.carm?.cra, p.carm])
  useEffect(() => {
    if (p.view) h.current?.setView(new THREE.Vector3(...p.view.dir), p.view.up ? new THREE.Vector3(...p.view.up) : undefined)
  }, [p.view])
  return <div ref={el} className={cx('overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_35%,#334155,#0b1120)]', p.className)} />
}

export function FluoroView(p: {
  model: Model
  lao: number
  cra: number
  sys: Sys | 'both'
  injectKey?: number
  inst?: RefObject<Fluoro | null>
  className?: string
  overlay?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const f = useRef<Fluoro | null>(null)
  useEffect(() => {
    const v = new Fluoro(el.current!)
    f.current = v
    if (p.inst) p.inst.current = v
    return () => {
      v.dispose()
      f.current = null
      if (p.inst) p.inst.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => f.current?.setModel(p.model), [p.model])
  useEffect(() => f.current?.setAngles(p.lao, p.cra), [p.lao, p.cra])
  useEffect(() => f.current?.setSystem(p.sys), [p.sys, p.model])
  useEffect(() => {
    if (p.injectKey) f.current?.inject()
  }, [p.injectKey])
  return (
    <div className={cx('relative overflow-hidden rounded-lg bg-black', p.className)}>
      <div ref={el} className="absolute inset-0" />
      {p.overlay !== false && (
        <div className="pointer-events-none absolute left-2 top-2 font-mono text-[11px] leading-tight text-white/80">
          <div>{angLabel(p.lao, p.cra)}</div>
          <div>{p.sys === 'L' ? 'Coronaria izquierda' : p.sys === 'R' ? 'Coronaria derecha' : 'Ambos sistemas'}</div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 right-2 font-mono text-[10px] text-white/60">SIMULACIÓN</div>
    </div>
  )
}

export function angLabel(lao: number, cra: number) {
  const a = lao === 0 ? 'AP' : `${lao > 0 ? 'LAO' : 'RAO'} ${Math.abs(lao)}°`
  const b = cra === 0 ? '' : ` ${cra > 0 ? 'CRA' : 'CAU'} ${Math.abs(cra)}°`
  return a + b
}
