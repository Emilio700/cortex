/**
 * Expediente único (plan 32, punto 6): las pestañas las decide el servidor,
 * cargan al abrirse y recepción ve su vista recortada.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const permisos = vi.hoisted(() => ({ actuales: [] as string[] }))

vi.mock('../../shared/services/api', () => ({ apiClient: { get }, default: { get } }))
vi.mock('../../shared/context/AuthContext', () => ({
  useAuth: () => ({ can: (a: string) => permisos.actuales.includes(a), user: { role: 'doctor' } }),
}))
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...real, useNavigate: () => navigate }
})
// Las pestañas reusan paneles que ya tienen sus propias pruebas.
vi.mock('../secretaria/components/PatientHistory', () => ({ PatientHistory: () => <div>Citas de la paciente</div> }))
vi.mock('../doctor/components/MedicalHistoryViewer', () => ({ default: () => <div>Notas, recetas y certificados</div> }))
vi.mock('../doctor/components/HistorialEstudios', () => ({ default: () => <div>Historial de estudios</div> }))
vi.mock('../doctor/components/GraficaValoraciones', () => ({ default: () => null }))
vi.mock('../doctor/components/PatientDocuments', () => ({ default: () => <div>Documentos de la paciente</div> }))
vi.mock('./PestanaImagenes', () => ({ default: () => <div>Imágenes clínicas</div> }))
vi.mock('../doctor/components/ClinicalRecordPanel', () => ({
  default: ({ secciones }: { secciones?: string[] }) => <div>Panel {secciones?.join(',')}</div>,
}))

import ExpedienteDePaciente from './ExpedienteDePaciente'

const DOCTORA = {
  patient_id: 7, nombre: 'Ana López', first_name: 'Ana', last_name: 'López', date_of_birth: '1990-01-01',
  phone: '669 123 4567', allergies: 'Penicilina',
  pestanas: ['resumen', 'consultas', 'estudios', 'documentos', 'imagenes', 'embarazo', 'consentimientos', 'equipo'],
  vista_clinica: true,
  embarazo: { semanas: 20, dias: 3 },
  alertas: { criticos: 1, atrasados: 2, por_revisar: 0, pendientes: 3 },
  cita_de_hoy: { id: 55, scheduled_at: '2026-10-10T10:00:00', status: 'confirmada' },
}
const RESUMEN = { ultima_consulta: null, proxima_cita: null, episodios_activos: [], resultados_recientes: [], alertas: DOCTORA.alertas }

const montar = () =>
  render(
    <MemoryRouter>
      <ExpedienteDePaciente patientId={7} />
    </MemoryRouter>,
  )

describe('ExpedienteDePaciente', () => {
  beforeEach(() => {
    get.mockReset()
    navigate.mockReset()
    localStorage.clear()
    permisos.actuales = ['clinical_tracking.read', 'soap_notes.read', 'clinical_consents.read', 'appointments.create']
  })

  it('la doctora ve el encabezado clínico y todas las pestañas', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.endsWith('/resumen') ? RESUMEN : DOCTORA }),
    )
    montar()
    expect(await screen.findByText('Alergias: Penicilina')).toBeInTheDocument()
    expect(screen.getByText('Embarazo: 20 sem 3 d')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 crítico abierto/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 estudios atrasados/ })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Resumen', 'Consultas', 'Estudios', 'Documentos', 'Imágenes', 'Embarazo', 'Consentimientos', 'Equipo',
    ])
  })

  it('«Abrir la consulta de hoy» lleva a su cita', async () => {
    const user = userEvent.setup()
    get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/resumen') ? RESUMEN : DOCTORA }))
    montar()
    await user.click(await screen.findByRole('button', { name: /Abrir la consulta de hoy/ }))
    expect(navigate).toHaveBeenCalledWith('/doctor/consultation/55')
  })

  it('sin cita hoy ofrece «Agendar», no una consulta sin cita', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.endsWith('/resumen') ? RESUMEN : { ...DOCTORA, cita_de_hoy: null } }),
    )
    montar()
    expect(await screen.findByRole('button', { name: /Agendar/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Abrir la consulta/ })).toBeNull()
  })

  it('cada pestaña se monta solo al abrirla y recuerda cuál quedó abierta', async () => {
    const user = userEvent.setup()
    get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/resumen') ? RESUMEN : DOCTORA }))
    const { unmount } = montar()
    await screen.findByRole('tab', { name: /Estudios/ })
    expect(screen.queryByText('Historial de estudios')).toBeNull()
    await user.click(screen.getByRole('tab', { name: /Estudios/ }))
    expect(screen.getByText('Historial de estudios')).toBeInTheDocument()
    unmount()
    montar()
    expect(await screen.findByText('Historial de estudios')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Estudios/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('recepción solo ve las pestañas que el servidor le da, sin lo clínico', async () => {
    permisos.actuales = ['patients.read', 'documents.read', 'clinical_tracking.attach_result']
    get.mockImplementation((url: string) => {
      if (url.endsWith('/expediente')) {
        return Promise.resolve({
          data: {
            ...DOCTORA, vista_clinica: false, embarazo: null, alertas: null, cita_de_hoy: null,
            pestanas: ['resumen', 'consultas', 'estudios', 'documentos', 'consentimientos'],
          },
        })
      }
      if (url.endsWith('/awaiting-result')) return Promise.resolve({ data: { items: [], total: 0 } })
      return Promise.resolve({ data: [] })
    })
    const user = userEvent.setup()
    montar()
    await screen.findByRole('tab', { name: /Resumen/ })
    expect(screen.queryByRole('tab', { name: /Embarazo/ })).toBeNull()
    expect(screen.queryByRole('tab', { name: /Imágenes/ })).toBeNull()
    expect(screen.queryByText(/Embarazo:/)).toBeNull()
    // El resumen clínico ni se pide.
    expect(get).not.toHaveBeenCalledWith('/patients/7/expediente/resumen')
    await user.click(screen.getByRole('tab', { name: /Estudios/ }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/clinical-tracking/orders/awaiting-result', {
        params: { patient_id: 7, limit: 100 },
      }),
    )
    expect(screen.queryByText('Historial de estudios')).toBeNull()
    await user.click(screen.getByRole('tab', { name: /Consentimientos/ }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('/patients/7/expediente/consentimientos', { params: undefined }))
  })

  it('si no se pudo abrir, lo dice con Reintentar', async () => {
    get.mockRejectedValueOnce({ response: { status: 404, data: { detail: 'No se encontró la paciente.' } } })
    montar()
    expect(await screen.findByText('No se encontró la paciente.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
