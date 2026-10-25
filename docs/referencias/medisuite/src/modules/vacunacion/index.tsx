import { useMemo, useState } from 'react'
import { Plus, FileDown, FolderPlus, Trash2, Syringe, Printer, Phone } from 'lucide-react'
import { Page, PatientBar, Card, Tabs, Notice, Button, Field, Input, Select, Textarea, Badge, Stat, Empty, Modal, Disclaimer } from '../../components/ui'
import { confirmar } from '../../components/dialogos'
import { toast } from '../../components/toast'
import { add, remove, useActivePatient, useCollection, useSettings } from '../../lib/store'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import { useSession } from '../../lib/session'
import type { Patient, Registro } from '../../lib/types'
import { cx, downloadBlob, edad, fileToDataUrl, nombreCompleto } from '../../lib/utils'
import { datar, hoyISO } from '../prenatal/calc'
import {
  ESQUEMA, ESQUEMA_VERSION, ESTADO_LABEL, GRUPO_LABEL, NOTAS_ESQUEMA, NOTA_RESCATE, VACUNAS, dosisPorId, evaluarCartilla, gruposVisibles, vacunaPorId,
  type Aplicacion, type Estado, type EstadoDosis, type Grupo,
} from './esquema'

type Tab = 'cartilla' | 'historial' | 'recordatorios'
const fmt = (f?: string) => (f ? new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const TONO: Record<Estado, 'ok' | 'neutral' | 'danger' | 'brand' | 'warn'> = { aplicada: 'ok', pendiente: 'neutral', atrasada: 'danger', 'no-aplica': 'neutral', riesgo: 'brand' }
const apl = (r: Registro) => ({ ...(r.datos as unknown as Aplicacion), id: r.id })

/** FUM efectiva del embarazo activo de cada paciente (registros de Control prenatal). */
function useEmbarazosActivos(): Map<string, string> {
  const prenatal = useRegistros('prenatal')
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const r of prenatal) {
      const d = r.datos as { clase?: string; fum?: string; usg?: { fecha: string; sdgDias: number } }
      if (d.clase !== 'embarazo' || r.estado === 'terminado' || !r.patientId) continue
      const fum = datar(d.fum, d.usg).fumEfectiva
      if (fum) m.set(r.patientId, fum)
    }
    return m
  }, [prenatal])
}

function estadosDe(p: Patient, aplicaciones: Aplicacion[], hoy: string, fum: string | null) {
  return evaluarCartilla({ fechaNac: p.fechaNac, sexo: p.sexo, hoy, aplicaciones, embarazoFum: fum })
}

