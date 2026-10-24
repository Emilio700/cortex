/**
 * Tipos del módulo de finanzas.
 *
 * Contrato: `docs/plans/23_cobros_por_doctora.md`, sección "Contrato de la API".
 * Los campos nuevos van opcionales a propósito: mientras convivan un backend
 * viejo y uno nuevo, la pantalla tiene que poder distinguir "el servidor no lo
 * dijo" de "el servidor dijo que no".
 */
export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  OTHER = 'other',
}

/** Un pago nunca se borra: se anula, y el anulado no cuenta en ningún total. */
export type PaymentStatus = 'vigente' | 'anulado'

export interface Payment {
  id: number
  tenant_id: number
  patient_id: number
  patient_name?: string
  appointment_id?: number | null
  service_id?: number | null
  service_name?: string
  /** "express" si el pago es de una consulta registrada al cobrar. */
  appointment_origen?: string | null
  received_by_user_id: number
  received_by_name?: string
  /** A quién pertenece el ingreso: quien atendió, no quien cobró. */
  doctor_id?: number | null
  doctor_name?: string | null
  amount: string
  method: PaymentMethod
  description?: string | null
  notes?: string | null
  referencia?: string | null
  status?: PaymentStatus
  void_reason?: string | null
  voided_at?: string | null
  paid_at: string
  created_at: string
}

export interface CashCutMethodBreakdown {
  method: PaymentMethod
  total_amount: string
  count: number
}

export interface CashCutDoctorBreakdown {
  /** `null` = pagos viejos sin doctora; el servidor ya manda el nombre "Sin doctora asignada". */
  doctor_id: number | null
  doctor_name: string
  total_amount: string
  count: number
}

export interface CashCutReceivedByBreakdown {
  user_id: number
  user_name: string
  total_amount: string
  count: number
}

export interface CashCutReport {
  start_date: string
  end_date: string
  total_amount: string
  total_count: number
  by_method: CashCutMethodBreakdown[]
  by_doctor?: CashCutDoctorBreakdown[]
  by_received_by?: CashCutReceivedByBreakdown[]
  /**
   * Qué abarca el corte: la sucursal (administración), lo propio (la doctora)
   * o las doctoras que apoya (la secretaria). Opcional: un backend anterior a
   * los ajustes del 2026-09-28 no lo manda.
   */
  alcance?: 'sucursal' | 'propio' | 'asignadas'
  /** Sólo con `alcance = asignadas`: sus doctoras. Vacía = no tiene ninguna. */
  doctoras_del_alcance?: { doctor_id: number; doctor_name: string }[] | null
  /**
   * Sólo para la secretaria: todo lo que ella recibió en el periodo, de
   * cualquier doctora y sin el filtro del selector. Es el arqueo de su caja.
   */
  mi_caja?: CajaDeQuienRecibe | null
}

export interface CajaDeQuienRecibe {
  user_id: number
  user_name: string
  total_amount: string
  count: number
  by_method: CashCutMethodBreakdown[]
}

export interface PaymentCreate {
  patient_id: number
  appointment_id?: number | null
  service_id?: number | null
  /** Secretaria/admin lo mandan en el cobro suelto; a la doctora el servidor se lo fuerza. */
  doctor_id?: number | null
  amount: string
  method: PaymentMethod
  description?: string
  notes?: string
  referencia?: string
  /** Un UUID por intento: repetir la misma petición devuelve el mismo pago. */
  client_request_id?: string
  /** Cobrar otra vez una cita ya cobrada (servicio extra). Se confirma aparte. */
  cobro_adicional?: boolean
}

/**
 * Cobro de una consulta rápida que no se agendó (plan 23, ajustes del
 * 2026-09-28). El servidor crea la cita express ya atendida y el pago en una
 * sola operación; si algo falla no queda ninguno de los dos.
 */
export interface ConsultaExpressCreate {
  patient_id: number
  /** Recepción lo manda; a la doctora el servidor se lo fuerza. */
  doctor_id?: number | null
  service_id?: number | null
  amount: string
  method: PaymentMethod
  description?: string
  notes?: string
  referencia?: string
  client_request_id?: string
  /** La paciente ya tuvo consulta hoy con esa doctora y se confirmó que ésta es otra. */
  confirmar_otra_consulta?: boolean
}

export type OrigenCita = 'agenda' | 'express'

export interface PaymentFilters {
  start_date?: string
  end_date?: string
  doctor_id?: number
  method?: string
  status?: PaymentStatus
  patient_id?: number
  skip?: number
  limit?: number
}

export interface CashCutFilters {
  start_date?: string
  end_date?: string
  doctor_id?: number
}

// ── Estado de cobro de la cita ─────────────────────────────────────────────

export type EstadoCobro = 'pendiente' | 'cobrada' | 'sin_cargo'

/** Pago vigente tal como viaja resumido dentro de la cita. */
export interface CobroResumen {
  id: number
  amount: string
  method: PaymentMethod | string
  received_by_name?: string | null
  doctor_name?: string | null
  referencia?: string | null
  paid_at: string
}

/**
 * Campos que el servidor agrega a la cita. Se declaran aquí y no en el tipo de
 * la agenda porque el dueño de ese tipo es otro módulo; quien los necesita
 * cruza `Appointment & CamposCobroDeCita`.
 */
export interface CamposCobroDeCita {
  /** `null` en citas que todavía no se atienden y no tienen pagos. */
  estado_cobro?: EstadoCobro | null
  total_cobrado?: string | null
  attended_by_user_id?: number | null
  cobro_resumen?: CobroResumen[] | null
  cobro_sin_cargo_motivo?: string | null
  /** `express`: consulta que no se agendó y se registró al cobrarla. */
  origen?: OrigenCita | null
}

/** Bloque `cobro` del PATCH que finaliza la consulta (atómico en el servidor). */
export type CobroAlFinalizar =
  | { modo: 'recepcion' }
  | { modo: 'sin_cargo'; motivo: string }
  | {
      modo: 'cobrado'
      amount: string
      method: PaymentMethod
      service_id?: number
      referencia?: string
      client_request_id: string
    }
