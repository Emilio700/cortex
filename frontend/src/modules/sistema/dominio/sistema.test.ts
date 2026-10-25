import { describe, expect, it } from 'vitest'
import { motivoParaNoEncender, presentacionDeEstado } from './sistema'

const modulo = (extra = {}) => ({
  id: 'dictado',
  nombre: 'Dictado',
  descripcion: '...',
  servicio_requerido: 'whisper' as string | null,
  servicio_configurado: false,
  activo: false,
  ...extra,
})

describe('presentación del estado de un servicio', () => {
  it('solo «en línea» va en verde', () => {
    expect(presentacionDeEstado('en_linea')).toEqual({ texto: 'En línea', color: 'success' })
    expect(presentacionDeEstado('sin_respuesta').color).toBe('danger')
    expect(presentacionDeEstado('no_configurado').color).toBe('secondary')
  })

  it('la IA configurada no se pinta como comprobada', () => {
    const ia = presentacionDeEstado('configurado')
    expect(ia.color).not.toBe('success')
    expect(ia.texto).toContain('sin probar')
  })

  it('un estado que no conoce no se disfraza de bueno', () => {
    expect(presentacionDeEstado('raro').color).toBe('secondary')
  })
})

describe('cuándo un módulo no se deja encender', () => {
  it('si su servicio no está configurado, dice cuál falta', () => {
    expect(motivoParaNoEncender(modulo())).toContain('Whisper')
  })

  it('con el servicio configurado, o sin servicio, se puede', () => {
    expect(motivoParaNoEncender(modulo({ servicio_configurado: true }))).toBeNull()
    expect(motivoParaNoEncender(modulo({ servicio_requerido: null }))).toBeNull()
  })

  it('apagarlo siempre se puede, aunque su servicio se haya caído', () => {
    expect(motivoParaNoEncender(modulo({ activo: true }))).toBeNull()
  })
})
