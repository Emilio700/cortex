import { describe, expect, it } from 'vitest'
import type { Encounter, Observation, Patient, Prescription, DocumentFile, Appointment } from '../../lib/types'
import { aNdjson, CURP_SYSTEM, exportar, fhirId, leerEntrada, LOINC, observacionesDesdeFhir, planificarImport, referencias, uuidDe, validarBundle, type Bundle } from './fhir'

const NOW = '2026-10-24T12:00:00.000Z'
const p1: Patient = {
  id: 'p1',
  nombre: 'María Fernanda',
  apellidos: 'López Ramírez',
  sexo: 'F',
  fechaNac: '1968-03-14',
  curp: 'LORM680314MDFPMR09',
  telefono: '55 1234 5678',
  email: 'maria@ejemplo.mx',
  alergias: ['Penicilina'],
  medicamentosActuales: ['Metformina 850 mg c/12 h'],
  creado: NOW,
}
const p2: Patient = {
  id: 'p2',
  nombre: 'José',
  apellidos: 'Hernández',
  sexo: 'M',
  fechaNac: '1955-11-02',
  alergias: [],
  creado: NOW,
}
const t1 = '2026-09-01T16:00:00.000Z'
const obs: Observation[] = [
  {
    id: 'o1',
    patientId: 'p1',
    fecha: t1,
    codigo: 'peso',
    valor: 80.5,
    unidad: 'kg',
    fuente: 'manual',
  },
  {
    id: 'o2',
    patientId: 'p1',
    fecha: t1,
    codigo: 'pas',
    valor: 138,
    unidad: 'mmHg',
    fuente: 'manual',
  },
  {
    id: 'o3',
    patientId: 'p1',
    fecha: t1,
    codigo: 'pad',
    valor: 86,
    unidad: 'mmHg',
    fuente: 'manual',
  },
  {
    id: 'o4',
    patientId: 'p1',
    fecha: t1,
    codigo: 'glucosa',
    valor: 142,
    unidad: 'mg/dL',
    fuente: 'ocr',
  },
  {
    id: 'o5',
    patientId: 'p1',
    fecha: t1,
    codigo: 'spo2',
    valor: 97,
    unidad: '%',
    fuente: 'manual',
  },
  {
    id: 'o6',
    patientId: 'p1',
    fecha: t1,
    codigo: 'escala',
    valor: 7,
    unidad: 'pts',
    fuente: 'escala',
    etiqueta: 'PHQ-9',
    interpretacion: 'Leve',
  },
  {
    id: 'o7',
    patientId: 'p1',
    fecha: '2026-09-02T16:00:00.000Z',
    codigo: 'pas',
    valor: 128,
    unidad: 'mmHg',
    fuente: 'manual',
  }, // sin diastólica
  {
    id: 'o8',
    patientId: 'p2',
    fecha: t1,
    codigo: 'temp',
    valor: 36.8,
    unidad: '°C',
    fuente: 'manual',
  },
]
const enc: Encounter[] = [
  {
    id: 'e1',
    patientId: 'p1',
    fecha: t1,
    plantilla: 'general',
    motivo: 'Control',
    subjetivo: 'x',
    objetivo: 'y',
    analisis: 'z',
    plan: 'w',
    diagnosticos: [
      {
        codigo: 'E11.9',
        nombre: 'Diabetes mellitus tipo 2 sin complicaciones',
      },
      { codigo: 'I10', nombre: 'Hipertensión esencial (primaria)' },
    ],
    firmada: true,
    adendas: [],
  },
]
const rx: Prescription[] = [
  {
    id: 'rx1',
    patientId: 'p1',
    fecha: t1,
    folio: 'RX-000001',
    items: [
      {
        medicamento: 'Metformina',
        presentacion: 'tab 850 mg',
        dosis: '1 tableta',
        via: 'oral',
        frecuencia: 'cada 12 h',
        duracion: '30 días',
      },
    ],
  },
]
const docs: DocumentFile[] = [
  {
    id: 'd1',
    patientId: 'p1',
    fecha: t1,
    tipo: 'laboratorio',
    nombre: 'lab.txt',
    mime: 'text/plain',
    dataUrl: 'data:text/plain;base64,SG9sYQ==',
  },
  {
    id: 'd2',
    patientId: 'p1',
    fecha: t1,
    tipo: 'estudio',
    nombre: 'rx.pdf',
    mime: 'application/pdf',
    dataUrl: '/api/files/d2',
  },
]
const citas: Appointment[] = [
  {
    id: 'a1',
    patientId: 'p1',
    inicio: '2026-10-30T15:00:00.000Z',
    fin: '2026-10-30T15:30:00.000Z',
    tipo: 'subsecuente',
    estado: 'confirmada',
    motivo: 'Control',
  },
]
const datos = {
  patients: [p1, p2],
  observations: obs,
  encounters: enc,
  prescriptions: rx,
  documents: docs,
  appointments: citas,
}

