import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, Download, Eye, FileBadge, FilePen, FileWarning, MessageCircle, Printer, RefreshCw, Save, Send, Share2, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { Page, Card, Button, Field, Input, Textarea, Select, Badge, Notice, Empty, PatientBar, Modal, Disclaimer } from '../../components/ui'
import { toast } from '../../components/toast'
import { confirmar, pedirTexto } from '../../components/dialogos'
import { add, getDB, remove, update, useActivePatient, useCollection, useSettings } from '../../lib/store'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import type { Observation, Patient, Registro } from '../../lib/types'
import { cx, downloadBlob, fmtFecha, fmtFechaHora } from '../../lib/utils'
import { telWhatsApp } from '../ordenes/comun'
import { compartirPDF, imprimirPDF } from '../ordenes/pdfComun'
import { datosCert, esCert, estadoCert, prepararCancelacion, prepararEmision, recalcularHuella, tituloCert } from './documento'
import { FINALIDAD, PLANTILLAS, diasIncapacidad, hastaPorDias, infoPlantilla, resumenClinico, urlVerificacion, verificar, type Campos, type EstadoCert, type Plantilla } from './plantillas'
import { baseVerificacion, certificadoPDF, snapPaciente } from './pdf'

const TONO: Record<EstadoCert, 'warn' | 'ok' | 'danger'> = { borrador: 'warn', emitido: 'ok', cancelado: 'danger' }
const ESTADO: Record<EstadoCert, string> = { borrador: 'Borrador', emitido: 'Emitido', cancelado: 'Cancelado' }
const ESPECIALIDADES = ['Cardiología', 'Medicina interna', 'Endocrinología', 'Nefrología', 'Neurología', 'Ortopedia y traumatología', 'Ginecología y obstetricia', 'Pediatría', 'Cirugía general', 'Oftalmología', 'Otorrinolaringología', 'Dermatología', 'Psiquiatría', 'Gastroenterología', 'Neumología', 'Urología', 'Reumatología', 'Oncología', 'Rehabilitación', 'Urgencias']
const hoy = () => new Date().toLocaleDateString('en-CA')

interface Edicion {
  id?: string
  plantilla: Plantilla
  campos: Campos
}

function ultimo(obs: Observation[], codigo: string) {
  return obs.filter((o) => o.codigo === codigo).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
}

