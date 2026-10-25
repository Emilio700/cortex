import { useState } from 'react'
import { Activity, Droplets, FileText, Pill, Settings2, Syringe, ClipboardCheck } from 'lucide-react'
import { Page, PatientBar, Tabs, Field, Input, Button, Modal, Notice } from '../../components/ui'
import { useActivePatient } from '../../lib/store'
import { useCan, useSession } from '../../lib/session'
import { usePreferencia } from '../../lib/preferencias'
import { useCanRegistro } from '../../lib/registros'
import { cx, fmtFecha } from '../../lib/utils'
import { TURNOS, TURNO_LABEL, TURNOS_POR_OMISION, inicioDia, rangoTurno, turnoDe, type ConfigTurnos, type Turno } from './calc'
import { diaISO, useHoja } from './hoja'
import Signos from './Signos'
import Balance from './Balance'
import Mar from './Mar'
import Infusiones from './Infusiones'
import Notas from './Notas'
import Entrega from './Entrega'
import type { Ctx } from './ctx'

type Tab = 'signos' | 'balance' | 'mar' | 'infusiones' | 'notas' | 'entrega'

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

function TurnosModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cfg, setCfg, meta] = usePreferencia<ConfigTurnos>('enfermeria.turnos', 'org', TURNOS_POR_OMISION)
  return (
    <Modal open={open} onClose={onClose} title="Horario de turnos">
      <p className="mb-3 text-sm text-muted">Hora de inicio de cada turno en su institución. El nocturno termina al iniciar el matutino del día siguiente.</p>
      <div className="grid grid-cols-3 gap-2">
        {TURNOS.map((t) => (
          <Field key={t} label={TURNO_LABEL[t]}>
            <Input type="number" min={0} max={23} value={cfg[t]} disabled={!meta.puedeEscribir} onChange={(e) => setCfg({ ...cfg, [t]: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} />
          </Field>
        ))}
      </div>
      {!(cfg.matutino < cfg.vespertino && cfg.vespertino < cfg.nocturno) && <Notice tone="warn">Las horas deben ir en orden: matutino &lt; vespertino &lt; nocturno.</Notice>}
      <div className="mt-4 flex justify-between">
        <Button variant="ghost" disabled={!meta.puedeEscribir} onClick={() => setCfg(null)}>Restablecer (07, 15, 21)</Button>
        <Button variant="primary" onClick={onClose}>Listo</Button>
      </div>
    </Modal>
  )
}

export default function Enfermeria() {
  const { id: pid, patient } = useActivePatient()
  const ses = useSession()
  const puede = useCanRegistro('enfermeria', 'write')
  const puedeObs = useCan('obs.escribir')
  const [cfgRaw] = usePreferencia<ConfigTurnos>('enfermeria.turnos', 'org', TURNOS_POR_OMISION)
  const cfg = cfgRaw.matutino < cfgRaw.vespertino && cfgRaw.vespertino < cfgRaw.nocturno ? cfgRaw : TURNOS_POR_OMISION
  const [nombreEnf, setNombreEnf] = usePreferencia<string>('enfermeria.nombre', 'user', '')
  const [dia0, setDia0] = useState(() => inicioDia(Date.now(), cfg))
  const [turno, setTurno] = useState<Turno>(() => turnoDe(Date.now(), cfg))
  const [tab, setTab] = useState<Tab>('signos')
  const [cfgOpen, setCfgOpen] = useState(false)
  const { datos, guardar, hoja } = useHoja(pid, dia0)
  const rango = rangoTurno(dia0, turno, cfg)
  const enfermera = ses.user?.nombre ?? nombreEnf
  const ctx: Ctx = { pid, patient, dia0, turno, cfg, rango, datos, guardar, puede: puede && !!pid, puedeObs: puedeObs && !!pid, enfermera }

  return (
    <Page
      title="Hoja de enfermería"
      subtitle="Signos por hora, balance hídrico, administración de medicamentos, infusiones, notas y entrega de turno"
      actions={<Button onClick={() => setCfgOpen(true)}><Settings2 className="size-4" /> Turnos</Button>}
    >
      <PatientBar />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Día de enfermería" hint={`${hh(cfg.matutino)} a ${hh(cfg.matutino)} del día siguiente`}>
          <Input type="date" value={diaISO(dia0)} onChange={(e) => e.target.value && setDia0(new Date(e.target.value + `T${hh(cfg.matutino)}`).getTime())} className="w-44" />
        </Field>
        <div role="radiogroup" aria-label="Turno" className="flex rounded-lg border border-line bg-surface p-0.5">
          {TURNOS.map((t) => {
            const [a, b] = rangoTurno(dia0, t, cfg)
            return (
              <button key={t} role="radio" aria-checked={turno === t} onClick={() => setTurno(t)} className={cx('rounded-md px-3 py-1.5 text-sm', turno === t ? 'bg-brand text-white dark:text-black' : 'hover:bg-surface-2')}>
                {TURNO_LABEL[t]} <span className="hidden text-xs opacity-80 sm:inline">{new Date(a).getHours()}–{new Date(b).getHours()} h</span>
              </button>
            )
          })}
        </div>
        {!ses.user && (
          <Field label="Enfermera(o) responsable">
            <Input value={nombreEnf} onChange={(e) => setNombreEnf(e.target.value)} placeholder="Nombre" className="w-56" />
          </Field>
        )}
        <div className="text-xs text-muted">{hoja ? `Hoja del ${fmtFecha(new Date(dia0).toISOString())}` : 'Sin registros este día (se crea al guardar).'}</div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'signos', label: <span className="inline-flex items-center gap-1.5"><Activity className="size-4" /> Signos</span> },
          { id: 'balance', label: <span className="inline-flex items-center gap-1.5"><Droplets className="size-4" /> Balance hídrico</span> },
          { id: 'mar', label: <span className="inline-flex items-center gap-1.5"><Pill className="size-4" /> Medicamentos</span> },
          { id: 'infusiones', label: <span className="inline-flex items-center gap-1.5"><Syringe className="size-4" /> Infusiones</span> },
          { id: 'notas', label: <span className="inline-flex items-center gap-1.5"><FileText className="size-4" /> Notas</span> },
          { id: 'entrega', label: <span className="inline-flex items-center gap-1.5"><ClipboardCheck className="size-4" /> Entrega SBAR</span> },
        ]}
      />
      {tab === 'signos' && <Signos key={`${pid}-${dia0}-${turno}`} ctx={ctx} />}
      {tab === 'balance' && <Balance key={`${pid}-${dia0}-${turno}`} ctx={ctx} />}
      {tab === 'mar' && <Mar key={`${pid}-${dia0}-${turno}`} ctx={ctx} />}
      {tab === 'infusiones' && <Infusiones key={`${pid}-${dia0}-${turno}`} ctx={ctx} />}
      {tab === 'notas' && <Notas key={`${pid}-${dia0}-${turno}`} ctx={ctx} />}
      {tab === 'entrega' && <Entrega key={`${pid}-${dia0}-${turno}`} ctx={ctx} />}
      <TurnosModal open={cfgOpen} onClose={() => setCfgOpen(false)} />
    </Page>
  )
}
