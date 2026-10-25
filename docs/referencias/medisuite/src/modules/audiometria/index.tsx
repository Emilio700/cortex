import { useState } from 'react'
import { Badge, Card, Disclaimer, Empty, Page, PatientBar, Tabs } from '../../components/ui'
import { useActivePatient } from '../../lib/store'
import { useRegistros } from '../../lib/registros'
import { fmtFechaHora } from '../../lib/utils'
import { Audiograma, Resumen } from './Audiograma'
import { Tamiz } from './Tamiz'
import { Grafico } from './Grafico'
import { etiquetaFrec, interpretar, type Umbrales } from './audiograma'

type Tab = 'audiograma' | 'tamiz' | 'historial'

export default function Audiometria() {
  const [tab, setTab] = useState<Tab>('audiograma')
  return (
    <Page title="Audiometría" subtitle="Audiograma (símbolos ASHA), clasificación OMS 2021 y tamiz auditivo en navegador">
      <PatientBar />
      <Tabs
        tabs={[
          { id: 'audiograma', label: 'Audiograma' },
          { id: 'tamiz', label: 'Tamiz en navegador' },
          { id: 'historial', label: 'Historial' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'audiograma' && <Audiograma />}
      {tab === 'tamiz' && <Tamiz />}
      {tab === 'historial' && <Historial />}
      <Disclaimer>
        Referencias: OMS, World Report on Hearing (2021) — grados por PTA 0.5/1/2/4 kHz en el mejor oído; ASHA, Guidelines for Audiometric Symbols (1990); NICE NG98 (2018)
        Hearing loss in adults — asimetría ≥15 dB en 2 frecuencias adyacentes; Carhart R, Jerger J (1959) método ascendente. Herramienta de apoyo; la interpretación
        corresponde al médico.
      </Disclaimer>
    </Page>
  )
}

function Historial() {
  const { id } = useActivePatient()
  const lista = useRegistros('audiometria', id ?? '')
  if (!lista.length) return <Empty>Sin audiometrías guardadas para este paciente.</Empty>
  return (
    <div className="space-y-3">
      {lista.map((r) => {
        const d = r.datos as { modo?: string; umbrales?: Umbrales; relativos?: Record<'der' | 'izq', Record<string, number | null>>; motivos?: string[]; sugerirAudiometria?: boolean; equipo?: string; notas?: string }
        return (
          <Card key={r.id} title={r.titulo ?? 'Audiometría'} actions={<span className="text-xs text-muted">{fmtFechaHora(r.fecha)}</span>}>
            {d.modo === 'audiograma' && d.umbrales ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex justify-center">
                  <Grafico u={d.umbrales} titulo={`Audiograma del ${fmtFechaHora(r.fecha)}`} />
                </div>
                <div>
                  <Resumen it={interpretar(d.umbrales)} />
                  {d.equipo && <p className="mt-2 text-xs text-muted">Equipo: {d.equipo}</p>}
                  {d.notas && <p className="mt-1 text-sm">{d.notas}</p>}
                </div>
              </div>
            ) : d.relativos ? (
              <div className="text-sm">
                <Badge tone="warn">No calibrado · dB relativos</Badge>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {(['der', 'izq'] as const).map((o) => (
                    <div key={o}>
                      <b>{o === 'der' ? 'Derecho' : 'Izquierdo'}:</b>{' '}
                      {Object.entries(d.relativos![o] ?? {})
                        .map(([f, v]) => `${etiquetaFrec(Number(f))}Hz ${v ?? 'NR'}`)
                        .join(' · ')}
                    </div>
                  ))}
                </div>
                {d.motivos?.length ? (
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {d.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted">Sin detalle.</p>
            )}
          </Card>
        )
      })}
    </div>
  )
}
