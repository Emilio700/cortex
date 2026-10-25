/**
 * Regenera `paridad.json` a partir del catálogo y del motor de TypeScript.
 *
 *   npx vite-node src/modules/escalas/dominio/generarParidad.ts
 *
 * Solo se corre a propósito, al cambiar una escala: el archivo resultante es
 * lo que el servidor (pytest) tiene que reproducir. Revisa el diff antes de
 * commitearlo: un puntaje que cambió sin querer se ve ahí.
 */
import { writeFileSync } from 'node:fs'
import { ESCALAS, escalaPorId } from './catalogo'
import { calcular, estructura, validar } from './motor'
import type { Respuestas } from './tipos'

const todas = (id: string, elegir: (puntos: number[]) => number): Respuestas => {
  const escala = escalaPorId(id)!
  return Object.fromEntries(
    escala.items.map((i) => {
      const puntos = i.opciones.filter((o) => o.puntos !== null).map((o) => o.puntos as number)
      const p = elegir(puntos)
      return [i.id, i.opciones.find((o) => o.puntos === p)!.codigo]
    }),
  )
}
const ceros = (id: string) => todas(id, (p) => Math.min(...p))
const maximos = (id: string) => todas(id, (p) => Math.max(...p))

/** Secciones en orden; `null` = sin responder. */
const secciones = (id: string, valores: (number | null)[]): Respuestas => {
  const ids = escalaPorId(id)!.items.map((i) => i.id)
  return Object.fromEntries(
    ids.flatMap((clave, n) => (valores[n] === null ? [] : [[clave, String(valores[n])]])),
  )
}

