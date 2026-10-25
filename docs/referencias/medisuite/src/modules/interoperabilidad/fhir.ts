// Mapeo puro MediSuite ⇄ HL7 FHIR R4 (4.0.1). Sin React ni store.
//
// Referencias:
// - FHIR R4: https://hl7.org/fhir/R4/ (Bundle, Patient, Encounter, Condition, Observation, AllergyIntolerance,
//   MedicationRequest, MedicationStatement, DocumentReference, Appointment).
// - Perfil de signos vitales R4: https://hl7.org/fhir/R4/observation-vitalsigns.html (códigos LOINC y unidades UCUM obligatorias).
// - LOINC: https://loinc.org · UCUM: https://ucum.org · CIE-10 OMS: sistema http://hl7.org/fhir/sid/icd-10
// - FHIR Bulk Data (NDJSON): https://hl7.org/fhir/uv/bulkdata/
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Appointment, DocumentFile, Encounter, Observation, Patient, Prescription } from '../../lib/types'

export type Json = Record<string, any>
export interface FhirResource extends Json {
  resourceType: string
  id?: string
}
export interface BundleEntry {
  fullUrl?: string
  resource: FhirResource
  request?: { method: string; url: string }
}
export interface Bundle {
  resourceType: 'Bundle'
  id?: string
  type: 'collection' | 'transaction' | 'batch' | 'searchset' | 'document' | 'message' | 'history' | 'transaction-response' | 'batch-response'
  timestamp?: string
  meta?: Json
  entry: BundleEntry[]
}

// ---------- Sistemas de codificación ----------
export const LOINC = 'http://loinc.org'
export const UCUM = 'http://unitsofmeasure.org'
export const ICD10 = 'http://hl7.org/fhir/sid/icd-10'
/**
 * CURP. (verificar) No se pudo confirmar en el registro de OIDs de HL7 que 2.16.840.1.113883.4.629 corresponda a la CURP,
 * así que se usa un URI legible de la fuente oficial (RENAPO en gob.mx). Ajustar cuando la DGIS publique el sistema oficial.
 */
export const CURP_SYSTEM = 'https://www.gob.mx/curp'
export const CURP_OID_CANDIDATO = 'urn:oid:2.16.840.1.113883.4.629'
/** Sistema local para códigos de MediSuite sin equivalente LOINC (escalas, ROM, cintura…). */
export const LOCAL_OBS = 'urn:medisuite:obs'
const OBS_CAT = 'http://terminology.hl7.org/CodeSystem/observation-category'
const ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
const COND_CAT = 'http://terminology.hl7.org/CodeSystem/condition-category'
const ALLERGY_CLINICAL = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical'
const SD = 'http://hl7.org/fhir/StructureDefinition/'

export const CURP_RE =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/

interface MapaObs {
  loinc: { code: string; display: string }[]
  ucum: string // código UCUM
  categoria: 'vital-signs' | 'laboratory'
  perfil?: string // StructureDefinition del perfil de signos vitales R4
}

