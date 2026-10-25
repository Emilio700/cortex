/**
 * base-modulos-extra: el único criterio de «¿este módulo opcional está
 * encendido?». Lo usan el menú (`_nav.tsx`), las rutas (`routes.tsx`) y el
 * guard de las pestañas; si cada uno lo escribiera a su modo, el menú podría
 * ofrecer una pantalla que la pestaña luego niega.
 *
 * Sin `modulo` es del núcleo y siempre pasa. Con `modulo`, solo si está en la
 * lista de activos; una lista que no llegó cuenta como vacía.
 */
export const moduloPermitido = (modulo: string | undefined, activos: string[] | undefined): boolean =>
  !modulo || (activos ?? []).includes(modulo)
