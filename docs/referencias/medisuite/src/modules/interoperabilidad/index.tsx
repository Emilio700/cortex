import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Download, FileJson, FileUp, Upload } from 'lucide-react'
import { Badge, Button, Card, Empty, Field, Notice, Page, PatientPicker, Select, Tabs, Textarea } from '../../components/ui'
import { add, update, useActivePatient, useCollection } from '../../lib/store'
import { useCan } from '../../lib/session'
import { isServer } from '../../lib/api'
import { registrarExportacion } from '../../lib/auditoria'
import { cx, downloadBlob, edad, fmtFecha, nombreCompleto, OBS_LABELS } from '../../lib/utils'
import { toast } from '../../components/toast'
import { confirmar } from '../../components/dialogos'
import { aNdjson, CURP_SYSTEM, exportar, leerEntrada, OBS_FHIR, planificarImport, validarBundle, type Entrada, type PlanImport, type Validacion } from './fhir'
import { bundleEjemplo } from './ejemplo'

type Tab = 'exportar' | 'importar' | 'acerca'

export default function Interoperabilidad() {
  const [tab, setTab] = useState<Tab>('exportar')
  return (
    <Page title="Interoperabilidad FHIR R4" subtitle="Exporta el expediente en HL7 FHIR R4 (Bundle o NDJSON) e importa datos de otros sistemas.">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'exportar', label: 'Exportar' },
          { id: 'importar', label: 'Importar' },
          { id: 'acerca', label: 'Acerca de FHIR' },
        ]}
      />
      {tab === 'exportar' && <Exportar />}
      {tab === 'importar' && <Importar />}
      {tab === 'acerca' && <Acerca />}
    </Page>
  )
}

// ---------- Exportar ----------
const PREVIEW_MAX = 150_000

