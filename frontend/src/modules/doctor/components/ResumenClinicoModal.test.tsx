/**
 * Resumen clínico (plan 32, punto 8): la vista previa es obligatoria, emitir
 * usa la constancia de esas mismas opciones y el aviso de éxito solo sale con
 * el folio que devolvió el servidor.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const previa = vi.hoisted(() => vi.fn())
const emitir = vi.hoisted(() => vi.fn())
vi.mock('../utils/resumenClinico', async (original) => ({
  ...(await original<typeof import('../utils/resumenClinico')>()),
  pedirVistaPreviaResumen: previa,
  emitirResumenClinico: emitir,
}))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))
// El visor real necesita pdf.js; aquí basta con que pida el archivo.
vi.mock('../../../shared/components/VisorDocumentos', () => ({
  default: ({ archivos }: { archivos: { clave: string; cargar: () => Promise<Blob> }[] }) => {
    const [a] = archivos
    return <button type="button" key={a.clave} onClick={() => void a.cargar()} data-testid="visor">{a.clave}</button>
  },
}))

import ResumenClinicoModal from './ResumenClinicoModal'

const pdf = new Blob(['%PDF'], { type: 'application/pdf' })

beforeEach(() => {
  previa.mockReset().mockResolvedValue({ pdf, constancia: 'token-1' })
  emitir.mockReset()
})

const abrir = () => render(<ResumenClinicoModal visible onClose={() => {}} patientId={7} patientName="Ana López" />)

describe('ResumenClinicoModal', () => {
  it('no deja emitir sin la vista previa y emite con su constancia', async () => {
    const usuario = userEvent.setup()
    emitir.mockResolvedValue({ pdf, folio: 'GYG-RES-2026-0001' })
    abrir()
    const boton = screen.getByRole('button', { name: 'Emitir con folio' })
    expect(boton).toBeDisabled()

    await usuario.click(screen.getByTestId('visor'))
    await waitFor(() => expect(boton).toBeEnabled())
    await usuario.click(boton)

    expect(emitir).toHaveBeenCalledWith(7, expect.arrayContaining(['alergias', 'medicacion']), 3, 'token-1')
    expect(await screen.findByText('GYG-RES-2026-0001')).toBeInTheDocument()
  })

  it('cambiar las secciones invalida la vista previa anterior', async () => {
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(screen.getByTestId('visor'))
    const boton = screen.getByRole('button', { name: 'Emitir con folio' })
    await waitFor(() => expect(boton).toBeEnabled())

    await usuario.click(screen.getByLabelText('Alergias'))
    expect(boton).toBeDisabled()
  })

  it('si no se emitió lo dice y no anuncia folio', async () => {
    const usuario = userEvent.setup()
    emitir.mockRejectedValue(new Error('Revisa la vista previa con estas mismas secciones antes de emitir el resumen.'))
    abrir()
    await usuario.click(screen.getByTestId('visor'))
    const boton = screen.getByRole('button', { name: 'Emitir con folio' })
    await waitFor(() => expect(boton).toBeEnabled())
    await usuario.click(boton)

    expect(await screen.findByRole('alert')).toHaveTextContent('El resumen no se emitió.')
    expect(screen.queryByText(/Resumen emitido con folio/)).not.toBeInTheDocument()
  })
})
