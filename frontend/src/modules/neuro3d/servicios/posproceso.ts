/**
 * Posproceso del modo Realista: oclusión ambiental (GTAO) a media resolución,
 * antialias SMAA y la salida con el tone mapping del renderizador.
 *
 * La oclusión sólo mira lo opaco. La piel y el cráneo translúcidos, las vías,
 * los halos y el flujo no escriben profundidad: si entraran al pase de
 * normales, la oclusión se calcularía sobre la piel y ensuciaría lo de adentro.
 *
 * Mientras la cámara se mueve se apaga la oclusión (lo más caro); al soltar,
 * la escena pinta una vez más con todo.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

/** Lo que no debe proyectar ni recibir oclusión: lo que no escribe profundidad. */
export const esTranslucido = (o: THREE.Object3D): boolean => {
  const malla = o as THREE.Mesh
  if (!malla.isMesh) return false
  const m = malla.material as THREE.Material | THREE.Material[]
  const material = Array.isArray(m) ? m[0] : m
  if (!material) return false
  return !material.depthWrite || !material.depthTest || material.blending === THREE.AdditiveBlending || material.opacity < 0.55
}

/**
 * GTAO de three con dos cambios: trabaja a la mitad de la resolución y, en el
 * pase de normales y profundidad, oculta además lo translúcido. Los nombres
 * `_overrideVisibility` y `_restoreVisibility` son los que GTAOPass llama en
 * r186 alrededor de ese pase.
 */
class GtaoDeLoOpaco extends GTAOPass {
  private ocultos: THREE.Object3D[] = []

  _overrideVisibility() {
    this.scene.traverse((o) => {
      const linea = (o as THREE.Line).isLine || (o as THREE.Points).isPoints
      if (o.visible && (linea || esTranslucido(o))) {
        o.visible = false
        this.ocultos.push(o)
      }
    })
  }

  _restoreVisibility() {
    for (const o of this.ocultos) o.visible = true
    this.ocultos.length = 0
  }

  setSize(ancho: number, alto: number) {
    super.setSize(Math.max(1, Math.floor(ancho / 2)), Math.max(1, Math.floor(alto / 2)))
  }
}

export interface Posproceso {
  /** Pinta la escena. Con `plena` en falso (cámara en movimiento) se salta la oclusión. */
  pintar(plena: boolean): void
  ajustar(ancho: number, alto: number, proporcion: number): void
  liberar(): void
}

export const crearPosproceso = (
  renderer: THREE.WebGLRenderer,
  escena: THREE.Scene,
  camara: THREE.PerspectiveCamera,
  planos: THREE.Plane[],
): Posproceso => {
  const compositor = new EffectComposer(renderer)
  compositor.addPass(new RenderPass(escena, camara))

  const gtao = new GtaoDeLoOpaco(escena, camara, 512, 512)
  // Medidas en cm: el radio alcanza el fondo de un surco o el espacio entre
  // dos vértebras, no la cabeza entera.
  gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.1, thickness: 2.5, scale: 2.2, samples: 16, distanceFallOff: 1 })
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 })
  gtao.blendIntensity = 0.85
  // El corte también se respeta en el pase de normales; y se ven las dos caras
  // de lo cortado (el interior del encéfalo).
  gtao.normalMaterial.clippingPlanes = planos
  gtao.normalMaterial.side = THREE.DoubleSide
  compositor.addPass(gtao)

  const smaa = new SMAAPass()
  compositor.addPass(smaa)
  const salida = new OutputPass()
  compositor.addPass(salida)

  return {
    pintar(plena) {
      gtao.enabled = plena
      compositor.render()
    },
    ajustar(ancho, alto, proporcion) {
      compositor.setPixelRatio(proporcion)
      compositor.setSize(ancho, alto)
    },
    liberar() {
      gtao.dispose()
      smaa.dispose()
      salida.dispose()
      compositor.dispose()
    },
  }
}
