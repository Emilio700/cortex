/**
 * TypeScript types for Doctor module
 */

// SOAP Note types
//
// Sin `diagnosis`: la columna se elimino del backend al quitar CIE-10 y el
// diagnostico se captura en `assessment`. Mandarlo hacia que el alta reventara
// con un 500, asi que el tipo tampoco debe ofrecerlo.
export interface SOAPNote {
  id: number
  appointment_id: number
  doctor_id: number
  tenant_id: number
  subjective: string
  objective: string
  assessment: string
  plan: string
  created_at: string
  updated_at: string
}

export interface SOAPNoteCreate {
  appointment_id: number
  subjective: string
  objective: string
  assessment: string
  plan: string
}

export interface SOAPNoteUpdate {
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}

// Prescription types
//
// ``presentation``, ``route`` y ``quantity`` se agregaron para que la farmacia
// pueda surtir sin llamar al consultorio: antes la presentacion se pegaba
// dentro de ``name`` y la via y la cantidad no existian. Siguen siendo
// opcionales, asi que una receta capturada antes de esto se imprime igual.
export interface MedicationItem {
  name: string
  dosage: string
  frequency: string
  duration: string
  intake_time?: string
  /** Tabletas, capsulas, solucion... */
  presentation?: string
  /** Via oral, via vaginal... */
  route?: string
  /** Cuanto se surte: "15 tabletas". */
  quantity?: string
  /** Indicaciones propias de ESTE medicamento. */
  notes?: string
}

export interface Prescription {
  id: number
  appointment_id: number
  patient_id: number
  doctor_id: number
  tenant_id: number
  // Folio visible para el médico (REC-{tenant}-{año}-{NNNN}). El backend ya lo
  // devuelve y lo imprime en el PDF; el `id` es un número heredado de la
  // migración legacy y no significa nada en el consultorio.
  folio_number?: string | null
  medications: MedicationItem[]
  instructions?: string
  /**
   * Motivo de consulta impreso en la receta. Va en la RECETA y no en el perfil
   * del médico porque la decision es por paciente, y se guarda el texto
   * para que una reimpresion diga lo mismo que el papel que ya tiene la
   * paciente. Vacío o ausente = no se imprime.
   */
  diagnosis?: string | null
  digital_signature?: string
  created_at: string
  updated_at: string
}

export interface PrescriptionCreate {
  appointment_id: number
  patient_id: number
  medications: MedicationItem[]
  instructions?: string
  diagnosis?: string | null
  digital_signature?: string
}

export interface PrescriptionUpdate {
  medications?: MedicationItem[]
  instructions?: string
  diagnosis?: string | null
  digital_signature?: string
}

// Medical Certificate types
export enum CertificateType {
  SICK_LEAVE = 'sick_leave',
  FITNESS = 'fitness',
  OTHER = 'other',
}

export interface MedicalCertificate {
  id: number
  appointment_id: number
  patient_id: number
  doctor_id: number
  tenant_id: number
  // Mismo criterio que la receta: el folio es el identificador humano.
  folio_number?: string | null
  certificate_type: CertificateType
  diagnosis: string
  days_off?: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface MedicalCertificateCreate {
  appointment_id: number
  patient_id: number
  certificate_type: CertificateType
  diagnosis: string
  days_off?: number
  notes?: string
}

export interface MedicalCertificateUpdate {
  certificate_type?: CertificateType
  diagnosis?: string
  days_off?: number
  notes?: string
}

// Filters and queries
export interface DoctorAppointmentFilters {
  start_date?: string
  end_date?: string
  status?: string
  /** Paciente por nombre, n.º de expediente o teléfono; lo busca el servidor. */
  q?: string
  orden?: 'asc' | 'desc'
  /** Días del consultorio (AAAA-MM-DD), inclusive. */
  fecha_desde?: string
  fecha_hasta?: string
  appointment_type?: string
  skip?: number
  limit?: number
}
