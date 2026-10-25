import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList, FlaskConical, ListChecks, Plus, Search, Settings2, Trash2, X, ScanLine } from 'lucide-react'
import { Page, Card, Button, Field, Input, Textarea, Select, Badge, Notice, Empty, PatientBar, Tabs, Stat, Disclaimer } from '../../components/ui'
import { add, getDB, useActivePatient, useCollection, useSettings } from '../../lib/store'
import { useCan } from '../../lib/session'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import { usePreferencia } from '../../lib/preferencias'
import type { Diagnostico, Registro } from '../../lib/types'
import { cx, fmtFecha, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { CieBuscador } from '../consulta/CieBuscador'
import { CATALOGO, PAQUETES, buscarEstudios, catalogoCompleto, type Estudio } from './catalogo'
import { siguienteFolio } from './comun'
import {
  ESTADO_CORTO,
  ESTADO_LABEL,
  FLUJO,
  abierta,
  alertaOrden,
  ayunoMaximo,
  datosOrden,
  estadoOrden,
  preparacionCombinada,
  tituloOrden,
  type EstadoOrden,
  type ItemOrden,
  type Urgencia,
} from './ordenes'
import { AccionesPDF, AccionesSeguimiento, useQuien } from './acciones'

type Tab = 'nueva' | 'paciente' | 'clinica' | 'catalogo'
const esOrden = (r: Registro) => r.tipo === 'orden'
const TONO: Record<EstadoOrden, 'neutral' | 'brand' | 'ok' | 'warn' | 'danger'> = { pendiente: 'warn', muestra: 'brand', resultado: 'brand', revisado: 'ok', cancelada: 'neutral' }

function useUmbral() {
  // Clave en minúsculas: el servidor solo acepta [a-z0-9._-] (la anterior «alertaDias» respondía 400).
  // lsKey conserva el valor ya guardado en modo demo.
  return usePreferencia<number>('ordenes.alerta-dias', 'org', 7, { lsKey: 'medisuite.pref.ordenes.alertaDias' })
}

export default function Ordenes() {
  const [tab, setTab] = useState<Tab>('paciente')
  const escribe = useCanRegistro('orden', 'write')
  const medico = useCan('notas.escribir')
  const puedeCrear = escribe && medico
  const ordenes = useRegistros('orden')
  const [umbral] = useUmbral()
  const now = Date.now()
  const alertas = ordenes.filter((r) => abierta(r) && alertaOrden(r, now, umbral)).length
  return (
    <Page title="Órdenes de estudios" subtitle="Laboratorio y gabinete: solicitud en PDF, preparación del paciente y seguimiento de resultados.">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'paciente', label: 'Del paciente' },
          ...(puedeCrear ? [{ id: 'nueva' as const, label: 'Nueva orden' }] : []),
          { id: 'clinica', label: <span className="inline-flex items-center gap-1.5">Pendientes de la clínica {alertas > 0 && <Badge tone="danger">{alertas}</Badge>}</span> },
          { id: 'catalogo', label: 'Catálogo' },
        ]}
      />
      {tab === 'nueva' && puedeCrear && <NuevaOrden onCreada={() => setTab('paciente')} />}
      {tab === 'paciente' && <DelPaciente onNueva={puedeCrear ? () => setTab('nueva') : undefined} />}
      {tab === 'clinica' && <Clinica onAbrir={() => setTab('paciente')} />}
      {tab === 'catalogo' && <Catalogo />}
    </Page>
  )
}

