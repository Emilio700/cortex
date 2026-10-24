/**
 * Imprimir y compartir un PDF sin anotar lo que no pasó (plan 26, N5).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { abrirOCompartirPdf, imprimirPdfReal } from './acciones'

const pdf = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })

afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll('iframe').forEach((m) => m.remove())
})

const marcoCreado = () => document.querySelector('iframe') as HTMLIFrameElement

describe('imprimirPdfReal', () => {
  it('abre el diálogo de impresión sobre el PDF real cuando el marco carga', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:real')
    URL.revokeObjectURL = vi.fn()
    const promesa = imprimirPdfReal(pdf(), 8000, 0)
    const marco = marcoCreado()
    expect(marco.getAttribute('src')).toBe('blob:real')
    // Tamaño real fuera de la vista: un marco de 0×0 o invisible se imprime en blanco (R5).
    expect(marco.style.width).toBe('816px')
    expect(marco.style.height).toBe('1056px')
    expect(marco.style.opacity).toBe('')
    const print = vi.fn()
    Object.defineProperty(marco, 'contentWindow', { value: { focus: vi.fn(), print } })
    marco.onload?.(new Event('load'))
    await expect(promesa).resolves.toBeUndefined()
    expect(print).toHaveBeenCalled()
  })

  it('si el navegador no deja imprimir, falla (y nadie anota «impreso»)', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:real')
    URL.revokeObjectURL = vi.fn()
    const promesa = imprimirPdfReal(pdf(), 8000, 0)
    const marco = marcoCreado()
    Object.defineProperty(marco, 'contentWindow', {
      value: {
        focus: vi.fn(),
        print: () => {
          throw new Error('bloqueado')
        },
      },
    })
    marco.onload?.(new Event('load'))
    await expect(promesa).rejects.toThrow('no pudo abrir la impresión')
  })

  it('si el PDF nunca carga, se rinde en vez de esperar para siempre', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:real')
    URL.revokeObjectURL = vi.fn()
    await expect(imprimirPdfReal(pdf(), 20)).rejects.toThrow('no terminó de cargar')
  })
})

describe('abrirOCompartirPdf', () => {
  it('con Web Share comparte el archivo con su nombre', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share, canShare: () => true })
    await expect(abrirOCompartirPdf(pdf(), 'orden.pdf')).resolves.toBe('compartido')
    expect((share.mock.calls[0][0].files[0] as File).name).toBe('orden.pdf')
  })

  it('si la usuaria cierra el menú, no cuenta como compartido', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }))
    Object.assign(navigator, { share, canShare: () => true })
    await expect(abrirOCompartirPdf(pdf(), 'orden.pdf')).resolves.toBe('cancelado')
  })

  it('sin Web Share lo abre en otra pestaña con el visor del sistema', async () => {
    Object.assign(navigator, { share: undefined, canShare: undefined })
    URL.createObjectURL = vi.fn(() => 'blob:abrir')
    URL.revokeObjectURL = vi.fn()
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    await expect(abrirOCompartirPdf(pdf(), 'orden.pdf')).resolves.toBe('abierto')
    expect(abrir).toHaveBeenCalledWith('blob:abrir', '_blank', 'noopener')
  })
})
