/**
 * Módulo de escalas neurológicas de Cortex.
 *
 * Superficie pública: lo único que el resto de la aplicación debe importar.
 *
 * - `dominio/`     — catálogo de escalas como datos y el motor que las calcula.
 *                    Sin React ni red. El servidor repite el cálculo en
 *                    `backend/app/services/escalas.py`; `paridad.json` vigila
 *                    que digan lo mismo.
 * - `servicios/`   — las llamadas al API.
 * - `componentes/` — la sección de la consulta y la pestaña del expediente.
 * - `ui/`          — estilos del módulo.
 *
 * No hay `paginas/`: las escalas viven dentro de la consulta y del expediente,
 * que ya son las pantallas (DESIGN.md §11: el expediente manda).
 */
export { default as EscalasEnConsulta } from './componentes/EscalasEnConsulta'
export type { ResumenEscalas } from './componentes/EscalasEnConsulta'
export { default as EvolucionEscalas } from './componentes/EvolucionEscalas'
