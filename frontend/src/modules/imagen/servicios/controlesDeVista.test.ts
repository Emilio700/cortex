/**
 * Los controles de la imagen, con una vista falsa que anota lo que le piden.
 *
 * Lo que importa: que cada botón haga lo que dice, que girar cuatro veces
 * devuelva la imagen a su sitio, que el zoom no se salga de rango y que el
 * cine no se quede corriendo al detenerlo.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  acercar,
  aplicarEstado,
  aplicarVentana,
  crearCine,
  invertir,
  irAlCorte,
  leerEstado,
  restablecer,
  rotar,
  ventanaAutomatica,
  voltear,
  type VistaLike,
} from './controlesDeVista'

function vistaFalsa(
  inicial: Partial<{ indice: number; total: number }> = {},
  /** `true`: como Cornerstone 5, el giro va por `getRotation` y `setViewPresentation`. */
  giroPorPresentacion = true
) {
  const estado = {
    indice: inicial.indice ?? 0,
    total: inicial.total ?? 10,
    voiRange: { lower: 0, upper: 100 } as { lower: number; upper: number } | undefined,
    invert: false,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    zoom: 1,
  }
  const vista: VistaLike = {
    getProperties: () => ({ voiRange: estado.voiRange, invert: estado.invert }),
    setProperties: (p) => {
      if (p.voiRange) estado.voiRange = p.voiRange
      if (p.invert !== undefined) estado.invert = p.invert
    },
    resetProperties: () => {
      estado.voiRange = { lower: 0, upper: 100 }
      estado.invert = false
    },
    ...(giroPorPresentacion
      ? {
          getRotation: () => estado.rotation,
          setViewPresentation: (p: { rotation?: number }) => {
            if (p.rotation !== undefined) estado.rotation = p.rotation
          },
        }
      : {}),
    getCamera: () => ({
      // En Cornerstone 5 la cámara no trae el giro: no se debe confiar en él ahí.
      ...(giroPorPresentacion ? {} : { rotation: estado.rotation }),
      flipHorizontal: estado.flipHorizontal,
      flipVertical: estado.flipVertical,
    }),
    setCamera: (c) => {
      if (c.rotation !== undefined) estado.rotation = c.rotation
      if (c.flipHorizontal !== undefined) estado.flipHorizontal = c.flipHorizontal
      if (c.flipVertical !== undefined) estado.flipVertical = c.flipVertical
    },
    getZoom: () => estado.zoom,
    setZoom: (z) => {
      estado.zoom = z
    },
    resetCamera: () => {
      estado.zoom = 1
    },
    render: vi.fn(),
    getImageIds: () => Array.from({ length: estado.total }, (_, i) => `img-${i}`),
    getCurrentImageIdIndex: () => estado.indice,
    setImageIdIndex: (i) => {
      estado.indice = i as number
    },
  }
  return { vista, estado }
}

describe('leerEstado', () => {
  it('traduce el rango de grises a centro y ancho', () => {
    const { vista, estado } = vistaFalsa()
    estado.voiRange = { lower: 0, upper: 80 }
    expect(leerEstado(vista)).toMatchObject({ wc: 40, ww: 80, indice: 0, total: 10 })
  })

  it('con una vista a medias no se cae y dice lo que no sabe', () => {
    expect(leerEstado({})).toEqual({
      indice: 0,
      total: 0,
      wc: null,
      ww: null,
      zoom: 1,
      rotacion: 0,
      volteoH: false,
      volteoV: false,
      invertido: false,
    })
  })
})

describe('ventana', () => {
  it('aplica centro y ancho como rango', () => {
    const { vista, estado } = vistaFalsa()
    aplicarVentana(vista, 40, 80)
    expect(estado.voiRange).toEqual({ lower: 0, upper: 80 })
  })

  it('«automático» quita el ajuste a mano pero respeta la inversión', () => {
    const { vista, estado } = vistaFalsa()
    aplicarVentana(vista, 500, 2000)
    invertir(vista)
    ventanaAutomatica(vista)
    expect(estado.voiRange).toEqual({ lower: 0, upper: 100 })
    expect(estado.invert).toBe(true)
  })
})

