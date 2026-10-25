import { describe, expect, it } from 'vitest'
import {
  LEYENDA_CAIDA,
  LEYENDA_DISPONIBLE,
  LEYENDA_SIN_GPU,
  LEYENDA_SIN_WEBGL2,
  calidadInicial,
  claveDePreferencia,
  clasificarGpu,
  crearMonitorDeFps,
  disponibilidadRealista,
  equipoApto,
  guardarPreferencia,
  leerPreferencia,
  leyendaDeCalidad,
  motivoParaEstandar,
  type CapacidadDelEquipo,
} from './calidad'

const equipo = (cambio: Partial<CapacidadDelEquipo> = {}): CapacidadDelEquipo => ({
  webgl2: true,
  maxTextura: 16384,
  reducirMovimiento: false,
  movil: false,
  gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ...cambio,
})

describe('capacidad del equipo', () => {
  it('reconoce la tarjeta por su nombre', () => {
    expect(clasificarGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)')).toBe('dedicada')
    expect(clasificarGpu('AMD Radeon RX 6600')).toBe('dedicada')
    expect(clasificarGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)')).toBe('integrada')
    expect(clasificarGpu('Apple M2')).toBe('suficiente')
    expect(clasificarGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('software')
    expect(clasificarGpu('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('software')
    expect(clasificarGpu(null)).toBe('desconocida')
    expect(clasificarGpu('Tarjeta rara 9000')).toBe('desconocida')
  })

  it('Realista sólo con tarjeta dedicada (o, sin nombre, con capacidad de sobra)', () => {
    expect(equipoApto(equipo())).toBe(true)
    expect(equipoApto(equipo({ gpu: 'Intel(R) Iris(R) Xe Graphics' }))).toBe(false)
    expect(equipoApto(equipo({ gpu: 'SwiftShader' }))).toBe(false)
    expect(equipoApto(equipo({ gpu: null, maxTextura: 16384 }))).toBe(true)
    expect(equipoApto(equipo({ gpu: null, maxTextura: 4096 }))).toBe(false)
    expect(equipoApto(equipo({ maxTextura: 2048 }))).toBe(false)
  })

  it('sin WebGL2 o sin tarjeta dedicada, Realista se deshabilita y dice por qué', () => {
    expect(disponibilidadRealista(equipo())).toEqual({ disponible: true })
    expect(disponibilidadRealista(equipo({ webgl2: false }))).toEqual({ disponible: false, motivo: LEYENDA_SIN_WEBGL2 })
    expect(disponibilidadRealista(equipo({ gpu: 'Intel(R) UHD Graphics' }))).toEqual({ disponible: false, motivo: LEYENDA_SIN_GPU })
  })

  it('la leyenda dice qué puede el equipo y, si bajó por fps, ofrece reintentar', () => {
    expect(leyendaDeCalidad(equipo(), false, 'realista')).toEqual({ texto: LEYENDA_DISPONIBLE, tono: 'ok', reintentar: false })
    expect(leyendaDeCalidad(equipo({ gpu: 'SwiftShader' }), false, 'estandar')).toMatchObject({ texto: LEYENDA_SIN_GPU, reintentar: false })
    expect(leyendaDeCalidad(equipo(), true, 'estandar')).toEqual({ texto: LEYENDA_CAIDA, tono: 'caida', reintentar: true })
    // Si después de la caída el médico volvió a Realista, ya no se habla de la caída.
    expect(leyendaDeCalidad(equipo(), true, 'realista').texto).toBe(LEYENDA_DISPONIBLE)
    expect(LEYENDA_SIN_GPU).toBe('Este equipo usa calidad estándar: el render realista necesita una tarjeta gráfica dedicada')
  })
})

describe('calidad inicial', () => {
  it('sin preferencia, Realista sólo si el equipo lo aguanta', () => {
    expect(calidadInicial(null, equipo())).toBe('realista')
    expect(calidadInicial(null, equipo({ reducirMovimiento: true }))).toBe('estandar')
    expect(calidadInicial(null, equipo({ movil: true }))).toBe('estandar')
    expect(calidadInicial(null, equipo({ gpu: 'Intel(R) UHD Graphics' }))).toBe('estandar')
    expect(motivoParaEstandar(equipo({ reducirMovimiento: true }))).toMatch(/Reducir movimiento/)
    expect(motivoParaEstandar(equipo())).toBeNull()
  })

  it('la preferencia guardada manda, salvo que el equipo no pueda', () => {
    expect(calidadInicial('estandar', equipo())).toBe('estandar')
    expect(calidadInicial('realista', equipo({ reducirMovimiento: true }))).toBe('realista')
    expect(calidadInicial('realista', equipo({ webgl2: false }))).toBe('estandar')
    expect(calidadInicial('realista', equipo({ gpu: 'SwiftShader' }))).toBe('estandar')
  })
})

describe('preferencia por usuario', () => {
  const almacen = () => {
    const datos = new Map<string, string>()
    return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v), datos }
  }

  it('se guarda y se lee por usuario', () => {
    const a = almacen()
    expect(guardarPreferencia(7, 'realista', a)).toBe(true)
    expect(leerPreferencia(7, a)).toBe('realista')
    expect(leerPreferencia(8, a)).toBeNull()
    expect(a.datos.has(claveDePreferencia(7))).toBe(true)
    expect(claveDePreferencia(null)).toBe('cortex.neuro3d.calidad.sin-usuario')
  })

  it('un valor raro o un almacenamiento bloqueado no rompen nada', () => {
    const a = almacen()
    a.setItem(claveDePreferencia(1), 'ultra')
    expect(leerPreferencia(1, a)).toBeNull()
    const bloqueado = {
      getItem: () => {
        throw new Error('privado')
      },
      setItem: () => {
        throw new Error('privado')
      },
    }
    expect(leerPreferencia(1, bloqueado)).toBeNull()
    expect(guardarPreferencia(1, 'estandar', bloqueado)).toBe(false)
    expect(guardarPreferencia(1, 'estandar', null)).toBe(false)
  })
})

describe('caída automática', () => {
  /** Registra cuadros cada `paso` ms durante `duracion` ms; devuelve en qué momento pidió bajar. */
  const correr = (monitor: ReturnType<typeof crearMonitorDeFps>, paso: number, duracion: number, desde = 0) => {
    for (let t = desde; t <= desde + duracion; t += paso) if (monitor.registrar(t)) return t
    return null
  }

  it('con cuadros fluidos no baja', () => {
    const m = crearMonitorDeFps({ fpsMinimo: 24, ventanaMs: 4000 })
    expect(correr(m, 16, 10000)).toBeNull()
    expect(m.fps()!).toBeGreaterThan(55)
  })

  it('con cuadros lentos sostenidos baja una sola vez', () => {
    const m = crearMonitorDeFps({ fpsMinimo: 24, ventanaMs: 4000 })
    const cuando = correr(m, 100, 10000)
    expect(cuando).not.toBeNull()
    expect(cuando!).toBeGreaterThanOrEqual(4000)
    expect(m.fps()!).toBeLessThan(12)
    // Ya avisó: no vuelve a pedirlo.
    expect(correr(m, 100, 10000, 20000)).toBeNull()
  })

  it('un tirón corto no basta: hace falta la ventana entera', () => {
    const m = crearMonitorDeFps({ fpsMinimo: 24, ventanaMs: 4000 })
    expect(correr(m, 100, 1500)).toBeNull()
    expect(correr(m, 16, 6000, 1600)).toBeNull()
  })

  it('una escena quieta corta la racha (no se pinta si nada cambia)', () => {
    const m = crearMonitorDeFps({ fpsMinimo: 24, ventanaMs: 4000 })
    for (let tanda = 0; tanda < 5; tanda++) {
      expect(correr(m, 100, 3000, tanda * 10000)).toBeNull()
      m.interrumpir()
    }
  })

  it('una pausa larga (compilar un sombreador) empieza otra ventana', () => {
    const m = crearMonitorDeFps({ fpsMinimo: 24, ventanaMs: 4000, pausaMaximaMs: 1500 })
    expect(correr(m, 100, 3000)).toBeNull()
    // Tras la pausa, 3.5 s lentos no bastan: la ventana empezó de nuevo en 6 s.
    expect(correr(m, 100, 3500, 6000)).toBeNull()
    expect(correr(m, 100, 1000, 9600)).not.toBeNull()
  })
})
