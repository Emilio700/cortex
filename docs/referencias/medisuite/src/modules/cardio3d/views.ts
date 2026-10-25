// Visores three.js: corazón 3D interactivo y fluoroscopía simulada (proyección ortográfica).
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { heartGeometry, greatVessels, carmDir, SEG, type Model, type Sys } from './anatomy'

abstract class Base {
  el: HTMLElement
  renderer: THREE.WebGLRenderer
  raf = 0
  ro: ResizeObserver
  w = 1
  h = 1
  constructor(el: HTMLElement) {
    this.el = el
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
    el.appendChild(this.renderer.domElement)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(el)
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop)
      this.frame(t / 1000)
    }
    this.raf = requestAnimationFrame(loop)
  }
  resize() {
    this.w = Math.max(1, this.el.clientWidth)
    this.h = Math.max(1, this.el.clientHeight)
    this.renderer.setSize(this.w, this.h, false)
    this.onResize()
  }
  abstract onResize(): void
  abstract frame(t: number): void
  snapshot() {
    this.frame(performance.now() / 1000)
    return this.renderer.domElement.toDataURL('image/png')
  }
  disposeBase(scene: THREE.Scene) {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach((x) => x.dispose())
      }
    })
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}

// ---------------- Corazón 3D ----------------
export class Heart3D extends Base {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(35, 1, 0.5, 200)
  controls: OrbitControls
  labels = new CSS2DRenderer()
  root = new THREE.Group()
  heart: THREE.Mesh
  vessels = new THREE.Group()
  carm = new THREE.Group()
  meshes = new Map<string, THREE.Mesh>()
  ownGeoms: THREE.BufferGeometry[] = []
  ray = new THREE.Raycaster()
  highlight = new Set<string>()
  hover: string | null = null
  beating = false
  hr = 70
  showLabels = true
  tween: { from: THREE.Vector3; to: THREE.Vector3; up0: THREE.Vector3; up1: THREE.Vector3; t0: number } | null = null
  onPick?: (id: string | null) => void
  onHover?: (id: string | null) => void
  private down = { x: 0, y: 0 }
  private tick = 0

  /** Atenúa las etiquetas ocultas detrás del miocardio o grandes vasos. */
  private occludeLabels() {
    const solids = this.root.children.filter((c) => c !== this.vessels && ((c as THREE.Mesh).material as THREE.Material).opacity > 0.6)
    const cam = this.camera.position, wp = new THREE.Vector3()
    this.vessels.children.forEach((m) => {
      const lab = m.children[0] as CSS2DObject | undefined
      if (!lab) return
      lab.getWorldPosition(wp)
      const dist = cam.distanceTo(wp)
      this.ray.set(cam, wp.clone().sub(cam).normalize())
      this.ray.far = dist - 0.5
      const hidden = this.ray.intersectObjects(solids, false).length > 0
      lab.element.style.opacity = hidden ? '0.18' : '1'
    })
    this.ray.far = Infinity
  }

