import { useMemo, useState } from 'react'
import { CalendarCheck, ChevronRight, ClipboardCheck } from 'lucide-react'
import { Badge, Button, Card, Disclaimer, Empty, Field, Input, Modal, Page, PatientBar, Select, Stat, Tabs, Textarea, Notice } from '../../components/ui'
import { toast } from '../../components/toast'
import { add, useActivePatient, useCollection } from '../../lib/store'
import { useCanRegistro } from '../../lib/registros'
import type { DocumentFile, Observation, Patient, Registro } from '../../lib/types'
import { cx, edad, fmtFecha, nombreCompleto } from '../../lib/utils'
import { ORDEN_ESTADO, REGLAS, RESULTADOS, evaluar, intervaloTexto, rango, type CtxPaciente, type Estado, type Regla, type Resultado } from './reglas'

const ESTADO: Record<Estado, { label: string; tono: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  vencido: { label: 'Vencido', tono: 'danger' },
  proximo: { label: 'Próximo', tono: 'warn' },
  'al-dia': { label: 'Al día', tono: 'ok' },
  'no-aplica': { label: 'No aplica', tono: 'neutral' },
}

function ctxDe(p: Patient, obs: Observation[], regs: Registro[], docs: DocumentFile[]): CtxPaciente {
  return {
    sexo: p.sexo,
    fechaNac: p.fechaNac,
    antecedentes: p.antecedentes,
    observations: obs.filter((o) => o.patientId === p.id),
    registros: regs.filter((r) => r.patientId === p.id),
    documentos: docs.filter((d) => d.patientId === p.id).map((d) => ({ nombre: d.nombre, fecha: d.fecha })),
  }
}

type Tab = 'paciente' | 'clinica'

export default function Tamizajes() {
  const [tab, setTab] = useState<Tab>('paciente')
  return (
    <Page title="Prevención y tamizajes" subtitle="Detecciones recomendadas por edad y sexo según NOM, GPC mexicanas y USPSTF">
      <Tabs
        tabs={[
          { id: 'paciente', label: 'Paciente activo' },
          { id: 'clinica', label: 'Pendientes de la clínica' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'paciente' ? <Paciente /> : <Clinica onVer={() => setTab('paciente')} />}
      <Disclaimer>
        Recordatorio de prevención para población general sin síntomas. Los intervalos cambian con factores de riesgo, resultados previos y antecedentes familiares;
        individualice. Las reglas marcadas «(verificar)» tienen un intervalo o detalle que debe confirmarse con el texto vigente de la norma o guía.
      </Disclaimer>
    </Page>
  )
}

function Paciente() {
  const { id, patient } = useActivePatient()
  const obs = useCollection('observations', (o) => o.patientId === id, [id])
  const regs = useCollection('registros', (r) => r.patientId === id, [id])
  const docs = useCollection('documents', (d) => d.patientId === id, [id])
  const puede = useCanRegistro('tamizaje', 'write')
  const [verNoAplica, setVerNoAplica] = useState(false)
  const [registrar, setRegistrar] = useState<Regla | null>(null)
  const now = useMemo(() => Date.now(), [])

  const res = useMemo(() => (patient ? evaluar(ctxDe(patient, obs, regs, docs), now) : []), [patient, obs, regs, docs, now])
  const cuenta = (e: Estado) => res.filter((r) => r.estado === e).length
  const visibles = res.filter((r) => verNoAplica || r.estado !== 'no-aplica').sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado])

  return (
    <>
      <PatientBar />
      {!patient ? null : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Vencidos" value={cuenta('vencido')} tone={cuenta('vencido') ? 'danger' : undefined} />
            <Stat label="Próximos (60 días)" value={cuenta('proximo')} tone={cuenta('proximo') ? 'warn' : undefined} />
            <Stat label="Al día" value={cuenta('al-dia')} tone="ok" />
            <Stat label="No aplican" value={cuenta('no-aplica')} />
          </div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {nombreCompleto(patient)} · {edad(patient.fechaNac).texto} · {patient.sexo === 'F' ? 'mujer' : patient.sexo === 'M' ? 'hombre' : 'sexo «otro»: revise reglas por sexo'}
            </p>
            <label className="flex shrink-0 items-center gap-1.5 text-sm">
              <input type="checkbox" checked={verNoAplica} onChange={(e) => setVerNoAplica(e.target.checked)} /> Ver «no aplica»
            </label>
          </div>
          {visibles.length === 0 ? (
            <Empty>No hay tamizajes aplicables.</Empty>
          ) : (
            <ul className="space-y-2">
              {visibles.map((r) => (
                <Fila key={r.regla.id} r={r} puede={puede} onRegistrar={() => setRegistrar(r.regla)} />
              ))}
            </ul>
          )}
        </>
      )}
      {patient && registrar && <ModalRegistro key={registrar.id} regla={registrar} onClose={() => setRegistrar(null)} pid={patient.id} />}
    </>
  )
}

