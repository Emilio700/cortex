// Registro central de módulos: ruta, nombre, icono y grupo del menú.
// Cada módulo vive en src/modules/<id>/index.tsx y exporta un componente por defecto.
// `roles`: quién puede abrir el módulo en modo servidor (sin `roles` = todos). Es el único lugar
// donde se define el mapa rol → módulo; el servidor aplica los permisos reales (docs/api.md).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { Rol, User } from '../lib/types'
import type { Mode } from '../lib/api'
import {
  Home, Users, CalendarDays, Stethoscope, FileText, PenLine, Wallet, BarChart3, Settings, Calculator, ClipboardList,
  Baby, Smile, PersonStanding, Bluetooth, HeartPulse, Ruler, Camera, Video, ScanLine, Box, Microscope, Activity,
  FileSearch, Mic, Sparkles, Server, Heart, UserCog, ScrollText, MessagesSquare, Syringe, Milestone, Eye, Ear,
  ShieldCheck, Package, FlaskConical, FileBadge, Siren, ClipboardPlus, Apple, ListTodo, ThumbsUp, Share2, type LucideIcon,
} from 'lucide-react'

export interface ModuleDef {
  id: string
  path: string // ruta (sin "/"), puede terminar en "/*" para subrutas
  label: string
  icon: LucideIcon
  group: string
  description: string
  component: LazyExoticComponent<ComponentType>
  hidden?: boolean // no aparece en el menú
  roles?: Rol[] // roles con acceso en modo servidor (sin definir = todos)
  serverOnly?: boolean // solo existe en modo servidor (en demo se oculta del menú)
  public?: boolean // no requiere sesión (página de verificación)
}

// Grupos de roles según la matriz de permisos
const CLINICO: Rol[] = ['admin', 'medico', 'enfermeria'] // leen expediente clínico / escriben observaciones
const MEDICO: Rol[] = ['admin', 'medico']
const ADMIN: Rol[] = ['admin']

export const GROUPS = ['Consultorio', 'Enfermería y urgencias', 'Documentos y caja', 'Especialidades', 'Herramientas clínicas', 'Cámara y aparatos', 'Imagen y señales', 'Inteligencia artificial', 'Operación', 'Sistema'] as const

