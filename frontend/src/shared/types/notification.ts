/** Qué tanto pide un aviso. La decide el servidor (plan 27, §3.2). */
export type PrioridadAviso = 'informativo' | 'accionable' | 'urgente'

/** Cómo dejó de pedir algo: lo vio el servidor, alguien lo descartó o se cerró al migrar. */
export type ResolucionAviso = 'auto' | 'descartado' | 'migracion'

export interface Notification {
  id: number
  type: string
  title: string
  message: string
  entity_type: string | null
  entity_id: number | null
  is_read: boolean
  created_at: string
  priority?: PrioridadAviso
  resolved_at?: string | null
  resolution?: ResolucionAviso | null
  resolved_by_name?: string | null
  /** Pantalla del «Ir» para esta persona; nula si no puede abrir ninguna. */
  ruta?: string | null
  tenant_id?: number | null
  /** De una sucursal que no es la activa: no lleva «Ir» y dice de cuál es. */
  de_otra_sucursal?: boolean
  sucursal?: string | null
}

export interface NotificationListResponse {
  unread_count: number
  /** Accionables y urgentes sin resolver: el número rojo de la campana. */
  abiertos_count?: number
  total?: number
  items: Notification[]
}

export interface EstadoAvisos {
  sin_leer: number
  abiertos: { accionable: number; urgente: number }
  ultimo_id: number | null
  ultima_resolucion: string | null
  hora_servidor: string
}

export interface PreferenciasAvisos {
  sonido: boolean
  navegador: boolean
  recordatorio_una_hora: boolean
  tipos_silenciados: string[]
  /** Sólo lectura: los tipos informativos, únicos que se pueden silenciar. */
  tipos_silenciables: string[]
}
