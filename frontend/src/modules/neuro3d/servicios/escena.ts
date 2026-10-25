/**
 * La escena 3D del atlas, aislada de React.
 *
 * React decide QUÉ se ve (capas, selección, marcas, vista) y llama a estos
 * métodos; aquí sólo se decide CÓMO se pinta. Al desmontar, `liberar()` suelta
 * geometrías, materiales, texturas, el contexto WebGL y los escuchas del DOM:
 * abrir y cerrar el atlas muchas veces en una jornada no puede ir dejando
 * memoria de la tarjeta gráfica atrás.
 *
 * Movimiento: con «reducir movimiento» no hay rotación automática, la cámara
 * salta a cada vista, la columna se separa sin animación, el brillo no late y
 * el flujo del polígono de Willis no se muestra.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import type { CapaEfectiva, CapaId } from '../dominio/capas'
import type { Papel } from '../dominio/conexiones'
import { suavizar, vistaPorId, type PlanoDeCorte, type VistaId } from '../dominio/vistas'
import type { TipoDeHernia } from '../dominio/columna'
import type { Acabado, CapaAnatomica, PiezaAnatomica } from './anatomia/tipos'
import { construirColumna, construirMedula, construirRaices, crearModeloColumna, geometriaDeHernia } from './anatomia/columna3d'
import { construirEncefalo } from './anatomia/encefalo'
import { construirEnvolturas } from './anatomia/envolturas'
import { construirVasos } from './anatomia/vasos'
import { construirVentriculos } from './anatomia/ventriculos'
import { desplazamientoHaciaAtlas } from './anatomia/capaPaciente'
import { construirVias } from './anatomia/vias'
import type { AjusteDelEje } from '../dominio/ajusteRadiografico'
import { hayWebGL } from './webgl'

export type TonoDeEtiqueta = 'seleccion' | 'conexion' | 'afectado'

export interface Resaltado {
  /** Mallas de lo elegido. */
  seleccion: string[]
  /** Lo que se enciende con ello (raíz → segmento, disco, vértebras). */
  conexion: { id: string; papel: Papel }[]
  /** Lo que las marcas señalan como afectado. */
  afectados: string[]
  etiquetas: { id: string; texto: string; tono: TonoDeEtiqueta }[]
  /** Atenúa el resto de la columna para que el camino resalte. */
  atenuarColumna: boolean
  /** Aclara el encéfalo para ver una estructura profunda. */
  rayosX: boolean
}

export interface HerniaEnEscena {
  disco: string
  posicion: TipoDeHernia
  lado: 'izquierdo' | 'derecho' | 'ambos'
}

export interface OpcionesDeEscena {
  contenedor: HTMLElement
  reducirMovimiento: boolean
  alSeleccionar: (id: string | null) => void
  alPasar: (id: string | null, x: number, y: number) => void
  /** La persona empezó a girar o acercar: la rotación automática se detiene. */
  alInteractuar?: () => void
  /** Se perdió el contexto WebGL (la tarjeta gráfica se reinició, p. ej.). */
  alPerderContexto?: () => void
  /**
   * Medidas del paciente desde radiografía (origen «radiografia»): la columna
   * se dobla a ellas. Sin ajuste, la columna esquemática de siempre.
   */
  ajusteColumna?: AjusteDelEje | null
}

export interface EscenaAtlas {
  aplicarCapas(capas: Record<CapaId, CapaEfectiva>): void
  fijarCorte(plano: PlanoDeCorte, posicion: number): void
  fijarDespiece(activo: boolean): void
  irAVista(id: VistaId): void
  /** Acerca la cámara a estas mallas, conservando el ángulo desde donde se mira. */
  enfocar(ids: string[]): void
  fijarResaltado(r: Resaltado): void
  fijarHernias(h: HerniaEnEscena[]): void
  fijarFlujo(activo: boolean): void
  fijarRotacion(activo: boolean): void
  fijarReducirMovimiento(activo: boolean): void
  /**
   * Pone (o quita, con `null`) las mallas del paciente. Las piezas del atlas de
   * las mismas capas se ocultan mientras tanto, sin borrarse: al quitarla, el
   * atlas vuelve igual. Resuelve cuando la capa ya está en la escena; si falla,
   * rechaza y la escena queda como estaba.
   */
  fijarCapaPaciente(capa: CapaAnatomica | null): Promise<{ piezas: number }>
  /**
   * Pone (o quita, con `null`) el atlas detallado (BodyParts3D, persona de
   * referencia). Las piezas del modelo simplificado que reemplaza (las de su
   * mismo id o las de la estructura que contiene a una pieza: el lóbulo de un
   * giro) se ocultan sin borrarse. Si falla, la escena queda como estaba.
   */
  fijarCapaAtlas(capa: CapaAnatomica | null): Promise<{ piezas: number }>
  /** PNG de lo que se ve, sin rótulos (se dibujan aparte en la captura). */
  capturar(): { dataUrl: string; ancho: number; alto: number }
  liberar(): void
}

