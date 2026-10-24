/**
 * «Anular resultado» desde la orden (plan 29, lote 9).
 *
 * Lo que importa: sin motivo no se manda nada, y el aviso dice lo que el
 * servidor hizo con la orden y con la incidencia, con uno y con varios
 * resultados.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({
  apiClient: { post, patch: vi.fn(), get: vi.fn() },
}))

import AnularResultado, { mensajeTrasAnular, ordenTrasAnular } from './AnularResultado'
import type { AnulacionDeResultado, OrdenEnBandeja } from '../types/clinicalTracking'

const orden: OrdenEnBandeja = {
  id: 5,
  patient_id: 1,
  category: 'laboratory',
  study_name: 'Glucosa',
  clinical_indication: 'Control',
  priority: 'routine',
  requested_on: '2026-10-01',
  status: 'reviewed',
  estado_visible: 'revisada',
  created_at: '2026-10-01T10:00:00',
  comunicada: false,
  critico_sin_comunicar: true,
  results: [
    { id: 2, review_status: 'reviewed', is_critical: true, created_at: '2026-10-02T10:00:00' },
    { id: 1, review_status: 'reviewed', is_critical: false, created_at: '2026-10-01T10:00:00' },
  ],
}

const hecho = (extra: Partial<AnulacionDeResultado>): AnulacionDeResultado => ({
  result_id: 2,
  order_id: 5,
  estado_anterior: 'reviewed',
  order_status: 'reviewed',
  estado_visible: 'revisada',
  resultados_vigentes: 1,
  documento_anulado: true,
  incidencia: 'cerrada',
  ...extra,
})

beforeEach(() => post.mockReset())

describe('mensajeTrasAnular', () => {
  it('con un solo resultado dice que la orden volvió a pendiente', () => {
    const texto = mensajeTrasAnular(
      'Glucosa',
      hecho({
        order_status: 'ordered',
        estado_visible: 'pendiente',
        resultados_vigentes: 0,
        incidencia: 'sin_incidencia',
      }),
    )
    expect(texto).toContain('se anuló el resultado y su archivo')
    expect(texto).toContain('volvió a «Pendiente de resultado»')
    expect(texto).not.toContain('incidencia')
  })

  it('con varios dice que sigue y si la incidencia se cerró o no', () => {
    expect(mensajeTrasAnular('Glucosa', hecho({}))).toContain(
      'sigue en «Revisada» porque tiene otro resultado vigente',
    )
    expect(mensajeTrasAnular('Glucosa', hecho({}))).toContain('incidencia crítica quedó cerrada')
    expect(mensajeTrasAnular('Glucosa', hecho({ incidencia: 'sigue_abierta' }))).toContain(
      'sigue abierta: otro resultado de esta orden es crítico',
    )
  })
})

describe('ordenTrasAnular', () => {
  it('quita el resultado y toma el estado y la incidencia del servidor', () => {
    const r = ordenTrasAnular(orden, hecho({ incidencia: 'cerrada' }))
    expect(r.results.map((x) => x.id)).toEqual([1])
    expect(r.status).toBe('reviewed')
    expect(r.incidencia_abierta).toBe(false)
  })
})

describe('AnularResultado', () => {
  it('exige el motivo y avisa lo que contestó el servidor', async () => {
    const onAnulado = vi.fn()
    post.mockResolvedValue({ data: hecho({}) })
    render(<AnularResultado orden={orden} resultado={orden.results[0]} onAnulado={onAnulado} />)

    await userEvent.click(screen.getByRole('button', { name: 'Anular resultado…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Anular resultado' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe por qué')
    expect(post).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Motivo (obligatorio)'), 'Era de otra paciente')
    await userEvent.click(screen.getByRole('button', { name: 'Anular resultado' }))

    await waitFor(() => expect(onAnulado).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/clinical-tracking/results/2/anular', {
      motivo: 'Era de otra paciente',
    })
    expect(onAnulado.mock.calls[0][1]).toContain('se anuló el resultado')
  })

  it('si falla, dice que sigue vigente y no avisa éxito', async () => {
    const onAnulado = vi.fn()
    post.mockRejectedValueOnce({ response: { status: 500, data: {} } })
    render(<AnularResultado orden={orden} resultado={orden.results[0]} onAnulado={onAnulado} />)

    await userEvent.click(screen.getByRole('button', { name: 'Anular resultado…' }))
    await userEvent.type(screen.getByLabelText('Motivo (obligatorio)'), 'Era de otra paciente')
    await userEvent.click(screen.getByRole('button', { name: 'Anular resultado' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El resultado sigue vigente.')
    expect(onAnulado).not.toHaveBeenCalled()
  })
})
