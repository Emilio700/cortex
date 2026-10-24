/**
 * Preferencias de avisos: cada quien ve sólo lo que puede recibir (plan 29,
 * N-1), y una respuesta sin preferencias no tumba el panel.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const valor = vi.hoisted(() => ({ avisos: {} as Record<string, unknown>, rol: 'doctor' }))
vi.mock('./AvisosContext', () => ({ useAvisos: () => valor.avisos }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: valor.rol } }) }))

import PreferenciasAvisos from './PreferenciasAvisos'

const preferencias = (tipos_silenciables: string[]) => ({
  sonido: false,
  navegador: false,
  recordatorio_una_hora: false,
  tipos_silenciados: [],
  tipos_silenciables,
})

describe('PreferenciasAvisos', () => {
  it('la doctora ve el recordatorio de una hora y los tipos que puede silenciar', () => {
    valor.rol = 'doctor'
    valor.avisos = { preferencias: preferencias(['appointment_scheduled']), guardarPreferencias: vi.fn() }
    render(<PreferenciasAvisos />)

    expect(screen.getByLabelText('Recordarme cada cita una hora antes')).toBeInTheDocument()
    expect(screen.getByLabelText('Citas que te agenda alguien más')).toBeInTheDocument()
  })

  it('recepción no ve interruptores de avisos que nunca le llegan', () => {
    valor.rol = 'secretaria'
    valor.avisos = { preferencias: preferencias([]), guardarPreferencias: vi.fn() }
    render(<PreferenciasAvisos />)

    expect(screen.queryByLabelText('Recordarme cada cita una hora antes')).not.toBeInTheDocument()
    expect(screen.queryByText(/sólo informan/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Sonido/)).toBeInTheDocument()
  })

  it('sin preferencias lo dice', () => {
    valor.avisos = { preferencias: null, guardarPreferencias: vi.fn() }
    render(<PreferenciasAvisos />)
    expect(screen.getByText('No se pudieron cargar tus preferencias de avisos.')).toBeInTheDocument()
  })
})
