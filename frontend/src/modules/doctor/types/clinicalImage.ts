export type ClinicalImageCategory = 'clinical_photo' | 'reference' | 'ultrasound' | 'procedure' | 'other'

export interface ClinicalImage {
  id: number
  tenant_id: number
  patient_id: number
  appointment_id?: number | null
  clinical_episode_id?: number | null
  uploaded_by_user_id: number
  category: ClinicalImageCategory
  body_region?: string | null
  caption?: string | null
  taken_at: string
  consent_obtained: boolean
  consent_recorded_at?: string | null
  is_reference: boolean
  is_archived: boolean
  file_name: string
  file_size: number
  mime_type: string
  created_at: string
  updated_at: string
}
