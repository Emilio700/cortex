/**
 * El interruptor «Estándar | Realista» de Neuro 3D, sin GPU: la escena y la
 * lectura del equipo se sustituyen. Se prueba qué calidad se pide a la escena,
 * la leyenda de lo que puede el equipo, la preferencia por usuario y la caída
 * automática con su «Reintentar».
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CapacidadDelEquipo } from '../dominio/calidad'

const capacidad = vi.hoisted(() => ({ actual: null as unknown as CapacidadDelEquipo }))
const escena = vi.hoisted(() => ({
  aplicarCapas: vi.fn(),
  fijarCorte: vi.fn(),
  fijarDespiece: vi.fn(),
  irAVista: vi.fn(),
  enfocar: vi.fn(),
  fijarResaltado: vi.fn(),
  fijarHernias: vi.fn(),
  fijarFlujo: vi.fn(),
  fijarRotacion: vi.fn(),
  fijarReducirMovimiento: vi.fn(),
  capturar: vi.fn(() => ({ dataUrl: 'data:image/png;base64,AAAA', ancho: 10, alto: 10 })),
  fijarCapaPaciente: vi.fn(() => Promise.resolve({ piezas: 0 })),
  camara: vi.fn(() => ({ posicion: [1, 2, 3], objetivo: [0, 0, 0] })),
  liberar: vi.fn(),
}))
const crearEscena = vi.hoisted(() => vi.fn())

vi.mock('three', () => {
  throw new Error('three no debe cargarse en las pruebas de la pantalla')
})
vi.mock('../servicios/webgl', () => ({ hayWebGL: () => true }))
vi.mock('../servicios/capacidad', () => ({ leerCapacidad: () => capacidad.actual }))
vi.mock('../servicios/escena', () => ({ crearEscena }))
vi.mock('../../../shared/services/api', () => ({ apiClient: { get: vi.fn(), post: vi.fn() }, default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../../shared/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, role: 'doctor' }, can: (a: string) => a === 'neuro3d.read', tieneModulo: () => false }),
}))

import AtlasNeuroPage from './AtlasNeuroPage'
import { LEYENDA_CAIDA, LEYENDA_DISPONIBLE, LEYENDA_SIN_GPU, claveDePreferencia } from '../dominio/calidad'

const CLAVE = claveDePreferencia(3)
const RTX = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)'

const abrir = () =>
  render(
    <MemoryRouter initialEntries={['/imagen/neuro-3d']}>
      <Routes>
        <Route path="/imagen/neuro-3d" element={<AtlasNeuroPage />} />
      </Routes>
    </MemoryRouter>,
  )

const ultimaLlamada = () => crearEscena.mock.calls[crearEscena.mock.calls.length - 1][0]
const boton = (nombre: 'Estándar' | 'Realista') => screen.getByRole('button', { name: new RegExp(`^${nombre}$`) })

beforeEach(() => {
  capacidad.actual = { webgl2: true, maxTextura: 16384, reducirMovimiento: false, movil: false, gpu: RTX }
  crearEscena.mockReset()
  crearEscena.mockImplementation(() => Promise.resolve(escena))
  Object.values(escena).forEach((f) => f.mockClear())
})

describe('Neuro 3D · calidad', () => {
  it('con tarjeta dedicada y sin preferencia, abre en Realista y lo dice', async () => {
    abrir()
    await screen.findByRole('group', { name: 'Calidad del modelo' })
    expect(ultimaLlamada().calidad).toBe('realista')
    expect(boton('Realista')).toHaveAttribute('aria-pressed', 'true')
    const leyenda = screen.getByText(LEYENDA_DISPONIBLE)
    // El nombre de la tarjeta sólo va en el tooltip.
    expect(leyenda).toHaveAttribute('title', `Tarjeta gráfica: ${RTX}`)
  })

  it('sin tarjeta dedicada usa Estándar, deshabilita Realista y explica por qué', async () => {
    capacidad.actual = { ...capacidad.actual, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' }
    abrir()
    await screen.findByRole('group', { name: 'Calidad del modelo' })
    expect(ultimaLlamada().calidad).toBe('estandar')
    expect(boton('Realista')).toBeDisabled()
    expect(screen.getByText(LEYENDA_SIN_GPU)).toBeInTheDocument()
  })

  it('la preferencia guardada manda; cambiarla la guarda y rehace la escena con la misma cámara', async () => {
    localStorage.setItem(CLAVE, 'estandar')
    abrir()
    await screen.findByRole('group', { name: 'Calidad del modelo' })
    expect(ultimaLlamada().calidad).toBe('estandar')

    await userEvent.click(boton('Realista'))
    await waitFor(() => expect(crearEscena).toHaveBeenCalledTimes(2))
    expect(localStorage.getItem(CLAVE)).toBe('realista')
    expect(escena.liberar).toHaveBeenCalledTimes(1)
    expect(ultimaLlamada()).toMatchObject({ calidad: 'realista', camara: { posicion: [1, 2, 3], objetivo: [0, 0, 0] } })
    await waitFor(() => expect(boton('Realista')).toHaveAttribute('aria-pressed', 'true'))
  })

  it('si los cuadros caen, baja a Estándar, lo dice y deja reintentar sin volver a vigilar', async () => {
    abrir()
    await screen.findByRole('group', { name: 'Calidad del modelo' })
    const primera = ultimaLlamada()
    expect(primera).toMatchObject({ calidad: 'realista', vigilarRendimiento: true })

    await act(async () => primera.alRendimientoBajo())
    await waitFor(() => expect(ultimaLlamada().calidad).toBe('estandar'))
    expect(await screen.findByText(LEYENDA_CAIDA)).toBeInTheDocument()
    expect(localStorage.getItem(CLAVE)).toBe('estandar')

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar realista' }))
    await waitFor(() => expect(ultimaLlamada().calidad).toBe('realista'))
    expect(ultimaLlamada().vigilarRendimiento).toBe(false)
    await waitFor(() => expect(screen.queryByText(LEYENDA_CAIDA)).toBeNull())
    expect(localStorage.getItem(CLAVE)).toBe('realista')
  })

  it('si Realista no se puede preparar, se muestra en Estándar y se dice', async () => {
    crearEscena.mockImplementationOnce(() => Promise.reject(new Error('sin memoria')))
    abrir()
    expect(await screen.findByText(/No se pudo preparar el modo Realista/)).toBeInTheDocument()
    await waitFor(() => expect(ultimaLlamada().calidad).toBe('estandar'))
    await screen.findByRole('group', { name: 'Calidad del modelo' })
  })

  it('el aviso del origen no cambia con la calidad', async () => {
    abrir()
    await screen.findByRole('group', { name: 'Calidad del modelo' })
    expect(screen.getByText(/Modelo esquemático con fines educativos/)).toBeInTheDocument()
  })
})
