/**
 * Las pestañas de una cuenta no pasan a la siguiente que entra en la misma
 * ventana: el administrador veía «Consulta Médica» y el expediente que había
 * dejado abiertos el médico.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLAVE_PESTANAS, guardarPestanas, leerPestanas, olvidarPestanas } from './almacenPestanas'
import { TabsProvider, useTabs } from './TabsContext'

const entrarComo = (id: number) => localStorage.setItem('user', JSON.stringify({ id, role: 'doctor' }))
const EXPEDIENTE = { key: '/pacientes/6/expediente', path: '/pacientes/6/expediente', title: 'Expediente' }

let pestanas: ReturnType<typeof useTabs> | null = null
const Espia = () => {
  pestanas = useTabs()
  return null
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  pestanas = null
})

afterEach(() => vi.restoreAllMocks())

describe('almacén de pestañas', () => {
  it('la cuenta que las abrió las recupera al recargar', () => {
    entrarComo(4)
    guardarPestanas([EXPEDIENTE], EXPEDIENTE.key)
    expect(leerPestanas()).toEqual({ tabs: [EXPEDIENTE], activeTabKey: EXPEDIENTE.key })
  })

  it('otra cuenta en la misma ventana empieza sin pestañas', () => {
    entrarComo(4)
    guardarPestanas([EXPEDIENTE], EXPEDIENTE.key)
    entrarComo(2)
    expect(leerPestanas()).toEqual({ tabs: [], activeTabKey: null })
  })

  it('una lista vieja sin dueño no se enseña a quien ya entró', () => {
    sessionStorage.setItem(CLAVE_PESTANAS, JSON.stringify({ tabs: [EXPEDIENTE], activeTabKey: EXPEDIENTE.key }))
    entrarComo(2)
    expect(leerPestanas().tabs).toEqual([])
  })

  it('olvidarPestanas las borra', () => {
    entrarComo(4)
    guardarPestanas([EXPEDIENTE], EXPEDIENTE.key)
    olvidarPestanas()
    expect(sessionStorage.getItem(CLAVE_PESTANAS)).toBeNull()
  })

  it('el proveedor no abre las pestañas de otra cuenta', () => {
    entrarComo(4)
    guardarPestanas([EXPEDIENTE], EXPEDIENTE.key)
    entrarComo(2)
    render(
      <TabsProvider inicio={{ path: '/admin', title: 'Inicio' }}>
        <Espia />
      </TabsProvider>,
    )
    expect(pestanas!.tabs.some((t) => t.key === EXPEDIENTE.key)).toBe(false)
  })

  it('cerrar sesión borra las pestañas', async () => {
    const { logout } = await import('../services/auth')
    entrarComo(4)
    guardarPestanas([EXPEDIENTE], EXPEDIENTE.key)
    logout()
    expect(sessionStorage.getItem(CLAVE_PESTANAS)).toBeNull()
  })
})
