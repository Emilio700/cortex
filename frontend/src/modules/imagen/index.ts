/**
 * Módulo de imagen médica de Cortex.
 *
 * Superficie pública: lo único que el resto de la aplicación debe importar.
 * Todo lo demás (dominio, servicios, componentes internos) se queda dentro.
 *
 * El acomodo es deliberado:
 *
 * - `dominio/`  — tipos y cálculos puros (orden de series, evolución de una
 *                 medición). Se prueban sin navegador ni red.
 * - `servicios/`— llamadas al API y arranque de Cornerstone. Nadie más arma
 *                 rutas ni cabeceras.
 * - `componentes/` — piezas de interfaz sin estado propio de negocio.
 * - `paginas/`  — la pantalla que une todo, y solo esa.
 *
 * El análisis (volumetría, segmentación, tractografía) no es otro módulo: es un
 * derivado del estudio y aparece en la pestaña «Estudio» de la misma pantalla,
 * marcado con su motor y su versión. Así el médico no cambia de contexto para
 * ver lo que el sistema calculó sobre la imagen que tiene delante.
 */
export { default as EstudiosDelPaciente } from './componentes/EstudiosDelPaciente'
export { default as VisorEstudioPage } from './paginas/VisorEstudioPage'
export type { EstudioDicom, SerieDicom, AnotacionDicom } from './dominio/tipos'
