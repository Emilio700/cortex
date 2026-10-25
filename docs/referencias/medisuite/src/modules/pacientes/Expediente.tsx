import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarPlus, FileText, Pencil, Phone, Mail, Stethoscope, Trash2, Lock, FilePen } from 'lucide-react'
import { remove, setActivePatient, useActivePatient, useCollection } from '../../lib/store'
import { OBS_LABELS, edad, fmtFecha, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Empty, Notice, Page, Tabs } from '../../components/ui'
import type { Patient } from '../../lib/types'
import { useCan } from '../../lib/session'
import Timeline from './Timeline'
import HerramientasMenu from './Herramientas'
import { sinEncabezados } from './texto'
import Signos from './Signos'
import Documentos from './Documentos'
import { BannerBloqueado, BotonBloqueo, BotonExportar } from './Arco'
import { useSession } from '../../lib/session'
import { confirmar } from '../../components/dialogos'

type Tab = 'resumen' | 'timeline' | 'signos' | 'notas' | 'documentos'

export default function Expediente() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const patient = useCollection('patients', (p) => p.id === id, [id])[0]
  const { id: activeId } = useActivePatient()
  // Recepción no ve el expediente clínico (servidor): solo resumen y documentos
  const clinico = useCan('clinico.ver')
  const puedeNota = useCan('notas.escribir')
  const puedeRecetar = useCan('recetas.escribir')
  const bloq = !!patient?.bloqueado
  const pedido = (sp.get('tab') as Tab) || 'resumen'
  const tab: Tab = !clinico && ['timeline', 'signos', 'notas'].includes(pedido) ? 'resumen' : pedido
  const setTab = (t: Tab) => setSp({ tab: t }, { replace: true })

  // Abrir un expediente lo vuelve el paciente activo
  useEffect(() => {
    if (patient && activeId !== patient.id) setActivePatient(patient.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id])

  if (!patient)
    return (
      <Page title="Expediente">
        <Empty>
          Paciente no encontrado. <Link to="/pacientes" className="text-brand">Ver pacientes</Link>
        </Empty>
      </Page>
    )

  const e = edad(patient.fechaNac)
  return (
    <Page
      title={nombreCompleto(patient)}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {e.texto} · {patient.sexo === 'F' ? 'Femenino' : patient.sexo === 'M' ? 'Masculino' : 'Otro'} · Nac. {fmtFecha(patient.fechaNac + 'T12:00:00')}
          </span>
          {patient.curp && <span className="font-mono text-xs">{patient.curp}</span>}
          {patient.tipoSangre && <Badge tone="danger">{patient.tipoSangre}</Badge>}
        </span>
      }
      actions={
        <>
          {puedeNota && !bloq && (
            <Button variant="primary" onClick={() => nav('/consulta/nueva?p=' + patient.id)}>
              <Stethoscope className="size-4" /> Nueva consulta
            </Button>
          )}
          {puedeRecetar && !bloq && (
            <Button onClick={() => { setActivePatient(patient.id); nav('/receta?p=' + patient.id) }}>
              <FileText className="size-4" /> Receta
            </Button>
          )}
          {!bloq && (
            <Button onClick={() => { setActivePatient(patient.id); nav('/agenda?p=' + patient.id) }}>
              <CalendarPlus className="size-4" /> Agendar
            </Button>
          )}
          {!bloq && <HerramientasMenu p={patient} />}
          {!bloq && (
            <Button variant="ghost" onClick={() => nav(`/pacientes/${patient.id}/editar`)} aria-label="Editar paciente">
              <Pencil className="size-4" /> <span className="sm:hidden lg:inline">Editar</span>
            </Button>
          )}
        </>
      }
    >
      <BannerBloqueado p={patient} />
      {patient.alergias.length > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          <AlertTriangle className="size-4 shrink-0" /> Alergias: {patient.alergias.join(', ')}
        </div>
      ) : null}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'resumen' as Tab, label: 'Resumen' },
          ...(clinico
            ? [
                { id: 'timeline' as Tab, label: 'Línea de tiempo' },
                { id: 'signos' as Tab, label: 'Signos y laboratorios' },
                { id: 'notas' as Tab, label: 'Notas' },
              ]
            : []),
          { id: 'documentos' as Tab, label: 'Documentos' },
        ]}
      />
      {tab === 'resumen' && <Resumen p={patient} />}
      {tab === 'timeline' && <Timeline p={patient} />}
      {tab === 'signos' && <Signos p={patient} />}
      {tab === 'notas' && <Notas p={patient} />}
      {tab === 'documentos' && <Documentos p={patient} />}
    </Page>
  )
}

