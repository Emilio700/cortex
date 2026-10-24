/**
 * Al cerrar la última pestaña queda el inicio del rol (plan 26, D-6), no la
 * página genérica: el médico no debe perder su tablero por cerrar pestañas.
 */
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { TabsProvider, useTabs } from './TabsContext'

let pestanas: ReturnType<typeof useTabs> | null = null
const Espia = () => {
  pestanas = useTabs()
  return null
}

beforeEach(() => {
  sessionStorage.clear()
  pestanas = null
})

describe('TabsContext · inicio al cerrar todo', () => {
  it('queda la pestaña del inicio que se le pasa', () => {
    render(
      <TabsProvider inicio={{ path: '/doctor/dashboard', title: 'Dashboard del médico' }}>
        <Espia />
      </TabsProvider>,
    )
    act(() =>
      pestanas!.openTab({
        key: '/doctor/appointments',
        path: '/doctor/appointments',
        title: 'Mis consultas',
      }),
    )
    act(() => pestanas!.closeTab('/doctor/appointments'))

    expect(pestanas!.tabs).toEqual([
      { key: '/doctor/dashboard', path: '/doctor/dashboard', title: 'Dashboard del médico' },
    ])
    expect(pestanas!.activeTabKey).toBe('/doctor/dashboard')
  })
})
