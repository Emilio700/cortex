/**
 * Presets, atajos, capturas, cortes clave y enlaces: lo que se decide sin pantalla.
 */
import { describe, expect, it } from 'vitest'

import { ATAJOS, accionDeTecla, atajosPorGrupo, estaEscribiendo, tituloConAtajo } from './atajos'
import {
  etiquetaSugerida,
  lineasDelSello,
  limpiarParaArchivo,
  nombreDeArchivoCaptura,
} from './captura'
import {
  DURACIONES_DE_ENLACE,
  estadoDeEnlace,
  textoDeAccesos,
  textoDeVencimiento,
  urlDelEnlace,
} from './compartir'
import {
  cortesClaveVecino,
  cortesDeSerie,
  estadoDeVistaGuardada,
  marcaDelCorte,
  posicionesEnDeslizador,
  tituloDeCorteClave,
  vistaParaGuardar,
  type CorteClave,
} from './cortesClave'
import { presetsParaModalidad, rangoDeVentana, textoDeVentana, ventanaDeRango } from './presets'

const marca = (id: number, serie: number, indice: number, label: string | null = null): CorteClave => ({
  id,
  study_id: 1,
  series_id: serie,
  series_description: 't2',
  instance_index: indice,
  sop_instance_uid: null,
  label,
  notes: null,
  view_state: {},
  has_image: false,
  created_at: '2026-10-25T10:00:00',
  updated_at: '2026-10-25T10:00:00',
  created_by: null,
})

describe('presets de ventana', () => {
  it('la tomografía trae presets estándar; la resonancia, ninguno inventado', () => {
    expect(presetsParaModalidad('CT').map((p) => p.id)).toContain('encefalo')
    expect(presetsParaModalidad('ct').length).toBeGreaterThan(0)
    expect(presetsParaModalidad('MR')).toEqual([])
    expect(presetsParaModalidad(null)).toEqual([])
  })

  it('centro y ancho van y vienen del rango', () => {
    expect(rangoDeVentana(40, 80)).toEqual({ lower: 0, upper: 80 })
    expect(ventanaDeRango(0, 80)).toEqual({ wc: 40, ww: 80 })
    const ida = ventanaDeRango(rangoDeVentana(500, 2000).lower, rangoDeVentana(500, 2000).upper)
    expect(ida).toEqual({ wc: 500, ww: 2000 })
  })

  it('el ancho nunca es cero', () => {
    expect(rangoDeVentana(10, 0).upper).toBeGreaterThan(rangoDeVentana(10, 0).lower)
    expect(ventanaDeRango(5, 5).ww).toBe(1)
  })

  it('dice «automática» cuando no sabe la ventana', () => {
    expect(textoDeVentana(null, null)).toBe('Ventana automática')
    expect(textoDeVentana(40.4, 80.2)).toBe('WC 40 · WW 80')
  })
})

