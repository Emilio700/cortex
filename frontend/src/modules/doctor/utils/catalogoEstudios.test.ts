import { describe, it, expect } from 'vitest'
import {
  buscarEstudios,
  faltaEnSeleccion,
  ordenarGrupos,
  prefijoGrupo,
  seleccionCompleta,
  sitioAnatomico,
  textoEstudio,
  type GrupoEstudios,
} from './catalogoEstudios'

const resonancia: GrupoEstudios = {
  clave: 'resonancia',
  nombre: 'Resonancia magnetica',
  modalidad: 'RM',
  modificadores: ['Simple', 'Contrastada'],
  estudios: ['Cerebro', 'Mamas', 'Columna'],
}
const extremidades: GrupoEstudios = {
  clave: 'extremidades',
  nombre: 'Extremidades',
  modalidad: 'RX',
  requiere_lateralidad: true,
  estudios: ['Rodilla', 'Hombro'],
}
const ultrasonidos: GrupoEstudios = {
  clave: 'ultrasonidos',
  nombre: 'Ultrasonidos',
  modalidad: 'US',
  requiere_region: true,
  estudios: ['Ultrasonido Doppler venoso'],
}
const imagenMujer: GrupoEstudios = {
  clave: 'imagen_mujer',
  nombre: 'Imagen de la mujer',
  modalidad: 'Imagen',
  destacado: true,
  estudios: ['US mamario', 'Densitometria osea'],
}
const rxTorax: GrupoEstudios = {
  clave: 'rx_torax',
  nombre: 'Rayos X - Torax',
  modalidad: 'RX',
  estudios: ['PA', 'Lateral'],
}

describe('prefijoGrupo', () => {
  it('usa el nombre del grupo en mayusculas', () => {
    expect(prefijoGrupo(resonancia)).toBe('RESONANCIA MAGNETICA')
  })
  it('abrevia los grupos de rayos X', () => {
    expect(prefijoGrupo(extremidades)).toBe('RX EXTREMIDADES')
    expect(prefijoGrupo(rxTorax)).toBe('RX TORAX')
  })
})

describe('textoEstudio', () => {
  it('arma el texto con modificador', () => {
    expect(textoEstudio({ grupo: resonancia, estudio: 'Mamas', modificador: 'Contrastada' })).toBe(
      'RESONANCIA MAGNETICA — Mamas (Contrastada)',
    )
  })
  it('omite el modificador cuando no se eligio', () => {
    expect(textoEstudio({ grupo: resonancia, estudio: 'Cerebro' })).toBe(
      'RESONANCIA MAGNETICA — Cerebro',
    )
  })
  it('arma el texto con lateralidad', () => {
    expect(textoEstudio({ grupo: extremidades, estudio: 'Rodilla', lateralidad: 'Derecha' })).toBe(
      'RX EXTREMIDADES — Rodilla (Derecha)',
    )
  })
  it('arma el texto con region', () => {
    expect(
      textoEstudio({
        grupo: ultrasonidos,
        estudio: 'Ultrasonido Doppler venoso',
        region: '  Miembro   inferior ',
      }),
    ).toBe('ULTRASONIDOS — Ultrasonido Doppler venoso (Miembro inferior)')
  })
  it('ignora detalles que el grupo no pide', () => {
    expect(
      textoEstudio({
        grupo: imagenMujer,
        estudio: 'US mamario',
        region: 'Torax',
        lateralidad: 'Derecha',
        modificador: 'Simple',
      }),
    ).toBe('IMAGEN DE LA MUJER — US mamario')
  })
  it('devuelve tal cual el estudio escrito a mano', () => {
    expect(textoEstudio({ grupo: null, estudio: '', manual: '  Panel de trombofilia ' })).toBe(
      'Panel de trombofilia',
    )
  })
  it('no pasa del limite de study_name', () => {
    const largo: GrupoEstudios = { ...resonancia, nombre: 'X'.repeat(300) }
    expect(textoEstudio({ grupo: largo, estudio: 'Mamas' })).toHaveLength(255)
  })
})

describe('faltaEnSeleccion', () => {
  it('exige región cuando el grupo la pide', () => {
    expect(
      faltaEnSeleccion({ grupo: ultrasonidos, estudio: 'Ultrasonido Doppler venoso' }),
    ).toContain('región')
  })
  it('exige lateralidad cuando el grupo la pide', () => {
    expect(faltaEnSeleccion({ grupo: extremidades, estudio: 'Rodilla' })).toContain('izquierda')
  })
  it('no exige modificador', () => {
    expect(seleccionCompleta({ grupo: resonancia, estudio: 'Mamas' })).toBe(true)
  })
  it('exige texto cuando se escribe a mano', () => {
    expect(seleccionCompleta({ grupo: null, estudio: '', manual: '' })).toBe(false)
    expect(seleccionCompleta({ grupo: null, estudio: '', manual: 'Perfil tiroideo' })).toBe(true)
  })
})

describe('ordenarGrupos y buscarEstudios', () => {
  it('pone los destacados primero', () => {
    expect(ordenarGrupos([resonancia, imagenMujer, extremidades])[0].clave).toBe('imagen_mujer')
  })
  it('busca sin acentos ni mayusculas y prioriza destacados', () => {
    const encontrados = buscarEstudios([resonancia, imagenMujer], 'MAM')
    expect(encontrados[0]).toEqual({ grupo: imagenMujer, estudio: 'US mamario' })
    expect(encontrados.map((e) => e.estudio)).toContain('Mamas')
  })
  it('sin texto no devuelve nada', () => {
    expect(buscarEstudios([resonancia], '')).toEqual([])
  })
})

describe('sitioAnatomico', () => {
  it('recoge region y lateralidad solo cuando aplican', () => {
    expect(sitioAnatomico({ grupo: ultrasonidos, estudio: 'x', region: 'Miembro inferior' })).toBe(
      'Miembro inferior',
    )
    expect(sitioAnatomico({ grupo: extremidades, estudio: 'x', lateralidad: 'Izquierda' })).toBe(
      'Izquierda',
    )
    expect(sitioAnatomico({ grupo: resonancia, estudio: 'Mamas', region: 'Torax' })).toBe('')
    expect(sitioAnatomico({ grupo: null, estudio: '', manual: 'Otro' })).toBe('')
  })
})
