import { describe, expect, it } from 'vitest'

import { medicionDeAnotacion, nombreDeMedicion, unidadLegible } from './mediciones'

const anotacion = (toolName: string, estadisticas: Record<string, unknown>) => ({
  annotationUID: 'uid-1',
  metadata: { toolName },
  data: { cachedStats: { 'imageId:abc': estadisticas } },
})

describe('medicionDeAnotacion', () => {
  it('la distancia trae su unidad', () => {
    expect(medicionDeAnotacion(anotacion('Length', { length: 18.43, unit: 'mm' }))).toEqual({
      kind: 'length',
      value: 18.43,
      unit: 'mm',
      annotationUID: 'uid-1',
      detalle: {},
    })
  })

  it('sin espaciado de píxel la distancia sigue en píxeles y lo dice', () => {
    expect(medicionDeAnotacion(anotacion('Length', { length: 120, unit: 'px' }))?.unit).toBe('px')
  })

  it('el ángulo va en grados', () => {
    const medicion = medicionDeAnotacion(anotacion('Angle', { angle: 67.5 }))
    expect(medicion).toMatchObject({ kind: 'angle', value: 67.5, unit: '°' })
  })

  it('la elipse da el área en mm² y guarda la media de la región', () => {
    const medicion = medicionDeAnotacion(
      anotacion('EllipticalROI', { area: 212.4, areaUnit: 'mm2', mean: 311.2, stdDev: 40.1, modalityUnit: 'HU' })
    )
    expect(medicion).toMatchObject({ kind: 'roi', value: 212.4, unit: 'mm²' })
    expect(medicion?.detalle).toEqual({ mean: 311.2, std_dev: 40.1, modality_unit: 'HU' })
  })

  it('un trazo sin estadísticas todavía no es una medición', () => {
    expect(medicionDeAnotacion({ annotationUID: 'u', metadata: { toolName: 'Length' }, data: { cachedStats: {} } })).toBeNull()
    expect(medicionDeAnotacion(anotacion('Length', {}))).toBeNull()
    expect(medicionDeAnotacion(anotacion('Length', { length: 'x' }))).toBeNull()
  })

  it('lo que no es de este visor se ignora', () => {
    expect(medicionDeAnotacion(anotacion('Probe', { value: 3 }))).toBeNull()
    expect(medicionDeAnotacion(null)).toBeNull()
    expect(medicionDeAnotacion({ metadata: { toolName: 'Length' } })).toBeNull()
  })
})

describe('textos', () => {
  it('cada tipo tiene su nombre', () => {
    expect(nombreDeMedicion('length')).toBe('Distancia')
    expect(nombreDeMedicion('angle')).toBe('Ángulo')
    expect(nombreDeMedicion('roi')).toBe('Área (elipse)')
    expect(nombreDeMedicion('otra')).toBe('Medición')
  })

  it('las unidades de área se escriben bien', () => {
    expect(unidadLegible('mm2')).toBe('mm²')
    expect(unidadLegible(' mm ')).toBe('mm')
    expect(unidadLegible(null)).toBe('')
  })
})
