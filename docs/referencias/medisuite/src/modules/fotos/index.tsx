import { useMemo, useState } from 'react'
import { Check, Download, Ghost, PenLine, Trash2, Columns2 } from 'lucide-react'
import { Page, PatientBar, Tabs, Empty, Modal, Button, Badge, Disclaimer } from '../../components/ui'
import { remove, useActivePatient, useCollection } from '../../lib/store'
import { cx, downloadBlob, fmtFecha, fmtFechaHora } from '../../lib/utils'
import type { DocumentFile } from '../../lib/types'
import Captura from './Captura'
import Comparar from './Comparar'
import Anotar from './Anotar'
import { ZONAS, meta } from './img'
import { confirmar } from '../../components/dialogos'

type Tab = 'capturar' | 'galeria' | 'comparar' | 'anotar'

export default function Fotos() {
  const { id } = useActivePatient()
  const fotos = useCollection('documents', (d) => d.patientId === id && d.tipo === 'foto', [id])
  const [tab, setTab] = useState<Tab>('capturar')
  const [sel, setSel] = useState<string[]>([])
  const [guiaId, setGuiaId] = useState<string | null>(null)
  const [anotarId, setAnotarId] = useState<string | null>(null)
  const [ver, setVer] = useState<DocumentFile | null>(null)

  const grupos = useMemo(() => {
    const m = new Map<string, DocumentFile[]>()
    for (const f of [...fotos].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
      const z = meta(f).zona ?? 'Otra'
      m.set(z, [...(m.get(z) ?? []), f])
    }
    return [...m.entries()].sort((a, b) => ZONAS.indexOf(a[0]) - ZONAS.indexOf(b[0]))
  }, [fotos])

  const toggle = (fid: string) => {
    const s = sel.includes(fid) ? sel.filter((x) => x !== fid) : [...sel, fid].slice(-2)
    // ordenar cronológicamente: antes / después
    setSel(s.map((x) => fotos.find((f) => f.id === x)!).filter(Boolean).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((f) => f.id))
  }

  return (
    <Page title="Fotos clínicas" subtitle="Captura sin metadatos, comparación antes/después y medición calibrada">
      <PatientBar />
      <Tabs
        tabs={[
          { id: 'capturar', label: 'Capturar' },
          { id: 'galeria', label: `Galería (${fotos.length})` },
          { id: 'comparar', label: 'Comparar' },
          { id: 'anotar', label: 'Medir / anotar' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'capturar' && <Captura patientId={id} fotos={fotos} guiaId={guiaId} setGuiaId={setGuiaId} onGuardada={() => {}} />}
      {tab === 'galeria' && (
        <>
          {sel.length > 0 && (
            <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2 text-sm shadow-sm">
              <span>{sel.length} seleccionada(s)</span>
              <Button size="sm" variant="primary" disabled={sel.length !== 2} onClick={() => setTab('comparar')}><Columns2 className="size-4" />Comparar</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel([])}>Limpiar</Button>
            </div>
          )}
          {!grupos.length ? <Empty>No hay fotos de este paciente.</Empty> : grupos.map(([zona, lista]) => (
            <section key={zona} className="mb-5">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">{zona} <Badge>{lista.length}</Badge></h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {lista.map((f) => {
                  const s = sel.indexOf(f.id)
                  return (
                    <div key={f.id} className={cx('group relative overflow-hidden rounded-lg border bg-surface', s >= 0 ? 'border-brand ring-2 ring-brand/40' : 'border-line')}>
                      <button className="block aspect-square w-full bg-black" onClick={() => setVer(f)}>
                        <img src={f.dataUrl} alt={f.nombre} loading="lazy" className="h-full w-full object-cover" />
                      </button>
                      <button onClick={() => toggle(f.id)} aria-label="Seleccionar para comparar"
                        className={cx('absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 border-white text-xs font-bold shadow', s >= 0 ? 'bg-brand text-white' : 'bg-black/30')}>
                        {s >= 0 ? (s === 0 ? 'A' : 'B') : <Check className="size-3.5 text-white/70" />}
                      </button>
                      <div className="px-2 py-1.5 text-xs">
                        <div className="font-medium">{fmtFecha(f.fecha)}</div>
                        <div className="truncate text-muted">{meta(f).origen === 'anotada' ? 'Anotada · ' : ''}{meta(f).nota || '—'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      )}
      {tab === 'comparar' && <Comparar fotos={fotos} sel={sel} setSel={setSel} />}
      {tab === 'anotar' && <Anotar fotos={fotos} fotoId={anotarId} setFotoId={setAnotarId} patientId={id} onGuardada={() => {}} />}

      <Modal open={!!ver} onClose={() => setVer(null)} title={ver ? `${meta(ver).zona} · ${fmtFechaHora(ver.fecha)}` : ''} wide>
        {ver && (
          <>
            <img src={ver.dataUrl} alt={ver.nombre} className="mx-auto max-h-[60vh] rounded-lg bg-black object-contain" />
            <p className="mt-2 text-sm">{meta(ver).nota || <span className="text-muted">Sin nota</span>}</p>
            <p className="text-xs text-muted">{meta(ver).ancho}×{meta(ver).alto} px · {meta(ver).origen}{meta(ver).mmPorPx ? ` · calibrada ${(1 / meta(ver).mmPorPx!).toFixed(2)} px/mm` : ''}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setAnotarId(ver.id); setVer(null); setTab('anotar') }}><PenLine className="size-4" />Medir / anotar</Button>
              <Button size="sm" onClick={() => { setGuiaId(ver.id); setVer(null); setTab('capturar') }}><Ghost className="size-4" />Toma guiada</Button>
              <Button size="sm" onClick={() => downloadBlob(ver.dataUrl, ver.nombre)}><Download className="size-4" />Descargar</Button>
              <Button size="sm" variant="danger" className="ml-auto" onClick={() => { const v = ver; void confirmar('¿Eliminar esta foto?', { peligro: true }).then((ok) => { if (ok) { remove('documents', v.id); setSel((s) => s.filter((x) => x !== v.id)); setVer(null) } }) }}><Trash2 className="size-4" />Eliminar</Button>
            </div>
          </>
        )}
      </Modal>
      <Disclaimer>Obtén el consentimiento del paciente antes de fotografiar. Las fotos se guardan localmente en este navegador; respáldalas según tu política de expediente clínico (NOM-004-SSA3-2012).</Disclaimer>
    </Page>
  )
}
