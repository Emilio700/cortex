import { useState } from 'react'
import { Page, PatientBar, Tabs } from '../../components/ui'
import Cuerpo from './Cuerpo'
import Visor from './Visor'

export default function Anatomia() {
  const [tab, setTab] = useState<'cuerpo' | 'visor'>('cuerpo')
  return (
    <Page title="Anatomía 3D" subtitle="Mapa corporal de dolor y visor de modelos con realidad aumentada">
      {tab === 'cuerpo' && <PatientBar />}
      <Tabs tabs={[{ id: 'cuerpo', label: 'Cuerpo clicable' }, { id: 'visor', label: 'Visor 3D / Realidad aumentada' }]} value={tab} onChange={setTab} />
      {tab === 'cuerpo' ? <Cuerpo /> : <Visor />}
    </Page>
  )
}