describe('invertir, girar y voltear', () => {
  it('invertir alterna', () => {
    const { vista, estado } = vistaFalsa()
    invertir(vista)
    expect(estado.invert).toBe(true)
    invertir(vista)
    expect(estado.invert).toBe(false)
  })

  it('girar cuatro veces deja la imagen donde estaba', () => {
    const { vista, estado } = vistaFalsa()
    for (let i = 0; i < 3; i++) rotar(vista)
    expect(estado.rotation).toBe(270)
    rotar(vista)
    expect(estado.rotation).toBe(0)
  })

  it('girar a la izquierda no da grados negativos', () => {
    const { vista, estado } = vistaFalsa()
    rotar(vista, -90)
    expect(estado.rotation).toBe(270)
  })

  it('con una vista que sólo acepta el giro en la cámara también gira', () => {
    const { vista, estado } = vistaFalsa({}, false)
    rotar(vista)
    expect(estado.rotation).toBe(90)
    expect(leerEstado(vista).rotacion).toBe(90)
  })

  it('el giro se lee de la presentación aunque la cámara no lo traiga', () => {
    const { vista } = vistaFalsa()
    rotar(vista)
    rotar(vista)
    expect(leerEstado(vista).rotacion).toBe(180)
  })

  it('voltear alterna cada eje por separado', () => {
    const { vista, estado } = vistaFalsa()
    voltear(vista, 'h')
    expect(estado).toMatchObject({ flipHorizontal: true, flipVertical: false })
    voltear(vista, 'v')
    voltear(vista, 'h')
    expect(estado).toMatchObject({ flipHorizontal: false, flipVertical: true })
  })
})

describe('zoom', () => {
  it('multiplica y se queda dentro de los límites', () => {
    const { vista, estado } = vistaFalsa()
    acercar(vista, 1.5)
    expect(estado.zoom).toBeCloseTo(1.5)
    for (let i = 0; i < 40; i++) acercar(vista, 2)
    expect(estado.zoom).toBe(ZOOM_MAXIMO)
    for (let i = 0; i < 80; i++) acercar(vista, 0.5)
    expect(estado.zoom).toBe(ZOOM_MINIMO)
  })
})

describe('restablecer y reabrir una vista guardada', () => {
  it('restablecer lo devuelve todo a como llegó', () => {
    const { vista, estado } = vistaFalsa()
    aplicarVentana(vista, 300, 600)
    invertir(vista)
    rotar(vista)
    voltear(vista, 'h')
    acercar(vista, 3)
    restablecer(vista)
    expect(estado).toMatchObject({
      voiRange: { lower: 0, upper: 100 },
      invert: false,
      rotation: 0,
      flipHorizontal: false,
      zoom: 1,
    })
  })

  it('aplicarEstado reproduce una vista y sólo toca lo que vino', () => {
    const { vista, estado } = vistaFalsa()
    aplicarEstado(vista, { wc: 40, ww: 80, rotacion: 90, volteoH: true, invertido: true, zoom: 2 })
    expect(estado).toMatchObject({
      voiRange: { lower: 0, upper: 80 },
      rotation: 90,
      flipHorizontal: true,
      invert: true,
      zoom: 2,
    })
    aplicarEstado(vista, { zoom: 1.5 })
    expect(estado.rotation).toBe(90)
    expect(estado.zoom).toBe(1.5)
  })
})

describe('irAlCorte', () => {
  it('no se sale de la pila', () => {
    const { vista, estado } = vistaFalsa({ total: 5 })
    expect(irAlCorte(vista, 99)).toBe(4)
    expect(irAlCorte(vista, -3)).toBe(0)
    expect(estado.indice).toBe(0)
  })

  it('sin cortes no hace nada', () => {
    expect(irAlCorte({}, 3)).toBe(0)
  })
})

describe('cine', () => {
  const temporizador = () => {
    let accion: (() => void) | null = null
    const parar = vi.fn()
    return {
      parar,
      tic: () => accion?.(),
      impl: {
        cada: (a: () => void) => {
          accion = a
          return 1
        },
        parar,
      },
    }
  }

  it('avanza un corte por cuadro y vuelve al primero al terminar', () => {
    const { vista, estado } = vistaFalsa({ total: 3 })
    const t = temporizador()
    const avances: number[] = []
    const cine = crearCine(vista, (i) => avances.push(i), t.impl)
    cine.iniciar(8)
    expect(cine.activo()).toBe(true)
    t.tic()
    t.tic()
    t.tic()
    expect(avances).toEqual([1, 2, 0])
    expect(estado.indice).toBe(0)
  })

  it('detener lo para de verdad', () => {
    const { vista } = vistaFalsa({ total: 3 })
    const t = temporizador()
    const cine = crearCine(vista, () => undefined, t.impl)
    cine.iniciar()
    cine.detener()
    expect(cine.activo()).toBe(false)
    expect(t.parar).toHaveBeenCalledTimes(1)
  })

  it('con un solo corte no arranca: no hay nada que reproducir', () => {
    const { vista } = vistaFalsa({ total: 1 })
    const cine = crearCine(vista, () => undefined, temporizador().impl)
    cine.iniciar()
    expect(cine.activo()).toBe(false)
  })

  it('volver a iniciar no deja dos relojes corriendo', () => {
    const { vista } = vistaFalsa({ total: 4 })
    const t = temporizador()
    const cine = crearCine(vista, () => undefined, t.impl)
    cine.iniciar(4)
    cine.iniciar(12)
    expect(t.parar).toHaveBeenCalledTimes(1)
  })
})