function Fila({ r, puede, onRegistrar }: { r: Resultado; puede: boolean; onRegistrar: () => void }) {
  const e = ESTADO[r.estado]
  return (
    <li className={cx('rounded-xl border bg-surface p-3', r.estado === 'vencido' ? 'border-danger/40' : r.estado === 'proximo' ? 'border-warn/40' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.regla.nombre}</span>
            <Badge tone={e.tono}>{e.label}</Badge>
            <span className="text-xs text-muted">{r.regla.categoria}</span>
          </div>
          <div className="mt-0.5 text-sm text-muted">
            {r.regla.prueba} · {rango(r.regla)}
            {r.regla.sexo ? (r.regla.sexo === 'F' ? ' · mujeres' : ' · hombres') : ''} · {intervaloTexto(r.regla)}
            {r.regla.verificar && <span className="font-medium text-warn"> (verificar)</span>}
          </div>
          <div className="mt-1 text-sm">
            {r.ultima ? (
              <>
                <span className="text-muted">Último: </span>
                {fmtFecha(r.ultima.fecha)} — {r.ultima.detalle}
                {r.ultima.manual && <span className="text-xs text-muted"> (manual)</span>}
              </>
            ) : null}
            {r.proxima && (
              <span className={cx('ml-1', r.estado === 'vencido' ? 'text-danger' : r.estado === 'proximo' ? 'text-warn' : 'text-muted')}>
                {r.ultima ? ' · ' : ''}
                {r.estado === 'vencido' ? 'Venció' : 'Próximo'}: {fmtFecha(r.proxima)}
              </span>
            )}
            {!r.ultima && <span className="text-muted">{r.motivo}</span>}
          </div>
        </div>
        {puede && r.estado !== 'no-aplica' && (
          <Button size="sm" onClick={onRegistrar}>
            <CalendarCheck className="size-4" /> Registrar
          </Button>
        )}
      </div>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none">Fuente</summary>
        <p className="mt-1">{r.regla.fuente}</p>
        {r.regla.verificar && <p className="mt-1 text-warn">(verificar) {r.regla.verificar}</p>}
        {r.regla.nota && <p className="mt-1">{r.regla.nota}</p>}
        {r.estado === 'no-aplica' && <p className="mt-1">No aplica: {r.motivo}</p>}
      </details>
    </li>
  )
}

function ModalRegistro({ regla, onClose, pid }: { regla: Regla; onClose: () => void; pid: string }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [prueba, setPrueba] = useState(regla.pruebas?.[0]?.id ?? '')
  const [resultado, setResultado] = useState<keyof typeof RESULTADOS>('normal')
  const [notas, setNotas] = useState('')
  const [noAplica, setNoAplica] = useState(false)
  const [motivo, setMotivo] = useState('')
  const fechaOk = !!fecha && fecha <= hoy
  const valido = fechaOk && (!noAplica || motivo.trim().length > 2)

  function guardar() {
    if (!valido) return
    const pr = regla.pruebas?.find((p) => p.id === prueba)
    add('registros', {
      patientId: pid,
      tipo: 'tamizaje',
      fecha: new Date(fecha + 'T12:00:00').toISOString(),
      estado: noAplica ? 'no-aplica' : 'realizado',
      titulo: noAplica ? `${regla.nombre}: no aplica (${motivo.trim()})` : `${regla.nombre}: ${pr ? pr.nombre.replace(/ \(.*\)/, '') + ' — ' : ''}${RESULTADOS[resultado].split(' (')[0].toLowerCase()}`,
      datos: noAplica
        ? { regla: regla.id, noAplica: motivo.trim(), realizado: fecha }
        : { regla: regla.id, prueba: prueba || undefined, resultado, notas: notas.trim() || undefined, realizado: fecha },
    })
    toast(noAplica ? 'Se marcó como no aplicable.' : 'Tamizaje registrado.', 'ok')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Registrar: ${regla.nombre}`}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={noAplica} onChange={(e) => setNoAplica(e.target.checked)} /> No aplica para este paciente (p. ej. histerectomía total, mastectomía)
        </label>
        {noAplica ? (
          <Field label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo clínico" autoFocus />
          </Field>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Realizado el" hint={!fechaOk ? 'La fecha no puede ser futura.' : undefined}>
                <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
              </Field>
              <Field label="Resultado">
                <Select value={resultado} onChange={(e) => setResultado(e.target.value as keyof typeof RESULTADOS)}>
                  {Object.entries(RESULTADOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {regla.pruebas && (
              <Field label="Prueba realizada" hint="El intervalo para la siguiente depende de la prueba.">
                <Select value={prueba} onChange={(e) => setPrueba(e.target.value)}>
                  {regla.pruebas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {p.intervaloMeses === null ? 'una vez' : `cada ${p.intervaloMeses % 12 === 0 ? `${p.intervaloMeses / 12} año(s)` : `${p.intervaloMeses} meses`}`}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Notas / resultado detallado">
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. BI-RADS 2; lugar donde se realizó" />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} disabled={!valido}>
            <ClipboardCheck className="size-4" /> Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Clinica({ onVer }: { onVer: () => void }) {
  const patients = useCollection('patients')
  const obs = useCollection('observations')
  const regs = useCollection('registros')
  const docs = useCollection('documents')
  const { setActive } = useActivePatient()
  const [filtro, setFiltro] = useState('')
  const now = useMemo(() => Date.now(), [])
  const filas = useMemo(() => {
    const reglas = filtro ? REGLAS.filter((r) => r.id === filtro) : REGLAS
    return patients
      .map((p) => {
        const res = evaluar(ctxDe(p, obs, regs, docs), now, reglas)
        return { p, vencidos: res.filter((r) => r.estado === 'vencido'), proximos: res.filter((r) => r.estado === 'proximo') }
      })
      .filter((f) => f.vencidos.length || f.proximos.length)
      .sort((a, b) => b.vencidos.length - a.vencidos.length || b.proximos.length - a.proximos.length)
  }, [patients, obs, regs, docs, now, filtro])

  return (
    <Card
      title={`Pacientes con tamizajes pendientes (${filas.length})`}
      actions={
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por tamizaje" className="h-8 max-w-56 py-1 text-xs">
          <option value="">Todos los tamizajes</option>
          {REGLAS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </Select>
      }
    >
      <Notice>Incluye tamizajes sin ningún registro en el expediente. Registre los realizados fuera de la clínica para mantener la lista útil.</Notice>
      {filas.length === 0 ? (
        <Empty>Ningún paciente con tamizajes vencidos o próximos.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {filas.map(({ p, vencidos, proximos }) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{nombreCompleto(p)}</div>
                <div className="text-xs text-muted">{edad(p.fechaNac).texto}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {vencidos.map((r) => (
                    <Badge key={r.regla.id} tone="danger">
                      {r.regla.nombre}
                    </Badge>
                  ))}
                  {proximos.map((r) => (
                    <Badge key={r.regla.id} tone="warn">
                      {r.regla.nombre}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setActive(p.id)
                  onVer()
                }}
                aria-label={`Ver tamizajes de ${nombreCompleto(p)}`}
              >
                Ver <ChevronRight className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
