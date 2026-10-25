import { useMemo, useState } from 'react'
import { Search, Star, X } from 'lucide-react'
import type { Diagnostico } from '../../lib/types'
import { useCollection } from '../../lib/store'
import { cx } from '../../lib/utils'
import { Input } from '../../components/ui'
import { buscarCie10 } from './cie10'

export function CieBuscador({ value, onChange, disabled }: { value: Diagnostico[]; onChange: (v: Diagnostico[]) => void; disabled?: boolean }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const encuentros = useCollection('encounters')
  const res = useMemo(() => buscarCie10(q), [q])

  // "Más usados" por este médico, calculado de sus notas
  const frecuentes = useMemo(() => {
    const m = new Map<string, { d: Diagnostico; n: number }>()
    for (const e of encuentros) for (const d of e.diagnosticos) m.set(d.codigo, { d, n: (m.get(d.codigo)?.n ?? 0) + 1 })
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((x) => x.d)
  }, [encuentros])

  const agregar = (d: Diagnostico) => {
    if (!value.some((x) => x.codigo === d.codigo)) onChange([...value, d])
    setQ('')
    setSel(0)
  }
  const libres = frecuentes.filter((f) => !value.some((v) => v.codigo === f.codigo))

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {value.map((d, i) => (
            <li key={d.codigo} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-1.5 text-sm">
              <span className="w-14 shrink-0 font-mono text-xs font-semibold text-brand">{d.codigo}</span>
              <span className="min-w-0 flex-1">{d.nombre}</span>
              {i === 0 && <span className="hidden text-[10px] uppercase text-muted sm:inline">Principal</span>}
              {!disabled && (
                <button onClick={() => onChange(value.filter((x) => x.codigo !== d.codigo))} aria-label={`Quitar ${d.codigo}`} className="text-muted hover:text-danger">
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setSel(0)
                setAbierto(true)
              }}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, res.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
                if (e.key === 'Enter' && res[sel]) { e.preventDefault(); agregar(res[sel]) }
                if (e.key === 'Escape') setQ('')
              }}
              placeholder="Buscar CIE-10: código, nombre o palabra común (ej. azúcar, gripa, presión)…"
              className="pl-9"
              aria-label="Buscar diagnóstico CIE-10"
            />
            {abierto && q.trim() && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
                {res.map((c, i) => (
                  <li key={c.codigo}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setSel(i)}
                      onClick={() => agregar(c)}
                      className={cx('flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm', i === sel && 'bg-surface-2')}
                    >
                      <span className="w-14 shrink-0 font-mono text-xs font-semibold text-brand">{c.codigo}</span>
                      <span className="min-w-0 flex-1">{c.nombre}</span>
                    </button>
                  </li>
                ))}
                {res.length === 0 && (
                  <li>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => agregar({ codigo: 'S/C', nombre: q.trim() })}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-surface-2"
                    >
                      Sin coincidencias en el catálogo local. Agregar «{q.trim()}» sin código
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          {libres.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Star className="size-3" /> Más usados:
              </span>
              {libres.map((d) => (
                <button
                  key={d.codigo}
                  onClick={() => agregar(d)}
                  title={d.nombre}
                  className="max-w-56 truncate rounded-full border border-line px-2 py-0.5 text-xs hover:border-brand hover:text-brand"
                >
                  <b className="font-mono">{d.codigo}</b> {d.nombre}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
