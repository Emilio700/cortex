// Bundle de ejemplo (paciente ficticio, al estilo de Synthea) para probar la importación sin archivos externos.
import { exportar, type Bundle } from './fhir'

export function bundleEjemplo(now = Date.now()): Bundle {
  const dia = 864e5
  const iso = (t: number) => new Date(t).toISOString()
  const obs = [0, 90, 180, 270].flatMap((h, i) => {
    const f = iso(now - h * dia)
    return [
      { id: `ej-peso-${i}`, patientId: 'ej1', fecha: f, codigo: 'peso', valor: 88 + i * 1.2, unidad: 'kg', fuente: 'manual' as const },
      { id: `ej-pas-${i}`, patientId: 'ej1', fecha: f, codigo: 'pas', valor: 128 + i * 3, unidad: 'mmHg', fuente: 'manual' as const },
      { id: `ej-pad-${i}`, patientId: 'ej1', fecha: f, codigo: 'pad', valor: 82 + i, unidad: 'mmHg', fuente: 'manual' as const },
      { id: `ej-glu-${i}`, patientId: 'ej1', fecha: f, codigo: 'glucosa', valor: 118 + i * 4, unidad: 'mg/dL', fuente: 'ocr' as const },
    ]
  })
  const { bundle } = exportar(
    {
      patients: [
        {
          id: 'ej1',
          nombre: 'Tomás',
          apellidos: 'Ejemplo Prueba',
          sexo: 'M',
          fechaNac: '1975-07-21',
          telefono: '55 0000 0000',
          alergias: ['Polen'],
          medicamentosActuales: ['Enalapril 10 mg c/24 h'],
          creado: iso(now),
        },
      ],
      observations: obs,
      encounters: [
        {
          id: 'ej-enc',
          patientId: 'ej1',
          fecha: iso(now - 90 * dia),
          plantilla: 'general',
          motivo: 'Revisión',
          subjetivo: '',
          objetivo: '',
          analisis: '',
          plan: '',
          diagnosticos: [{ codigo: 'R73.0', nombre: 'Anormalidades en la prueba de tolerancia a la glucosa' }],
          firmada: true,
          adendas: [],
        },
      ],
    },
    { tipo: 'transaction' },
  )
  // un recurso que MediSuite no importa (se reporta como omitido)
  bundle.entry.push({
    fullUrl: 'urn:uuid:00000000-0000-4000-8000-0000000000c1',
    resource: { resourceType: 'Claim', id: 'ej-claim', status: 'active', patient: { reference: bundle.entry[0].fullUrl } },
    request: { method: 'POST', url: 'Claim' },
  })
  return bundle
}
