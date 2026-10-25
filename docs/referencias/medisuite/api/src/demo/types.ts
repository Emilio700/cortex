// Copia de src/lib/types.ts (frontend). Mantener sincronizada.
// Modelo de datos inspirado en FHIR (Patient, Appointment, Encounter, Observation, MedicationRequest...)
// para que migrar a un backend FHIR (Medplum/HAPI) sea directo.

export type ID = string

export interface Patient {
  id: ID
  nombre: string
  apellidos: string
  sexo: 'F' | 'M' | 'O'
  fechaNac: string // YYYY-MM-DD
  curp?: string
  telefono?: string
  email?: string
  tipoSangre?: string
  alergias: string[]
  antecedentes?: string // texto libre: patológicos, quirúrgicos, familiares
  medicamentosActuales?: string[]
  notas?: string
  creado: string // ISO
}

export type EstadoCita = 'agendada' | 'confirmada' | 'en-sala' | 'en-consulta' | 'atendida' | 'cancelada' | 'no-asistio'

export interface Appointment {
  id: ID
  patientId: ID
  inicio: string // ISO
  fin: string // ISO
  tipo: 'primera-vez' | 'subsecuente' | 'procedimiento' | 'telemedicina'
  estado: EstadoCita
  motivo?: string
}

export interface Diagnostico {
  codigo: string // CIE-10
  nombre: string
}

export interface Encounter {
  id: ID
  patientId: ID
  fecha: string // ISO
  plantilla: string
  motivo?: string
  subjetivo: string
  objetivo: string
  analisis: string
  plan: string
  diagnosticos: Diagnostico[]
  firmada: boolean
  firmadaEn?: string
  firmadoPor?: ID
  adendas: { fecha: string; texto: string; autor?: string }[]
  signos?: Record<string, string> // borrador de signos vitales capturados en la nota
  obsIds?: Record<string, string> // Observations creadas desde la nota
}

// Códigos de observación usados en todo el sistema (agrega los que necesites)
export type ObsCode =
  | 'peso' | 'talla' | 'imc' | 'pas' | 'pad' | 'fc' | 'fr' | 'temp' | 'spo2' | 'glucosa'
  | 'hba1c' | 'colesterol' | 'trigliceridos' | 'hdl' | 'ldl' | 'creatinina' | 'hemoglobina'
  | 'tfg' | 'perimetro-cefalico' | 'cintura' | 'grasa' | 'rom' | 'escala' | (string & {})

export interface Observation {
  id: ID
  patientId: ID
  fecha: string // ISO
  codigo: ObsCode
  valor: number
  unidad: string
  etiqueta?: string // ej. "PHQ-9", "Flexión de rodilla derecha"
  fuente: 'manual' | 'bluetooth' | 'ocr' | 'camara' | 'escala' | 'calculadora' | 'ecg'
  interpretacion?: string
}

export interface PrescriptionItem {
  medicamento: string
  presentacion?: string
  dosis: string
  via: string
  frecuencia: string
  duracion: string
  indicaciones?: string
}

export interface Prescription {
  id: ID
  patientId: ID
  fecha: string
  items: PrescriptionItem[]
  indicaciones?: string
  folio: string
  firma?: string // JWS compacto para el QR verificable
  cancelada?: boolean
  motivoCancelacion?: string
}

export interface DocumentFile {
  id: ID
  patientId: ID
  fecha: string
  tipo: 'consentimiento' | 'estudio' | 'laboratorio' | 'foto' | 'receta' | 'dicom' | 'ecg' | 'factura' | 'otro'
  nombre: string
  mime: string
  dataUrl: string // base64; en producción esto va a S3/Orthanc
  meta?: Record<string, unknown>
}

export interface Payment {
  id: ID
  patientId: ID
  fecha: string
  concepto: string
  monto: number
  metodo: 'efectivo' | 'tarjeta' | 'transferencia'
  facturado: boolean
  rfc?: string
}

export interface Settings {
  doctor: {
    nombre: string
    especialidad: string
    cedula: string
    cedulaEspecialidad?: string
    universidad: string
    direccion: string
    telefono: string
    email: string
    rfc?: string
  }
  clinica: string
  tema: 'claro' | 'oscuro'
  // llaves para firmar recetas (JWK). Generadas en Configuración.
  llavePrivada?: Record<string, unknown>
  llavePublica?: Record<string, unknown>
  // URLs de servicios de servidor opcionales (ver /servicios)
  servicios: {
    orthanc?: string
    whisper?: string
    presidio?: string
    ohif?: string
  }
  anthropicApiKey?: string
}

// Campos que agrega el servidor (modo servidor) a cualquier recurso
export interface ServerFields {
  creadoPor?: ID
  actualizadoEn?: string
}

export type Rol = 'admin' | 'medico' | 'recepcion' | 'enfermeria'

export interface User {
  id: ID
  email: string
  nombre: string
  rol: Rol
  activo: boolean
  totp: boolean
  especialidad?: string
  cedula?: string
  cedulaEspecialidad?: string
  universidad?: string
}

export interface Org {
  id: ID
  nombre: string
}

export interface DB {
  version: number
  patients: Patient[]
  appointments: Appointment[]
  encounters: Encounter[]
  observations: Observation[]
  prescriptions: Prescription[]
  documents: DocumentFile[]
  payments: Payment[]
  /** v1.2: registros genéricos (patientId opcional). */
  registros?: Registro[]
  settings: Settings
}

export interface Registro {
  id: ID
  patientId?: ID
  fecha: string
  tipo: string
  estado?: string
  titulo?: string
  datos: Record<string, unknown>
}

export type CollectionName = Exclude<keyof DB, 'version' | 'settings'>