export class SinWebGL extends Error {
  constructor() {
    super('Este equipo o navegador no puede dibujar gráficos 3D (WebGL).')
    this.name = 'SinWebGL'
  }
}

interface Registro {
  malla: THREE.Mesh
  pieza: PiezaAnatomica
  material: THREE.MeshStandardMaterial
  colorBase: THREE.Color
  emisivoBase: number
  opacidadBase: number
  capaVisible: boolean
  capaOpacidad: number
  halo?: THREE.Mesh
  flujo?: THREE.Mesh
  /** Pieza de la capa del paciente (se quita al cambiar de origen). */
  paciente?: boolean
  /** Pieza del atlas tapada por la del paciente: no se ve ni se elige. */
  oculta?: boolean
  /** Pieza del atlas detallado (se quita al volver al modelo simplificado). */
  atlas?: boolean
  /** Pieza del modelo simplificado reemplazada por el atlas detallado. */
  tapadaPorAtlas?: boolean
}

const OPACIDAD_BASE: Partial<Record<Acabado, number>> = { disco: 0.9, liquido: 0.88, envoltura: 0.5 }

export async function crearEscena(op: OpcionesDeEscena): Promise<EscenaAtlas> {
  if (!hayWebGL()) throw new SinWebGL()
  const { contenedor } = op
  let reducir = op.reducirMovimiento
  const estilo = getComputedStyle(contenedor)
  const token = (nombre: string, respaldo = '#9aa7bd') => {
    const valor = estilo.getPropertyValue(nombre).trim()
    return new THREE.Color(valor || respaldo)
  }

  // ── Renderizador, cámara y controles ─────────────────────────────────────
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    throw new SinWebGL()
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.localClippingEnabled = true
  const lienzo = renderer.domElement
  lienzo.className = 'atlas-escena__lienzo'
  lienzo.setAttribute('aria-hidden', 'true')
  contenedor.appendChild(lienzo)

  const rotulos = new CSS2DRenderer()
  rotulos.domElement.className = 'atlas-escena__rotulos'
  contenedor.appendChild(rotulos.domElement)

  const escena = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  escena.environment = entorno
  escena.environmentIntensity = 0.3

  const camara = new THREE.PerspectiveCamera(30, 1, 0.5, 700)
  camara.position.set(30, 6, 34)
  escena.add(camara)

  // Luz de estudio: principal desde arriba y adelante (viaja con la cámara),
  // contraluz frío por detrás para recortar la silueta y relleno suave.
  escena.add(new THREE.HemisphereLight(token('--cx-cian-claro', '#7dd3fc'), token('--cx-marino-700', '#0b1d45'), 0.35))
  const principal = new THREE.DirectionalLight(0xffffff, 2.6)
  principal.position.set(-16, 14, 5)
  camara.add(principal)
  const contraluz = new THREE.DirectionalLight(token('--cx-cian', '#38bdf8'), 1.4)
  contraluz.position.set(6, 10, -30)
  escena.add(contraluz)
  const relleno = new THREE.DirectionalLight(token('--cx-azul-vivo', '#2f8cff'), 0.45)
  relleno.position.set(10, -14, 18)
  camara.add(relleno)

  const controles = new OrbitControls(camara, lienzo)
  controles.enableDamping = true
  controles.dampingFactor = 0.08
  controles.minDistance = 6
  controles.maxDistance = 240
  controles.screenSpacePanning = true
  controles.autoRotateSpeed = 0.7
  controles.target.set(0, -3, -0.5)
  controles.autoRotate = !reducir
  controles.addEventListener('start', () => {
    tween = null
    if (controles.autoRotate) {
      controles.autoRotate = false
      op.alInteractuar?.()
    }
  })

  // ── Corte ────────────────────────────────────────────────────────────────
  const plano = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e5)
  const planos = [plano]

  // ── Materiales ───────────────────────────────────────────────────────────
  const colorResalte = token('--cx-anat-resalte', '#7dd3fc')
  const colorSeleccion = token('--cx-anat-seleccion', '#2f8cff')
  const colorAfectado = token('--cx-anat-afectado', '#ffb020')
  const pulso = { value: 0.9 }
  const tiempo = { value: 0 }

  /** Borde luminoso tipo Fresnel: más opaco en los bordes que de frente. */
  const conFresnel = (m: THREE.MeshStandardMaterial, potencia: number, minimo: number) => {
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float cxFresnel = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), ${potencia.toFixed(2)});
        diffuseColor.a *= mix(${minimo.toFixed(2)}, 1.0, cxFresnel);
        #include <opaque_fragment>`,
      )
    }
    m.customProgramCacheKey = () => `fresnel-${potencia}-${minimo}`
  }

  const crearMaterial = (acabado: Acabado, color: THREE.Color): THREE.MeshStandardMaterial => {
    const comun = { color, clippingPlanes: planos, side: THREE.FrontSide as THREE.Side, transparent: true }
    switch (acabado) {
      case 'organo':
        return new THREE.MeshPhysicalMaterial({
          ...comun,
          side: THREE.DoubleSide,
          roughness: 0.52,
          clearcoat: 0.35,
          clearcoatRoughness: 0.38,
          sheen: 0.25,
          sheenRoughness: 0.6,
          sheenColor: new THREE.Color(0xffffff),
        })
      case 'hueso':
        return new THREE.MeshPhysicalMaterial({ ...comun, roughness: 0.68, clearcoat: 0.12, clearcoatRoughness: 0.6 })
      case 'disco':
        return new THREE.MeshPhysicalMaterial({ ...comun, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2, transparent: true, opacity: 0.9 })
      case 'nervio':
        return new THREE.MeshPhysicalMaterial({ ...comun, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) })
      case 'vaso':
        return new THREE.MeshPhysicalMaterial({ ...comun, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15, emissive: color, emissiveIntensity: 0.22 })
      case 'liquido':
        return new THREE.MeshPhysicalMaterial({
          ...comun,
          side: THREE.DoubleSide,
          roughness: 0.12,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          emissive: color,
          emissiveIntensity: 0.32,
          transparent: true,
          opacity: 0.88,
        })
      case 'envoltura': {
        const m = new THREE.MeshStandardMaterial({ ...comun, roughness: 0.6, transparent: true, depthWrite: false, opacity: 0.5, emissive: color, emissiveIntensity: 0.18 })
        conFresnel(m, 2.2, 0.06)
        return m
      }
      case 'via':
        return new THREE.MeshStandardMaterial({
          ...comun,
          emissive: color,
          emissiveIntensity: 1.1,
          roughness: 0.5,
          transparent: true,
          opacity: 0.92,
          depthTest: false,
          depthWrite: false,
        })
      case 'lesion':
      default:
        return new THREE.MeshPhysicalMaterial({ ...comun, roughness: 0.3, clearcoat: 0.6, emissive: color, emissiveIntensity: 0.55 })
    }
  }

  /** Halo: la misma malla inflada un poco, aditiva, sólo en los bordes. Late con «pulso». */
  const crearHalo = (color: THREE.Color, grosor: number) => {
    const m = new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clippingPlanes: planos,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.cxPulso = pulso
      shader.vertexShader = shader.vertexShader.replace(
        '#include <morphtarget_vertex>',
        `#include <morphtarget_vertex>
        transformed += normalize(objectNormal) * ${grosor.toFixed(3)};`,
      )
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float cxPulso;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          `float cxBorde = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 1.4);
          float cxA = cxBorde * cxPulso;
          gl_FragColor = vec4(diffuse * cxA, cxA);`,
        )
    }
    m.customProgramCacheKey = () => `halo-${grosor}`
    return m
  }
  const halos = {
    seleccion: crearHalo(colorSeleccion, 0.14),
    conexion: crearHalo(colorResalte, 0.11),
    afectado: crearHalo(colorAfectado, 0.16),
  }

  /** Flujo: pulsos que avanzan por el vaso (o la vía) en el sentido de la sangre o del impulso. */
  const crearFlujo = (color: THREE.Color, largo: number) =>
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uTiempo: tiempo, uEscala: { value: Math.max(1, largo / 2.2) } },
      clipping: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        #include <common>
        #include <clipping_planes_pars_vertex>
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position + normal * 0.03, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
          #include <clipping_planes_vertex>
        }`,
      fragmentShader: `
        #include <clipping_planes_pars_fragment>
        uniform vec3 uColor;
        uniform float uTiempo;
        uniform float uEscala;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          #include <clipping_planes_fragment>
          float fase = fract(vUv.x * uEscala - uTiempo);
          float pulsoF = smoothstep(0.0, 0.12, fase) * (1.0 - smoothstep(0.12, 0.5, fase));
          float borde = 0.4 + 0.6 * pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.2);
          float a = pulsoF * borde * 0.85;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    })

  // ── Construcción de las capas ────────────────────────────────────────────
  const modelo = crearModeloColumna(op.ajusteColumna)
  const CAPAS_DEL_ATLAS: CapaAnatomica[] = [
    { id: 'envolturas', nombre: 'Piel y cráneo', origen: 'procedural', construir: (c) => construirEnvolturas(c.columna!) },
    { id: 'encefalo', nombre: 'Encéfalo', origen: 'procedural', construir: () => construirEncefalo() },
    { id: 'ventriculos', nombre: 'Ventrículos', origen: 'procedural', construir: () => construirVentriculos() },
    { id: 'vasos', nombre: 'Vasos', origen: 'procedural', construir: () => construirVasos() },
    { id: 'columna', nombre: 'Columna', origen: 'procedural', construir: (c) => construirColumna(c.columna!) },
    { id: 'medula', nombre: 'Médula', origen: 'procedural', construir: (c) => construirMedula(c.columna!) },
    { id: 'raices', nombre: 'Raíces', origen: 'procedural', construir: (c) => construirRaices(c.columna!) },
    { id: 'vias', nombre: 'Vías', origen: 'procedural', construir: (c) => construirVias(c.columna!) },
  ]

  const raiz = new THREE.Group()
  escena.add(raiz)
  const registros: Registro[] = []
  const porEstructura = new Map<string, Registro[]>()
  const geometriasPropias = new Set<THREE.BufferGeometry>()
  const materialesPropios = new Set<THREE.Material>()

  const agregarPieza = (pieza: PiezaAnatomica) => {
    const colorBase = token(pieza.color)
    const material = crearMaterial(pieza.acabado, colorBase.clone())
    // Sombra de cavidad horneada en la geometría (surcos del encéfalo, folias).
    if (pieza.geometria.getAttribute('color')) material.vertexColors = true
    const malla = new THREE.Mesh(pieza.geometria, material)
    malla.userData.estructura = pieza.estructura
    if (pieza.acabado === 'envoltura') malla.renderOrder = 5
    if (pieza.acabado === 'via') malla.renderOrder = 8
    raiz.add(malla)
    geometriasPropias.add(pieza.geometria)
    materialesPropios.add(material)
    const registro: Registro = {
      malla,
      pieza,
      material,
      colorBase,
      emisivoBase: material.emissiveIntensity,
      opacidadBase: OPACIDAD_BASE[pieza.acabado] ?? 1,
      capaVisible: true,
      capaOpacidad: 1,
    }
    if (pieza.acabado === 'vaso' || pieza.acabado === 'via') {
      pieza.geometria.computeBoundingSphere()
      const flujo = new THREE.Mesh(pieza.geometria, crearFlujo(colorBase.clone().lerp(new THREE.Color(0xffffff), 0.35), pieza.geometria.boundingSphere!.radius * 2))
      flujo.visible = false
      flujo.renderOrder = 9
      // Las vías se pintan por encima de todo; su flujo también.
      if (pieza.acabado === 'via') (flujo.material as THREE.ShaderMaterial).depthTest = false
      flujo.raycast = () => {}
      materialesPropios.add(flujo.material as THREE.Material)
      malla.add(flujo)
      registro.flujo = flujo
    }
    registros.push(registro)
    if (pieza.estructura) {
      if (!porEstructura.has(pieza.estructura)) porEstructura.set(pieza.estructura, [])
      porEstructura.get(pieza.estructura)!.push(registro)
    }
  }

  /** Agrega una capa a la escena: la del atlas o, en el futuro, la del paciente. */
  const agregarCapa = async (capa: CapaAnatomica) => {
    const piezas = await capa.construir({ columna: modelo })
    piezas.forEach(agregarPieza)
  }
  for (const capa of CAPAS_DEL_ATLAS) {
    await agregarCapa(capa)
    // Deja respirar al navegador entre capas: la pantalla de carga sigue viva.
    await new Promise((r) => setTimeout(r, 0))
  }

  /** Lo elegible por id: sin las piezas del atlas ocultas, con las del paciente primero. */
  const reindexar = () => {
    porEstructura.clear()
    const orden = [...registros.filter((r) => r.paciente), ...registros.filter((r) => !r.paciente)]
    for (const r of orden) {
      if (r.oculta || r.tapadaPorAtlas) continue
      // Una pieza del atlas detallado también responde por lo que la contiene:
      // enfocar o rotular «Lóbulo frontal» usa sus giros.
      for (const id of [r.pieza.estructura, r.pieza.parteDe]) {
        if (!id) continue
        if (!porEstructura.has(id)) porEstructura.set(id, [])
        porEstructura.get(id)!.push(r)
      }
    }
  }

  const quitarAtlas = () => {
    for (let i = registros.length - 1; i >= 0; i--) {
      const r = registros[i]
      r.tapadaPorAtlas = false
      if (!r.atlas) continue
      r.malla.removeFromParent()
      r.pieza.geometria.dispose()
      r.material.dispose()
      if (r.flujo) (r.flujo.material as THREE.Material).dispose()
      geometriasPropias.delete(r.pieza.geometria)
      materialesPropios.delete(r.material)
      registros.splice(i, 1)
    }
  }

  const quitarPaciente = () => {
    for (let i = registros.length - 1; i >= 0; i--) {
      const r = registros[i]
      if (r.oculta) r.oculta = false
      if (!r.paciente) continue
      r.malla.removeFromParent()
      r.pieza.geometria.dispose()
      r.material.dispose()
      geometriasPropias.delete(r.pieza.geometria)
      materialesPropios.delete(r.material)
      registros.splice(i, 1)
    }
  }

  const centroDe = (g: THREE.BufferGeometry) => {
    if (!g.boundingBox) g.computeBoundingBox()
    return g.boundingBox!.getCenter(new THREE.Vector3())
  }
  let ultimasCapas: Record<CapaId, CapaEfectiva> | null = null
  let turnoPaciente = 0
  let turnoAtlas = 0

  // ── Estado visual ────────────────────────────────────────────────────────
  let resaltado: Resaltado = { seleccion: [], conexion: [], afectados: [], etiquetas: [], atenuarColumna: false, rayosX: false }
  let hover: string | null = null
  let despiece = 0
  let despieceDestino = 0
  let flujo = false
  const etiquetas = new Map<string, { objeto: CSS2DObject; registro: Registro }>()
  const herniasMallas: THREE.Mesh[] = []
  let sucio = true

  /**
   * Todos los materiales nacen transparentes y se quedan así: cambiar
   * `transparent` obliga a recompilar el sombreador, y el pelado lo haría en
   * cada cuadro. Lo opaco se distingue sólo por escribir profundidad.
   */
  const fijarTransparencia = (m: THREE.Material, opacidad: number, forzar = false) => {
    m.opacity = opacidad
    m.depthWrite = forzar ? false : opacidad > 0.55
  }

  const refrescar = () => {
    const sel = new Set(resaltado.seleccion)
    const con = new Map(resaltado.conexion.map((c) => [c.id, c.papel]))
    const afe = new Set(resaltado.afectados)
    for (const r of registros) {
      // Un giro del atlas se enciende cuando se elige (o se marca) su lóbulo.
      const padre = r.pieza.parteDe
      const id = padre && (sel.has(padre) || con.has(padre) || afe.has(padre)) ? padre : r.pieza.estructura
      const capa = r.pieza.capa
      let opacidad = r.opacidadBase * r.capaOpacidad
      const involucrada = id !== undefined && (sel.has(id) || con.has(id) || afe.has(id))
      if (resaltado.atenuarColumna && !involucrada && (capa === 'columna' || capa === 'medula' || capa === 'raices')) {
        opacidad *= capa === 'columna' ? 0.2 : 0.3
      }
      if (resaltado.rayosX && !involucrada && capa === 'encefalo') opacidad *= 0.18
      const visible = r.capaVisible && !r.oculta && !r.tapadaPorAtlas && opacidad > 0.01
      r.malla.visible = visible
      if (r.pieza.acabado === 'envoltura' || r.pieza.acabado === 'via') {
        fijarTransparencia(r.material, opacidad, true)
      } else {
        fijarTransparencia(r.material, opacidad)
      }

      let emisivo = r.colorBase
      let intensidad = r.emisivoBase
      let halo: keyof typeof halos | null = null
      if (id && afe.has(id)) {
        emisivo = colorAfectado
        intensidad = 0.65
        halo = 'afectado'
      } else if (id && sel.has(id)) {
        emisivo = colorSeleccion
        intensidad = 0.6
        halo = 'seleccion'
      } else if (id && con.has(id)) {
        const papel = con.get(id)
        emisivo = papel === 'disco-que-cruza' ? colorSeleccion : colorResalte
        intensidad = papel === 'vertebra' ? 0.22 : 0.5
        halo = papel === 'vertebra' ? null : 'conexion'
      } else if (id && id === hover) {
        emisivo = colorResalte
        intensidad = 0.35
      }
      r.material.emissive.copy(emisivo)
      r.material.emissiveIntensity = intensidad

      if (halo && visible) {
        if (!r.halo) {
          r.halo = new THREE.Mesh(r.malla.geometry, halos[halo])
          r.halo.raycast = () => {}
          r.halo.renderOrder = 7
          if (r.malla.morphTargetInfluences) r.halo.morphTargetInfluences = r.malla.morphTargetInfluences
          r.malla.add(r.halo)
        }
        r.halo.material = halos[halo]
        r.halo.visible = true
      } else if (r.halo) {
        r.halo.visible = false
      }
      if (r.flujo) r.flujo.visible = flujo && !reducir && visible && r.capaOpacidad > 0.2
    }
    for (const h of herniasMallas) {
      const disco = h.parent as THREE.Mesh | null
      h.visible = Boolean(disco?.visible)
    }
    sucio = true
  }

  const posicionDeEtiqueta = (r: Registro, destino: THREE.Vector3) => {
    const ancla = r.pieza.ancla
    if (!ancla) {
      r.malla.geometry.computeBoundingSphere()
      destino.copy(r.malla.geometry.boundingSphere!.center)
      if (r.pieza.desplazamientoDespiece) destino.addScaledVector(r.pieza.desplazamientoDespiece, despiece)
      return destino
    }
    destino.copy(ancla)
    if (r.pieza.anclaDespiece) destino.lerp(r.pieza.anclaDespiece, despiece)
    return destino
  }

  const rehacerEtiquetas = () => {
    for (const { objeto } of etiquetas.values()) {
      objeto.element.remove()
      raiz.remove(objeto)
    }
    etiquetas.clear()
    for (const e of resaltado.etiquetas) {
      const r = porEstructura.get(e.id)?.[0]
      if (!r || etiquetas.has(e.id)) continue
      const div = document.createElement('div')
      div.className = `atlas-rotulo atlas-rotulo--${e.tono}`
      div.textContent = e.texto
      const objeto = new CSS2DObject(div)
      objeto.center.set(0, 0.5)
      posicionDeEtiqueta(r, objeto.position)
      raiz.add(objeto)
      etiquetas.set(e.id, { objeto, registro: r })
    }
  }

  const aplicarDespiece = () => {
    for (const r of registros) {
      if (r.pieza.desplazamientoDespiece) r.malla.position.copy(r.pieza.desplazamientoDespiece).multiplyScalar(despiece)
      if (r.pieza.despiezaPorForma && r.malla.morphTargetInfluences) r.malla.morphTargetInfluences[0] = despiece
    }
    for (const { objeto, registro } of etiquetas.values()) posicionDeEtiqueta(registro, objeto.position)
    sucio = true
  }

  // ── Interacción ──────────────────────────────────────────────────────────
  const rayo = new THREE.Raycaster()
  const puntero = new THREE.Vector2()
  let presion: { x: number; y: number } | null = null
  let ultimoPuntero: { x: number; y: number } | null = null
  let buscarHover = false

  const tocables = () =>
    registros
      .filter((r) => r.pieza.estructura && r.malla.visible && r.pieza.acabado !== 'envoltura' && r.material.opacity > 0.12)
      .map((r) => r.malla)
      .concat(herniasMallas.filter((h) => h.visible))

  const elegirEn = (x: number, y: number): string | null => {
    const caja = lienzo.getBoundingClientRect()
    puntero.set(((x - caja.left) / caja.width) * 2 - 1, -((y - caja.top) / caja.height) * 2 + 1)
    rayo.setFromCamera(puntero, camara)
    const choques = rayo.intersectObjects(tocables(), false)
    for (const c of choques) {
      // Un corte deja ver lo de adentro: lo que quedó del otro lado del plano no cuenta.
      if (plano.distanceToPoint(c.point) < 0) continue
      return (c.object.userData.estructura as string | undefined) ?? null
    }
    return null
  }

  const alMover = (e: PointerEvent) => {
    ultimoPuntero = { x: e.clientX, y: e.clientY }
    buscarHover = true
  }
  const alBajar = (e: PointerEvent) => {
    presion = { x: e.clientX, y: e.clientY }
  }
  const alSubir = (e: PointerEvent) => {
    if (!presion) return
    const movido = Math.hypot(e.clientX - presion.x, e.clientY - presion.y)
    presion = null
    if (movido > 5) return
    op.alSeleccionar(elegirEn(e.clientX, e.clientY))
  }
  const alSalir = () => {
    ultimoPuntero = null
    if (hover !== null) {
      hover = null
      refrescar()
      op.alPasar(null, 0, 0)
    }
  }
  lienzo.addEventListener('pointermove', alMover)
  lienzo.addEventListener('pointerdown', alBajar)
  lienzo.addEventListener('pointerup', alSubir)
  lienzo.addEventListener('pointerleave', alSalir)

  const alPerder = (e: Event) => {
    e.preventDefault()
    op.alPerderContexto?.()
  }
  lienzo.addEventListener('webglcontextlost', alPerder)

  // ── Tamaño ───────────────────────────────────────────────────────────────
  const ajustar = () => {
    const ancho = Math.max(1, contenedor.clientWidth)
    const alto = Math.max(1, contenedor.clientHeight)
    renderer.setSize(ancho, alto, false)
    rotulos.setSize(ancho, alto)
    camara.aspect = ancho / alto
    camara.updateProjectionMatrix()
    sucio = true
  }
  const observador = new ResizeObserver(ajustar)
  observador.observe(contenedor)
  ajustar()

  // ── Cámara ───────────────────────────────────────────────────────────────
  let tween: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; inicio: number; duracion: number } | null = null

  // ── Ciclo ────────────────────────────────────────────────────────────────
  let cuadro = 0
  let anterior = performance.now()
  let despieceInicio = 0
  let despieceDesde = 0
  const pintar = (ahora: number) => {
    cuadro = requestAnimationFrame(pintar)
    if (document.hidden) return
    const dt = Math.min(0.1, (ahora - anterior) / 1000)
    anterior = ahora

    if (tween) {
      const k = suavizar((ahora - tween.inicio) / tween.duracion)
      camara.position.lerpVectors(tween.p0, tween.p1, k)
      controles.target.lerpVectors(tween.t0, tween.t1, k)
      if (k >= 1) tween = null
      sucio = true
    }
    if (despiece !== despieceDestino) {
      const k = suavizar((ahora - despieceInicio) / 900)
      despiece = despieceDesde + (despieceDestino - despieceDesde) * k
      if (k >= 1) despiece = despieceDestino
      aplicarDespiece()
    }
    if (controles.update(dt)) sucio = true

    const hayHalo = resaltado.seleccion.length + resaltado.conexion.length + resaltado.afectados.length > 0
    if (!reducir && hayHalo) {
      // Un latido lento, para que lo encendido se encuentre sin buscarlo.
      pulso.value = 0.75 + 0.35 * Math.sin(ahora / 520)
      sucio = true
    } else if (pulso.value !== 0.9) {
      pulso.value = 0.9
      sucio = true
    }
    if (flujo && !reducir) {
      tiempo.value += dt * 0.55
      sucio = true
    }

    if (buscarHover && ultimoPuntero && !presion) {
      buscarHover = false
      const id = elegirEn(ultimoPuntero.x, ultimoPuntero.y)
      if (id !== hover) {
        hover = id
        refrescar()
      }
      op.alPasar(id, ultimoPuntero.x, ultimoPuntero.y)
      lienzo.style.cursor = id ? 'pointer' : 'grab'
    }

    if (sucio) {
      sucio = false
      renderer.render(escena, camara)
      rotulos.render(escena, camara)
    }
  }
  cuadro = requestAnimationFrame(pintar)

  const alCambiarVisibilidad = () => {
    anterior = performance.now()
    sucio = true
  }
  document.addEventListener('visibilitychange', alCambiarVisibilidad)

  refrescar()

  // ── API ──────────────────────────────────────────────────────────────────
  return {
    aplicarCapas(capas) {
      ultimasCapas = capas
      for (const r of registros) {
        const c = capas[r.pieza.capa]
        r.capaVisible = c.visible
        r.capaOpacidad = c.opacidad
      }
      refrescar()
    },

    fijarCorte(tipo, posicion) {
      if (tipo === 'sagital') plano.set(new THREE.Vector3(1, 0, 0), -posicion)
      else if (tipo === 'axial') plano.set(new THREE.Vector3(0, -1, 0), posicion)
      else if (tipo === 'coronal') plano.set(new THREE.Vector3(0, 0, -1), posicion)
      else plano.set(new THREE.Vector3(1, 0, 0), 1e5)
      sucio = true
    },

    fijarDespiece(activo) {
      const destino = activo ? 1 : 0
      if (destino === despieceDestino) return
      if (reducir) {
        despiece = despieceDestino = destino
        aplicarDespiece()
        return
      }
      despieceDesde = despiece
      despieceDestino = destino
      despieceInicio = performance.now()
    },

    irAVista(id) {
      const v = vistaPorId(id)
      const p1 = new THREE.Vector3(...v.posicion)
      const t1 = new THREE.Vector3(...v.objetivo)
      controles.autoRotate = false
      if (reducir) {
        tween = null
        camara.position.copy(p1)
        controles.target.copy(t1)
        controles.update()
        sucio = true
        return
      }
      tween = { p0: camara.position.clone(), p1, t0: controles.target.clone(), t1, inicio: performance.now(), duracion: 750 }
    },

    enfocar(ids) {
      const caja = new THREE.Box3()
      const parcial = new THREE.Box3()
      for (const id of ids) {
        for (const r of porEstructura.get(id) ?? []) {
          r.malla.geometry.computeBoundingBox()
          parcial.copy(r.malla.geometry.boundingBox!)
          if (r.pieza.desplazamientoDespiece) parcial.translate(r.pieza.desplazamientoDespiece.clone().multiplyScalar(despieceDestino))
          caja.union(parcial)
        }
      }
      if (caja.isEmpty()) return
      const centro = caja.getCenter(new THREE.Vector3())
      const radio = Math.max(4, caja.getSize(new THREE.Vector3()).length() / 2)
      const distancia = Math.min(controles.maxDistance, (radio / Math.sin(THREE.MathUtils.degToRad(camara.fov / 2))) * 0.9)
      const direccion = camara.position.clone().sub(controles.target).normalize()
      const p1 = centro.clone().addScaledVector(direccion, distancia)
      controles.autoRotate = false
      if (reducir) {
        camara.position.copy(p1)
        controles.target.copy(centro)
        controles.update()
        sucio = true
        return
      }
      tween = { p0: camara.position.clone(), p1, t0: controles.target.clone(), t1: centro, inicio: performance.now(), duracion: 750 }
    },

    fijarResaltado(r) {
      resaltado = r
      rehacerEtiquetas()
      refrescar()
    },

    fijarHernias(lista) {
      for (const h of herniasMallas) {
        h.removeFromParent()
        h.geometry.dispose()
      }
      herniasMallas.length = 0
      for (const h of lista) {
        const disco = porEstructura.get(`disco-${h.disco}`)?.[0]
        const geo = geometriaDeHernia(modelo, h.disco, h.posicion, h.lado)
        if (!disco || !geo) continue
        const mat = crearMaterial('lesion', colorAfectado.clone())
        materialesPropios.add(mat)
        const malla = new THREE.Mesh(geo, mat)
        malla.userData.estructura = `disco-${h.disco}`
        disco.malla.add(malla)
        herniasMallas.push(malla)
      }
      refrescar()
    },

    fijarFlujo(activo) {
      flujo = activo
      refrescar()
    },

    fijarRotacion(activo) {
      controles.autoRotate = activo && !reducir
      sucio = true
    },

    fijarReducirMovimiento(activo) {
      reducir = activo
      if (activo) {
        controles.autoRotate = false
        tween = null
        if (despiece !== despieceDestino) {
          despiece = despieceDestino
          aplicarDespiece()
        }
      }
      refrescar()
    },

    async fijarCapaPaciente(capa) {
      const turno = ++turnoPaciente
      // Se construye antes de tocar la escena: si el archivo falla, lo que se
      // ve no cambia.
      const piezas = capa ? await capa.construir({ columna: modelo }) : []
      if (turno !== turnoPaciente) {
        for (const p of piezas) p.geometria.dispose()
        return { piezas: 0 }
      }
      quitarPaciente()
      if (piezas.length > 0) {
        // Alineación: los centros de las vértebras en común caen donde están
        // las del atlas (sólo se traslada; la forma y el tamaño son los suyos).
        const centrosPaciente = new Map<string, THREE.Vector3>()
        for (const p of piezas) if (p.estructura) centrosPaciente.set(p.estructura, centroDe(p.geometria))
        const centrosAtlas = new Map<string, THREE.Vector3>()
        const cajaAtlas = new THREE.Box3()
        for (const r of registros) {
          if (r.pieza.capa !== 'columna') continue
          if (r.pieza.estructura) centrosAtlas.set(r.pieza.estructura, centroDe(r.pieza.geometria))
          cajaAtlas.union(r.pieza.geometria.boundingBox ?? new THREE.Box3().setFromBufferAttribute(r.pieza.geometria.getAttribute('position') as THREE.BufferAttribute))
        }
        const d = desplazamientoHaciaAtlas(centrosPaciente, centrosAtlas, cajaAtlas.isEmpty() ? new THREE.Vector3() : cajaAtlas.getCenter(new THREE.Vector3()))
        const capasDelPaciente = new Set(piezas.map((p) => p.capa))
        for (const r of registros) if (capasDelPaciente.has(r.pieza.capa)) r.oculta = true
        const desde = registros.length
        for (const p of piezas) {
          p.geometria.translate(d.x, d.y, d.z)
          p.geometria.computeBoundingBox()
          p.geometria.computeBoundingSphere()
          agregarPieza(p)
        }
        for (const r of registros.slice(desde)) {
          r.paciente = true
          if (ultimasCapas) {
            r.capaVisible = ultimasCapas[r.pieza.capa].visible
            r.capaOpacidad = ultimasCapas[r.pieza.capa].opacidad
          }
        }
      }
      reindexar()
      rehacerEtiquetas()
      refrescar()
      return { piezas: piezas.length }
    },

    async fijarCapaAtlas(capa) {
      const turno = ++turnoAtlas
      // El atlas se alinea con las piezas del modelo simplificado (también con
      // las que ya tapaba, si se vuelve a poner).
      const procedurales = new Map<string, PiezaAnatomica[]>()
      for (const r of registros) {
        if (r.paciente || r.atlas || !r.pieza.estructura) continue
        if (!procedurales.has(r.pieza.estructura)) procedurales.set(r.pieza.estructura, [])
        procedurales.get(r.pieza.estructura)!.push(r.pieza)
      }
      // Se construye antes de tocar la escena: si el archivo falla, lo que se ve no cambia.
      const piezas = capa ? await capa.construir({ columna: modelo, procedurales }) : []
      if (turno !== turnoAtlas) {
        for (const p of piezas) p.geometria.dispose()
        return { piezas: 0 }
      }
      quitarAtlas()
      if (piezas.length > 0) {
        const reemplaza = new Set<string>()
        for (const p of piezas) {
          if (p.estructura) reemplaza.add(p.estructura)
          if (p.parteDe) reemplaza.add(p.parteDe)
        }
        for (const r of registros) if (!r.paciente && r.pieza.estructura && reemplaza.has(r.pieza.estructura)) r.tapadaPorAtlas = true
        const desde = registros.length
        piezas.forEach(agregarPieza)
        for (const r of registros.slice(desde)) {
          r.atlas = true
          if (ultimasCapas) {
            r.capaVisible = ultimasCapas[r.pieza.capa].visible
            r.capaOpacidad = ultimasCapas[r.pieza.capa].opacidad
          }
        }
      }
      reindexar()
      // Las hernias cuelgan del disco que se ve (el del atlas o el simplificado).
      for (const h of herniasMallas) porEstructura.get(h.userData.estructura as string)?.[0]?.malla.add(h)
      rehacerEtiquetas()
      refrescar()
      return { piezas: piezas.length }
    },

    capturar() {
      renderer.render(escena, camara)
      return { dataUrl: lienzo.toDataURL('image/png'), ancho: lienzo.width, alto: lienzo.height }
    },

    liberar() {
      cancelAnimationFrame(cuadro)
      observador.disconnect()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      lienzo.removeEventListener('pointermove', alMover)
      lienzo.removeEventListener('pointerdown', alBajar)
      lienzo.removeEventListener('pointerup', alSubir)
      lienzo.removeEventListener('pointerleave', alSalir)
      lienzo.removeEventListener('webglcontextlost', alPerder)
      controles.dispose()
      for (const { objeto } of etiquetas.values()) objeto.element.remove()
      etiquetas.clear()
      for (const h of herniasMallas) h.geometry.dispose()
      for (const g of geometriasPropias) g.dispose()
      for (const m of materialesPropios) m.dispose()
      for (const m of Object.values(halos)) m.dispose()
      entorno.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      lienzo.remove()
      rotulos.domElement.remove()
    },
  }
}
