/**
 * Neuro 3D: superficie pública del módulo.
 *
 * - `dominio/`     catálogo anatómico, niveles, raíces, dermatomas, vistas,
 *                  capas y marcas. Puro y con pruebas.
 * - `servicios/`   la escena three.js (aislada de React), la geometría
 *                  procedural, la captura y las llamadas al servidor.
 * - `componentes/` paneles, ficha, buscador y la silueta de dermatomas.
 * - `paginas/`     la pantalla que une todo.
 *
 * El resto de la aplicación sólo importa la página (y por `React.lazy`, para
 * que three.js viaje en su propio paquete).
 */
export { default as AtlasNeuroPage } from './paginas/AtlasNeuroPage'
