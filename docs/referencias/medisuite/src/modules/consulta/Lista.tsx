import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePen, Lock, Plus, Search } from 'lucide-react'
import { useDB } from '../../lib/store'
import { cx, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { Avatar, Badge, Button, Empty, Input, Page } from '../../components/ui'
import { norm } from './cie10'

type Filtro = 'todas' | 'borradores' | 'firmadas'

export default function Lista() {
  const db = useDB()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const pmap = useMemo(() => new Map(db.patients.map((p) => [p.id, p])), [db.patients])

  const lista = useMemo(() => {
    const nq = norm(q)
    return db.encounters
      .filter((e) => (filtro === 'borradores' ? !e.firmada : filtro === 'firmadas' ? e.firmada : true))
      .filter((e) => {
        if (!nq) return true
        const p = pmap.get(e.patientId)
        return norm(`${p ? nombreCompleto(p) : ''} ${e.motivo ?? ''} ${e.plantilla} ${e.diagnosticos.map((d) => d.codigo + ' ' + d.nombre).join(' ')}`).includes(nq)
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [db.encounters, pmap, q, filtro])

  const borradores = db.encounters.filter((e) => !e.firmada).length

  return (
    <Page
      title="Consulta"
      subtitle="Notas clínicas recientes"
      actions={
        <Button variant="primary" onClick={() => nav('/consulta/nueva')}>
          <Plus className="size-4" /> Nueva consulta
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente, motivo o diagnóstico…" className="pl-9" />
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {(['todas', 'borradores', 'firmadas'] as Filtro[]).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={cx('rounded-md px-3 py-1.5 text-sm capitalize', filtro === f ? 'bg-brand-soft font-medium text-brand-strong' : 'text-muted')}>
              {f}
              {f === 'borradores' && borradores > 0 && <span className="ml-1 text-xs text-warn">({borradores})</span>}
            </button>
          ))}
        </div>
      </div>
      {lista.length === 0 ? (
        <Empty>No hay notas.</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          {lista.map((e) => {
            const p = pmap.get(e.patientId)
            return (
              <li key={e.id}>
                <button onClick={() => nav('/consulta/' + e.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  {p && <Avatar p={p} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p ? nombreCompleto(p) : 'Paciente eliminado'}</span>
                      <Badge>{e.plantilla}</Badge>
                      {e.firmada ? (
                        <Badge tone="ok">
                          <Lock className="mr-1 size-3" /> Firmada
                        </Badge>
                      ) : (
                        <Badge tone="warn">
                          <FilePen className="mr-1 size-3" /> Borrador
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-sm text-muted">{e.motivo || 'Sin motivo'}</div>
                    {e.diagnosticos.length > 0 && (
                      <div className="mt-1 truncate text-xs text-muted">{e.diagnosticos.map((d) => `${d.codigo} ${d.nombre}`).join(' · ')}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted">{fmtFechaHora(e.fecha)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Page>
  )
}
