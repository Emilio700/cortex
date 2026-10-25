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
  // Derechos ARCO (solo servidor; el cliente no los escribe)
  bloqueado?: boolean
  bloqueo?: { motivo: string; fecha: string; por?: ID; porNombre?: string }
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
  notas?: string
  reagendar?: boolean // el paciente pidió reagendar (WhatsApp); recepción lo pone en false al resolverlo
  confirmacion?: { canal: 'whatsapp' | 'telefono' | 'presencial' | 'email'; fecha: string }
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
  fuente: 'manual' | 'bluetooth' | 'ocr' | 'camara' | 'escala' | 'calculadora' | 'ecg' | 'importado'
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
  facturaId?: ID // lo fija el servidor al timbrar
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
  llavePrivada?: JsonWebKey
  llavePublica?: JsonWebKey
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
  direccion?: string
  telefono?: string
  rfc?: string
}

export interface Org {
  id: ID
  nombre: string
}

// Registros genéricos para herramientas que no encajan en las colecciones FHIR básicas
// (control prenatal, vacunas, inventario, órdenes, triaje, enfermería, tareas...).
// `patientId` es opcional: hay registros de la clínica (inventario, tareas) sin paciente.
export type TipoRegistro =
  | 'prenatal' | 'vacuna' | 'desarrollo' | 'agudeza-visual' | 'audiometria' | 'tamizaje'
  | 'inventario' | 'movimiento-inventario' | 'orden' | 'certificado' | 'referencia'
  | 'triaje' | 'enfermeria' | 'nutricion' | 'tarea' | 'encuesta' | (string & {})

export interface Registro {
  id: ID
  patientId?: ID
  fecha: string // ISO
  tipo: TipoRegistro
  estado?: string // p. ej. 'pendiente' | 'completada' | 'cancelada' (lo define cada herramienta)
  titulo?: string // texto corto para listas y la línea de tiempo
  datos: Record<string, unknown> // contenido propio de la herramienta (JSON)
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
  registros: Registro[]
  settings: Settings
}

export type CollectionName = Exclude<keyof DB, 'version' | 'settings'>

// ---------- v1.1: mensajes, facturas ----------
export type EstadoMensaje = 'pendiente' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'respondido'
export interface Mensaje {
  id: ID
  appointmentId?: ID
  patientId?: ID
  canal: 'whatsapp' | 'email'
  tipo: 'recordatorio' | 'manual' | 'prueba'
  horas?: number
  citaInicio?: string
  destino: string
  estado: EstadoMensaje
  waId?: string
  error?: string
  respuesta?: 'CONFIRMAR' | 'REAGENDAR'
  creadoEn: string
  actualizadoEn: string
  enviadoEn?: string
  entregadoEn?: string
  leidoEn?: string
  respondidoEn?: string
  creadoPor?: string
}

export interface Factura {
  id: ID
  paymentId: ID
  patientId?: ID
  pacId?: string
  uuid?: string
  serie?: string
  folio?: string
  status: 'pendiente' | 'error' | 'valid' | 'canceled' | (string & {})
  cancellationStatus?: string
  total?: number
  receptor: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string; usoCfdi: string; email?: string }
  formaPago: string
  usoCfdi: string
  error?: string
  cancelacion?: { motivo: '01' | '02' | '03' | '04'; sustitucion?: string; solicitadaEn: string; solicitadaPor: string }
  pdfUrl?: string
  xmlUrl?: string
  creadoEn: string
  actualizadoEn: string
  creadoPor?: string
}
