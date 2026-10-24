export type ClinicalEpisodeType =
  | 'routine'
  | 'pregnancy'
  | 'bleeding'
  | 'infection'
  | 'breast'
  | 'cervix'
  | 'menopause'
  | 'contraception'
  | 'fertility'
  | 'procedure'
  | 'other'
  | 'spine'
  | 'brain_tumor'
  | 'cerebrovascular'
  | 'neurotrauma'
  | 'hydrocephalus'
  | 'epilepsy'
  | 'chronic_pain'
  | 'peripheral_nerve'
  | 'movement_disorder'

export type ClinicalEpisodeStatus = 'active' | 'monitoring' | 'resolved' | 'archived'

export interface ClinicalEpisode {
  id: number
  tenant_id: number
  patient_id: number
  created_by_user_id: number
  episode_type: ClinicalEpisodeType
  status: ClinicalEpisodeStatus
  title: string
  summary?: string | null
  started_on: string
  follow_up_on?: string | null
  next_action?: string | null
  resolved_on?: string | null
  created_at: string
  updated_at: string
}

export interface ClinicalEpisodePage {
  items: ClinicalEpisode[]
  total: number
}

export interface ClinicalRecordSummary {
  patient_id: number
  active_episodes: ClinicalEpisode[]
  last_appointment_at?: string | null
  next_appointment_at?: string | null
  open_follow_ups: number
}

export interface ClinicalEpisodeCreate {
  patient_id: number
  episode_type: ClinicalEpisodeType
  title: string
  summary?: string
  started_on: string
  follow_up_on?: string
  next_action?: string
}
