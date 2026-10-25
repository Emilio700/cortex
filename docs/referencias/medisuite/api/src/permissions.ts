// Matriz de permisos del contrato (docs/api.md). El servidor la aplica siempre.
import type { Rol } from './types.js'

export const COLLECTIONS = ['patients', 'appointments', 'encounters', 'observations', 'prescriptions', 'documents', 'payments', 'registros'] as const
export type Collection = (typeof COLLECTIONS)[number]

type Perm = { read: boolean; write: boolean }
const R: Perm = { read: true, write: false }
const RW: Perm = { read: true, write: true }
const NO: Perm = { read: false, write: false }

export const MATRIX: Record<Collection | 'users' | 'settings' | 'audit', Record<Rol, Perm>> = {
  patients: { admin: RW, medico: RW, enfermeria: R, recepcion: RW },
  appointments: { admin: RW, medico: RW, enfermeria: R, recepcion: RW },
  encounters: { admin: R, medico: RW, enfermeria: R, recepcion: NO },
  observations: { admin: R, medico: RW, enfermeria: RW, recepcion: NO },
  prescriptions: { admin: R, medico: RW, enfermeria: R, recepcion: NO },
  // Restricciones por tipo de documento: ver documentTipoAllowed.
  documents: { admin: RW, medico: RW, enfermeria: RW, recepcion: RW },
  payments: { admin: RW, medico: R, enfermeria: NO, recepcion: RW },
  // v1.2: el acceso real depende del tipo (REGISTROS_PERMISOS); aquí solo la puerta de entrada.
  registros: { admin: RW, medico: RW, enfermeria: RW, recepcion: RW },
  users: { admin: RW, medico: NO, enfermeria: NO, recepcion: NO },
  settings: { admin: RW, medico: R, enfermeria: R, recepcion: R },
  audit: { admin: R, medico: NO, enfermeria: NO, recepcion: NO },
}

export const can = (rol: Rol, res: keyof typeof MATRIX, op: 'read' | 'write') => MATRIX[res][rol][op]

/** Recepción solo ve/maneja consentimientos y facturas; enfermería solo lee facturas. */
export function documentTipoAllowed(rol: Rol, tipo: string, op: 'read' | 'write'): boolean {
  if (rol === 'recepcion') return tipo === 'consentimiento' || tipo === 'factura'
  if (rol === 'enfermeria' && op === 'write') return tipo !== 'factura'
  return true
}

/** Campos clínicos de paciente que recepción no ve ni puede escribir. */
export const RECEPCION_HIDDEN_PATIENT_FIELDS = ['antecedentes', 'notas', 'medicamentosActuales'] as const

// ---------- v1.2: registros genéricos (permisos por tipo) ----------
// Lista blanca de tipos: un tipo desconocido se rechaza (400 tipo_no_permitido) para que la colección
// genérica no abra un hueco. Cambiar esta matriz exige actualizar src/lib/registros.ts y docs/api.md.
const ROLES_TODOS: Rol[] = ['admin', 'medico', 'enfermeria', 'recepcion']
const CLINICO_R: Rol[] = ['admin', 'medico', 'enfermeria']
const CLINICO_W: Rol[] = ['medico', 'enfermeria']

export const REGISTROS_PERMISOS: Record<string, { read: Rol[]; write: Rol[] }> = {
  prenatal: { read: CLINICO_R, write: CLINICO_W },
  vacuna: { read: CLINICO_R, write: CLINICO_W },
  desarrollo: { read: CLINICO_R, write: CLINICO_W },
  'agudeza-visual': { read: CLINICO_R, write: CLINICO_W },
  audiometria: { read: CLINICO_R, write: CLINICO_W },
  tamizaje: { read: CLINICO_R, write: CLINICO_W },
  triaje: { read: CLINICO_R, write: CLINICO_W },
  enfermeria: { read: CLINICO_R, write: CLINICO_W },
  nutricion: { read: CLINICO_R, write: CLINICO_W },
  orden: { read: CLINICO_R, write: CLINICO_W },
  certificado: { read: CLINICO_R, write: ['medico'] },
  referencia: { read: CLINICO_R, write: ['medico'] },
  inventario: { read: ROLES_TODOS, write: CLINICO_R },
  'movimiento-inventario': { read: ROLES_TODOS, write: CLINICO_R },
  // Las tareas no deben contener detalle clínico: las ve y edita todo el equipo.
  tarea: { read: ROLES_TODOS, write: ROLES_TODOS },
  encuesta: { read: ['admin', 'medico', 'recepcion'], write: ['admin', 'medico', 'recepcion'] },
}
export const TIPOS_REGISTRO = Object.keys(REGISTROS_PERMISOS)

export const registroTipoConocido = (tipo: string) => Object.prototype.hasOwnProperty.call(REGISTROS_PERMISOS, tipo)
export const registroTipoAllowed = (rol: Rol, tipo: string, op: 'read' | 'write') => registroTipoConocido(tipo) && REGISTROS_PERMISOS[tipo][op].includes(rol)
/** Tipos que el rol puede leer (filtro de listas y sincronización). */
export const registroTiposLegibles = (rol: Rol) => TIPOS_REGISTRO.filter((t) => REGISTROS_PERMISOS[t].read.includes(rol))
