import { useEffect, useRef, useState } from 'react'
import { Niivue, SLICE_TYPE, SHOW_RENDER, type NiiVueLocation } from '@niivue/niivue'
import { FileUp, FolderOpen, Sparkles, Save, Download, Trash, LoaderCircle, RotateCcw } from 'lucide-react'
import { Page, Card, Button, Field, Select, Notice, PatientBar, Disclaimer, Unsupported, Badge } from '../../components/ui'
import { add, useActivePatient } from '../../lib/store'
import { downloadBlob } from '../../lib/utils'
import { readInstances, groupStudies } from '../dicom/dicomlib'
import { demoPhantom, seriesToNifti } from './nifti'

type Layout = 'mpr3d' | 'mpr' | 'axial' | 'coronal' | 'sagittal' | 'render'
const LAYOUTS: Record<Layout, string> = { mpr3d: 'Multiplanar + 3D', mpr: 'Multiplanar', axial: 'Axial', coronal: 'Coronal', sagittal: 'Sagital', render: '3D (render)' }
const ACCEPT = '.nii,.nii.gz,.gz,.mgz,.mgh,.nrrd,.nhdr,.mha,.mhd,.hdr,.img,.head,.mif,.v,.v16,.stl,.obj,.gii,.mz3,.ply,.vtk,.off,.pial,.inflated,.smoothwm,.trk,.tck,.trx,.asc,.byu,.geo,.dfs,.srf,.x3d,.jcon,.json'
const COMMON_CMAPS = ['gray', 'hot', 'warm', 'cool', 'plasma', 'viridis', 'inferno', 'magma', 'winter', 'red', 'green', 'blue', 'ct_bones', 'ct_soft']

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

