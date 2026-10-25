import { useState } from 'react'
import { Disclaimer, Empty, Notice, Page, PatientBar, Tabs, Card, Badge } from '../../components/ui'
import { useActivePatient } from '../../lib/store'
import { useRegistros } from '../../lib/registros'
import { fmtFechaHora } from '../../lib/utils'
import { useCalibracion } from './useCalibracion'
import { Calibracion } from './Calibracion'
import { Prueba, CORRECCIONES, type DatosAgudeza } from './Prueba'
import { Amsler } from './Amsler'
import { fmtLogmar, snellen } from './optotipos'

type Tab = 'prueba' | 'amsler' | 'calibracion' | 'historial'

export default function Vision() {
  const c = useCalibracion()
  const [tab, setTab] = useState<Tab>(c.cal ? 'prueba' : 'calibracion')
  return (
    <Page title="Agudeza visual" subtitle="Optotipos calibrados (logMAR), conversión Snellen/decimal y rejilla de Amsler">
      <PatientBar />
      <Notice tone="warn">
        <b>Tamizaje, no examen oftalmológico completo.</b> La exactitud depende de la calibración de la pantalla, la distancia medida, el brillo y contraste del monitor
        (use brillo alto y luz ambiental uniforme) y la resolución en las líneas más pequeñas. Ante agudeza menor a 20/40 (6/12), diferencia entre ojos de 2 líneas o
        más, o síntomas, refiera a oftalmología.
      </Notice>
      <Tabs
        tabs={[
          { id: 'prueba', label: 'Agudeza visual' },
          { id: 'amsler', label: 'Rejilla de Amsler' },
          { id: 'calibracion', label: c.cal ? 'Calibración' : 'Calibración ⚠' },
          { id: 'historial', label: 'Historial' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'prueba' && <Prueba c={c} />}
      {tab === 'amsler' && <Amsler c={c} />}
      {tab === 'calibracion' && <Calibracion c={c} />}
      {tab === 'historial' && <Historial />}
      <Disclaimer>
        Referencias: ISO 8596:2017 (optotipos, 5′ de arco); Bailey IL, Lovie JE, Am J Optom Physiol Opt 1976 (progresión logMAR); Ferris FL et al., Am J Ophthalmol 1982
        (ETDRS, puntuación por letra); OMS/CIE-11 9D90 (categorías de deterioro visual). Letras dibujadas como aproximación geométrica del diseño Sloan.
      </Disclaimer>
    </Page>
  )
}

function Historial() {
  const { id } = useActivePatient()
  const lista = useRegistros('agudeza-visual', id ?? '')
  if (!lista.length) return <Empty>Sin exploraciones visuales guardadas para este paciente.</Empty>
  return (
    <div className="space-y-3">
      {lista.map((r) => {
        const d = r.datos as unknown as Partial<DatosAgudeza> & { amsler?: { ojo: string; distorsion: number; faltante: number; notas?: string } }
        return (
          <Card key={r.id} title={r.titulo ?? 'Exploración visual'} actions={<span className="text-xs text-muted">{fmtFechaHora(r.fecha)}</span>}>
            {d.resultados?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 pr-2 font-medium">Ojo</th>
                      <th className="py-1 pr-2 font-medium">Corrección</th>
                      <th className="py-1 pr-2 font-medium">Snellen</th>
                      <th className="py-1 pr-2 font-medium">Decimal</th>
                      <th className="py-1 font-medium">logMAR</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {d.resultados.map((x) => (
                      <tr key={x.ojo + x.correccion} className="border-t border-line">
                        <td className="py-1 pr-2 font-medium">{x.ojo}</td>
                        <td className="py-1 pr-2">{CORRECCIONES.find((c) => c.id === x.correccion)?.label}</td>
                        <td className="py-1 pr-2">
                          {snellen(x.logmar)} <span className="text-muted">({snellen(x.logmar, 6)})</span>
                        </td>
                        <td className="py-1 pr-2">{x.decimal.toFixed(2)}</td>
                        <td className="py-1">{fmtLogmar(x.logmar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  <span>Distancia {d.distanciaM! < 1 ? `${(d.distanciaM ?? 0) * 100} cm` : `${d.distanciaM} m`}</span>
                  <span>· {d.optotipo === 'e' ? 'E de Snellen' : 'Letras tipo Sloan'}</span>
                  {d.calibrada === false && <Badge tone="warn">Pantalla sin calibrar</Badge>}
                </div>
              </div>
            ) : d.amsler ? (
              <p className="text-sm">
                {d.amsler.ojo}: {d.amsler.distorsion} cuadro(s) con distorsión, {d.amsler.faltante} borrosos/faltantes.
                {d.amsler.notas && <span className="text-muted"> {d.amsler.notas}</span>}
                <span className="block text-xs text-muted">La imagen está en Documentos del paciente.</span>
              </p>
            ) : (
              <p className="text-sm text-muted">Sin detalle.</p>
            )}
          </Card>
        )
      })}
    </div>
  )
}
