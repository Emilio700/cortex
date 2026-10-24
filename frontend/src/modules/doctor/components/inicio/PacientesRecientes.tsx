/**
 * Pacientes recientes (plan 28, §4.1 punto 6): las últimas cinco distintas que
 * atendió, con fecha y motivo. Tocar una abre su expediente.
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton } from '@coreui/react-pro'

import type { DatoVivo } from '../../hooks/useDatoVivo'
import type { Appointment } from '../../../secretaria/types'
import { TIPO_LABELS } from '../../../secretaria/utils/tablero'
import { formatearHoraDeCita } from '../../../../shared/utils/date'
import { pedir } from '../../../../shared/utils/pedidos'
import { iniciales, recientesDistintas } from '../../utils/inicio'
import { rutaDelExpediente } from '../../../expediente/rutas'

interface Props {
  recientes: DatoVivo<Appointment[]>
}

export const PacientesRecientes: React.FC<Props> = ({ recientes }) => {
  const navigate = useNavigate()
  const lista = recientes.datos ? recientesDistintas(recientes.datos, 5) : null

  // Un solo destino para todos los roles: el expediente (plan 32, punto 6).
  const abrir = (cita: Appointment) => navigate(rutaDelExpediente(cita.patient_id))

  let cuerpo: React.ReactNode
  if (lista === null && recientes.error) {
    cuerpo = (
      <div className="inicio-estado-error" role="alert">
        <p>{recientes.error}</p>
        <CButton color="primary" variant="outline" size="sm" onClick={() => void recientes.recargar()}>
          Reintentar
        </CButton>
      </div>
    )
  } else if (lista === null) {
    cuerpo = (
      <div aria-busy="true" aria-label="Cargando pacientes recientes">
        {[0, 1, 2].map((i) => (
          <div className="inicio-reciente inicio-cita--esqueleto" key={i}>
            <span className="hf-skeleton" style={{ width: 36, height: 36, borderRadius: 999 }} />
            <span className="hf-skeleton" style={{ flex: 1, height: 14 }} />
          </div>
        ))}
      </div>
    )
  } else if (lista.length === 0) {
    cuerpo = <p className="inicio-vacio">Todavía no tienes consultas atendidas.</p>
  } else {
    cuerpo = (
      <ul className="inicio-recientes">
        {lista.map((cita) => {
          const nombre = cita.patient ? `${cita.patient.first_name} ${cita.patient.last_name}` : 'Paciente sin nombre'
          const motivo = (cita.motivo_extra ?? '').trim() || TIPO_LABELS[cita.appointment_type ?? 'consulta'] || 'Consulta'
          const fecha = formatearHoraDeCita(cita.scheduled_at, { day: '2-digit', month: 'short', year: 'numeric' })
          return (
            <li key={cita.id}>
              <button
                type="button"
                className="inicio-reciente"
                onClick={() => abrir(cita)}
              >
                {/* El nombre es el texto visible (axe, label-content-name-
                    mismatch): un aria-label aparte no coincidía con lo que se
                    lee en pantalla. Las comas ocultas separan para el lector. */}
                <span className="inicio-cita-avatar" aria-hidden="true">
                  {iniciales(cita.patient?.first_name, cita.patient?.last_name)}
                </span>
                <span className="inicio-cita-texto">
                  <span className="inicio-cita-nombre">{nombre}</span>
                  <span className="visually-hidden">, </span>
                  <span className="inicio-cita-sub">{motivo}</span>
                </span>
                <span className="visually-hidden">, </span>
                <span className="inicio-reciente-fecha">{fecha}</span>
                <span className="visually-hidden">. Abrir expediente</span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section className="inicio-tarjeta inicio-aparece" data-tour="doctora-recientes" aria-labelledby="inicio-recientes-titulo">
      <div className="inicio-tarjeta-cabecera">
        <h2 id="inicio-recientes-titulo" className="inicio-tarjeta-titulo">
          Pacientes recientes
        </h2>
        <CButton
          color="link"
          size="sm"
          className="inicio-pie-enlace"
          onClick={() => {
            pedir('consultas:periodo', 'todo')
            navigate('/doctor/appointments')
          }}
        >
          Ver todas
        </CButton>
      </div>
      {lista !== null && recientes.error && (
        <p className="inicio-aviso-chico px-3" role="status">
          No se pudo actualizar la lista.
        </p>
      )}
      {cuerpo}
    </section>
  )
}

export default PacientesRecientes