export default function Vacunacion() {
  const { id: pid, patient } = useActivePatient()
  const regs = useRegistros('vacuna', pid ?? '__ninguno__')
  const puede = useCanRegistro('vacuna', 'write')
  const embarazos = useEmbarazosActivos()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('cartilla')
  const [registrar, setRegistrar] = useState<string | null>(null) // dosisId preseleccionada ('' = libre)
  const hoy = hoyISO()
  const aplicaciones = useMemo(() => regs.map(apl), [regs])
  const fum = pid ? embarazos.get(pid) ?? null : null
  const estados = useMemo(() => (patient ? estadosDe(patient, aplicaciones, hoy, fum) : []), [patient, aplicaciones, hoy, fum])
  const grupos = patient ? gruposVisibles(patient.fechaNac, hoy, patient.sexo, !!fum) : []

  async function pdf(guardar: boolean) {
    if (!patient) return
    const { cartillaPDF } = await import('./pdf')
    const blob = cartillaPDF(patient, estados, grupos, aplicaciones, settings, hoy)
    const nombre = `cartilla-vacunacion-${patient.nombre.split(' ')[0].toLowerCase()}-${hoy}.pdf`
    if (!guardar) return downloadBlob(blob, nombre)
    add('documents', { patientId: patient.id, tipo: 'otro', nombre, mime: 'application/pdf', dataUrl: await fileToDataUrl(blob), meta: { origen: 'vacunacion' } })
    toast('Cartilla guardada en los documentos del paciente', 'ok')
  }

  return (
    <Page
      title="Vacunación"
      subtitle={<>{ESQUEMA_VERSION}</>}
      actions={
        patient && tab !== 'recordatorios' && (
          <>
            <Button onClick={() => pdf(false)}><FileDown className="size-4" /> Cartilla PDF</Button>
            {puede && <Button onClick={() => pdf(true)} aria-label="Guardar cartilla en documentos del paciente"><FolderPlus className="size-4" /> <span className="hidden sm:inline">Guardar en expediente</span></Button>}
            {puede && <Button variant="primary" onClick={() => setRegistrar('')}><Plus className="size-4" /> Registrar dosis</Button>}
          </>
        )
      }
    >
      <PatientBar />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'cartilla', label: 'Cartilla' }, { id: 'historial', label: `Dosis aplicadas (${regs.length})` }, { id: 'recordatorios', label: 'Recordatorios de la clínica' }]} />
      {tab === 'recordatorios' ? (
        <Recordatorios hoy={hoy} embarazos={embarazos} />
      ) : !patient ? null : tab === 'cartilla' ? (
        <Cartilla patient={patient} estados={estados} grupos={grupos} puede={puede} onRegistrar={setRegistrar} embarazada={!!fum} />
      ) : (
        <Historial regs={regs} puede={puede} />
      )}
      {registrar !== null && patient && <RegistrarModal patient={patient} estados={estados} dosisInicial={registrar} onClose={() => setRegistrar(null)} />}
      <Disclaimer>Herramienta de apoyo. Verifique siempre el esquema y los lineamientos vigentes del Centro Nacional para la Salud de la Infancia y la Adolescencia (CeNSIA); no sustituye la Cartilla Nacional de Salud.</Disclaimer>
    </Page>
  )
}