/** Valores iniciales de cada plantilla con datos del expediente. */
function iniciales(plantilla: Plantilla, p: Patient): Campos {
  const db = getDB()
  const obs = db.observations.filter((o) => o.patientId === p.id)
  const v = (c: string) => {
    const o = ultimo(obs, c)
    return o ? String(o.valor) : ''
  }
  const pas = v('pas')
  const pad = v('pad')
  const signos: Campos = { peso: v('peso'), talla: v('talla'), ta: pas && pad ? `${pas}/${pad}` : '', fc: v('fc'), fr: v('fr'), temp: v('temp') }
  const nota = db.encounters.filter((e) => e.patientId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const dx = nota?.diagnosticos.map((d) => `${d.codigo} ${d.nombre}`).join('; ') ?? ''
  const s = db.settings
  switch (plantilla) {
    case 'salud':
      return { finalidad: 'buena-salud', conclusion: 'apto', tipoSangre: p.tipoSangre ?? '', ...signos }
    case 'asistencia':
      return { fechaAtencion: hoy(), horaLlegada: '', horaSalida: new Date().toTimeString().slice(0, 5), motivo: 'consulta médica' }
    case 'incapacidad':
      return { desde: hoy(), hasta: hoy(), actividad: 'laborales', reposo: 'relativo', incluirDx: false, diagnostico: dx }
    case 'prenupcial':
      return { tipoSangre: p.tipoSangre ?? '', vdrl: '', vih: '', ...signos }
    case 'referencia': {
      const sigl = [
        signos.ta && { etiqueta: 'TA', valor: `${signos.ta} mmHg` },
        signos.fc && { etiqueta: 'FC', valor: `${signos.fc} lpm` },
        signos.fr && { etiqueta: 'FR', valor: `${signos.fr} rpm` },
        signos.temp && { etiqueta: 'Temp', valor: `${signos.temp} °C` },
        v('spo2') && { etiqueta: 'SpO2', valor: `${v('spo2')} %` },
        signos.peso && { etiqueta: 'Peso', valor: `${signos.peso} kg` },
      ].filter(Boolean) as { etiqueta: string; valor: string }[]
      return {
        modalidad: 'referencia',
        origen: [s.clinica, s.doctor.direccion, s.doctor.telefono && `Tel. ${s.doctor.telefono}`].filter(Boolean).join(' · '),
        destino: '',
        especialidad: '',
        urgencia: 'ordinaria',
        motivo: '',
        resumen: resumenClinico({
          alergias: p.alergias,
          medicamentos: p.medicamentosActuales ?? [],
          antecedentes: p.antecedentes,
          ultimaNota: nota,
          signos: sigl.map((x) => ({ ...x, fecha: '' })),
        }),
        impresionDx: dx,
        tratamiento: (p.medicamentosActuales ?? []).join('; '),
        estudiosAdjuntos: [],
      }
    }
  }
}

export default function Certificados() {
  const [sp] = useSearchParams()
  const { patient } = useActivePatient()
  const puede = useCanRegistro('certificado', 'write')
  const [ed, setEd] = useState<Edicion | null>(null)
  const [defuncion, setDefuncion] = useState(false)
  useEffect(() => setEd(null), [patient?.id])
  const v = sp.get('v')

  return (
    <Page title="Certificados y referencias" subtitle="Certificados médicos, constancias, justificantes y cartas de referencia con folio y QR de verificación.">
      {v && <Verificacion folio={v} hash={sp.get('h') ?? ''} />}
      <PatientBar />
      {patient && (
        <>
          {puede && !ed && (
            <Card title="Nuevo documento" className="mb-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PLANTILLAS.map((t) => (
                  <button key={t.id} onClick={() => setEd({ plantilla: t.id, campos: iniciales(t.id, patient) })} className="rounded-xl border border-line p-3 text-left hover:border-brand hover:bg-brand-soft/30">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileBadge className="size-4 shrink-0 text-brand" /> {t.nombre}
                    </div>
                    <div className="mt-1 text-xs text-muted">{t.descripcion}</div>
                  </button>
                ))}
                <button onClick={() => setDefuncion(true)} className="rounded-xl border border-dashed border-line p-3 text-left hover:bg-surface-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileWarning className="size-4 shrink-0 text-muted" /> Certificado de defunción
                  </div>
                  <div className="mt-1 text-xs text-muted">Formato oficial de la Secretaría de Salud: no se genera aquí.</div>
                </button>
              </div>
            </Card>
          )}
          {!puede && <Notice>Solo los médicos pueden emitir certificados y referencias. Puedes consultar y reimprimir los emitidos.</Notice>}
          {ed && puede && <Editor key={ed.id ?? ed.plantilla} p={patient} ed={ed} onClose={() => setEd(null)} />}
          <Historial p={patient} onEditar={puede ? setEd : undefined} />
        </>
      )}
      <Modal open={defuncion} onClose={() => setDefuncion(false)} title="Certificado de defunción">
        <div className="space-y-2 text-sm">
          <p>
            El <b>Certificado de Defunción</b> es un formato oficial, foliado y controlado por la Secretaría de Salud (Dirección General de Información en Salud, subsistema SINBA/SEED). Se obtiene en la Jurisdicción Sanitaria o institución correspondiente y lo llena el médico que certifica la muerte, en el formato impreso oficial o en el sistema electrónico autorizado.
          </p>
          <p>MediSuite <b>no genera</b> este documento porque un formato propio no tiene validez para el Registro Civil.</p>
          <p className="text-muted">Para la causa de muerte use la CIE-10 y la secuencia de causas (directa, intermedias y básica) según el instructivo oficial vigente de la DGIS (verificar la versión vigente).</p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setDefuncion(false)}>Entendido</Button>
        </div>
      </Modal>
      <Disclaimer>
        Fundamento: Ley General de Salud art. 83 (cédula e institución en la papelería profesional); NOM-004-SSA3-2012 numeral 6.4 (nota de referencia/traslado). La huella SHA-256 en el QR permite verificar en este sistema que el documento emitido no fue alterado; no equivale a una firma electrónica avanzada (e.firma).
      </Disclaimer>
    </Page>
  )
}

