// Pruebas OMS (vitest): medianas y z contra tablas OMS publicadas. Portadas de la autoprueba original.
import { describe, expect, it } from 'vitest'
import { valorEnZ, zscore, DPM, lms } from './who'

function eq(n: string, a: number | null, b: number, tol = 0.01) {
  it(n, () => {
    expect(a).not.toBeNull()
    expect(Math.abs(a! - b)).toBeLessThanOrEqual(tol)
  })
}

describe('crecimiento OMS (autoprueba portada)', () => {
// Estándares 2006 (paquete), validados contra las tablas OMS
eq('Niñas peso/edad al nacer P50', valorEnZ('wfa', 'F', 0, 0), 3.2322, 0.0001)
eq('Niños peso/edad al nacer P50', valorEnZ('wfa', 'M', 0, 0), 3.3464, 0.0001)
eq('Niños longitud/edad 12 m P50', valorEnZ('lhfa', 'M', 365, 0), 75.7, 0.05)
eq('Niñas talla/edad 60 m P50', valorEnZ('lhfa', 'F', 1826, 0), 109.4, 0.05)
eq('Niñas peso/edad 12 m −2 DE (OMS 7.0 kg)', valorEnZ('wfa', 'F', 365, -2), 7.0, 0.05)
// Referencia 2007 (5–19 a)
eq('Niños IMC/edad 61 m P50 (15.26)', valorEnZ('bfa', 'M', 61 * DPM, 0), 15.2641, 0.0001)
eq('Niñas talla/edad 19 a P50 (163.2)', valorEnZ('lhfa', 'F', 228 * DPM, 0), 163.1548, 0.0001)
eq('Niños talla/edad 10 a P50 (137.8)', valorEnZ('lhfa', 'M', 120 * DPM, 0), 137.8, 0.1)
eq('Niños peso/edad 10 a P50 (31.2)', valorEnZ('wfa', 'M', 120 * DPM, 0), 31.2, 0.1)
it('wfa > 10 a sin referencia', () => expect(lms('wfa', 'M', 130 * DPM)).toBeNull())
// z en la mediana = 0; colas restringidas
eq('z en mediana', zscore('wfa', 'F', 365, valorEnZ('wfa', 'F', 365, 0)!), 0, 1e-9)
eq('z exacto en +3 DE', zscore('wfa', 'F', 365, valorEnZ('wfa', 'F', 365, 3)!), 3, 1e-9)
{
  // Ejemplo de la OMS: z* = 3 + (y − SD3) / (SD3 − SD2)
  const sd2 = valorEnZ('wfa', 'M', 365, 2)!, sd3 = valorEnZ('wfa', 'M', 365, 3)!, y = sd3 + (sd3 - sd2) * 0.5
  eq('Cola restringida superior → 3.5', zscore('wfa', 'M', 365, y), 3.5, 1e-9)
  const n2 = valorEnZ('wfa', 'M', 365, -2)!, n3 = valorEnZ('wfa', 'M', 365, -3)!, y2 = n3 - (n2 - n3)
  eq('Cola restringida inferior → −4', zscore('wfa', 'M', 365, y2), -4, 1e-9)
}
eq('Talla sin ajuste de colas (LMS puro, L=1)', zscore('lhfa', 'M', 365, valorEnZ('lhfa', 'M', 365, 4)!), 4, 1e-9)
})