function Exportar() {
  const { id: activoId, patient: activo } = useActivePatient()
  const patients = useCollection('patients')
  const encounters = useCollection('encounters')
  const observations = useCollection('observations')
  const prescriptions = useCollection('prescriptions')
  const documents = useCollection('documents')
  const appointments = useCollection('appointments')
  const puedeMasivo = useCan('exportar') || !isServer()
  const [alcance, setAlcance] = useState<'activo' | 'todos'>('activo')
  const [tipo, setTipo] = useState<'collection' | 'transaction'>('collection')
  const [inc, setInc] = useState({ encuentros: true, observaciones: true, recetas: true, documentos: true, citas: true, incrustar: false })
  const [res, setRes] = useState<{ json: string; validacion: Validacion; avisos: string[]; nombre: string; ndjson: Record<string, string>; patientId?: string } | null>(null)

  function generar() {
    const ps = alcance === 'todos' ? patients : patients.filter((p) => p.id === activoId)
    if (!ps.length) return toast('Selecciona un paciente.', 'warn')
    const ids = new Set(ps.map((p) => p.id))
    const de = <T extends { patientId: string }>(xs: T[], on: boolean) => (on ? xs.filter((x) => ids.has(x.patientId)) : [])
    const datos = {
      patients: ps,
      encounters: de(encounters, inc.encuentros),
      observations: de(observations, inc.observaciones),
      prescriptions: de(prescriptions, inc.recetas),
      documents: de(documents, inc.documentos),
      appointments: de(appointments, inc.citas),
    }
    const op = { tipo, inlineMax: inc.incrustar ? 200 * 1024 : 0, origen: location.origin, etiquetas: OBS_LABELS }
    const r = exportar(datos, op)
    const json = JSON.stringify(r.bundle, null, 2)
    const base = alcance === 'todos' ? 'medisuite-todos' : `medisuite-${(ps[0].apellidos || ps[0].nombre).toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`
    setRes({ json, validacion: validarBundle(r.bundle), avisos: r.avisos, nombre: `${base}-${new Date().toISOString().slice(0, 10)}`, ndjson: aNdjson(datos, op), patientId: alcance === 'todos' ? undefined : ps[0].id })
  }

  // Cada salida del expediente (descarga o copia) queda en la bitácora del servidor.
  const auditar = (formato: string, recursos: number) => res && void registrarExportacion('fhir', { patientId: res.patientId, formato, recursos })
  const totalBundle = () => (res ? Object.values(res.validacion.conteo).reduce((a, n) => a + n, 0) : 0)

  const chk = (k: keyof typeof inc, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={inc[k]} onChange={(e) => (setInc({ ...inc, [k]: e.target.checked }), setRes(null))} /> {label}
    </label>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title="Qué exportar">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-muted">Pacientes</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="alcance" checked={alcance === 'activo'} onChange={() => (setAlcance('activo'), setRes(null))} /> Paciente activo
            </label>
            {alcance === 'activo' && (
              <div className="mt-1.5 pl-6" onChange={() => setRes(null)}>
                <PatientPicker compact />
              </div>
            )}
            <label className={cx('mt-1.5 flex items-center gap-2 text-sm', !puedeMasivo && 'opacity-50')}>
              <input type="radio" name="alcance" disabled={!puedeMasivo} checked={alcance === 'todos'} onChange={() => (setAlcance('todos'), setRes(null))} /> Todos ({patients.length})
            </label>
            {!puedeMasivo && <p className="mt-1 pl-6 text-xs text-muted">La exportación masiva la realiza el administrador.</p>}
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-medium text-muted">Recursos (Patient, AllergyIntolerance y MedicationStatement siempre)</legend>
            {chk('encuentros', 'Consultas y diagnósticos (Encounter, Condition)')}
            {chk('observaciones', 'Signos y laboratorios (Observation)')}
            {chk('recetas', 'Recetas (MedicationRequest)')}
            {chk('documentos', 'Documentos (DocumentReference)')}
            {inc.documentos && <div className="pl-6">{chk('incrustar', 'Incrustar archivos ≤ 200 KB en base64')}</div>}
            {chk('citas', 'Citas (Appointment)')}
          </fieldset>
          <Field label="Tipo de Bundle" hint={tipo === 'transaction' ? 'Listo para POST a un servidor FHIR (crea todos los recursos en una transacción).' : 'Conjunto de recursos para archivo o intercambio.'}>
            <Select value={tipo} onChange={(e) => (setTipo(e.target.value as typeof tipo), setRes(null))}>
              <option value="collection">collection</option>
              <option value="transaction">transaction</option>
            </Select>
          </Field>
          <Button variant="primary" onClick={generar} disabled={alcance === 'activo' && !activo}>
            <FileJson className="size-4" /> Generar FHIR
          </Button>
          <p className="text-xs text-muted">No se exportan las notas SOAP en texto libre ni pacientes con bloqueo ARCO. Trata el archivo como información confidencial (NOM-004).</p>
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        {!res ? (
          <Empty>Elige qué exportar y pulsa «Generar FHIR».</Empty>
        ) : (
          <>
            <ResultadoValidacion v={res.validacion} />
            {res.avisos.length > 0 && (
              <Notice tone="info">
                <ul className="list-disc pl-4 text-xs">
                  {res.avisos.slice(0, 8).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                  {res.avisos.length > 8 && <li>… y {res.avisos.length - 8} más.</li>}
                </ul>
              </Notice>
            )}
            <Card
              title="Bundle FHIR (JSON)"
              actions={
                <>
                  <Button
                    size="sm"
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(res.json)
                        .then(() => (toast('JSON copiado.', 'ok'), auditar('fhir+json', totalBundle())))
                        .catch(() => toast('No se pudo copiar.', 'warn'))
                    }
                  >
                    <Copy className="size-4" /> Copiar
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => (downloadBlob(new Blob([res.json], { type: 'application/fhir+json' }), res.nombre + '.json'), auditar('fhir+json', totalBundle()))}>
                    <Download className="size-4" /> .json
                  </Button>
                </>
              }
            >
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 font-mono text-xs" tabIndex={0} aria-label="Vista previa del JSON">
                {res.json.length > PREVIEW_MAX ? res.json.slice(0, PREVIEW_MAX) + '\n…' : res.json}
              </pre>
              {res.json.length > PREVIEW_MAX && <p className="mt-1 text-xs text-muted">Vista previa recortada; la descarga contiene el archivo completo ({(res.json.length / 1024).toFixed(0)} KB).</p>}
            </Card>
            <Card title="Exportación masiva NDJSON (FHIR Bulk Data)">
              <p className="mb-2 text-sm text-muted">Un archivo por tipo de recurso, un recurso por línea, con referencias relativas (Patient/id). Formato de importación de HAPI, Medplum y otros.</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(res.ndjson).map(([t, txt]) => (
                  <Button key={t} size="sm" onClick={() => (downloadBlob(new Blob([txt], { type: 'application/fhir+ndjson' }), `${t}.ndjson`), auditar('fhir+ndjson', txt.trim() ? txt.trim().split('\n').length : 0))}>
                    <Download className="size-4" /> {t}.ndjson <Badge>{txt.trim().split('\n').length}</Badge>
                  </Button>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function ResultadoValidacion({ v }: { v: Validacion }) {
  return (
    <div className={cx('rounded-xl border p-3 text-sm', v.ok ? 'border-ok/40 bg-ok/10' : 'border-danger/40 bg-danger/10')}>
      <div className="flex items-center gap-2 font-medium">
        {v.ok ? <CheckCircle2 className="size-4 text-ok" /> : <AlertTriangle className="size-4 text-danger" />}
        {v.ok ? 'Estructura válida: campos obligatorios presentes y todas las referencias se resuelven dentro del Bundle.' : `${v.errores.length} error(es) de estructura`}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(v.conteo).map(([t, n]) => (
          <Badge key={t} tone="neutral">
            {t}: {n}
          </Badge>
        ))}
      </div>
      {(v.errores.length > 0 || v.advertencias.length > 0) && (
        <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5 text-xs">
          {v.errores.slice(0, 30).map((e, i) => (
            <li key={'e' + i} className="text-danger">
              {e}
            </li>
          ))}
          {v.advertencias.slice(0, 10).map((e, i) => (
            <li key={'a' + i} className="text-muted">
              {e}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Verificación ligera propia (no sustituye al validador oficial de HL7 ni a la validación de perfiles en el servidor FHIR).</p>
    </div>
  )
}

// ---------- Importar ----------
function Importar() {
  const patients = useCollection('patients')
  const observations = useCollection('observations')
  const puedeObs = useCan('obs.escribir')
  const puedePac = useCan('pacientes.clinico')
  const puede = puedeObs && puedePac
  const [texto, setTexto] = useState('')
  const [entrada, setEntrada] = useState<Entrada | null>(null)
  const [validacion, setValidacion] = useState<Validacion | null>(null)
  const [error, setError] = useState('')
  const [op, setOp] = useState({ observaciones: true, condiciones: true, alergias: true, medicamentos: true })
  const [excluir, setExcluir] = useState<Set<string>>(new Set())
  const [hecho, setHecho] = useState<string | null>(null)
  const plan: PlanImport | null = useMemo(() => (entrada ? planificarImport(entrada, { patients, observations }, op) : null), [entrada, patients, observations, op])

  function analizar(t = texto) {
    setError('')
    setHecho(null)
    setExcluir(new Set())
    try {
      const e = leerEntrada(t)
      setEntrada(e)
      if (e.formato === 'bundle') setValidacion(validarBundle(JSON.parse(t)))
      else setValidacion(null)
    } catch (err) {
      setEntrada(null)
      setValidacion(null)
      setError((err as Error).message)
    }
  }

  async function archivo(f: File | undefined) {
    if (!f) return
    if (f.size > 30 * 1024 * 1024) return setError('El archivo pesa más de 30 MB. Divide la exportación por paciente.')
    const t = await f.text()
    setTexto(t.length > 2_000_000 ? '' : t)
    analizar(t)
    if (t.length > 2_000_000) toast('Archivo grande: no se muestra en el cuadro de texto, pero sí se analizó.', 'info')
  }

  const seleccion = plan?.pacientes.filter((p) => !excluir.has(p.clave)) ?? []
  const totalObs = seleccion.reduce((n, p) => n + p.observaciones.length, 0)

  async function importar() {
    if (!plan || !seleccion.length) return
    const nuevos = seleccion.filter((p) => !p.existente).length
    const ok = await confirmar(
      `Se crearán ${nuevos} paciente(s), se actualizarán ${seleccion.length - nuevos} y se agregarán ${totalObs} observaciones.${totalObs > 500 && isServer() ? ' Son muchas: la sincronización con el servidor puede tardar unos minutos.' : ''}`,
      { titulo: 'Confirmar importación', aceptar: 'Importar' },
    )
    if (!ok) return
    const hoy = new Date().toLocaleDateString('es-MX')
    let nObs = 0
    try {
      for (const pi of seleccion) {
        const bloqueDx = pi.condiciones.length ? `Diagnósticos importados (FHIR, ${hoy}):\n${pi.condiciones.map((c) => '- ' + c).join('\n')}` : ''
        let pid: string
        if (pi.existente) {
          const ex = pi.existente
          const patch: Record<string, unknown> = {}
          if (pi.alergias.length) patch.alergias = [...ex.alergias, ...pi.alergias]
          if (pi.medicamentos.length) patch.medicamentosActuales = [...(ex.medicamentosActuales ?? []), ...pi.medicamentos]
          if (bloqueDx) patch.antecedentes = [ex.antecedentes, bloqueDx].filter(Boolean).join('\n\n')
          if (Object.keys(patch).length) update('patients', ex.id, patch)
          pid = ex.id
        } else {
          const p = add('patients', {
            ...pi.datos,
            alergias: pi.alergias,
            ...(pi.medicamentos.length ? { medicamentosActuales: pi.medicamentos } : {}),
            ...(bloqueDx ? { antecedentes: bloqueDx } : {}),
            creado: new Date().toISOString(),
          })
          pid = p.id
        }
        for (const o of pi.observaciones) {
          add('observations', { patientId: pid, fecha: o.fecha, codigo: o.codigo, valor: o.valor, unidad: o.unidad, fuente: 'manual', ...(o.etiqueta ? { etiqueta: o.etiqueta } : {}), ...(o.interpretacion ? { interpretacion: o.interpretacion } : {}) })
          nObs++
        }
      }
      const msg = `Importación terminada: ${seleccion.length} paciente(s), ${nObs} observaciones.`
      setHecho(msg)
      toast(msg, 'ok')
      setEntrada(null)
    } catch (e) {
      toast(`La importación se detuvo: ${(e as Error).message}`, 'danger')
    }
  }

  return (
    <div className="space-y-4">
      {!puede && <Notice tone="warn">Tu rol puede analizar archivos, pero solo el médico puede importar datos clínicos al expediente.</Notice>}
      {hecho && <Notice tone="info">{hecho}</Notice>}
      <Card title="Archivo FHIR">
        <div className="space-y-3">
          <Textarea
            aria-label="Pega aquí un Bundle FHIR (JSON) o NDJSON"
            placeholder='Pega un Bundle FHIR R4 (JSON), un recurso suelto o NDJSON. Ej. {"resourceType":"Bundle", …}'
            rows={7}
            className="font-mono text-xs"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => analizar()} disabled={!texto.trim()}>
              <FileJson className="size-4" /> Analizar
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface-2 focus-within:ring-2 focus-within:ring-brand/40">
              <FileUp className="size-4" /> Subir archivo
              <input type="file" accept=".json,.ndjson,application/json,application/fhir+json" className="sr-only" onChange={(e) => (archivo(e.target.files?.[0]), (e.target.value = ''))} />
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                const t = JSON.stringify(bundleEjemplo(), null, 2)
                setTexto(t)
                analizar(t)
              }}
            >
              Cargar ejemplo
            </Button>
          </div>
          <p className="text-xs text-muted">
            Acepta exportaciones de Synthea, HAPI, Medplum o de otro MediSuite. Se importan Patient, Observation (signos y laboratorios con LOINC), Condition (a antecedentes), AllergyIntolerance y
            medicamentos activos; el resto se reporta como omitido. El archivo se procesa en este navegador.
          </p>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </Card>

      {plan && entrada && (
        <>
          {validacion && !validacion.ok && (
            <Notice tone="warn">
              El Bundle tiene {validacion.errores.length} problema(s) de estructura (p. ej. {validacion.errores[0]}). Se intentará importar lo reconocible.
            </Notice>
          )}
          <Card title="Opciones">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {(
                [
                  ['observaciones', 'Observaciones'],
                  ['condiciones', 'Diagnósticos → antecedentes'],
                  ['alergias', 'Alergias'],
                  ['medicamentos', 'Medicamentos actuales'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={op[k]} onChange={(e) => setOp({ ...op, [k]: e.target.checked })} /> {l}
                </label>
              ))}
            </div>
          </Card>
          <Card title={`Vista previa (${entrada.formato === 'bundle' ? 'Bundle' : entrada.formato === 'ndjson' ? 'NDJSON' : 'recurso'} · ${entrada.recursos.length} recursos)`}>
            {plan.pacientes.length === 0 ? (
              <Empty>No hay pacientes que importar.</Empty>
            ) : (
              <ul className="space-y-3">
                {plan.pacientes.map((pi) => {
                  const on = !excluir.has(pi.clave)
                  const porCodigo = pi.observaciones.reduce<Record<string, number>>((m, o) => ((m[o.codigo] = (m[o.codigo] ?? 0) + 1), m), {})
                  return (
                    <li key={pi.clave} className={cx('rounded-lg border p-3', on ? 'border-line' : 'border-dashed border-line opacity-60')}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={on}
                          onChange={() =>
                            setExcluir((s) => {
                              const n = new Set(s)
                              if (n.has(pi.clave)) n.delete(pi.clave)
                              else n.add(pi.clave)
                              return n
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{nombreCompleto(pi.datos)}</span>{' '}
                          {pi.existente ? <Badge tone="brand">Actualiza a {nombreCompleto(pi.existente)}</Badge> : <Badge tone="ok">Nuevo</Badge>}
                          <span className="block text-xs text-muted">
                            {pi.datos.fechaNac === '1900-01-01' ? 'Fecha de nacimiento desconocida (corrígela después)' : `${fmtFecha(pi.datos.fechaNac + 'T12:00:00')} · ${edad(pi.datos.fechaNac).texto}`} ·{' '}
                            {pi.datos.sexo === 'F' ? 'Femenino' : pi.datos.sexo === 'M' ? 'Masculino' : 'Otro'}
                            {pi.datos.curp && ` · CURP ${pi.datos.curp}`}
                          </span>
                        </span>
                      </label>
                      <div className="mt-2 grid gap-2 pl-6 text-xs sm:grid-cols-2">
                        <div>
                          <b>{pi.observaciones.length} observaciones</b>
                          {pi.duplicadas > 0 && <span className="text-muted"> ({pi.duplicadas} ya existían)</span>}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.entries(porCodigo).map(([c, n]) => (
                              <span key={c} className="rounded-full border border-line px-1.5">
                                {OBS_LABELS[c]?.label ?? c}: {n}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          {pi.condiciones.length > 0 && (
                            <div>
                              <b>{pi.condiciones.length} diagnósticos:</b> {pi.condiciones.slice(0, 4).join('; ')}
                              {pi.condiciones.length > 4 && '…'}
                            </div>
                          )}
                          {pi.alergias.length > 0 && (
                            <div>
                              <b>Alergias:</b> {pi.alergias.join(', ')}
                            </div>
                          )}
                          {pi.medicamentos.length > 0 && (
                            <div>
                              <b>Medicamentos:</b> {pi.medicamentos.slice(0, 5).join(', ')}
                              {pi.medicamentos.length > 5 && '…'}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {(Object.keys(plan.omitidos).length > 0 || plan.avisos.length > 0) && (
              <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs">
                <b>Reporte de omitidos</b>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(plan.omitidos)
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <span key={t} className="rounded-full border border-line bg-surface px-2 py-0.5">
                        {t}: {n}
                      </span>
                    ))}
                </div>
                {plan.avisos.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-muted">
                    {plan.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-muted">
                {seleccion.length} paciente(s) · {totalObs} observaciones
              </span>
              <Button variant="primary" onClick={importar} disabled={!puede || !seleccion.length}>
                <Upload className="size-4" /> Importar
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

// ---------- Acerca de ----------
function Acerca() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="¿Qué es FHIR y cómo se usa aquí?">
        <div className="space-y-2 text-sm">
          <p>
            <b>HL7 FHIR R4</b> (v4.0.1) es el estándar internacional para intercambiar información clínica como «recursos» JSON (Patient, Observation, Condition…). MediSuite ya guarda sus datos con
            un modelo inspirado en FHIR, así que la conversión es directa.
          </p>
          <p>
            <b>SMART on FHIR</b> agrega autorización OAuth 2.0 / OpenID Connect para que aplicaciones de terceros (calculadoras, apps del paciente, tableros) lean y escriban en un servidor FHIR con
            permisos acotados («scopes»), sin compartir contraseñas.
          </p>
          <p>
            <b>Camino a producción:</b> esta pantalla genera y lee archivos. Para intercambio en línea se recomienda un servidor FHIR dedicado — <b>Medplum</b> o <b>HAPI FHIR</b> — con validación de
            perfiles, búsqueda, auditoría (AuditEvent), SMART on FHIR y la API Bulk Data ($export).
          </p>
          <p>
            <b>NOM-024-SSA3-2012</b> (Sistemas de Información de Registro Electrónico para la Salud — intercambio de información en salud) exige que los expedientes electrónicos puedan intercambiar
            información con estándares y catálogos oficiales (CIE-10, CLUES, catálogos de la DGIS) y garanticen confidencialidad y trazabilidad. La norma y las guías de la DGIS hacen referencia a HL7
            (CDA); el uso de FHIR como formato de intercambio reconocido por la Secretaría de Salud está en evolución <span className="text-warn">(verificar con la DGIS la versión vigente)</span>.
          </p>
          <p className="text-xs text-muted">
            Referencias: hl7.org/fhir/R4 · hl7.org/fhir/R4/observation-vitalsigns.html · hl7.org/fhir/uv/bulkdata · docs.smarthealthit.org · DOF 30/11/2012 (NOM-024-SSA3-2012).
          </p>
        </div>
      </Card>
      <Card title="Mapeo de códigos">
        <div className="space-y-2 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>
              Patient.identifier (CURP): sistema <code className="break-all">{CURP_SYSTEM}</code> <span className="text-warn">(verificar)</span> — no se confirmó un OID oficial de HL7 para la CURP; al importar
              se reconoce cualquier sistema que contenga «curp» o un valor con formato de CURP.
            </li>
            <li>Diagnósticos: Condition con CIE-10 (http://hl7.org/fhir/sid/icd-10), categoría encounter-diagnosis.</li>
            <li>Signos vitales: categoría vital-signs y perfil FHIR correspondiente; presión arterial como panel LOINC 85354-9 con componentes 8480-6 / 8462-4.</li>
            <li>Códigos sin LOINC (escalas, ROM, cintura…): sistema local urn:medisuite:obs.</li>
          </ul>
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-medium">Dato</th>
                  <th className="font-medium">LOINC</th>
                  <th className="font-medium">UCUM</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(OBS_FHIR).map(([k, m]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1 pr-2">{OBS_LABELS[k]?.label ?? k}</td>
                    <td className="pr-2 font-mono">{m.loinc.map((l) => l.code).join(' / ')}</td>
                    <td className="font-mono">{m.ucum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  )
}
