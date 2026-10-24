/**
 * La versión de GEMS que se está usando.
 *
 * Una sola fuente: `version` de package.json, que Vite inyecta en el build.
 * Quien la muestre (el pie, el panel de desarrollador, «Acerca de») la toma de
 * aquí; escribirla a mano dejó «v1.0.0» en pantalla con la 1.1.0 desplegada.
 */
export const VERSION_GEMS: string = __GEMS_VERSION__