export const MODULES: ModuleDef[] = [
  { id: 'inicio', path: '', label: 'Inicio', icon: Home, group: 'Consultorio', description: 'Resumen del día', component: lazy(() => import('./inicio')) },
  { id: 'pacientes', path: 'pacientes/*', label: 'Pacientes', icon: Users, group: 'Consultorio', description: 'Expediente clínico, línea de tiempo y gráficas', component: lazy(() => import('./pacientes')) },
  { id: 'agenda', path: 'agenda', label: 'Agenda', icon: CalendarDays, group: 'Consultorio', description: 'Citas, sala de espera y recordatorios', component: lazy(() => import('./agenda')) },
  { id: 'consulta', path: 'consulta/*', label: 'Consulta', icon: Stethoscope, group: 'Consultorio', description: 'Nota SOAP con plantillas, CIE-10 y dictado', roles: CLINICO, component: lazy(() => import('./consulta')) },

  { id: 'triaje', path: 'triaje', label: 'Triaje', icon: Siren, group: 'Enfermería y urgencias', description: 'Clasificación ESI y prioridad de atención', roles: CLINICO, component: lazy(() => import('./triaje')) },
  { id: 'enfermeria', path: 'enfermeria', label: 'Hoja de enfermería', icon: ClipboardPlus, group: 'Enfermería y urgencias', description: 'Signos por turno, balance hídrico, medicamentos e infusiones', roles: CLINICO, component: lazy(() => import('./enfermeria')) },

  { id: 'prenatal', path: 'prenatal', label: 'Control prenatal', icon: Baby, group: 'Especialidades', description: 'Carnet perinatal, altura uterina, biometría fetal', roles: CLINICO, component: lazy(() => import('./prenatal')) },
  { id: 'vacunacion', path: 'vacunacion', label: 'Vacunación', icon: Syringe, group: 'Especialidades', description: 'Cartilla de vacunación y pendientes', roles: CLINICO, component: lazy(() => import('./vacunacion')) },
  { id: 'desarrollo', path: 'desarrollo', label: 'Desarrollo infantil', icon: Milestone, group: 'Especialidades', description: 'Hitos del desarrollo por edad', roles: CLINICO, component: lazy(() => import('./desarrollo')) },
  { id: 'vision', path: 'vision', label: 'Agudeza visual', icon: Eye, group: 'Especialidades', description: 'Optotipos calibrados y rejilla de Amsler', roles: CLINICO, component: lazy(() => import('./vision')) },
  { id: 'audiometria', path: 'audiometria', label: 'Audiometría', icon: Ear, group: 'Especialidades', description: 'Audiograma y tamiz auditivo', roles: CLINICO, component: lazy(() => import('./audiometria')) },
  { id: 'nutricion', path: 'nutricion', label: 'Nutrición', icon: Apple, group: 'Especialidades', description: 'Requerimientos y plan por equivalentes', roles: CLINICO, component: lazy(() => import('./nutricion')) },
  { id: 'tamizajes', path: 'tamizajes', label: 'Prevención', icon: ShieldCheck, group: 'Especialidades', description: 'Tamizajes y detecciones pendientes por edad y sexo', roles: CLINICO, component: lazy(() => import('./tamizajes')) },

  { id: 'receta', path: 'receta', label: 'Receta', icon: FileText, group: 'Documentos y caja', description: 'Receta PDF con QR verificable', roles: MEDICO, component: lazy(() => import('./receta')) },
  { id: 'verificar', path: 'verificar', label: 'Verificar receta', icon: FileText, group: 'Documentos y caja', description: 'Página pública de verificación', component: lazy(() => import('./verificar')), hidden: true, public: true },
  { id: 'restablecer', path: 'restablecer', label: 'Restablecer contraseña', icon: UserCog, group: 'Sistema', description: 'Nueva contraseña con el enlace del correo', component: lazy(() => import('./restablecer')), hidden: true, public: true },
  { id: 'consentimientos', path: 'consentimientos', label: 'Consentimientos', icon: PenLine, group: 'Documentos y caja', description: 'Firma en tablet y PDF', component: lazy(() => import('./consentimientos')) },
  { id: 'caja', path: 'caja', label: 'Caja y facturación', icon: Wallet, group: 'Documentos y caja', description: 'Cobros, corte y CFDI 4.0', roles: ['admin', 'medico', 'recepcion'], component: lazy(() => import('./caja')) },
  { id: 'reportes', path: 'reportes', label: 'Reportes', icon: BarChart3, group: 'Documentos y caja', description: 'Indicadores del consultorio', roles: MEDICO, component: lazy(() => import('./reportes')) },

  { id: 'calculadoras', path: 'calculadoras', label: 'Calculadoras', icon: Calculator, group: 'Herramientas clínicas', description: 'IMC, TFG, FPP, QTc, riesgo y dosis', roles: CLINICO, component: lazy(() => import('./calculadoras')) },
  { id: 'escalas', path: 'escalas', label: 'Escalas', icon: ClipboardList, group: 'Herramientas clínicas', description: 'PHQ-9, GAD-7, Glasgow y más', roles: CLINICO, component: lazy(() => import('./escalas')) },
  { id: 'crecimiento', path: 'crecimiento', label: 'Crecimiento', icon: Baby, group: 'Herramientas clínicas', description: 'Curvas y percentiles OMS', roles: CLINICO, component: lazy(() => import('./crecimiento')) },
  { id: 'odontograma', path: 'odontograma', label: 'Odontograma', icon: Smile, group: 'Herramientas clínicas', description: 'Odontograma FDI y presupuesto', roles: CLINICO, component: lazy(() => import('./odontograma')) },
  { id: 'anatomia', path: 'anatomia', label: 'Anatomía 3D', icon: PersonStanding, group: 'Herramientas clínicas', description: 'Cuerpo clicable y realidad aumentada', roles: CLINICO, component: lazy(() => import('./anatomia')) },

  { id: 'vitales', path: 'vitales', label: 'Signos vitales', icon: Bluetooth, group: 'Cámara y aparatos', description: 'Aparatos Bluetooth y captura manual', roles: CLINICO, component: lazy(() => import('./vitales')) },
  { id: 'pulso', path: 'pulso', label: 'Pulso por cámara', icon: HeartPulse, group: 'Cámara y aparatos', description: 'rPPG sin contacto', roles: CLINICO, component: lazy(() => import('./pulso')) },
  { id: 'goniometro', path: 'goniometro', label: 'Goniómetro', icon: Ruler, group: 'Cámara y aparatos', description: 'Rango de movimiento con IA', roles: CLINICO, component: lazy(() => import('./goniometro')) },
  { id: 'fotos', path: 'fotos', label: 'Fotos clínicas', icon: Camera, group: 'Cámara y aparatos', description: 'Captura, antes/después y medición', roles: CLINICO, component: lazy(() => import('./fotos')) },
  { id: 'telemedicina', path: 'telemedicina', label: 'Telemedicina', icon: Video, group: 'Cámara y aparatos', description: 'Videoconsulta y pizarra', roles: CLINICO, component: lazy(() => import('./telemedicina')) },

  { id: 'dicom', path: 'dicom', label: 'Visor DICOM', icon: ScanLine, group: 'Imagen y señales', description: 'Rayos X, TAC, RM, US', roles: CLINICO, component: lazy(() => import('./dicom')) },
  { id: 'visor3d', path: 'visor3d', label: 'Visor 3D', icon: Box, group: 'Imagen y señales', description: 'Volúmenes y mallas 3D (NiiVue)', roles: CLINICO, component: lazy(() => import('./visor3d')) },
  { id: 'patologia', path: 'patologia', label: 'Patología', icon: Microscope, group: 'Imagen y señales', description: 'Zoom profundo y anotaciones', roles: CLINICO, component: lazy(() => import('./patologia')) },
  { id: 'cardio3d', path: 'cardio3d', label: 'Cardio 3D', icon: Heart, group: 'Imagen y señales', description: 'Corazón 3D, angiografía simulada y territorios', roles: CLINICO, component: lazy(() => import('./cardio3d')) },
  { id: 'ecg', path: 'ecg', label: 'ECG', icon: Activity, group: 'Imagen y señales', description: 'Trazo, frecuencia y variabilidad', roles: CLINICO, component: lazy(() => import('./ecg')) },

  { id: 'ocr', path: 'ocr', label: 'Laboratorios (OCR)', icon: FileSearch, group: 'Inteligencia artificial', description: 'Foto del laboratorio a datos', roles: CLINICO, component: lazy(() => import('./ocr')) },
  { id: 'dictado', path: 'dictado', label: 'Dictado', icon: Mic, group: 'Inteligencia artificial', description: 'Voz a texto (navegador o Whisper)', roles: MEDICO, component: lazy(() => import('./dictado')) },
  { id: 'asistente', path: 'asistente', label: 'Asistente IA', icon: Sparkles, group: 'Inteligencia artificial', description: 'Resumen del paciente y nota SOAP', roles: MEDICO, component: lazy(() => import('./asistente')) },

  { id: 'ordenes', path: 'ordenes', label: 'Órdenes de estudios', icon: FlaskConical, group: 'Operación', description: 'Laboratorio y gabinete con seguimiento de resultados', roles: CLINICO, component: lazy(() => import('./ordenes')) },
  { id: 'certificados', path: 'certificados', label: 'Certificados', icon: FileBadge, group: 'Operación', description: 'Certificados, incapacidades y referencias', roles: MEDICO, component: lazy(() => import('./certificados')) },
  { id: 'inventario', path: 'inventario', label: 'Inventario', icon: Package, group: 'Operación', description: 'Medicamentos e insumos, lotes y caducidades', roles: ['admin', 'medico', 'enfermeria', 'recepcion'], component: lazy(() => import('./inventario')) },
  { id: 'tareas', path: 'tareas', label: 'Tareas', icon: ListTodo, group: 'Operación', description: 'Pendientes del equipo y seguimientos', component: lazy(() => import('./tareas')) },
  { id: 'encuestas', path: 'encuestas', label: 'Satisfacción', icon: ThumbsUp, group: 'Operación', description: 'Encuestas a pacientes y NPS', roles: ['admin', 'medico', 'recepcion'], component: lazy(() => import('./encuestas')) },
  { id: 'interoperabilidad', path: 'interoperabilidad', label: 'Interoperabilidad', icon: Share2, group: 'Sistema', description: 'Exportar e importar FHIR R4', roles: MEDICO, component: lazy(() => import('./interoperabilidad')) },

  { id: 'servicios', path: 'servicios', label: 'Servicios', icon: Server, group: 'Sistema', description: 'Orthanc, Whisper, Presidio (servidor)', roles: MEDICO, component: lazy(() => import('./servicios')) },
  { id: 'configuracion', path: 'configuracion', label: 'Configuración', icon: Settings, group: 'Sistema', description: 'Perfil, llaves, respaldo', component: lazy(() => import('./configuracion')) },
  { id: 'mensajes', path: 'mensajes', label: 'Mensajes', icon: MessagesSquare, group: 'Sistema', description: 'Recordatorios por WhatsApp y correo', roles: ['admin', 'medico', 'recepcion'], serverOnly: true, component: lazy(() => import('./mensajes')) },
  { id: 'usuarios', path: 'usuarios', label: 'Usuarios', icon: UserCog, group: 'Sistema', description: 'Cuentas, roles y contraseñas', roles: ADMIN, serverOnly: true, component: lazy(() => import('./usuarios')) },
  { id: 'bitacora', path: 'bitacora', label: 'Bitácora', icon: ScrollText, group: 'Sistema', description: 'Registro de accesos y cambios (auditoría)', roles: ADMIN, serverOnly: true, component: lazy(() => import('./bitacora')) },
]

/** ¿Puede este usuario abrir el módulo? En demo todo excepto lo exclusivo del servidor. */
export function canAccess(m: ModuleDef, mode: Mode | null, user: User | null): boolean {
  if (m.public) return true
  if (mode !== 'server') return !m.serverOnly
  if (!user) return false
  return !m.roles || m.roles.includes(user.rol)
}

/** ¿Puede abrir esta ruta (p. ej. '/consulta/nueva')? Útil para ocultar accesos directos. */
export function canOpenPath(path: string, mode: Mode | null, user: User | null): boolean {
  const seg = path.replace(/^\//, '').split(/[/?]/)[0]
  const m = MODULES.find((x) => x.path.replace('/*', '') === seg)
  return !m || canAccess(m, mode, user)
}
