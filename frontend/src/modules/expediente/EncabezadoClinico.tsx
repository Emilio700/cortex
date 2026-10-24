/**
 * El encabezado clínico fijo del expediente (plan 32, punto 6).
 *
 * Nombre, edad, expediente y teléfono; alergias; implantes (deciden si una
 * resonancia es segura) y anticoagulantes (riesgo de sangrado al operar);
 * alertas de críticos y atrasados. A la derecha, la acción que sí existe: «Abrir la consulta de hoy» si tiene cita hoy, o «Agendar»
 * (no hay consulta sin cita: nace de la Agenda, plan 28).
 */
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCalendar, cilClock, cilDrop, cilBolt, cilMediaPlay, cilPhone, cilWarning } from '@coreui/icons'

import { formatEdad, formatearHoraDeCita } from '../../shared/utils/date'
import { PuntoFichaIncompleta } from '../../shared/components/PuntoFichaIncompleta'
import type { EncabezadoExpediente } from './tipos'

interface Props {
  datos: EncabezadoExpediente
  /** Dentro de la consulta no se ofrece abrirla ni agendar: ya está ahí. */
  enConsulta?: boolean
  puedeAgendar: boolean
  onAbrirConsulta: (appointmentId: number) => void
  onAgendar: () => void
  onIrA: (pestana: 'estudios') => void
}

export default function EncabezadoClinico({ datos, enConsulta, puedeAgendar, onAbrirConsulta, onAgendar, onIrA }: Props) {
  const telefono = datos.cell_phone || datos.phone
  const alertas = datos.alertas
  const cita = datos.cita_de_hoy
  return (
    <section className="expediente-encabezado" aria-label="Datos del paciente" data-tour="expediente-encabezado">
      <div className="expediente-encabezado__quien">
        <h2 className="expediente-encabezado__nombre">
          {datos.nombre}
          <PuntoFichaIncompleta paciente={datos} />
        </h2>
        <div className="expediente-encabezado__datos">
          <span>{formatEdad(datos.date_of_birth)}</span>
          <span>Exp. {datos.patient_id}</span>
          {telefono && (
            <span>
              <CIcon icon={cilPhone} size="sm" aria-hidden="true" /> {telefono}
            </span>
          )}
          {datos.proxima_cita && (
            <span>
              <CIcon icon={cilCalendar} size="sm" aria-hidden="true" /> Próxima cita:{' '}
              {formatearHoraDeCita(datos.proxima_cita.scheduled_at, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
        </div>
      </div>

      <div className="expediente-encabezado__senales">
        <span className={`expediente-senal ${datos.allergies ? 'expediente-senal--alergia' : ''}`}>
          <CIcon icon={cilWarning} size="sm" aria-hidden="true" />
          {datos.allergies ? `Alergias: ${datos.allergies}` : 'Alergias: sin registro'}
        </span>
        {datos.implanted_devices && (
          <span className="expediente-senal expediente-senal--implante" title="Revisa la compatibilidad antes de pedir una resonancia">
            <CIcon icon={cilBolt} size="sm" aria-hidden="true" />
            Implantes: {datos.implanted_devices}
          </span>
        )}
        {datos.anticoagulants && (
          <span className="expediente-senal expediente-senal--anticoagulante" title="Riesgo de sangrado: valora suspenderlo antes de un procedimiento">
            <CIcon icon={cilDrop} size="sm" aria-hidden="true" />
            Anticoagulantes: {datos.anticoagulants}
          </span>
        )}
        {datos.embarazo && (
          <span className="expediente-senal expediente-senal--embarazo">
            {datos.embarazo.semanas != null
              ? `Embarazo: ${datos.embarazo.semanas} sem ${datos.embarazo.dias ?? 0} d`
              : 'Embarazo activo, sin datación'}
          </span>
        )}
        {alertas && alertas.criticos > 0 && (
          <button type="button" className="expediente-senal expediente-senal--critico" onClick={() => onIrA('estudios')}>
            <CIcon icon={cilWarning} size="sm" aria-hidden="true" />
            {alertas.criticos === 1 ? '1 crítico abierto' : `${alertas.criticos} críticos abiertos`}
          </button>
        )}
        {alertas && alertas.atrasados > 0 && (
          <button type="button" className="expediente-senal expediente-senal--atrasado" onClick={() => onIrA('estudios')}>
            <CIcon icon={cilClock} size="sm" aria-hidden="true" />
            {alertas.atrasados === 1 ? '1 estudio atrasado' : `${alertas.atrasados} estudios atrasados`}
          </button>
        )}
      </div>

      {!enConsulta && (
        <div className="expediente-encabezado__accion">
          {cita ? (
            <CButton color="primary" onClick={() => onAbrirConsulta(cita.id)} data-tour="expediente-consulta-hoy">
              <CIcon icon={cilMediaPlay} className="me-2" aria-hidden="true" />
              {cita.status === 'atendida' ? 'Ver la consulta de hoy' : 'Abrir la consulta de hoy'}
            </CButton>
          ) : puedeAgendar ? (
            <CButton color="primary" variant="outline" onClick={onAgendar} data-tour="expediente-agendar">
              <CIcon icon={cilCalendar} className="me-2" aria-hidden="true" />
              Agendar
            </CButton>
          ) : null}
        </div>
      )}
    </section>
  )
}
