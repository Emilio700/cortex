// Datos demo: plan de alimentación de Roberto (p6, obesidad grado I y dislipidemia).
import type { Registro } from '../../lib/types'
import { COMIDAS, distribuir, gramosMeta, ict, icc, imc, mifflin, opcionesPorOmision, resolverEquivalentes, type ComidaId } from './nutri'

export function demoNutricion(now: number): Registro[] {
  const fecha = new Date(now - 7 * 864e5)
  const anios = (fecha.getTime() - Date.parse('1978-04-30')) / (365.25 * 864e5)
  const peso = 93.2, talla = 174, cintura = 106, cadera = 108
  const geb = mifflin('M', peso, talla, anios)
  const factor = 1.375
  const kcal = Math.round((geb * factor - 500) / 50) * 50
  const macros = { hc: 45, prot: 20, lip: 35 }
  const opciones = { ...opcionesPorOmision(kcal), aoaTipo: 'aoa-mb' }
  const eq = resolverEquivalentes(gramosMeta(kcal, macros), opciones)
  const pcts = Object.fromEntries(COMIDAS.map((c) => [c.id, c.pct])) as Record<ComidaId, number>
  const r2 = (x: number) => Math.round(x * 100) / 100
  return [
    {
      id: 'nut-demo-p6',
      patientId: 'p6',
      fecha: fecha.toISOString(),
      tipo: 'nutricion',
      estado: 'activo',
      titulo: `Plan de alimentación ${kcal} kcal (${macros.hc}/${macros.prot}/${macros.lip})`,
      datos: {
        antro: { peso: String(peso), talla: String(talla), cintura: String(cintura), cadera: String(cadera), grasa: '31.5', brazo: '35' },
        ecuacion: 'mifflin', factorId: 'ligera', factor, ajuste: -500, kcal, macros, opciones, eq, dist: distribuir(eq, pcts), pcts,
        objetivo: 'Reducir 5–10 % del peso en 6 meses; mejorar triglicéridos',
        notas: 'Agua natural 2 L al día. Preferir cereales integrales y leguminosas. Evitar bebidas azucaradas y alcohol. Caminar 30 min al día, 5 días por semana.',
        resultados: { imc: r2(imc(peso, talla)), icc: r2(icc(cintura, cadera)), ict: r2(ict(cintura, talla)), geb: r2(geb), get: r2(geb * factor) },
      },
    },
  ]
}
