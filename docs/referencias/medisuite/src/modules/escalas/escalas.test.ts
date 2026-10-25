// Pruebas de escalas (vitest). Portadas de la autoprueba original.
import { describe, expect, it } from 'vitest'
import { ESCALAS, puntuar } from './escalas'

const E = (id: string) => ESCALAS.find((e) => e.id === id)!
function eq(n: string, a: unknown, b: unknown) {
  it(n, () => expect(a).toBe(b))
}

describe('escalas (autoprueba portada)', () => {
const todos = (id: string, pick: 'max' | 'min', ctx = {}) =>
  Object.fromEntries(E(id).items(ctx).map((i) => [i.name, (pick === 'max' ? Math.max : Math.min)(...i.choices.map((c) => c[0]))]))

for (const e of ESCALAS) {
  eq(`${e.nombre} máximo`, puntuar(e, { sexo: 'M' }, todos(e.id, 'max', { sexo: 'M' })), e.max)
  eq(`${e.nombre} mínimo`, puntuar(e, { sexo: 'M' }, todos(e.id, 'min', { sexo: 'M' })), e.min)
}
eq('PHQ-9 ítem "dif" no suma', puntuar(E('phq9'), {}, { dif: 3 }), 0)
eq('PHQ-9 10 → moderada', E('phq9').banda(10, {}, {})[0], 'Depresión moderada')
eq('PHQ-9 20 → severa', E('phq9').banda(20, {}, {})[0], 'Depresión severa')
eq('GAD-7 15 → severa', E('gad7').banda(15, {}, {})[0], 'Ansiedad severa')
eq('Glasgow 8 → grave', E('glasgow').banda(8, {}, {})[1], 'danger')
eq('AUDIT-C 3 mujer positivo', E('auditc').banda(3, { sexo: 'F' }, {})[1], 'warn')
eq('AUDIT-C 3 hombre negativo', E('auditc').banda(3, { sexo: 'M' }, {})[1], 'ok')
eq('FINDRISC 15 → alto', E('findrisc').banda(15, {}, {})[0].startsWith('Riesgo alto'), true)
eq('Morse 45 → alto', E('morse').banda(45, {}, {})[1], 'danger')
eq('Braden 12 → alto', E('braden').banda(12, {}, {})[0], 'Riesgo alto')
eq('Apgar: minuto no suma', puntuar(E('apgar'), {}, { min: 5, fc: 2 }), 2)
})
