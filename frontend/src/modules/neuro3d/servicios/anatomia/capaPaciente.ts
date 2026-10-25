/**
 * La capa del paciente: las mallas que el segmentador armó desde su TC.
 *
 * El GLB viene en **milímetros** y en el sistema del paciente **LPS** (+x
 * izquierda, +y posterior, +z superior), y lo declara en
 * `asset.extras.cortex`. La escena del atlas va en centímetros con +x izquierda,
 * +y arriba y +z adelante (ver `vistas.ts`). La conversión es un giro y una
 * escala, sin espejo: los triángulos conservan su sentido.
 *
 * Cada malla trae como nombre el id del catálogo (`vertebra-L5`, `sacro`,
 * `medula-espinal`). Con eso la escena la registra igual que la del atlas, y
 * tocar la raíz L5 enciende la vértebra L5 **del paciente**. Lo que no está en
 * el catálogo (el conducto, que es una aproximación) entra como decorativo: se
 * ve, pero no se elige.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { CapaId } from '../../dominio/capas'
import { estructuraPorId } from '../../dominio/catalogo'
import type { Acabado, CapaAnatomica, PiezaAnatomica } from './tipos'

export const ID_CAPA_PACIENTE = 'paciente-tc'

/** LPS (mm) → escena (cm): x = L/10, y = S/10, z = −P/10. */
export const LPS_A_ESCENA = new THREE.Matrix4().set(
  0.1, 0, 0, 0,
  0, 0, 0.1, 0,
  0, -0.1, 0, 0,
  0, 0, 0, 1,
)

export interface MetaDelModelo {
  motor?: string
  version_motor?: string
  sintetico?: boolean
  region?: string
}

export class ModeloInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ModeloInvalido'
  }
}

interface Apariencia {
  capa: CapaId
  color: string
  acabado: Acabado
}

const apariencia = (id: string): Apariencia => {
  if (id.startsWith('vertebra-') || id === 'sacro') return { capa: 'columna', color: '--cx-anat-hueso', acabado: 'hueso' }
  if (id === 'medula-espinal') return { capa: 'medula', color: '--cx-anat-medula', acabado: 'nervio' }
  if (id === 'conducto-vertebral') return { capa: 'medula', color: '--cx-anat-lcr', acabado: 'liquido' }
  return { capa: 'columna', color: '--cx-anat-hueso', acabado: 'hueso' }
}

const leer = (datos: ArrayBuffer): Promise<{ escena: THREE.Object3D; extras: Record<string, unknown> }> =>
  new Promise((resolver, rechazar) => {
    new GLTFLoader().parse(
      datos,
      '',
      (gltf) => {
        const asset = (gltf.parser.json as { asset?: { extras?: Record<string, unknown> } }).asset
        resolver({ escena: gltf.scene, extras: (asset?.extras?.cortex as Record<string, unknown>) ?? {} })
      },
      () => rechazar(new ModeloInvalido('El archivo del modelo está dañado.')),
    )
  })

/**
 * Las piezas del paciente, ya en el sistema de la escena. No alinea con el
 * atlas: eso lo hace la escena (`alinearConAtlas`), que es quien conoce la
 * columna esquemática.
 */
export async function piezasDesdeGlb(datos: ArrayBuffer): Promise<{ piezas: PiezaAnatomica[]; meta: MetaDelModelo }> {
  const { escena, extras } = await leer(datos)
  // Sin unidades y sistema declarados no se dibuja: un modelo en metros o en
  // RAS se vería del tamaño o del lado equivocado, y nadie lo notaría.
  if (extras.unidades !== 'mm' || extras.sistema !== 'LPS') {
    throw new ModeloInvalido('El modelo no declara milímetros y coordenadas del paciente (LPS); no se muestra para no deformarlo.')
  }
  const piezas: PiezaAnatomica[] = []
  escena.updateMatrixWorld(true)
  escena.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (!malla.isMesh) return
    const id = malla.name || malla.parent?.name || ''
    const geometria = (malla.geometry as THREE.BufferGeometry).clone()
    geometria.applyMatrix4(malla.matrixWorld)
    geometria.applyMatrix4(LPS_A_ESCENA)
    if (!geometria.getAttribute('normal')) geometria.computeVertexNormals()
    geometria.computeBoundingBox()
    geometria.computeBoundingSphere()
    const { capa, color, acabado } = apariencia(id)
    piezas.push({
      // Sólo lo que está en el catálogo se puede elegir y resaltar.
      estructura: estructuraPorId(id) ? id : undefined,
      capa,
      geometria,
      color,
      acabado,
    })
    // Se guarda el id original aunque no esté en el catálogo, para depurar.
    geometria.userData.idDelSegmentador = id
  })
  if (piezas.length === 0) throw new ModeloInvalido('El modelo no trae ninguna estructura.')
  return {
    piezas,
    meta: {
      motor: typeof extras.motor === 'string' ? extras.motor : undefined,
      version_motor: typeof extras.version_motor === 'string' ? extras.version_motor : undefined,
      sintetico: extras.sintetico === true,
      region: typeof extras.region === 'string' ? extras.region : undefined,
    },
  }
}

/** Una `CapaAnatomica` con las mallas de un GLB del segmentador. */
export function crearCapaPaciente(datos: ArrayBuffer, nombre = 'Columna del paciente (TC)'): CapaAnatomica {
  return {
    id: ID_CAPA_PACIENTE,
    nombre,
    origen: 'paciente',
    construir: async () => (await piezasDesdeGlb(datos)).piezas,
  }
}

/**
 * Cuánto mover las piezas del paciente para que su columna caiga donde está la
 * del atlas: la diferencia entre los centros de las estructuras que tienen las
 * dos (vértebras en común). Sólo traslada; la escala ya es la real (cm), y la
 * forma no se toca. Sin estructuras en común, centra la del paciente sobre el
 * centro del atlas.
 */
export function desplazamientoHaciaAtlas(
  centrosPaciente: Map<string, THREE.Vector3>,
  centrosAtlas: Map<string, THREE.Vector3>,
  centroDelAtlas: THREE.Vector3,
): THREE.Vector3 {
  const comunes = [...centrosPaciente.keys()].filter((id) => centrosAtlas.has(id))
  const promedio = (ids: string[], mapa: Map<string, THREE.Vector3>) =>
    ids.reduce((s, id) => s.add(mapa.get(id)!), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, ids.length))
  if (comunes.length > 0) return promedio(comunes, centrosAtlas).sub(promedio(comunes, centrosPaciente))
  const todos = [...centrosPaciente.keys()]
  if (todos.length === 0) return new THREE.Vector3()
  return centroDelAtlas.clone().sub(promedio(todos, centrosPaciente))
}
