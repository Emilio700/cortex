import { describe, expect, it } from 'vitest'
import { TIPOS_DE_ESTUDIO, etiquetaTipoEstudio } from './etiquetasOrden'
import {
  etiquetaEstadoHito,
  etiquetaEstadoVacuna,
  etiquetaMetodoDatacion,
  etiquetaRevisionMedicamento,
} from './etiquetasPlanClinico'

describe('etiquetas en español del plan clínico', () => {
  it('traduce cada tipo de estudio que ofrece el formulario', () => {
    expect(etiquetaTipoEstudio('laboratory')).toBe('Laboratorio')
    expect(etiquetaTipoEstudio('obstetric')).toBe('Obstetricia')
    expect(etiquetaTipoEstudio('breast')).toBe('Imagen de mama')
    for (const { valor } of TIPOS_DE_ESTUDIO) {
      expect(etiquetaTipoEstudio(valor)).not.toBe(valor)
    }
  })

  it('traduce los estados de vacuna, medicamento e hito', () => {
    expect(etiquetaEstadoVacuna('applied')).toBe('Aplicada')
    expect(etiquetaRevisionMedicamento('pending')).toBe('Pendiente')
    expect(etiquetaEstadoHito('suggested')).toBe('Sugerido')
    expect(etiquetaMetodoDatacion('ultrasound')).toBe('Ultrasonido')
  })

  it('un valor desconocido se muestra tal cual en lugar de romper la pantalla', () => {
    expect(etiquetaTipoEstudio('nuevo')).toBe('nuevo')
    expect(etiquetaEstadoVacuna('raro')).toBe('raro')
  })
})

describe('destino físico', () => {
  it('junta los estudios como el papel separado por destino', async () => {
    const { destinoFisico } = await import('./etiquetasOrden')
    expect(destinoFisico('laboratory')).toBe('laboratorio')
    expect(destinoFisico('gynecology')).toBe('laboratorio')
    expect(destinoFisico('breast')).toBe('imagen')
    expect(destinoFisico('obstetric')).toBe('imagen')
    expect(destinoFisico('referral')).toBe('otros')
    expect(destinoFisico('desconocido')).toBe('otros')
  })
})

describe('estado visible', () => {
  it('las órdenes viejas en estados del laboratorio se ven como pendientes', async () => {
    const { etiquetaEstadoOrden, estadoVisibleDe } = await import('./etiquetasOrden')
    for (const viejo of ['ordered', 'accepted', 'scheduled', 'collected', 'in_process']) {
      expect(etiquetaEstadoOrden(viejo)).toBe('Pendiente de resultado')
      expect(estadoVisibleDe({ status: viejo })).toBe('pendiente')
    }
    expect(etiquetaEstadoOrden('result_received')).toBe('Resultado recibido')
    expect(etiquetaEstadoOrden('reviewed')).toBe('Revisada')
    // Si el servidor ya lo calculó, manda lo del servidor.
    expect(estadoVisibleDe({ status: 'ordered', estado_visible: 'revisada' })).toBe('revisada')
  })
})