// ---------------------------------------------------------------- Verificación (QR)
function Verificacion({ folio, hash }: { folio: string; hash: string }) {
  const regs = useCollection('registros', (r) => esCert(r) && datosCert(r).folio === folio, [folio])
  const r = regs[0]
  const res = verificar(r, hash, () => (r ? recalcularHuella(r) : ''))
  const d = r ? datosCert(r) : null
  const ok = res === 'valido'
  return (
    <div className={cx('mb-4 rounded-xl border-2 p-4', ok ? 'border-ok bg-ok/10' : 'border-danger bg-danger/10')} role="status">
      <div className={cx('flex items-center gap-2 font-semibold', ok ? 'text-ok' : 'text-danger')}>
        {ok ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
        {res === 'valido' && `Documento ${folio} válido`}
        {res === 'cancelado' && `Documento ${folio} CANCELADO`}
        {res === 'alterado' && `La huella de ${folio} no coincide: el documento pudo ser alterado`}
        {res === 'no-encontrado' && `No se encontró el folio ${folio} en este sistema`}
        {res === 'borrador' && `${folio} es un borrador sin validez`}
      </div>
      {d && (
        <div className="mt-1 text-sm">
          {r.titulo} · emitido {d.emitidoEn ? fmtFechaHora(d.emitidoEn) : '—'} por {d.medico?.nombre} (céd. {d.medico?.cedula}) · paciente {d.paciente?.nombre}
          {res === 'cancelado' && d.motivoCancelacion && <div>Motivo de cancelación: {d.motivoCancelacion}</div>}
        </div>
      )}
      {res === 'no-encontrado' && <p className="mt-1 text-sm text-muted">Inicie sesión en el sistema del consultorio que emitió el documento para verificarlo.</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Editor
function Editor({ p, ed, onClose }: { p: Patient; ed: Edicion; onClose: () => void }) {
  const settings = useSettings()
  const [campos, setCampos] = useState<Campos>(ed.campos)
  const [id, setId] = useState(ed.id)
  const [busy, setBusy] = useState(false)
  const info = infoPlantilla(ed.plantilla)
  const docs = useCollection('documents', (d) => d.patientId === p.id, [p.id])
  const set = (k: string, val: Campos[string]) => setCampos((c) => ({ ...c, [k]: val }))
  const str = (k: string) => (typeof campos[k] === 'string' ? (campos[k] as string) : '')
  const tipoReg = info.tipoRegistro

  const guardar = (): Registro => {
    const datos = { plantilla: ed.plantilla, campos }
    const titulo = tituloCert(ed.plantilla, campos)
    if (id) {
      const prev = getDB().registros.find((r) => r.id === id)!
      update('registros', id, { titulo, datos: { ...prev.datos, ...datos } })
      return { ...prev, titulo, datos: { ...prev.datos, ...datos } }
    }
    const r = add('registros', { patientId: p.id, tipo: tipoReg, estado: 'borrador', titulo, datos })
    setId(r.id)
    return r
  }
  const vistaPrevia = async () => {
    setBusy(true)
    try {
      const r: Registro = { id: id ?? 'preview', patientId: p.id, tipo: tipoReg, estado: 'borrador', fecha: new Date().toISOString(), datos: { plantilla: ed.plantilla, campos } }
      const url = URL.createObjectURL(await certificadoPDF(r, p, settings))
      if (!window.open(url, '_blank', 'noopener')) downloadBlob(url, 'vista-previa.pdf')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast((e as Error).message, 'danger')
    } finally {
      setBusy(false)
    }
  }
  const validar = (): string | null => {
    if (ed.plantilla === 'incapacidad' && diasIncapacidad(str('desde'), str('hasta')) < 1) return 'Revisa las fechas de reposo: la fecha final no puede ser anterior a la inicial.'
    if (ed.plantilla === 'referencia' && (!str('motivo') || !(str('destino') || str('especialidad')))) return 'Indica el motivo de envío y el servicio o especialidad destino.'
    if (!settings.doctor.cedula) return 'Falta la cédula profesional del médico (Configuración › Perfil).'
    return null
  }
  const emitir = () => {
    const r = guardar()
    const ahora = new Date().toISOString()
    const patch = prepararEmision(r, snapPaciente(p, ahora), { nombre: settings.doctor.nombre, cedula: settings.doctor.cedula, especialidad: settings.doctor.especialidad, cedulaEspecialidad: settings.doctor.cedulaEspecialidad }, getDB().registros, ahora)
    update('registros', r.id, patch)
    toast(`${patch.titulo} emitido.`, 'ok')
    onClose()
  }
  const err = validar()

  return (
    <Card title={<span>{info.nombre} {id ? <Badge tone="warn">Borrador guardado</Badge> : <Badge>Nuevo</Badge>}</span>} className="mb-4">
      {info.aviso && <Notice tone="warn">{info.aviso}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        {ed.plantilla !== 'referencia' && (
          <Field label="Dirigido a" className="sm:col-span-2">
            <Input value={str('destinatario')} onChange={(e) => set('destinatario', e.target.value)} placeholder="A quien corresponda" />
          </Field>
        )}

        {ed.plantilla === 'salud' && (
          <>
            <Field label="Finalidad">
              <Select value={str('finalidad')} onChange={(e) => set('finalidad', e.target.value)}>
                {Object.entries(FINALIDAD).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            {str('finalidad') === 'deportivo' ? (
              <Field label="Deporte o actividad (opcional)">
                <Input value={str('deporte')} onChange={(e) => set('deporte', e.target.value)} placeholder="Ej. fútbol, natación" />
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
          </>
        )}

        {(ed.plantilla === 'salud' || ed.plantilla === 'prenupcial') && (
          <>
            <Signos campos={campos} set={set} />
            <Field label="Grupo sanguíneo y Rh">
              <Input value={str('tipoSangre')} onChange={(e) => set('tipoSangre', e.target.value)} placeholder="Ej. O+" />
            </Field>
            {ed.plantilla === 'salud' && (
              <Field label="Agudeza visual (opcional)">
                <Input value={str('agudeza')} onChange={(e) => set('agudeza', e.target.value)} placeholder="Ej. 20/20 AO" />
              </Field>
            )}
          </>
        )}

        {ed.plantilla === 'prenupcial' && (
          <>
            <Field label="VDRL">
              <Select value={str('vdrl')} onChange={(e) => set('vdrl', e.target.value)}>
                <option value="">No incluir</option>
                <option>No reactivo</option>
                <option>Reactivo</option>
              </Select>
            </Field>
            <Field label="Prueba de VIH" hint="Solo con consentimiento informado de la persona (NOM-010-SSA2-2010).">
              <Select value={str('vih')} onChange={(e) => set('vih', e.target.value)}>
                <option value="">No incluir</option>
                <option>No reactiva</option>
                <option>Reactiva (requiere confirmación)</option>
              </Select>
            </Field>
            <Field label="Otros estudios (opcional)">
              <Input value={str('otrosEstudios')} onChange={(e) => set('otrosEstudios', e.target.value)} placeholder="Ej. BH normal" />
            </Field>
            <Field label="Fecha de los estudios">
              <Input type="date" value={str('fechaEstudios')} onChange={(e) => set('fechaEstudios', e.target.value)} />
            </Field>
          </>
        )}

        {(ed.plantilla === 'salud' || ed.plantilla === 'prenupcial') && (
          <Field label="Exploración física / hallazgos" className="sm:col-span-2">
            <Textarea value={str('hallazgos')} onChange={(e) => set('hallazgos', e.target.value)} placeholder="Sin alteraciones clínicas aparentes al momento de la exploración." />
          </Field>
        )}

        {ed.plantilla === 'salud' && (
          <>
            <Field label="Conclusión">
              <Select value={str('conclusion')} onChange={(e) => set('conclusion', e.target.value)}>
                <option value="apto">Sano / apto</option>
                <option value="apto-restricciones">Apto con restricciones</option>
                <option value="no-apto">No apto por el momento</option>
              </Select>
            </Field>
            <Field label="Vigencia sugerida (opcional)">
              <Input value={str('vigencia')} onChange={(e) => set('vigencia', e.target.value)} placeholder="Ej. 6 meses" />
            </Field>
            {str('conclusion') !== 'apto' && (
              <Field label="Restricciones / motivo" className="sm:col-span-2">
                <Textarea value={str('restricciones')} onChange={(e) => set('restricciones', e.target.value)} />
              </Field>
            )}
          </>
        )}
        {ed.plantilla === 'prenupcial' && (
          <Field label="Conclusión (opcional; si se deja vacío se usa el texto estándar)" className="sm:col-span-2">
            <Textarea value={str('conclusion')} onChange={(e) => set('conclusion', e.target.value)} />
          </Field>
        )}

        {ed.plantilla === 'asistencia' && (
          <>
            <Field label="Fecha de atención">
              <Input type="date" value={str('fechaAtencion')} onChange={(e) => set('fechaAtencion', e.target.value)} />
            </Field>
            <Field label="Motivo (genérico)">
              <Input value={str('motivo')} onChange={(e) => set('motivo', e.target.value)} />
            </Field>
            <Field label="Hora de llegada">
              <Input type="time" value={str('horaLlegada')} onChange={(e) => set('horaLlegada', e.target.value)} />
            </Field>
            <Field label="Hora de salida">
              <Input type="time" value={str('horaSalida')} onChange={(e) => set('horaSalida', e.target.value)} />
            </Field>
            <Field label="Acompañante (opcional)">
              <Input value={str('acompanante')} onChange={(e) => set('acompanante', e.target.value)} placeholder="Nombre de quien acompaña" />
            </Field>
            <Field label="Parentesco (opcional)">
              <Input value={str('parentesco')} onChange={(e) => set('parentesco', e.target.value)} placeholder="Ej. madre" />
            </Field>
          </>
        )}

        {ed.plantilla === 'incapacidad' && (
          <>
            <Field label="Desde">
              <Input type="date" value={str('desde')} onChange={(e) => setCampos((c) => ({ ...c, desde: e.target.value, hasta: hastaPorDias(e.target.value, Math.max(1, diasIncapacidad(str('desde'), str('hasta')))) }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Días">
                <Input type="number" min={1} max={90} value={diasIncapacidad(str('desde'), str('hasta')) || ''} onChange={(e) => set('hasta', hastaPorDias(str('desde'), Number(e.target.value)))} />
              </Field>
              <Field label="Hasta (inclusive)">
                <Input type="date" value={str('hasta')} min={str('desde')} onChange={(e) => set('hasta', e.target.value)} />
              </Field>
            </div>
            <Field label="Actividades">
              <Select value={str('actividad')} onChange={(e) => set('actividad', e.target.value)}>
                <option value="laborales">Laborales</option>
                <option value="escolares">Escolares</option>
                <option value="habituales">Habituales</option>
              </Select>
            </Field>
            <Field label="Reposo">
              <Select value={str('reposo')} onChange={(e) => set('reposo', e.target.value)}>
                <option value="relativo">Relativo en domicilio</option>
                <option value="absoluto">Absoluto</option>
              </Select>
            </Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={!!campos.incluirDx} onChange={(e) => set('incluirDx', e.target.checked)} />
              <span>
                Incluir el diagnóstico en el documento
                <span className="block text-xs text-muted">El diagnóstico es un dato personal sensible (LFPDPPP): inclúyelo solo si el paciente lo autoriza; el justificante es válido sin él.</span>
              </span>
            </label>
            {!!campos.incluirDx && (
              <Field label="Diagnóstico" className="sm:col-span-2">
                <Input value={str('diagnostico')} onChange={(e) => set('diagnostico', e.target.value)} />
              </Field>
            )}
            <Field label="Recomendaciones (opcional)" className="sm:col-span-2">
              <Textarea value={str('recomendaciones')} onChange={(e) => set('recomendaciones', e.target.value)} />
            </Field>
          </>
        )}

        {ed.plantilla === 'referencia' && (
          <ReferenciaCampos p={p} campos={campos} set={set} setCampos={setCampos} docs={docs.map((d) => ({ id: d.id, nombre: `${d.nombre} (${fmtFecha(d.fecha)})` }))} />
        )}
      </div>

      {err && <p className="mt-3 text-sm text-warn">{err}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            guardar()
            toast('Borrador guardado.', 'ok')
          }}
        >
          <Save className="size-4" /> Guardar borrador
        </Button>
        <Button onClick={vistaPrevia} disabled={busy}>
          <Eye className="size-4" /> Vista previa
        </Button>
        <Button
          variant="primary"
          disabled={!!err}
          onClick={async () => {
            if (await confirmar('Se asignará un folio consecutivo y una huella de verificación. Una vez emitido no se puede modificar; si hay un error deberás cancelarlo (con motivo) y emitir uno nuevo.', { titulo: 'Emitir documento', aceptar: 'Emitir' })) emitir()
          }}
        >
          <Send className="size-4" /> Emitir
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Card>
  )
}

function Signos({ campos, set }: { campos: Campos; set: (k: string, v: string) => void }) {
  const f = (k: string, label: string, ph: string) => (
    <Field label={label}>
      <Input value={typeof campos[k] === 'string' ? (campos[k] as string) : ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} inputMode="decimal" />
    </Field>
  )
  return (
    <div className="grid grid-cols-3 gap-3 sm:col-span-2">
      {f('peso', 'Peso (kg)', '70')}
      {f('talla', 'Talla (cm)', '170')}
      {f('ta', 'TA (mmHg)', '120/80')}
      {f('fc', 'FC (lpm)', '72')}
      {f('fr', 'FR (rpm)', '16')}
      {f('temp', 'Temp. (°C)', '36.5')}
    </div>
  )
}

function ReferenciaCampos({
  p,
  campos,
  set,
  setCampos,
  docs,
}: {
  p: Patient
  campos: Campos
  set: (k: string, v: Campos[string]) => void
  setCampos: (fn: (c: Campos) => Campos) => void
  docs: { id: string; nombre: string }[]
}) {
  const str = (k: string) => (typeof campos[k] === 'string' ? (campos[k] as string) : '')
  const adj = Array.isArray(campos.estudiosAdjuntos) ? campos.estudiosAdjuntos : []
  const contra = str('modalidad') === 'contrarreferencia'
  return (
    <>
      <Field label="Tipo">
        <Select value={str('modalidad')} onChange={(e) => set('modalidad', e.target.value)}>
          <option value="referencia">Referencia (envío)</option>
          <option value="contrarreferencia">Contrarreferencia (respuesta)</option>
        </Select>
      </Field>
      <Field label="Prioridad">
        <Select value={str('urgencia')} onChange={(e) => set('urgencia', e.target.value)}>
          <option value="ordinaria">Ordinaria</option>
          <option value="preferente">Preferente</option>
          <option value="urgente">Urgente</option>
        </Select>
      </Field>
      <Field label="Establecimiento que envía" className="sm:col-span-2">
        <Input value={str('origen')} onChange={(e) => set('origen', e.target.value)} />
      </Field>
      <Field label="Especialidad / servicio destino">
        <Input value={str('especialidad')} onChange={(e) => set('especialidad', e.target.value)} list="cert-especialidades" placeholder="Ej. Cardiología" />
        <datalist id="cert-especialidades">
          {ESPECIALIDADES.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </Field>
      <Field label="Unidad / hospital / médico receptor">
        <Input value={str('destino')} onChange={(e) => set('destino', e.target.value)} placeholder="Ej. Hospital General, Dr. …" />
      </Field>
      <Field label={contra ? 'Motivo de la contrarreferencia' : 'Motivo de envío'} className="sm:col-span-2">
        <Textarea value={str('motivo')} onChange={(e) => set('motivo', e.target.value)} />
      </Field>
      <Field label="Resumen clínico (auto-armado; revísalo)" className="sm:col-span-2">
        <Textarea value={str('resumen')} onChange={(e) => set('resumen', e.target.value)} className="min-h-40" />
      </Field>
      <div className="sm:col-span-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const base = iniciales('referencia', p)
            setCampos((c) => ({ ...c, resumen: base.resumen }))
          }}
        >
          <RefreshCw className="size-4" /> Rearmar resumen desde el expediente
        </Button>
      </div>
      <Field label="Impresión diagnóstica">
        <Textarea value={str('impresionDx')} onChange={(e) => set('impresionDx', e.target.value)} />
      </Field>
      <Field label="Terapéutica empleada">
        <Textarea value={str('tratamiento')} onChange={(e) => set('tratamiento', e.target.value)} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-xs font-medium text-muted">Estudios que se anexan (del expediente)</legend>
        {docs.length === 0 ? (
          <p className="text-xs text-muted">El paciente no tiene documentos en el expediente.</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-line p-2">
            {docs.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-brand)]"
                  checked={adj.includes(d.nombre)}
                  onChange={(e) => set('estudiosAdjuntos', e.target.checked ? [...adj, d.nombre] : adj.filter((x) => x !== d.nombre))}
                />
                {d.nombre}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Field label="Otros estudios (texto)" className="sm:col-span-2">
        <Input value={str('estudiosTexto')} onChange={(e) => set('estudiosTexto', e.target.value)} placeholder="Ej. ECG del 10/10/2026, Rx de tórax" />
      </Field>
      <Field label={contra ? 'Indicaciones y seguimiento sugerido' : 'Solicitud al servicio receptor (opcional)'} className="sm:col-span-2">
        <Textarea value={str('recomendaciones')} onChange={(e) => set('recomendaciones', e.target.value)} />
      </Field>
    </>
  )
}

// ---------------------------------------------------------------- Historial
function Historial({ p, onEditar }: { p: Patient; onEditar?: (e: Edicion) => void }) {
  const regs = useRegistros(['certificado', 'referencia'], p.id)
  const lista = [...regs].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <Card title={`Documentos del paciente (${lista.length})`}>
      {lista.length === 0 ? (
        <Empty>Sin certificados ni referencias para este paciente.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {lista.map((r) => (
            <Fila key={r.id} r={r} p={p} onEditar={onEditar} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Fila({ r, p, onEditar }: { r: Registro; p: Patient; onEditar?: (e: Edicion) => void }) {
  const settings = useSettings()
  const d = datosCert(r)
  const e = estadoCert(r)
  const [busy, setBusy] = useState(false)
  const nombre = `${d.folio ?? 'borrador'}.pdf`
  const run = async (fn: (b: Blob) => Promise<void> | void) => {
    setBusy(true)
    try {
      await fn(await certificadoPDF(r, p, settings))
    } catch (err) {
      toast((err as Error).message, 'danger', { title: 'No se generó el PDF' })
    } finally {
      setBusy(false)
    }
  }
  const whatsapp = () => {
    const url = d.folio && d.hash ? urlVerificacion(baseVerificacion(), d.folio, d.hash) : ''
    const txt = `Hola ${p.nombre}, le comparto su ${r.titulo ?? 'documento'} de ${settings.doctor.nombre}.${url ? `\nVerificación: ${url}` : ''}\nLe enviaremos el PDF por este medio.`
    window.open(`https://wa.me/${telWhatsApp(p.telefono)}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener')
  }
  const btn = (label: string, icon: ReactNode, onClick: () => void, extra: { variant?: 'ghost' | 'secondary' | 'danger' } = {}) => (
    <Button size="sm" variant={extra.variant ?? 'secondary'} disabled={busy} onClick={onClick} aria-label={`${label} ${d.folio ?? 'borrador'}`}>
      {icon} <span className="hidden sm:inline">{label}</span>
    </Button>
  )
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{tituloCert(d.plantilla, d.campos, d.folio)}</span>
            <Badge tone={TONO[e]}>{ESTADO[e]}</Badge>
          </div>
          <div className="text-xs text-muted">
            {e === 'borrador' ? `Creado ${fmtFechaHora(r.fecha)}` : `Emitido ${d.emitidoEn ? fmtFechaHora(d.emitidoEn) : ''} · ${d.medico?.nombre ?? ''}`}
            {d.hash && <> · huella {d.hash.slice(0, 16)}</>}
          </div>
          {e === 'cancelado' && d.motivoCancelacion && <div className="text-xs text-danger">Cancelado: {d.motivoCancelacion}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {e === 'borrador' && onEditar && btn('Editar', <FilePen className="size-4" />, () => onEditar({ id: r.id, plantilla: d.plantilla, campos: d.campos }))}
          {btn(e === 'borrador' ? 'Vista previa' : 'PDF', <Download className="size-4" />, () => run((b) => downloadBlob(b, nombre)))}
          {e !== 'borrador' && btn('Imprimir', <Printer className="size-4" />, () => run((b) => imprimirPDF(b)))}
          {e === 'emitido' && btn('WhatsApp', <MessageCircle className="size-4" />, whatsapp)}
          {e === 'emitido' &&
            btn('Compartir', <Share2 className="size-4" />, () =>
              run(async (b) => {
                if (!(await compartirPDF(b, nombre, r.titulo ?? 'Documento médico'))) toast('Este navegador no permite compartir archivos. Usa «PDF».', 'warn')
              }),
            )}
          {e === 'emitido' && onEditar && btn('Cancelar', <Ban className="size-4" />, async () => {
            const motivo = await pedirTexto('El documento seguirá en el historial marcado como CANCELADO y su QR lo mostrará así. No se puede deshacer. Motivo de cancelación:', { titulo: `Cancelar ${d.folio}`, aceptar: 'Cancelar documento' })
            if (motivo === null) return
            if (!motivo.trim()) return void toast('Indica el motivo de cancelación.', 'warn')
            update('registros', r.id, prepararCancelacion(r, motivo))
          }, { variant: 'ghost' })}
          {e === 'borrador' && onEditar && btn('Eliminar', <Trash2 className="size-4" />, async () => {
            if (await confirmar('¿Eliminar este borrador? No tiene folio ni validez.', { titulo: 'Eliminar borrador', peligro: true })) remove('registros', r.id)
          }, { variant: 'ghost' })}
        </div>
      </div>
    </li>
  )
}
