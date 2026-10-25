/**
 * La escena en modo Realista, sin GPU: el renderizador y el posproceso se
 * sustituyen y se revisa lo que la escena arma. Que cada pieza (también las del
 * paciente) lleve el material de su tejido, que Estándar siga sin posproceso y
 * que al salir se libere todo. Lo que se dibuja se revisa a mano en el navegador.
 */
import * as THREE from 'three'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const posproceso = vi.hoisted(() => ({
  escena: null as THREE.Scene | null,
  pintar: vi.fn(),
  ajustar: vi.fn(),
  liberar: vi.fn(),
  crear: vi.fn(),
}))

vi.mock('three', async (importOriginal) => {
  const real = await importOriginal<typeof import('three')>()
  /** Lo mínimo del renderizador que usa la escena; no dibuja nada. */
  class RenderizadorFalso {
    domElement = Object.assign(document.createElement('canvas'), { toDataURL: () => 'data:image/png;base64,' })
    capabilities = { getMaxAnisotropy: () => 8 }
    toneMapping = 0
    toneMappingExposure = 1
    localClippingEnabled = false
    setPixelRatio() {}
    getPixelRatio() {
      return 1
    }
    setClearColor() {}
    setSize() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  class PmremFalso {
    fromScene() {
      return { texture: new real.Texture() }
    }
    dispose() {}
  }
  return { ...real, WebGLRenderer: RenderizadorFalso, PMREMGenerator: PmremFalso }
})
vi.mock('./webgl', () => ({ hayWebGL: () => true }))
vi.mock('./posproceso', () => ({
  crearPosproceso: (...args: unknown[]) => {
    posproceso.crear(...args)
    posproceso.escena = args[1] as THREE.Scene
    return { pintar: posproceso.pintar, ajustar: posproceso.ajustar, liberar: posproceso.liberar }
  },
}))

import { crearEscena, type EscenaAtlas } from './escena'

const tejidosPorEstructura = (escena: THREE.Scene) => {
  const mapa = new Map<string, string | undefined>()
  escena.traverse((o) => {
    const m = o as THREE.Mesh
    const id = m.userData?.estructura as string | undefined
    if (!m.isMesh || !id || mapa.has(id)) return
    mapa.set(id, (m.material as THREE.Material).userData?.tejido)
  })
  return mapa
}

const abrir = (calidad: 'estandar' | 'realista') =>
  crearEscena({
    contenedor: document.createElement('div'),
    reducirMovimiento: true,
    alSeleccionar: () => {},
    alPasar: () => {},
    calidad,
    camara: { posicion: [10, 2, 30], objetivo: [0, 1, 0] },
  })

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  posproceso.escena = null
  Object.values(posproceso).forEach((f) => typeof f === 'function' && (f as ReturnType<typeof vi.fn>).mockClear())
})

describe('escena en modo Realista', () => {
  let escena: EscenaAtlas
  let escena3d: THREE.Scene

  it('cada estructura lleva el material de su tejido y hay posproceso', async () => {
    escena = await abrir('realista')
    expect(escena.calidad).toBe('realista')
    expect(posproceso.crear).toHaveBeenCalledTimes(1)
    escena3d = posproceso.escena!
    const tejidos = tejidosPorEstructura(escena3d)
    expect(tejidos.get('vertebra-L5')).toBe('hueso')
    expect(tejidos.get('sacro')).toBe('hueso')
    expect(tejidos.get('disco-L4-L5')).toBe('disco')
    expect(tejidos.get('lobulo-frontal-izq')).toBe('corteza')
    expect(tejidos.get('protuberancia')).toBe('sustancia-blanca')
    expect(tejidos.get('carotida-interna-izq')).toBe('arteria')
    expect(tejidos.get('seno-sagital-superior')).toBe('vena')
    expect(tejidos.get('yugular-interna-der')).toBe('vena')
    expect(tejidos.get('raiz-L5-der')).toBe('nervio')
    expect(tejidos.get('segmento-L5')).toBe('medula')
    expect(tejidos.get('piel')).toBe('piel')
    // La cámara de la escena anterior se conserva.
    const camara = escena.camara()
    camara.posicion.forEach((v, i) => expect(v).toBeCloseTo([10, 2, 30][i], 1))
    camara.objetivo.forEach((v, i) => expect(v).toBeCloseTo([0, 1, 0][i], 1))
  }, 120_000)

  it('las mallas del paciente (TC) toman el material de su tejido por id', async () => {
    const caja = new THREE.BoxGeometry(3, 2, 3)
    caja.translate(0, -50, 1)
    const r = await escena.fijarCapaPaciente({
      id: 'paciente-tc',
      nombre: 'Columna del paciente (TC)',
      origen: 'paciente',
      construir: () => [{ estructura: 'vertebra-L5', capa: 'columna', color: '--cx-anat-hueso', acabado: 'hueso', geometria: caja }],
    })
    expect(r.piezas).toBe(1)
    let material: THREE.MeshPhysicalMaterial | null = null
    escena3d.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry === caja) material = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial
    })
    expect(material).not.toBeNull()
    expect(material!.userData.tejido).toBe('hueso')
    expect(material!.userData.relieve).toBeDefined()
  })

  it('la captura usa el posproceso completo y al salir se libera', () => {
    escena.capturar()
    expect(posproceso.pintar).toHaveBeenLastCalledWith(true)
    escena.liberar()
    expect(posproceso.liberar).toHaveBeenCalledTimes(1)
  })
})

describe('escena en modo Estándar', () => {
  it('no arma posproceso ni materiales por tejido', async () => {
    const escena = await abrir('estandar')
    expect(escena.calidad).toBe('estandar')
    expect(posproceso.crear).not.toHaveBeenCalled()
    escena.liberar()
  }, 120_000)
})
