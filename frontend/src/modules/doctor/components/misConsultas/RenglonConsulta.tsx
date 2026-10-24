/**
 * Un renglón de Mis Consultas (plan 32, punto 4): compacto y escaneable.
 *
 * Bloque de fecha, hora, avatar con color estable por paciente, nombre con
 * expediente y teléfono, estado con ícono y texto (no solo color), el motivo
 * en una línea con «ver más», y una sola acción principal según el estado.
 * En el teléfono el mismo renglón se vuelve tarjeta (CSS).
 */
import { useState } from 'react'
import {
  CButton,
  CDropdown,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
  cilBan,
  cilCalendar,
  cilCheckCircle,
  cilClock,
  cilDescription,
  cilFolderOpen,
  cilHospital,
  cilMediaPlay,
  cilOptions,
  cilPhone,
  cilRoom,
  cilZoom,
} from '@coreui/icons'

import { APPOINTMENT_STATUS_LABELS } from '../../../../shared/constants/statusLabels'
import { InsigniaExpress } from '../../../finanzas/components/InsigniaExpress'
import type { Appointment } from '../../../secretaria/types'
import { accionPrincipal, bloqueDeFecha, horaDeCita, iniciales, tonoDeAvatar } from '../../utils/misConsultas'

const ICONO_ESTADO: Record<string, string[]> = {
  agendada: cilCalendar,
  confirmada: cilCheckCircle,
  en_sala: cilClock,
  en_consulta: cilHospital,
  atendida: cilCheckCircle,
  cancelada: cilBan,
}

interface Props {
  cita: Appointment
  hoy: string
  /** El primero de la lista lleva las anclas del recorrido guiado. */
  primero?: boolean
  onAbrir: (cita: Appointment) => void
  onExpediente: (patientId: number) => void
  onVerEnAgenda: (dia: string) => void
}

export default function RenglonConsulta({ cita, hoy, primero, onAbrir, onExpediente, onVerEnAgenda }: Props) {
  const [motivoAbierto, setMotivoAbierto] = useState(false)
  const fecha = bloqueDeFecha(cita.scheduled_at)
  const accion = accionPrincipal(cita, hoy)
  const nombre = `${cita.patient?.first_name ?? ''} ${cita.patient?.last_name ?? ''}`.trim() || 'Paciente sin nombre'
  const motivo = (cita.notes ?? '').trim()
  const largo = motivo.length > 80 || motivo.includes('\n')
  const tour = (id: string) => (primero ? { 'data-tour': id } : {})

  return (
    <li className={`consulta-renglon consulta-renglon--${cita.status}`}>
      <div className="consulta-renglon__cuando">
        <div className="consulta-fecha" aria-hidden="true">
          <span className="consulta-fecha__dia">{fecha.dia}</span>
          <span className="consulta-fecha__numero">{fecha.numero}</span>
          <span className="consulta-fecha__mes">{fecha.mes}</span>
        </div>
        <div className="consulta-renglon__hora">
          <span className="visually-hidden">{`${fecha.dia} ${fecha.numero} ${fecha.mes}, `}</span>
          {horaDeCita(cita.scheduled_at)}
        </div>
      </div>

      <div className="consulta-renglon__paciente">
        <span className={`consulta-avatar consulta-avatar--${tonoDeAvatar(cita.patient_id)}`} aria-hidden="true">
          {iniciales(cita.patient?.first_name, cita.patient?.last_name)}
        </span>
        <div className="consulta-renglon__nombre">
          <h3 className="consulta-renglon__titulo">{nombre}</h3>
          <div className="consulta-renglon__datos">
            <span>Exp. {cita.patient_id}</span>
            {cita.patient?.phone && (
              <span>
                <CIcon icon={cilPhone} size="sm" aria-hidden="true" /> {cita.patient.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="consulta-renglon__estado">
        <span className={`consulta-estado consulta-estado--${cita.status}`}>
          <CIcon icon={ICONO_ESTADO[cita.status] ?? cilCalendar} size="sm" aria-hidden="true" />
          {APPOINTMENT_STATUS_LABELS[cita.status] ?? cita.status}
        </span>
        <InsigniaExpress cita={cita as { origen?: string | null }} />
      </div>

      <div className="consulta-renglon__motivo">
        <CIcon icon={cilDescription} className="consulta-renglon__motivo-icono" aria-hidden="true" />
        <div className="consulta-renglon__motivo-texto">
          <span className="consulta-renglon__motivo-titulo">Motivo de consulta</span>
          <span className={motivoAbierto ? 'is-completo' : 'is-recortado'}>{motivo || 'Sin notas adicionales'}</span>
          {largo && (
            <button
              type="button"
              className="consulta-renglon__ver-mas"
              aria-expanded={motivoAbierto}
              onClick={() => setMotivoAbierto((v) => !v)}
            >
              {motivoAbierto ? 'ver menos' : 'ver más'}
            </button>
          )}
        </div>
      </div>

      <div className="consulta-renglon__acciones">
        <CButton
          color="secondary"
          variant="ghost"
          className="consulta-renglon__icono"
          aria-label={`Abrir el expediente de ${nombre}`}
          title="Abrir expediente"
          onClick={() => onExpediente(cita.patient_id)}
        >
          <CIcon icon={cilFolderOpen} />
        </CButton>
        <CDropdown alignment="end" variant="btn-group">
          <CDropdownToggle
            color="secondary"
            variant="ghost"
            caret={false}
            className="consulta-renglon__icono"
            aria-label={`Más acciones de la consulta de ${nombre}`}
          >
            <CIcon icon={cilOptions} />
          </CDropdownToggle>
          <CDropdownMenu>
            <CDropdownItem as="button" type="button" onClick={() => onExpediente(cita.patient_id)}>
              Abrir expediente
            </CDropdownItem>
            <CDropdownItem as="button" type="button" onClick={() => onVerEnAgenda(cita.scheduled_at.slice(0, 10))}>
              Ver ese día en la agenda
            </CDropdownItem>
          </CDropdownMenu>
        </CDropdown>
        <CButton
          color="primary"
          variant={accion.solida ? undefined : 'outline'}
          className="consulta-renglon__principal"
          {...tour('consultas-iniciar')}
          onClick={() => onAbrir(cita)}
        >
          <CIcon
            icon={accion.icono === 'iniciar' ? cilMediaPlay : accion.icono === 'ver' ? cilZoom : cilRoom}
            className="me-2"
            aria-hidden="true"
          />
          {accion.etiqueta}
        </CButton>
      </div>
    </li>
  )
}
