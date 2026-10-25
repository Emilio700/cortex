/**
 * Module→submodule→permission hierarchy definition.
 *
 * This is the single source of truth for how permissions are grouped
 * in the UI. Each permission's action string (e.g. "patients.create")
 * is mapped to a module and submodule.
 */

export interface SubModule {
  label: string
  icon?: string
  actions: string[]  // permission action strings
}

export interface ModuleDef {
  label: string
  icon?: string
  submodules: SubModule[]
}

/**
 * Maps a permission action to its module/submodule group.
 * Order here determines display order in the UI.
 */
export const MODULE_HIERARCHY: ModuleDef[] = [
  {
    // Con los nombres del menú: «Inicio» desde el plan 28 (ya no hay
    // «Dashboard» en la interfaz).
    label: 'Inicio',
    submodules: [
      { label: 'Inicio general', actions: ['dashboard.read'] },
      { label: 'Inicio de administración', actions: ['admin.dashboard.read'] },
      { label: 'Inicio del médico', actions: ['doctor.dashboard.read'] },
    ],
  },
  {
    label: 'Administración',
    submodules: [
      { label: 'Usuarios', actions: ['users.read', 'users.create', 'users.update', 'users.delete'] },
      { label: 'Catálogo de Servicios', actions: ['services.read', 'services.create', 'services.update', 'services.delete'] },
      { label: 'Especialidades', actions: ['services.create', 'services.update'] },
      { label: 'Reportes', actions: ['reports.read'] },
    ],
  },
  {
    label: 'Finanzas',
    submodules: [
      { label: 'Cobros', actions: ['payments.read', 'payments.create'] },
      { label: 'Corte de caja', actions: ['payments.cashcut'] },
      { label: 'Recibos por Correo', actions: ['payments.send_receipt'] },
    ],
  },
  {
    label: 'Secretaría',
    submodules: [
      { label: 'Preregistro (solo historial)', actions: ['preregistration.read', 'preregistration.create', 'preregistration.update', 'preregistration.convert'] },
      { label: 'Agenda', actions: ['appointments.read', 'appointments.create', 'appointments.update', 'appointments.cancel'] },
      { label: 'Pacientes', actions: ['patients.read', 'patients.create', 'patients.update', 'patients.delete'] },
      // Los signos vitales ya no tienen pantalla propia: se capturan desde la
      // cita (Agenda) y desde la consulta. El permiso sigue aquí porque es el
      // que habilita esa captura, sobre todo al médico.
      { label: 'Signos vitales (triage)', actions: ['triage.read', 'triage.create'] },
      { label: 'Documentos', actions: ['documents.read', 'documents.upload', 'documents.update', 'documents.delete', 'documents.correct'] },
    ],
  },
  {
    label: 'Consultorio Médico',
    submodules: [
      { label: 'Inicio del médico', actions: ['doctor.dashboard.read'] },
      { label: 'Mis consultas', actions: ['doctor.appointments.read'] },
      { label: 'Consulta Médica (SOAP)', actions: ['soap_notes.read', 'soap_notes.create', 'soap_notes.update'] },
      { label: 'Historial del Paciente', actions: ['medical_history.read'] },
      { label: 'Recetas', actions: ['prescriptions.read', 'prescriptions.create', 'prescriptions.send_email'] },
      { label: 'Certificados', actions: ['medical_certificates.read', 'medical_certificates.create', 'medical_certificates.send_email'] },
      { label: 'Perfil Médico', actions: ['doctor_profile.read', 'doctor_profile.update'] },
      // Escalas neurológicas (Cortex, feat/escalas-neuro)
      { label: 'Escalas neurológicas', actions: ['clinical_scales.read', 'clinical_scales.write'] },
    ],
  },
  {
    label: 'Horarios',
    submodules: [
      { label: 'Horario Laboral', actions: ['schedule.read', 'schedule.working_hours'] },
      { label: 'Bloqueos de Agenda', actions: ['schedule.blocks.read', 'schedule.blocks'] },
      { label: 'Recordatorios', actions: ['reminders.read', 'reminders.update'] },
    ],
  },
  {
    label: 'Sistema',
    submodules: [
      { label: 'Notificaciones', actions: ['notifications.read'] },
      { label: 'Configuración Global', actions: ['settings.global'] },
      { label: 'Gestión de Permisos', actions: ['permissions.manage'] },
      // base-modulos-extra (tramo A)
      { label: 'Módulos opcionales', actions: ['modulos.manage'] },
      { label: 'Estado de servicios', actions: ['servicios.read'] },
    ],
  },
]

/**
 * Build a quick lookup: action → (moduleLabel, submoduleLabel)
 */
export function buildActionLookup(): Map<string, { module: string; submodule: string }> {
  const map = new Map<string, { module: string; submodule: string }>()
  for (const mod of MODULE_HIERARCHY) {
    for (const sub of mod.submodules) {
      for (const action of sub.actions) {
        map.set(action, { module: mod.label, submodule: sub.label })
      }
    }
  }
  return map
}
