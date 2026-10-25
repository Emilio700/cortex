import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Search, UserPlus } from 'lucide-react'
import { setActivePatient, useDB } from '../../lib/store'
import { edad, fmtFecha, nombreCompleto } from '../../lib/utils'
import { Avatar, Badge, Button, Empty, Input, Page, Select } from '../../components/ui'

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Orden = 'nombre' | 'reciente' | 'edad'

export default function Lista() {
  const db = useDB()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sexo, setSexo] = useState('')
  const [grupo, setGrupo] = useState('')
  const [conAlergias, setConAlergias] = useState(false)
  const [orden, setOrden] = useState<Orden>('nombre')

  // Última visita y próxima cita por paciente
  const info = useMemo(() => {
    const now = new Date().toISOString()
    const m = new Map<string, { ultima?: string; proxima?: string }>()
    const get = (id: string) => m.get(id) ?? (m.set(id, {}), m.get(id)!)
    for (const e of db.encounters) {
      const x = get(e.patientId)
      if (!x.ultima || e.fecha > x.ultima) x.ultima = e.fecha
    }
    for (const a of db.appointments) {
      const x = get(a.patientId)
      if (a.estado === 'atendida' && a.inicio < now && (!x.ultima || a.inicio > x.ultima)) x.ultima = a.inicio
      if (a.inicio >= now && a.estado !== 'cancelada' && (!x.proxima || a.inicio < x.proxima)) x.proxima = a.inicio
    }
    return m
  }, [db.encounters, db.appointments])

  const lista = useMemo(() => {
    const nq = norm(q.trim())
    const r = db.patients.filter((p) => {
      if (nq && !norm(`${nombreCompleto(p)} ${p.curp ?? ''} ${p.telefono ?? ''} ${p.email ?? ''}`).includes(nq)) return false
      if (sexo && p.sexo !== sexo) return false
      const a = edad(p.fechaNac).anios
      if (grupo === 'ninos' && a >= 18) return false
      if (grupo === 'adultos' && (a < 18 || a >= 60)) return false
      if (grupo === 'mayores' && a < 60) return false
      if (conAlergias && p.alergias.length === 0) return false
      return true
    })
    return r.sort((a, b) => {
      if (orden === 'edad') return a.fechaNac.localeCompare(b.fechaNac)
      if (orden === 'reciente') return (info.get(b.id)?.ultima ?? '').localeCompare(info.get(a.id)?.ultima ?? '')
      return `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es')
    })
  }, [db.patients, q, sexo, grupo, conAlergias, orden, info])

  const abrir = (id: string) => {
    setActivePatient(id)
    nav('/pacientes/' + id)
  }

  return (
    <Page
      title="Pacientes"
      subtitle={`${db.patients.length} pacientes registrados`}
      actions={
        <Button variant="primary" onClick={() => nav('/pacientes/nuevo')}>
          <UserPlus className="size-4" /> Nuevo paciente
        </Button>
      }
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, CURP o teléfono…" className="pl-9" autoFocus />
        </div>
        <Select value={sexo} onChange={(e) => setSexo(e.target.value)} aria-label="Sexo">
          <option value="">Todos los sexos</option>
          <option value="F">Femenino</option>
          <option value="M">Masculino</option>
          <option value="O">Otro</option>
        </Select>
        <Select value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo de edad">
          <option value="">Todas las edades</option>
          <option value="ninos">Menores de 18</option>
          <option value="adultos">18 a 59 años</option>
          <option value="mayores">60 años o más</option>
        </Select>
        <Select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar">
          <option value="nombre">Ordenar: apellido</option>
          <option value="reciente">Ordenar: última visita</option>
          <option value="edad">Ordenar: edad</option>
        </Select>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm">
          <input type="checkbox" checked={conAlergias} onChange={(e) => setConAlergias(e.target.checked)} /> Con alergias
        </label>
      </div>

      {lista.length === 0 ? (
        <Empty>
          Sin resultados.{' '}
          <button className="font-medium text-brand" onClick={() => nav('/pacientes/nuevo')}>
            Registrar paciente nuevo
          </button>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_20px] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted md:grid">
            <span>Paciente</span>
            <span>CURP / Teléfono</span>
            <span>Última visita</span>
            <span>Próxima cita</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {lista.map((p) => {
              const i = info.get(p.id)
              return (
                <li key={p.id}>
                  <button
                    onClick={() => abrir(p.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_20px] items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_20px]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar p={p} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{nombreCompleto(p)}{p.bloqueado && <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">Bloqueado</span>}</div>
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                          {edad(p.fechaNac).texto} · {p.sexo === 'F' ? 'F' : p.sexo === 'M' ? 'M' : 'Otro'}
                          {p.tipoSangre && ` · ${p.tipoSangre}`}
                          {p.alergias.map((a) => (
                            <Badge key={a} tone="danger">
                              {a}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted md:hidden">
                          {p.telefono}
                          {i?.proxima && ` · Próxima: ${fmtFecha(i.proxima, { day: '2-digit', month: 'short' })}`}
                        </div>
                      </div>
                    </div>
                    <div className="hidden min-w-0 text-xs md:block">
                      <div className="truncate font-mono">{p.curp || <span className="text-muted">Sin CURP</span>}</div>
                      <div className="truncate text-muted">{p.telefono}</div>
                    </div>
                    <div className="hidden text-sm md:block">{i?.ultima ? fmtFecha(i.ultima) : <span className="text-muted">—</span>}</div>
                    <div className="hidden text-sm md:block">
                      {i?.proxima ? (
                        <span>
                          {fmtFecha(i.proxima, { day: '2-digit', month: 'short' })}{' '}
                          <span className="text-muted">{new Date(i.proxima).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </div>
                    <ChevronRight className="size-4 text-muted" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Page>
  )
}
