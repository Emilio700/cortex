/**
 * La pantalla de marcado, de punta a punta sin servidor ni GPU.
 *
 * Lo que no puede fallar: el ángulo se sugiere en vivo; «Guardado» sólo aparece
 * con la respuesta del servidor y muestra SUS mediciones; si el guardado falla,
 * los puntos siguen ahí.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVISO_ORIGEN } from '../dominio/origenModelo'

const permisos = vi.hoisted(() => ({ actual: [] as string[] }))
const get = vi.hoisted(() => vi.fn())
const post = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/services/api', () => ({ apiClient: { get, post }, default: { get, post } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'doctor' }, can: (a: string) => permisos.actual.includes(a) }),
}))

import MarcadoRadiografiaPage from './MarcadoRadiografiaPage'

beforeAll(() => {
  if (!('PointerEvent' in window)) {
    // @ts-expect-error: un MouseEvent basta para clientX/clientY en las pruebas.
    window.PointerEvent = class extends MouseEvent {
      pointerId = 1
      pointerType = 'touch'
    }
  }
  // jsdom no carga imágenes: se «carga» al instante con el tamaño de la placa.
  // @ts-expect-error: sustituto mínimo de Image.
  window.Image = class {
    naturalWidth = 1000
    naturalHeight = 2000
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_: string) {
      setTimeout(() => this.onload?.(), 0)
    }
  }
})

const CINCUENTA = /^(49\.9|50|50\.1)°$/
const FOTO = { id: 3, caption: 'LATERAL DE PIE', file_name: 'lateral.jpg', taken_at: '2026-10-20T10:00:00', mime_type: 'image/jpeg' }

const responder = (ajustes: unknown[] = []) =>
  get.mockImplementation((url: string) => {
    if (url === '/clinical-images/patient/5') return Promise.resolve({ data: [FOTO] })
    if (url === '/patients/5/imaging/studies') return Promise.resolve({ data: [] })
    if (url === '/patients/5/columna-rx') return Promise.resolve({ data: ajustes })
    if (url === '/clinical-images/3/download') return Promise.resolve({ data: new Blob(['x'], { type: 'image/jpeg' }) })
    return Promise.resolve({ data: { first_name: 'Juan', last_name: 'Pérez' } })
  })

const abrir = () =>
  render(
    <MemoryRouter initialEntries={['/pacientes/5/neuro-3d/radiografia']}>
      <Routes>
        <Route path="/pacientes/:patientId/neuro-3d/radiografia" element={<MarcadoRadiografiaPage />} />
        <Route path="/pacientes/:patientId/neuro-3d" element={<div>NEURO 3D ABIERTO</div>} />
      </Routes>
    </MemoryRouter>,
  )

/** Elige la foto y espera la radiografía en pantalla (500 × 1000 px de una imagen de 1000 × 2000). */
const elegirFoto = async () => {
  const select = await screen.findByLabelText('Radiografía lateral')
  await waitFor(() => expect(select.querySelectorAll('option').length).toBeGreaterThan(1))
  fireEvent.change(select, { target: { value: 'imagen_clinica:3' } })
  const svg = await screen.findByRole('img', { name: /Toca para marcar/ })
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) })
  return svg
}

const tocar = (svg: Element, x: number, y: number) => {
  fireEvent.pointerDown(svg, { clientX: x, clientY: y })
  fireEvent.pointerUp(svg, { clientX: x, clientY: y })
}

/** Marca el platillo superior de L1 (10° de inclinación) y el de S1 (−40°); salta lo demás. */
const marcarLordosis = async (svg: Element) => {
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: 'L1' } })
  const t10 = Math.tan((10 * Math.PI) / 180) * 40
  tocar(svg, 140, 100 - t10 / 2) // L1.sa (paciente mirando a la derecha)
  tocar(svg, 100, 100 + t10 / 2) // L1.sp
  // Salta las esquinas inferiores de L1 y todas las de L2 a L5.
  for (let i = 0; i < 2 + 16; i++) await userEvent.click(screen.getByRole('button', { name: 'Saltar punto' }))
  const t40 = Math.tan((40 * Math.PI) / 180) * 40
  tocar(svg, 140, 500 + t40 / 2) // S1.sa: el promontorio queda más bajo
  tocar(svg, 100, 500 - t40 / 2) // S1.sp
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:placa')
  URL.revokeObjectURL = vi.fn()
  permisos.actual = ['neuro3d.read', 'spine_rx.read', 'spine_rx.write', 'clinical_images.read']
  get.mockReset()
  post.mockReset()
  responder()
})

