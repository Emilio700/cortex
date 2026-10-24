export type PregnancyStatus = 'active' | 'completed' | 'archived'
export type PregnancyDatingStatus = 'pending' | 'preliminary' | 'confirmed' | 'suboptimally_dated'

export interface Pregnancy {
  id: number
  patient_id: number
  doctor_id: number
  status: PregnancyStatus
  last_menstrual_period?: string | null
  estimated_delivery_date?: string | null
  dating_method?: string | null
  dating_status: PregnancyDatingStatus | string
  estimated_delivery_date_source?: string | null
  estimated_delivery_date_confirmed_at?: string | null
  confirmed_by_user_id?: number | null
  dating_notes?: string | null
  is_multiple_gestation?: boolean
  fetus_count?: number | null
  conception_method?: string | null
  high_risk_status: string
  outcome: string
  notes?: string | null
  /** Fecha de la próxima revisión que vale: la que la doctora aceptó o movió. */
  next_review_on?: string | null
  /** Lo que propuso la regla de intervalos, para saber si se ajustó. */
  next_review_suggested_on?: string | null
  next_review_adjusted_by_user_id?: number | null
  next_review_adjusted_at?: string | null
}

export interface PregnancyCollection {
  items: Pregnancy[]
  total: number
}

export type FetalMovementStatus = 'reported' | 'not_reported' | 'not_assessed'
export type FetalPresentation = 'cephalic' | 'breech' | 'transverse' | 'other' | 'not_assessed'

export interface PregnancyCreate {
  patient_id: number
  last_menstrual_period?: string
  estimated_delivery_date?: string
  dating_method?: string
  dating_status?: PregnancyDatingStatus
  estimated_delivery_date_source?: string
  is_multiple_gestation?: boolean
  fetus_count?: number
  conception_method?: string
  notes?: string
}

export interface PrenatalVisitCreate {
  appointment_id?: number
  visit_date: string
  gestational_age_weeks?: number
  maternal_weight_kg?: number
  systolic_bp?: number
  diastolic_bp?: number
  fundal_height_cm?: number
  fetal_heart_rate_bpm?: number
  fetal_movements?: FetalMovementStatus
  fetal_presentation?: FetalPresentation
  maternal_observations?: string
  fetal_observations?: string
  plan_notes?: string
  next_visit_on?: string
}
