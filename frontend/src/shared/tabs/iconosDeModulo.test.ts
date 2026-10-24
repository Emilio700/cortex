import { describe, expect, it } from 'vitest'
import { cilHome, cilMedicalCross } from '@coreui/icons'

import routes from '../../routes'
import { ICONOS_DE_MODULO, iconoDeRuta } from './iconosDeModulo'

describe('ícono de cada pestaña', () => {
  it.each(// Las rutas retiradas solo redirigen: no abren pestaña ni necesitan ícono.
  routes.filter((r) => r.path && r.element).map((r) => r.path!))('%s tiene su ícono', (ruta) => {
    expect(ICONOS_DE_MODULO[ruta]).toBeTruthy()
  })

  it('una ruta con id toma el ícono de su patrón', () => {
    expect(iconoDeRuta('/doctor/consultation/41')).toBe(cilMedicalCross)
  })

  it('una ruta desconocida cae en el de inicio, no en un hueco', () => {
    expect(iconoDeRuta('/no/existe')).toBe(cilHome)
  })
})
