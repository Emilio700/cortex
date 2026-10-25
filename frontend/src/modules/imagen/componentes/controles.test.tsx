/**
 * La barra, el deslizador, el panel de cortes clave y las ventanas de captura y
 * de compartir, sin GPU: se sustituyen las llamadas al servidor y la composición
 * del lienzo, porque aquí se prueba qué le pasa a la persona al usarlos.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  captura: vi.fn(),
  listarEnlaces: vi.fn(),
  crearEnlace: vi.fn(),
  revocarEnlace: vi.fn(),
}))

vi.mock('../servicios/estudiosApi', () => ({
  cortesClaveApi: { captura: api.captura },
  enlacesApi: { listar: api.listarEnlaces, crear: api.crearEnlace, revocar: api.revocarEnlace },
}))

import type { CorteClave } from '../dominio/cortesClave'
import type { CapturaComponer } from '../servicios/capturaCanvas'
import type { EstadoDeVista } from '../servicios/controlesDeVista'
import BarraDelVisor from './BarraDelVisor'
import ModalCaptura from './ModalCaptura'
import ModalCompartir from './ModalCompartir'
import PanelCortesClave from './PanelCortesClave'
import SelectorDeCortes from './SelectorDeCortes'

/**
 * CoreUI vuelve a montar el contenido de un cuadro de diálogo justo después de
 * abrirlo. Una prueba que busca un elemento y hace clic de inmediato puede
 * pulsar uno que ya se desmontó (la casilla «se marca», pero el estado no
 * cambia). Un respiro corto, y las búsquedas siguientes ya son del montaje final.
 */
const asentar = () => new Promise((resolver) => setTimeout(resolver, 150))

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:prueba')
  URL.revokeObjectURL = vi.fn()
  api.listarEnlaces.mockResolvedValue([])
})

const estado: EstadoDeVista = {
  indice: 11,
  total: 24,
  wc: 40,
  ww: 80,
  zoom: 1,
  rotacion: 0,
  volteoH: false,
  volteoV: false,
  invertido: false,
}

const marca = (id: number, indice: number, extra: Partial<CorteClave> = {}): CorteClave => ({
  id,
  study_id: 1,
  series_id: 7,
  series_description: 't2_tse_ax',
  instance_index: indice,
  sop_instance_uid: null,
  label: null,
  notes: null,
  view_state: {},
  has_image: false,
  created_at: '2026-10-25T10:00:00',
  updated_at: '2026-10-25T10:00:00',
  created_by: 'Dr. Salazar',
  ...extra,
})

// ── Barra ───────────────────────────────────────────────────────────────────

function barra(extra: Partial<React.ComponentProps<typeof BarraDelVisor>> = {}) {
  const props = {
    herramienta: 'ventana' as const,
    onHerramienta: vi.fn(),
    estado,
    presets: [],
    onPreset: vi.fn(),
    onAcercar: vi.fn(),
    onAjustar: vi.fn(),
    onRotar: vi.fn(),
    onVoltear: vi.fn(),
    onInvertir: vi.fn(),
    onRestablecer: vi.fn(),
    cineActivo: false,
    fps: 8,
    onCine: vi.fn(),
    onFps: vi.fn(),
    onCapturar: vi.fn(),
    onCorteClave: vi.fn(),
    onCompartir: vi.fn(),
    onPresentacion: vi.fn(),
    onPantallaCompleta: vi.fn(),
    pantallaCompleta: false,
    onAyuda: vi.fn(),
    ...extra,
  }
  render(<BarraDelVisor {...props} />)
  return props
}