// ---------------------------------------------------------------- Nueva orden
function NuevaOrden({ onCreada }: { onCreada: () => void }) {
  const { patient } = useActivePatient()
  const settings = useSettings()
  const quien = useQuien()
  const [extra] = usePreferencia<Estudio[]>('ordenes.catalogo', 'org', [])
  const [labs, setLabs] = usePreferencia<string[]>('ordenes.laboratorios', 'org', [])
  const catalogo = useMemo(() => catalogoCompleto(Array.isArray(extra) ? extra : []), [extra])
  const grupos = useMemo(() => [...new Set(catalogo.map((e) => e.grupo))], [catalogo])
  const [q, setQ] = useState('')
  const [grupo, setGrupo] = useState('')
  const [items, setItems] = useState<ItemOrden[]>([])
  const [dx, setDx] = useState<Diagnostico[]>([])
  const [dxTexto, setDxTexto] = useState('')
  const [urgencia, setUrgencia] = useState<Urgencia>('ordinaria')
  const [lab, setLab] = useState('')
  const [indic, setIndic] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  // Diagnósticos de la última nota del paciente como sugerencia inicial
  const notas = useCollection('encounters', (e) => e.patientId === patient?.id, [patient?.id])
  useEffect(() => {
    const ultima = [...notas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    setDx(ultima?.diagnosticos ?? [])
    setItems([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id])

  const resultados = useMemo(() => {
    const base = grupo ? catalogo.filter((e) => e.grupo === grupo) : catalogo
    return buscarEstudios(base, q, grupo || q ? 200 : 24)
  }, [catalogo, q, grupo])
  const sel = new Set(items.map((i) => i.id))
  const toggle = (e: Estudio) =>
    setItems((xs) =>
      xs.some((x) => x.id === e.id)
        ? xs.filter((x) => x.id !== e.id)
        : [...xs, { id: e.id, nombre: e.nombre, tipo: e.tipo, ...(e.loinc ? { loinc: e.loinc } : {}), ...(e.preparacion ? { preparacion: e.preparacion } : {}), ...(e.muestra ? { muestra: e.muestra } : {}) }],
    )
  const paquete = (ids: string[]) => ids.forEach((id) => !sel.has(id) && catalogo.find((e) => e.id === id) && toggle(catalogo.find((e) => e.id === id)!))
  const prep = preparacionCombinada(items)
  const ayuno = ayunoMaximo(items)

  if (!patient) return <PatientBar />

  const guardar = () => {
    if (!items.length) return setMsg('Agrega al menos un estudio.')
    const folio = siguienteFolio(
      'OR',
      getDB().registros.filter(esOrden).map((r) => String(r.datos?.folio ?? '')),
    )
    const ahora = new Date().toISOString()
    add('registros', {
      patientId: patient.id,
      tipo: 'orden',
      estado: 'pendiente',
      titulo: tituloOrden(folio, items),
      datos: {
        folio,
        items,
        diagnosticos: dx,
        ...(dxTexto.trim() ? { diagnosticoTexto: dxTexto.trim() } : {}),
        urgencia,
        ...(lab.trim() ? { laboratorio: lab.trim() } : {}),
        ...(indic.trim() ? { indicaciones: indic.trim() } : {}),
        medico: settings.doctor.nombre,
        historial: [{ estado: 'pendiente', fecha: ahora, ...(quien ? { por: quien } : {}) }],
      },
    })
    if (lab.trim() && !labs.includes(lab.trim())) setLabs([...labs, lab.trim()].slice(-30))
    setItems([])
    setIndic('')
    setDxTexto('')
    setMsg(null)
    onCreada()
  }

  return (
    <>
      <PatientBar />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Estudios">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <span className="self-center text-xs text-muted">Paquetes:</span>
            {PAQUETES.map((p) => (
              <button key={p.nombre} onClick={() => paquete(p.ids)} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-brand hover:text-brand">
                <Plus className="mr-0.5 inline size-3" />
                {p.nombre}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: biometría, tórax, TSH, 4548-4…" className="pl-9" aria-label="Buscar estudio" />
            </div>
            <Select value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Filtrar por grupo">
              <option value="">Todos los grupos</option>
              {grupos.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </div>
          <ul className="mt-3 max-h-96 divide-y divide-line overflow-auto rounded-lg border border-line">
            {resultados.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-2">
                  <input type="checkbox" className="mt-1 size-4 accent-[var(--color-brand)]" checked={sel.has(e.id)} onChange={() => toggle(e)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{e.nombre}</span>
                    <span className="block text-xs text-muted">
                      {e.grupo}
                      {e.loinc && <> · LOINC {e.loinc}</>}
                      {e.personalizado && <> · de la clínica</>}
                    </span>
                  </span>
                  <Badge tone={e.tipo === 'gabinete' ? 'brand' : 'neutral'}>{e.tipo === 'gabinete' ? 'Gabinete' : 'Lab'}</Badge>
                </label>
              </li>
            ))}
            {resultados.length === 0 && <li className="p-4 text-center text-sm text-muted">Sin coincidencias. Puedes agregar estudios propios en la pestaña Catálogo.</li>}
          </ul>
          {!q && !grupo && <p className="mt-2 text-xs text-muted">Mostrando los primeros 24 de {catalogo.length}. Busca o filtra por grupo para ver más.</p>}
        </Card>

        <div className="space-y-4">
          <Card title={`Orden (${items.length})`}>
            {items.length === 0 ? (
              <Empty>Selecciona estudios del catálogo o un paquete.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1">{i.nombre}</span>
                    <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== i.id))} aria-label={`Quitar ${i.nombre}`} className="text-muted hover:text-danger">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {prep.length > 0 && (
              <div className="mt-3 rounded-lg bg-brand-soft/40 p-3 text-xs">
                <div className="mb-1 font-semibold">Preparación para el paciente{ayuno > 0 && ` · ayuno de hasta ${ayuno} h`}</div>
                <ul className="list-disc space-y-1 pl-4">
                  {prep.map((p) => (
                    <li key={p.texto}>
                      {p.texto} <span className="text-muted">({p.estudios.length} estudio{p.estudios.length > 1 ? 's' : ''})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card title="Datos de la solicitud">
            <div className="space-y-3">
              <Field label="Diagnóstico presuntivo (CIE-10)">
                <CieBuscador value={dx} onChange={setDx} />
              </Field>
              <Field label="Diagnóstico o datos clínicos en texto libre (opcional)">
                <Input value={dxTexto} onChange={(e) => setDxTexto(e.target.value)} placeholder="Ej. descartar anemia; control anual" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Urgencia">
                  <Select value={urgencia} onChange={(e) => setUrgencia(e.target.value as Urgencia)}>
                    <option value="ordinaria">Ordinaria</option>
                    <option value="urgente">Urgente</option>
                  </Select>
                </Field>
                <Field label="Laboratorio / gabinete destino">
                  <Input value={lab} onChange={(e) => setLab(e.target.value)} list="ordenes-labs" placeholder="A elección del paciente" />
                  <datalist id="ordenes-labs">
                    {labs.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </Field>
              </div>
              <Field label="Indicaciones / datos para el laboratorio">
                <Textarea value={indic} onChange={(e) => setIndic(e.target.value)} placeholder="Ej. paciente en tratamiento con metformina; enviar resultados por correo" />
              </Field>
              {msg && <Notice tone="warn">{msg}</Notice>}
              <Button variant="primary" className="w-full" onClick={guardar} disabled={!items.length}>
                <ClipboardList className="size-4" /> Crear orden
              </Button>
            </div>
          </Card>
        </div>
      </div>
      <Disclaimer>
        Preparación orientativa (OMS para curva de tolerancia a la glucosa; ATS/ERS 2019 para espirometría; ACR Manual on Contrast Media para estudios contrastados). Confirme con el laboratorio destino. Códigos LOINC: loinc.org.
      </Disclaimer>
    </>
  )
}

// ---------------------------------------------------------------- Seguimiento del paciente
function TarjetaOrden({ r, umbral, mostrarPaciente }: { r: Registro; umbral: number; mostrarPaciente?: boolean }) {
  const d = datosOrden(r)
  const e = estadoOrden(r)
  const patient = useCollection('patients', (p) => p.id === r.patientId, [r.patientId])[0]
  const alerta = abierta(r) ? alertaOrden(r, Date.now(), umbral) : null
  return (
    <article className={cx('min-w-0 rounded-xl border bg-surface p-3', alerta ? 'border-danger/50' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{d.folio}</span>
            <Badge tone={TONO[e]}>{ESTADO_CORTO[e]}</Badge>
            {d.urgencia === 'urgente' && <Badge tone="danger">Urgente</Badge>}
          </div>
          {mostrarPaciente && patient && <div className="mt-0.5 text-sm font-medium">{nombreCompleto(patient)}</div>}
          <div className="text-xs text-muted">
            {fmtFecha(r.fecha)}
            {d.laboratorio && <> · {d.laboratorio}</>}
          </div>
        </div>
      </div>
      {alerta && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-danger">
          <AlertTriangle className="size-3.5" /> {alerta}
        </p>
      )}
      <ul className="mt-2 space-y-0.5 text-sm">
        {d.items.slice(0, 6).map((i) => (
          <li key={i.id} className="truncate">
            • {i.nombre}
          </li>
        ))}
        {d.items.length > 6 && <li className="text-xs text-muted">y {d.items.length - 6} más…</li>}
      </ul>
      {d.notaRevision && <p className="mt-2 rounded-md bg-ok/10 px-2 py-1 text-xs">Revisión: {d.notaRevision}</p>}
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Historial</summary>
        <ol className="mt-1 space-y-0.5">
          {d.historial.map((h, i) => (
            <li key={i}>
              {fmtFechaHora(h.fecha)} · {ESTADO_LABEL[h.estado] ?? h.estado}
              {h.por && <> · {h.por}</>}
            </li>
          ))}
        </ol>
      </details>
      <div className="mt-3 space-y-2">
        <AccionesSeguimiento r={r} />
        {patient && <AccionesPDF r={r} patient={patient} compact />}
      </div>
    </article>
  )
}

function DelPaciente({ onNueva }: { onNueva?: () => void }) {
  const { id } = useActivePatient()
  const ordenes = useRegistros('orden', id ?? '')
  const [umbral] = useUmbral()
  const [verCanceladas, setVerCanceladas] = useState(false)
  const lista = [...ordenes].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const canceladas = lista.filter((r) => estadoOrden(r) === 'cancelada')
  return (
    <>
      <PatientBar />
      {id && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">Pendiente → muestra tomada → resultado recibido → revisado por el médico.</p>
            {onNueva && (
              <Button variant="primary" onClick={onNueva}>
                <Plus className="size-4" /> Nueva orden
              </Button>
            )}
          </div>
          {lista.length === 0 ? (
            <Empty>Este paciente no tiene órdenes de estudios.</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {FLUJO.map((e) => {
                const col = lista.filter((r) => estadoOrden(r) === e)
                return (
                  <section key={e} aria-label={ESTADO_LABEL[e]} className="min-w-0 rounded-xl bg-surface-2/60 p-2">
                    <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold tracking-wide text-muted uppercase">
                      {ESTADO_CORTO[e]} <span>{col.length}</span>
                    </h3>
                    <div className="space-y-2">
                      {col.map((r) => (
                        <TarjetaOrden key={r.id} r={r} umbral={umbral} />
                      ))}
                      {col.length === 0 && <p className="px-1 py-3 text-center text-xs text-muted">—</p>}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
          {canceladas.length > 0 && (
            <div className="mt-4">
              <Button size="sm" variant="ghost" onClick={() => setVerCanceladas((v) => !v)}>
                {verCanceladas ? 'Ocultar' : 'Ver'} canceladas ({canceladas.length})
              </Button>
              {verCanceladas && (
                <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {canceladas.map((r) => (
                    <TarjetaOrden key={r.id} r={r} umbral={umbral} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Clínica
function Clinica({ onAbrir }: { onAbrir: () => void }) {
  const ordenes = useRegistros('orden')
  const { setActive } = useActivePatient()
  const [umbral, setUmbral, meta] = useUmbral()
  const [filtro, setFiltro] = useState<'todas' | 'alerta' | EstadoOrden>('todas')
  const now = Date.now()
  const abiertas = ordenes.filter(abierta)
  const conAlerta = abiertas.filter((r) => alertaOrden(r, now, umbral))
  const lista = (filtro === 'todas' ? abiertas : filtro === 'alerta' ? conAlerta : abiertas.filter((r) => estadoOrden(r) === filtro)).sort((a, b) => {
    const aa = alertaOrden(a, now, umbral) ? 0 : 1
    const bb = alertaOrden(b, now, umbral) ? 0 : 1
    return aa - bb || a.fecha.localeCompare(b.fecha)
  })
  const n = (e: EstadoOrden) => abiertas.filter((r) => estadoOrden(r) === e).length
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pendientes" value={n('pendiente')} />
        <Stat label="Muestra tomada" value={n('muestra')} />
        <Stat label="Resultado sin revisar" value={n('resultado')} tone={n('resultado') ? 'warn' : undefined} />
        <Stat label="Con retraso" value={conAlerta.length} tone={conAlerta.length ? 'danger' : 'ok'} />
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Mostrar" className="w-56">
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
            <option value="todas">Todas las abiertas</option>
            <option value="alerta">Solo con retraso</option>
            {FLUJO.slice(0, 3).map((e) => (
              <option key={e} value={e}>
                {ESTADO_CORTO[e]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alertar si no hay resultado tras (días)" className="w-56" hint="Urgentes: 1 día. Resultados sin revisar: 2 días.">
          <Input
            type="number"
            min={1}
            max={90}
            value={umbral}
            disabled={!meta.puedeEscribir}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value))
              if (v >= 1 && v <= 90) setUmbral(v)
            }}
          />
        </Field>
      </div>
      {lista.length === 0 ? (
        <Empty>No hay órdenes abiertas{filtro !== 'todas' && ' con este filtro'}.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((r) => (
            <div key={r.id} className="min-w-0 space-y-1">
              <TarjetaOrden r={r} umbral={umbral} mostrarPaciente />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (r.patientId) setActive(r.patientId)
                  onAbrir()
                }}
              >
                <ListChecks className="size-4" /> Abrir órdenes del paciente
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Catálogo
function Catalogo() {
  const [extra, setExtra, meta] = usePreferencia<Estudio[]>('ordenes.catalogo', 'org', [])
  const propios = Array.isArray(extra) ? extra : []
  const [q, setQ] = useState('')
  const [nuevo, setNuevo] = useState<Estudio>({ id: '', nombre: '', grupo: 'Clínica', tipo: 'laboratorio' })
  const todos = useMemo(() => catalogoCompleto(propios), [propios])
  const lista = buscarEstudios(todos, q, 400)
  const agregar = () => {
    if (!nuevo.nombre.trim()) return
    const id = 'c-' + Date.now().toString(36)
    setExtra([
      ...propios,
      {
        id,
        nombre: nuevo.nombre.trim(),
        grupo: nuevo.grupo.trim() || 'Clínica',
        tipo: nuevo.tipo,
        ...(nuevo.loinc?.trim() ? { loinc: nuevo.loinc.trim() } : {}),
        ...(nuevo.preparacion?.trim() ? { preparacion: nuevo.preparacion.trim() } : {}),
        ...(nuevo.muestra?.trim() ? { muestra: nuevo.muestra.trim() } : {}),
      },
    ])
    setNuevo({ id: '', nombre: '', grupo: nuevo.grupo, tipo: nuevo.tipo })
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card title={`Catálogo (${todos.length} estudios: ${CATALOGO.length} base + ${propios.length} de la clínica)`}>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar estudio…" className="pl-9" aria-label="Buscar en el catálogo" />
        </div>
        <ul className="max-h-[32rem] divide-y divide-line overflow-auto rounded-lg border border-line text-sm">
          {lista.map((e) => (
            <li key={e.id} className="flex items-start gap-2 px-3 py-2">
              {e.tipo === 'gabinete' ? <ScanLine className="mt-0.5 size-4 shrink-0 text-brand" /> : <FlaskConical className="mt-0.5 size-4 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1">
                <div>
                  {e.nombre} {e.personalizado && <Badge tone="brand">Clínica</Badge>}
                </div>
                <div className="text-xs text-muted">
                  {e.grupo}
                  {e.muestra && <> · {e.muestra}</>}
                  {e.loinc && <> · LOINC {e.loinc}</>}
                </div>
                {e.preparacion && <div className="mt-0.5 text-xs text-muted italic">{e.preparacion}</div>}
              </div>
              {e.personalizado && meta.puedeEscribir && (
                <button onClick={() => setExtra(propios.filter((x) => x.id !== e.id))} aria-label={`Eliminar ${e.nombre}`} className="text-muted hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={<span className="inline-flex items-center gap-1.5"><Settings2 className="size-4" /> Agregar estudio de la clínica</span>}>
        {!meta.puedeEscribir ? (
          <Notice>Solo administración y médicos pueden editar el catálogo compartido.</Notice>
        ) : (
          <div className="space-y-3">
            <Field label="Nombre">
              <Input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. Panel de alergenos alimentarios" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <Select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as Estudio['tipo'] })}>
                  <option value="laboratorio">Laboratorio</option>
                  <option value="gabinete">Gabinete</option>
                </Select>
              </Field>
              <Field label="Grupo">
                <Input value={nuevo.grupo} onChange={(e) => setNuevo({ ...nuevo, grupo: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Muestra (opcional)">
                <Input value={nuevo.muestra ?? ''} onChange={(e) => setNuevo({ ...nuevo, muestra: e.target.value })} />
              </Field>
              <Field label="LOINC (opcional)">
                <Input value={nuevo.loinc ?? ''} onChange={(e) => setNuevo({ ...nuevo, loinc: e.target.value })} placeholder="00000-0" />
              </Field>
            </div>
            <Field label="Preparación del paciente (opcional)">
              <Textarea value={nuevo.preparacion ?? ''} onChange={(e) => setNuevo({ ...nuevo, preparacion: e.target.value })} />
            </Field>
            <Button variant="primary" onClick={agregar} disabled={!nuevo.nombre.trim()}>
              <Plus className="size-4" /> Agregar al catálogo
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
