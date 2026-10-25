import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Camera, Check, Save, Trash2 } from 'lucide-react'
import { Card, Button, Field, Textarea, Badge, Empty, Notice, Disclaimer } from '../../components/ui'
import { useActivePatient, useCollection, add, uid } from '../../lib/store'
import { claveSegura, usePreferencia } from '../../lib/preferencias'
import { cx, fmtFecha, nombreCompleto } from '../../lib/utils'
import { crearManiqui, nombreRegion } from './maniqui'
import { confirmar } from '../../components/dialogos'

export interface Marcador {
  id: string
  region: string
  p: [number, number, number]
  n: [number, number, number]
  eva: number
  nota: string
  fecha: string
}
type Vista = 'frente' | 'espalda' | 'derecho' | 'izquierdo'
const VISTAS: Record<Vista, [number, number, number]> = { frente: [0, 0.95, 3.2], espalda: [0, 0.95, -3.2], derecho: [-3.2, 0.95, 0], izquierdo: [3.2, 0.95, 0] }
const TARGET = new THREE.Vector3(0, 0.86, 0)
const colorEva = (e: number) => new THREE.Color().setHSL((1 - e / 10) * 0.33, 0.85, 0.47)
const KEY = (pid: string) => 'medisuite.anatomia.' + pid

function etiqueta(n: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  x.fillStyle = '#111827'
  x.beginPath()
  x.arc(32, 32, 30, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#fff'
  x.font = 'bold 36px Inter, sans-serif'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(String(n), 32, 34)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }))
  s.scale.set(0.05, 0.05, 1)
  return s
}

