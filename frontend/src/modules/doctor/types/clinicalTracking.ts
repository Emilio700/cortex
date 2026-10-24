export type OrderPriority = 'routine' | 'preferential' | 'urgent'
export type DiagnosticOrderStatus =
  | 'draft'
  | 'ordered'
  | 'accepted'
  | 'scheduled'
  | 'collected'
  | 'in_process'
  | 'result_received'
  | 'reviewed'
  | 'cancelled'
  | 'rejected'

/**
 * Lo que la interfaz muestra de una orden (plan 26, D-1). GEMS no tiene
 * laboratorio propio: aceptada, programada, muestra tomada y en proceso no se
 * pueden medir y se ven como «pendiente». Lo calcula el servidor.
 */
export type EstadoVisible =
  | 'borrador'
  | 'pendiente'
  | 'resultado_recibido'
  | 'revisada'
  | 'cancelada'
  | 'rechazada'

export interface DiagnosticOrder {
  id: number
  patient_id: number
  pregnancy_id?: number | null
  appointment_id?: number | null
  /** Nulo en una orden suelta; el id del lote cuando se pidió agrupada (O-02). */
  order_group_id?: number | null
  category: string
  study_name: string
  clinical_indication: string
  priority: OrderPriority | string
  requested_on: string
  desired_on?: string | null
  preparation_instructions?: string | null
  destination?: string | null
  status: DiagnosticOrderStatus | string
  /** Estados a los que la orden puede pasar a mano (O-05); `[]` en un estado terminal. */
  allowed_transitions?: string[]
  /** Estado tal como lo ve la interfaz (D-1). */
  estado_visible?: EstadoVisible | string
  /** Las transiciones que la interfaz ofrece: solo `ordered`, `cancelled` y `rejected` (D-1). */
  acciones_de_estado?: string[]
  specimen_or_body_site?: string | null
  /** Médico autora; un papel lleva una sola firma (M5). */
  doctor_id?: number | null
  status_reason?: string | null
  status_changed_at?: string | null
  status_changed_by_user_id?: number | null
  created_at: string
}

/**
 * Un resultado ligado a una orden (O-08). Cuando lo subió recepción trae el
 * documento (`patient_document_id`) para abrir el PDF o la foto.
 */
export interface DiagnosticResult {
  id: number
  review_status: string
  collected_on?: string | null
  resulted_on?: string | null
  reporting_provider?: string | null
  report_text?: string | null
  is_critical: boolean
  clinician_interpretation?: string | null
  next_action?: string | null
  reviewed_at?: string | null
  reviewed_by_user_id?: number | null
  patient_document_id?: number | null
  document_file_name?: string | null
  document_mime_type?: string | null
  /** Cuándo se documentó que se le comunicó al paciente (plan 26, B-7). */
  communicated_at?: string | null
  communication_note?: string | null
  recorded_by_user_id?: number | null
  /** Estado de la orden después de guardar este resultado (lo dice el servidor). */
  order_status?: string | null
  /** Valoración de este resultado (D-9); «critico» abre la incidencia. */
  valoracion?: string | null
  /** Medio con que se comunicó o entregó al paciente (D-8). */
  communication_channel?: string | null
  reviewed_in_appointment_id?: number | null
  /** La incidencia crítica de la orden sigue abierta (D-8). */
  incidencia_abierta?: boolean
  incidencia_cerrada_at?: string | null
  incidencia_cerrada_por?: 'comunicacion' | 'consulta' | null
  /**
   * Qué hizo la cita mandada con la revisión (R1): `aplicada` = sirvió para
   * cerrar; `cita_de_otro_dia` = la revisión se guardó pero la cita no es de
   * hoy y la incidencia sigue abierta; `null` = no se mandó cita.
   */
  cierre_en_consulta?: 'aplicada' | 'cita_de_otro_dia' | null
  /** Anulado (plan 29, lote 9): solo la administración los recibe. */
  anulado_at?: string | null
  anulado_motivo?: string | null
  created_at: string
  /** Rastro con autor (plan 32, punto 3); sin nombre con fecha = «sin registro». */
  recorded_by_nombre?: string | null
  reviewed_by_nombre?: string | null
  communicated_by_nombre?: string | null
  interpretacion_escrita_at?: string | null
  interpretacion_escrita_por_nombre?: string | null
  interpretacion_editada_at?: string | null
  interpretacion_editada_por_nombre?: string | null
}

/** Lo que el servidor hizo al anular un resultado (plan 29, lote 9). */
export interface AnulacionDeResultado {
  result_id: number
  order_id: number
  estado_anterior: string
  order_status: string
  estado_visible: string
  resultados_vigentes: number
  documento_anulado: boolean
  incidencia: 'cerrada' | 'sigue_abierta' | 'sin_incidencia'
}

