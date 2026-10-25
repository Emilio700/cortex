import { useMemo, useState } from 'react'
import { Plus, Pencil, FileDown, FolderPlus, Trash2, Flag, AlertTriangle, CheckCircle2, Circle, Baby } from 'lucide-react'
import { Page, PatientBar, Card, Tabs, Notice, Button, Field, Input, Select, Textarea, Badge, Stat, Empty, Modal, Disclaimer } from '../../components/ui'
import { confirmar } from '../../components/dialogos'
import { toast } from '../../components/toast'
import { add, remove, update, useActivePatient, useSettings } from '../../lib/store'
import { useCan } from '../../lib/session'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import type { Patient, Registro } from '../../lib/types'
import { cx, downloadBlob, edad, fileToDataUrl } from '../../lib/utils'
import {
  CALENDARIO, CONSULTAS_NOM007, SINTOMAS_ALARMA, alertasConsulta, categoriaIMC, diasEntre, hoyISO, imc, IOM, sdgEn, sdgTexto, sumarDias, type ConsultaPrenatal,
} from './calc'
import { RIESGOS, tituloEmbarazo, datacionDe, datosCons, datosEmb, esConsulta, esEmbarazo, rhNegativo, sdgActual, type DatosConsulta, type DatosEmbarazo, type Resolucion } from './modelo'
import { GraficaAU, GraficaPeso } from './Graficas'
import { BiometriaFetal } from './Biometria'

type Tab = 'resumen' | 'consultas' | 'graficas' | 'biometria' | 'calendario'
const fmt = (f?: string | null) => (f ? new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))
const asDatos = (d: unknown) => d as Registro['datos']

export default function Prenatal() {
  const { id: pid, patient } = useActivePatient()
  const registros = useRegistros('prenatal', pid ?? '__ninguno__')
  const puede = useCanRegistro('prenatal', 'write')
  const embarazos = useMemo(() => registros.filter(esEmbarazo), [registros])
  const [sel, setSel] = useState<string | null>(null)
  const emb = embarazos.find((e) => e.id === sel) ?? embarazos.find((e) => e.estado !== 'terminado') ?? embarazos[0] ?? null
  const consultas = useMemo(() => (emb ? registros.filter((r) => esConsulta(r) && datosCons(r).embarazoId === emb.id) : []), [registros, emb])
  const [tab, setTab] = useState<Tab>('resumen')
  const [editar, setEditar] = useState<'nuevo' | 'editar' | null>(null)
  const settings = useSettings()

  if (!patient) return <Page title="Control prenatal"><PatientBar /></Page>

  async function pdf(guardar: boolean) {
    if (!emb || !patient) return
    const { carnetPDF } = await import('./pdf')
    const blob = carnetPDF(patient, emb, consultas, settings, hoyISO())
    const nombre = `carnet-perinatal-${patient.nombre.split(' ')[0].toLowerCase()}-${hoyISO()}.pdf`
    if (!guardar) return downloadBlob(blob, nombre)
    add('documents', { patientId: patient.id, tipo: 'otro', nombre, mime: 'application/pdf', dataUrl: await fileToDataUrl(blob), meta: { origen: 'prenatal', embarazoId: emb.id } })
    toast('Carnet perinatal guardado en los documentos del paciente', 'ok')
  }

  return (
    <Page
      title="Control prenatal"
      subtitle="Carnet perinatal conforme a la NOM-007-SSA2-2016"
      actions={
        emb && (
          <>
            <Button onClick={() => pdf(false)}><FileDown className="size-4" /> Carnet PDF</Button>
            {puede && <Button onClick={() => pdf(true)} aria-label="Guardar carnet en documentos del paciente"><FolderPlus className="size-4" /> <span className="hidden sm:inline">Guardar en expediente</span></Button>}
          </>
        )
      }
    >
      <PatientBar />
      {patient.sexo === 'M' ? (
        <Notice tone="warn">El control prenatal aplica a pacientes de sexo femenino. Selecciona otra paciente.</Notice>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {embarazos.length > 1 && (
              <Select aria-label="Embarazo" value={emb?.id ?? ''} onChange={(e) => setSel(e.target.value)} className="w-auto max-w-full">
                {embarazos.map((e) => (
                  <option key={e.id} value={e.id}>{e.titulo ?? 'Embarazo'} · {e.estado === 'terminado' ? 'terminado' : 'en curso'}</option>
                ))}
              </Select>
            )}
            {puede && (
              <Button variant={emb ? 'secondary' : 'primary'} onClick={() => setEditar('nuevo')}>
                <Plus className="size-4" /> Nuevo embarazo
              </Button>
            )}
          </div>
          {!emb ? (
            <Empty>No hay embarazos registrados para esta paciente.{puede ? ' Registra uno con «Nuevo embarazo».' : ''}</Empty>
          ) : (
            <>
              <Tabs<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'resumen', label: 'Resumen' },
                  { id: 'consultas', label: `Consultas (${consultas.length})` },
                  { id: 'graficas', label: 'Gráficas' },
                  { id: 'biometria', label: 'Ultrasonido' },
                  { id: 'calendario', label: 'Estudios y vacunas' },
                ]}
              />
              {tab === 'resumen' && <Resumen emb={emb} consultas={consultas} patient={patient} puede={puede} onEditar={() => setEditar('editar')} />}
              {tab === 'consultas' && <Consultas emb={emb} consultas={consultas} puede={puede} pid={patient.id} />}
              {tab === 'graficas' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <GraficaAU consultas={consultas.map(datosCons)} />
                  <GraficaPeso emb={datosEmb(emb)} consultas={consultas.map(datosCons)} />
                </div>
              )}
              {tab === 'biometria' && <BiometriaFetal emb={emb} puede={puede} />}
              {tab === 'calendario' && <Calendario emb={emb} consultas={consultas} />}
            </>
          )}
        </>
      )}
      {editar && <EmbarazoModal patient={patient} emb={editar === 'editar' ? emb : null} onClose={() => setEditar(null)} onCreado={(id) => (setSel(id), setTab('resumen'))} />}
      <Disclaimer />
    </Page>
  )
}

