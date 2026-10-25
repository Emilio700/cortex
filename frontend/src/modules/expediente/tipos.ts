/** Lo que el servidor manda del expediente único (plan 32, punto 6). */

export type PestanaExpediente =
  | 'resumen'
  | 'consultas'
  | 'estudios'
  | 'documentos'
  | 'imagenes'
  | 'embarazo'
  | 'consentimientos'
  | 'equipo'
  // Escalas neurológicas (Cortex, feat/escalas-neuro)
  | 'escalas'

export interface CitaBreve {
  id: number
  scheduled_at: string
  status: string
  motivo?: string | null
}

export interface AlertasClinicas {
  criticos: number
  atrasados: number
  por_revisar: number
  pendientes: number
}

export interface EncabezadoExpediente {
  patient_id: number
  nombre: string
  first_name: string
  last_name: string
  date_of_birth?: string | null
  phone?: string | null
  cell_phone?: string | null
  allergies?: string | null
  /** Solo llegan a quien tiene la vista clínica. */
  implanted_devices?: string | null
  anticoagulants?: string | null
  owner_doctor_id?: number | null
  /** Las pestañas que esta sesión puede abrir: las decide el servidor. */
  pestanas: PestanaExpediente[]
  vista_clinica: boolean
  embarazo?: { semanas?: number | null; dias?: number | null; fpp?: string | null } | null
  alertas?: AlertasClinicas | null
  cita_de_hoy?: CitaBreve | null
  proxima_cita?: CitaBreve | null
}

export interface ResumenExpediente {
  ultima_consulta?: CitaBreve | null
  proxima_cita?: CitaBreve | null
  episodios_activos: { id: number; title: string; status: string; follow_up_on?: string | null }[]
  resultados_recientes: {
    order_id: number
    study_name: string
    fecha: string
    valoracion?: string | null
    critico: boolean
  }[]
  alertas?: AlertasClinicas | null
}

export interface ConsentimientoEstado {
  id: number
  title: string
  status: string
  firmado: boolean
  signed_at?: string | null
}
