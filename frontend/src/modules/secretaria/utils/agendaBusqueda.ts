/**
 * Búsqueda dentro de la agenda visible (S-07).
 *
 * Filtra las citas del rango que ya está en pantalla por nombre, teléfono o
 * folio (el id de la cita). No pega al servidor: trabaja sobre las citas ya
 * cargadas, igual que el CSV y la impresión de la agenda.
 */
import type { Appointment } from '../types'

const sinAcentos = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const soloDigitos = (texto: string): string => texto.replace(/\D/g, '')

/**
 * Devuelve las citas que coinciden con el texto. Sin texto, las devuelve todas.
 * - Nombre: primer nombre + apellidos, sin distinguir acentos ni mayúsculas.
 * - Teléfono: por sus dígitos (ignora espacios, guiones y paréntesis).
 * - Folio: el id de la cita (coincidencia por sus dígitos).
 */
export function filtrarCitasPorTexto(citas: Appointment[], texto: string): Appointment[] {
  const consulta = texto.trim()
  if (!consulta) return citas
  const porNombre = sinAcentos(consulta)
  const porDigitos = soloDigitos(consulta)

  return citas.filter((cita) => {
    const nombre = sinAcentos(
      `${cita.patient?.first_name || ''} ${cita.patient?.last_name || ''}`,
    )
    if (porNombre && nombre.includes(porNombre)) return true
    if (porDigitos) {
      const telefono = soloDigitos(cita.patient?.phone || '')
      if (telefono && telefono.includes(porDigitos)) return true
      if (String(cita.id).includes(porDigitos)) return true
    }
    return false
  })
}
