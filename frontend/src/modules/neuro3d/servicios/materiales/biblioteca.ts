/**
 * Biblioteca de materiales por tejido del modo Realista.
 *
 * API para las capas (también las futuras del tramo ATLAS):
 *
 *   const biblioteca = crearBibliotecaDeTejidos({ leerToken, planos })
 *   const material = biblioteca.materialDePieza(pieza)   // o .material(tejido, op)
 *   …
 *   biblioteca.liberar()   // texturas compartidas; cada material lo libera su dueño
 *
 * Cada pieza recibe su propio material (el resaltado cambia el emisivo de cada
 * una); las texturas de relieve se comparten. El relieve se proyecta en
 * triplanar desde la posición de la malla: las mallas del paciente (TC) y las
 * esferas deformadas del encéfalo no traen UV y aun así se ven con poro.
 *
 * Todos los materiales nacen transparentes (como en Estándar): cambiar
 * `transparent` recompila el sombreador y el pelado lo haría en cada cuadro.
 */
import * as THREE from 'three'
import { TEJIDOS, tejidoDePieza, type DatosDeTejido, type Relieve, type Tejido } from './tejidos'
import { crearTexturaDeRelieve } from './texturas'

export interface OpcionesDeBiblioteca {
  /** Lee un token de color del DOM (`--cx-anat-real-*`), con su respaldo. */
  leerToken: (nombre: string, respaldo: string) => THREE.Color
  /** Planos de corte que comparten todos los materiales. */
  planos?: THREE.Plane[]
  anisotropia?: number
}

export interface OpcionesDeMaterial {
  /** Color de la pieza: sólo lo usan los tejidos sin color propio (vías, lesiones). */
  colorDePieza?: THREE.Color
  /** La geometría trae color por vértice (sombra de los surcos). */
  colorPorVertice?: boolean
}

export interface BibliotecaDeTejidos {
  material(tejido: Tejido, op?: OpcionesDeMaterial): THREE.MeshPhysicalMaterial
  materialDePieza(pieza: DatosDeTejido & { color?: string; geometria?: THREE.BufferGeometry }, colorDePieza?: THREE.Color): THREE.MeshPhysicalMaterial
  /** El color base de un tejido (para rótulos, leyendas o pruebas). */
  color(tejido: Tejido, colorDePieza?: THREE.Color): THREE.Color
  liberar(): void
}

/** Fragmentos GLSL del relieve triplanar (sin UV: proyecta en los tres ejes). */
const VERTICE_DECLARA = `#include <common>
varying vec3 vCxPos;
varying vec3 vCxNormal;`
const VERTICE_CALCULA = `#include <skinning_vertex>
vCxPos = transformed;
vCxNormal = objectNormal;`

const FRAGMENTO_DECLARA = `#include <common>
uniform sampler2D cxRelieve;
uniform float cxEscala;
uniform float cxFuerza;
uniform float cxVarRugosidad;
uniform float cxVarColor;
uniform mat3 normalMatrix;
varying vec3 vCxPos;
varying vec3 vCxNormal;
vec4 cxTriplanar(vec3 p, vec3 n, out vec3 nObjeto) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= max(w.x + w.y + w.z, 1e-4);
  vec4 tx = texture2D(cxRelieve, p.zy * cxEscala);
  vec4 ty = texture2D(cxRelieve, p.xz * cxEscala + 0.37);
  vec4 tz = texture2D(cxRelieve, p.xy * cxEscala + 0.71);
  vec3 nx = vec3((tx.xy * 2.0 - 1.0) * cxFuerza, 1.0);
  vec3 ny = vec3((ty.xy * 2.0 - 1.0) * cxFuerza, 1.0);
  vec3 nz = vec3((tz.xy * 2.0 - 1.0) * cxFuerza, 1.0);
  // Mezcla «whiteout»: la normal de cada proyección se suma a la de la malla.
  nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x);
  ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y);
  nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
  nObjeto = normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
  return tx * w.x + ty * w.y + tz * w.z;
}`
const FRAGMENTO_MUESTRA = `#include <color_fragment>
vec3 cxNormalObjeto = normalize(vCxNormal);
vec4 cxMuestra = cxTriplanar(vCxPos, cxNormalObjeto, cxNormalObjeto);
diffuseColor.rgb *= 1.0 - cxVarColor * (cxMuestra.a - 0.5) * 2.0;`
const FRAGMENTO_RUGOSIDAD = `float roughnessFactor = roughness;
roughnessFactor = clamp(roughnessFactor * (1.0 + cxVarRugosidad * (cxMuestra.a - 0.5) * 2.0), 0.04, 1.0);`
const FRAGMENTO_NORMAL = `#include <normal_fragment_maps>
{
  vec3 cxN = normalize(normalMatrix * cxNormalObjeto);
  #ifdef DOUBLE_SIDED
    cxN *= faceDirection;
  #endif
  normal = cxN;
}`

