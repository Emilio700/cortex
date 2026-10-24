/**
 * TypeScript types for the Admin module (Fase 3.4)
 */
import type { Role } from '../../../shared/types'

/**
 * User creation request (Admin only). No tenant_id: the backend always
 * assigns the caller's own tenant (see backend/app/schemas/user.py).
 */
export interface UserCreate {
  email: string
  full_name: string
  role: Role
  password: string
  /** "Dr.", "Dra." o nulo (sin prefijo). Nunca se adivina por el nombre. */
  tratamiento?: Tratamiento | null
}

export interface UserUpdate {
  full_name?: string
  role?: Role
  is_active?: boolean
  /** Cadena vacía = quitar el tratamiento. */
  tratamiento?: Tratamiento | ''
}

export type Tratamiento = 'Dr.' | 'Dra.'

/**
 * Médicos que apoya una secretaria y si puede ver su corte de caja
 * (plan 23, ajustes del 2026-09-28). Es lo que el servidor dice que quedó.
 */
export interface DoctorasQueApoya {
  secretaria_id: number
  doctor_ids: number[]
  puede_ver_corte: boolean
  permissions_version: number
}

/**
 * Service catalog item (Fase 3.1)
 */
export interface Service {
  id: number
  tenant_id: number
  name: string
  description?: string | null
  price: string
  duration_minutes?: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ServiceCreate {
  name: string
  description?: string
  price: string
  duration_minutes?: number
}

export interface ServiceUpdate {
  name?: string
  description?: string
  price?: string
  duration_minutes?: number
  is_active?: boolean
}

/**
 * Payment / cash-cut (Fase 3.2 / 3.3)
 */
export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  OTHER = 'other',
}

export interface Payment {
  id: number
  tenant_id: number
  patient_id: number
  appointment_id?: number | null
  service_id?: number | null
  received_by_user_id: number
  amount: string
  method: PaymentMethod
  description?: string | null
  notes?: string | null
  paid_at: string
  created_at: string
}

export interface CashCutMethodBreakdown {
  method: PaymentMethod
  total_amount: string
  count: number
}

export interface CashCutReport {
  start_date: string
  end_date: string
  total_amount: string
  total_count: number
  by_method: CashCutMethodBreakdown[]
}

/**
 * Reports summary (Fase 3.7)
 */
export interface AppointmentStatusCount {
  status: string
  count: number
}

export interface DailyCount {
  day: string
  count: number
}

export interface TopServiceRow {
  service_id: number
  service_name: string
  times_charged: number
  total_amount: string
}

export interface ReportsSummary {
  start_date: string
  end_date: string
  appointments_total: number
  appointments_by_status: AppointmentStatusCount[]
  appointments_daily: DailyCount[]
  top_services: TopServiceRow[]
  patients_attended_count: number
  patients_attended_daily: DailyCount[]
}
