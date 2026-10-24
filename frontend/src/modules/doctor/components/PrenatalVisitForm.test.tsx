/** Visita prenatal: errores junto al campo, sin globo del navegador. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { onSaved, post } = vi.hoisted(() => ({ onSaved: vi.fn(), post: vi.fn() }))

vi.mock('../../../shared/services/api', () => {
  const cliente = { get: vi.fn(), post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { apiClient: cliente, default: cliente }
})

import PrenatalVisitForm from './PrenatalVisitForm'
import type { Pregnancy } from '../types/prenatal'

const embarazo = {
  id: 9,
  patient_id: 1,
  doctor_id: 1,
  status: 'active',
  dating_status: 'confirmed',
  high_risk_status: 'unknown',
  outcome: 'ongoing',
  estimated_delivery_date: '2026-12-20',
} as unknown as Pregnancy

const montar = () => render(<PrenatalVisitForm pregnancy={embarazo} onSaved={onSaved} />)
const botonRegistrar = () => screen.getByRole('button', { name: 'Registrar visita prenatal' })

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: {} })
  onSaved.mockReset()
})

describe('PrenatalVisitForm · errores junto al campo', () => {
  it('sin fecha avisa junto al campo y no llama al servidor', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })
    fireEvent.click(botonRegistrar())

    expect(screen.getByText('Indica la fecha de la visita.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('el aviso se quita al corregir la fecha', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })
    fireEvent.click(botonRegistrar())
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-06-15' } })

    expect(screen.queryByText('Indica la fecha de la visita.')).not.toBeInTheDocument()
  })

  it('una edad gestacional fuera del rango del servidor se avisa y no se manda', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Edad gestacional (semanas)'), {
      target: { value: '46' },
    })
    fireEvent.click(botonRegistrar())

    expect(
      screen.getByText('La edad gestacional debe estar entre 0 y 45 semanas.'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('el peso fuera del rango del servidor se avisa y se quita al corregir', () => {
    montar()
    const peso = screen.getByLabelText('Peso materno (kg)')
    fireEvent.change(peso, { target: { value: '10' } })
    fireEvent.click(botonRegistrar())

    expect(screen.getByText('El peso materno debe estar entre 20 y 400 kg.')).toBeInTheDocument()

    fireEvent.change(peso, { target: { value: '64' } })
    expect(
      screen.queryByText('El peso materno debe estar entre 20 y 400 kg.'),
    ).not.toBeInTheDocument()
  })

  it('presión, frecuencia fetal y altura uterina también se cuidan junto al campo', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Presión sistólica'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('FC fetal (lpm)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Altura uterina (cm)'), { target: { value: '90' } })
    fireEvent.click(botonRegistrar())

    expect(screen.getByText('La presión sistólica debe estar entre 40 y 300.')).toBeInTheDocument()
    expect(
      screen.getByText('La frecuencia cardíaca fetal debe estar entre 30 y 300 lpm.'),
    ).toBeInTheDocument()
    expect(screen.getByText('La altura uterina debe estar entre 0 y 80 cm.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('la próxima visita no puede ser anterior a la visita registrada', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-06-15' } })
    fireEvent.change(screen.getByLabelText('Próxima visita'), { target: { value: '2026-06-01' } })
    fireEvent.click(botonRegistrar())

    expect(
      screen.getByText('La próxima visita no puede ser anterior a la fecha de la visita.'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('sin signos se puede guardar: los campos no valorados siguen opcionales', async () => {
    montar()
    fireEvent.click(botonRegistrar())

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0]).toBe('/prenatal/pregnancies/9/visits')
    const payload = post.mock.calls[0][1] as Record<string, unknown>
    expect(payload.maternal_weight_kg).toBeUndefined()
    expect(payload.systolic_bp).toBeUndefined()
    expect(payload.fundal_height_cm).toBeUndefined()
    expect(onSaved).toHaveBeenCalled()
  })
})