/** Una orden del historial del expediente con todos sus resultados (O-08). */
export interface OrdenConResultados extends DiagnosticOrder {
  results: DiagnosticResult[]
  /** «Última actualización: … · …» (plan 32, punto 3). */
  ultima_actualizacion_at?: string | null
  ultima_actualizacion_por?: string | null
}

/**
 * Lote que agrupa varias órdenes bajo una sola solicitud (O-02).
 * Cada estudio sigue siendo su propia orden (`orders[]`), con su estado y su
 * resultado; el lote sólo los junta para imprimirlos en un mismo papel.
 */
export interface DiagnosticOrderGroup {
  id: number
  patient_id: number
  doctor_id: number
  appointment_id?: number | null
  clinical_indication: string
  requested_on: string
  created_at: string
  orders: DiagnosticOrder[]
}

export interface PatientImmunization {
  id: number
  patient_id: number
  pregnancy_id?: number | null
  vaccine_name: string
  product_name?: string | null
  lot_number?: string | null
  administered_on?: string | null
  source: string
  status: string
  reason?: string | null
  created_at: string
}

export interface MedicationExposure {
  id: number
  patient_id: number
  pregnancy_id?: number | null
  medication_name: string
  active_ingredient?: string | null
  dose?: string | null
  frequency?: string | null
  source: string
  review_status: string
  next_review_on?: string | null
  created_at: string
}

export interface TrackingOverview {
  active_pregnancy_id?: number | null
  immunizations: PatientImmunization[]
  medication_exposures: MedicationExposure[]
  diagnostic_orders: DiagnosticOrder[]
}

export interface PregnancyDatingEvent {
  id: number
  pregnancy_id: number
  method: string
  status: string
  proposed_delivery_date?: string | null
  accepted_delivery_date?: string | null
  reason?: string | null
  recorded_at: string
}

export interface PrenatalMilestone {
  id: number
  pregnancy_id: number
  title: string
  status: string
  due_on?: string | null
  notes?: string | null
}

/** Una orden en la bandeja por paciente (plan 26, §3.4): la orden con todos sus resultados. */
export interface OrdenEnBandeja extends OrdenConResultados {
  /** Algún resultado ya tiene documentada la comunicación al paciente. */
  comunicada: boolean
  /**
   * Tiene una incidencia crítica abierta (D-8): se cierra al documentar que se le
   * comunicó o entregó al paciente, o al revisarla dentro de una consulta.
   */
  critico_sin_comunicar: boolean
  /** Alias de `critico_sin_comunicar` con el nombre nuevo. */
  incidencia_abierta?: boolean
  /** Fecha y hora de la cita de la que salió (hora del consultorio). */
  cita_fecha?: string | null
  /** Estado de esa cita: «Ver la consulta» solo se ofrece si ya está atendida. */
  cita_estado?: string | null
  /** Atrasado con el plazo de su médico (plan 32, punto 3). */
  atrasada?: boolean
  dias_sin_resultado?: number | null
  ultimo_seguimiento?: SeguimientoDeOrden | null
}

/** Por qué un estudio sigue sin resultado: quién, cuándo y hasta cuándo. */
export interface SeguimientoDeOrden {
  id: number
  diagnostic_order_id: number
  motivo: string
  motivo_texto: string
  nota?: string | null
  /** Fecha del consultorio (AAAA-MM-DD). */
  revisar_el: string
  registrado_por_user_id: number
  registrado_por_nombre?: string | null
  created_at: string
}

/** Un paciente en la bandeja: sus órdenes, en el orden en que conviene atenderlas. */
export interface PacienteEnBandeja {
  patient_id: number
  patient_name: string
  total_ordenes: number
  por_revisar: number
  tiene_criticos: boolean
  prioridad_maxima: OrderPriority | string
  solicitada_mas_antigua: string
  orders: OrdenEnBandeja[]
}

export type FiltroBandeja =
  | 'activas'
  | 'pendientes'
  | 'por_revisar'
  | 'sin_comunicar'
  | 'criticos'
  | 'todos'
  | 'atrasados'
  | 'urgentes'

/** Los números de la franja de la bandeja, contados en el servidor sobre todas las páginas. */
export interface ResumenBandeja {
  pendientes: number
  por_revisar: number
  sin_comunicar: number
  criticos: number
  atrasados: number
  /** Urgentes y preferentes sin resultado. */
  urgentes: number
  activas: number
}

export interface RespuestaBandeja {
  items: PacienteEnBandeja[]
  /** Pacientes, no órdenes: la bandeja pagina por paciente. */
  total: number
  skip: number
  limit: number
}
