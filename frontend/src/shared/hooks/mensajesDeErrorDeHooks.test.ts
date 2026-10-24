/**
 * Prueba de humo: los hooks de datos nunca muestran un error en inglés.
 *
 * Antes, cuando el servidor no mandaba `detail`, el respaldo era el texto del
 * programador («Error fetching appointments») y eso le llegaba a la doctora en
 * la alerta. Ahora pasan por `mensajeDeError`, que traduce por código HTTP y
 * cae en un respaldo en español. Una prueba por hook: si alguien vuelve a
 * poner un respaldo en inglés en uno, falla el suyo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useAppointments } from '../../modules/secretaria/hooks/useAppointments'
import { useTriage as useTriageRecepcion } from '../../modules/secretaria/hooks/useTriage'
import { useDoctorAppointments } from '../../modules/doctor/hooks/useDoctorAppointments'
import { useCertificates } from '../../modules/doctor/hooks/useCertificates'
import { useDoctorProfile } from '../../modules/doctor/hooks/useDoctorProfile'
import { usePrescriptions } from '../../modules/doctor/hooks/usePrescriptions'
import { useSOAPNotes } from '../../modules/doctor/hooks/useSOAPNotes'
import { useTriage as useTriageDoctora } from '../../modules/doctor/hooks/useTriage'
import { usePatientDocuments } from './usePatientDocuments'

// Un fallo sin respuesta HTTP ni petición: el caso en que sólo queda el
// respaldo. Su `message` en inglés es justo lo que no debe verse.
// `vi.hoisted` porque el mock se evalúa antes que el resto del archivo.
const { fallo, api } = vi.hoisted(() => {
  const fallo = () => Promise.reject(new Error('Request failed'))
  return { fallo, api: { get: vi.fn(fallo), post: vi.fn(fallo), put: vi.fn(fallo), patch: vi.fn(fallo), delete: vi.fn(fallo) } }
})

vi.mock('../services/api', () => ({ default: api, apiClient: api }))

const EN_INGLES = /\b(error (fetching|creating|updating|uploading|downloading|deleting|printing|generating)|request failed)\b/i

/** Llama a la acción del hook ignorando si relanza: aquí sólo importa el texto. */
const intentar = async (accion: () => Promise<unknown>) => {
  await act(async () => {
    try {
      await accion()
    } catch {
      // Algunos hooks relanzan además de guardar el error; da igual aquí.
    }
  })
}

describe('mensajes de error de los hooks', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockImplementation(fallo))
  })

  it('useAppointments (recepción): citas', async () => {
    const { result } = renderHook(() => useAppointments())
    await intentar(() => result.current.fetchAppointments())
    expect(result.current.error).toBe('No se pudieron cargar las citas.')
  })

  it('useTriage (recepción): signos vitales', async () => {
    const { result } = renderHook(() => useTriageRecepcion())
    await intentar(() => result.current.createTriage({ appointment_id: 1 } as never))
    expect(result.current.error).toBe('No se pudieron guardar los signos vitales.')
  })

  it('useDoctorAppointments: mis citas', async () => {
    const { result } = renderHook(() => useDoctorAppointments())
    await intentar(() => result.current.fetchMyAppointments())
    expect(result.current.error).toBe('No se pudieron cargar las citas.')
  })

  it('useCertificates: certificados de la paciente', async () => {
    const { result } = renderHook(() => useCertificates())
    await intentar(() => result.current.getPatientCertificates(1))
    expect(result.current.error).toBe('No se pudieron cargar los certificados de la paciente.')
  })

  it('useDoctorProfile: perfil', async () => {
    const { result } = renderHook(() => useDoctorProfile())
    await intentar(() => result.current.getProfile())
    expect(result.current.error).toBe('No se pudo cargar tu perfil.')
  })

  it('usePrescriptions: recetas de la paciente', async () => {
    const { result } = renderHook(() => usePrescriptions())
    await intentar(() => result.current.getPatientPrescriptions(1))
    expect(result.current.error).toBe('No se pudieron cargar las recetas de la paciente.')
  })

  it('useSOAPNotes: notas de la paciente', async () => {
    const { result } = renderHook(() => useSOAPNotes())
    await intentar(() => result.current.getPatientSOAPNotes(1))
    expect(result.current.error).toBe('No se pudieron cargar las notas de la paciente.')
  })

  it('useTriage (doctora): historial de signos', async () => {
    const { result } = renderHook(() => useTriageDoctora())
    await intentar(() => result.current.getPatientTriageHistory(1))
    expect(result.current.error).toBe('No se pudo cargar el historial de signos vitales.')
  })

  it('usePatientDocuments: documentos', async () => {
    const { result } = renderHook(() => usePatientDocuments())
    await intentar(() => result.current.fetchPatientDocuments(1))
    expect(result.current.error).toBe('No se pudieron cargar los documentos.')
  })

  it('sin conexión dice que no hay conexión, no el texto de axios', async () => {
    api.get.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('Network Error'), { request: {} })),
    )
    const { result } = renderHook(() => useSOAPNotes())
    await intentar(() => result.current.getPatientSOAPNotes(1))
    expect(result.current.error).toMatch(/No se pudo conectar/)
    expect(result.current.error).not.toMatch(EN_INGLES)
    expect(result.current.error).not.toMatch(/Network Error/)
  })
})
