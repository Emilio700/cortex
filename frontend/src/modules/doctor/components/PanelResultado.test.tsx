/**
 * Panel de registrar y revisar resultados (plan 26, §3.4).
 *
 * Lo que importa: documentar la comunicación exige decir cómo se comunicó, y
 * la fila refleja el estado que dijo el servidor, no uno supuesto.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const patch = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/services/api', () => ({ apiClient: { patch, post, get: vi.fn() } }))
vi.mock('../../../shared/tutoriales/BotonAyudaContextual', () => ({ default: () => null }))

import PanelResultado, { ordenTrasGuardar } from './PanelResultado'
import type { OrdenEnBandeja } from '../types/clinicalTracking'

const base: OrdenEnBandeja = {
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
    { id: 1, review_status: 'received', is_critical: false, created_at: '2026-10-01T10:00:00' },
  ],
}

beforeEach(() => {
  patch.mockReset()
  post.mockReset()
})

describe('ordenTrasGuardar', () => {
  it('usa el estado de la orden que devuelve el servidor', () => {
    const r = ordenTrasGuardar(
      { ...base, status: 'result_received' },
      {
        id: 2,
        review_status: 'reviewed',
        is_critical: false,
        created_at: '',
        order_status: 'reviewed',
      },
      'reviewed',
    )
    expect(r.status).toBe('reviewed')
    expect(r.estado_visible).toBe('revisada')
    // El servidor da por revisados los demás archivos que seguían recibidos.
    expect(r.results.find((x) => x.id === 1)?.review_status).toBe('reviewed')
  })

  it('al comunicar, el crítico deja de estar sin comunicar', () => {
    const r = ordenTrasGuardar(
      base,
      {
        id: 2,
        review_status: 'communicated',
        is_critical: true,
        created_at: '',
        order_status: 'reviewed',
      },
      'communicated',
    )
    expect(r.comunicada).toBe(true)
    expect(r.critico_sin_comunicar).toBe(false)
  })
})

const montar = (props: Partial<Parameters<typeof PanelResultado>[0]> = {}) => {
  const onGuardado = vi.fn()
  render(
    <PanelResultado
      orden={base}
      pacienteNombre="ANA"
      modo="revisar"
      onClose={vi.fn()}
      onGuardado={onGuardado}
      {...props}
    />,
  )
  return onGuardado
}

describe('PanelResultado', () => {
  it('documentar la comunicación exige el medio y la nota (D-8)', async () => {
    patch.mockResolvedValue({
      data: {
        id: 2,
        review_status: 'communicated',
        is_critical: true,
        valoracion: 'critico',
        created_at: '',
        order_status: 'reviewed',
        incidencia_abierta: false,
        incidencia_cerrada_por: 'comunicacion',
      },
    })
    const user = userEvent.setup()
    const onGuardado = montar({ modo: 'comunicar' })
    const boton = screen.getByRole('button', { name: 'Documentar comunicación' })
    expect(boton).toBeDisabled()
    await waitFor(() => expect(screen.getByLabelText(/Cuándo y a quién/)).toHaveFocus())

    await user.type(screen.getByLabelText(/Cuándo y a quién/), '3/10, al paciente')
    expect(boton).toBeDisabled()
    await user.click(screen.getByLabelText('WhatsApp'))
    await user.click(boton)

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(patch).toHaveBeenCalledWith(
      '/clinical-tracking/results/2',
      expect.objectContaining({
        review_status: 'communicated',
        communication_note: '3/10, al paciente',
        communication_channel: 'whatsapp',
      }),
    )
    expect(onGuardado.mock.calls[0][1]).toMatch(/La incidencia crítica quedó cerrada/)
  })

  it('desde la bandeja, revisar no cierra la incidencia y el aviso lo dice', async () => {
    patch.mockResolvedValue({
      data: {
        id: 2,
        review_status: 'reviewed',
        is_critical: true,
        valoracion: 'critico',
        created_at: '',
        order_status: 'reviewed',
        incidencia_abierta: true,
      },
    })
    const user = userEvent.setup()
    const onGuardado = montar()
    expect(
      screen.getByText(/marcarlo revisado no cierra una incidencia crítica/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marcar revisada' }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(patch.mock.calls[patch.mock.calls.length - 1][1]).not.toHaveProperty('appointment_id')
    expect(onGuardado.mock.calls[0][1]).toMatch(/La incidencia crítica sigue abierta/)
    expect(onGuardado.mock.calls[0][0].incidencia_abierta).toBe(true)
  })

  it('dentro de una consulta manda la cita, y eso cierra la incidencia', async () => {
    patch.mockResolvedValue({
      data: {
        id: 2,
        review_status: 'reviewed',
        is_critical: true,
        valoracion: 'critico',
        created_at: '',
        order_status: 'reviewed',
        incidencia_abierta: false,
        incidencia_cerrada_por: 'consulta',
      },
    })
    const user = userEvent.setup()
    const onGuardado = montar({ appointmentId: 345 })
    expect(screen.getByText(/Lo estás revisando dentro de la consulta/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marcar revisada' }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(patch).toHaveBeenLastCalledWith(
      '/clinical-tracking/results/2',
      expect.objectContaining({ review_status: 'reviewed', appointment_id: 345 }),
    )
    expect(onGuardado.mock.calls[0][1]).toMatch(/cerrada porque lo revisaste en la consulta/)
  })

  it('la valoración es de cada resultado: un crítico viejo se puede quitar (M6)', async () => {
    const conViejo: OrdenEnBandeja = {
      ...base,
      results: [
        {
          id: 2,
          review_status: 'received',
          is_critical: false,
          valoracion: null,
          created_at: '2026-10-02T10:00:00',
        },
        {
          id: 1,
          review_status: 'reviewed',
          is_critical: true,
          valoracion: 'critico',
          created_at: '2026-10-01T10:00:00',
        },
      ],
    }
    patch.mockImplementation(async (ruta: string, cuerpo: Record<string, unknown>) => ({
      data: {
        id: ruta.endsWith('/1') ? 1 : 2,
        review_status: cuerpo.review_status ?? 'reviewed',
        is_critical: false,
        valoracion: cuerpo.valoracion,
        created_at: '',
        order_status: 'reviewed',
        incidencia_abierta: false,
      },
    }))
    const user = userEvent.setup()
    const onGuardado = montar({ orden: conViejo })

    expect(
      screen.getByLabelText('Valoración (opcional)', { selector: '#valoracion-1' }),
    ).toHaveValue('critico')
    await user.selectOptions(
      screen.getByLabelText('Valoración (opcional)', { selector: '#valoracion-1' }),
      'regular',
    )
    await user.selectOptions(
      screen.getByLabelText('Valoración (opcional)', { selector: '#valoracion-2' }),
      'bien',
    )
    await user.click(screen.getByRole('button', { name: 'Marcar revisada' }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    // El viejo, solo con su valoración, sin tocar su revisión; luego el más reciente.
    expect(patch.mock.calls[0]).toEqual(['/clinical-tracking/results/1', { valoracion: 'regular' }])
    expect(patch.mock.calls[1][0]).toBe('/clinical-tracking/results/2')
    expect(patch.mock.calls[1][1]).toMatchObject({ review_status: 'reviewed', valoracion: 'bien' })
  })

  it('sin archivo se registra una nota rápida', async () => {
    post.mockResolvedValue({
      data: {
        id: 9,
        review_status: 'received',
        is_critical: false,
        created_at: '',
        order_status: 'result_received',
      },
    })
    const user = userEvent.setup()
    const onGuardado = montar({
      orden: { ...base, status: 'ordered', estado_visible: 'pendiente', results: [] },
      modo: 'registrar',
    })
    expect(screen.getByText(/Sin archivo: el resultado se puede registrar/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Resumen del resultado/), 'VDRL no reactivo por WhatsApp')
    await user.click(screen.getByRole('button', { name: 'Guardar como recibido' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith(
      '/clinical-tracking/orders/5/results',
      expect.objectContaining({
        report_text: 'VDRL no reactivo por WhatsApp',
        review_status: 'received',
      }),
    )
  })

  it('en el celular se abre a pantalla completa (360 px)', () => {
    const original = window.matchMedia
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    try {
      montar()
      const dialogo = screen.getByRole('dialog')
      expect(dialogo.querySelector('.modal-fullscreen')).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Marcar revisada' })).toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })

  it('la nota rápida de la consulta no manda la cita (N1)', async () => {
    post.mockResolvedValue({
      data: {
        id: 9,
        review_status: 'received',
        is_critical: false,
        created_at: '',
        order_status: 'result_received',
      },
    })
    const user = userEvent.setup()
    const onGuardado = montar({
      orden: { ...base, status: 'ordered', estado_visible: 'pendiente', results: [] },
      modo: 'registrar',
      appointmentId: 345,
    })
    await user.type(screen.getByLabelText(/Resumen del resultado/), 'Nota rápida')
    await user.click(screen.getByRole('button', { name: 'Guardar como recibido' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).not.toHaveProperty('appointment_id')
  })

  it('si falla una valoración anterior, dice cuál sí y cuál no, y no guarda la revisión (N6)', async () => {
    const tres: OrdenEnBandeja = {
      ...base,
      results: [
        { id: 3, review_status: 'received', is_critical: false, created_at: '2026-10-03T10:00:00' },
        {
          id: 2,
          review_status: 'reviewed',
          is_critical: false,
          valoracion: 'bien',
          document_file_name: 'b.pdf',
          created_at: '2026-10-02T10:00:00',
        },
        {
          id: 1,
          review_status: 'reviewed',
          is_critical: true,
          valoracion: 'critico',
          document_file_name: 'a.pdf',
          created_at: '2026-10-01T10:00:00',
        },
      ],
    }
    patch.mockImplementation(async (ruta: string) => {
      if (ruta.endsWith('/1')) throw { response: { status: 403, data: { detail: 'Sin permiso.' } } }
      return {
        data: {
          id: 2,
          review_status: 'reviewed',
          is_critical: false,
          valoracion: 'regular',
          created_at: '',
        },
      }
    })
    const user = userEvent.setup()
    const onGuardado = montar({ orden: tres })
    await user.selectOptions(
      screen.getByLabelText('Valoración (opcional)', { selector: '#valoracion-2' }),
      'regular',
    )
    await user.selectOptions(
      screen.getByLabelText('Valoración (opcional)', { selector: '#valoracion-1' }),
      'malo',
    )
    await user.click(screen.getByRole('button', { name: 'Marcar revisada' }))

    const alerta = await screen.findByText(/No se guardó la valoración de/)
    expect(alerta).toHaveTextContent('No se guardó la valoración de: a.pdf (Sin permiso.)')
    expect(alerta).toHaveTextContent('Sí se guardó la de: b.pdf')
    expect(alerta).toHaveTextContent('La revisión de este resultado no se guardó')
    expect(patch.mock.calls.some(([r]) => r.endsWith('/3'))).toBe(false)
    expect(onGuardado).not.toHaveBeenCalled()
  })
})

describe('ordenTrasGuardar · incidencia de toda la orden (N2)', () => {
  const dos: OrdenEnBandeja = {
    ...base,
    results: [
      {
        id: 2,
        review_status: 'received',
        is_critical: false,
        incidencia_abierta: false,
        created_at: '',
      },
      {
        id: 1,
        review_status: 'received',
        is_critical: true,
        valoracion: 'critico',
        incidencia_abierta: true,
        created_at: '',
      },
    ],
  }

  it('revisar desde la bandeja otro archivo no apaga el crítico abierto del anterior', () => {
    const r = ordenTrasGuardar(
      dos,
      {
        id: 2,
        review_status: 'reviewed',
        is_critical: false,
        incidencia_abierta: false,
        created_at: '',
        order_status: 'reviewed',
      },
      'reviewed',
    )
    expect(r.incidencia_abierta).toBe(true)
    expect(r.critico_sin_comunicar).toBe(true)
  })

  it('comunicar o revisar en consulta cierra la de toda la orden', () => {
    const r = ordenTrasGuardar(
      dos,
      {
        id: 2,
        review_status: 'reviewed',
        is_critical: false,
        incidencia_abierta: false,
        created_at: '',
        order_status: 'reviewed',
      },
      'reviewed',
      [],
      true,
    )
    expect(r.incidencia_abierta).toBe(false)
  })

  it('con una consulta de otro día la revisión se guarda y dice que la incidencia sigue abierta (R1)', async () => {
    patch.mockResolvedValue({
      data: {
        id: 2,
        review_status: 'reviewed',
        is_critical: true,
        valoracion: 'critico',
        created_at: '',
        order_status: 'reviewed',
        incidencia_abierta: true,
        cierre_en_consulta: 'cita_de_otro_dia',
      },
    })
    const user = userEvent.setup()
    const onGuardado = montar({ appointmentId: 300 })
    // El recuadro no promete el cierre: depende de que la consulta sea de hoy.
    expect(screen.getByText(/Si es una consulta de hoy/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marcar revisada' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(onGuardado.mock.calls[0][1]).toMatch(/sigue abierta: esta consulta no es de hoy/)
    expect(onGuardado.mock.calls[0][0].incidencia_abierta).toBe(true)
  })
})