const CASOS: { escala: string; nota: string; respuestas: Respuestas }[] = [
  { escala: 'glasgow', nota: 'O4 V5 M6 = 15', respuestas: { ocular: '4', verbal: '5', motora: '6' } },
  { escala: 'glasgow', nota: 'O3 V4 M5 = 12, moderado', respuestas: { ocular: '3', verbal: '4', motora: '5' } },
  { escala: 'glasgow', nota: 'O2 V2 M4 = 8, grave', respuestas: { ocular: '2', verbal: '2', motora: '4' } },
  { escala: 'glasgow', nota: 'mínimo 3', respuestas: { ocular: '1', verbal: '1', motora: '1' } },
  { escala: 'glasgow', nota: 'intubado: sin total, O3 VT M5', respuestas: { ocular: '3', verbal: 'T', motora: '5' } },
  { escala: 'glasgow', nota: 'ojos cerrados por edema', respuestas: { ocular: 'C', verbal: '4', motora: '6' } },
  { escala: 'nihss', nota: 'sin déficit', respuestas: ceros('nihss') },
  { escala: 'nihss', nota: 'máximo 42', respuestas: maximos('nihss') },
  {
    escala: 'nihss',
    nota: 'hemiparesia derecha con afasia; brazo izquierdo amputado (UN cuenta 0): 1+2+3+2+2+1 = 11',
    respuestas: { ...ceros('nihss'), '1b': '1', '4': '2', '5a': 'UN', '5b': '3', '6b': '2', '9': '2', '10': '1' },
  },
  { escala: 'hunt_hess', nota: 'grado III', respuestas: { grado: 'III' } },
  { escala: 'fisher_modificada', nota: 'grado 4', respuestas: { grado: '4' } },
  { escala: 'wfns', nota: 'grado II', respuestas: { grado: 'II' } },
  { escala: 'spetzler_martin', nota: 'grado I', respuestas: { tamano: '1', elocuencia: '0', drenaje: '0' } },
  { escala: 'spetzler_martin', nota: 'grado III: mediano, elocuente, superficial', respuestas: { tamano: '2', elocuencia: '1', drenaje: '0' } },
  { escala: 'spetzler_martin', nota: 'grado V', respuestas: { tamano: '3', elocuencia: '1', drenaje: '1' } },
  { escala: 'rankin', nota: 'mRS 3', respuestas: { grado: '3' } },
  { escala: 'asia', nota: 'AIS D', respuestas: { grado: 'D' } },
  { escala: 'asia', nota: 'AIS A', respuestas: { grado: 'A' } },
  { escala: 'karnofsky', nota: 'KPS 70', respuestas: { kps: '70' } },
  { escala: 'karnofsky', nota: 'KPS 80', respuestas: { kps: '80' } },
  { escala: 'mjoa', nota: 'sin alteración: 18', respuestas: maximos('mjoa') },
  { escala: 'mjoa', nota: '4+5+2+3 = 14, moderada', respuestas: { motor_superior: '4', motor_inferior: '5', sensibilidad: '2', esfinter: '3' } },
  { escala: 'mjoa', nota: '3+4+2+2 = 11, grave', respuestas: { motor_superior: '3', motor_inferior: '4', sensibilidad: '2', esfinter: '2' } },
  { escala: 'oswestry', nota: 'todas en 5: 100 %', respuestas: maximos('oswestry') },
  { escala: 'oswestry', nota: 'Fairbank: 16 de 50 = 32 %', respuestas: secciones('oswestry', [2, 2, 2, 2, 2, 2, 2, 2, 0, 0]) },
  {
    escala: 'oswestry',
    nota: 'Fairbank: una omitida, 16 de 45 = 35.6 % (el ejemplo publicado trunca a 35.5)',
    respuestas: secciones('oswestry', [2, 2, 2, 2, 2, 2, 2, null, 2, 0]),
  },
  { escala: 'oswestry', nota: 'tres omitidas: avisa', respuestas: secciones('oswestry', [3, 3, 3, 3, 3, 3, 3, null, null, null]) },
  { escala: 'ndi', nota: '14 de 50: leve', respuestas: secciones('ndi', [2, 1, 2, 1, 2, 1, 2, 1, 1, 1]) },
  { escala: 'ndi', nota: 'una omitida: 12 en 9 secciones, prorrateado a 13.3', respuestas: secciones('ndi', [2, 1, 2, 1, 2, 1, 2, null, 1, 0]) },
  { escala: 'ndi', nota: '35: completa', respuestas: secciones('ndi', [4, 3, 4, 3, 4, 4, 4, 3, 3, 3]) },
  { escala: 'ena_dolor', nota: 'sin dolor', respuestas: { dolor: '0' } },
  { escala: 'ena_dolor', nota: '5: moderado', respuestas: { dolor: '5' } },
  { escala: 'ena_dolor', nota: '7: intenso', respuestas: { dolor: '7' } },
  { escala: 'barthel', nota: 'independiente: 100', respuestas: maximos('barthel') },
  {
    escala: 'barthel',
    nota: '60: dependencia grave',
    respuestas: { ...maximos('barthel'), traslado: '5', deamb: '5', escal: '0', banarse: '0', vestir: '5' },
  },
]

const INVALIDOS: { escala: string; nota: string; respuestas: Respuestas }[] = [
  { escala: 'glasgow', nota: 'falta la motora', respuestas: { ocular: '4', verbal: '5' } },
  { escala: 'glasgow', nota: 'opción que no existe', respuestas: { ocular: '4', verbal: '9', motora: '6' } },
  { escala: 'mjoa', nota: 'ítem ajeno', respuestas: { ...maximos('mjoa'), extra: '1' } },
  { escala: 'oswestry', nota: 'ninguna sección', respuestas: {} },
]

const salida = {
  _nota:
    'Generado por generarParidad.ts. Lo leen paridad.test.ts (vitest) y backend/tests/test_escalas_paridad.py (pytest). No lo edites a mano.',
  estructura: ESCALAS.map(estructura),
  casos: CASOS.map((c) => {
    const r = calcular(escalaPorId(c.escala)!, c.respuestas)
    return {
      ...c,
      esperado: {
        puntaje: r.puntaje,
        interpretacion: r.interpretacion,
        tono: r.tono,
        detalle: r.detalle,
        avisos: r.avisos,
      },
    }
  }),
  invalidos: INVALIDOS.map((c) => ({ ...c, errores: validar(escalaPorId(c.escala)!, c.respuestas) })),
}

writeFileSync(new URL('./paridad.json', import.meta.url), JSON.stringify(salida, null, 2) + '\n', 'utf-8')
console.log(
  `paridad.json: ${salida.estructura.length} escalas, ${salida.casos.length} casos, ${salida.invalidos.length} inválidos`,
)
