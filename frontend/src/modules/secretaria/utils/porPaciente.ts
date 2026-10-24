/**
 * Agrupa por paciente las órdenes de una página (plan 26, fase 4).
 *
 * Las listas de recepción siguen paginando por orden (así lo da el servidor);
 * aquí solo se juntan las de la misma paciente que vinieron en la página, en
 * el orden en que apareció cada una, para que el mostrador vea una tarjeta por
 * paciente y pueda imprimirle un solo papel.
 */
export interface DePaciente {
  patient_id: number
  patient_name: string
}

export interface GrupoDePaciente<T> {
  patient_id: number
  patient_name: string
  ordenes: T[]
}

export const agruparPorPaciente = <T extends DePaciente>(items: T[]): GrupoDePaciente<T>[] => {
  const grupos = new Map<number, GrupoDePaciente<T>>()
  for (const item of items) {
    const grupo = grupos.get(item.patient_id)
    if (grupo) grupo.ordenes.push(item)
    else
      grupos.set(item.patient_id, {
        patient_id: item.patient_id,
        patient_name: item.patient_name,
        ordenes: [item],
      })
  }
  return [...grupos.values()]
}