  constructor(el: HTMLElement) {
    super(el)
    const r = this.renderer
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.05
    const pm = new THREE.PMREMGenerator(r)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = env
    pm.dispose()
    this.scene.add(new THREE.HemisphereLight('#fff6ee', '#40304a', 0.6))
    const key = new THREE.DirectionalLight('#ffffff', 1.6)
    key.position.set(6, 10, 12)
    this.camera.add(key)
    this.scene.add(this.camera)

    const heartMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 0.6, sheen: 0.3, sheenColor: new THREE.Color('#ff9a8a') })
    this.heart = new THREE.Mesh(heartGeometry(), heartMat)
    const gv = greatVessels()
    const ao = new THREE.Mesh(gv.aorta, new THREE.MeshPhysicalMaterial({ color: '#d98673', roughness: 0.45, clearcoat: 0.3 }))
    const pa = new THREE.Mesh(gv.pa, new THREE.MeshPhysicalMaterial({ color: '#7f8fc4', roughness: 0.45, clearcoat: 0.3 }))
    ao.userData.anat = pa.userData.anat = true
    this.root.add(this.heart, ao, pa, this.vessels)
    this.scene.add(this.root, this.carm)
    this.buildCarm()

    this.labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    el.style.position = 'relative'
    el.appendChild(this.labels.domElement)

    this.camera.position.set(0, 4, 34)
    this.controls = new OrbitControls(this.camera, r.domElement)
    this.controls.enableDamping = true
    this.controls.minDistance = 12
    this.controls.maxDistance = 70
    this.controls.target.set(0, 1, 0)

    const dom = r.domElement
    dom.addEventListener('pointermove', this.onMove)
    dom.addEventListener('pointerdown', this.onDown)
    dom.addEventListener('pointerup', this.onUp)
    dom.addEventListener('pointerleave', this.onLeave)
    this.resize()
  }

  private buildCarm() {
    const det = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 1.2), new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, transparent: true, opacity: 0.85 }))
    det.position.z = 17
    const src = new THREE.Mesh(new THREE.ConeGeometry(2, 3.5, 24), new THREE.MeshStandardMaterial({ color: '#64748b' }))
    src.rotation.x = Math.PI / 2
    src.position.z = -17
    const beam = new THREE.Mesh(new THREE.ConeGeometry(5.5, 32, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }))
    beam.rotation.x = -Math.PI / 2
    this.carm.add(det, src, beam)
    this.carm.visible = false
    this.carm.traverse((o) => (o as THREE.Mesh).isMesh && this.ownGeoms.push((o as THREE.Mesh).geometry))
  }

  setModel(m: Model) {
    this.vessels.children.slice().forEach((c) => {
      const mesh = c as THREE.Mesh
      ;(mesh.material as THREE.Material).dispose()
      mesh.children.forEach((l) => (l as CSS2DObject).element?.remove())
      this.vessels.remove(c)
    })
    this.meshes.clear()
    for (const s of m.segs) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, envMapIntensity: 0.25, emissive: '#000000' })
      const mesh = new THREE.Mesh(s.geom, mat)
      mesh.userData.seg = s.id
      const info = SEG[s.id]
      if (info && info.num !== '—') {
        const div = document.createElement('div')
        div.textContent = info.num
        div.style.cssText = 'font:600 10px/1 system-ui;padding:2px 4px;border-radius:6px;background:rgba(15,23,42,.75);color:#fff;white-space:nowrap'
        const lab = new CSS2DObject(div)
        lab.position.copy(s.mid)
        mesh.add(lab)
      }
      this.vessels.add(mesh)
      this.meshes.set(s.id, mesh)
    }
    this.applyStyles()
  }

  setHighlight(ids: string[]) {
    this.highlight = new Set(ids)
    this.applyStyles()
  }
  setLabels(on: boolean) {
    this.showLabels = on
    this.labels.domElement.style.display = on ? '' : 'none'
  }
  setOpacity(o: number) {
    this.root.children.forEach((c) => {
      if (c === this.vessels) return
      const mat = (c as THREE.Mesh).material as THREE.Material
      mat.opacity = o
      mat.transparent = o < 0.99
      mat.depthWrite = o > 0.95
    })
  }
  setBeating(on: boolean, hr: number) {
    this.beating = on
    this.hr = hr
  }
  setCarm(lao: number | null, cra = 0) {
    this.carm.visible = lao !== null
    if (lao !== null) this.carm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), carmDir(lao, cra))
  }
  setView(dir: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)) {
    const dist = this.camera.position.distanceTo(this.controls.target)
    this.tween = { from: this.camera.position.clone().sub(this.controls.target).normalize(), to: dir.clone().normalize(), up0: this.camera.up.clone(), up1: up.clone(), t0: performance.now() / 1000 }
    this.tween.from.multiplyScalar(dist)
  }

  private applyStyles() {
    this.meshes.forEach((m, id) => {
      const mat = m.material as THREE.MeshStandardMaterial
      const hl = this.highlight.has(id), hv = this.hover === id
      mat.emissive.set(hl ? '#ffb000' : hv ? '#ffffff' : '#000000')
      mat.emissiveIntensity = hl ? 0.75 : hv ? 0.35 : 0
    })
  }

  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.ray.setFromCamera(p, this.camera)
    const hit = this.ray.intersectObjects([this.heart, ...this.vessels.children], false)[0]
    return (hit?.object.userData.seg as string | undefined) ?? null
  }
  private onMove = (e: PointerEvent) => {
    if (e.buttons) return
    const id = this.pick(e)
    if (id !== this.hover) {
      this.hover = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      this.applyStyles()
      this.onHover?.(id)
    }
  }
  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY }
  }
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 6) this.onPick?.(this.pick(e))
  }
  private onLeave = () => {
    if (this.hover) {
      this.hover = null
      this.applyStyles()
      this.onHover?.(null)
    }
  }

  private fitted = false
  onResize() {
    if (!this.fitted && this.w > 1) {
      // distancia inicial según la proporción del visor (que quepa el corazón completo)
      this.fitted = true
      this.camera.position.setLength(34 / Math.min(1, (this.w / this.h) ** 0.85))
    }
    this.camera.aspect = this.w / this.h
    this.camera.updateProjectionMatrix()
    this.labels.setSize(this.w, this.h)
  }

  frame(t: number) {
    if (this.tween) {
      const k = Math.min(1, (t - this.tween.t0) / 0.7), e = k * k * (3 - 2 * k)
      const dist = this.tween.from.length()
      const dir = this.tween.from.clone().normalize().lerp(this.tween.to, e)
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1)
      this.camera.position.copy(this.controls.target).addScaledVector(dir.normalize(), dist)
      this.camera.up.copy(this.tween.up0).lerp(this.tween.up1, e).normalize()
      if (k >= 1) this.tween = null
    }
    this.controls.update()
    let s = 1
    if (this.beating) {
      const ph = (t * this.hr / 60) % 1
      s = 1 - 0.045 * (ph < 0.38 ? Math.sin((ph / 0.38) * Math.PI) : 0)
    }
    this.root.scale.setScalar(s)
    if (this.showLabels && ++this.tick % 10 === 0) this.occludeLabels()
    this.renderer.render(this.scene, this.camera)
    if (this.showLabels) this.labels.render(this.scene, this.camera)
  }

  dispose() {
    const dom = this.renderer.domElement
    dom.removeEventListener('pointermove', this.onMove)
    dom.removeEventListener('pointerdown', this.onDown)
    dom.removeEventListener('pointerup', this.onUp)
    dom.removeEventListener('pointerleave', this.onLeave)
    this.controls.dispose()
    this.labels.domElement.remove()
    this.scene.environment?.dispose()
    this.ownGeoms.forEach((g) => g.dispose())
    this.disposeBase(this.scene) // geometrías del modelo y del corazón son compartidas (cache)
  }
}