describe('exportación FHIR R4', () => {
  const { bundle } = exportar(datos, {
    ahora: NOW,
    inlineMax: 1000,
    origen: 'https://clinica.mx',
  })
  const de = (t: string) => bundle.entry.filter((e) => e.resource.resourceType === t).map((e) => e.resource)

  it('genera un Bundle válido sin referencias rotas', () => {
    const v = validarBundle(bundle)
    expect(v.errores).toEqual([])
    expect(v.advertencias).toEqual([])
    expect(v.conteo).toMatchObject({
      Patient: 2,
      Encounter: 1,
      Condition: 2,
      AllergyIntolerance: 1,
      MedicationStatement: 1,
      MedicationRequest: 1,
      DocumentReference: 2,
      Appointment: 1,
    })
  })

  it('Patient con CURP, nombre, género, nacimiento y telecom', () => {
    const pat = de('Patient')[0]
    expect(pat.identifier).toEqual([{ use: 'official', system: CURP_SYSTEM, value: 'LORM680314MDFPMR09' }])
    expect(pat.name[0]).toMatchObject({
      family: 'López Ramírez',
      given: ['María', 'Fernanda'],
    })
    expect(pat.gender).toBe('female')
    expect(pat.birthDate).toBe('1968-03-14')
    expect(pat.telecom).toEqual([
      { system: 'phone', value: '55 1234 5678', use: 'mobile' },
      { system: 'email', value: 'maria@ejemplo.mx' },
    ])
  })

  it('signos vitales con LOINC, UCUM y perfil; presión como panel 85354-9', () => {
    const os = de('Observation')
    const peso = os.find((o) => o.code.coding?.[0]?.code === '29463-7')!
    expect(peso.valueQuantity).toEqual({
      value: 80.5,
      unit: 'kg',
      system: 'http://unitsofmeasure.org',
      code: 'kg',
    })
    expect(peso.meta.profile).toEqual(['http://hl7.org/fhir/StructureDefinition/bodyweight'])
    expect(peso.category[0].coding[0].code).toBe('vital-signs')
    const bp = os.find((o) => o.code.coding?.[0]?.code === '85354-9')!
    expect(
      bp.component.map((c: { code: { coding: { code: string }[] }; valueQuantity: { value: number; code: string } }) => [
        c.code.coding[0].code,
        c.valueQuantity.value,
        c.valueQuantity.code,
      ]),
    ).toEqual([
      ['8480-6', 138, 'mm[Hg]'],
      ['8462-4', 86, 'mm[Hg]'],
    ])
    const sola = os.find((o) => o.code.coding?.[0]?.code === '8480-6')!
    expect(sola.valueQuantity.value).toBe(128)
    const spo2 = os.find((o) => o.meta?.profile?.[0]?.endsWith('oxygensat'))!
    expect(spo2.code.coding.map((c: { code: string }) => c.code)).toEqual(['2708-6', '59408-5'])
    const glu = os.find((o) => o.code.coding?.[0]?.code === '2339-0')!
    expect(glu.category[0].coding[0].code).toBe('laboratory')
    const temp = os.find((o) => o.code.coding?.[0]?.code === '8310-5')!
    expect(temp.valueQuantity.code).toBe('Cel')
  })

  it('Condition con CIE-10 ligada al Encounter', () => {
    const c = de('Condition')[0]
    expect(c.code.coding[0]).toEqual({
      system: 'http://hl7.org/fhir/sid/icd-10',
      code: 'E11.9',
      display: 'Diabetes mellitus tipo 2 sin complicaciones',
    })
    const e = de('Encounter')[0]
    expect(c.encounter.reference).toBe(bundle.entry.find((x) => x.resource === e)!.fullUrl)
    expect(e.class.code).toBe('AMB')
  })

  it('MedicationRequest, DocumentReference y Appointment', () => {
    const m = de('MedicationRequest')[0]
    expect(m).toMatchObject({
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: { text: 'Metformina tab 850 mg' },
      groupIdentifier: { value: 'RX-000001' },
    })
    expect(m.dosageInstruction[0].text).toBe('1 tableta, vía oral, cada 12 h, durante 30 días')
    const [d1, d2] = de('DocumentReference')
    expect(d1.content[0].attachment).toMatchObject({
      contentType: 'text/plain',
      data: 'SG9sYQ==',
    })
    expect(d2.content[0].attachment.url).toBe('https://clinica.mx/api/files/d2')
    expect(de('Appointment')[0]).toMatchObject({
      status: 'booked',
      participant: [{ status: 'accepted' }],
    })
  })

  it('transaction: cada entrada lleva request POST', () => {
    const { bundle: tx } = exportar(datos, { tipo: 'transaction', ahora: NOW })
    expect(tx.type).toBe('transaction')
    expect(tx.entry.every((e) => e.request?.method === 'POST' && e.request.url === e.resource.resourceType)).toBe(true)
    expect(validarBundle(tx).ok).toBe(true)
  })

  it('omite pacientes con bloqueo ARCO', () => {
    const r = exportar({ patients: [{ ...p2, bloqueado: true }], observations: obs }, { ahora: NOW })
    expect(r.bundle.entry).toHaveLength(0)
    expect(r.avisos[0]).toMatch(/ARCO/)
  })

  it('NDJSON por tipo con referencias relativas', () => {
    const nd = aNdjson(datos)
    expect(Object.keys(nd)).toEqual(expect.arrayContaining(['Patient', 'Observation', 'Condition']))
    const lineas = nd.Observation.trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lineas.every((o) => /^Patient\/[A-Za-z0-9\-.]+$/.test(o.subject.reference))).toBe(true)
  })

  it('UUID deterministas y ids válidos', () => {
    expect(uuidDe('Patient/p1')).toBe(uuidDe('Patient/p1'))
    expect(uuidDe('Patient/p1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(fhirId('a_b c')).toBe('a-b-c')
  })
})

describe('validación', () => {
  it('detecta campos obligatorios y referencias rotas', () => {
    const b: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:11111111-1111-4111-8111-111111111111',
          resource: {
            resourceType: 'Observation',
            status: 'final',
            subject: {
              reference: 'urn:uuid:22222222-2222-4222-8222-222222222222',
            },
          },
        },
        {
          fullUrl: 'urn:uuid:11111111-1111-4111-8111-111111111111',
          resource: { resourceType: 'Encounter', status: 'bogus' },
        },
      ],
    }
    const v = validarBundle(b)
    expect(v.ok).toBe(false)
    const txt = v.errores.join('\n')
    expect(txt).toMatch(/falta code/)
    expect(txt).toMatch(/falta class/)
    expect(txt).toMatch(/request\.method/)
    expect(txt).toMatch(/duplicado/)
    expect(txt).toMatch(/no existe en el Bundle/)
    expect(txt).toMatch(/status «bogus»/)
    expect(validarBundle({ resourceType: 'Patient' }).ok).toBe(false)
  })
  it('lista referencias anidadas', () => {
    expect(
      referencias({
        a: { reference: 'X/1' },
        b: [{ c: { reference: 'Y/2' } }],
      }).map((r) => r.ref),
    ).toEqual(['X/1', 'Y/2'])
  })
})