// ---------------------------------------------------------------------------
function Cartilla({ patient, estados, grupos, puede, onRegistrar, embarazada }: { patient: Patient; estados: EstadoDosis[]; grupos: Grupo[]; puede: boolean; onRegistrar: (id: string) => void; embarazada: boolean }) {
  const atr = estados.filter((e) => e.estado === 'atrasada')
  const tocan = estados.filter((e) => e.estado === 'pendiente' && e.toca)
  const aplicadas = estados.filter((e) => e.estado === 'aplicada').length
  const proxima = estados.filter((e) => e.estado === 'pendiente' && !e.toca && e.fechaObjetivo).sort((a, b) => a.fechaObjetivo!.localeCompare(b.fechaObjetivo!))[0]
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Edad" value={<span className="text-lg">{edad(patient.fechaNac).texto}</span>} sub={embarazada ? 'Embarazo activo' : `Nació el ${fmt(patient.fechaNac)}`} />
        <Stat label="Dosis aplicadas" value={aplicadas} tone="ok" />
        <Stat label="Atrasadas" value={atr.length} tone={atr.length ? 'danger' : 'ok'} sub={tocan.length ? `${tocan.length} por aplicar ahora` : undefined} />
        <Stat label="Próxima" value={<span className="text-base">{proxima ? `${vacunaPorId(proxima.dosis.vacunaId)?.nombre} ${proxima.dosis.dosis}` : '—'}</span>} sub={proxima ? fmt(proxima.fechaObjetivo) : undefined} />
      </div>
      {atr.length > 0 && (
        <Notice tone="danger">
          <b>Dosis atrasadas:</b> {atr.map((e) => `${vacunaPorId(e.dosis.vacunaId)?.nombre} ${e.dosis.dosis}`).join(', ')}.
          <div className="mt-1 text-xs">{NOTA_RESCATE}</div>
        </Notice>
      )}
      {grupos.map((g) => {
        const filas = estados.filter((e) => e.dosis.grupo === g)
        return (
          <Card key={g} title={GRUPO_LABEL[g]} pad={false}>
            <ul className="divide-y divide-line">
              {filas.map((e) => {
                const v = vacunaPorId(e.dosis.vacunaId)!
                return (
                  <li key={e.dosis.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5', e.estado === 'no-aplica' && 'opacity-60')}>
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="text-sm font-medium">
                        {v.nombre} <span className="font-normal text-muted">· {e.dosis.dosis}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {e.dosis.edadTexto} · {v.protege}
                        {e.dosis.verificar && <span className="text-warn" title={e.dosis.verificar}> (verificar con CeNSIA)</span>}
                      </div>
                    </div>
                    <div className="w-36 shrink-0 text-xs text-muted">{e.aplicacion ? `Aplicada ${fmt(e.aplicacion.fecha)}` : e.detalle.replace(/\d{4}-\d{2}-\d{2}/g, (m) => fmt(m))}</div>
                    <Badge tone={TONO[e.estado]}>{e.estado === 'pendiente' && e.toca ? 'Toca ahora' : ESTADO_LABEL[e.estado]}</Badge>
                    {puede && e.estado !== 'aplicada' && e.estado !== 'no-aplica' && (
                      <Button size="sm" variant="ghost" onClick={() => onRegistrar(e.dosis.id)} aria-label={`Registrar ${v.nombre} ${e.dosis.dosis}`}><Syringe className="size-4" /></Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
      <Card title="Notas del esquema">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {NOTAS_ESQUEMA.map((n) => <li key={n}>{n}</li>)}
          <li>Estado “Atrasada”: la edad recomendada se rebasó por más de 30 días sin registro. “No aplica”: fuera de la edad máxima del esquema o del grupo.</li>
        </ul>
      </Card>
    </div>
  )
}

function Historial({ regs, puede }: { regs: Registro[]; puede: boolean }) {
  if (!regs.length) return <Empty>No hay dosis registradas para este paciente.</Empty>
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {regs.map((r) => {
          const a = apl(r)
          const d = dosisPorId(a.dosisId)
          return (
            <article key={r.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
              <header className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.nombre || vacunaPorId(a.vacunaId)?.nombre || a.vacunaId} <span className="font-normal text-muted">{d ? `· ${d.dosis}` : ''}</span></div>
                  <div className="text-xs text-muted">{fmt(a.fecha)}</div>
                </div>
                {puede && <Button size="sm" variant="ghost" aria-label={`Eliminar registro de ${vacunaPorId(a.vacunaId)?.nombre ?? 'vacuna'}`} onClick={async () => { if (await confirmar(`¿Eliminar el registro de ${a.nombre || vacunaPorId(a.vacunaId)?.nombre || 'la vacuna'} del ${fmt(a.fecha)}?`, { titulo: 'Eliminar dosis', aceptar: 'Eliminar', peligro: true })) remove('registros', r.id) }}><Trash2 className="size-4" /></Button>}
              </header>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {([['Lote', a.lote], ['Laboratorio', a.laboratorio], ['Vía', a.via], ['Sitio', a.sitio], ['Aplicó', a.aplicador], ['Próxima dosis', a.proxima && fmt(a.proxima)]] as [string, string | undefined][])
                  .filter(([, v]) => v)
                  .map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </article>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
function RegistrarModal({ patient, estados, dosisInicial, onClose }: { patient: Patient; estados: EstadoDosis[]; dosisInicial: string; onClose: () => void }) {
  const ses = useSession()
  const primera = dosisInicial || estados.find((e) => e.estado === 'atrasada' || (e.estado === 'pendiente' && e.toca))?.dosis.id || 'otra'
  const [dosisId, setDosisId] = useState(primera)
  const d = dosisPorId(dosisId)
  const [vacunaOtra, setVacunaOtra] = useState('covid')
  const vacunaId = d?.vacunaId ?? vacunaOtra
  const v = vacunaPorId(vacunaId)
  const [f, setF] = useState({ fecha: hoyISO(), lote: '', laboratorio: '', sitio: '', via: '', aplicador: ses.user?.nombre ?? '', proxima: '', nombre: '', notas: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  // siguiente dosis de la misma vacuna (sugerencia de "próxima dosis")
  const siguiente = d ? ESQUEMA.filter((x) => x.vacunaId === d.vacunaId && x.edadMeses > d.edadMeses && (x.regla ?? 'unica') === 'unica').sort((a, b) => a.edadMeses - b.edadMeses)[0] : undefined
  const sugerida = siguiente ? estados.find((e) => e.dosis.id === siguiente.id)?.fechaObjetivo : undefined
  const yaAplicada = d && estados.find((e) => e.dosis.id === d.id)?.estado === 'aplicada' && (d.regla ?? 'unica') === 'unica'

  function guardar() {
    const datos: Aplicacion & { notas?: string } = {
      dosisId,
      vacunaId,
      fecha: f.fecha,
      lote: f.lote || undefined,
      laboratorio: f.laboratorio || undefined,
      sitio: f.sitio || v?.sitio,
      via: f.via || v?.via,
      aplicador: f.aplicador || undefined,
      proxima: f.proxima || sugerida || undefined,
      nombre: f.nombre || undefined,
      notas: f.notas || undefined,
    }
    const limpio = Object.fromEntries(Object.entries(datos).filter(([, x]) => x !== undefined))
    add('registros', { patientId: patient.id, tipo: 'vacuna', estado: 'aplicada', fecha: new Date(f.fecha + 'T12:00:00').toISOString(), titulo: `${f.nombre || v?.nombre || 'Vacuna'}${d ? ` · ${d.dosis}` : ''}`, datos: limpio })
    toast(`${v?.nombre ?? 'Vacuna'} registrada`, 'ok')
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Registrar dosis aplicada" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dosis del esquema" className="sm:col-span-2">
          <Select value={dosisId} onChange={(e) => setDosisId(e.target.value)}>
            {(Object.keys(GRUPO_LABEL) as Grupo[]).map((g) => (
              <optgroup key={g} label={GRUPO_LABEL[g]}>
                {ESQUEMA.filter((x) => x.grupo === g).map((x) => {
                  const st = estados.find((e) => e.dosis.id === x.id)
                  return <option key={x.id} value={x.id}>{vacunaPorId(x.vacunaId)?.nombre} · {x.dosis} ({x.edadTexto}){st ? ` — ${ESTADO_LABEL[st.estado].toLowerCase()}` : ''}</option>
                })}
              </optgroup>
            ))}
            <option value="otra">Otra vacuna / campaña…</option>
          </Select>
        </Field>
        {yaAplicada && <p className="text-xs text-warn sm:col-span-2">Esta dosis ya está registrada; guardar otra la duplicará.</p>}
        {dosisId === 'otra' && (
          <>
            <Field label="Vacuna">
              <Select value={vacunaOtra} onChange={(e) => setVacunaOtra(e.target.value)}>
                {VACUNAS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                <option value="otra">Otra (escribir nombre)</option>
              </Select>
            </Field>
            <Field label="Nombre / descripción"><Input value={f.nombre} onChange={set('nombre')} placeholder="p. ej. Hepatitis A, Varicela, refuerzo COVID-19" /></Field>
          </>
        )}
        <Field label="Fecha de aplicación"><Input type="date" value={f.fecha} max={hoyISO()} onChange={set('fecha')} /></Field>
        <Field label="Lote"><Input value={f.lote} onChange={set('lote')} /></Field>
        <Field label="Laboratorio / fabricante"><Input value={f.laboratorio} onChange={set('laboratorio')} /></Field>
        <Field label="Aplicador"><Input value={f.aplicador} onChange={set('aplicador')} /></Field>
        <Field label="Vía"><Input value={f.via} onChange={set('via')} placeholder={v?.via} /></Field>
        <Field label="Sitio de aplicación"><Input value={f.sitio} onChange={set('sitio')} placeholder={v?.sitio} /></Field>
        <Field label="Próxima dosis" hint={sugerida ? `Sugerida por el esquema: ${fmt(sugerida)} (${vacunaPorId(siguiente!.vacunaId)?.nombre} ${siguiente!.dosis})` : undefined}>
          <Input type="date" value={f.proxima} onChange={set('proxima')} />
        </Field>
        <Field label="Notas (reacciones, observaciones)" className="sm:col-span-2"><Textarea value={f.notas} onChange={set('notas')} className="min-h-14" /></Field>
      </div>
      {v && <p className="mt-2 text-xs text-muted">{v.nombre}: protege contra {v.protege}. Vía {v.via.toLowerCase()}, {v.sitio.toLowerCase()} (verificar con el Manual de Vacunación vigente).</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!f.fecha || (dosisId === 'otra' && vacunaOtra === 'otra' && !f.nombre)} onClick={guardar}>Guardar</Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
function Recordatorios({ hoy, embarazos }: { hoy: string; embarazos: Map<string, string> }) {
  const patients = useCollection('patients')
  const todas = useRegistros('vacuna')
  const settings = useSettings()
  const { setActive } = useActivePatient()
  const [adultos, setAdultos] = useState(false)
  const filas = useMemo(() => {
    const porPac = new Map<string, Aplicacion[]>()
    for (const r of todas) if (r.patientId) porPac.set(r.patientId, [...(porPac.get(r.patientId) ?? []), apl(r)])
    return patients
      .map((p) => {
        const aps = porPac.get(p.id) ?? []
        const menor = edad(p.fechaNac).anios < 18
        if (!adultos && !menor && !aps.length && !embarazos.has(p.id)) return null
        const est = estadosDe(p, aps, hoy, embarazos.get(p.id) ?? null).filter((e) => e.estado === 'atrasada' || (e.estado === 'pendiente' && e.toca))
        return est.length ? { paciente: p, pendientes: est } : null
      })
      .filter(Boolean)
      .sort((a, b) => b!.pendientes.filter((e) => e.estado === 'atrasada').length - a!.pendientes.filter((e) => e.estado === 'atrasada').length) as { paciente: Patient; pendientes: EstadoDosis[] }[]
  }, [patients, todas, hoy, embarazos, adultos])

  async function pdf() {
    const { recordatoriosPDF } = await import('./pdf')
    downloadBlob(recordatoriosPDF(filas, settings, hoy), `recordatorios-vacunacion-${hoy}.pdf`)
  }
  return (
    <Card
      title={`Pacientes con vacunas atrasadas o por aplicar (${filas.length})`}
      actions={<Button size="sm" onClick={pdf}><Printer className="size-4" /> PDF</Button>}
    >
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={adultos} onChange={(e) => setAdultos(e.target.checked)} /> Incluir adultos sin dosis registradas
      </label>
      {filas.length === 0 ? (
        <Empty>Ningún paciente tiene dosis atrasadas.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {filas.map(({ paciente: p, pendientes }) => (
            <li key={p.id} className="flex flex-wrap items-start gap-2 py-2.5">
              <div className="min-w-0 flex-1 basis-60">
                <button className="text-left text-sm font-medium text-brand hover:underline" onClick={() => setActive(p.id)}>{nombreCompleto(p)}</button>
                <div className="text-xs text-muted">{edad(p.fechaNac).texto}{p.telefono && <> · <Phone className="inline size-3" /> {p.telefono}</>}</div>
              </div>
              <div className="flex flex-1 basis-72 flex-wrap gap-1">
                {pendientes.map((e) => (
                  <Badge key={e.dosis.id} tone={e.estado === 'atrasada' ? 'danger' : 'warn'}>{vacunaPorId(e.dosis.vacunaId)?.nombre} {e.dosis.dosis}</Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Incluye menores de 18 años, embarazadas y pacientes con al menos una dosis registrada. Al pulsar el nombre se selecciona como paciente activo. Para enviar avisos use el módulo de Mensajes.</p>
    </Card>
  )
}
