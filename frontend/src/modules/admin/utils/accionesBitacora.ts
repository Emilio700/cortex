/**
 * Cómo se lee cada acción de la bitácora (plan 29, lote 5).
 *
 * El servidor guarda códigos («soap_note.created»); quien audita necesita
 * leer «Creó la nota de consulta». Primero se busca la acción completa; si no
 * está, se arma con la entidad y el verbo; si tampoco, queda el código, que
 * siempre se puede buscar. Nunca se inventa: el código va también en el
 * `title` de la celda.
 */

const ACCIONES: Record<string, string> = {
  'auth.session_created': 'Inició sesión',
  'auth.session_refreshed': 'Renovó su sesión',
  'auth.session_revoked': 'Cerró una sesión',
  'auth.sessions_revoked': 'Cerró todas sus sesiones',
  'auth.mfa_enrolled': 'Activó la verificación en dos pasos',
  'auth.mfa_failed': 'Falló la verificación en dos pasos',
  'auth.mfa_recovery_used': 'Usó un código de recuperación',
  'auth.refresh_reuse_detected': 'Se detectó una sesión reutilizada',
  'password.changed': 'Cambió su contraseña',
  'medical_history.read': 'Consultó el expediente',
  'document.list_viewed': 'Consultó la lista de documentos',
  'document.metadata_viewed': 'Consultó los datos de un documento',
  'appointment.consultation_started': 'Abrió la consulta (en consulta)',
  'appointment.consultation_left': 'Salió de la consulta',
  'appointment.reopened': 'Reabrió la consulta',
  'appointment.sin_cargo': 'Marcó la consulta sin cargo',
  'appointment.express_created': 'Registró una consulta exprés',
  'appointment.confirmation_resent': 'Reenvió la confirmación de la cita',
  'diagnostic_order.batch_printed': 'Imprimió varias órdenes',
  'diagnostic_order.batch_pdf_generated': 'Generó el PDF de varias órdenes',
  'diagnostic_order.status_changed': 'Cambió el estado de una orden',
  'diagnostic_order_group.created': 'Emitió un grupo de órdenes',
  'diagnostic_order_group.pdf_generated': 'Generó el PDF de un grupo de órdenes',
  'diagnostic_result.attachment_uploaded': 'Anexó el archivo de un resultado',
  'diagnostic_result.critical_reopened': 'Reabrió un resultado crítico',
  'care_team.member_granted': 'Dio acceso al equipo tratante',
  'care_team.member_revoked': 'Quitó acceso al equipo tratante',
  'user.doctoras_que_apoya.updated': 'Cambió las doctoras que apoya',
  'permissions.updated': 'Cambió permisos',
  'tenant.switch': 'Cambió de sucursal',
  'notification.dismissed': 'Descartó un aviso',
  'reminder_preferences.updated': 'Cambió sus recordatorios',
  'clinical_consent.draft_created': 'Preparó un consentimiento',
}

const ENTIDADES: Record<string, string> = {
  appointment: 'la cita',
  patient: 'la paciente',
  soap_note: 'la nota de consulta',
  prescription: 'la receta',
  medical_certificate: 'el certificado',
  certificate: 'el certificado',
  triage: 'los signos vitales',
  payment: 'el pago',
  document: 'el documento',
  clinical_image: 'la imagen clínica',
  clinical_consent: 'el consentimiento',
  clinical_episode: 'el episodio clínico',
  pregnancy: 'el embarazo',
  prenatal_visit: 'el control prenatal',
  pregnancy_dating_event: 'la datación del embarazo',
  fetal_record: 'el registro fetal',
  fetal_assessment: 'la valoración fetal',
  prenatal_milestone: 'el hito prenatal',
  patient_immunization: 'la vacuna',
  medication_exposure: 'el medicamento en seguimiento',
  medication_monitoring_plan: 'el plan de vigilancia',
  diagnostic_order: 'la orden de estudio',
  diagnostic_result: 'el resultado',
  preregistration: 'el preregistro',
  user: 'el usuario',
  custom_role: 'el rol',
  tenant: 'la sucursal',
  consultation_room: 'la sala',
  specialty: 'la especialidad',
  schedule_block: 'el bloqueo de agenda',
  working_hours: 'el horario',
}

const VERBOS: Record<string, string> = {
  created: 'Creó',
  create: 'Creó',
  updated: 'Modificó',
  update: 'Modificó',
  deleted: 'Borró',
  deactivated: 'Desactivó',
  activate: 'Activó o desactivó',
  cancelled: 'Canceló',
  signed: 'Firmó',
  revoked: 'Revocó',
  downloaded: 'Descargó',
  uploaded: 'Subió',
  emailed: 'Envió por correo',
  printed: 'Imprimió',
  pdf_generated: 'Generó el PDF de',
  delivered: 'Marcó como entregada',
  converted: 'Convirtió en paciente',
  voided: 'Anuló',
  viewed: 'Consultó',
  read: 'Consultó',
}

/** «Creó la nota de consulta», o el código si no hay cómo decirlo. */
export const etiquetaDeAccion = (accion: string): string => {
  if (ACCIONES[accion]) return ACCIONES[accion]
  const punto = accion.indexOf('.')
  if (punto > 0) {
    const entidad = ENTIDADES[accion.slice(0, punto)]
    const verbo = VERBOS[accion.slice(punto + 1)]
    if (entidad && verbo) return `${verbo} ${entidad}`
  }
  return accion
}
