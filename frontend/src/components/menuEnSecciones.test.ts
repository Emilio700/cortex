import { describe, expect, it } from 'vitest'

import navigation, { filterNavByAccess } from '../_nav'
import { Role } from '../shared/types'
import { agruparEnSecciones, rutaActiva, seccionDeLaRuta } from './menuEnSecciones'

describe('menú en secciones plegables', () => {
  const medico = filterNavByAccess(navigation, {
    role: Role.DOCTOR,
    permissions: ['appointments.read', 'patients.read', 'doctor.appointments.read', 'clinical_tracking.read', 'doctor_profile.read'],
  })

  it('Inicio queda suelto y cada encabezado se vuelve una sección con sus ítems', () => {
    const { sueltos, secciones } = agruparEnSecciones(medico)
    expect(sueltos.map((i) => i.name)).toEqual(['Inicio'])
    expect(secciones.map((s) => s.nombre)).toEqual(['Consultorio', 'Médico'])
    expect(secciones[1].items.map((i) => i.name)).toEqual(['Mis Consultas', 'Órdenes y resultados', 'Mi Perfil'])
  })

  it('no deja secciones vacías', () => {
    const { secciones } = agruparEnSecciones(filterNavByAccess(navigation, { role: Role.SECRETARIA, permissions: ['appointments.read'] }))
    expect(secciones.every((s) => s.items.length > 0)).toBe(true)
  })

  it('abre la sección de la pantalla abierta, también en sus rutas hijas', () => {
    const { secciones } = agruparEnSecciones(medico)
    expect(seccionDeLaRuta(secciones, '/doctor/results')).toBe('Médico')
    expect(seccionDeLaRuta(secciones, '/secretaria/pacientes')).toBe('Consultorio')
    expect(seccionDeLaRuta(secciones, '/doctor/dashboard')).toBeNull()
  })

  it('una ruta no se confunde con otra que sólo empieza igual', () => {
    expect(rutaActiva('/finanzas', '/finanzas/pagos')).toBe(true)
    expect(rutaActiva('/finanzas', '/finanzasx')).toBe(false)
    expect(rutaActiva('/', '/doctor/dashboard')).toBe(false)
  })
})
