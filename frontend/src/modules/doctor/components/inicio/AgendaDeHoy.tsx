/**
 * Agenda de hoy en línea de tiempo, con pestañas (plan 28, §4.1 punto 4).
 *
 * Cada renglón: hora y duración, iniciales, nombre, motivo (o el tipo de
 * cita), edad, semanas de gestación si hay embarazo activo (D-4), sala,
 * signos vitales y el estado **en texto**: nunca solo por color. Las
 * canceladas solo salen en «Todas», atenuadas y tachadas. Tocar una cita abre
 * su consulta.
 *
 * Las pestañas son un `tablist` de verdad: flechas, Inicio y Fin del teclado.
 */
import React, { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilArrowRight, cilCalendar } from '@coreui/icons'

import type { Appointment } from '../../../secretaria/types'
import { TIPO_LABELS } from '../../../secretaria/utils/tablero'
import { formatEdad, formatearHoraDeCita } from '../../../../shared/utils/date'
import {
  etiquetaSemanas,
  filtrarPorPestana,
  iniciales,
  numeroDePestana,
  PESTANAS_AGENDA,
  type ConteoDelDia,
  type PestanaAgenda,
} from '../../utils/inicio'

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  // El estado real en la insignia; «Por atender» es solo el nombre de la pestaña.
  agendada: { texto: 'Agendada', clase: 'por-atender' },
  confirmada: { texto: 'Confirmada', clase: 'por-atender' },
  en_sala: { texto: 'En sala', clase: 'en-sala' },
  en_consulta: { texto: 'En consulta', clase: 'en-consulta' },
  atendida: { texto: 'Atendida', clase: 'atendida' },
  cancelada: { texto: 'Cancelada', clase: 'cancelada' },
}

const VACIOS: Record<PestanaAgenda, string> = {
  todas: 'No tienes citas hoy',
  por_atender: 'No queda nadie por atender',
  en_sala: 'Nadie espera en sala',
  en_consulta: 'Nadie en consulta ahora',
  atendidas: 'Todavía no atiendes a nadie hoy',
}

/** Motivo o tipo de la cita: lo que se va a hacer. */
const motivoDeLaCita = (cita: Appointment): string =>
  (cita.motivo_extra ?? '').trim() || TIPO_LABELS[cita.appointment_type ?? 'consulta'] || 'Consulta'

/** Edad y semanas de gestación: solo lo que se sabe; vacío si no hay nada. */
const datosDeLaPaciente = (cita: Appointment): string =>
  [formatEdad(cita.patient?.date_of_birth, ''), etiquetaSemanas(cita) ?? ''].filter(Boolean).join(' · ')

interface Props {
  citas: Appointment[] | null
  conteo: ConteoDelDia | null
  cargando: boolean
  error: string | null
  onReintentar: () => void
  pestana: PestanaAgenda
  onPestana: (pestana: PestanaAgenda) => void
  /** Nombre de la sucursal activa, para el vacío cuando el médico tiene más de una. */
  sucursalDelVacio: string | null
  /** Destino de «Ver agenda completa». */
  onVerAgenda: () => void
  /** Si no hay a dónde ir, el pie no se dibuja. */
  puedeVerAgenda: boolean
}