describe('marcar la columna sobre la radiografía', () => {
  it('siempre dice que es una aproximación', async () => {
    abrir()
    expect(await screen.findByText(new RegExp(AVISO_ORIGEN.radiografia.slice(0, 40)))).toBeInTheDocument()
  })

  it('pide el siguiente punto y sugiere la lordosis en vivo', async () => {
    abrir()
    const svg = await elegirFoto()
    expect(screen.getByText('Toca: T4 · platillo superior, esquina anterior')).toBeInTheDocument()
    await marcarLordosis(svg)
    expect(screen.getByText('Lordosis lumbar L1–S1')).toBeInTheDocument()
    // 50° marcados a mano: los puntos se guardan con una décima de píxel.
    expect(screen.getByText(CINCUENTA)).toBeInTheDocument()
    expect(screen.getByText('Sugerencia')).toBeInTheDocument()
  })

  it('deshacer quita el último punto', async () => {
    abrir()
    const svg = await elegirFoto()
    tocar(svg, 100, 100)
    expect(screen.getByText('Toca: T4 · platillo superior, esquina posterior')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getByText('Toca: T4 · platillo superior, esquina anterior')).toBeInTheDocument()
  })

  it('sólo dice «Guardado» con la respuesta del servidor, y muestra lo que calculó él', async () => {
    let responderGuardado: (v: unknown) => void = () => undefined
    post.mockImplementation(() => new Promise((r) => (responderGuardado = r)))
    abrir()
    const svg = await elegirFoto()
    await marcarLordosis(svg)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }))
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(screen.queryByText(/^Guardado\./)).toBeNull()

    const [url, cuerpo] = post.mock.calls[0]
    expect(url).toBe('/patients/5/columna-rx')
    expect(cuerpo.lateral).toEqual({ tipo: 'imagen_clinica', id: 3 })
    expect(cuerpo.ap).toBeNull()
    expect(Object.keys(cuerpo.puntos.lateral.vertebras)).toEqual(['L1', 'S1'])
    expect(cuerpo.calibracion.lateral).toEqual({ tipo: 'ninguna' })

    await act(async () =>
      responderGuardado({
        data: {
          id: 9,
          mediciones: { ...cuerpo.puntos, lordosisLumbar: { grados: 49.5, superior: 'L1', inferior: 'S1' }, cifosisToracica: null, cobbCoronal: null, pelvis: null, listesis: [], discos: [], inclinacionesSagitales: [], inclinacionesCoronales: [], escala: { lateral: 'ninguna', ap: 'ninguna' }, faltan: [], version: '1' },
          calibracion: cuerpo.calibracion,
        },
      }),
    )
    expect(await screen.findByText(/Guardado\. El servidor calculó valores distintos/)).toBeInTheDocument()
    expect(screen.getByText('49.5°')).toBeInTheDocument()
    expect(screen.getByText('Calculadas por el servidor')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Ver en Neuro 3D' })[0])
    expect(screen.getByText('NEURO 3D ABIERTO')).toBeInTheDocument()
  })

  it('si el servidor rechaza, lo dice y los puntos siguen ahí', async () => {
    post.mockRejectedValue({ response: { data: { detail: 'La imagen de la lateral no es de este paciente o ya no está. Elige otra del expediente.' } } })
    abrir()
    const svg = await elegirFoto()
    await marcarLordosis(svg)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }))
    expect(await screen.findByText(/no es de este paciente/)).toBeInTheDocument()
    expect(screen.queryByText(/^Guardado/)).toBeNull()
    expect(screen.getByText(CINCUENTA)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar ajuste' })).toBeEnabled()
  })

  it('con la imagen marcada no se puede cambiar de radiografía sin empezar de nuevo', async () => {
    abrir()
    const svg = await elegirFoto()
    tocar(svg, 100, 100)
    expect(screen.getByLabelText('Radiografía lateral')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Empezar de nuevo esta vista' }))
    expect(screen.getByLabelText('Radiografía lateral')).toBeEnabled()
  })
})
