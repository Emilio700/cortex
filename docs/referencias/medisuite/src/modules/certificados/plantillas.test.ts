import { describe, expect, it } from 'vitest'
import type { Registro } from '../../lib/types'
import { datosCert, prepararCancelacion, prepararEmision, recalcularHuella, tituloCert } from './documento'
import { diasConLetra, diasIncapacidad, generarCuerpo, hastaPorDias, resumenClinico, urlVerificacion, verificar, type PacienteSnap } from './plantillas'

const pac: PacienteSnap = { nombre: 'Carlos Alberto Sánchez Torres', edad: '36 años', sexo: 'M' }
const med = { nombre: 'Dra. Andrea Morales Peña', cedula: '12345678' }
const texto = (secs: { titulo?: string; texto: string }[]) => secs.map((s) => `${s.titulo ?? ''} ${s.texto}`).join('\n')

describe('fechas de incapacidad', () => {
  it('cuenta días inclusive', () => {
    expect(diasIncapacidad('2026-10-20', '2026-10-22')).toBe(3)
    expect(diasIncapacidad('2026-10-20', '2026-10-20')).toBe(1)
    expect(diasIncapacidad('2026-10-22', '2026-10-20')).toBe(0)
    expect(diasIncapacidad('2026-02-27', '2026-03-02')).toBe(4) // cruza fin de febrero (2026 no bisiesto)
  })
  it('fecha final por número de días', () => {
    expect(hastaPorDias('2026-10-20', 3)).toBe('2026-10-22')
    expect(hastaPorDias('2026-12-30', 3)).toBe('2027-01-01')
  })
  it('días con letra', () => {
    expect(diasConLetra(1)).toBe('1 (un) día')
    expect(diasConLetra(3)).toBe('3 (tres) días')
    expect(diasConLetra(21)).toBe('21 días')
  })
})

describe('generarCuerpo', () => {
  it('justificante: no incluye el diagnóstico si no se autoriza', () => {
    const c = { desde: '2026-10-20', hasta: '2026-10-22', diagnostico: 'J06.9 Infección aguda de vías respiratorias superiores', incluirDx: false }
    const t = texto(generarCuerpo('incapacidad', c, pac, '2026-10-20T10:00:00Z', med))
    expect(t).not.toMatch(/J06\.9/)
    expect(t).toMatch(/3 \(tres\) días/)
    expect(t).toMatch(/no constituye certificado de incapacidad del IMSS/)
    expect(texto(generarCuerpo('incapacidad', { ...c, incluirDx: true }, pac, '2026-10-20T10:00:00Z', med))).toMatch(/J06\.9/)
  })
  it('certificado de salud: concordancia de género y finalidad', () => {
    const t = texto(generarCuerpo('salud', { finalidad: 'escolar', conclusion: 'apto' }, { ...pac, sexo: 'F', nombre: 'Sofía' }, '2026-10-20T10:00:00Z', med))
    expect(t).toMatch(/clínicamente sana y apta para realizar actividades escolares/)
    expect(t).toMatch(/cédula profesional 12345678/)
  })
  it('referencia: secciones mínimas de la NOM-004 (6.4)', () => {
    const t = texto(generarCuerpo('referencia', { origen: 'Consultorio', destino: 'Hospital X', motivo: 'Angina', impresionDx: 'I20.9' }, pac, '2026-10-20T10:00:00Z', med))
    for (const s of ['Establecimiento que envía', 'Establecimiento / servicio receptor', 'Motivo de envío', 'Resumen clínico', 'Impresión diagnóstica', 'Terapéutica empleada']) expect(t).toContain(s)
  })
})

describe('resumen clínico', () => {
  it('incluye alergias, medicamentos, última nota y signos', () => {
    const r = resumenClinico({
      alergias: ['Penicilina'],
      medicamentos: ['Metformina 850 mg'],
      ultimaNota: { fecha: '2026-10-01', motivo: 'Control', subjetivo: 'Asintomática', diagnosticos: [] },
      signos: [{ etiqueta: 'TA', valor: '130/80 mmHg', fecha: '2026-10-01' }],
    })
    expect(r).toMatch(/Alergias: Penicilina/)
    expect(r).toMatch(/Metformina/)
    expect(r).toMatch(/motivo: Control/)
    expect(r).toMatch(/TA 130\/80/)
    expect(resumenClinico({ alergias: [], medicamentos: [], signos: [] })).toMatch(/Alergias: negadas/)
  })
})

describe('emisión, huella y verificación', () => {
  const borrador: Registro = { id: 'c1', patientId: 'p4', fecha: '2026-10-20T10:00:00Z', tipo: 'certificado', estado: 'borrador', datos: { plantilla: 'salud', campos: { finalidad: 'deportivo' } } }
  const previos: Registro[] = [{ id: 'x', tipo: 'certificado', fecha: '', estado: 'emitido', datos: { folio: 'CM-000004' } }, { id: 'y', tipo: 'referencia', fecha: '', datos: { folio: 'RF-000009' } }]
  const patch = prepararEmision(borrador, pac, med, previos, '2026-10-20T11:00:00.000Z')
  const emitido: Registro = { ...borrador, ...patch }
  it('asigna folio consecutivo por prefijo y congela el texto', () => {
    expect(datosCert(emitido).folio).toBe('CM-000005')
    expect(emitido.estado).toBe('emitido')
    expect(datosCert(emitido).cuerpo?.length).toBeGreaterThan(2)
    expect(emitido.titulo).toBe('Certificado médico de salud (deportivo) · CM-000005')
  })
  it('la huella se recalcula igual y detecta alteraciones', () => {
    const h = String(emitido.datos.hash)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(recalcularHuella(emitido)).toBe(h)
    expect(verificar(emitido, h.slice(0, 16), () => recalcularHuella(emitido))).toBe('valido')
    const alterado: Registro = { ...emitido, datos: { ...emitido.datos, cuerpo: [{ texto: 'otro' }] } }
    expect(verificar(alterado, h.slice(0, 16), () => recalcularHuella(alterado))).toBe('alterado')
    expect(verificar(emitido, '0000000000000000', () => recalcularHuella(emitido))).toBe('alterado')
    expect(verificar(undefined, h, () => '')).toBe('no-encontrado')
  })
  it('cancelar solo cambia estado y agrega el motivo', () => {
    const c = prepararCancelacion(emitido, ' error en fechas ')
    expect(c.estado).toBe('cancelado')
    expect(c.datos).toEqual({ ...emitido.datos, motivoCancelacion: 'error en fechas' })
    const cancelado = { ...emitido, ...c }
    expect(verificar(cancelado, String(emitido.datos.hash).slice(0, 16), () => recalcularHuella(cancelado))).toBe('cancelado')
  })
  it('URL de verificación', () => {
    expect(urlVerificacion('https://x.mx/app/', 'CM-000005', 'abcdef0123456789ffff')).toBe('https://x.mx/app/#/certificados?v=CM-000005&h=abcdef0123456789')
  })
  it('título de referencia', () => {
    expect(tituloCert('referencia', { modalidad: 'referencia', especialidad: 'Cardiología' }, 'RF-000001')).toBe('Referencia a Cardiología · RF-000001')
  })
})