describe('atajos de teclado', () => {
  it('cada tecla lleva a su acción', () => {
    expect(accionDeTecla({ key: 'ArrowDown' })).toBe('corte-siguiente')
    expect(accionDeTecla({ key: 'ArrowUp' })).toBe('corte-anterior')
    expect(accionDeTecla({ key: ' ' })).toBe('cine')
    expect(accionDeTecla({ key: 'K' })).toBe('corte-clave')
    expect(accionDeTecla({ key: '+' })).toBe('acercar')
    expect(accionDeTecla({ key: 'Escape' })).toBe('salir')
  })

  it('una tecla que no es del visor no hace nada', () => {
    expect(accionDeTecla({ key: 'q' })).toBeNull()
    expect(accionDeTecla({ key: 'Tab' })).toBeNull()
  })

  it('con Ctrl, Cmd o Alt no se interpreta: son del navegador', () => {
    expect(accionDeTecla({ key: 'c', ctrlKey: true })).toBeNull()
    expect(accionDeTecla({ key: 'r', metaKey: true })).toBeNull()
    expect(accionDeTecla({ key: 'f', altKey: true })).toBeNull()
  })

  it('ninguna tecla está repetida entre dos acciones', () => {
    const vistas = new Map<string, string>()
    for (const atajo of ATAJOS) {
      for (const tecla of atajo.teclas) {
        expect(vistas.has(tecla), `«${tecla}» ya es de ${vistas.get(tecla)}`).toBe(false)
        vistas.set(tecla, atajo.accion)
      }
    }
  })

  it('no roba teclas mientras se escribe', () => {
    const campo = document.createElement('input')
    const area = document.createElement('textarea')
    const boton = document.createElement('button')
    expect(estaEscribiendo(campo)).toBe(true)
    expect(estaEscribiendo(area)).toBe(true)
    expect(estaEscribiendo(boton)).toBe(false)
    expect(estaEscribiendo(null)).toBe(false)
  })

  it('el botón dice su atajo, sacado de la misma tabla', () => {
    expect(tituloConAtajo('invertir', 'Invertir los grises')).toBe('Invertir los grises (I)')
    expect(tituloConAtajo('cine', 'Reproducir')).toBe('Reproducir (Espacio)')
  })

  it('la ayuda agrupa todos los atajos', () => {
    const total = atajosPorGrupo().reduce((suma, g) => suma + g.atajos.length, 0)
    expect(total).toBe(ATAJOS.length)
  })
})

describe('capturas', () => {
  const datos = {
    estudio: 'RM de encéfalo',
    modalidad: 'MR',
    fecha: '2026-09-14T00:00:00',
    serie: 'T2 axial',
    indice: 11,
    total: 24,
  }

  it('el sello dice estudio, serie, fecha y corte, y no trae el nombre por omisión', () => {
    const lineas = lineasDelSello(datos)
    expect(lineas).toEqual([
      'RM de encéfalo · MR',
      'T2 axial · 14/09/2026',
      'Corte 12 / 24',
    ])
  })

  it('el nombre del paciente sólo va si se pide', () => {
    expect(lineasDelSello({ ...datos, paciente: 'Ana López' })[0]).toBe('Ana López')
  })

  it('anota la ventana y la inversión', () => {
    const lineas = lineasDelSello({ ...datos, ventana: 'WC 40 · WW 80', invertido: true })
    const ultima = lineas[lineas.length - 1]
    expect(ultima).toBe('Corte 12 / 24 · WC 40 · WW 80 · invertido')
  })

  it('sin fecha lo dice en vez de inventarla', () => {
    expect(lineasDelSello({ ...datos, fecha: null })[1]).toBe('T2 axial · sin fecha')
  })

  it('el archivo tiene un nombre que cualquier sistema acepta', () => {
    expect(nombreDeArchivoCaptura(datos)).toBe('cortex-mr-t2-axial-corte-012-2026-09-14.png')
    expect(limpiarParaArchivo('Ñandú / Serie #3 ¡ya!')).toBe('nandu-serie-3-ya')
    expect(limpiarParaArchivo('???')).toBe('sin-nombre')
  })

  it('sugiere una etiqueta para el corte', () => {
    expect(etiquetaSugerida('T2 axial', 11)).toBe('T2 axial · corte 12')
    expect(etiquetaSugerida(null, 0)).toBe('corte 1')
  })
})

