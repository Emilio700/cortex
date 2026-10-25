import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, FileUp, Sparkles, Save, Download, ShieldCheck, ExternalLink, Upload, Search, LoaderCircle, X } from 'lucide-react'
import { Page, Card, Button, Input, Notice, Badge, Tabs, PatientBar, Disclaimer } from '../../components/ui'
import { add, useActivePatient, useSettings } from '../../lib/store'
import { cx, downloadBlob } from '../../lib/utils'
import { readInstances, filesFromDrop, groupStudies, getFrame, defaultWL, renderFrame, parseInstance, TS_NAMES, SUPPORTED_TS, type Study, type Series, type Instance } from './dicomlib'
import { demoStudy, anonymize, zipStore } from './writer'
import { DICT, SUMMARY, fmtTag, elementValue } from './tags'
import Viewer, { type ViewerHandle } from './Viewer'

function useThumbs(studies: Study[]) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const st of studies)
        for (const se of st.series) {
          const im = se.images[Math.floor(se.images.length / 2)]
          try {
            const f = await getFrame(im.inst, im.frame)
            const [c, w] = defaultWL(im.inst, f)
            const src = document.createElement('canvas')
            src.width = f.w
            src.height = f.h
            src.getContext('2d')!.putImageData(renderFrame(f, c, w, im.inst.photometric === 'MONOCHROME1'), 0, 0)
            const t = document.createElement('canvas')
            t.width = t.height = 96
            const ctx = t.getContext('2d')!
            const asp = im.inst.spacing ? im.inst.spacing[0] / im.inst.spacing[1] : 1
            const s = 96 / Math.max(f.w, f.h * asp)
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, 96, 96)
            ctx.drawImage(src, (96 - f.w * s) / 2, (96 - f.h * asp * s) / 2, f.w * s, f.h * asp * s)
            if (alive) setThumbs((m) => ({ ...m, [se.studyUID + se.uid]: t.toDataURL('image/jpeg', 0.8) }))
          } catch {
            /* sin miniatura */
          }
        }
    })()
    return () => {
      alive = false
    }
  }, [studies])
  return thumbs
}

