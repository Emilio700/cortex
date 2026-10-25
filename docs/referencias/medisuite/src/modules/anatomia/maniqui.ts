// Maniquí humano estilizado construido con primitivas (cápsulas y esferas). Mira hacia +Z;
// el lado derecho del paciente queda en −X. Cada malla lleva en userData.region su nombre anatómico.
import * as THREE from 'three'

export function crearManiqui(color = '#d9c2b3') {
  const g = new THREE.Group()
  g.name = 'maniqui'
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05 })
  const add = (region: string, geo: THREE.BufferGeometry, pos: [number, number, number], opts: { scale?: [number, number, number]; rotZ?: number; rotX?: number } = {}) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...pos)
    if (opts.scale) m.scale.set(...opts.scale)
    if (opts.rotZ) m.rotation.z = opts.rotZ
    if (opts.rotX) m.rotation.x = opts.rotX
    m.userData.region = region
    m.castShadow = true
    g.add(m)
    return m
  }
  const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 8, 20)
  const sph = (r: number) => new THREE.SphereGeometry(r, 28, 20)

  add('Cabeza', sph(0.105), [0, 1.63, 0], { scale: [0.88, 1.1, 1] })
  add('Cabeza', sph(0.022), [0, 1.62, 0.095]) // nariz: indica el frente
  add('Cuello', cap(0.05, 0.08), [0, 1.47, 0])
  add('Tórax', cap(0.16, 0.2), [0, 1.27, 0], { scale: [1.18, 1, 0.68] })
  add('Abdomen', cap(0.14, 0.1), [0, 1.06, 0], { scale: [1.08, 1, 0.66] })
  add('Pelvis', cap(0.15, 0.05), [0, 0.93, 0], { scale: [1.15, 1, 0.72] })

  for (const [lado, s] of [['derecho', -1], ['izquierdo', 1]] as const) {
    const fem = lado === 'derecho' ? 'derecha' : 'izquierda'
    add(`Hombro ${lado}`, sph(0.068), [0.205 * s, 1.385, 0])
    add(`Brazo ${lado}`, cap(0.052, 0.22), [0.235 * s, 1.21, 0], { rotZ: 0.08 * s })
    add(`Codo ${lado}`, sph(0.047), [0.25 * s, 1.07, 0])
    add(`Antebrazo ${lado}`, cap(0.043, 0.2), [0.262 * s, 0.93, 0.01], { rotZ: 0.05 * s })
    add(`Mano ${fem}`, sph(0.05), [0.272 * s, 0.76, 0.015], { scale: [0.55, 1.35, 0.9] })
    add(`Cadera ${fem}`, sph(0.085), [0.09 * s, 0.86, 0])
    add(`Muslo ${lado}`, cap(0.078, 0.3), [0.095 * s, 0.67, 0], { rotZ: -0.03 * s })
    add(`Rodilla ${fem}`, sph(0.062), [0.1 * s, 0.48, 0.008])
    add(`Pierna ${fem}`, cap(0.058, 0.3), [0.1 * s, 0.29, -0.005])
    add(`Tobillo ${lado}`, sph(0.042), [0.1 * s, 0.1, 0])
    add(`Pie ${lado}`, cap(0.042, 0.11), [0.1 * s, 0.045, 0.05], { rotX: Math.PI / 2, scale: [1, 1, 0.75] })
  }
  return g
}

/** Nombre de la región con su cara (anterior/posterior/lateral) según la normal del punto. */
export function nombreRegion(region: string, normal: THREE.Vector3, punto?: THREE.Vector3) {
  const { x, z } = normal
  if (['Mano derecha', 'Mano izquierda'].includes(region)) return `${region} (${z >= 0 ? 'palmar' : 'dorsal'})`
  if (region === 'Pie derecho' || region === 'Pie izquierdo') return `${region} (${normal.y > 0.3 ? 'dorso' : 'planta/talón'})`
  if (Math.abs(x) > Math.abs(z) * 1.4) {
    const lateral = (x < 0 && /derech/.test(region)) || (x > 0 && /izquierd/.test(region))
    if (/derech|izquierd/.test(region)) return `${region} (cara ${lateral ? 'lateral' : 'medial'})`
    return `${region} (lado ${x < 0 ? 'derecho' : 'izquierdo'})`
  }
  const cara = z >= 0 ? 'anterior' : 'posterior'
  const especial: Record<string, [string, string]> = {
    Tórax: ['Tórax anterior', 'Espalda alta (región dorsal)'],
    Abdomen: ['Abdomen', 'Región lumbar'],
    Pelvis: ['Pelvis / región inguinal', 'Región sacra / glúteos'],
    Cabeza: ['Cara', 'Región occipital'],
    Cuello: ['Cuello anterior', 'Nuca / región cervical'],
  }
  if (especial[region]) {
    const base = especial[region][z >= 0 ? 0 : 1]
    return ['Tórax', 'Abdomen', 'Pelvis'].includes(region) && punto && Math.abs(punto.x) > 0.05 ? `${base} (lado ${punto.x < 0 ? 'derecho' : 'izquierdo'})` : base
  }
  if (/Rodilla/.test(region)) return z >= 0 ? `${region} (anterior)` : `Hueco poplíteo ${region.split(' ')[1]}`
  if (/Pierna/.test(region)) return z >= 0 ? `${region} (región tibial)` : `Pantorrilla ${region.split(' ')[1]}`
  if (/Codo/.test(region)) return z >= 0 ? `Pliegue del codo ${region.split(' ')[1]}` : `${region} (olécranon)`
  return `${region} (${cara})`
}
