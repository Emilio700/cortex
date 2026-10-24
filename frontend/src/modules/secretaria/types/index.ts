/**
 * Secretaria module TypeScript types
 */

/**
 * Appointment status enum
 */
export enum AppointmentStatus {
  AGENDADA = 'agendada',
  CONFIRMADA = 'confirmada',
  EN_SALA = 'en_sala',
  /**
   * El médico abrió la consulta (plan 28, D-3). Nadie lo elige: lo pone el
   * servidor al abrir la consulta y se sale a sala, atendida o cancelada.
   */
  EN_CONSULTA = 'en_consulta',
  CANCELADA = 'cancelada',
  ATENDIDA = 'atendida',
}

/**
 * Patient interface
 */
export interface Patient {
  id: number
  tenant_id: number
  first_name: string
  last_name: string
  // Nullable a propósito: el alta express de recepción registra al paciente
  // sin fecha de nacimiento, y el backend la declara opcional. Mientras este
  // campo mintió diciendo `string`, TypeScript no podía avisar de los cálculos
  // de edad sobre un null — de ahí salió el fantasma de "56 años".
  date_of_birth?: string | null // ISO date string
  /** Número de expediente del sistema anterior; el consultorio lo sigue usando. */
  expediente_legacy?: number | null
  gender?: string
  phone?: string
  cell_phone?: string
  email?: string
  address?: string
  allergies?: string | null
  notas_referencia?: string | null
  dominant_hand?: string | null
  neurological_history?: string | null
  implanted_devices?: string | null
  anticoagulants?: string | null
  personal_history?: string | null
  family_history?: string | null
  gynecological_history?: string | null
  // Structured clinical fields (legacy migration)
  blood_type?: string | null
  religion?: string | null
  patient_type?: string | null
  menarca_age?: number | null
  menstrual_rhythm?: string | null
  ivsa_age?: number | null
  birth_control?: string | null
  last_menstrual_period?: string | null
  expected_delivery_date?: string | null
  gestas?: number | null
  paras?: number | null
  cesareas?: number | null
  abortos?: number | null
  owner_doctor_id?: number | null
  /**
   * `false` cuando el servidor no mandó lo clínico porque quien pide no tiene
   * el expediente clínico (opción C, plan 32): esos campos vienen vacíos por
   * permiso, no porque no haya datos.
   */
  antecedentes_visibles?: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Patient creation request
 */
export interface PatientCreate {
  first_name: string
  last_name: string
  date_of_birth: string
  gender?: string
  phone?: string
  cell_phone?: string
  email?: string
  address?: string
  allergies?: string
  notas_referencia?: string
  dominant_hand?: string
  neurological_history?: string
  implanted_devices?: string
  anticoagulants?: string
  personal_history?: string
  family_history?: string
  gynecological_history?: string
  blood_type?: string
  religion?: string
  patient_type?: string
  menarca_age?: number
  menstrual_rhythm?: string
  ivsa_age?: number
  birth_control?: string
  last_menstrual_period?: string
  expected_delivery_date?: string
  gestas?: number
  paras?: number
  cesareas?: number
  abortos?: number
  owner_doctor_id?: number | null
}

/**
 * Nested patient info in appointment
 */
export interface PatientInAppointment {
  id: number
  first_name: string
  last_name: string
  phone?: string
  /**
   * Para la edad en la agenda (plan 28). Puede venir nula o con el relleno
   * legacy 1900-01-01: `formatEdad` ya los oculta.
   */
  date_of_birth?: string | null
}

/**
 * Nested doctor info in appointment
 */
export interface DoctorInAppointment {
  id: number
  full_name: string
  email: string
  /** "Dr." / "Dra." capturado en la cuenta; sin él se muestra el nombre solo. */
  tratamiento?: string | null
}

/**
 * Appointment interface
 */
export interface Appointment {
  id: number
  patient_id: number
  doctor_id: number
  tenant_id: number
  scheduled_at: string // ISO datetime string
  duration_minutes: number
  status: AppointmentStatus
  /**
   * De dónde entró a consulta; a dónde vuelve si se sale sin cerrarla
   * (plan 28, D-3). Nulo fuera de consulta.
   */
  estado_antes_de_consulta?: string | null
  notes?: string
  created_at: string
  updated_at: string
  // Cancellation trail (Fase 3.5) - only set when status is 'cancelada'
  cancellation_reason?: string | null
  cancelled_by_user_id?: number | null
  cancelled_at?: string | null
  // Nested
  patient?: PatientInAppointment
  doctor?: DoctorInAppointment
  has_triage: boolean
  /**
   * Motivo extra de la cita: una nota corta y OPCIONAL para el doctor
   * ("CONTROL", "PRIMERA VEZ", "ULTRASONIDO"...). No es un tipo de cita:
   * los tipos del sistema siguen siendo tres.
   */
  motivo_extra?: string | null
  // Surgery / procedure fields
  appointment_type?: string  // 'consulta' | 'cirugia' | 'procedimiento'
  cirugia_type?: string | null
  hospital?: string | null
  anestesiologo?: string | null
  preop_notes?: string | null
  postop_notes?: string | null
  duration_hours?: number | null
  // Sala física donde se atiende (Fase salas). Las citas históricas no
  // tienen sala: `room_id` viene null y se muestran como "Sin sala".
  room_id?: number | null
  /** Nombre de la sala, tal como lo devuelve el backend junto a la cita. */
  room_name?: string | null
  /**
   * Edad gestacional al día de la cita (plan 28, D-4): solo si el paciente
   * tiene un embarazo activo y la sesión puede leerlo. Nulas si no aplica;
   * nunca 0 por falta de dato.
   */
  semanas_gestacion?: number | null
  dias_gestacion?: number | null
}

export type AppointmentType = 'consulta' | 'cirugia' | 'procedimiento'

/**
 * Appointment creation request
 */
export interface AppointmentCreate {
  patient_id: number
  doctor_id: number
  scheduled_at: string
  duration_minutes?: number
  notes?: string
  /** Nota opcional del motivo. Nunca obligatoria. */
  motivo_extra?: string | null
  appointment_type?: AppointmentType
  cirugia_type?: string
  hospital?: string
  anestesiologo?: string
  preop_notes?: string
  duration_hours?: number
  /** Sala: obligatoria en sucursales con más de una sala activa. */
  room_id?: number | null
}

/**
 * Appointment filters for list endpoint
 */
export interface AppointmentFilters {
  start_date?: string
  end_date?: string
  /** Primer y último día local (`AAAA-MM-DD`, inclusive): el día del consultorio, sin UTC. */
  fecha_desde?: string
  fecha_hasta?: string
  doctor_id?: number
  patient_id?: number
  tenant_id?: number
  status?: AppointmentStatus
  appointment_type?: AppointmentType
  room_id?: number
  skip?: number
  limit?: number
}

/**
 * Triage interface
 */
export interface Triage {
  id: number
  appointment_id: number
  weight_kg?: number
  height_cm?: number
  blood_pressure_systolic?: number
  blood_pressure_diastolic?: number
  temperature_celsius?: number
  chief_complaint?: string
  observations?: string
  created_by_user_id: number
  created_at: string
  bmi?: number // Calculated
}

/**
 * Triage creation request
 */
export interface TriageCreate {
  appointment_id: number
  weight_kg?: number
  height_cm?: number
  blood_pressure_systolic?: number
  blood_pressure_diastolic?: number
  temperature_celsius?: number
  chief_complaint?: string
  observations?: string
}
