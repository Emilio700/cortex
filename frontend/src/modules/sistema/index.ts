/**
 * Módulo Sistema (base-modulos-extra): módulos opcionales del consultorio y
 * estado de los servicios auxiliares. Solo administración y master.
 *
 * - `dominio/`     — cómo se nombra cada estado y cuándo un módulo no se enciende.
 * - `servicios/`   — llamadas al API.
 * - `componentes/` — la tarjeta de un módulo con su interruptor.
 * - `paginas/`     — Estado de servicios y Módulos.
 */
export { default as ModulosPage } from './paginas/ModulosPage'
export { default as EstadoServiciosPage } from './paginas/EstadoServiciosPage'
export { presentacionDeEstado, motivoParaNoEncender } from './dominio/sistema'
export type { ServicioAuxiliar, EstadoDeServicio } from './dominio/sistema'