describe('importación', () => {
  it('ida y vuelta: exportar → importar conserva paciente y observaciones', () => {
    const { bundle } = exportar(datos, { ahora: NOW })
    const plan = planificarImport(leerEntrada(JSON.stringify(bundle)), {
      patients: [],
      observations: [],
    })
    expect(plan.pacientes).toHaveLength(2)
    const pm = plan.pacientes.find((p) => p.datos.curp === 'LORM680314MDFPMR09')!
    expect(pm.datos).toMatchObject({
      nombre: 'María Fernanda',
      apellidos: 'López Ramírez',
      sexo: 'F',
      fechaNac: '1968-03-14',
      telefono: '55 1234 5678',
      email: 'maria@ejemplo.mx',
    })
    expect(pm.alergias).toEqual(['Penicilina'])
    expect(pm.medicamentos).toEqual(['Metformina 850 mg c/12 h'])
    expect(pm.condiciones).toEqual(['Diabetes mellitus tipo 2 sin complicaciones (CIE-10 E11.9)', 'Hipertensión esencial (primaria) (CIE-10 I10)'])
    const clave = (o: { codigo: string; valor: number; unidad: string; fecha: string }) => `${o.codigo}|${o.valor}|${o.unidad}|${o.fecha}`
    const esperadas = obs.filter((o) => o.patientId === 'p1').map((o) => clave({ ...o, unidad: o.codigo === 'escala' ? 'pts' : o.unidad }))
    expect(pm.observaciones.map(clave).sort()).toEqual(esperadas.sort())
    expect(pm.observaciones.find((o) => o.codigo === 'escala')).toMatchObject({
      etiqueta: 'PHQ-9',
      interpretacion: 'Leve',
    })
    const pj = plan.pacientes.find((p) => p.datos.nombre === 'José')!
    expect(pj.observaciones).toEqual([{ codigo: 'temp', valor: 36.8, unidad: '°C', fecha: t1 }])
    expect(plan.omitidos).toMatchObject({
      Encounter: 1,
      DocumentReference: 2,
      Appointment: 1,
    })
  })

  it('reimportar sobre los mismos datos: coincide por CURP y no duplica observaciones', () => {
    const { bundle } = exportar(datos, { ahora: NOW })
    const plan = planificarImport(leerEntrada(JSON.stringify(bundle)), {
      patients: [p1, p2],
      observations: obs,
    })
    expect(plan.pacientes.every((p) => p.existente)).toBe(true)
    expect(plan.pacientes.reduce((n, p) => n + p.observaciones.length, 0)).toBe(0)
    expect(plan.pacientes.find((p) => p.existente?.id === 'p1')!.duplicadas).toBe(7)
    expect(plan.pacientes[0].alergias).toEqual([])
  })

  it('NDJSON también se importa', () => {
    const nd = aNdjson(datos)
    const texto = Object.values(nd).join('')
    const plan = planificarImport(leerEntrada(texto), {
      patients: [],
      observations: [],
    })
    expect(plan.pacientes).toHaveLength(2)
    expect(plan.pacientes.find((p) => p.datos.nombre === 'José')!.observaciones).toHaveLength(1)
  })

  it('Bundle estilo Synthea: unidades imperiales, alias LOINC y recursos desconocidos', () => {
    const pid = 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000001'
    const synthea = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: pid,
          resource: {
            resourceType: 'Patient',
            id: 'aaaaaaaa-0000-4000-8000-000000000001',
            identifier: [
              {
                system: 'https://github.com/synthetichealth/synthea',
                value: 'x',
              },
            ],
            name: [{ use: 'official', family: 'Ramírez123', given: ['Lucía456'] }],
            gender: 'female',
            birthDate: '1990-05-02',
          },
          request: { method: 'POST', url: 'Patient' },
        },
        {
          fullUrl: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000002',
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: { coding: [{ system: LOINC, code: '29463-7' }] },
            subject: { reference: pid },
            effectiveDateTime: '2020-01-01T10:00:00-06:00',
            valueQuantity: {
              value: 154.32,
              unit: 'lb',
              system: 'http://unitsofmeasure.org',
              code: '[lb_av]',
            },
          },
        },
        {
          fullUrl: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000003',
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: {
              coding: [{ system: LOINC, code: '18262-6', display: 'LDL Cholesterol' }],
            },
            subject: { reference: pid },
            effectiveDateTime: '2020-01-01T10:00:00-06:00',
            valueQuantity: {
              value: 110,
              unit: 'mg/dL',
              system: 'http://unitsofmeasure.org',
              code: 'mg/dL',
            },
          },
        },
        {
          fullUrl: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000004',
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: {
              coding: [{ system: LOINC, code: '72514-3', display: 'Pain severity' }],
            },
            subject: { reference: pid },
            effectiveDateTime: '2020-01-01T10:00:00-06:00',
            valueQuantity: { value: 2, unit: '{score}' },
          },
        },
        {
          fullUrl: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000005',
          resource: {
            resourceType: 'Condition',
            clinicalStatus: { coding: [{ code: 'resolved' }] },
            code: {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: '444814009',
                  display: 'Viral sinusitis (disorder)',
                },
              ],
            },
            subject: { reference: pid },
          },
        },
        {
          fullUrl: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000006',
          resource: {
            resourceType: 'Claim',
            status: 'active',
            patient: { reference: pid },
          },
        },
        {
          fullUrl: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000007',
          resource: {
            resourceType: 'MedicationRequest',
            status: 'stopped',
            intent: 'order',
            medicationCodeableConcept: { text: 'Amoxicilina' },
            subject: { reference: pid },
          },
        },
        {
          fullUrl: 'urn:uuid:aaaaaaaa-0000-4000-8000-000000000008',
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: { coding: [{ system: LOINC, code: '8310-5' }] },
            subject: { reference: pid },
            effectiveDateTime: '2020-01-01T10:00:00-06:00',
            valueQuantity: {
              value: 98.6,
              code: '[degF]',
              system: 'http://unitsofmeasure.org',
            },
          },
        },
      ],
    }
    const plan = planificarImport(leerEntrada(JSON.stringify(synthea)), {
      patients: [],
      observations: [],
    })
    const p = plan.pacientes[0]
    expect(p.datos).toMatchObject({
      nombre: 'Lucía',
      apellidos: 'Ramírez',
      sexo: 'F',
      fechaNac: '1990-05-02',
    })
    expect(p.datos.curp).toBeUndefined()
    expect(p.observaciones.map((o) => [o.codigo, o.valor, o.unidad])).toEqual([
      ['peso', 70, 'kg'],
      ['ldl', 110, 'mg/dL'],
      ['temp', 37, '°C'],
    ])
    expect(p.condiciones).toEqual(['Viral sinusitis (disorder) — resuelto'])
    expect(p.medicamentos).toEqual([])
    expect(plan.omitidos).toMatchObject({
      Claim: 1,
      'Observation (no mapeada)': 1,
      'MedicationRequest (no activa)': 1,
    })
    expect(plan.avisos.join(' ')).toMatch(/72514-3/)
  })

  it('errores de entrada claros', () => {
    expect(() => leerEntrada('')).toThrow(/No hay contenido/)
    expect(() => leerEntrada('{"a":1}')).toThrow(/resourceType/)
    expect(() => leerEntrada('{"resourceType":"Patient"}\nno-json')).toThrow(/línea 2/)
  })

  it('observaciones: anuladas y unidades incompatibles', () => {
    expect(
      observacionesDesdeFhir({
        status: 'entered-in-error',
        effectiveDateTime: NOW,
        code: { coding: [{ system: LOINC, code: '29463-7' }] },
        valueQuantity: { value: 1, code: 'kg' },
      }).motivo,
    ).toBe('anulada')
    expect(
      observacionesDesdeFhir({
        status: 'final',
        effectiveDateTime: NOW,
        code: { coding: [{ system: LOINC, code: '29463-7' }] },
        valueQuantity: { value: 1, code: 'stone' },
      }).motivo,
    ).toMatch(/unidad/)
    expect(
      observacionesDesdeFhir({
        status: 'final',
        effectiveDateTime: NOW,
        code: { coding: [{ system: LOINC, code: '2339-0' }] },
        valueQuantity: { value: 5.5, code: 'mmol/L' },
      }).obs[0].valor,
    ).toBe(99.09)
  })
})
