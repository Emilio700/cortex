// Genera en un canvas un reporte de laboratorio sintético (datos ficticios) para probar el OCR.
export const FILAS_EJEMPLO: [string, string, string, string][] = [
  ['GLUCOSA', '126', 'mg/dL', '70 - 100'],
  ['HEMOGLOBINA GLUCOSILADA (HbA1c)', '7.2', '%', '4.0 - 5.6'],
  ['COLESTEROL TOTAL', '215', 'mg/dL', '< 200'],
  ['COLESTEROL HDL', '42', 'mg/dL', '> 40'],
  ['COLESTEROL LDL', '138', 'mg/dL', '< 100'],
  ['TRIGLICERIDOS', '180', 'mg/dL', '< 150'],
  ['CREATININA', '0.9', 'mg/dL', '0.6 - 1.1'],
  ['UREA', '32', 'mg/dL', '15 - 45'],
  ['ACIDO URICO', '6.8', 'mg/dL', '2.4 - 6.0'],
  ['HEMOGLOBINA', '13.8', 'g/dL', '12.0 - 15.5'],
  ['LEUCOCITOS', '7.2', 'x10^3/uL', '4.5 - 11.0'],
  ['PLAQUETAS', '250', 'x10^3/uL', '150 - 450'],
  ['TSH', '2.1', 'uUI/mL', '0.4 - 4.0'],
  ['TGP (ALT)', '48', 'U/L', '7 - 35'],
  ['SODIO', '140', 'mEq/L', '135 - 145'],
  ['POTASIO', '4.2', 'mEq/L', '3.5 - 5.1'],
]

export function reporteEjemplo(): HTMLCanvasElement {
  const W = 1700, H = 280 + FILAS_EJEMPLO.length * 64 + 120
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#111'
  g.font = 'bold 40px Arial, sans-serif'
  g.fillText('LABORATORIO CLINICO DEMO', 60, 80)
  g.font = '28px Arial, sans-serif'
  g.fillText('Paciente: PACIENTE DE PRUEBA     Fecha: 15/09/2026', 60, 130)
  g.font = 'bold 28px Arial, sans-serif'
  const cols = [60, 860, 1080, 1340]
  ;['ESTUDIO', 'RESULTADO', 'UNIDADES', 'REFERENCIA'].forEach((h, i) => g.fillText(h, cols[i], 210))
  g.fillRect(60, 225, W - 120, 3)
  g.font = '34px Arial, sans-serif'
  FILAS_EJEMPLO.forEach((f, r) => f.forEach((t, i) => g.fillText(t, cols[i], 290 + r * 64)))
  g.font = 'italic 22px Arial, sans-serif'
  g.fillText('Documento sintetico generado para demostracion. No corresponde a ningun paciente real.', 60, H - 50)
  return c
}