describe('cortes clave', () => {
  const marcas = [marca(1, 7, 20), marca(2, 7, 3, 'Lesión frontal'), marca(3, 8, 5)]

  it('los de una serie salen por posición', () => {
    expect(cortesDeSerie(marcas, 7).map((m) => m.id)).toEqual([2, 1])
    expect(cortesDeSerie(marcas, null)).toEqual([])
  })

  it('encuentra la marca del corte que se ve, y sólo de esa serie', () => {
    expect(marcaDelCorte(marcas, 7, 3)?.id).toBe(2)
    expect(marcaDelCorte(marcas, 8, 3)).toBeNull()
  })

  it('salta al siguiente y al anterior', () => {
    expect(cortesClaveVecino(marcas, 7, 3, 1)?.id).toBe(1)
    expect(cortesClaveVecino(marcas, 7, 20, -1)?.id).toBe(2)
    expect(cortesClaveVecino(marcas, 7, 20, 1)).toBeNull()
    expect(cortesClaveVecino(marcas, 7, 3, -1)).toBeNull()
  })

  it('las muescas del deslizador van de 0 a 100 %', () => {
    expect(posicionesEnDeslizador([marca(1, 7, 0), marca(2, 7, 10)], 11)).toEqual([0, 100])
    expect(posicionesEnDeslizador([marca(1, 7, 0)], 1)).toEqual([])
  })

  it('el título es su nombre o, si no, dónde está', () => {
    expect(tituloDeCorteClave(marca(1, 7, 4, 'Lesión'))).toBe('Lesión')
    expect(tituloDeCorteClave(marca(1, 7, 4, '  '))).toBe('Corte 5')
  })

  it('la vista de ida y vuelta es la misma', () => {
    const estado = {
      indice: 4,
      total: 10,
      wc: 40,
      ww: 80,
      zoom: 2,
      rotacion: 90,
      volteoH: true,
      volteoV: false,
      invertido: true,
    }
    const guardada = vistaParaGuardar(estado)
    expect(guardada).toEqual({
      wc: 40,
      ww: 80,
      zoom: 2,
      rotation: 90,
      flip_h: true,
      flip_v: false,
      invert: true,
    })
    expect(estadoDeVistaGuardada(guardada)).toEqual({
      wc: 40,
      ww: 80,
      zoom: 2,
      rotacion: 90,
      volteoH: true,
      volteoV: false,
      invertido: true,
    })
  })

  it('una vista guardada a medias sólo aplica lo que trae', () => {
    expect(estadoDeVistaGuardada({ invert: true })).toEqual({ invertido: true })
    expect(estadoDeVistaGuardada({})).toEqual({})
  })
})

describe('enlaces temporales', () => {
  it('ofrece hasta una semana y nada más', () => {
    expect(Math.max(...DURACIONES_DE_ENLACE.map((d) => d.horas))).toBe(168)
  })

  it('arma la dirección con la ruta del visor, sin dobles barras', () => {
    expect(urlDelEnlace('https://cortex.mx/', 'abc')).toBe('https://cortex.mx/#/compartido/abc')
    expect(urlDelEnlace('http://localhost:3010', 'x_y-z')).toBe('http://localhost:3010/#/compartido/x_y-z')
  })

  it('dice cuánto falta, interpretando la hora del servidor como UTC', () => {
    const ahora = new Date('2026-10-25T12:00:00Z')
    expect(textoDeVencimiento('2026-10-25T12:30:00', ahora)).toBe('vence en 30 min')
    expect(textoDeVencimiento('2026-10-25T15:00:00', ahora)).toBe('vence en 3 h')
    expect(textoDeVencimiento('2026-10-29T12:00:00', ahora)).toBe('vence en 4 días')
    expect(textoDeVencimiento('2026-10-25T11:59:00', ahora)).toBe('venció')
    expect(textoDeVencimiento('basura', ahora)).toBe('sin fecha de vencimiento')
  })

  it('cada estado tiene su insignia', () => {
    expect(estadoDeEnlace({ estado: 'activo' }).color).toBe('success')
    expect(estadoDeEnlace({ estado: 'revocado' }).texto).toBe('Revocado')
    expect(estadoDeEnlace({ estado: 'vencido' }).color).toBe('secondary')
  })

  it('cuenta los accesos', () => {
    expect(textoDeAccesos(0)).toBe('Sin abrir')
    expect(textoDeAccesos(1)).toBe('1 acceso')
    expect(textoDeAccesos(5)).toBe('5 accesos')
  })
})
