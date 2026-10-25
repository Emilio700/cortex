/**
 * El servicio del volumen con Cornerstone simulado: que avise el progreso de
 * las dos fases, que una descarga fallida no deje archivos colgados, que un
 * volumen con cortes sin decodificar no se pinte y que al salir se suelte todo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cs = vi.hoisted(() => {
  const escuchas = new Map<string, Set<(e: Event) => void>>()
  return {
    escuchas,
    cargar: vi.fn(),
    descargar: vi.fn(),
    crearVolumen: vi.fn(),
    quitarVolumen: vi.fn(),
    destruirMotor: vi.fn(),
    destruirGrupo: vi.fn(),
    cargaDelVolumen: { framesLoaded: 0 } as { framesLoaded: number },
    disparar(tipo: string, detalle: unknown) {
      for (const f of escuchas.get(tipo) ?? []) f({ detail: detalle } as unknown as Event)
    },
  }
})

vi.mock('@cornerstonejs/core', () => ({
  CONSTANTS: {
    VIEWPORT_PRESETS: [{ name: 'CT-Bone', colorTransfer: '4 0 0 0 0', scalarOpacity: '2 0 0' }],
  },
  Enums: { ViewportType: { VOLUME_3D: 'volume3d' } },
  canRenderFloatTextures: () => true,
  cornerstoneStreamingImageVolumeLoader: () => undefined,
  cache: {
    getVolumeLoadObject: () => ({}),
    removeVolumeLoadObject: cs.quitarVolumen,
  },
  eventTarget: {
    addEventListener: (t: string, f: (e: Event) => void) => {
      if (!cs.escuchas.has(t)) cs.escuchas.set(t, new Set())
      cs.escuchas.get(t)!.add(f)
    },
    removeEventListener: (t: string, f: (e: Event) => void) => cs.escuchas.get(t)?.delete(f),
  },
  volumeLoader: {
    registerVolumeLoader: () => undefined,
    createAndCacheVolume: cs.crearVolumen,
  },
  RenderingEngine: class {
    enableElement() {}
    destroy() {
      cs.destruirMotor()
    }
    getViewport() {
      return {
        setVolumes: () => Promise.resolve(),
        setProperties: () => undefined,
        render: () => undefined,
        resetCamera: () => undefined,
        getDefaultActor: () => undefined,
      }
    }
  },
}))

vi.mock('@cornerstonejs/dicom-image-loader', () => ({
  default: { wadouri: { dataSetCacheManager: { load: cs.cargar, unload: cs.descargar } } },
}))

vi.mock('@cornerstonejs/tools', () => ({
  ToolGroupManager: {
    createToolGroup: () => ({ addViewport: () => undefined, addTool: () => undefined }),
    getToolGroup: () => ({ setToolActive: () => undefined, setToolPassive: () => undefined }),
    destroyToolGroup: cs.destruirGrupo,
  },
  Enums: {},
}))

vi.mock('@kitware/vtk.js/Common/DataModel/Plane', () => ({ default: { newInstance: () => ({}) } }))
vi.mock('./cornerstone', () => ({ HERRAMIENTAS: { rotar3d: 'Trackball', desplazar: 'Pan', zoom: 'Zoom' } }))
vi.mock('./estudiosApi', () => ({ urlAbsoluta: (r: string) => `http://api${r}` }))

import { FalloDeVolumen, crearVolumen3D, explicarFallo, type Progreso } from './volumen3d'
import type { ManifiestoSerie } from '../dominio/tipos'

const manifiesto = (n: number): ManifiestoSerie => ({
  series_instance_uid: '1',
  series_number: 1,
  modality: 'CT',
  series_description: null,
  sequence_label: null,
  sequence_detected_by: null,
  ordered_by: 'position',
  instances: Array.from({ length: n }, (_, i) => ({
    sop_instance_uid: String(i),
    instance_number: i,
    position: [0, 0, i],
    orientation: [1, 0, 0, 0, 1, 0],
    rows: 64,
    columns: 64,
    path: '',
    bytes: 1,
    url: `/c/${i}`,
  })),
})

const volumenQueCarga = (cargados: (total: number) => number) => (volumeId: string, { imageIds }: { imageIds: string[] }) =>
  Promise.resolve({
    imageData: { getBounds: () => [0, 1, 0, 1, 0, 1] },
    load: (cb: (e: unknown) => void) => {
      cs.disparar('CORNERSTONE_IMAGE_VOLUME_MODIFIED', { volumeId, framesProcessed: imageIds.length })
      cb({ success: true, framesLoaded: cargados(imageIds.length) })
    },
  })

beforeEach(() => {
  vi.clearAllMocks()
  cs.escuchas.clear()
  cs.cargar.mockResolvedValue({})
})

describe('crearVolumen3D', () => {
  it('avisa la descarga y el armado, con un corte de cada dos al decimar', async () => {
    cs.crearVolumen.mockImplementation(volumenQueCarga((n) => n))
    const avances: Progreso[] = []
    const elemento = document.createElement('div')
    const volumen = await crearVolumen3D({
      elemento,
      manifiesto: manifiesto(10),
      decimado: 2,
      preajuste: 'hueso',
      alProgreso: (p) => avances.push(p),
    })
    expect(cs.cargar).toHaveBeenCalledTimes(5)
    expect(cs.cargar).toHaveBeenCalledWith('http://api/c/0', undefined, 'wadouri:http://api/c/0')
    expect(avances.filter((p) => p.fase === 'descargando').at(-1)).toEqual({ fase: 'descargando', hechos: 5, total: 5 })
    expect(avances.at(-1)).toEqual({ fase: 'armando', hechos: 5, total: 5 })

    volumen.destruir()
    expect(cs.quitarVolumen).toHaveBeenCalledTimes(1)
    expect(cs.descargar).toHaveBeenCalledTimes(5)
    expect(cs.destruirMotor).toHaveBeenCalled()
    expect(cs.destruirGrupo).toHaveBeenCalled()
  })

  it('si un corte no se descarga, falla con un mensaje claro y suelta lo descargado', async () => {
    cs.cargar.mockImplementation((url: string) =>
      url.endsWith('/3') ? Promise.reject({ request: { status: 500 } }) : Promise.resolve({})
    )
    await expect(
      crearVolumen3D({ elemento: document.createElement('div'), manifiesto: manifiesto(6), decimado: 1, preajuste: 'hueso' })
    ).rejects.toThrow(/No se pudo descargar uno de los cortes/)
    expect(cs.crearVolumen).not.toHaveBeenCalled()
    expect(cs.descargar.mock.calls.length).toBeGreaterThan(0)
  })

  it('si faltan cortes por decodificar no pinta un volumen con huecos', async () => {
    cs.crearVolumen.mockImplementation(volumenQueCarga((n) => n - 2))
    const fallo = await crearVolumen3D({
      elemento: document.createElement('div'),
      manifiesto: manifiesto(6),
      decimado: 1,
      preajuste: 'hueso',
    }).catch((e) => e)
    expect(fallo).toBeInstanceOf(FalloDeVolumen)
    expect(fallo.message).toMatch(/2 cortes no se pudieron decodificar/)
    expect(fallo.sugerirReducir).toBe(true)
    expect(cs.quitarVolumen).toHaveBeenCalled()
  })
})

describe('explicarFallo', () => {
  it('la memoria agotada sugiere reducir la resolución', () => {
    const f = explicarFallo(new RangeError('Array buffer allocation failed'))
    expect(f.message).toMatch(/Se agotó la memoria/)
    expect(f.sugerirReducir).toBe(true)
  })

  it('un fallo de WebGL lo dice', () => {
    expect(explicarFallo(new Error('WebGL texture too large')).message).toMatch(/tarjeta gráfica/)
  })
})
