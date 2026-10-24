/**
 * Conecta los emergentes con los avisos: qué se muestra, a dónde lleva «Ir»
 * y qué pasa al cerrar.
 *
 * Varios avisos del mismo tipo se agrupan en uno («3 pacientes en sala») en
 * vez de apilar tres tarjetas (plan 27, §3.2); el agrupado lleva al centro de
 * avisos, donde está cada uno con su botón.
 */
import { useNavigate } from 'react-router-dom'
import type { Notification } from '../types/notification'
import { useAvisos, type Emergente } from './AvisosContext'
import AvisosEmergentes, { type AvisoEmergente } from './AvisosEmergentes'
import { resumenDeAvisos } from './resumen'
import { conLimite } from './LimiteAvisos'

/** «Atender» abre la consulta y la pasa a «En consulta» (plan 28): el botón lo dice. */
export const etiquetaIr = (aviso: Pick<Notification, 'type'>) => (aviso.type === 'patient_arrived' ? 'Atender' : 'Ir')

/** Junta los emergentes sueltos del mismo tipo; el resumen al entrar se queda como está. */
export function agrupar(emergentes: Emergente[]): Emergente[] {
  const porTipo = new Map<string, Emergente[]>()
  const orden: string[] = []
  for (const e of emergentes) {
    const llave = e.resumen ? e.clave : e.avisos[0].type
    if (!porTipo.has(llave)) {
      porTipo.set(llave, [])
      orden.push(llave)
    }
    porTipo.get(llave)!.push(e)
  }
  return orden.map((llave) => {
    const grupo = porTipo.get(llave)!
    if (grupo.length === 1) return grupo[0]
    return { clave: `grupo-${llave}`, avisos: grupo.flatMap((e) => e.avisos), resumen: true }
  })
}

const EmergentesDeAvisos = () => {
  const navigate = useNavigate()
  const { emergentes, cerrarEmergente, marcarLeidos, abrirCentro } = useAvisos()

  // Si marcar leído falla, el aviso sigue sin leer en el centro, que es lo
  // cierto; no hace falta interrumpir con un error por eso.
  const leerEnSilencio = (ids: number[]) => {
    marcarLeidos(ids).catch(() => undefined)
  }

  const cerrarGrupo = (claves: string[]) => claves.forEach(cerrarEmergente)

  const enPantalla: AvisoEmergente[] = agrupar(emergentes).map((e) => {
    const urgente = e.avisos.some((a) => a.priority === 'urgente')
    if (e.resumen) {
      const claves = emergentes.filter((x) => e.avisos.some((a) => x.avisos.includes(a))).map((x) => x.clave)
      return {
        clave: e.clave,
        titulo: e.clave === 'resumen-al-entrar' ? 'Avisos pendientes' : e.avisos[0].title,
        mensaje: resumenDeAvisos(e.avisos),
        etiquetaIr: 'Ver avisos',
        urgente,
        ir: () => {
          cerrarGrupo(claves)
          abrirCentro()
        },
        // Cerrar un resumen no da por leído nada: no se vio cada aviso.
        cerrar: () => cerrarGrupo(claves),
      }
    }
    const aviso = e.avisos[0]
    const ruta = aviso.ruta ?? null
    return {
      clave: e.clave,
      titulo: aviso.title,
      mensaje: aviso.de_otra_sucursal
        ? `${aviso.message} (${aviso.sucursal ?? 'otra sucursal'})`
        : aviso.message,
      etiquetaIr: etiquetaIr(aviso),
      urgente,
      ir: ruta
        ? () => {
            cerrarEmergente(e.clave)
            if (!aviso.is_read) leerEnSilencio([aviso.id])
            navigate(ruta)
          }
        : undefined,
      // Cerrar lo da por leído pero no por atendido: sigue en «Por atender»
      // hasta que el servidor vea el hecho o alguien lo descarte.
      cerrar: () => {
        cerrarEmergente(e.clave)
        leerEnSilencio([aviso.id])
      },
    }
  })

  return <AvisosEmergentes avisos={enPantalla} alVerTodos={abrirCentro} />
}

export default conLimite(EmergentesDeAvisos, 'los emergentes de avisos')
