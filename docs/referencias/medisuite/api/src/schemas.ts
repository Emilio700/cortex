// Validación zod que refleja src/lib/types.ts. Los campos desconocidos se descartan (strip).
import { z } from 'zod'

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'id inválido (1–64 caracteres A-Z a-z 0-9 _ -)')
const isoDateTime = z.iso.datetime({ offset: true, message: 'Fecha/hora ISO inválida' })
const isoDate = z.iso.date({ message: 'Fecha inválida (AAAA-MM-DD)' })
const short = (max = 200) => z.string().max(max)
const text = (max = 20_000) => z.string().max(max)
const strRecord = z.record(z.string().max(100), z.string().max(2000))

const unknownRecord = z.record(z.string().max(100), z.unknown()).refine((v) => JSON.stringify(v).length <= 100_000, 'meta demasiado grande')

export const rolSchema = z.enum(['admin', 'medico', 'recepcion', 'enfermeria'])

export const patientSchema = z.object({
  id: idSchema.optional(),
  nombre: short().min(1, 'nombre requerido'),
  apellidos: short().default(''),
  sexo: z.enum(['F', 'M', 'O']),
  fechaNac: isoDate,
  curp: short(18).optional(),
  telefono: short(40).optional(),
  email: short(200).optional(),
  tipoSangre: short(10).optional(),
  alergias: z.array(short()).max(100).default([]),
  antecedentes: text().optional(),
  medicamentosActuales: z.array(short(500)).max(200).optional(),
  notas: text().optional(),
  creado: isoDateTime.optional(),
})

export const appointmentSchema = z
  .object({
    id: idSchema.optional(),
    patientId: idSchema,
    inicio: isoDateTime,
    fin: isoDateTime,
    tipo: z.enum(['primera-vez', 'subsecuente', 'procedimiento', 'telemedicina']),
    estado: z.enum(['agendada', 'confirmada', 'en-sala', 'en-consulta', 'atendida', 'cancelada', 'no-asistio']),
    motivo: short(1000).optional(),
    // v1.1: notas de recepción y bandera de solicitud de reagendar (WhatsApp).
    notas: text(5000).optional(),
    reagendar: z.boolean().optional(),
    confirmacion: z.object({ canal: z.enum(['whatsapp', 'telefono', 'presencial', 'email']), fecha: isoDateTime }).optional(),
  })
  .refine((a) => new Date(a.fin).getTime() >= new Date(a.inicio).getTime(), { message: 'fin debe ser posterior a inicio', path: ['fin'] })

export const adendaSchema = z.object({ fecha: isoDateTime, texto: text(), autor: short().optional(), autorId: short().optional() })

export const encounterSchema = z.object({
  id: idSchema.optional(),
  patientId: idSchema,
  fecha: isoDateTime.optional(),
  plantilla: short().default('SOAP'),
  motivo: short(1000).optional(),
  subjetivo: text(50_000).default(''),
  objetivo: text(50_000).default(''),
  analisis: text(50_000).default(''),
  plan: text(50_000).default(''),
  diagnosticos: z.array(z.object({ codigo: short(20), nombre: short(500) })).max(50).default([]),
  firmada: z.boolean().default(false),
  firmadaEn: isoDateTime.optional(),
  firmadoPor: short().optional(),
  adendas: z.array(adendaSchema).default([]),
  signos: strRecord.optional(),
  obsIds: strRecord.optional(),
})

export const observationSchema = z.object({
  id: idSchema.optional(),
  patientId: idSchema,
  fecha: isoDateTime.optional(),
  codigo: short(60).min(1),
  valor: z.number().finite(),
  unidad: short(30),
  etiqueta: short(200).optional(),
  fuente: z.enum(['manual', 'bluetooth', 'ocr', 'camara', 'escala', 'calculadora', 'ecg', 'importado']),
  interpretacion: short(2000).optional(),
})

export const prescriptionItemSchema = z.object({
  medicamento: short(300).min(1),
  presentacion: short(300).optional(),
  dosis: short(300),
  via: short(100),
  frecuencia: short(300),
  duracion: short(300),
  indicaciones: short(2000).optional(),
})

export const prescriptionSchema = z.object({
  id: idSchema.optional(),
  patientId: idSchema,
  fecha: isoDateTime.optional(),
  items: z.array(prescriptionItemSchema).min(1, 'La receta necesita al menos un medicamento').max(30),
  indicaciones: text(5000).optional(),
})

export const documentTipo = z.enum(['consentimiento', 'estudio', 'laboratorio', 'foto', 'receta', 'dicom', 'ecg', 'factura', 'otro'])

export const documentMetaSchema = z.object({
  id: idSchema.optional(),
  patientId: idSchema,
  tipo: documentTipo,
  nombre: short(255).min(1),
  fecha: isoDateTime.optional(),
  meta: unknownRecord.optional(),
})

export const documentPatchSchema = z.object({
  nombre: short(255).min(1).optional(),
  meta: unknownRecord.optional(),
})

export const paymentSchema = z.object({
  id: idSchema.optional(),
  patientId: idSchema,
  fecha: isoDateTime.optional(),
  concepto: short(300).min(1),
  monto: z.number().finite().min(0).max(100_000_000),
  metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']),
  facturado: z.boolean().default(false),
  rfc: short(13).optional(),
  facturaId: short(64).optional(), // v1.1: factura CFDI timbrada desde este pago
})

export const cancelSchema = z.object({ motivo: short(1000).min(1, 'Indica el motivo de cancelación') })
export const adendaBodySchema = z.object({ texto: text().min(1, 'La adenda no puede estar vacía') })

