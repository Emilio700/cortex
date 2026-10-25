import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Page, Tabs, Disclaimer } from '../../components/ui'
import { buildModel, type Dominance, type Stenosis } from './anatomy'
import { TabAnatomia, TabAngio, type Carm } from './tabs'

const TabEstenosis = lazy(() => import('./stenosis').then((m) => ({ default: m.TabEstenosis })))
const TabECG = lazy(() => import('./ecg').then((m) => ({ default: m.TabECG })))

type Tab = 'anat' | 'angio' | 'esten' | 'ecg'

export default function Cardio3D() {
  const [tab, setTab] = useState<Tab>('anat')
  const [dom, setDom] = useState<Dominance>('R')
  const [ramus, setRamus] = useState(false)
  const [hr, setHr] = useState(72)
  const [stenoses, setStenoses] = useState<Stenosis[]>([])
  const [carm, setCarm] = useState<Carm>({ lao: -30, cra: 30, sys: 'L' })
  const model = useMemo(() => buildModel({ dominance: dom, ramus, stenoses }), [dom, ramus, stenoses])
  useEffect(() => () => model.dispose(), [model])

  return (
    <Page title="Cardio 3D" subtitle="Anatomía coronaria, angiografía simulada, estenosis y territorios del ECG">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'anat', label: 'Anatomía coronaria 3D' },
          { id: 'angio', label: 'Angiografía simulada' },
          { id: 'esten', label: 'Estenosis' },
          { id: 'ecg', label: 'Territorios y ECG' },
        ]}
      />
      <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Cargando…</div>}>
        {tab === 'anat' && <TabAnatomia model={model} dom={dom} setDom={setDom} ramus={ramus} setRamus={setRamus} hr={hr} setHr={setHr} />}
        {tab === 'angio' && <TabAngio model={model} carm={carm} setCarm={setCarm} />}
        {tab === 'esten' && <TabEstenosis model={model} dom={dom} ramus={ramus} stenoses={stenoses} setStenoses={setStenoses} carm={carm} setCarm={setCarm} />}
        {tab === 'ecg' && <TabECG dom={dom} setDom={setDom} hr={hr} />}
      </Suspense>
      <Disclaimer>
        Simulación educativa con anatomía procedural idealizada. No es un estudio diagnóstico ni sustituye la coronariografía, el ECG real ni el juicio clínico.
      </Disclaimer>
    </Page>
  )
}
