/**
 * Dónde viven las pestañas abiertas entre recargas, y de quién son.
 *
 * Se guardan en sessionStorage junto con el id de la cuenta que las abrió. Sin
 * ese dueño, al cerrar sesión y entrar con otra cuenta en la misma ventana, la
 * cuenta nueva heredaba las pestañas de la anterior: títulos con nombres de
 * pacientes que no le toca ver. Por eso una lista sólo se carga para su dueño,
 * y además se borra al cerrar sesión (`olvidarPestanas`).
 */
export const CLAVE_PESTANAS = 'gems_tabs'

/** Id de la cuenta con sesión en este navegador, o null si no hay ninguna. */
function cuentaActual(): string | null {
    try {
        const raw = localStorage.getItem('user')
        if (!raw) return null
        const id = JSON.parse(raw)?.id
        return id === undefined || id === null ? null : String(id)
    } catch {
        return null
    }
}

export function leerPestanas<T>(): { tabs: T[]; activeTabKey: string | null } {
    const vacio = { tabs: [] as T[], activeTabKey: null }
    try {
        const raw = sessionStorage.getItem(CLAVE_PESTANAS)
        if (!raw) return vacio
        const data = JSON.parse(raw)
        const dueno = data.cuenta === undefined || data.cuenta === null ? null : String(data.cuenta)
        // Una lista de otra cuenta (o una vieja sin dueño, con alguien ya
        // dentro) no se enseña: se empieza en limpio.
        if (dueno !== cuentaActual()) return vacio
        return { tabs: data.tabs || [], activeTabKey: data.activeTabKey || null }
    } catch {
        return vacio
    }
}

export function guardarPestanas<T>(tabs: T[], activeTabKey: string | null): void {
    try {
        sessionStorage.setItem(CLAVE_PESTANAS, JSON.stringify({ cuenta: cuentaActual(), tabs, activeTabKey }))
    } catch { /* almacenamiento lleno: no es crítico */ }
}

export function olvidarPestanas(): void {
    try { sessionStorage.removeItem(CLAVE_PESTANAS) } catch { /* sin almacenamiento */ }
}
