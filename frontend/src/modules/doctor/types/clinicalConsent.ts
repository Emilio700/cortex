export type ConsentStatus = 'draft' | 'signed' | 'rejected' | 'revoked' | 'cancelled'

export interface ConsentTemplate {
  consent_type: string
  title: string
  summary: string
  acknowledgements: string[]
  allows_photos: boolean
  requires_pregnancy_test: boolean
  allows_transfusion_choice: boolean
}

export interface ClinicalConsent {
  id: number
  patient_id: number
  appointment_id?: number | null
  consent_type: string
  template_version: string
  status: ConsentStatus
  title: string
  procedure_name?: string | null
  diagnosis?: string | null
  rendered_body: string
  field_values: Record<string, unknown>
  acknowledgements: string[]
  patient_signed_name?: string | null
  patient_signed_at?: string | null
  revoked_reason?: string | null
  cancelled_reason?: string | null
  cancelled_at?: string | null
  cancelled_by_user_id?: number | null
  cancelled_by_name?: string | null
  created_at: string
}

export interface ClinicalConsentPage { items: ClinicalConsent[]; total: number }
