/**
 * Registro de cambios sin guardar, por pestaña.
 *
 * Las pestañas son keep-alive: los componentes nunca se desmontan y el texto
 * que el médico escribe vive sólo en memoria hasta que oprime Guardar. Antes
 * de este registro había tres formas de perderlo sin un solo aviso: cerrar la
 * pestaña con la "x", abrir la novena pestaña (MAX_TABS descartaba la más
 * vieja en silencio) y cerrar el navegador.
 *
 * El registro es un módulo, no estado de React, a propósito: lo escriben los
 * formularios —que viven dentro de una pestaña— y lo leen `TabsContext` y el
 * aviso de salida del navegador —que viven por encima de ellas—. Como contexto
 * de React habría que montar el proveedor por encima de `TabsProvider` y por
 * debajo de los formularios al mismo tiempo, que no se puede. Se lee de forma
 * imperativa en el momento de cerrar, así que no necesita reactividad para ser
 * correcto; `suscribir` existe sólo para adornos de interfaz (marcar la
 * pestaña sucia con un punto).
 */
import { createContext, useContext, useEffect } from 'react'

/** Llave de la pestaña que contiene al componente actual (la ruta concreta). */
export const TabKeyContext = createContext<string | null>(null)

/** tabKey -> (idDeRegistro -> etiqueta humana) */
const registro = new Map<string, Map<string, string>>()
const suscriptores = new Set<() => void>()

const avisar = () => suscriptores.forEach((fn) => fn())

/** Avisa cuando cambia lo que hay sin guardar. Devuelve la baja. */
export function suscribir(fn: () => void): () => void {
    suscriptores.add(fn)
    return () => {
        suscriptores.delete(fn)
    }
}

function anotar(tabKey: string, id: string, etiqueta: string) {
    let deLaPestana = registro.get(tabKey)
    if (!deLaPestana) {
        deLaPestana = new Map()
        registro.set(tabKey, deLaPestana)
    }
    if (deLaPestana.get(id) === etiqueta) return
    deLaPestana.set(id, etiqueta)
    avisar()
}

function borrar(tabKey: string, id: string) {
    const deLaPestana = registro.get(tabKey)
    if (!deLaPestana?.delete(id)) return
    if (deLaPestana.size === 0) registro.delete(tabKey)
    avisar()
}

/** Qué quedó sin guardar en una pestaña, en palabras para la usuaria. */
export function etiquetasSinGuardar(tabKey: string): string[] {
    return Array.from(registro.get(tabKey)?.values() ?? [])
}

export function hayCambiosSinGuardar(tabKey: string): boolean {
    return (registro.get(tabKey)?.size ?? 0) > 0
}

/** Llaves de todas las pestañas con trabajo pendiente. */
export function pestanasSinGuardar(): string[] {
    return Array.from(registro.keys())
}

/** Deja el registro limpio. Sólo para pruebas. */
export function limpiarRegistro() {
    registro.clear()
    avisar()
}

/**
 * Declara que este formulario tiene cambios sin guardar.
 *
 * @param hayCambios true mientras haya texto capturado y todavía no persistido
 * @param etiqueta   nombre humano para el aviso, p.ej. "Notas de consulta"
 * @param id         identificador estable dentro de la pestaña. Por omisión es
 *                   la etiqueta; pásalo cuando la misma pantalla tenga varios
 *                   formularios del mismo tipo (p.ej. "receta-2").
 *
 * Fuera del sistema de pestañas no hace nada, para que los componentes se
 * puedan montar sueltos en pruebas sin envolverlos en nada.
 */
export function useCambiosSinGuardar(
    hayCambios: boolean,
    etiqueta: string,
    id: string = etiqueta,
): void {
    const tabKey = useContext(TabKeyContext)

    useEffect(() => {
        if (!tabKey) return
        if (hayCambios) anotar(tabKey, id, etiqueta)
        else borrar(tabKey, id)
    }, [tabKey, hayCambios, etiqueta, id])

    // Al desmontarse deja de contar: si no, una pestaña cerrada dejaría su
    // pendiente colgado y el aviso saldría para siempre.
    useEffect(() => {
        if (!tabKey) return
        return () => borrar(tabKey, id)
    }, [tabKey, id])
}