// ---------- Autenticación y usuarios ----------
export const loginSchema = z.object({
  email: z.string().max(200),
  password: z.string().max(500),
  totp: z.string().max(10).optional(),
})
export const passwordChangeSchema = z.object({ actual: z.string().max(500), nueva: z.string().max(500) })
export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos') })
export const passwordOnlySchema = z.object({ password: z.string().max(500) })

const profileFields = {
  especialidad: short().optional(),
  cedula: short(30).optional(),
  cedulaEspecialidad: short(30).optional(),
  universidad: short(300).optional(),
  direccion: short(500).optional(),
  telefono: short(40).optional(),
  rfc: short(13).optional(),
}
export const PROFILE_KEYS = Object.keys(profileFields) as (keyof typeof profileFields)[]

export const userCreateSchema = z.object({
  email: z.email('Correo inválido').max(200),
  nombre: short().min(1),
  rol: rolSchema,
  password: z.string().max(500),
  ...profileFields,
})
export const userPatchSchema = z.object({
  nombre: short().min(1).optional(),
  rol: rolSchema.optional(),
  activo: z.boolean().optional(),
  password: z.string().max(500).optional(),
  totp: z.literal(false).optional(), // admin puede desactivar 2FA de un usuario (recuperación)
  ...profileFields,
})

// ---------- Configuración ----------
/**
 * URL de un servicio (Orthanc, OHIF, Whisper, Presidio): vacía (= quitar), http(s):// absoluta o ruta del mismo
 * origen ("/orthanc"). El navegador de todos los usuarios la usa en enlaces y fetch: nunca javascript:, data:, etc.
 */
const servicioUrl = short(500).refine((v) => {
  if (v === '') return true
  if (/^\/(?![\/\\])/.test(v)) return !/[\s<>"]/.test(v)
  try {
    const u = new URL(v)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password
  } catch {
    return false
  }
}, 'URL inválida: usa https://… (o una ruta del mismo dominio como /orthanc), sin usuario ni contraseña')
export const settingsPatchSchema = z.object({
  clinica: short(300).min(1).optional(),
  tema: z.enum(['claro', 'oscuro']).optional(),
  servicios: z
    .object({ orthanc: servicioUrl.optional(), whisper: servicioUrl.optional(), presidio: servicioUrl.optional(), ohif: servicioUrl.optional() })
    .optional(),
  doctor: z
    .object({
      nombre: short().min(1).optional(),
      email: short(200).optional(),
      ...profileFields,
    })
    .optional(),
  doctorUserId: short().optional(),
})

export type PatientIn = z.infer<typeof patientSchema>

// ---------- v1.1 ----------
export const PREF_KEY_RE = /^[a-z0-9._-]{1,64}$/
export const PREF_MAX_BYTES = 256 * 1024

export const bloqueoSchema = z.object({ motivo: short(1000).min(1, 'Indica el motivo del bloqueo (oposición/cancelación ARCO)') })

// RFC: 3 letras (moral) o 4 (física) + fecha AAMMDD + homoclave de 3.
export const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2}[A\d])$/
export const facturaCreateSchema = z.object({
  paymentId: idSchema,
  receptor: z.object({
    rfc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(RFC_RE, 'RFC inválido'),
    nombre: short(300).trim().min(1, 'Razón social requerida (como aparece en la Constancia de Situación Fiscal, sin régimen societario)'),
    regimenFiscal: z.string().regex(/^\d{3}$/, 'Régimen fiscal de 3 dígitos (catálogo c_RegimenFiscal)'),
    codigoPostal: z.string().regex(/^\d{5}$/, 'Código postal de 5 dígitos'),
    usoCfdi: z.string().regex(/^(G0[1-3]|I0[1-8]|D(0[1-9]|10)|S01|CP01|CN01)$/, 'Uso de CFDI inválido (catálogo c_UsoCFDI)'),
    email: z.email('Correo inválido').max(200).optional(),
  }),
  formaPago: z.enum(['01', '02', '03', '04', '05', '06', '08', '12', '13', '14', '15', '17', '23', '24', '25', '26', '27', '28', '29', '30', '31', '99']),
  claveProdServ: z.string().regex(/^\d{8}$/, 'Clave de producto/servicio SAT de 8 dígitos').optional(),
  descripcion: short(1000).min(1).optional(),
})

export const facturaCancelSchema = z
  .object({
    motivo: z.enum(['01', '02', '03', '04']),
    sustitucion: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, 'UUID inválido').optional(),
  })
  .refine((b) => b.motivo !== '01' || !!b.sustitucion, { message: 'El motivo 01 requiere el UUID de la factura que sustituye', path: ['sustitucion'] })

export const recuperarSchema = z.object({ email: z.string().max(200) })
export const restablecerSchema = z.object({ token: z.string().min(10).max(200), nueva: z.string().max(500) })

// ---------- v1.2: registros genéricos ----------
export const REGISTRO_TIPO_RE = /^[a-z0-9-]{2,40}$/
export const REGISTRO_DATOS_MAX = 256 * 1024
export const registroSchema = z.object({
  id: idSchema.optional(),
  patientId: idSchema.optional(),
  fecha: isoDateTime.optional(),
  tipo: z.string().regex(REGISTRO_TIPO_RE, 'tipo inválido (2–40 caracteres a-z 0-9 -)'),
  estado: short(40).optional(),
  titulo: short(200).optional(),
  datos: z
    .record(z.string().max(200), z.unknown())
    .refine((v) => Buffer.byteLength(JSON.stringify(v), 'utf8') <= REGISTRO_DATOS_MAX, 'datos demasiado grande (máx. 256 KB)'),
})