export default function Cuerpo() {
  const { id: pid, patient } = useActivePatient()
  const docs = useCollection('documents', (d) => d.patientId === pid && d.meta?.modulo === 'anatomia', [pid])
  const host = useRef<HTMLDivElement>(null)
  const three = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; body: THREE.Group; marks: THREE.Group } | null>(null)
  const [marks, setMarks] = useState<Marcador[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [webgl, setWebgl] = useState(true)
  const [guardado, setGuardado] = useState(false)
  const marksRef = useRef(marks)
  marksRef.current = marks

  // Borrador por paciente: preferencia compartida de la clínica (`anatomia.borrador.<paciente>`, scope org) en modo
  // servidor, para que los colegas vean los marcadores en curso; en demo, localStorage de este navegador.
  const [borrador, setBorrador, bMeta] = usePreferencia<Marcador[] | null>(pid ? 'anatomia.borrador.' + claveSegura(pid) : null, 'org', null, {
    lsKey: pid ? KEY(pid) : undefined,
  })
  const iniciado = useRef<string | null>(null)
  // Carga por paciente: borrador o última versión guardada en expediente
  useEffect(() => {
    if (!pid) {
      iniciado.current = null
      return setMarks([])
    }
    if (bMeta.cargando || iniciado.current === pid) return
    iniciado.current = pid
    let m: Marcador[] | null = Array.isArray(borrador) ? borrador : null
    if (!m) {
      const ult = [...docs].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
      m = (ult?.meta?.marcadores as Marcador[]) ?? []
    }
    setMarks(m)
    setSel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, bMeta.cargando])
  const persistir = (m: Marcador[]) => {
    setMarks(m)
    setGuardado(false)
    if (pid) setBorrador(m)
  }

  // Escena
  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    } catch {
      setWebgl(false)
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'none'
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
    camera.position.set(...VISTAS.frente)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(TARGET)
    controls.enableDamping = true
    controls.minDistance = 0.6
    controls.maxDistance = 5
    controls.update()
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a7f78', 1.6))
    const dir = new THREE.DirectionalLight('#ffffff', 1.6)
    dir.position.set(1.5, 3, 2.5)
    scene.add(dir)
    const back = new THREE.DirectionalLight('#ffffff', 0.7)
    back.position.set(-1.5, 2, -2.5)
    scene.add(back)
    const body = crearManiqui()
    scene.add(body)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.18 }))
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)
    const marksG = new THREE.Group()
    scene.add(marksG)
    three.current = { renderer, scene, camera, controls, body, marks: marksG }

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    // Clic (sin arrastre) para colocar o seleccionar marcadores
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    let down: [number, number] | null = null
    const pd = (e: PointerEvent) => (down = [e.clientX, e.clientY])
    const pu = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hm = ray.intersectObjects(marksG.children, true)[0]
      if (hm) return setSel(hm.object.userData.id ?? hm.object.parent?.userData.id)
      const h = ray.intersectObjects(body.children, false)[0]
      if (!h || !h.face) return
      const n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize()
      const m: Marcador = { id: uid('m'), region: nombreRegion(h.object.userData.region, n, h.point), p: h.point.toArray() as Marcador['p'], n: n.toArray() as Marcador['n'], eva: 5, nota: '', fecha: new Date().toISOString() }
      persistirRef.current([...marksRef.current, m])
      setSel(m.id)
    }
    renderer.domElement.addEventListener('pointerdown', pd)
    renderer.domElement.addEventListener('pointerup', pu)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry.dispose()
          ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((mm: THREE.Material & { map?: THREE.Texture }) => (mm.map?.dispose(), mm.dispose()))
        }
      })
      el.removeChild(renderer.domElement)
      three.current = null
    }
  }, [])
  const persistirRef = useRef(persistir)
  persistirRef.current = persistir

  // Sincroniza mallas de marcadores con el estado
  useEffect(() => {
    const t = three.current
    if (!t) return
    t.marks.children.slice().forEach((c) => {
      t.marks.remove(c)
      c.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry.dispose()
          const mm = o.material as THREE.Material & { map?: THREE.Texture }
          mm.map?.dispose()
          mm.dispose()
        }
      })
    })
    marks.forEach((m, i) => {
      const g = new THREE.Group()
      g.userData.id = m.id
      const p = new THREE.Vector3(...m.p), n = new THREE.Vector3(...m.n)
      const s = new THREE.Mesh(new THREE.SphereGeometry(sel === m.id ? 0.026 : 0.02, 16, 12), new THREE.MeshStandardMaterial({ color: colorEva(m.eva), emissive: colorEva(m.eva), emissiveIntensity: 0.35 }))
      s.position.copy(p).addScaledVector(n, 0.008)
      s.userData.id = m.id
      const lbl = etiqueta(i + 1)
      lbl.position.copy(p).addScaledVector(n, 0.05)
      lbl.userData.id = m.id
      g.add(s, lbl)
      t.marks.add(g)
    })
  }, [marks, sel])

  function vista(v: Vista) {
    const t = three.current
    if (!t) return
    t.camera.position.set(...VISTAS[v])
    t.controls.target.copy(TARGET)
    t.controls.update()
  }

  /** PNG con vista frontal y posterior lado a lado, más la lista de marcadores. */
  function capturar(): string | null {
    const t = three.current
    if (!t) return null
    const prev = { pos: t.camera.position.clone(), tgt: t.controls.target.clone(), aspect: t.camera.aspect }
    const W = 520, H = 760
    t.renderer.setSize(W, H, false)
    t.camera.aspect = W / H
    t.camera.updateProjectionMatrix()
    const out = document.createElement('canvas')
    const alto = H + 90 + marks.length * 22
    out.width = W * 2
    out.height = alto
    const c = out.getContext('2d')!
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, out.width, out.height)
    c.fillStyle = '#111827'
    c.font = 'bold 20px Inter, sans-serif'
    c.fillText(`Mapa corporal · ${patient ? nombreCompleto(patient) : ''} · ${fmtFecha(new Date().toISOString())}`, 20, 32)
    ;(['frente', 'espalda'] as Vista[]).forEach((v, i) => {
      t.camera.position.set(VISTAS[v][0], VISTAS[v][1], VISTAS[v][2])
      t.camera.lookAt(TARGET)
      t.renderer.render(t.scene, t.camera)
      c.drawImage(t.renderer.domElement, i * W, 44, W, H)
      c.fillStyle = '#6b7280'
      c.font = '15px Inter, sans-serif'
      c.fillText(v === 'frente' ? 'Vista anterior' : 'Vista posterior', i * W + 20, 70)
    })
    c.font = '15px Inter, sans-serif'
    marks.forEach((m, i) => {
      c.fillStyle = '#111827'
      c.fillText(`${i + 1}. ${m.region} — EVA ${m.eva}/10${m.nota ? ' — ' + m.nota : ''}`, 20, H + 74 + i * 22)
    })
    t.camera.position.copy(prev.pos)
    t.controls.target.copy(prev.tgt)
    const el = host.current!
    t.renderer.setSize(el.clientWidth, el.clientHeight)
    t.camera.aspect = prev.aspect
    t.camera.updateProjectionMatrix()
    return out.toDataURL('image/png')
  }
  function guardar() {
    if (!pid) return
    const png = capturar()
    if (!png) return
    add('documents', { patientId: pid, tipo: 'otro', nombre: `Mapa corporal de dolor ${fmtFecha(new Date().toISOString())}`, mime: 'image/png', dataUrl: png, meta: { modulo: 'anatomia', marcadores: marks } })
    setGuardado(true)
  }
  function descargar() {
    const png = capturar()
    if (!png) return
    const a = document.createElement('a')
    a.href = png
    a.download = 'mapa-corporal.png'
    a.click()
  }

  const actual = marks.find((m) => m.id === sel)
  const upd = (patch: Partial<Marcador>) => persistir(marks.map((m) => (m.id === sel ? { ...m, ...patch } : m)))
  const evaMax = useMemo(() => marks.reduce((a, m) => Math.max(a, m.eva), 0), [marks])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2">
          {(Object.keys(VISTAS) as Vista[]).map((v) => (
            <Button key={v} size="sm" variant="ghost" onClick={() => vista(v)}>{{ frente: 'Frente', espalda: 'Espalda', derecho: 'Lado derecho', izquierdo: 'Lado izquierdo' }[v]}</Button>
          ))}
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" onClick={descargar} disabled={!webgl}><Camera className="size-4" /> PNG</Button>
            <Button size="sm" variant="primary" onClick={guardar} disabled={!pid || !webgl || guardado}>{guardado ? <Check className="size-4" /> : <Save className="size-4" />} {guardado ? 'Guardado' : 'Guardar en expediente'}</Button>
          </div>
        </div>
        {!webgl && <div className="p-4"><Notice tone="warn">WebGL no está disponible en este navegador.</Notice></div>}
        <div ref={host} className="relative h-[460px] w-full cursor-crosshair bg-gradient-to-b from-surface to-surface-2 sm:h-[600px]" />
        <p className="border-t border-line px-3 py-2 text-xs text-muted">Clic o toque sobre el cuerpo para marcar dolor o lesión · arrastra para girar · rueda o pellizco para acercar. El lado derecho del paciente aparece a tu izquierda en la vista de frente.</p>
      </Card>
      <div className="min-w-0 space-y-4">
        {actual && (
          <Card title={`Marcador ${marks.indexOf(actual) + 1}`} actions={<Button size="sm" variant="ghost" onClick={() => (persistir(marks.filter((m) => m.id !== sel)), setSel(null))} aria-label="Eliminar"><Trash2 className="size-4" /></Button>}>
            <div className="mb-3 font-medium">{actual.region}</div>
            <Field label={`Intensidad (EVA): ${actual.eva} / 10`}>
              <input type="range" min={0} max={10} value={actual.eva} onChange={(e) => upd({ eva: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" />
              <div className="flex justify-between text-[11px] text-muted"><span>Sin dolor</span><span>Moderado</span><span>Máximo</span></div>
            </Field>
            <Field label="Nota" className="mt-3">
              <Textarea value={actual.nota} placeholder="Tipo de dolor, lesión, irradiación, tiempo de evolución…" onChange={(e) => upd({ nota: e.target.value })} />
            </Field>
          </Card>
        )}
        <Card title="Marcadores" actions={marks.length > 0 && <Badge tone={evaMax >= 7 ? 'danger' : evaMax >= 4 ? 'warn' : 'ok'}>EVA máx. {evaMax}</Badge>}>
          {marks.length === 0 ? (
            <Empty>Haz clic sobre el maniquí para agregar un marcador.</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {marks.map((m, i) => (
                <li key={m.id}>
                  <button onClick={() => setSel(m.id)} className={cx('flex w-full items-center gap-2 py-2 text-left', sel === m.id && 'font-medium')}>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs text-surface">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{m.region}</span>
                      {m.nota && <span className="block truncate text-xs font-normal text-muted">{m.nota}</span>}
                    </span>
                    <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: '#' + colorEva(m.eva).getHexString() }}>{m.eva}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {marks.length > 0 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => void confirmar('¿Borrar todos los marcadores?', { peligro: true, aceptar: 'Borrar' }).then((ok) => ok && (persistir([]), setSel(null)))}>Borrar todos</Button>}
        </Card>
        {docs.length > 0 && (
          <Card title="Mapas guardados">
            <ul className="space-y-2 text-sm">
              {[...docs].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <img src={d.dataUrl} alt="" className="h-12 w-16 rounded border border-line bg-white object-contain" />
                  <span className="flex-1">{fmtFecha(d.fecha)} · {(d.meta?.marcadores as Marcador[] | undefined)?.length ?? 0} marcadores</span>
                  <Button size="sm" onClick={() => (persistir((d.meta?.marcadores as Marcador[]) ?? []), setSel(null))}>Abrir</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Disclaimer>Los marcadores se guardan como borrador en este navegador por paciente; “Guardar en expediente” crea una imagen PNG (vista anterior y posterior) en Documentos con los marcadores adjuntos.</Disclaimer>
      </div>
    </div>
  )
}
