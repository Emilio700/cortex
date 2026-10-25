// Matriz de permisos de `registros` por tipo y rutas de cada tipo. Sin dependencias (la usan pruebas).
// Espejo de api/src/permissions.ts (REGISTROS_PERMISOS): registros-permisos.test.ts verifica que coincidan.
import type { Rol, TipoRegistro } from './types'

const TODOS: Rol[] = ['admin', 'medico', 'enfermeria', 'recepcion']
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
  inventario: { read: TODOS, write: CLINICO_R },
  'movimiento-inventario': { read: TODOS, write: CLINICO_R },
  tarea: { read: TODOS, write: TODOS }, // sin detalle clínico: la ve todo el equipo
  encuesta: { read: ['admin', 'medico', 'recepcion'], write: ['admin', 'medico', 'recepcion'] },
}

/** Matriz pura (sin considerar el modo). Tipo desconocido → false (el servidor responde 400 tipo_no_permitido). */
export function permisoRegistro(rol: Rol, tipo: TipoRegistro, op: 'read' | 'write'): boolean {
  const p = Object.prototype.hasOwnProperty.call(REGISTROS_PERMISOS, tipo) ? REGISTROS_PERMISOS[tipo] : undefined
  return !!p && p[op].includes(rol)
}

/** Etiqueta y ruta del módulo que muestra cada tipo (línea de tiempo del paciente, bitácora, pendientes). */
export const REGISTRO_INFO: Record<string, { label: string; ruta: string }> = {
  prenatal: { label: 'Control prenatal', ruta: '/prenatal' },
  vacuna: { label: 'Vacuna', ruta: '/vacunacion' },
  desarrollo: { label: 'Desarrollo infantil', ruta: '/desarrollo' },
  'agudeza-visual': { label: 'Agudeza visual', ruta: '/vision' },
  audiometria: { label: 'Audiometría', ruta: '/audiometria' },
  tamizaje: { label: 'Tamizaje', ruta: '/tamizajes' },
  triaje: { label: 'Triaje', ruta: '/triaje' },
  enfermeria: { label: 'Hoja de enfermería', ruta: '/enfermeria' },
  nutricion: { label: 'Nutrición', ruta: '/nutricion' },
  orden: { label: 'Orden de estudios', ruta: '/ordenes' },
  certificado: { label: 'Certificado', ruta: '/certificados' },
  referencia: { label: 'Referencia', ruta: '/certificados' },
  inventario: { label: 'Inventario', ruta: '/inventario' },
  'movimiento-inventario': { label: 'Movimiento de inventario', ruta: '/inventario' },
  tarea: { label: 'Tarea', ruta: '/tareas' },
  encuesta: { label: 'Encuesta', ruta: '/encuestas' },
}
export const registroLabel = (tipo: string) => REGISTRO_INFO[tipo]?.label ?? tipo