/** Código interno → LOINC/UCUM. Los vitales siguen el perfil «Vital Signs» de FHIR R4. */
export const OBS_FHIR: Record<string, MapaObs> = {
  peso: {
    loinc: [{ code: '29463-7', display: 'Body weight' }],
    ucum: 'kg',
    categoria: 'vital-signs',
    perfil: 'bodyweight',
  },
  talla: {
    loinc: [{ code: '8302-2', display: 'Body height' }],
    ucum: 'cm',
    categoria: 'vital-signs',
    perfil: 'bodyheight',
  },
  imc: {
    loinc: [{ code: '39156-5', display: 'Body mass index (BMI) [Ratio]' }],
    ucum: 'kg/m2',
    categoria: 'vital-signs',
    perfil: 'bmi',
  },
  pas: {
    loinc: [{ code: '8480-6', display: 'Systolic blood pressure' }],
    ucum: 'mm[Hg]',
    categoria: 'vital-signs',
  },
  pad: {
    loinc: [{ code: '8462-4', display: 'Diastolic blood pressure' }],
    ucum: 'mm[Hg]',
    categoria: 'vital-signs',
  },
  fc: {
    loinc: [{ code: '8867-4', display: 'Heart rate' }],
    ucum: '/min',
    categoria: 'vital-signs',
    perfil: 'heartrate',
  },
  fr: {
    loinc: [{ code: '9279-1', display: 'Respiratory rate' }],
    ucum: '/min',
    categoria: 'vital-signs',
    perfil: 'resprate',
  },
  temp: {
    loinc: [{ code: '8310-5', display: 'Body temperature' }],
    ucum: 'Cel',
    categoria: 'vital-signs',
    perfil: 'bodytemp',
  },
  spo2: {
    loinc: [
      { code: '2708-6', display: 'Oxygen saturation in Arterial blood' },
      {
        code: '59408-5',
        display: 'Oxygen saturation in Arterial blood by Pulse oximetry',
      },
    ],
    ucum: '%',
    categoria: 'vital-signs',
    perfil: 'oxygensat',
  },
  'perimetro-cefalico': {
    loinc: [{ code: '9843-4', display: 'Head Occipital-frontal circumference' }],
    ucum: 'cm',
    categoria: 'vital-signs',
    perfil: 'headcircum',
  },
  glucosa: {
    loinc: [{ code: '2339-0', display: 'Glucose [Mass/volume] in Blood' }],
    ucum: 'mg/dL',
    categoria: 'laboratory',
  },
  hba1c: {
    loinc: [{ code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' }],
    ucum: '%',
    categoria: 'laboratory',
  },
  colesterol: {
    loinc: [
      {
        code: '2093-3',
        display: 'Cholesterol [Mass/volume] in Serum or Plasma',
      },
    ],
    ucum: 'mg/dL',
    categoria: 'laboratory',
  },
  trigliceridos: {
    loinc: [
      {
        code: '2571-8',
        display: 'Triglyceride [Mass/volume] in Serum or Plasma',
      },
    ],
    ucum: 'mg/dL',
    categoria: 'laboratory',
  },
  hdl: {
    loinc: [
      {
        code: '2085-9',
        display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
      },
    ],
    ucum: 'mg/dL',
    categoria: 'laboratory',
  },
  ldl: {
    loinc: [
      {
        code: '13457-7',
        display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation',
      },
    ],
    ucum: 'mg/dL',
    categoria: 'laboratory',
  },
  creatinina: {
    loinc: [
      {
        code: '2160-0',
        display: 'Creatinine [Mass/volume] in Serum or Plasma',
      },
    ],
    ucum: 'mg/dL',
    categoria: 'laboratory',
  },
  hemoglobina: {
    loinc: [{ code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' }],
    ucum: 'g/dL',
    categoria: 'laboratory',
  },
}

/** LOINC → código interno al importar (incluye alias habituales, p. ej. los de Synthea). */
const LOINC_IMPORT: Record<string, string> = {
  '3141-9': 'peso', // Body weight Measured
  '8331-1': 'temp', // Oral temperature
  '2710-2': 'spo2', // SpO2 capillary by oximetry
  '2345-7': 'glucosa', // Glucose serum/plasma
  '15074-8': 'glucosa', // Glucose [Moles/volume] in Blood
  '17856-6': 'hba1c', // HbA1c by HPLC
  '18262-6': 'ldl', // LDL direct
  '2089-1': 'ldl', // LDL
  '38483-4': 'creatinina', // Creatinine in Blood
}
for (const [cod, m] of Object.entries(OBS_FHIR)) for (const l of m.loinc) LOINC_IMPORT[l.code] ??= cod

const BP_PANEL = '85354-9' // Blood pressure panel with all children optional
const BP_PANEL_ALIAS = ['85354-9', '55284-4']

/** Unidades internas (las que usa MediSuite para graficar). */
export const UNIDAD_INTERNA: Record<string, string> = {
  peso: 'kg',
  talla: 'cm',
  imc: 'kg/m²',
  pas: 'mmHg',
  pad: 'mmHg',
  fc: 'lpm',
  fr: 'rpm',
  temp: '°C',
  spo2: '%',
  'perimetro-cefalico': 'cm',
  glucosa: 'mg/dL',
  hba1c: '%',
  colesterol: 'mg/dL',
  trigliceridos: 'mg/dL',
  hdl: 'mg/dL',
  ldl: 'mg/dL',
  creatinina: 'mg/dL',
  hemoglobina: 'g/dL',
}

/** Conversión de unidades al importar: [código interno][UCUM origen] → función a la unidad interna. */
const CONVERSION: Record<string, Record<string, (v: number) => number>> = {
  peso: { kg: (v) => v, '[lb_av]': (v) => v * 0.45359237, g: (v) => v / 1000 },
  talla: { cm: (v) => v, m: (v) => v * 100, '[in_i]': (v) => v * 2.54 },
  'perimetro-cefalico': { cm: (v) => v, '[in_i]': (v) => v * 2.54 },
  temp: { Cel: (v) => v, '[degF]': (v) => ((v - 32) * 5) / 9 },
  imc: { 'kg/m2': (v) => v },
  pas: { 'mm[Hg]': (v) => v },
  pad: { 'mm[Hg]': (v) => v },
  fc: { '/min': (v) => v, '{beats}/min': (v) => v },
  fr: { '/min': (v) => v, '{breaths}/min': (v) => v },
  spo2: { '%': (v) => v },
  glucosa: { 'mg/dL': (v) => v, 'mmol/L': (v) => v * 18.016 },
  hba1c: { '%': (v) => v },
  colesterol: { 'mg/dL': (v) => v, 'mmol/L': (v) => v * 38.67 },
  hdl: { 'mg/dL': (v) => v, 'mmol/L': (v) => v * 38.67 },
  ldl: { 'mg/dL': (v) => v, 'mmol/L': (v) => v * 38.67 },
  trigliceridos: { 'mg/dL': (v) => v, 'mmol/L': (v) => v * 88.57 },
  creatinina: { 'mg/dL': (v) => v, 'umol/L': (v) => v / 88.42 },
  hemoglobina: { 'g/dL': (v) => v, 'g/L': (v) => v / 10 },
}
// unidades legibles (no UCUM) que algunos sistemas envían en `unit` sin `code`
const UNIDAD_ALIAS: Record<string, string> = {
  mmhg: 'mm[Hg]',
  '°c': 'Cel',
  c: 'Cel',
  'kg/m²': 'kg/m2',
  lpm: '/min',
  rpm: '/min',
  'beats/minute': '/min',
  'breaths/minute': '/min',
  lb: '[lb_av]',
  in: '[in_i]',
  '°f': '[degF]',
}

// ---------- Utilidades ----------
/** id FHIR válido: [A-Za-z0-9\-.]{1,64} */
export function fhirId(s: string): string {
  const x = s.replace(/[^A-Za-z0-9\-.]/g, '-').slice(0, 64)
  return x || 'x'
}

function fnv(s: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
/** UUID determinista (formato RFC 4122, versión 4/variante 10) a partir de un texto: exportaciones estables. */
export function uuidDe(s: string): string {
  const hex = [1, 2, 3, 4]
    .map((k) =>
      fnv(s, k * 0x9e3779b1)
        .toString(16)
        .padStart(8, '0'),
    )
    .join('')
  const h = hex.split('')
  h[12] = '4'
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  const x = h.join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

const GENERO: Record<Patient['sexo'], string> = {
  F: 'female',
  M: 'male',
  O: 'other',
}
const ESTADO_CITA: Record<Appointment['estado'], string> = {
  agendada: 'booked',
  confirmada: 'booked',
  'en-sala': 'arrived',
  'en-consulta': 'checked-in',
  atendida: 'fulfilled',
  cancelada: 'cancelled',
  'no-asistio': 'noshow',
}

// ---------- Exportación ----------
export interface DatosExport {
  patients: Patient[]
  encounters?: Encounter[]
  observations?: Observation[]
  prescriptions?: Prescription[]
  documents?: DocumentFile[]
  appointments?: Appointment[]
}

export interface OpcionesExport {
  tipo?: 'collection' | 'transaction'
  /** Referencias `urn:uuid:` (Bundle) o relativas `Patient/id` (NDJSON / servidor). */
  referencias?: 'uuid' | 'relativas'
  /** Tamaño máximo (bytes) para incrustar documentos en base64; 0 = no incrustar. */
  inlineMax?: number
  /** Origen para convertir URLs relativas de archivos (modo servidor) en absolutas. */
  origen?: string
  ahora?: string
  /** Etiquetas para los códigos internos sin LOINC (OBS_LABELS). */
  etiquetas?: Record<string, { label: string; unidad: string }>
}

export interface ResultadoExport {
  bundle: Bundle
  recursos: BundleEntry[]
  avisos: string[]
}

export function exportar(d: DatosExport, op: OpcionesExport = {}): ResultadoExport {
  const tipo = op.tipo ?? 'collection'
  const relativas = op.referencias === 'relativas'
  const avisos: string[] = []
  const entries: BundleEntry[] = []
  const pacientes = d.patients.filter((p) => {
    if (p.bloqueado) avisos.push(`Se omitió a un paciente con bloqueo ARCO (${p.id}).`)
    return !p.bloqueado
  })
  const ids = new Set(pacientes.map((p) => p.id))
  const ref = (type: string, id: string) => (relativas ? `${type}/${fhirId(id)}` : `urn:uuid:${uuidDe(type + '/' + id)}`)
  const push = (type: string, id: string, resource: Omit<FhirResource, 'resourceType' | 'id'>) => {
    const r = {
      resourceType: type,
      id: fhirId(id),
      ...resource,
    } as FhirResource
    const e: BundleEntry = {
      fullUrl: relativas ? undefined : ref(type, id),
      resource: r,
    }
    if (tipo === 'transaction') e.request = { method: 'POST', url: type }
    entries.push(e)
  }
  const subject = (pid: string) => ({ reference: ref('Patient', pid) })

  for (const p of pacientes) {
    const identifier = p.curp ? [{ use: 'official', system: CURP_SYSTEM, value: p.curp.toUpperCase() }] : undefined
    const telecom = [...(p.telefono ? [{ system: 'phone', value: p.telefono, use: 'mobile' }] : []), ...(p.email ? [{ system: 'email', value: p.email }] : [])]
    push('Patient', p.id, {
      ...(identifier ? { identifier } : {}),
      active: true,
      name: [
        {
          use: 'official',
          text: `${p.nombre} ${p.apellidos}`.trim(),
          family: p.apellidos,
          given: p.nombre.split(/\s+/).filter(Boolean),
        },
      ],
      ...(telecom.length ? { telecom } : {}),
      gender: GENERO[p.sexo] ?? 'unknown',
      ...(/^\d{4}-\d{2}-\d{2}$/.test(p.fechaNac) ? { birthDate: p.fechaNac } : {}),
    })
    p.alergias.forEach((a, i) => {
      if (!a.trim()) return
      push('AllergyIntolerance', `${p.id}-alergia-${i}`, {
        clinicalStatus: {
          coding: [{ system: ALLERGY_CLINICAL, code: 'active' }],
        },
        code: { text: a.trim() },
        patient: subject(p.id),
      })
    })
    ;(p.medicamentosActuales ?? []).forEach((m, i) => {
      if (!m.trim()) return
      push('MedicationStatement', `${p.id}-med-${i}`, {
        status: 'active',
        medicationCodeableConcept: { text: m.trim() },
        subject: subject(p.id),
      })
    })
  }

  for (const e of d.encounters ?? []) {
    if (!ids.has(e.patientId)) continue
    const conds = e.diagnosticos.filter((dx) => dx.codigo || dx.nombre)
    push('Encounter', e.id, {
      status: 'finished',
      class: { system: ACT_CODE, code: 'AMB', display: 'ambulatory' },
      ...(e.plantilla ? { type: [{ text: e.plantilla }] } : {}),
      subject: subject(e.patientId),
      period: { start: e.fecha },
      ...(e.motivo ? { reasonCode: [{ text: e.motivo }] } : {}),
      ...(conds.length
        ? {
            diagnosis: conds.map((_, i) => ({
              condition: { reference: ref('Condition', `${e.id}-dx-${i}`) },
              rank: i + 1,
            })),
          }
        : {}),
    })
    conds.forEach((dx, i) => {
      push('Condition', `${e.id}-dx-${i}`, {
        category: [
          {
            coding: [
              {
                system: COND_CAT,
                code: 'encounter-diagnosis',
                display: 'Encounter Diagnosis',
              },
            ],
          },
        ],
        code: {
          ...(dx.codigo
            ? {
                coding: [
                  {
                    system: ICD10,
                    code: dx.codigo,
                    display: dx.nombre || undefined,
                  },
                ],
              }
            : {}),
          text: dx.nombre || dx.codigo,
        },
        subject: subject(e.patientId),
        encounter: { reference: ref('Encounter', e.id) },
        recordedDate: e.fecha,
      })
    })
  }

  // Observaciones: la presión arterial se agrupa en el panel 85354-9 (perfil «bp») cuando hay sistólica y diastólica simultáneas
  const obs = (d.observations ?? []).filter((o) => ids.has(o.patientId) && Number.isFinite(o.valor))
  const usadas = new Set<string>()
  const padPor = new Map<string, Observation>()
  for (const o of obs) if (o.codigo === 'pad') padPor.set(o.patientId + '|' + o.fecha, o)
  for (const o of obs) {
    if (o.codigo !== 'pas') continue
    const pad = padPor.get(o.patientId + '|' + o.fecha)
    if (!pad || usadas.has(pad.id)) continue
    usadas.add(o.id)
    usadas.add(pad.id)
    push('Observation', `bp-${o.id}`, {
      meta: { profile: [SD + 'bp'] },
      status: 'final',
      category: [categoria('vital-signs')],
      code: {
        coding: [
          {
            system: LOINC,
            code: BP_PANEL,
            display: 'Blood pressure panel with all children optional',
          },
        ],
        text: 'Presión arterial',
      },
      subject: subject(o.patientId),
      effectiveDateTime: o.fecha,
      component: [o, pad].map((x) => ({
        code: codigoLoinc(OBS_FHIR[x.codigo]),
        valueQuantity: cantidad(x.valor, OBS_FHIR[x.codigo].ucum),
      })),
    })
  }
  for (const o of obs) {
    if (usadas.has(o.id)) continue
    const m = OBS_FHIR[o.codigo]
    const nota = o.interpretacion ? { note: [{ text: o.interpretacion }] } : {}
    if (m) {
      push('Observation', o.id, {
        ...(m.perfil ? { meta: { profile: [SD + m.perfil] } } : m.categoria === 'vital-signs' ? { meta: { profile: [SD + 'vitalsigns'] } } : {}),
        status: 'final',
        category: [categoria(m.categoria)],
        code: {
          ...codigoLoinc(m),
          text: op.etiquetas?.[o.codigo]?.label ?? m.loinc[0].display,
        },
        subject: subject(o.patientId),
        effectiveDateTime: o.fecha,
        valueQuantity: cantidad(o.valor, m.ucum),
        ...nota,
      })
    } else {
      const lbl = o.etiqueta || op.etiquetas?.[o.codigo]?.label || o.codigo
      push('Observation', o.id, {
        status: 'final',
        ...(o.fuente === 'escala' || o.codigo === 'escala' ? { category: [categoria('survey')] } : {}),
        code: {
          coding: [
            {
              system: LOCAL_OBS,
              code: o.codigo,
              display: op.etiquetas?.[o.codigo]?.label ?? o.codigo,
            },
          ],
          text: lbl,
        },
        subject: subject(o.patientId),
        effectiveDateTime: o.fecha,
        valueQuantity: { value: o.valor, unit: o.unidad },
        ...nota,
      })
    }
  }

  for (const rx of d.prescriptions ?? []) {
    if (!ids.has(rx.patientId)) continue
    rx.items.forEach((it, i) => {
      const texto =
        [it.dosis, it.via && `vía ${it.via}`, it.frecuencia, it.duracion && `durante ${it.duracion}`].filter(Boolean).join(', ') + (it.indicaciones ? `. ${it.indicaciones}` : '')
      push('MedicationRequest', `${rx.id}-${i}`, {
        ...(rx.folio ? { groupIdentifier: { value: rx.folio } } : {}),
        status: rx.cancelada ? 'cancelled' : 'active',
        intent: 'order',
        medicationCodeableConcept: {
          text: [it.medicamento, it.presentacion].filter(Boolean).join(' '),
        },
        subject: subject(rx.patientId),
        authoredOn: rx.fecha,
        dosageInstruction: [{ text: texto, ...(it.via ? { route: { text: it.via } } : {}) }],
        ...(rx.indicaciones ? { note: [{ text: rx.indicaciones }] } : {}),
      })
    })
  }

  for (const doc of d.documents ?? []) {
    if (!ids.has(doc.patientId)) continue
    const att: Json = {
      contentType: doc.mime || 'application/octet-stream',
      title: doc.nombre,
    }
    const m = /^data:([^;,]*)(;base64)?,/.exec(doc.dataUrl ?? '')
    if (m) {
      const datos = doc.dataUrl.slice(m[0].length)
      const bytes = m[2] ? Math.floor((datos.length * 3) / 4) : datos.length
      if (op.inlineMax && bytes <= op.inlineMax) {
        att.data = m[2] ? datos : base64Utf8(decodeURIComponent(datos))
        att.size = bytes
      } else avisos.push(`«${doc.nombre}»: solo metadatos (el archivo no se incrusta).`)
    } else if (doc.dataUrl) {
      att.url = /^https?:/.test(doc.dataUrl) ? doc.dataUrl : (op.origen ?? '') + doc.dataUrl
    }
    push('DocumentReference', doc.id, {
      status: 'current',
      type: { text: doc.tipo },
      subject: subject(doc.patientId),
      date: doc.fecha,
      description: doc.nombre,
      content: [{ attachment: att }],
    })
  }

  for (const a of d.appointments ?? []) {
    if (!ids.has(a.patientId)) continue
    push('Appointment', a.id, {
      status: ESTADO_CITA[a.estado] ?? 'booked',
      appointmentType: { text: a.tipo },
      ...(a.motivo ? { description: a.motivo } : {}),
      start: a.inicio,
      end: a.fin,
      participant: [{ actor: subject(a.patientId), status: 'accepted' }],
    })
  }

  const ahora = op.ahora ?? new Date().toISOString()
  const bundle: Bundle = {
    resourceType: 'Bundle',
    id: uuidDe('bundle|' + ahora),
    type: tipo,
    timestamp: ahora,
    entry: entries,
  }
  return { bundle, recursos: entries, avisos }
}

function categoria(code: string) {
  const display: Record<string, string> = {
    'vital-signs': 'Vital Signs',
    laboratory: 'Laboratory',
    survey: 'Survey',
  }
  return { coding: [{ system: OBS_CAT, code, display: display[code] }] }
}
function codigoLoinc(m: MapaObs) {
  return {
    coding: m.loinc.map((l) => ({
      system: LOINC,
      code: l.code,
      display: l.display,
    })),
  }
}
function cantidad(value: number, ucum: string) {
  return { value, unit: ucum, system: UCUM, code: ucum }
}
function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** NDJSON (FHIR Bulk Data): un archivo por tipo de recurso, un recurso por línea, referencias relativas. */
export function aNdjson(d: DatosExport, op: Omit<OpcionesExport, 'tipo' | 'referencias'> = {}): Record<string, string> {
  const { recursos } = exportar(d, {
    ...op,
    tipo: 'collection',
    referencias: 'relativas',
  })
  const out: Record<string, string[]> = {}
  for (const e of recursos) (out[e.resource.resourceType] ??= []).push(JSON.stringify(e.resource))
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n') + '\n']))
}

// ---------- Validación ligera ----------
export interface Validacion {
  ok: boolean
  errores: string[]
  advertencias: string[]
  conteo: Record<string, number>
}

const REQUERIDOS: Record<string, string[][]> = {
  // cada elemento: alternativas (al menos una presente)
  Observation: [['status'], ['code']],
  Encounter: [['status'], ['class']],
  Condition: [['subject']],
  AllergyIntolerance: [['patient']],
  MedicationRequest: [['status'], ['intent'], ['subject'], ['medicationCodeableConcept', 'medicationReference']],
  MedicationStatement: [['status'], ['subject'], ['medicationCodeableConcept', 'medicationReference']],
  DocumentReference: [['status'], ['content']],
  Appointment: [['status'], ['participant']],
}
const ESTADOS: Record<string, string[]> = {
  Observation: ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'],
  Encounter: ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown'],
  MedicationRequest: ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'],
  MedicationStatement: ['active', 'completed', 'entered-in-error', 'intended', 'stopped', 'on-hold', 'unknown', 'not-taken'],
  DocumentReference: ['current', 'superseded', 'entered-in-error'],
  Appointment: ['proposed', 'pending', 'booked', 'arrived', 'fulfilled', 'cancelled', 'noshow', 'entered-in-error', 'checked-in', 'waitlist'],
}
const ID_RE = /^[A-Za-z0-9\-.]{1,64}$/
const REL_RE = /^([A-Z][A-Za-z]+)\/([A-Za-z0-9\-.]{1,64})(\/_history\/.+)?$/

function vacio(v: unknown) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

/** Recorre un recurso y devuelve todas las cadenas `reference` con su ruta. */
export function referencias(obj: unknown, ruta = ''): { ruta: string; ref: string }[] {
  const out: { ruta: string; ref: string }[] = []
  if (Array.isArray(obj)) obj.forEach((x, i) => out.push(...referencias(x, `${ruta}[${i}]`)))
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'reference' && typeof v === 'string') out.push({ ruta: ruta ? `${ruta}.reference` : 'reference', ref: v })
      else if (typeof v === 'object') out.push(...referencias(v, ruta ? `${ruta}.${k}` : k))
    }
  }
  return out
}

export function validarBundle(b: unknown): Validacion {
  const errores: string[] = []
  const advertencias: string[] = []
  const conteo: Record<string, number> = {}
  const fin = () => ({
    ok: errores.length === 0,
    errores,
    advertencias,
    conteo,
  })
  if (!b || typeof b !== 'object' || (b as Json).resourceType !== 'Bundle') {
    errores.push('No es un recurso Bundle.')
    return fin()
  }
  const bundle = b as Bundle
  if (!['collection', 'transaction', 'batch', 'searchset', 'document', 'message', 'history', 'transaction-response', 'batch-response'].includes(bundle.type))
    errores.push(`Bundle.type inválido: «${bundle.type}».`)
  if (!Array.isArray(bundle.entry)) {
    if (bundle.entry !== undefined) errores.push('Bundle.entry debe ser un arreglo.')
    return fin()
  }
  const fullUrls = new Set<string>()
  const relativos = new Set<string>()
  bundle.entry.forEach((e, i) => {
    const r = e?.resource
    const donde = `entry[${i}]`
    if (!r || typeof r !== 'object' || typeof r.resourceType !== 'string') return void errores.push(`${donde}: sin resource.resourceType.`)
    conteo[r.resourceType] = (conteo[r.resourceType] ?? 0) + 1
    if (e.fullUrl) {
      if (fullUrls.has(e.fullUrl)) errores.push(`${donde}: fullUrl duplicado (${e.fullUrl}).`)
      fullUrls.add(e.fullUrl)
      if (e.fullUrl.startsWith('urn:uuid:') && !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(e.fullUrl))
        errores.push(`${donde}: fullUrl urn:uuid mal formado.`)
    } else if (bundle.type === 'transaction' || bundle.type === 'collection') advertencias.push(`${donde} (${r.resourceType}): sin fullUrl.`)
    if (r.id !== undefined) {
      if (!ID_RE.test(String(r.id))) errores.push(`${donde}: id «${r.id}» no cumple [A-Za-z0-9-.]{1,64}.`)
      relativos.add(`${r.resourceType}/${r.id}`)
    }
    if (bundle.type === 'transaction' || bundle.type === 'batch') {
      if (!e.request?.method || !e.request?.url) errores.push(`${donde}: falta request.method/url (obligatorio en ${bundle.type}).`)
    }
    for (const alt of REQUERIDOS[r.resourceType] ?? []) {
      if (alt.every((k) => vacio(r[k]))) errores.push(`${donde} ${r.resourceType}: falta ${alt.join(' o ')}.`)
    }
    const est = ESTADOS[r.resourceType]
    if (est && r.status !== undefined && !est.includes(r.status)) errores.push(`${donde} ${r.resourceType}: status «${r.status}» no permitido.`)
    if (r.resourceType === 'Patient') {
      if (r.birthDate !== undefined && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(r.birthDate)) errores.push(`${donde} Patient: birthDate inválida.`)
      if (r.gender !== undefined && !['male', 'female', 'other', 'unknown'].includes(r.gender)) errores.push(`${donde} Patient: gender inválido.`)
    }
    if (r.resourceType === 'Observation') {
      const qs = [r.valueQuantity, ...(Array.isArray(r.component) ? r.component.map((c: Json) => c.valueQuantity) : [])].filter(Boolean)
      for (const q of qs) {
        if (typeof q.value !== 'number') errores.push(`${donde} Observation: valueQuantity.value debe ser numérico.`)
        if (q.system === UCUM && !q.code) errores.push(`${donde} Observation: cantidad UCUM sin code.`)
      }
      const vital = (r.category ?? []).some((c: Json) => (c.coding ?? []).some((x: Json) => x.code === 'vital-signs'))
      if (vital && !(r.code?.coding ?? []).some((c: Json) => c.system === LOINC)) errores.push(`${donde} Observation: signo vital sin código LOINC (perfil vitalsigns).`)
      if (vital && vacio(r.subject)) errores.push(`${donde} Observation: signo vital sin subject (perfil vitalsigns).`)
      if (vital && vacio(r.effectiveDateTime) && vacio(r.effectivePeriod)) errores.push(`${donde} Observation: signo vital sin effective[x] (perfil vitalsigns).`)
    }
    if (r.resourceType === 'DocumentReference') {
      for (const c of r.content ?? []) {
        if (!c?.attachment) errores.push(`${donde} DocumentReference: content sin attachment.`)
        else if (c.attachment.data && !c.attachment.contentType) errores.push(`${donde} DocumentReference: attachment con data requiere contentType (att-1).`)
      }
    }
    if (r.resourceType === 'Appointment') {
      for (const p of r.participant ?? []) if (!p?.status) errores.push(`${donde} Appointment: participant sin status.`)
    }
  })
  // referencias
  bundle.entry.forEach((e, i) => {
    const r = e?.resource
    if (!r) return
    for (const { ruta, ref } of referencias(r)) {
      if (ref.startsWith('#')) continue // contenido
      if (ref.startsWith('urn:uuid:') || ref.startsWith('urn:oid:')) {
        if (!fullUrls.has(ref)) errores.push(`entry[${i}] ${r.resourceType}.${ruta}: referencia «${ref}» no existe en el Bundle.`)
      } else if (ref.includes('?')) {
        advertencias.push(`entry[${i}] ${r.resourceType}.${ruta}: referencia condicional «${ref.slice(0, 60)}» (se resuelve en el servidor).`)
      } else if (REL_RE.test(ref)) {
        const m = REL_RE.exec(ref)!
        if (!relativos.has(`${m[1]}/${m[2]}`)) advertencias.push(`entry[${i}] ${r.resourceType}.${ruta}: «${ref}» no está en el Bundle.`)
      } else if (/^https?:\/\//.test(ref)) {
        if (!fullUrls.has(ref)) advertencias.push(`entry[${i}] ${r.resourceType}.${ruta}: referencia externa «${ref}».`)
      } else errores.push(`entry[${i}] ${r.resourceType}.${ruta}: referencia mal formada «${ref}».`)
    }
  })
  return fin()
}

// ---------- Importación ----------
export interface Entrada {
  recursos: FhirResource[]
  /** fullUrl/`Tipo/id` → recurso (para resolver referencias) */
  indice: Map<string, FhirResource>
  formato: 'bundle' | 'ndjson' | 'recurso'
}

/** Interpreta texto pegado o archivo: Bundle JSON, un recurso suelto o NDJSON. Lanza Error con mensaje claro. */
export function leerEntrada(texto: string): Entrada {
  const t = texto.trim()
  if (!t) throw new Error('No hay contenido.')
  let formato: Entrada['formato']
  const entries: { fullUrl?: string; resource: FhirResource }[] = []
  let json: unknown
  try {
    json = JSON.parse(t)
  } catch {
    json = undefined
  }
  if (json !== undefined) {
    if (!json || typeof json !== 'object' || typeof (json as Json).resourceType !== 'string') throw new Error('El JSON no es un recurso FHIR (falta resourceType).')
    if ((json as Json).resourceType === 'Bundle') {
      formato = 'bundle'
      for (const e of ((json as Json).entry ?? []) as Json[]) if (e?.resource?.resourceType) entries.push({ fullUrl: e.fullUrl, resource: e.resource })
    } else {
      formato = 'recurso'
      entries.push({ resource: json as FhirResource })
    }
  } else {
    formato = 'ndjson'
    t.split(/\r?\n/).forEach((linea, i) => {
      if (!linea.trim()) return
      let r: unknown
      try {
        r = JSON.parse(linea)
      } catch {
        throw new Error(`No es JSON válido (línea ${i + 1}).`)
      }
      if (!r || typeof r !== 'object' || typeof (r as Json).resourceType !== 'string') throw new Error(`La línea ${i + 1} no es un recurso FHIR.`)
      entries.push({ resource: r as FhirResource })
    })
  }
  const indice = new Map<string, FhirResource>()
  for (const e of entries) {
    if (e.fullUrl) indice.set(e.fullUrl, e.resource)
    if (e.resource.id) {
      indice.set(`${e.resource.resourceType}/${e.resource.id}`, e.resource)
      indice.set(`urn:uuid:${e.resource.id}`, e.resource) // algunos generadores usan el id como uuid
    }
  }
  return { recursos: entries.map((e) => e.resource), indice, formato }
}

export interface ObsNueva {
  codigo: string
  valor: number
  unidad: string
  fecha: string
  etiqueta?: string
  interpretacion?: string
}

export interface PacienteImport {
  clave: string // fullUrl o Tipo/id del Patient de origen
  datos: Omit<Patient, 'id' | 'creado'>
  existente?: Patient
  observaciones: ObsNueva[]
  condiciones: string[]
  alergias: string[]
  medicamentos: string[]
  duplicadas: number
}

export interface PlanImport {
  pacientes: PacienteImport[]
  omitidos: Record<string, number>
  avisos: string[]
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function textoDe(cc: Json | undefined): string {
  if (!cc) return ''
  return cc.text || (cc.coding ?? []).find((c: Json) => c.display)?.display || (cc.coding ?? [])[0]?.code || ''
}

/** CURP de un Patient FHIR: por sistema (contiene «curp» u OID candidato) o por formato del valor. */
export function curpDe(p: Json): string | undefined {
  const ids: Json[] = Array.isArray(p.identifier) ? p.identifier : []
  const porSistema = ids.find((i) => typeof i.value === 'string' && (/curp/i.test(i.system ?? '') || i.system === CURP_OID_CANDIDATO || /curp/i.test(textoDe(i.type))))
  const v = (porSistema?.value ?? ids.find((i) => typeof i.value === 'string' && CURP_RE.test(i.value.toUpperCase()))?.value) as string | undefined
  return v ? v.toUpperCase() : undefined
}

export function pacienteDesdeFhir(p: Json): Omit<Patient, 'id' | 'creado'> {
  const names: Json[] = Array.isArray(p.name) ? p.name : []
  const n = names.find((x) => x.use === 'official') ?? names.find((x) => x.use !== 'old') ?? names[0] ?? {}
  // Synthea agrega dígitos a los nombres sintéticos (p. ej. «Juan123»): se quitan
  const limpiar = (s: string) => s.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
  let nombre = limpiar((n.given ?? []).join(' '))
  let apellidos = limpiar(n.family ?? '')
  if (!nombre && !apellidos && n.text) {
    const partes = String(n.text).trim().split(/\s+/)
    nombre = partes.slice(0, Math.max(1, partes.length - 2)).join(' ')
    apellidos = partes.slice(Math.max(1, partes.length - 2)).join(' ')
  }
  const telecom: Json[] = Array.isArray(p.telecom) ? p.telecom : []
  const sexo: Patient['sexo'] = p.gender === 'female' ? 'F' : p.gender === 'male' ? 'M' : 'O'
  const curp = curpDe(p)
  return {
    nombre: nombre || 'Sin nombre',
    apellidos,
    sexo,
    fechaNac: fechaNacDe(p.birthDate),
    ...(curp ? { curp } : {}),
    ...(telecom.find((t) => t.system === 'phone')?.value ? { telefono: String(telecom.find((t) => t.system === 'phone')!.value) } : {}),
    ...(telecom.find((t) => t.system === 'email')?.value ? { email: String(telecom.find((t) => t.system === 'email')!.value) } : {}),
    alergias: [],
  }
}

function fechaNacDe(b: unknown): string {
  if (typeof b !== 'string') return '1900-01-01' // desconocida: el usuario debe corregirla
  if (/^\d{4}-\d{2}-\d{2}/.test(b)) return b.slice(0, 10)
  if (/^\d{4}-\d{2}$/.test(b)) return b + '-01'
  if (/^\d{4}$/.test(b)) return b + '-01-01'
  return '1900-01-01'
}

/** Unidad UCUM de una cantidad FHIR (usa `code`; si no, intenta con `unit`). */
function ucumDe(q: Json): string {
  if (q.code && (q.system === UCUM || !q.system)) return String(q.code)
  const u = String(q.unit ?? '').trim()
  return UNIDAD_ALIAS[u.toLowerCase()] ?? u
}

/** Observation FHIR → 0..n observaciones internas (el panel de presión arterial produce 2). */
export function observacionesDesdeFhir(o: Json): {
  obs: ObsNueva[]
  motivo?: string
} {
  const fecha = o.effectiveDateTime ?? o.effectivePeriod?.start ?? o.effectiveInstant ?? o.issued
  if (!fecha || isNaN(Date.parse(fecha))) return { obs: [], motivo: 'sin fecha' }
  if (o.status === 'entered-in-error' || o.status === 'cancelled') return { obs: [], motivo: 'anulada' }
  const iso = new Date(fecha).toISOString()
  const codings: Json[] = o.code?.coding ?? []
  const loinc = codings.filter((c) => c.system === LOINC).map((c) => String(c.code))
  const nota =
    (o.note ?? [])
      .map((n: Json) => n.text)
      .filter(Boolean)
      .join(' ') || undefined

  if (loinc.some((c) => BP_PANEL_ALIAS.includes(c))) {
    const out: ObsNueva[] = []
    for (const comp of o.component ?? []) {
      const c = (comp.code?.coding ?? []).find((x: Json) => x.system === LOINC)?.code
      const codigo = c === '8480-6' ? 'pas' : c === '8462-4' ? 'pad' : undefined
      if (!codigo || typeof comp.valueQuantity?.value !== 'number') continue
      const v = convertir(codigo, comp.valueQuantity)
      if (v !== undefined)
        out.push({
          codigo,
          valor: v,
          unidad: UNIDAD_INTERNA[codigo],
          fecha: iso,
        })
    }
    return out.length ? { obs: out } : { obs: [], motivo: 'panel de presión sin componentes' }
  }

  const local = codings.find((c) => c.system === LOCAL_OBS)?.code
  const codigo = loinc.map((c) => LOINC_IMPORT[c]).find(Boolean) ?? (local ? String(local) : undefined)
  const q = o.valueQuantity
  if (!codigo)
    return {
      obs: [],
      motivo: `código no reconocido: ${textoDe(o.code) || '¿?'}${loinc[0] ? ` (LOINC ${loinc[0]})` : ''}`,
    }
  if (!q || typeof q.value !== 'number') return { obs: [], motivo: 'sin valor numérico' }
  if (UNIDAD_INTERNA[codigo]) {
    const v = convertir(codigo, q)
    if (v === undefined)
      return {
        obs: [],
        motivo: `unidad no compatible (${q.unit ?? q.code ?? '¿?'})`,
      }
    return {
      obs: [
        {
          codigo,
          valor: v,
          unidad: UNIDAD_INTERNA[codigo],
          fecha: iso,
          ...(nota ? { interpretacion: nota } : {}),
        },
      ],
    }
  }
  // código local (escala, rom, cintura…): se conserva tal cual
  return {
    obs: [
      {
        codigo,
        valor: q.value,
        unidad: String(q.unit ?? ''),
        fecha: iso,
        ...(o.code?.text && o.code.text !== codigo ? { etiqueta: String(o.code.text) } : {}),
        ...(nota ? { interpretacion: nota } : {}),
      },
    ],
  }
}

function convertir(codigo: string, q: Json): number | undefined {
  const tabla = CONVERSION[codigo]
  if (!tabla) return q.value
  const u = ucumDe(q)
  const f = tabla[u] ?? (u === OBS_FHIR[codigo]?.ucum ? (v: number) => v : undefined)
  if (!f) return undefined
  return Math.round(f(q.value) * 100) / 100
}

export interface OpcionesImport {
  observaciones?: boolean
  condiciones?: boolean
  alergias?: boolean
  medicamentos?: boolean
}

/**
 * Prepara la importación: qué pacientes se crean o se actualizan (coincidencia por CURP o por nombre + fecha de
 * nacimiento) y qué se agrega a cada uno. No modifica nada.
 */
export function planificarImport(entrada: Entrada, existentes: { patients: Patient[]; observations: Observation[] }, op: OpcionesImport = {}): PlanImport {
  const { observaciones = true, condiciones = true, alergias = true, medicamentos = true } = op
  const omitidos: Record<string, number> = {}
  const avisos: string[] = []
  const motivos: Record<string, number> = {}
  const omitir = (k: string, n = 1) => (omitidos[k] = (omitidos[k] ?? 0) + n)
  const porRecurso = new Map<FhirResource, PacienteImport>()
  const pacientes: PacienteImport[] = []

  for (const r of entrada.recursos) {
    if (r.resourceType !== 'Patient') continue
    const datos = pacienteDesdeFhir(r)
    const existente =
      (datos.curp && existentes.patients.find((p) => p.curp?.toUpperCase() === datos.curp)) ||
      existentes.patients.find((p) => p.fechaNac === datos.fechaNac && normal(`${p.nombre} ${p.apellidos}`) === normal(`${datos.nombre} ${datos.apellidos}`)) ||
      undefined
    const clave = [...entrada.indice.entries()].find(([, v]) => v === r)?.[0] ?? `Patient/${r.id ?? pacientes.length}`
    const pi: PacienteImport = {
      clave,
      datos,
      existente,
      observaciones: [],
      condiciones: [],
      alergias: [],
      medicamentos: [],
      duplicadas: 0,
    }
    pacientes.push(pi)
    porRecurso.set(r, pi)
  }

  const deSujeto = (ref: string | undefined): PacienteImport | undefined => {
    if (!ref) return pacientes.length === 1 ? pacientes[0] : undefined
    const r = entrada.indice.get(ref) ?? entrada.indice.get(ref.replace(/^.*\/(Patient\/[^/]+)$/, '$1'))
    return r ? porRecurso.get(r) : undefined
  }
  const medsPorPaciente = new Map<PacienteImport, { statement: string[]; request: string[] }>()

  for (const r of entrada.recursos) {
    const t = r.resourceType
    if (t === 'Patient') continue
    const pi = deSujeto(r.subject?.reference ?? r.patient?.reference)
    const soportado = ['Observation', 'Condition', 'AllergyIntolerance', 'MedicationStatement', 'MedicationRequest'].includes(t)
    if (!soportado) {
      omitir(t)
      continue
    }
    if (!pi) {
      omitir(`${t} (sin paciente en el archivo)`)
      continue
    }
    if (t === 'Observation') {
      if (!observaciones) {
        omitir(t)
        continue
      }
      const { obs, motivo } = observacionesDesdeFhir(r)
      if (!obs.length) {
        omitir('Observation (no mapeada)')
        if (motivo) motivos[motivo] = (motivos[motivo] ?? 0) + 1
      }
      for (const o of obs) {
        const dup =
          pi.existente &&
          existentes.observations.some((x) => x.patientId === pi.existente!.id && x.codigo === o.codigo && x.fecha === o.fecha && Math.abs(x.valor - o.valor) < 1e-6)
        if (dup) pi.duplicadas++
        else pi.observaciones.push(o)
      }
    } else if (t === 'Condition') {
      if (!condiciones || r.verificationStatus?.coding?.some((c: Json) => c.code === 'entered-in-error' || c.code === 'refuted')) {
        omitir(t)
        continue
      }
      const txt = textoDe(r.code)
      if (!txt) {
        omitir('Condition (sin código)')
        continue
      }
      const icd = (r.code?.coding ?? []).find((c: Json) => c.system === ICD10)?.code
      const estado = (r.clinicalStatus?.coding ?? [])[0]?.code
      const linea = `${txt}${icd && !txt.includes(icd) ? ` (CIE-10 ${icd})` : ''}${estado === 'resolved' || estado === 'inactive' || estado === 'remission' ? ' — resuelto' : ''}`
      if (!pi.condiciones.includes(linea)) pi.condiciones.push(linea)
    } else if (t === 'AllergyIntolerance') {
      const txt = textoDe(r.code)
      if (!alergias || !txt) {
        omitir(t)
        continue
      }
      const estado = (r.clinicalStatus?.coding ?? [])[0]?.code
      if (estado === 'resolved' || estado === 'inactive') {
        omitir('AllergyIntolerance (inactiva)')
        continue
      }
      if (!pi.alergias.some((a) => normal(a) === normal(txt))) pi.alergias.push(txt)
    } else {
      const txt = textoDe(r.medicationCodeableConcept) || (r.medicationReference?.display as string | undefined) || ''
      if (!medicamentos || !txt || r.status !== 'active') {
        omitir(`${t}${r.status !== 'active' ? ' (no activa)' : ''}`)
        continue
      }
      const m = medsPorPaciente.get(pi) ?? { statement: [], request: [] }
      ;(t === 'MedicationStatement' ? m.statement : m.request).push(txt)
      medsPorPaciente.set(pi, m)
    }
  }
  // medicamentos actuales: MedicationStatement si los hay; si no, las MedicationRequest activas
  for (const [pi, m] of medsPorPaciente) {
    const xs = m.statement.length ? m.statement : m.request
    for (const x of xs) if (!pi.medicamentos.some((y) => normal(y) === normal(x))) pi.medicamentos.push(x)
  }
  for (const pi of pacientes) {
    if (pi.existente) {
      pi.alergias = pi.alergias.filter((a) => !pi.existente!.alergias.some((b) => normal(a) === normal(b)))
      pi.medicamentos = pi.medicamentos.filter((a) => !(pi.existente!.medicamentosActuales ?? []).some((b) => normal(a) === normal(b)))
    }
    pi.observaciones.sort((a, b) => a.fecha.localeCompare(b.fecha))
  }
  if (!pacientes.length) avisos.push('El archivo no contiene recursos Patient: no hay a quién asignar los datos.')
  for (const [m, n] of Object.entries(motivos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8))
    avisos.push(`${n} observación(es) omitida(s): ${m}.`)
  return { pacientes, omitidos, avisos }
}