export const AgendaDeHoy: React.FC<Props> = ({
  citas,
  conteo,
  cargando,
  error,
  onReintentar,
  pestana,
  onPestana,
  sucursalDelVacio,
  onVerAgenda,
  puedeVerAgenda,
}) => {
  const navigate = useNavigate()
  const pestanas = useRef<Record<string, HTMLButtonElement | null>>({})

  const alTeclear = (evento: React.KeyboardEvent, indice: number) => {
    const ultimo = PESTANAS_AGENDA.length - 1
    const destino =
      evento.key === 'ArrowRight'
        ? (indice + 1) % PESTANAS_AGENDA.length
        : evento.key === 'ArrowLeft'
          ? (indice - 1 + PESTANAS_AGENDA.length) % PESTANAS_AGENDA.length
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? ultimo
              : null
    if (destino === null) return
    evento.preventDefault()
    const id = PESTANAS_AGENDA[destino].id
    onPestana(id)
    pestanas.current[id]?.focus()
  }

  const visibles = citas ? filtrarPorPestana(citas, pestana) : []

  let cuerpo: React.ReactNode
  if (citas === null && error) {
    cuerpo = (
      <div className="inicio-estado-error" role="alert">
        <p>{error}</p>
        <CButton color="primary" variant="outline" size="sm" onClick={onReintentar} disabled={cargando}>
          Reintentar
        </CButton>
      </div>
    )
  } else if (citas === null) {
    cuerpo = (
      <div aria-busy="true" aria-label="Cargando tus citas de hoy">
        {[0, 1, 2].map((i) => (
          <div className="inicio-cita inicio-cita--esqueleto" key={i}>
            <span className="hf-skeleton" style={{ width: 44, height: 16 }} />
            <span className="hf-skeleton" style={{ width: 40, height: 40, borderRadius: 999 }} />
            <span style={{ flex: 1 }}>
              <span className="hf-skeleton d-block" style={{ width: '60%', height: 14, marginBottom: 6 }} />
              <span className="hf-skeleton d-block" style={{ width: '35%', height: 11 }} />
            </span>
          </div>
        ))}
      </div>
    )
  } else if (visibles.length === 0) {
    cuerpo = (
      <div className="inicio-vacio">
        <CIcon icon={cilCalendar} className="inicio-vacio-icono" aria-hidden="true" />
        <p className="mb-1">
          {VACIOS[pestana]}
          {pestana === 'todas' && sucursalDelVacio ? ` en ${sucursalDelVacio}` : ''}.
        </p>
        {pestana === 'todas' && sucursalDelVacio && (
          <p className="inicio-vacio-nota">Si atiendes en otra sucursal, cámbiala arriba para ver sus citas.</p>
        )}
      </div>
    )
  } else {
    cuerpo = (
      <ol className="inicio-linea">
        {visibles.map((cita) => {
          const estado = ESTADOS[cita.status as string] ?? { texto: String(cita.status), clase: 'por-atender' }
          const cancelada = cita.status === 'cancelada'
          const nombre = cita.patient
            ? `${cita.patient.first_name} ${cita.patient.last_name}`
            : 'Paciente sin nombre'
          // 24 h: «08:00» cabe en una línea del celular; «08:00 a.m.» se partía en tres.
          const hora = formatearHoraDeCita(cita.scheduled_at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
          const motivo = motivoDeLaCita(cita)
          const datos = datosDeLaPaciente(cita)
          const contenido = (
            <>
              <span className="inicio-cita-hora">
                {hora}
                <span className="inicio-cita-duracion">{cita.duration_minutes} min</span>
              </span>
              <span className={`inicio-cita-punto inicio-estado-${estado.clase}`} aria-hidden="true" />
              <span className="inicio-cita-avatar" aria-hidden="true">
                {iniciales(cita.patient?.first_name, cita.patient?.last_name)}
              </span>
              <span className="inicio-cita-texto">
                <span className="inicio-cita-nombre">{nombre}</span>
                <span className="inicio-cita-sub">
                  {motivo}
                  {cita.room_name ? ` · ${cita.room_name}` : ''}
                </span>
                {datos && <span className="inicio-cita-datos">{datos}</span>}
              </span>
              <span className="inicio-cita-insignias">
                {cita.status === 'en_sala' && !cita.has_triage && (
                  <span className="inicio-insignia inicio-insignia-aviso">Sin signos</span>
                )}
                <span className={`inicio-insignia inicio-estado-${estado.clase}`}>{estado.texto}</span>
              </span>
            </>
          )
          return (
            <li key={cita.id} className={`inicio-cita-item${cancelada ? ' es-cancelada' : ''}`}>
              {cancelada ? (
                // Una cancelada no se atiende: se lee, no se abre.
                <div className="inicio-cita">{contenido}</div>
              ) : (
                <button
                  type="button"
                  className="inicio-cita"
                  data-tour="doctora-cita"
                  onClick={() => navigate(`/doctor/consultation/${cita.id}`)}
                >
                  {/* El nombre del botón es lo que se ve, más lo que sólo
                      dice el color o la acción. Un aria-label propio tapaba el
                      texto visible (la duración no salía) y el control por voz
                      no lo encontraba (axe, label-content-name-mismatch). */}
                  {contenido}
                  <span className="visually-hidden">
                    {cita.status === 'en_sala' && !cita.has_triage ? ', sin signos vitales' : ''}. Abrir la consulta
                  </span>
                </button>
              )}
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <section className="inicio-tarjeta inicio-agenda inicio-aparece" data-tour="doctora-citas-hoy" aria-labelledby="inicio-agenda-titulo">
      <div className="inicio-tarjeta-cabecera">
        <h2 id="inicio-agenda-titulo" className="inicio-tarjeta-titulo">
          Agenda de hoy
        </h2>
        {citas && error && (
          <span className="inicio-aviso-chico" role="status">
            No se pudo actualizar ·{' '}
            <button type="button" className="inicio-enlace" onClick={onReintentar}>
              Reintentar
            </button>
          </span>
        )}
      </div>

      <div className="inicio-pestanas" role="tablist" aria-label="Filtrar las citas de hoy">
        {PESTANAS_AGENDA.map(({ id, nombre }, indice) => {
          const numero = conteo ? numeroDePestana(conteo, id) : null
          const activa = pestana === id
          return (
            <button
              key={id}
              ref={(el) => {
                pestanas.current[id] = el
              }}
              type="button"
              role="tab"
              id={`inicio-pestana-${id}`}
              aria-selected={activa}
              aria-controls="inicio-panel-agenda"
              tabIndex={activa ? 0 : -1}
              className={`inicio-pestana${activa ? ' es-activa' : ''}`}
              onClick={() => onPestana(id)}
              onKeyDown={(e) => alTeclear(e, indice)}
            >
              {nombre}
              <span className="inicio-pestana-numero">{numero ?? '—'}</span>
            </button>
          )
        })}
      </div>

      <div
        id="inicio-panel-agenda"
        role="tabpanel"
        aria-labelledby={`inicio-pestana-${pestana}`}
        className="inicio-panel"
      >
        {cuerpo}
      </div>

      {puedeVerAgenda && (
        <div className="inicio-tarjeta-pie">
          <CButton color="link" className="inicio-pie-enlace" onClick={onVerAgenda}>
            Ver agenda completa <CIcon icon={cilArrowRight} size="sm" aria-hidden="true" />
          </CButton>
        </div>
      )}
    </section>
  )
}

export default AgendaDeHoy