// ---------------------------------------------------------------------------

function Resumen({ emb, consultas, patient, puede, onEditar }: { emb: Registro; consultas: Registro[]; patient: Patient; puede: boolean; onEditar: () => void }) {
  const e = datosEmb(emb)
  const d = datacionDe(e)
  const hoy = hoyISO()
  const sdg = sdgActual(e, hoy)
  const [resolver, setResolver] = useState(false)
  const ultima = [...consultas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const alertas = ultima ? alertasConsulta(datosCons(ultima), datosCons(ultima).sdgDias ?? null) : []
  const imcPre = e.pesoPre && e.talla ? imc(e.pesoPre, e.talla) : null
  const edadMat = edad(patient.fechaNac).anios
  const trimestre = sdg === null ? '—' : sdg < 14 * 7 ? '1.er trimestre' : sdg < 28 * 7 ? '2.º trimestre' : '3.er trimestre'
  const terminado = emb.estado === 'terminado'
  return (
    <div className="grid gap-4">
      {terminado && e.resolucion && (
        <Notice>Embarazo terminado el {fmt(e.resolucion.fecha)} ({e.resolucion.tipo}{e.resolucion.sdgDias !== undefined ? `, ${sdgTexto(e.resolucion.sdgDias)}` : ''}{e.resolucion.rnPeso ? `, RN ${e.resolucion.rnPeso} g` : ''}).</Notice>
      )}
      {!terminado && sdg !== null && sdg > 42 * 7 && <Notice tone="warn">La edad gestacional calculada supera 42 semanas: registra la resolución del embarazo o revisa la datación.</Notice>}
      {alertas.length > 0 && !terminado && (
        <Notice tone={alertas.some((a) => a.nivel === 'danger') ? 'danger' : 'warn'}>
          <b>Alertas de la última consulta ({fmt(datosCons(ultima!).fecha)}):</b>
          <ul className="mt-1 list-disc pl-5">{alertas.map((a, i) => <li key={i}>{a.texto}</li>)}</ul>
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={terminado ? 'SDG a la resolución' : 'Edad gestacional hoy'} value={sdg !== null ? sdgTexto(sdg) : '—'} sub={trimestre} />
        <Stat label="Fecha probable de parto" value={<span className="text-lg">{fmt(d.fpp)}</span>} sub={`Datación por ${d.metodo === 'ninguno' ? '—' : d.metodo}`} />
        <Stat label="G / P / C / A" value={`${e.gesta}/${e.para}/${e.cesareas}/${e.abortos}`} sub={`Grupo y Rh: ${e.grupoRh || patient.tipoSangre || '—'}`} tone={rhNegativo(e.grupoRh || patient.tipoSangre) ? 'warn' : undefined} />
        <Stat label="IMC pregestacional" value={imcPre ? imcPre.toFixed(1) : '—'} sub={imcPre ? `${IOM[categoriaIMC(imcPre)].label}: ganar ${IOM[categoriaIMC(imcPre)].total.join('–')} kg` : 'Captura peso y talla'} />
      </div>
      <Card
        title="Datos del embarazo"
        actions={
          puede && (
            <>
              <Button size="sm" variant="ghost" onClick={onEditar}><Pencil className="size-4" /> Editar</Button>
              {!terminado && <Button size="sm" onClick={() => setResolver(true)}><Flag className="size-4" /> Resolución</Button>}
            </>
          )
        }
      >
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">FUM</dt><dd>{fmt(e.fum)}{e.fum && e.fumConfiable === false ? ' (no confiable)' : ''} · FPP por FUM {fmt(d.fppFum)}</dd></div>
          <div><dt className="text-xs text-muted">USG de datación</dt><dd>{e.usg ? `${fmt(e.usg.fecha)} · ${sdgTexto(e.usg.sdgDias)}${e.usg.lcc ? ` (LCC ${e.usg.lcc} mm)` : ''} · FPP por USG ${fmt(d.fppUsg)}` : 'No registrado'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted">Datación (ACOG CO 700)</dt><dd>{d.explicacion}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Antecedentes de riesgo</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {(edadMat < 18 || edadMat > 35) && !e.riesgos.includes(RIESGOS[0]) && <Badge tone="warn">Edad materna {edadMat} años</Badge>}
              {e.riesgos.map((r) => <Badge key={r} tone="warn">{r}</Badge>)}
              {e.riesgos.length === 0 && !(edadMat < 18 || edadMat > 35) && <span className="text-muted">Ninguno registrado</span>}
            </dd>
            {e.riesgoNotas && <dd className="mt-1 text-muted">{e.riesgoNotas}</dd>}
          </div>
        </dl>
        {puede && (
          <div className="mt-4 border-t border-line pt-3">
            <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (await confirmar(`Se eliminará el registro del embarazo y sus ${consultas.length} consulta(s) prenatales. Las mediciones de peso y TA guardadas como signos vitales se conservan. Esta acción no se puede deshacer.`, { titulo: 'Eliminar embarazo', aceptar: 'Eliminar', peligro: true })) { consultas.forEach((c) => remove('registros', c.id)); remove('registros', emb.id) } }}><Trash2 className="size-4" /> Eliminar embarazo</Button>
          </div>
        )}
      </Card>
      <ResolucionModal open={resolver} emb={emb} onClose={() => setResolver(false)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function EmbarazoModal({ patient, emb, onClose, onCreado }: { patient: Patient; emb: Registro | null; onClose: () => void; onCreado: (id: string) => void }) {
  const prev = emb ? datosEmb(emb) : null
  const [f, setF] = useState({
    fum: prev?.fum ?? '',
    fumConfiable: prev?.fumConfiable ?? true,
    usgFecha: prev?.usg?.fecha ?? '',
    usgSem: prev?.usg ? String(Math.floor(prev.usg.sdgDias / 7)) : '',
    usgDias: prev?.usg ? String(prev.usg.sdgDias % 7) : '',
    gesta: String(prev?.gesta ?? 1),
    para: String(prev?.para ?? 0),
    cesareas: String(prev?.cesareas ?? 0),
    abortos: String(prev?.abortos ?? 0),
    grupoRh: prev?.grupoRh ?? patient.tipoSangre ?? '',
    pesoPre: prev?.pesoPre ? String(prev.pesoPre) : '',
    talla: prev?.talla ? String(prev.talla) : '',
    riesgos: prev?.riesgos ?? [],
    riesgoNotas: prev?.riesgoNotas ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const usgDias = f.usgFecha && f.usgSem ? Number(f.usgSem) * 7 + Number(f.usgDias || 0) : null
  const datos: DatosEmbarazo = {
    ...(prev ?? {}),
    clase: 'embarazo',
    fum: f.fum || undefined,
    fumConfiable: f.fumConfiable,
    usg: usgDias !== null ? { ...(prev?.usg?.fecha === f.usgFecha ? prev.usg : {}), fecha: f.usgFecha, sdgDias: usgDias } : undefined,
    gesta: Number(f.gesta) || 1,
    para: Number(f.para) || 0,
    cesareas: Number(f.cesareas) || 0,
    abortos: Number(f.abortos) || 0,
    grupoRh: f.grupoRh || undefined,
    pesoPre: num(f.pesoPre),
    talla: num(f.talla),
    riesgos: f.riesgos,
    riesgoNotas: f.riesgoNotas || undefined,
  }
  const d = datacionDe(datos)
  const incoherente = datos.para + datos.cesareas + datos.abortos > datos.gesta - (emb?.estado === 'terminado' ? 0 : 1)
  const valido = !!d.fumEfectiva && !(f.fum && f.fum > hoyISO())

  function guardar() {
    if (emb) update('registros', emb.id, { titulo: tituloEmbarazo(datos), datos: asDatos(datos) })
    else {
      const r = add('registros', { patientId: patient.id, tipo: 'prenatal', estado: 'activo', titulo: tituloEmbarazo(datos), fecha: new Date((d.fumEfectiva ?? hoyISO()) + 'T12:00:00').toISOString(), datos: asDatos(datos) })
      onCreado(r.id)
    }
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={emb ? 'Editar embarazo' : 'Nuevo embarazo'} wide>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="FUM" className="sm:col-span-2"><Input type="date" value={f.fum} max={hoyISO()} onChange={set('fum')} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2 sm:mt-5">
          <input type="checkbox" checked={f.fumConfiable} onChange={(e) => setF({ ...f, fumConfiable: e.target.checked })} /> FUM confiable (ciclos regulares, sin anticonceptivos hormonales recientes)
        </label>
        <Field label="Fecha del USG de datación" className="sm:col-span-2" hint="Idealmente < 14 SDG"><Input type="date" value={f.usgFecha} onChange={set('usgFecha')} /></Field>
        <Field label="EG por USG (semanas)"><Input type="number" min={4} max={42} value={f.usgSem} onChange={set('usgSem')} /></Field>
        <Field label="+ días"><Input type="number" min={0} max={6} value={f.usgDias} onChange={set('usgDias')} /></Field>
        <div className="rounded-lg bg-surface-2 p-3 text-sm sm:col-span-4">
          <div><b>FPP:</b> {fmt(d.fpp)} {d.metodo !== 'ninguno' && <Badge tone={d.metodo === 'USG' ? 'warn' : 'brand'}>por {d.metodo}</Badge>}</div>
          <div className="mt-1 text-xs text-muted">{d.explicacion} FPP = FUM + 280 días (regla de Naegele). Criterios de re-datación: ACOG Committee Opinion 700.</div>
        </div>
        <Field label="Gestas (incluye el actual)"><Input type="number" min={1} value={f.gesta} onChange={set('gesta')} /></Field>
        <Field label="Partos"><Input type="number" min={0} value={f.para} onChange={set('para')} /></Field>
        <Field label="Cesáreas"><Input type="number" min={0} value={f.cesareas} onChange={set('cesareas')} /></Field>
        <Field label="Abortos"><Input type="number" min={0} value={f.abortos} onChange={set('abortos')} /></Field>
        {incoherente && <p className="text-xs text-warn sm:col-span-4">Partos + cesáreas + abortos no cuadra con el número de gestas.</p>}
        <Field label="Grupo y Rh">
          <Select value={f.grupoRh} onChange={set('grupoRh')}>
            <option value="">—</option>
            {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((g) => <option key={g}>{g}</option>)}
          </Select>
        </Field>
        <Field label="Peso pregestacional (kg)"><Input inputMode="decimal" value={f.pesoPre} onChange={set('pesoPre')} /></Field>
        <Field label="Talla (cm)"><Input inputMode="decimal" value={f.talla} onChange={set('talla')} /></Field>
        <div className="text-sm sm:mt-5">{datos.pesoPre && datos.talla ? `IMC ${imc(datos.pesoPre, datos.talla).toFixed(1)} · ${IOM[categoriaIMC(imc(datos.pesoPre, datos.talla))].label}` : ''}</div>
        <fieldset className="sm:col-span-4">
          <legend className="mb-1 text-xs font-medium text-muted">Antecedentes de riesgo</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {RIESGOS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.riesgos.includes(r)} onChange={(e) => setF({ ...f, riesgos: e.target.checked ? [...f.riesgos, r] : f.riesgos.filter((x) => x !== r) })} /> {r}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Otros antecedentes / notas" className="sm:col-span-4"><Textarea value={f.riesgoNotas} onChange={set('riesgoNotas')} className="min-h-14" /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!valido} onClick={guardar}>Guardar</Button>
      </div>
      {!valido && <p className="mt-2 text-right text-xs text-muted">Captura la FUM o un USG de datación.</p>}
    </Modal>
  )
}

function ResolucionModal({ open, emb, onClose }: { open: boolean; emb: Registro; onClose: () => void }) {
  const e = datosEmb(emb)
  const [r, setR] = useState<Resolucion>({ fecha: hoyISO(), tipo: 'parto', rnSexo: '', notas: '' })
  const [peso, setPeso] = useState('')
  const fumEf = datacionDe(e).fumEfectiva
  function guardar() {
    const res: Resolucion = { ...r, rnPeso: num(peso), sdgDias: fumEf ? sdgEn(fumEf, r.fecha) : undefined }
    update('registros', emb.id, { estado: 'terminado', datos: asDatos({ ...e, resolucion: res }) })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Resolución del embarazo">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><Input type="date" value={r.fecha} onChange={(ev) => setR({ ...r, fecha: ev.target.value })} /></Field>
        <Field label="Tipo">
          <Select value={r.tipo} onChange={(ev) => setR({ ...r, tipo: ev.target.value as Resolucion['tipo'] })}>
            <option value="parto">Parto</option><option value="cesarea">Cesárea</option><option value="aborto">Aborto</option><option value="ectopico">Embarazo ectópico</option><option value="otro">Otro</option>
          </Select>
        </Field>
        {fumEf && <p className="col-span-2 text-sm text-muted">Edad gestacional a esa fecha: {sdgTexto(sdgEn(fumEf, r.fecha))}</p>}
        {(r.tipo === 'parto' || r.tipo === 'cesarea') && (
          <>
            <Field label="Sexo del RN">
              <Select value={r.rnSexo} onChange={(ev) => setR({ ...r, rnSexo: ev.target.value as Resolucion['rnSexo'] })}>
                <option value="">—</option><option value="F">Femenino</option><option value="M">Masculino</option>
              </Select>
            </Field>
            <Field label="Peso del RN (g)"><Input inputMode="numeric" value={peso} onChange={(ev) => setPeso(ev.target.value)} /></Field>
            <Field label="Apgar (1′/5′)"><Input value={r.apgar ?? ''} onChange={(ev) => setR({ ...r, apgar: ev.target.value })} placeholder="8/9" /></Field>
          </>
        )}
        <Field label="Notas" className="col-span-2"><Textarea value={r.notas ?? ''} onChange={(ev) => setR({ ...r, notas: ev.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={guardar}>Terminar embarazo</Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
const VACIA = { fecha: '', peso: '', pas: '', pad: '', au: '', fcf: '', movimientos: '', edema: '', proteinuria: '', presentacion: '', notas: '' }

function Consultas({ emb, consultas, puede, pid }: { emb: Registro; consultas: Registro[]; puede: boolean; pid: string }) {
  const e = datosEmb(emb)
  const fumEf = datacionDe(e).fumEfectiva
  const puedeObs = useCan('obs.escribir')
  const [f, setF] = useState({ ...VACIA, fecha: hoyISO() })
  const [sintomas, setSintomas] = useState<string[]>([])
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value })
  const sdg = fumEf && f.fecha ? sdgEn(fumEf, f.fecha) : null
  const c: ConsultaPrenatal = {
    fecha: f.fecha,
    peso: num(f.peso),
    pas: num(f.pas),
    pad: num(f.pad),
    au: num(f.au),
    fcf: num(f.fcf),
    movimientos: f.movimientos as ConsultaPrenatal['movimientos'],
    edema: f.edema as ConsultaPrenatal['edema'],
    proteinuria: f.proteinuria as ConsultaPrenatal['proteinuria'],
    presentacion: f.presentacion as ConsultaPrenatal['presentacion'],
    sintomas,
    notas: f.notas || undefined,
  }
  const alertas = alertasConsulta(c, sdg)
  const lista = [...consultas].sort((a, b) => b.fecha.localeCompare(a.fecha))

  function guardar() {
    const fechaISO = new Date(f.fecha + 'T12:00:00').toISOString()
    const obsIds: string[] = []
    if (puedeObs) {
      const o = (codigo: string, valor: number | undefined, unidad: string) => {
        if (valor === undefined || !(valor > 0)) return
        obsIds.push(add('observations', { patientId: pid, fecha: fechaISO, codigo, valor, unidad, fuente: 'manual', etiqueta: 'Control prenatal' }).id)
      }
      o('peso', c.peso, 'kg')
      o('pas', c.pas, 'mmHg')
      o('pad', c.pad, 'mmHg')
    }
    const limpio = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)))
    const datos: DatosConsulta = { ...(limpio as unknown as ConsultaPrenatal), clase: 'consulta', embarazoId: emb.id, sdgDias: sdg ?? undefined, obsIds }
    add('registros', { patientId: pid, tipo: 'prenatal', estado: alertas.length ? 'alerta' : 'normal', titulo: `Consulta prenatal ${sdg !== null ? sdgTexto(sdg) : ''}`.trim(), fecha: fechaISO, datos: asDatos(datos) })
    toast(alertas.length ? `Consulta guardada con ${alertas.length} alerta(s)` : 'Consulta guardada', alertas.length ? 'warn' : 'ok')
    setF({ ...VACIA, fecha: hoyISO() })
    setSintomas([])
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      {puede && emb.estado !== 'terminado' && (
        <Card title="Nueva consulta prenatal">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Field>
            <div className="self-end pb-2 text-sm"><span className="text-muted">EG:</span> <b>{sdg !== null ? sdgTexto(sdg) : '—'}</b></div>
            <Field label="Peso (kg)"><Input inputMode="decimal" value={f.peso} onChange={set('peso')} /></Field>
            <Field label="Altura uterina (cm)"><Input inputMode="decimal" value={f.au} onChange={set('au')} /></Field>
            <Field label="TA sistólica (mmHg)"><Input inputMode="numeric" value={f.pas} onChange={set('pas')} /></Field>
            <Field label="TA diastólica (mmHg)"><Input inputMode="numeric" value={f.pad} onChange={set('pad')} /></Field>
            <Field label="FCF (lpm)"><Input inputMode="numeric" value={f.fcf} onChange={set('fcf')} /></Field>
            <Field label="Movimientos fetales">
              <Select value={f.movimientos} onChange={set('movimientos')}><option value="">—</option><option value="presentes">Presentes</option><option value="disminuidos">Disminuidos</option><option value="ausentes">Ausentes</option></Select>
            </Field>
            <Field label="Edema">
              <Select value={f.edema} onChange={set('edema')}><option value="">—</option><option value="no">No</option><option value="leve">Leve (maleolar)</option><option value="moderado">Moderado</option><option value="generalizado">Generalizado (cara/manos)</option></Select>
            </Field>
            <Field label="Proteinuria (tira)">
              <Select value={f.proteinuria} onChange={set('proteinuria')}><option value="">No realizada</option>{['negativa', 'trazas', '1+', '2+', '3+', '4+'].map((p) => <option key={p}>{p}</option>)}</Select>
            </Field>
            <Field label="Presentación" className="col-span-2">
              <Select value={f.presentacion} onChange={set('presentacion')}><option value="">—</option><option value="cefalica">Cefálica</option><option value="pelvica">Pélvica</option><option value="transversa">Transversa</option><option value="no-valorable">No valorable</option></Select>
            </Field>
            <fieldset className="col-span-2">
              <legend className="mb-1 text-xs font-medium text-muted">Síntomas de alarma referidos</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {SINTOMAS_ALARMA.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={sintomas.includes(s)} onChange={(ev) => setSintomas(ev.target.checked ? [...sintomas, s] : sintomas.filter((x) => x !== s))} /> {s}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Notas" className="col-span-2"><Textarea value={f.notas} onChange={set('notas')} className="min-h-14" /></Field>
          </div>
          {alertas.length > 0 && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-2 text-sm" role="status">
              {alertas.map((a, i) => <div key={i} className="flex gap-1.5"><AlertTriangle className={cx('mt-0.5 size-4 shrink-0', a.nivel === 'danger' ? 'text-danger' : 'text-warn')} />{a.texto}</div>)}
            </div>
          )}
          <Button variant="primary" className="mt-3 w-full" disabled={!f.fecha} onClick={guardar}><Plus className="size-4" /> Guardar consulta</Button>
          <p className="mt-2 text-xs text-muted">{puedeObs ? 'El peso y la TA también se guardan como signos vitales del paciente.' : 'Tu rol no guarda signos vitales: el peso y la TA quedan solo en la consulta.'} Alertas: NOM-007-SSA2-2016 y GPC de enfermedades hipertensivas del embarazo (TA ≥ 140/90; rango severo ≥ 160/110), FCF 110–160 lpm, altura uterina SDG ± 2 cm (20–36 SDG).</p>
        </Card>
      )}
      <div className="grid content-start gap-3">
        {lista.length === 0 && <Empty>Sin consultas prenatales registradas.</Empty>}
        {lista.map((r) => {
          const x = datosCons(r)
          const al = alertasConsulta(x, x.sdgDias ?? null)
          return (
            <article key={r.id} className="rounded-xl border border-line bg-surface p-3">
              <header className="flex flex-wrap items-center gap-2">
                <b className="text-sm">{fmt(x.fecha)}</b>
                <Badge tone="brand">{x.sdgDias !== undefined ? sdgTexto(x.sdgDias) : 'Sin EG'}</Badge>
                {al.length > 0 ? <Badge tone="danger">{al.length} alerta(s)</Badge> : <Badge tone="ok">Sin alertas</Badge>}
                {puede && (
                  <Button size="sm" variant="ghost" className="ml-auto" aria-label={`Eliminar consulta del ${fmt(x.fecha)}`} onClick={async () => { if (await confirmar(`¿Eliminar la consulta del ${fmt(x.fecha)}? También se eliminarán el peso y la TA guardados como signos vitales desde esta consulta.`, { titulo: 'Eliminar consulta', aceptar: 'Eliminar', peligro: true })) { (x.obsIds ?? []).forEach((id) => remove('observations', id)); remove('registros', r.id) } }}><Trash2 className="size-4" /></Button>
                )}
              </header>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {([['Peso', x.peso && `${x.peso} kg`], ['TA', x.pas && `${x.pas}/${x.pad ?? '—'}`], ['AU', x.au && `${x.au} cm`], ['FCF', x.fcf && `${x.fcf} lpm`], ['Movimientos', x.movimientos], ['Edema', x.edema], ['Proteinuria', x.proteinuria], ['Presentación', x.presentacion]] as [string, unknown][])
                  .filter(([, v]) => v)
                  .map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{String(v)}</dd></div>)}
              </dl>
              {x.notas && <p className="mt-2 text-sm text-muted">{x.notas}</p>}
              {al.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-danger">{al.map((a, i) => <li key={i}>{a.texto}</li>)}</ul>}
            </article>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Calendario({ emb, consultas }: { emb: Registro; consultas: Registro[] }) {
  const e = datosEmb(emb)
  const fumEf = datacionDe(e).fumEfectiva
  const hoy = hoyISO()
  const sem = fumEf ? sdgEn(fumEf, e.resolucion?.fecha ?? hoy) / 7 : null
  const semConsultas = consultas.map((c) => (datosCons(c).sdgDias ?? -99) / 7)
  const rhNeg = rhNegativo(e.grupoRh)
  const fechaSem = (s: number) => (fumEf ? fmt(sumarDias(fumEf, Math.round(s * 7))) : '')
  const vacunas = useRegistros('vacuna', emb.patientId ?? '__ninguno__')
  const aplicada = (vacunaId?: string) => {
    if (!vacunaId || !fumEf) return undefined
    const r = vacunas.find((v) => (v.datos as { vacunaId?: string }).vacunaId === vacunaId && v.fecha.slice(0, 10) >= fumEf)
    return r?.fecha
  }
  const ventana = (a: number, b: number) => {
    const t = (n: number) => (n % 1 ? `${Math.floor(n)}.6` : String(n))
    if (b >= 41) return a === 0 ? 'Todo el embarazo' : `Desde ${a} SDG`
    if (Math.floor(b) === a) return `${a} SDG`
    return a === 0 ? `Hasta ${t(b)} SDG` : `${a}–${t(b)} SDG`
  }
  const estado = (desde: number, hasta: number) => (sem === null ? 'futuro' : sem > hasta ? 'pasado' : sem >= desde ? 'actual' : 'futuro')
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Consultas recomendadas (NOM-007-SSA2-2016)">
        <ul className="grid gap-1.5 text-sm">
          {CONSULTAS_NOM007.map((c) => {
            const hecha = semConsultas.some((s) => s >= c.desde - 1 && s <= c.hasta + 1)
            const st = estado(c.desde, c.hasta)
            return (
              <li key={c.texto} className="flex items-start gap-2">
                {hecha ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Realizada" /> : <Circle className={cx('mt-0.5 size-4 shrink-0', st === 'pasado' ? 'text-warn' : 'text-muted')} aria-label={st === 'pasado' ? 'No registrada' : 'Pendiente'} />}
                <span className={cx(st === 'actual' && 'font-semibold')}>{c.texto}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{fechaSem(c.desde)}</span>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">NOM-007-SSA2-2016, numeral 5.2.1: mínimo cinco consultas, iniciando en las primeras 8 semanas. Se marca como realizada si hay una consulta registrada en esa ventana (± 1 semana).</p>
      </Card>
      <Card title="Estudios, suplementos y vacunas">
        <ul className="grid gap-2 text-sm">
          {CALENDARIO.filter((x) => !x.soloRhNeg || rhNeg).map((x) => {
            const st = estado(x.desde, x.hasta)
            return (
              <li key={x.texto} className={cx('rounded-lg border p-2', st === 'actual' ? 'border-brand bg-brand-soft/40' : 'border-line')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={x.tipo === 'vacuna' ? 'brand' : x.tipo === 'estudio' ? 'neutral' : 'ok'}>{x.tipo}</Badge>
                  <span className="text-xs text-muted">{ventana(x.desde, x.hasta)}</span>
                  {aplicada(x.vacunaId) ? <Badge tone="ok">Aplicada {fmt(aplicada(x.vacunaId))}</Badge> : st === 'actual' ? <Badge tone="warn">Toca ahora</Badge> : st === 'pasado' ? <span className="text-xs text-muted">ventana pasada</span> : null}
                </div>
                <div className="mt-1">{x.texto}{x.verificar && <span className="text-xs text-warn"> (verificar)</span>}</div>
                <div className="text-xs text-muted">{x.ref}</div>
              </li>
            )
          })}
        </ul>
        {!rhNeg && <p className="mt-2 text-xs text-muted">Si la paciente es Rh negativo se agrega el seguimiento con Coombs indirecto e inmunoglobulina anti-D.</p>}
        <p className="mt-2 text-xs text-muted">Las vacunas aplicadas se registran en el módulo de Vacunación. Elementos marcados “(verificar)”: confirme con la GPC/lineamiento vigente de su institución.</p>
      </Card>
      {sem !== null && <p className="text-xs text-muted lg:col-span-2"><Baby className="mr-1 inline size-3.5" />Edad gestacional actual {sdgTexto(Math.round(sem * 7))}; {diasEntre(hoy, datacionDe(e).fpp ?? hoy) >= 0 ? `faltan ${diasEntre(hoy, datacionDe(e).fpp ?? hoy)} días para la FPP.` : 'FPP rebasada.'}</p>}
    </div>
  )
}
