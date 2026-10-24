/**
 * Resumen del expediente: la fotografía clínica actual, no otra lista
 * (plan 32, punto 6). Última consulta y su motivo, próxima cita, episodios
 * activos, últimos resultados con su valoración y lo pendiente.
 *
 * Recepción no lo pide (el servidor se lo niega): ve la ficha y las citas.
 */
import { useCallback, useEffect, useState } from 'react'
import { CAlert, CButton, CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../shared/services/api'
import { mensajeDeError } from '../../shared/utils/errors'
import { formatearHoraDeCita, formatearInstante } from '../../shared/utils/date'
import ClinicalRecordPanel from '../doctor/components/ClinicalRecordPanel'
import { datosValoracion } from '../doctor/utils/valoracion'
import type { EncabezadoExpediente, ResumenExpediente } from './tipos'

const cuando = (iso?: string | null) => formatearHoraDeCita(iso, { dateStyle: 'medium', timeStyle: 'short' }, 'Sin registro')

function FotografiaClinica({ patientId, onIrA }: { patientId: number; onIrA: (p: 'estudios' | 'consultas') => void }) {
  const [datos, setDatos] = useState<ResumenExpediente | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setDatos((await apiClient.get<ResumenExpediente>(`/patients/${patientId}/expediente/resumen`)).data)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar el resumen.'))
    }
  }, [patientId])
  useEffect(() => { void cargar() }, [cargar])

  if (error) {
    return (
      <CAlert color="danger" className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <span>{error}</span>
        <CButton color="danger" variant="outline" size="sm" onClick={() => void cargar()}>Reintentar</CButton>
      </CAlert>
    )
  }
  if (!datos) return <div className="text-center p-4"><CSpinner size="sm" /></div>

  const a = datos.alertas
  return (
    <section className="expediente-foto" aria-label="Fotografía clínica actual" data-tour="expediente-fotografia">
      <div className="expediente-foto__bloque">
        <h3 className="expediente-foto__titulo">Última consulta</h3>
        {datos.ultima_consulta ? (
          <>
            <div className="fw-semibold">{cuando(datos.ultima_consulta.scheduled_at)}</div>
            {datos.ultima_consulta.motivo && <p className="expediente-foto__motivo">{datos.ultima_consulta.motivo}</p>}
            <button type="button" className="expediente-enlace" onClick={() => onIrA('consultas')}>Ver sus consultas</button>
          </>
        ) : (
          <div className="text-body-secondary">Aún no tiene consultas atendidas.</div>
        )}
      </div>
      <div className="expediente-foto__bloque">
        <h3 className="expediente-foto__titulo">Próxima cita</h3>
        <div className="fw-semibold">{datos.proxima_cita ? cuando(datos.proxima_cita.scheduled_at) : 'Sin cita agendada'}</div>
      </div>
      <div className="expediente-foto__bloque">
        <h3 className="expediente-foto__titulo">Estudios</h3>
        {a ? (
          <ul className="expediente-foto__lista">
            <li>{a.pendientes} {a.pendientes === 1 ? 'pendiente de resultado' : 'pendientes de resultado'}</li>
            <li>{a.por_revisar} por revisar</li>
            {a.atrasados > 0 && <li className="text-warning-emphasis fw-semibold">{a.atrasados} atrasados</li>}
            {a.criticos > 0 && <li className="text-danger fw-semibold">{a.criticos} críticos abiertos</li>}
          </ul>
        ) : (
          <div className="text-body-secondary">—</div>
        )}
        <button type="button" className="expediente-enlace" onClick={() => onIrA('estudios')}>Ver estudios</button>
      </div>
      <div className="expediente-foto__bloque expediente-foto__bloque--ancho">
        <h3 className="expediente-foto__titulo">Últimos resultados</h3>
        {(datos.resultados_recientes ?? []).length === 0 ? (
          <div className="text-body-secondary">Sin resultados registrados.</div>
        ) : (
          <ul className="expediente-foto__lista">
            {(datos.resultados_recientes ?? []).map((r) => {
              const v = datosValoracion(r.valoracion)
              return (
                <li key={`${r.order_id}-${r.fecha}`}>
                  <span className="fw-semibold">{r.study_name}</span>{' '}
                  <span className="text-body-secondary">· {formatearInstante(r.fecha, { dateStyle: 'medium' })}</span>
                  {v && <span className={`ms-2 badge text-bg-${v.color}`}>{v.etiqueta}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {(datos.episodios_activos ?? []).length > 0 && (
        <div className="expediente-foto__bloque expediente-foto__bloque--ancho">
          <h3 className="expediente-foto__titulo">Episodios activos</h3>
          <ul className="expediente-foto__lista">
            {(datos.episodios_activos ?? []).map((e) => (
              <li key={e.id}>{e.title}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default function PestanaResumen({
  datos,
  appointmentId,
  onIrA,
}: {
  datos: EncabezadoExpediente
  appointmentId?: number
  onIrA: (p: 'estudios' | 'consultas') => void
}) {
  if (!datos.vista_clinica) {
    // Recepción: la ficha general y el contacto ya están arriba; aquí, para
    // qué sirve el expediente para ella.
    return (
      <CAlert color="light" className="mb-0">
        Aquí ves la ficha, las citas, los documentos de referencia y el estado de sus estudios. Lo clínico lo
        lleva el médico.
      </CAlert>
    )
  }
  return (
    <div className="d-flex flex-column gap-3">
      <FotografiaClinica patientId={datos.patient_id} onIrA={onIrA} />
      <ClinicalRecordPanel
        patientId={datos.patient_id}
        appointmentId={appointmentId}
        ownerDoctorId={datos.owner_doctor_id}
        secciones={['episodios']}
      />
    </div>
  )
}