function TagsPanel({ inst }: { inst: Instance }) {
  const [tab, setTab] = useState<'resumen' | 'todas'>('resumen')
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const keys = tab === 'resumen' ? SUMMARY.filter((k) => inst.ds.elements[k]) : Object.keys(inst.ds.elements).sort()
    const all = [
      ...(inst.ds.elements.x00020010 || tab === 'todas' ? [] : [{ tag: 'x00020010', name: 'Sintaxis de transferencia', vr: 'UI', value: inst.ts }]),
      ...keys.map((k) => ({ tag: k, name: DICT[k]?.[0] ?? (parseInt(k.slice(1, 5), 16) % 2 ? 'Privada' : '—'), ...elementValue(inst.ds, inst.ds.elements[k]) })),
    ]
    const norm = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const s = norm(q)
    return all
      .map((r) => (r.tag === 'x00020010' ? { ...r, value: `${r.value}${TS_NAMES[r.value] ? ` (${TS_NAMES[r.value]})` : ''}` } : r))
      .filter((r) => !s || norm(`${fmtTag(r.tag)} ${r.name} ${r.value}`).includes(s))
  }, [inst, tab, q])
  return (
    <Card title="Etiquetas DICOM" pad={false}>
      <div className="px-3 pt-2">
        <Tabs tabs={[{ id: 'resumen', label: 'Resumen' }, { id: 'todas', label: 'Todas' }]} value={tab} onChange={setTab} />
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input placeholder="Buscar etiqueta o valor…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
      </div>
      <div className="max-h-80 overflow-auto text-xs">
        <table className="w-full">
          <tbody>
            {rows.map((r) => (
              <tr key={r.tag} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-1 font-mono text-muted">{fmtTag(r.tag)}</td>
                <td className="px-1 py-1">
                  <div className="font-medium">{r.name}</div>
                  <div className="break-all text-muted">
                    <span className="mr-1 font-mono text-[10px]">{r.vr}</span>
                    {r.value}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-3 text-muted">Sin resultados.</p>}
      </div>
    </Card>
  )
}

export default function Modulo() {
  const [studies, setStudies] = useState<Study[]>([])
  const [sel, setSel] = useState<{ st: number; se: number }>({ st: 0, se: 0 })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const [over, setOver] = useState(false)
  const [idx, setIdx] = useState(0)
  const filesRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const handle = useRef<ViewerHandle | null>(null)
  const settings = useSettings()
  const { patient } = useActivePatient()
  const thumbs = useThumbs(studies)

  useEffect(() => {
    dirRef.current?.setAttribute('webkitdirectory', '')
    dirRef.current?.setAttribute('directory', '')
  }, [])

  const series: Series | undefined = studies[sel.st]?.series[sel.se]
  const study = studies[sel.st]
  const inst = series?.images[Math.min(idx, series.images.length - 1)]?.inst

  const load = async (files: File[]) => {
    if (!files.length) return
    setBusy(`Leyendo ${files.length} archivo(s)…`)
    setMsg(null)
    try {
      const { insts, skipped } = await readInstances(files, (d, t) => setBusy(`Leyendo ${d}/${t}…`))
      if (!insts.length) {
        setMsg({ tone: 'warn', text: 'No se encontraron imágenes DICOM válidas en los archivos seleccionados.' })
        return
      }
      const st = groupStudies(insts)
      setStudies(st)
      setSel({ st: 0, se: 0 })
      const unsupported = insts.filter((i) => !SUPPORTED_TS.has(i.ts))
      const notes = [`${insts.length} imagen(es) en ${st.length} estudio(s).`]
      if (skipped) notes.push(`${skipped} archivo(s) omitido(s) (no DICOM o sin imagen).`)
      if (unsupported.length) notes.push(`${unsupported.length} usan compresión no soportada en navegador (${[...new Set(unsupported.map((i) => TS_NAMES[i.ts] ?? i.ts))].join(', ')}): usa Orthanc/OHIF.`)
      setMsg({ tone: unsupported.length ? 'warn' : 'info', text: notes.join(' ') })
    } finally {
      setBusy('')
    }
  }

  const loadDemo = async () => {
    setBusy('Generando estudio sintético…')
    await new Promise((r) => setTimeout(r, 30))
    const insts = demoStudy()
      .map((b, i) => parseInstance(`demo-${i + 1}.dcm`, b))
      .filter((x): x is Instance => !!x)
    setStudies(groupStudies(insts))
    setSel({ st: 0, se: 0 })
    setMsg({ tone: 'info', text: 'Estudio sintético (fantoma TC) generado en memoria: 40 cortes axiales + 4 reconstrucciones coronales.' })
    setBusy('')
  }

  const snapshot = () => handle.current?.canvas?.toDataURL('image/png')

  const saveToRecord = () => {
    const url = snapshot()
    if (!url || !patient || !series || !inst) return
    add('documents', {
      patientId: patient.id,
      tipo: 'estudio',
      nombre: `${series.modality || 'DICOM'} · ${series.desc} · corte ${idx + 1}.png`,
      mime: 'image/png',
      dataUrl: url,
      meta: { origen: 'visor-dicom', estudioUID: series.studyUID, serieUID: series.uid, sopUID: inst.sopUID, modalidad: series.modality, corte: idx + 1, pacienteDicom: study?.patient },
    })
    setMsg({ tone: 'info', text: `Captura guardada en el expediente de ${patient.nombre}.` })
  }

  const exportAnon = () => {
    if (!series) return
    const insts = [...new Set(series.images.map((i) => i.inst))]
    const blob = zipStore(insts.map((i, k) => ({ name: `IM${String(k + 1).padStart(4, '0')}.dcm`, data: anonymize(i) })))
    downloadBlob(blob, `serie-anonimizada-${series.number || 1}.zip`)
  }

  const sendOrthanc = async () => {
    if (!series || !settings.servicios.orthanc) return
    const base = settings.servicios.orthanc.replace(/\/$/, '')
    const insts = [...new Set(series.images.map((i) => i.inst))]
    let ok = 0
    setBusy('Enviando a Orthanc…')
    try {
      for (const i of insts) {
        const r = await fetch(`${base}/instances`, { method: 'POST', headers: { 'Content-Type': 'application/dicom' }, body: i.bytes.slice() as BlobPart })
        if (r.ok) ok++
      }
      setMsg({ tone: ok === insts.length ? 'info' : 'warn', text: `Orthanc: ${ok}/${insts.length} instancias enviadas.` })
    } catch (e) {
      setMsg({ tone: 'danger', text: `No se pudo contactar a Orthanc (${(e as Error).message}). Revisa la URL y CORS.` })
    } finally {
      setBusy('')
    }
  }

  const ohif = settings.servicios.ohif?.replace(/\/$/, '')
  const orthanc = settings.servicios.orthanc?.replace(/\/$/, '')

  return (
    <Page
      title="Visor DICOM"
      subtitle="Rayos X, TC, RM y US en el navegador. Los archivos no salen de este equipo."
      actions={
        <>
          <Button onClick={() => filesRef.current?.click()}>
            <FileUp className="size-4" /> Archivos
          </Button>
          <Button onClick={() => dirRef.current?.click()}>
            <FolderOpen className="size-4" /> Carpeta
          </Button>
          <Button variant="primary" onClick={loadDemo} disabled={!!busy}>
            <Sparkles className="size-4" /> Estudio demo
          </Button>
        </>
      }
    >
      <input ref={filesRef} type="file" multiple hidden accept=".dcm,.dicom,application/dicom,*/*" onChange={(e) => (load([...(e.target.files ?? [])]), (e.target.value = ''))} data-testid="dicom-files" />
      <input ref={dirRef} type="file" multiple hidden onChange={(e) => (load([...(e.target.files ?? [])]), (e.target.value = ''))} data-testid="dicom-dir" />
      <PatientBar />
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      {busy && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" /> {busy}
        </div>
      )}
      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setOver(false)
          load(await filesFromDrop(e.dataTransfer))
        }}
        className={cx('rounded-xl', over && 'ring-2 ring-brand')}
      >
        {!series ? (
          <div className="rounded-xl border-2 border-dashed border-line p-10 text-center">
            <FolderOpen className="mx-auto mb-3 size-10 text-muted" />
            <p className="font-medium">Arrastra aquí archivos o una carpeta DICOM (CD del paciente, exportación del equipo)</p>
            <p className="mt-1 text-sm text-muted">Soporta sin compresión (8/16 bits, MONOCHROME1/2, RGB, multicuadro), JPEG Baseline y RLE. JPEG 2000 / JPEG-LS / Lossless: usa Orthanc + OHIF.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => dirRef.current?.click()}>
                <FolderOpen className="size-4" /> Abrir carpeta
              </Button>
              <Button variant="primary" onClick={loadDemo}>
                <Sparkles className="size-4" /> Probar con estudio demo
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)_300px]">
            <Card title="Series" pad={false} className="order-2 min-w-0 lg:order-1">
              <div className="flex gap-2 overflow-x-auto p-2 lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
                {studies.map((st, a) => (
                  <div key={st.uid} className="contents">
                    <div className="hidden px-1 text-[11px] text-muted lg:block">
                      <div className="truncate font-medium text-ink">{st.patient}</div>
                      <div className="truncate">
                        {st.desc} · {st.date}
                      </div>
                    </div>
                    {st.series.map((se, b) => (
                      <button
                        key={se.uid}
                        onClick={() => setSel({ st: a, se: b })}
                        className={cx('w-28 shrink-0 rounded-lg border p-1 text-left lg:w-full', sel.st === a && sel.se === b ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}
                      >
                        {thumbs[se.studyUID + se.uid] ? <img src={thumbs[se.studyUID + se.uid]} alt="" className="aspect-square w-full rounded bg-black object-contain" /> : <div className="aspect-square w-full rounded bg-black" />}
                        <div className="mt-1 truncate text-xs font-medium">{se.desc}</div>
                        <div className="text-[11px] text-muted">
                          {se.modality} · {se.images.length} im.
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
            <div className="order-1 h-[72vh] min-h-[420px] overflow-hidden rounded-xl border border-line bg-surface lg:order-2">
              <Viewer key={series.studyUID + series.uid} series={series} onIndex={setIdx} handle={handle} />
            </div>
            <div className="order-3 min-w-0 space-y-4">
              <Card title="Acciones">
                <div className="grid gap-2">
                  <Button variant="primary" onClick={saveToRecord} disabled={!patient}>
                    <Save className="size-4" /> Guardar en expediente
                  </Button>
                  <Button onClick={() => {
                    const u = snapshot()
                    if (u) downloadBlob(u, `captura-${idx + 1}.png`)
                  }}>
                    <Download className="size-4" /> Descargar PNG
                  </Button>
                  <Button onClick={exportAnon} title="Reemplaza nombre, ID, fecha de nacimiento, institución y médicos">
                    <ShieldCheck className="size-4" /> Serie anonimizada (.zip)
                  </Button>
                  {ohif && (
                    <a className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line text-sm font-medium hover:bg-surface-2" href={`${ohif}/viewer?StudyInstanceUIDs=${encodeURIComponent(series.studyUID)}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" /> Abrir en OHIF
                    </a>
                  )}
                  {orthanc && (
                    <>
                      <Button onClick={sendOrthanc} disabled={!!busy}>
                        <Upload className="size-4" /> Enviar serie a Orthanc
                      </Button>
                      <a className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line text-sm font-medium hover:bg-surface-2" href={`${orthanc}/app/explorer.html`} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" /> Abrir Orthanc
                      </a>
                    </>
                  )}
                  {!ohif && !orthanc && <p className="text-xs text-muted">Configura Orthanc/OHIF en Servicios para abrir el estudio en un PACS.</p>}
                  <Button variant="ghost" onClick={() => setStudies([])}>
                    <X className="size-4" /> Cerrar estudio
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {inst && <Badge>{TS_NAMES[inst.ts] ?? inst.ts}</Badge>}
                  {inst && <Badge>{inst.photometric}</Badge>}
                  {inst?.spacing && <Badge tone="brand">{inst.spacing.map((v) => v.toFixed(2)).join(' × ')} mm</Badge>}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Ratón: izq. = herramienta, der. = ventana/nivel, rueda = cortes, Ctrl+rueda = zoom. Táctil: un dedo = herramienta, dos dedos = zoom y mover.
                </p>
              </Card>
              {inst && <TagsPanel inst={inst} />}
            </div>
          </div>
        )}
      </div>
      <Disclaimer>Visor de referencia, no diagnóstico. Las mediciones dependen de la calibración (PixelSpacing) del archivo. La interpretación corresponde al médico radiólogo/tratante.</Disclaimer>
    </Page>
  )
}