// ---------------- Fluoroscopía simulada ----------------
// Modelo de atenuación: para cada píxel se acumula μ·z de las caras traseras (canal B) y de las
// delanteras (canal G) en un render target de media precisión con mezcla aditiva; la diferencia es
// μ·espesor atravesado (malla cerrada ⇒ pares entrada/salida). Así la densidad de un vaso depende
// de su calibre real (y de la estenosis), y se suman superposiciones. El post-proceso aplica
// Beer-Lambert I = I0·e^(−Σμ·x) (vasos oscuros sobre fondo gris), desenfoque leve, viñeta y ruido.
const DEPTH = 70 // cm entre planos near/far de la cámara ortográfica (cámara a 40 cm)
const vesselVert = /* glsl */ `
attribute float aDist; attribute float aRad; uniform float uCal; varying float vDist;
void main(){ vDist=aDist; vec3 p = position - normal*aRad*(1.0-uCal); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`
const bodyVert = /* glsl */ `varying float vDist; void main(){ vDist=0.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`
const thickFrag = /* glsl */ `
uniform float uFill; uniform float uMu; varying float vDist;
void main(){ if(vDist>uFill) discard; float z=(gl_FragCoord.z-0.5)*uMu; gl_FragColor = gl_FrontFacing ? vec4(0.0,z,0.0,1.0) : vec4(0.0,0.0,z,1.0); }`
const postFrag = /* glsl */ `
uniform sampler2D tD; uniform vec2 uRes; uniform float uTime; varying vec2 vUv;
float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 px = 1.0/uRes; float d=0.0, ws=0.0;
  for(int x=-2;x<=2;x++) for(int y=-2;y<=2;y++){ float w=exp(-float(x*x+y*y)/2.0); vec4 t=texture2D(tD, vUv+vec2(float(x),float(y))*px*0.8); d+=(t.b-t.g)*w; ws+=w; }
  d = max(d/ws, 0.0)*${DEPTH.toFixed(1)};
  float r = length(vUv-0.5);
  float base = mix(0.82, 0.32, smoothstep(0.28, 0.78, r));
  float v = base*exp(-d);
  v += (rnd(floor(vUv*uRes) + fract(uTime*7.0)*97.0)-0.5)*0.07;
  v += (rnd(floor(vUv*uRes/5.0) + floor(uTime*12.0))-0.5)*0.02;
  gl_FragColor = vec4(vec3(v)*vec3(1.0,1.0,0.97), 1.0);
}`
const quadVert = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`
const thickMat = (vert: string, mu: number, fill = 1e3) =>
  new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: thickFrag, uniforms: { uFill: { value: fill }, uMu: { value: mu }, uCal: { value: 0.62 } }, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: true })

export class Fluoro extends Base {
  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 40 - DEPTH / 2, 40 + DEPTH / 2)
  rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })
  post: THREE.ShaderMaterial
  postScene = new THREE.Scene()
  postCam = new THREE.Camera()
  vessels = new THREE.Group()
  cath: Record<Sys, THREE.Mesh | null> = { L: null, R: null }
  mats: Record<Sys, THREE.ShaderMaterial>
  sys: Sys | 'both' = 'L'
  injectT0: number | null = null
  ownGeoms: THREE.BufferGeometry[] = []
  zoom = 8.5

  constructor(el: HTMLElement) {
    super(el)
    this.mats = { L: thickMat(vesselVert, 2.6), R: thickMat(vesselVert, 2.6) }
    // silueta cardiaca, columna vertebral y diafragma (atenuación tenue)
    const vb = new THREE.CylinderGeometry(1.7, 1.8, 2.4, 28), ped = new THREE.CylinderGeometry(0.55, 0.55, 5.4, 12), dia = new THREE.SphereGeometry(9, 48, 32)
    this.ownGeoms.push(vb, ped, dia)
    const bone = thickMat(bodyVert, 0.08)
    this.scene.add(new THREE.Mesh(heartGeometry(), thickMat(bodyVert, 0.035)))
    for (let y = -16; y <= 16; y += 3) {
      const b = new THREE.Mesh(vb, bone)
      b.position.set(-0.6, y, -8)
      const p = new THREE.Mesh(ped, bone)
      p.rotation.z = Math.PI / 2
      p.position.set(-0.6, y + 0.4, -10.3)
      this.scene.add(b, p)
    }
    const d = new THREE.Mesh(dia, thickMat(bodyVert, 0.03))
    d.position.set(-1.5, -12.5, -1)
    this.scene.add(d, this.vessels)
    this.post = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: postFrag, uniforms: { tD: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 } }, depthTest: false })
    const quad = new THREE.PlaneGeometry(2, 2)
    this.ownGeoms.push(quad)
    this.postScene.add(new THREE.Mesh(quad, this.post))
    this.setAngles(0, 0)
    this.resize()
  }

  setModel(m: Model) {
    this.vessels.clear()
    for (const s of m.segs) this.vessels.add(Object.assign(new THREE.Mesh(s.geom, this.mats[s.sys]), { userData: { sys: s.sys } }))
    ;(['L', 'R'] as Sys[]).forEach((k) => {
      const old = this.cath[k]
      if (old) {
        old.geometry.dispose()
        this.scene.remove(old)
      }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(m.catheter[k]), 160, 0.1, 8)
      const c = new THREE.Mesh(g, thickMat(bodyVert, 3))
      this.cath[k] = c
      this.scene.add(c)
    })
    this.setSystem(this.sys)
  }
  setAngles(lao: number, cra: number) {
    // Proyección geométricamente consistente: la cámara ortográfica se sitúa en el lado del
    // intensificador (d = carmDir) mirando al isocentro, con "arriba" = cabeza del paciente.
    const d = carmDir(lao, cra)
    this.camera.position.copy(d).multiplyScalar(40)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(0, 0.5, 0)
  }
  setSystem(s: Sys | 'both') {
    this.sys = s
    ;(['L', 'R'] as Sys[]).forEach((k) => {
      const on = s === 'both' || s === k
      if (this.cath[k]) this.cath[k]!.visible = s === k
      this.mats[k].uniforms.uFill.value = on ? 1e3 : -1
    })
    this.injectT0 = null
  }
  inject() {
    this.injectT0 = performance.now() / 1000
  }
  onResize() {
    const a = this.w / this.h, z = this.zoom
    Object.assign(this.camera, a >= 1 ? { left: -z * a, right: z * a, top: z, bottom: -z } : { left: -z, right: z, top: z / a, bottom: -z / a })
    this.camera.updateProjectionMatrix()
    const pr = this.renderer.getPixelRatio()
    this.rt.setSize(Math.round(this.w * pr), Math.round(this.h * pr))
    this.post.uniforms.uRes.value.set(this.w * pr, this.h * pr)
  }
  frame(t: number) {
    if (this.injectT0 !== null) {
      const fill = (t - this.injectT0) * 10 // cm de árbol por segundo
      ;(['L', 'R'] as Sys[]).forEach((k) => {
        if (this.sys === 'both' || this.sys === k) this.mats[k].uniforms.uFill.value = fill
      })
      if (fill > 1e3) this.injectT0 = null
    }
    this.post.uniforms.uTime.value = t
    const r = this.renderer
    r.setRenderTarget(this.rt)
    r.setClearColor(0x000000, 0)
    r.clear()
    r.render(this.scene, this.camera)
    r.setRenderTarget(null)
    r.render(this.postScene, this.postCam)
  }
  dispose() {
    this.rt.dispose()
    this.ownGeoms.forEach((g) => g.dispose())
    ;(['L', 'R'] as Sys[]).forEach((k) => this.cath[k]?.geometry.dispose())
    this.disposeBase(this.scene)
    this.post.dispose()
  }
}
