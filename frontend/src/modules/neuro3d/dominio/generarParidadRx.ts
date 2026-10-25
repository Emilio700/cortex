/**
 * Regenera `paridadRx.json` con el cálculo de TypeScript.
 *
 *   npx vite-node src/modules/neuro3d/dominio/generarParidadRx.ts
 *
 * Solo se corre a propósito, al cambiar una fórmula (y `VERSION_CALCULO_RX`). El
 * archivo es lo que el servidor (`backend/app/services/columna_rx.py`) tiene que
 * reproducir; revisa el diff antes de commitearlo.
 */
import { writeFileSync } from 'node:fs'
import { calcularRx, VERSION_CALCULO_RX, type CalibracionesRx, type MarcasRx, type OpcionesRx } from './ajusteRadiografico'
import { apSintetica, lateralSintetica, unir } from './radiografiaSintetica'

const SIN_ESCALA: CalibracionesRx = { lateral: { tipo: 'ninguna' }, ap: { tipo: 'ninguna' } }

/** Ruido determinista (sin `Math.random`): como la mano del médico, pero repetible. */
const conRuido = (m: MarcasRx, semilla: number, px = 3): MarcasRx => {
  let s = semilla
  const azar = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return (s / 2147483648 - 0.5) * 2 * px
  }
  const mover = <T extends Record<string, { x: number; y: number } | undefined>>(o: T) =>
    Object.fromEntries(Object.entries(o).map(([k, p]) => [k, p && { x: Math.round((p.x + azar()) * 10) / 10, y: Math.round((p.y + azar()) * 10) / 10 }]))
  return {
    lateral: {
      vertebras: Object.fromEntries(Object.entries(m.lateral.vertebras).map(([k, v]) => [k, mover(v)])),
      caderas: m.lateral.caderas.map((p) => ({ x: Math.round((p.x + azar()) * 10) / 10, y: Math.round((p.y + azar()) * 10) / 10 })),
    },
    ap: { vertebras: Object.fromEntries(Object.entries(m.ap.vertebras).map(([k, v]) => [k, mover(v)])) },
  } as MarcasRx
}

const curva = { T5: [0, 0], T6: [12, 10], T8: [5, 3], T10: [-5, -8], L1: [-15, -20], L2: [-8, -5] } as Record<string, [number, number]>

const CASOS: { nota: string; marcas: MarcasRx; calibraciones: CalibracionesRx; opciones?: OpcionesRx }[] = [
  { nota: 'sin marcas', marcas: { lateral: { vertebras: {}, caderas: [] }, ap: { vertebras: {} } }, calibraciones: SIN_ESCALA },
  {
    nota: 'lateral completa con lordosis 50 y pelvis',
    marcas: lateralSintetica({ platillos: { 'L1.superior': 10, 'S1.superior': -40, 'T4.superior': -20, 'T12.inferior': 20 }, pelvis: { inclinacion: 12 } }),
    calibraciones: SIN_ESCALA,
  },
  {
    nota: 'paciente mirando a la izquierda, dos caderas',
    marcas: lateralSintetica({ sentido: -1, platillos: { 'L1.superior': 4, 'S1.superior': -33 }, pelvis: { inclinacion: 20, dosCaderas: true } }),
    calibraciones: SIN_ESCALA,
  },
  {
    nota: 'listesis L5-S1 30 % con referencia de 100 mm',
    marcas: lateralSintetica({ listesis: { 'L5-S1': 0.3, 'L4-L5': -0.1 }, mmPorPx: { x: 0.25, y: 0.25 } }),
    calibraciones: { lateral: { tipo: 'referencia', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, mm: 100 }, ap: { tipo: 'ninguna' } },
  },
  {
    nota: 'DICOM con píxel no cuadrado y disco colapsado',
    marcas: lateralSintetica({ platillos: { 'L1.superior': 10, 'S1.superior': -40 }, discos: { 'L4-L5': 3 }, mmPorPx: { x: 0.1, y: 0.2 } }),
    calibraciones: { lateral: { tipo: 'dicom', mmPorPxX: 0.1, mmPorPxY: 0.2 }, ap: { tipo: 'dicom', mmPorPxX: 0.1, mmPorPxY: 0.1 } },
  },
  { nota: 'escoliosis automática', marcas: apSintetica({ platillos: curva }), calibraciones: SIN_ESCALA },
  {
    nota: 'escoliosis con vértebras elegidas y derecha del paciente a la derecha',
    marcas: apSintetica({ platillos: curva }),
    calibraciones: SIN_ESCALA,
    opciones: { derechaDelPaciente: 'derecha', cobbCoronal: { superior: 'T8', inferior: 'T10' } },
  },
  {
    nota: 'elección imposible',
    marcas: apSintetica({ platillos: curva }),
    calibraciones: SIN_ESCALA,
    opciones: { derechaDelPaciente: 'izquierda', cobbCoronal: { superior: 'L1', inferior: 'T6' } },
  },
  {
    nota: 'AP y lateral con ruido de mano',
    marcas: conRuido(
      unir(
        lateralSintetica({ platillos: { 'L1.superior': 6, 'S1.superior': -42, 'T4.superior': -15, 'T12.inferior': 18 }, listesis: { 'L4-L5': 0.18 }, pelvis: { inclinacion: 16, dosCaderas: true } }),
        apSintetica({ platillos: { T4: [2, 1], T7: [9, 7], T11: [-6, -11], L3: [-3, -2] } }),
      ),
      7,
    ),
    calibraciones: SIN_ESCALA,
  },
  {
    nota: 'ruido fuerte con DICOM',
    marcas: conRuido(lateralSintetica({ platillos: { 'S1.superior': -30 }, pelvis: { inclinacion: -4 } }), 42, 8),
    calibraciones: { lateral: { tipo: 'dicom', mmPorPxX: 0.143, mmPorPxY: 0.143 }, ap: { tipo: 'ninguna' } },
  },
]

const salida = {
  _nota:
    'Generado por generarParidadRx.ts. Lo leen paridadRx.test.ts (vitest) y backend/tests/test_columna_rx_paridad.py (pytest). No lo edites a mano.',
  version: VERSION_CALCULO_RX,
  casos: CASOS.map((c) => ({ ...c, opciones: c.opciones ?? null, esperado: calcularRx(c.marcas, c.calibraciones, c.opciones) })),
}

writeFileSync(new URL('./paridadRx.json', import.meta.url), JSON.stringify(salida, null, 2) + '\n', 'utf-8')
console.log(`paridadRx.json: ${salida.casos.length} casos`)
