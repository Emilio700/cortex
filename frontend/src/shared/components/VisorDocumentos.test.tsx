/**
 * Visor de documentos con carrusel (plan 26, D-2).
 *
 * Lo que no puede pasar: que un PDF se descargue en vez de verse (Blob sin
 * MIME), que el visor se quede con los Blob en memoria al cerrarse, o que un
 * error al cargar se vea como una hoja en blanco.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('../services/api', () => ({ apiClient: { get }, default: { get } }))
const acciones = vi.hoisted(() => ({
  tactil: false,
  imprimir: vi.fn(async (_pdf: Blob) => {}),
  compartir: vi.fn(async (_pdf: Blob, _nombre: string) => 'compartido' as const),
}))
vi.mock('./pdf/acciones', () => ({
  esDispositivoTactil: () => acciones.tactil,
  imprimirPdfReal: (pdf: Blob) => acciones.imprimir(pdf),
  abrirOCompartirPdf: (pdf: Blob, nombre: string) => acciones.compartir(pdf, nombre),
}))

import VisorDocumentos, {
  archivoDeDocumento,
  cargarDocumento,
  type ArchivoVisor,
} from './VisorDocumentos'

let contador = 0
const creadas: Blob[] = []

beforeEach(() => {
  get.mockReset()
  acciones.tactil = false
  acciones.imprimir.mockReset().mockResolvedValue(undefined)
  acciones.compartir.mockReset().mockResolvedValue('compartido')
  contador = 0
  creadas.length = 0
  URL.createObjectURL = vi.fn((blob: Blob) => {
    creadas.push(blob)
    contador += 1
    return `blob:${contador}`
  })
  URL.revokeObjectURL = vi.fn()
})

const archivo = (clave: string, nombre: string, mime: string): ArchivoVisor => ({
  clave,
  nombre,
  mime,
  cargar: vi.fn(async () => new Blob(['x'])),
})

describe('VisorDocumentos', () => {
  it('muestra el PDF en un iframe con su tipo real', async () => {
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="Resultado"
        archivos={[archivo('a', 'bh.pdf', 'application/pdf')]}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull()
    expect(creadas[0].type).toBe('application/pdf')
  })

  it('pasa de un archivo a otro con flechas y miniaturas, PDF e imágenes juntos', async () => {
    const user = userEvent.setup()
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="Ultrasonido"
        archivos={[
          archivo('a', 'reporte.pdf', 'application/pdf'),
          archivo('b', 'foto1.jpg', 'image/jpeg'),
          archivo('c', 'foto2.png', 'image/png'),
        ]}
      />,
    )
    expect(await screen.findByText('1 de 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archivo siguiente' }))
    expect(screen.getByText('2 de 3')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('img', { name: 'foto1.jpg' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Ver foto2.png' }))
    expect(screen.getByText('3 de 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Archivo siguiente' }))
    expect(screen.getByText('1 de 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archivo anterior' }))
    expect(screen.getByText('3 de 3')).toBeInTheDocument()
  })

  it('libera todos los Blob al cerrarse', async () => {
    const archivos = [archivo('a', 'a.pdf', 'application/pdf'), archivo('b', 'b.jpg', 'image/jpeg')]
    const { rerender } = render(
      <VisorDocumentos visible onClose={() => {}} titulo="X" archivos={archivos} />,
    )
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
    rerender(<VisorDocumentos visible={false} onClose={() => {}} titulo="X" archivos={archivos} />)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2')
  })

  it('si el archivo no carga lo dice y deja reintentar, sin hoja en blanco', async () => {
    const fallido: ArchivoVisor = {
      clave: 'z',
      nombre: 'z.pdf',
      mime: 'application/pdf',
      cargar: vi
        .fn()
        .mockRejectedValueOnce(new Error('Esta orden está cancelada.'))
        .mockResolvedValueOnce(new Blob(['%PDF'])),
    }
    const user = userEvent.setup()
    render(<VisorDocumentos visible onClose={() => {}} titulo="X" archivos={[fallido]} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta orden está cancelada.')
    expect(document.querySelector('canvas[aria-label^="Página"]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
  })

  it('descargar usa el nombre del archivo', async () => {
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="X"
        archivos={[archivo('a', 'resultado VDRL.pdf', 'application/pdf')]}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    await user.click(screen.getByRole('button', { name: 'Descargar' }))
    expect((clic.mock.contexts[0] as HTMLAnchorElement).download).toBe('resultado VDRL.pdf')
    clic.mockRestore()
  })
})

describe('cargarDocumento', () => {
  it('crea el Blob con el MIME que manda el servidor', async () => {
    get.mockResolvedValue({ data: new Blob(['x']), headers: { 'content-type': 'image/jpeg' } })
    const blob = await cargarDocumento(140)
    expect(get).toHaveBeenCalledWith('/documents/140/download', { responseType: 'blob' })
    expect(blob.type).toBe('image/jpeg')
  })

  it('si el servidor no lo dice, usa el MIME que trae la lista', async () => {
    get.mockResolvedValue({
      data: new Blob(['x']),
      headers: { 'content-type': 'application/octet-stream' },
    })
    const blob = await archivoDeDocumento(140, 'bh.pdf', 'application/pdf').cargar()
    expect(blob.type).toBe('application/pdf')
  })
})

describe('VisorDocumentos · imprimir (plan 26, M2 y M3)', () => {
  const pdf = () => [archivo('a', 'orden.pdf', 'application/pdf')]

  it('si el navegador no puede imprimir el PDF lo dice y ofrece descargarlo, sin anotar impresión', async () => {
    const alUsar = vi.fn()
    const user = userEvent.setup()
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="X"
        archivos={pdf()}
        imprimible
        alUsar={alUsar}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    acciones.imprimir.mockRejectedValue(new Error('bloqueado'))

    await user.click(screen.getByRole('button', { name: 'Imprimir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no pudo abrir la impresión')
    expect(screen.getByRole('button', { name: 'Descargar el PDF' })).toBeInTheDocument()
    expect(alUsar).not.toHaveBeenCalled()
  })

  it('al abrir la impresión dice solo eso y la anota; si no se anotó, avisa', async () => {
    const alUsar = vi
      .fn()
      .mockResolvedValue('Se abrió la impresión, pero no quedó anotada en la bitácora.')
    const user = userEvent.setup()
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="X"
        archivos={pdf()}
        imprimible
        alUsar={alUsar}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )

    await user.click(screen.getByRole('button', { name: 'Imprimir' }))

    // Se imprime el PDF real (el Blob), no la imagen dibujada en pantalla.
    expect(acciones.imprimir.mock.calls[0][0]).toBeInstanceOf(Blob)
    await waitFor(() => expect(alUsar).toHaveBeenCalledWith('impreso'))
    expect(await screen.findByText(/no quedó anotada en la bitácora/)).toBeInTheDocument()
    expect(screen.queryByText(/se imprimió/i)).toBeNull()
  })
})

describe('VisorDocumentos · celular', () => {
  it('el modal se pone a pantalla completa en pantallas chicas', async () => {
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="X"
        archivos={[archivo('a', 'a.pdf', 'application/pdf')]}
      />,
    )
    await waitFor(() => expect(document.querySelector('.modal-fullscreen-md-down')).not.toBeNull())
  })
})

describe('VisorDocumentos · PDF en el teléfono (plan 26, N5)', () => {
  const pdf = () => [archivo('a', 'orden.pdf', 'application/pdf')]

  it('en un teléfono no ofrece «Imprimir»: ofrece «Abrir / Compartir» y no anota «impreso»', async () => {
    acciones.tactil = true
    const alUsar = vi.fn()
    const user = userEvent.setup()
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="X"
        archivos={pdf()}
        imprimible
        alUsar={alUsar}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    expect(screen.queryByRole('button', { name: 'Imprimir' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Abrir / Compartir' }))

    expect(acciones.compartir).toHaveBeenCalledWith(expect.any(Blob), 'orden.pdf')
    await waitFor(() => expect(alUsar).toHaveBeenCalledWith('descargado'))
    expect(alUsar).not.toHaveBeenCalledWith('impreso')
  })

  it('si solo se abrió el PDF (sin compartir), no se anota nada', async () => {
    acciones.tactil = true
    acciones.compartir.mockResolvedValue('abierto' as never)
    const alUsar = vi.fn()
    const user = userEvent.setup()
    render(
      <VisorDocumentos
        visible
        onClose={() => {}}
        titulo="X"
        archivos={pdf()}
        imprimible
        alUsar={alUsar}
      />,
    )
    await user.click(await screen.findByRole('button', { name: 'Abrir / Compartir' }))
    await waitFor(() => expect(acciones.compartir).toHaveBeenCalled())
    expect(alUsar).not.toHaveBeenCalled()
  })

  it('el PDF se dibuja en la página, no en un iframe', async () => {
    render(<VisorDocumentos visible onClose={() => {}} titulo="X" archivos={pdf()} />)
    await waitFor(() =>
      expect(document.querySelector('canvas[aria-label^="Página"]')).not.toBeNull(),
    )
    expect(document.querySelector('iframe')).toBeNull()
  })
})