/** Borde luminoso: más opaco en los bordes que de frente (piel y cráneo). */
const FRAGMENTO_FRESNEL = (potencia: number, minimo: number) => `float cxFresnel = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), ${potencia.toFixed(2)});
diffuseColor.a *= mix(${minimo.toFixed(2)}, 1.0, cxFresnel);
#include <opaque_fragment>`

export const crearBibliotecaDeTejidos = (op: OpcionesDeBiblioteca): BibliotecaDeTejidos => {
  const texturas = new Map<Exclude<Relieve, 'liso'>, THREE.DataTexture>()
  const textura = (r: Exclude<Relieve, 'liso'>) => {
    let t = texturas.get(r)
    if (!t) {
      t = crearTexturaDeRelieve(r, op.anisotropia ?? 1)
      texturas.set(r, t)
    }
    return t
  }
  const colores = new Map<Tejido, THREE.Color>()

  const color = (tejido: Tejido, colorDePieza?: THREE.Color) => {
    const def = TEJIDOS[tejido]
    if (!def.color) return (colorDePieza ?? new THREE.Color(def.respaldo)).clone()
    let c = colores.get(tejido)
    if (!c) {
      c = op.leerToken(def.color, def.respaldo)
      colores.set(tejido, c)
    }
    return c.clone()
  }

  const material = (tejido: Tejido, mo: OpcionesDeMaterial = {}): THREE.MeshPhysicalMaterial => {
    const def = TEJIDOS[tejido]
    const base = color(tejido, mo.colorDePieza)
    const m = new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: def.rugosidad,
      metalness: 0,
      clearcoat: def.clearcoat,
      clearcoatRoughness: def.clearcoatRugosidad,
      sheen: def.sheen,
      sheenRoughness: 0.55,
      sheenColor: def.sheenColor ? op.leerToken(def.sheenColor, '#ffffff') : new THREE.Color(0xffffff),
      emissive: base.clone(),
      emissiveIntensity: def.emisivo,
      transparent: true,
      opacity: def.opacidad,
      side: def.dobleCara ? THREE.DoubleSide : THREE.FrontSide,
      clippingPlanes: op.planos ?? null,
      vertexColors: Boolean(mo.colorPorVertice),
    })
    m.name = `tejido:${tejido}`
    m.userData.tejido = tejido
    if (tejido === 'via') {
      // Las vías esquemáticas se pintan por encima de todo, como en Estándar.
      m.depthTest = false
      m.depthWrite = false
    }
    if (def.fresnel) {
      m.depthWrite = false
      const { potencia, minimo } = def.fresnel
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', FRAGMENTO_FRESNEL(potencia, minimo))
      }
      m.customProgramCacheKey = () => `cx-fresnel-${potencia}-${minimo}`
      return m
    }
    if (def.relieve !== 'liso' && def.fuerzaRelieve > 0) {
      const uniformes = {
        cxRelieve: { value: textura(def.relieve) },
        cxEscala: { value: def.escalaRelieve },
        cxFuerza: { value: def.fuerzaRelieve },
        cxVarRugosidad: { value: def.variacionRugosidad },
        cxVarColor: { value: def.variacionColor },
      }
      m.userData.relieve = uniformes
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniformes)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', VERTICE_DECLARA)
          .replace('#include <skinning_vertex>', VERTICE_CALCULA)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', FRAGMENTO_DECLARA)
          .replace('#include <color_fragment>', FRAGMENTO_MUESTRA)
          .replace('#include <roughnessmap_fragment>', FRAGMENTO_RUGOSIDAD)
          .replace('#include <normal_fragment_maps>', FRAGMENTO_NORMAL)
      }
      m.customProgramCacheKey = () => `cx-relieve-${def.relieve}`
    }
    return m
  }

  return {
    material,
    materialDePieza(pieza, colorDePieza) {
      return material(tejidoDePieza(pieza), {
        colorDePieza,
        colorPorVertice: Boolean(pieza.geometria?.getAttribute('color')),
      })
    },
    color,
    liberar() {
      for (const t of texturas.values()) t.dispose()
      texturas.clear()
    },
  }
}