describe('BarraDelVisor', () => {
  it('cada botón avisa lo que se pidió', async () => {
    const usuario = userEvent.setup()
    const p = barra()

    await usuario.click(screen.getByRole('button', { name: /^Medir una distancia/ }))
    expect(p.onHerramienta).toHaveBeenCalledWith('medir')
    await usuario.click(screen.getByRole('button', { name: /^Medir un ángulo/ }))
    expect(p.onHerramienta).toHaveBeenCalledWith('angulo')
    await usuario.click(screen.getByRole('button', { name: /^Elipse/ }))
    expect(p.onHerramienta).toHaveBeenCalledWith('area')
    await usuario.click(screen.getByRole('button', { name: /^Invertir los grises/ }))
    expect(p.onInvertir).toHaveBeenCalled()
    await usuario.click(screen.getByRole('button', { name: /^Girar 90/ }))
    expect(p.onRotar).toHaveBeenCalled()
    await usuario.click(screen.getByRole('button', { name: /^Voltear vertical/ }))
    expect(p.onVoltear).toHaveBeenCalledWith('v')
    await usuario.click(screen.getByRole('button', { name: /^Capturar la imagen/ }))
    expect(p.onCapturar).toHaveBeenCalled()
    await usuario.click(screen.getByRole('button', { name: /^Marcar este corte como clave/ }))
    expect(p.onCorteClave).toHaveBeenCalled()
  })

  it('cada botón dice su atajo de teclado', () => {
    barra()
    expect(screen.getByRole('button', { name: 'Invertir los grises (I)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reproducir los cortes (Espacio)' })).toBeInTheDocument()
  })

  it('la herramienta activa se marca como pulsada', () => {
    barra({ herramienta: 'medir' })
    expect(screen.getByRole('button', { name: /^Medir una distancia/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Contraste/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('un corte que ya es clave lo dice y ofrece editarlo', () => {
    barra({ esCorteClave: true })
    expect(screen.getByRole('button', { name: /Este corte es clave: editar o quitar/ })).toBeInTheDocument()
  })

  it('con un solo corte no ofrece el cine', () => {
    barra({ estado: { ...estado, total: 1 } })
    expect(screen.getByRole('button', { name: /^Reproducir los cortes/ })).toBeDisabled()
  })

  it('en modo lectura (enlace compartido) no hay capturar, marcar ni compartir', () => {
    barra({ onCapturar: undefined, onCorteClave: undefined, onCompartir: undefined, onPresentacion: undefined })
    expect(screen.queryByRole('button', { name: /Capturar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /corte como clave/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Compartir/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Medir una distancia/ })).toBeInTheDocument()
  })

  it('el menú de ventana trae presets sólo cuando los hay', async () => {
    const usuario = userEvent.setup()
    const p = barra({ presets: [{ id: 'hueso', nombre: 'Hueso', wc: 500, ww: 2000 }] })
    await usuario.selectOptions(screen.getByLabelText('Ventana (contraste)'), 'hueso')
    expect(p.onPreset).toHaveBeenCalledWith('hueso')
  })
})

// ── Deslizador ──────────────────────────────────────────────────────────────

describe('SelectorDeCortes', () => {
  it('muestra dónde está y se mueve con el deslizador', () => {
    const onCambiar = vi.fn()
    render(<SelectorDeCortes indice={11} total={24} onCambiar={onCambiar} />)
    expect(screen.getByText('Corte 12 / 24')).toBeInTheDocument()
    const rango = screen.getByRole('slider', { name: 'Corte' })
    expect(rango).toHaveAttribute('aria-valuetext', 'Corte 12 de 24')
    fireEvent.change(rango, { target: { value: '20' } })
    expect(onCambiar).toHaveBeenCalledWith(20)
  })

  it('no se sale de los extremos', () => {
    render(<SelectorDeCortes indice={0} total={5} onCambiar={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Corte anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Corte siguiente' })).not.toBeDisabled()
  })

  it('pinta una muesca por cada corte clave y deja saltar entre ellos', async () => {
    const usuario = userEvent.setup()
    const onSaltar = vi.fn()
    const { container } = render(
      <SelectorDeCortes
        indice={3}
        total={11}
        onCambiar={vi.fn()}
        marcas={[marca(1, 0), marca(2, 10)]}
        onSaltar={onSaltar}
        hayAnterior
        haySiguiente
      />,
    )
    expect(container.querySelectorAll('.visor-cortes__muesca')).toHaveLength(2)
    await usuario.click(screen.getByRole('button', { name: 'Corte clave siguiente' }))
    expect(onSaltar).toHaveBeenCalledWith(1)
  })

  it('sin cortes clave no ofrece los botones de salto', () => {
    render(<SelectorDeCortes indice={0} total={5} onCambiar={vi.fn()} onSaltar={vi.fn()} marcas={[]} />)
    expect(screen.queryByRole('button', { name: /Corte clave/ })).toBeNull()
  })
})

// ── Panel de cortes clave ───────────────────────────────────────────────────

describe('PanelCortesClave', () => {
  it('sin marcas explica qué es un corte clave', () => {
    render(
      <PanelCortesClave marcas={[]} indiceActual={0} onIr={vi.fn()} onQuitar={vi.fn()} onMarcar={vi.fn()} onHojaEnPdf={vi.fn()} />,
    )
    expect(screen.getByText(/Todavía no hay cortes clave/)).toBeInTheDocument()
  })

  it('lista las marcas, lleva al corte y permite quitarlas', async () => {
    const usuario = userEvent.setup()
    const onIr = vi.fn()
    const onQuitar = vi.fn()
    const lesion = marca(5, 12, { label: 'Lesión frontal' })
    render(
      <PanelCortesClave
        marcas={[lesion]}
        serieActivaId={7}
        indiceActual={12}
        onIr={onIr}
        onQuitar={onQuitar}
        onMarcar={vi.fn()}
        onHojaEnPdf={vi.fn()}
      />,
    )
    expect(screen.getByText('Lesión frontal')).toBeInTheDocument()
    expect(screen.getByText(/Corte 13/)).toBeInTheDocument()
    // El nombre accesible del botón es todo su contenido (miniatura y texto).
    await usuario.click(screen.getByText('Lesión frontal'))
    expect(onIr).toHaveBeenCalledWith(lesion)
    await usuario.click(screen.getByRole('button', { name: 'Quitar la marca de Lesión frontal' }))
    expect(onQuitar).toHaveBeenCalledWith(lesion)
  })

  it('la hoja en PDF sólo se pide si hay capturas, y dice cuántos cortes no entran', async () => {
    const usuario = userEvent.setup()
    const onHoja = vi.fn().mockResolvedValue(undefined)
    api.captura.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    render(
      <PanelCortesClave
        marcas={[marca(1, 1, { has_image: true }), marca(2, 2)]}
        indiceActual={0}
        onIr={vi.fn()}
        onQuitar={vi.fn()}
        onMarcar={vi.fn()}
        onHojaEnPdf={onHoja}
      />,
    )
    expect(screen.getByText(/1 sin captura: no entran a la hoja/)).toBeInTheDocument()
    await usuario.click(screen.getByLabelText('Sin nombre del paciente'))
    await usuario.click(screen.getByRole('button', { name: 'Hoja en PDF (1)' }))
    expect(onHoja).toHaveBeenCalledWith({ anonimo: true })
  })

  it('con marcas pero sin ninguna captura la hoja no se puede pedir', () => {
    render(
      <PanelCortesClave marcas={[marca(1, 1)]} indiceActual={0} onIr={vi.fn()} onQuitar={vi.fn()} onMarcar={vi.fn()} onHojaEnPdf={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Hoja en PDF (0)' })).toBeDisabled()
  })
})

// ── Ventana de captura ──────────────────────────────────────────────────────

const captura = (marcasIncluidas = true): CapturaComponer => ({
  blob: new Blob(['png'], { type: 'image/png' }),
  ancho: 100,
  alto: 100,
  marcasIncluidas,
})

const datos = {
  estudio: 'RM de encéfalo',
  modalidad: 'MR',
  fecha: '2026-09-14',
  serie: 'T2 axial',
  indice: 11,
  total: 24,
}

function modal(extra: Partial<React.ComponentProps<typeof ModalCaptura>> = {}) {
  const props = {
    visible: true,
    modo: 'clave' as const,
    onClose: vi.fn(),
    datos,
    nombreDelPaciente: 'Ana López',
    componer: vi.fn().mockResolvedValue(captura()),
    marcaExistente: null,
    onGuardarClave: vi.fn().mockResolvedValue(undefined),
    ...extra,
  }
  render(<ModalCaptura {...props} />)
  return props
}

async function modalAsentado(extra: Partial<React.ComponentProps<typeof ModalCaptura>> = {}) {
  const props = modal(extra)
  await asentar()
  return props
}

describe('ModalCaptura', () => {
  it('muestra la vista previa y sugiere un nombre para el corte', async () => {
    await modalAsentado()
    expect(await screen.findByAltText('Vista previa de la captura')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('T2 axial · corte 12')
  })

  it('el nombre del paciente no va en la imagen salvo que se pida', async () => {
    const usuario = userEvent.setup()
    const p = await modalAsentado()
    await screen.findByAltText('Vista previa de la captura')
    expect(p.componer).toHaveBeenLastCalledWith({ marcas: true, paciente: false })
    await usuario.click(screen.getByLabelText(/Escribir el nombre del paciente/))
    await waitFor(() => expect(p.componer).toHaveBeenLastCalledWith({ marcas: true, paciente: true }))
  })

  it('sin nombre del paciente conocido no deja pedirlo', async () => {
    await modalAsentado({ nombreDelPaciente: null })
    await screen.findByAltText('Vista previa de la captura')
    expect(screen.getByLabelText(/Escribir el nombre del paciente/)).toBeDisabled()
  })

  it('guarda el corte clave con su nombre, su nota y la captura', async () => {
    const usuario = userEvent.setup()
    const p = await modalAsentado()
    await screen.findByAltText('Vista previa de la captura')
    const nombre = screen.getByLabelText('Nombre')
    await usuario.clear(nombre)
    await usuario.type(nombre, 'Lesión frontal')
    await usuario.type(screen.getByLabelText('Nota (opcional)'), 'Crece')
    await usuario.click(screen.getByRole('button', { name: 'Guardar como corte clave' }))
    await waitFor(() => expect(p.onGuardarClave).toHaveBeenCalled())
    expect((p.onGuardarClave as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ label: 'Lesión frontal', notes: 'Crece' })
    expect((p.onGuardarClave as ReturnType<typeof vi.fn>).mock.calls[0][0].imagen).toBeInstanceOf(Blob)
    expect(p.onClose).toHaveBeenCalled()
  })

  it('puede marcar el corte sin guardar la captura', async () => {
    const usuario = userEvent.setup()
    const p = await modalAsentado()
    await screen.findByAltText('Vista previa de la captura')
    await usuario.click(screen.getByLabelText('Guardar también la captura en el expediente'))
    await usuario.click(screen.getByRole('button', { name: 'Guardar como corte clave' }))
    await waitFor(() => expect(p.onGuardarClave).toHaveBeenCalled())
    expect((p.onGuardarClave as ReturnType<typeof vi.fn>).mock.calls[0][0].imagen).toBeNull()
  })

  it('si el servidor no confirma, no se cierra y lo dice', async () => {
    const usuario = userEvent.setup()
    const p = await modalAsentado({ onGuardarClave: vi.fn().mockRejectedValue(new Error('El servidor no respondió')) })
    await screen.findByAltText('Vista previa de la captura')
    await usuario.click(screen.getByRole('button', { name: 'Guardar como corte clave' }))
    expect(await screen.findByText('El servidor no respondió')).toBeInTheDocument()
    expect(p.onClose).not.toHaveBeenCalled()
  })

  it('si se pidieron las mediciones y no se pudieron dibujar, no entrega la captura a medias', async () => {
    await modalAsentado({ componer: vi.fn().mockResolvedValue(captura(false)) })
    expect(await screen.findByText(/No se pudieron dibujar las mediciones/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar como corte clave' })).toBeDisabled()
  })

  it('un corte que ya es clave ofrece actualizarlo o quitar la marca', async () => {
    const usuario = userEvent.setup()
    const onQuitarClave = vi.fn().mockResolvedValue(undefined)
    const p = await modalAsentado({ marcaExistente: marca(3, 11, { label: 'Lesión', notes: 'Nota previa' }), onQuitarClave })
    await screen.findByAltText('Vista previa de la captura')
    expect(screen.getByLabelText('Nombre')).toHaveValue('Lesión')
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('Nota previa')
    expect(screen.getByRole('button', { name: 'Actualizar el corte clave' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Quitar la marca' }))
    await waitFor(() => expect(onQuitarClave).toHaveBeenCalled())
    expect(p.onClose).toHaveBeenCalled()
  })

  it('si no se puede componer la captura lo dice', async () => {
    await modalAsentado({ componer: vi.fn().mockRejectedValue(new Error('La imagen todavía no está lista')) })
    expect(await screen.findByText('La imagen todavía no está lista')).toBeInTheDocument()
  })
})

// ── Ventana de compartir ────────────────────────────────────────────────────

const enlace = {
  id: 1,
  recipient_note: 'Dr. Ramírez',
  created_at: '2026-10-25T10:00:00',
  expires_at: '2099-01-01T00:00:00',
  revoked_at: null,
  access_count: 0,
  last_access_at: null,
  created_by: 'Dr. Salazar',
  estado: 'activo' as const,
}

function compartir(extra: Partial<React.ComponentProps<typeof ModalCompartir>> = {}) {
  const props = {
    visible: true,
    onClose: vi.fn(),
    estudioId: 9,
    cortesConCaptura: 2,
    onAbrirCaptura: vi.fn(),
    onHojaEnPdf: vi.fn().mockResolvedValue(undefined),
    ...extra,
  }
  render(<ModalCompartir {...props} />)
  return props
}

async function compartirAsentado(extra: Partial<React.ComponentProps<typeof ModalCompartir>> = {}) {
  const props = compartir(extra)
  await asentar()
  return props
}

describe('ModalCompartir', () => {
  it('no deja crear el enlace sin confirmar el consentimiento', async () => {
    const usuario = userEvent.setup()
    await compartirAsentado()
    const crear = await screen.findByRole('button', { name: 'Crear enlace' })
    expect(crear).toBeDisabled()
    await usuario.click(screen.getByLabelText(/dio su consentimiento/))
    expect(crear).not.toBeDisabled()
  })

  it('crea el enlace, lo muestra una sola vez y avisa lo que el servidor advierta', async () => {
    const usuario = userEvent.setup()
    api.crearEnlace.mockResolvedValue({ ...enlace, token: 'TOKEN_SECRETO_123', avisos: ['El equipo declara texto grabado'] })
    await compartirAsentado()
    await usuario.click(await screen.findByLabelText(/dio su consentimiento/))
    await usuario.type(screen.getByLabelText(/¿Para quién es\?/), 'Dr. Ramírez')
    await usuario.click(screen.getByRole('button', { name: 'Crear enlace' }))

    await waitFor(() =>
      expect(api.crearEnlace).toHaveBeenCalledWith(9, { hours: 24, note: 'Dr. Ramírez', consent_confirmed: true }),
    )
    const campo = (await screen.findByLabelText('Enlace para compartir')) as HTMLInputElement
    expect(campo.value).toMatch(/#\/compartido\/TOKEN_SECRETO_123$/)
    expect(screen.getByText(/no se vuelve a mostrar/)).toBeInTheDocument()
    expect(screen.getByText(/El equipo declara texto grabado/)).toBeInTheDocument()
  })

  it('si el servidor rechaza la creación, no dice que se creó', async () => {
    const usuario = userEvent.setup()
    api.crearEnlace.mockRejectedValue(new Error('El estudio no está listo para compartirse'))
    await compartirAsentado()
    await usuario.click(await screen.findByLabelText(/dio su consentimiento/))
    await usuario.click(screen.getByRole('button', { name: 'Crear enlace' }))
    expect(await screen.findByText('El estudio no está listo para compartirse')).toBeInTheDocument()
    expect(screen.queryByLabelText('Enlace para compartir')).toBeNull()
  })

  it('lista los enlaces con su estado y revoca el activo', async () => {
    const usuario = userEvent.setup()
    api.listarEnlaces.mockResolvedValue([
      enlace,
      { ...enlace, id: 2, recipient_note: null, estado: 'revocado', revoked_at: '2026-10-25T11:00:00' },
    ])
    api.revocarEnlace.mockResolvedValue({ ...enlace, estado: 'revocado' })
    await compartirAsentado()
    expect(await screen.findByText('Dr. Ramírez')).toBeInTheDocument()
    expect(screen.getByText('Revocado')).toBeInTheDocument()
    // Sólo el activo tiene «Revocar».
    const botones = screen.getAllByRole('button', { name: 'Revocar' })
    expect(botones).toHaveLength(1)
    await usuario.click(botones[0])
    await waitFor(() => expect(api.revocarEnlace).toHaveBeenCalledWith(1))
    expect(await screen.findByText(/Enlace revocado/)).toBeInTheDocument()
  })

  it('la hoja en PDF por omisión va sin nombre y no se pide sin capturas', async () => {
    const usuario = userEvent.setup()
    const p = await compartirAsentado()
    await usuario.click(screen.getByRole('button', { name: 'Descargar la hoja' }))
    expect(p.onHojaEnPdf).toHaveBeenCalledWith({ anonimo: true })
  })

  it('sin cortes con captura la hoja no se puede pedir', async () => {
    await compartirAsentado({ cortesConCaptura: 0 })
    expect(screen.getByRole('button', { name: 'Descargar la hoja' })).toBeDisabled()
    expect(screen.getByText(/Aún no hay cortes clave con captura/)).toBeInTheDocument()
  })

  it('«capturar esta imagen» abre la captura', async () => {
    const usuario = userEvent.setup()
    const p = await compartirAsentado()
    await usuario.click(screen.getByRole('button', { name: 'Capturar esta imagen…' }))
    expect(p.onAbrirCaptura).toHaveBeenCalled()
  })

  it('al cerrar se olvida el enlace completo', async () => {
    const usuario = userEvent.setup()
    api.crearEnlace.mockResolvedValue({ ...enlace, token: 'OTRO_TOKEN', avisos: [] })
    const props = {
      visible: true, onClose: vi.fn(), estudioId: 9, cortesConCaptura: 0,
      onAbrirCaptura: vi.fn(), onHojaEnPdf: vi.fn(),
    }
    const { rerender } = render(<ModalCompartir {...props} />)
    await asentar()
    await usuario.click(await screen.findByLabelText(/dio su consentimiento/))
    await usuario.click(screen.getByRole('button', { name: 'Crear enlace' }))
    await screen.findByLabelText('Enlace para compartir')
    rerender(<ModalCompartir {...props} visible={false} />)
    rerender(<ModalCompartir {...props} visible />)
    await waitFor(() => expect(screen.queryByLabelText('Enlace para compartir')).toBeNull())
    expect(within(document.body).queryByDisplayValue(/OTRO_TOKEN/)).toBeNull()
  })
})