export default function Modulo() {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const nvRef = useRef<Niivue | null>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const [ok] = useState(hasWebGL2)
  const [ready, setReady] = useState(false)
  const [layout, setLayout] = useState<Layout>('mpr3d')
  const [items, setItems] = useState<{ vols: string[]; meshes: string[] }>({ vols: [], meshes: [] })
  const [active, setActive] = useState(0)
  const [cmap, setCmap] = useState('gray')
  const [cmaps, setCmaps] = useState<string[]>(COMMON_CMAPS)
  const [opacity, setOpacity] = useState(1)
  const [range, setRange] = useState<{ min: number; max: number; lo: number; hi: number } | null>(null)
  const [clip, setClip] = useState({ on: false, depth: 0, az: 270, el: 0 })
  const [loc, setLoc] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const { patient } = useActivePatient()

  useEffect(() => {
    dirRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  // crear NiiVue
  useEffect(() => {
    if (!ok || !host.current) return
    // lienzo propio por instancia (StrictMode monta dos veces; cada uno libera su contexto WebGL)
    const cv = document.createElement('canvas')
    cv.className = 'block size-full touch-none'
    host.current.prepend(cv)
    canvas.current = cv
    const nv = new Niivue({
      backColor: [0, 0, 0, 1],
      show3Dcrosshair: true,
      loadingText: 'Arrastra o abre un volumen…',
      dragAndDropEnabled: false,
      multiplanarShowRender: SHOW_RENDER.ALWAYS,
      isColorbar: false,
    })
    nvRef.current = nv
    let alive = true
    nv.attachToCanvas(cv).then(() => {
      if (!alive) return
      nv.onLocationChange = (d: unknown) => setLoc((d as NiiVueLocation).string ?? '')
      try {
        const all = nv.colormaps()
        setCmaps([...COMMON_CMAPS.filter((c) => all.includes(c)), ...all.filter((c) => !COMMON_CMAPS.includes(c)).sort()])
      } catch {
        /* lista por defecto */
      }
      setReady(true)
    }).catch((e: Error) => setMsg({ tone: 'danger', text: `No se pudo iniciar WebGL: ${e.message}` }))
    return () => {
      alive = false
      try {
        nv.cleanup()
        ;(nv.gl as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
      } catch {
        /* ignorar */
      }
      nvRef.current = null
      cv.remove()
      setReady(false)
    }
  }, [ok])

  const refresh = (sel?: number) => {
    const nv = nvRef.current
    if (!nv) return
    const vols = nv.volumes.map((v) => v.name)
    setItems({ vols, meshes: nv.meshes.map((m) => m.name) })
    const i = Math.min(sel ?? active, Math.max(0, vols.length - 1))
    setActive(i)
    const v = nv.volumes[i]
    if (v) {
      setCmap(v.colormap)
      setOpacity(v.opacity)
      const lo = v.cal_min ?? 0, hi = v.cal_max ?? 1
      setRange({ min: Math.min(lo, v.global_min ?? lo), max: Math.max(hi, v.global_max ?? hi), lo, hi })
    } else setRange(null)
  }

  // aplicar distribución
  useEffect(() => {
    const nv = nvRef.current
    if (!nv || !ready) return
    nv.opts.multiplanarShowRender = layout === 'mpr3d' ? SHOW_RENDER.ALWAYS : SHOW_RENDER.NEVER
    nv.setSliceType(
      { mpr3d: SLICE_TYPE.MULTIPLANAR, mpr: SLICE_TYPE.MULTIPLANAR, axial: SLICE_TYPE.AXIAL, coronal: SLICE_TYPE.CORONAL, sagittal: SLICE_TYPE.SAGITTAL, render: SLICE_TYPE.RENDER }[layout],
    )
  }, [layout, ready])

  useEffect(() => {
    const nv = nvRef.current
    if (!nv || !ready) return
    nv.setClipPlane(clip.on ? [clip.depth, clip.az, clip.el] : [2, 0, 0])
  }, [clip, ready])

  const run = async (label: string, fn: (nv: Niivue) => Promise<void>) => {
    const nv = nvRef.current
    if (!nv) return
    setBusy(label)
    setMsg(null)
    try {
      await fn(nv)
      refresh(nv.volumes.length - 1)
    } catch (e) {
      setMsg({ tone: 'danger', text: `No se pudo cargar: ${(e as Error).message || e}` })
    } finally {
      setBusy('')
    }
  }

  const loadFiles = (files: File[]) =>
    run('Cargando…', async (nv) => {
      const dcm = files.filter((f) => /\.(dcm|dicom)$/i.test(f.name) || !/\.[a-z0-9]{1,5}$/i.test(f.name))
      const other = files.filter((f) => !dcm.includes(f))
      for (const f of other) await nv.loadFromFile(f)
      if (dcm.length) await loadDicom(nv, dcm)
    })

  const loadDicom = async (nv: Niivue, files: File[]) => {
    const { insts } = await readInstances(files)
    const series = groupStudies(insts).flatMap((s) => s.series).sort((a, b) => b.images.length - a.images.length)[0]
    if (!series) throw new Error('no se encontraron imágenes DICOM')
    if (series.images.length < 3) throw new Error('la serie tiene menos de 3 cortes; ábrela en el Visor DICOM')
    try {
      await nv.loadFromArrayBuffer(await seriesToNifti(series), `${series.desc || 'serie'}.nii`)
      setMsg({ tone: 'info', text: `Serie DICOM "${series.desc}" (${series.images.length} cortes) convertida a volumen en el navegador. Para series comprimidas u oblicuas convierte en servidor con dcm2niix.` })
    } catch (e) {
      throw new Error(`${(e as Error).message}. Convierte DICOM→NIfTI en servidor (dcm2niix).`)
    }
  }

  const loadDemo = () =>
    run('Generando fantoma 3D…', async (nv) => {
      await new Promise((r) => setTimeout(r, 20))
      await nv.loadFromArrayBuffer(demoPhantom(128), 'fantoma-shepp-logan.nii')
      setMsg({ tone: 'info', text: 'Fantoma Shepp-Logan 3D (128³, 1.5 mm) generado en memoria, con una "lesión" esférica.' })
    })

  const clearAll = () => {
    const nv = nvRef.current
    if (!nv) return
    while (nv.volumes.length) nv.removeVolumeByIndex(0)
    while (nv.meshes.length) nv.removeMesh(nv.meshes[0])
    nv.drawScene()
    refresh(0)
    setLoc('')
  }

  const vol = () => nvRef.current?.volumes[active]
  const setVolCmap = (c: string) => {
    const v = vol()
    if (!v) return
    nvRef.current!.setColormap(v.id, c)
    setCmap(c)
  }
  const setVolOpacity = (o: number) => {
    if (!vol()) return
    nvRef.current!.setOpacity(active, o)
    setOpacity(o)
  }
  const setVolRange = (lo: number, hi: number) => {
    const v = vol()
    if (!v || !range) return
    v.cal_min = lo
    v.cal_max = hi
    nvRef.current!.updateGLVolume()
    setRange({ ...range, lo, hi })
  }

  const snapshot = () => {
    const nv = nvRef.current
    if (!nv || !canvas.current) return null
    nv.drawScene()
    return canvas.current.toDataURL('image/png')
  }
  const save = () => {
    const url = snapshot()
    if (!url || !patient) return
    add('documents', { patientId: patient.id, tipo: 'estudio', nombre: `Visor 3D · ${items.vols[active] ?? items.meshes[0] ?? 'escena'}.png`, mime: 'image/png', dataUrl: url, meta: { origen: 'visor3d', vista: LAYOUTS[layout], archivos: [...items.vols, ...items.meshes] } })
    setMsg({ tone: 'info', text: `Captura guardada en el expediente de ${patient.nombre}.` })
  }

  if (!ok)
    return (
      <Page title="Visor 3D">
        <Unsupported api="WebGL 2">Actualiza el navegador o activa la aceleración por hardware.</Unsupported>
      </Page>
    )

  const empty = !items.vols.length && !items.meshes.length
  const step = range ? Math.max((range.max - range.min) / 200, 0.001) : 1

  return (
    <Page
      title="Visor 3D"
      subtitle="Volúmenes NIfTI/MGH/NRRD y mallas STL/OBJ/GIfTI con NiiVue (WebGL 2)."
      actions={
        <>
          <Button onClick={() => filesRef.current?.click()} disabled={!ready}>
            <FileUp className="size-4" /> Archivos
          </Button>
          <Button onClick={() => dirRef.current?.click()} disabled={!ready}>
            <FolderOpen className="size-4" /> Carpeta DICOM
          </Button>
          <Button variant="primary" onClick={loadDemo} disabled={!ready || !!busy}>
            <Sparkles className="size-4" /> Volumen demo
          </Button>
        </>
      }
    >
      <input ref={filesRef} type="file" multiple hidden accept={ACCEPT + ',.dcm'} onChange={(e) => (loadFiles([...(e.target.files ?? [])]), (e.target.value = ''))} data-testid="v3d-files" />
      <input ref={dirRef} type="file" multiple hidden onChange={(e) => (loadFiles([...(e.target.files ?? [])]), (e.target.value = ''))} data-testid="v3d-dir" />
      <PatientBar />
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div
            ref={host}
            className="relative h-[62vh] min-h-[360px] overflow-hidden rounded-xl border border-line bg-black"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              loadFiles([...e.dataTransfer.files])
            }}
          >
            {empty && !busy && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">
                <div>
                  Abre un .nii/.nii.gz o una malla .stl/.obj/.gii, arrastra archivos aquí,
                  <br />o usa «Volumen demo».
                </div>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-sm text-white">
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" /> {busy}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 min-h-5 truncate font-mono text-xs text-muted" title={loc}>
            {loc || 'Haz clic en un corte para ver coordenadas (mm) y valor del vóxel.'}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Vista">
            <div className="grid gap-3">
              <Field label="Distribución">
                <Select value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
                  {Object.entries(LAYOUTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              {items.vols.length > 0 && (
                <>
                  {items.vols.length > 1 && (
                    <Field label="Volumen activo">
                      <Select value={active} onChange={(e) => refresh(+e.target.value)}>
                        {items.vols.map((v, i) => (
                          <option key={i} value={i}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Mapa de color">
                    <Select value={cmap} onChange={(e) => setVolCmap(e.target.value)}>
                      {cmaps.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`Opacidad ${Math.round(opacity * 100)}%`}>
                    <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setVolOpacity(+e.target.value)} className="w-full accent-[var(--color-brand)]" />
                  </Field>
                  {range && (
                    <Field label={`Intensidad ${range.lo.toFixed(0)} – ${range.hi.toFixed(0)}`}>
                      <input type="range" aria-label="Mínimo" min={range.min} max={range.max} step={step} value={range.lo} onChange={(e) => setVolRange(Math.min(+e.target.value, range.hi - step), range.hi)} className="w-full accent-[var(--color-brand)]" />
                      <input type="range" aria-label="Máximo" min={range.min} max={range.max} step={step} value={range.hi} onChange={(e) => setVolRange(range.lo, Math.max(+e.target.value, range.lo + step))} className="w-full accent-[var(--color-brand)]" />
                    </Field>
                  )}
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={clip.on} onChange={(e) => setClip({ ...clip, on: e.target.checked })} /> Plano de corte (3D)
              </label>
              {clip.on && (
                <div className="grid gap-1 text-xs text-muted">
                  <label>
                    Profundidad {clip.depth.toFixed(2)}
                    <input type="range" min={-1} max={1} step={0.01} value={clip.depth} onChange={(e) => setClip({ ...clip, depth: +e.target.value })} className="w-full accent-[var(--color-brand)]" />
                  </label>
                  <label>
                    Azimut {clip.az}°
                    <input type="range" min={0} max={360} value={clip.az} onChange={(e) => setClip({ ...clip, az: +e.target.value })} className="w-full accent-[var(--color-brand)]" />
                  </label>
                  <label>
                    Elevación {clip.el}°
                    <input type="range" min={-90} max={90} value={clip.el} onChange={(e) => setClip({ ...clip, el: +e.target.value })} className="w-full accent-[var(--color-brand)]" />
                  </label>
                </div>
              )}
            </div>
          </Card>
          <Card title="Escena">
            {empty ? (
              <p className="text-sm text-muted">Sin elementos cargados.</p>
            ) : (
              <ul className="mb-3 space-y-1 text-sm">
                {items.vols.map((v, i) => (
                  <li key={'v' + i} className="flex items-center gap-2">
                    <Badge tone="brand">Vol</Badge>
                    <span className="truncate">{v}</span>
                  </li>
                ))}
                {items.meshes.map((m, i) => (
                  <li key={'m' + i} className="flex items-center gap-2">
                    <Badge>Malla</Badge>
                    <span className="truncate">{m}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2">
              <Button variant="primary" onClick={save} disabled={empty || !patient}>
                <Save className="size-4" /> Guardar captura en expediente
              </Button>
              <Button onClick={() => {
                const u = snapshot()
                if (u) downloadBlob(u, 'visor3d.png')
              }} disabled={empty}>
                <Download className="size-4" /> Descargar PNG
              </Button>
              <Button onClick={() => setClip({ on: false, depth: 0, az: 270, el: 0 })}>
                <RotateCcw className="size-4" /> Quitar plano de corte
              </Button>
              <Button variant="ghost" onClick={clearAll} disabled={empty}>
                <Trash className="size-4" /> Limpiar escena
              </Button>
            </div>
          </Card>
          <p className="text-xs text-muted">
            Clic izq.: cursor; der.: contraste; rueda: cortes / zoom en 3D. Carpeta DICOM: se convierte en el navegador solo si no está comprimida; si no, convierte DICOM→NIfTI en servidor (dcm2niix).
          </p>
        </div>
      </div>
      <Disclaimer />
    </Page>
  )
}
