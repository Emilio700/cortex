import { describe, expect, it } from 'vitest'
import { CAPAS, capasEfectivas, estadoInicialDeCapas, etapaDelPelado, multiplicadoresDelPelado } from './capas'
import { VISTAS, duracionDeTransicion, suavizar, vistaPorTecla } from './vistas'

describe('capas', () => {
  it('las vías empiezan apagadas y marcadas como esquemáticas; lo demás, encendido', () => {
    const estado = estadoInicialDeCapas()
    expect(estado.tractos.visible).toBe(false)
    expect(CAPAS.find((c) => c.id === 'tractos')!.esquematica).toBe(true)
    expect(Object.values(estado).filter((c) => c.visible)).toHaveLength(CAPAS.length - 1)
  })

  it('sin pelar se ve todo como lo eligió el médico', () => {
    const e = capasEfectivas(estadoInicialDeCapas(), 0)
    expect(e.piel).toEqual({ visible: true, opacidad: 1 })
    expect(e.encefalo.opacidad).toBe(1)
  })

  it('el pelado quita la piel, luego el cráneo y aclara el encéfalo', () => {
    expect(multiplicadoresDelPelado(0.5)).toMatchObject({ piel: 0.5, craneo: 1, encefalo: 1, revelar: 0 })
    expect(multiplicadoresDelPelado(1.5)).toMatchObject({ piel: 0, craneo: 0.5 })
    const final = capasEfectivas(estadoInicialDeCapas(), 3)
    expect(final.piel.visible).toBe(false)
    expect(final.craneo.visible).toBe(false)
    expect(final.encefalo.opacidad).toBeCloseTo(0.18)
  })

  it('al final del pelado descubre ventrículos y vasos aunque estuvieran apagados', () => {
    const estado = estadoInicialDeCapas()
    estado.ventriculos.visible = false
    expect(capasEfectivas(estado, 0).ventriculos.visible).toBe(false)
    expect(capasEfectivas(estado, 3).ventriculos).toEqual({ visible: true, opacidad: 1 })
  })

  it('las venas y senos son una capa propia que el pelado también descubre', () => {
    expect(CAPAS.find((c) => c.id === 'venas')!.nombre).toBe('Venas y senos')
    const estado = estadoInicialDeCapas()
    expect(estado.venas.visible).toBe(true)
    estado.venas.visible = false
    expect(capasEfectivas(estado, 0).venas.visible).toBe(false)
    expect(capasEfectivas(estado, 3).venas).toEqual({ visible: true, opacidad: 1 })
  })

  it('una capa apagada sigue apagada aunque se pele', () => {
    const estado = estadoInicialDeCapas()
    estado.columna.visible = false
    expect(capasEfectivas(estado, 3).columna.visible).toBe(false)
  })

  it('nombra la etapa del deslizador', () => {
    expect(etapaDelPelado(0)).toBe('Piel')
    expect(etapaDelPelado(2.2)).toBe('Encéfalo')
    expect(etapaDelPelado(9)).toBe('Ventrículos y vasos')
  })
})

describe('vistas', () => {
  it('cada vista tiene su tecla, sin repetir', () => {
    const teclas = VISTAS.map((v) => v.tecla)
    expect(new Set(teclas).size).toBe(teclas.length)
    expect(vistaPorTecla('5')!.id).toBe('columna')
    expect(vistaPorTecla('x')).toBeUndefined()
  })

  it('el sagital medio abre con el corte en la línea media', () => {
    expect(VISTAS.find((v) => v.id === 'sagital')!.corte).toEqual({ plano: 'sagital', posicion: 0 })
  })

  it('con «reducir movimiento» la cámara salta, sin transición', () => {
    expect(duracionDeTransicion(true)).toBe(0)
    expect(duracionDeTransicion(false)).toBeGreaterThan(0)
    expect(duracionDeTransicion(false)).toBeLessThanOrEqual(800)
  })

  it('la curva de suavizado va de 0 a 1 sin pasarse', () => {
    expect(suavizar(0)).toBe(0)
    expect(suavizar(1)).toBe(1)
    expect(suavizar(0.5)).toBeCloseTo(0.5)
    expect(suavizar(-1)).toBe(0)
    expect(suavizar(2)).toBe(1)
  })
})
