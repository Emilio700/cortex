import { describe, expect, it } from 'vitest'
import { rangoDe, ventanaARGBA } from './ventanaDicom'

const gris = (px: number[], op: Parameters<typeof ventanaARGBA>[1]) =>
  Array.from(ventanaARGBA(px, op, new Uint8ClampedArray(px.length * 4))).filter((_, i) => i % 4 === 0)

describe('ventana de una radiografía DICOM', () => {
  it('con la ventana del archivo: lo de abajo negro, lo de arriba blanco', () => {
    expect(gris([0, 500, 1000], { pendiente: 1, intercepto: 0, centro: 500, ancho: 1000, invertir: false })).toEqual([0, 128, 255])
  })

  it('sin ventana usa el rango de la imagen', () => {
    expect(gris([100, 200], { pendiente: 1, intercepto: 0, invertir: false })).toEqual([0, 255])
  })

  it('aplica pendiente e intercepto antes de la ventana', () => {
    expect(rangoDe([0, 10], { pendiente: 2, intercepto: -5 })).toEqual({ min: -5, max: 15 })
  })

  it('MONOCHROME1 se invierte: el hueso sigue viéndose blanco', () => {
    expect(gris([0, 1000], { pendiente: 1, intercepto: 0, centro: 500, ancho: 1000, invertir: true })).toEqual([255, 0])
  })

  it('una imagen plana no divide entre cero', () => {
    expect(gris([7, 7], { pendiente: 1, intercepto: 0, invertir: false }).every((g) => g >= 0 && g <= 255)).toBe(true)
  })

  it('el canal alfa siempre es opaco', () => {
    const rgba = ventanaARGBA([1, 2], { pendiente: 1, intercepto: 0, invertir: false }, new Uint8ClampedArray(8))
    expect([rgba[3], rgba[7]]).toEqual([255, 255])
  })
})
