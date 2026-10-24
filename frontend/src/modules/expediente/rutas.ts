/** La ruta del expediente único (plan 32, punto 6): la misma para todos los roles. */
export const rutaDelExpediente = (patientId: number | string) => `/pacientes/${patientId}/expediente`