const VITALES = ['pas', 'fc', 'fr', 'temp', 'spo2', 'peso', 'talla', 'imc', 'glucosa', 'hba1c', 'colesterol', 'creatinina']

function Resumen({ p }: { p: Patient }) {
  const nav = useNavigate()
  const puedeBorrar = useCan('pacientes.borrar')
  const clinico = useCan('clinico.ver')
  const obs = useCollection('observations', (o) => o.patientId === p.id, [p.id])
  const encs = useCollection('encounters', (x) => x.patientId === p.id, [p.id])
  const citas = useCollection('appointments', (x) => x.patientId === p.id, [p.id])

  const ultimos = useMemo(() => {
    const m = new Map<string, (typeof obs)[number]>()
    for (const o of obs) {
      const prev = m.get(o.codigo)
      if (!prev || o.fecha > prev.fecha) m.set(o.codigo, o)
    }
    return m
  }, [obs])
  const proxima = citas.filter((c) => c.inicio >= new Date().toISOString() && c.estado !== 'cancelada').sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
  const dx = useMemo(() => {
    const m = new Map<string, { nombre: string; fecha: string }>()
    for (const e of [...encs].sort((a, b) => b.fecha.localeCompare(a.fecha))) for (const d of e.diagnosticos) if (!m.has(d.codigo)) m.set(d.codigo, { nombre: d.nombre, fecha: e.fecha })
    return [...m.entries()].slice(0, 8)
  }, [encs])

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {!clinico && <Notice tone="info">El expediente clínico (notas, signos, antecedentes y diagnósticos) solo es visible para el personal clínico.</Notice>}
        {clinico && (<>
        <Card title="Últimos signos y laboratorios" actions={<span className="text-xs text-muted">{ultimos.size ? '' : 'Sin registros'}</span>}>
          {ultimos.size === 0 ? (
            <Empty>Aún no hay mediciones. Regístralas en la consulta o en Signos y laboratorios.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {VITALES.filter((c) => ultimos.has(c)).map((c) => {
                const o = ultimos.get(c)!
                const pad = c === 'pas' ? ultimos.get('pad') : undefined
                return (
                  <div key={c} className="rounded-lg border border-line bg-surface-2/50 p-3">
                    <div className="truncate text-xs text-muted">{c === 'pas' ? 'Presión arterial' : OBS_LABELS[c]?.label ?? c}</div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums">
                      {o.valor}
                      {pad && `/${pad.valor}`} <span className="text-xs font-normal text-muted">{o.unidad}</span>
                    </div>
                    <div className="text-[11px] text-muted">{fmtFecha(o.fecha)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
        <Card title="Antecedentes">
          <p className="whitespace-pre-wrap text-sm">{p.antecedentes || <span className="text-muted">Sin antecedentes registrados.</span>}</p>
          {p.notas && <p className="mt-3 border-t border-line pt-3 text-sm text-muted">{p.notas}</p>}
        </Card>
        <Card title="Diagnósticos registrados">
          {dx.length === 0 ? (
            <p className="text-sm text-muted">Sin diagnósticos.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {dx.map(([codigo, d]) => (
                <li key={codigo} className="flex items-baseline gap-2">
                  <span className="w-14 shrink-0 font-mono text-xs font-semibold text-brand">{codigo}</span>
                  <span className="min-w-0 flex-1">{d.nombre}</span>
                  <span className="shrink-0 text-xs text-muted">{fmtFecha(d.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </>)}
      </div>
      <div className="space-y-4">
        <Card title="Alergias">
          {p.alergias.length ? (
            <div className="flex flex-wrap gap-1.5">
              {p.alergias.map((a) => (
                <span key={a} className="rounded-full bg-danger/15 px-2.5 py-1 text-sm font-semibold text-danger">
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Niega alergias conocidas.</p>
          )}
        </Card>
        {clinico && <Card title="Medicamentos actuales">
          {p.medicamentosActuales?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {p.medicamentosActuales.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Ninguno registrado.</p>
          )}
        </Card>}
        <Card title="Contacto">
          <div className="flex items-center gap-3">
            <Avatar p={p} size={44} />
            <div className="min-w-0 space-y-1 text-sm">
              {p.telefono && (
                <a href={`tel:${p.telefono.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:text-brand">
                  <Phone className="size-3.5" /> {p.telefono}
                </a>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 truncate hover:text-brand">
                  <Mail className="size-3.5" /> {p.email}
                </a>
              )}
              {!p.telefono && !p.email && <span className="text-muted">Sin datos de contacto</span>}
            </div>
          </div>
          <div className="mt-3 border-t border-line pt-3 text-sm">
            <span className="text-muted">Próxima cita: </span>
            {proxima ? fmtFechaHora(proxima.inicio) : 'ninguna'}
          </div>
        </Card>
        <Arco p={p} />
        {puedeBorrar && !p.bloqueado && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={async () => {
              if (await confirmar(`Su expediente dejará de mostrarse (las notas firmadas se conservan en el respaldo).`, { titulo: `¿Eliminar a ${nombreCompleto(p)}?`, peligro: true })) {
                remove('patients', p.id)
                nav('/pacientes')
              }
            }}
          >
            <Trash2 className="size-4" /> Eliminar paciente
          </Button>
        )}
      </div>
    </div>
  )
}

function Notas({ p }: { p: Patient }) {
  const nav = useNavigate()
  const encs = useCollection('encounters', (x) => x.patientId === p.id, [p.id])
  const lista = [...encs].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <Card
      title={`Notas clínicas (${lista.length})`}
      pad={false}
      actions={
        <Button size="sm" variant="primary" onClick={() => nav('/consulta/nueva?p=' + p.id)}>
          <Stethoscope className="size-4" /> Nueva
        </Button>
      }
    >
      {lista.length === 0 ? (
        <div className="p-4">
          <Empty>Sin notas clínicas.</Empty>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {lista.map((e) => (
            <li key={e.id}>
              <button onClick={() => nav('/consulta/' + e.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <span className={'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ' + (e.firmada ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>
                  {e.firmada ? <Lock className="size-4" /> : <FilePen className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{e.motivo || 'Sin motivo'}</span>
                    <Badge>{e.plantilla}</Badge>
                    {!e.firmada && <Badge tone="warn">Borrador</Badge>}
                    {e.adendas.length > 0 && <Badge tone="brand">{e.adendas.length} adenda(s)</Badge>}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-sm text-muted">{sinEncabezados(e.analisis) || sinEncabezados(e.subjetivo) || 'Sin texto'}</div>
                  {e.diagnosticos.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {e.diagnosticos.map((d) => (
                        <span key={d.codigo} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                          <b className="font-mono">{d.codigo}</b> {d.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted">{fmtFecha(e.fecha)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 pb-3">{lista.some((e) => !e.firmada) && <Notice tone="warn">Hay notas sin firmar. Una nota firmada ya no se puede editar (NOM-004).</Notice>}</div>
    </Card>
  )
}


/** Derechos ARCO: exportar (médico/admin) y bloquear (admin). */
function Arco({ p }: { p: Patient }) {
  const { user, mode } = useSession()
  const exportar = mode !== 'server' || user?.rol === 'admin' || user?.rol === 'medico'
  const bloquear = mode === 'server' && user?.rol === 'admin'
  if (!exportar && !bloquear) return null
  return (
    <Card title="Derechos ARCO">
      <p className="mb-3 text-xs text-muted">Acceso, rectificación, cancelación y oposición del titular de los datos (LFPDPPP).</p>
      <div className="flex flex-wrap gap-2">
        {exportar && <BotonExportar p={p} />}
        {bloquear && <BotonBloqueo p={p} />}
      </div>
    </Card>
  )
}
