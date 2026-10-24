/**
 * Pendientes y seguimiento (plan 28, §4.1 punto 5).
 *
 * Un renglón por cosa que el médico tiene que mirar, con su número y a dónde
 * lleva. Los renglones no desaparecen cuando están en cero: aquí sí se espera
 * verlos, y «0 · al día» es la confirmación que el médico busca. Si un
 * renglón no se pudo consultar, lo dice y ofrece reintentar; nunca «0».
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilMedicalCross, cilTask, cilWarning } from '@coreui/icons'

import type { DatoVivo } from '../../hooks/useDatoVivo'
import { DIAS_DE_CIRUGIAS, type Criticos } from '../../hooks/useInicioDoctora'
import type { Appointment } from '../../../secretaria/types'
import { formatearEnConsultorio } from '../../../../shared/utils/date'
import { pedirFiltroBandeja } from '../../utils/filtroBandeja'
import { rutaDelExpediente } from '../../../expediente/rutas'

const fechaYHora = (iso: string) =>
  formatearEnConsultorio(new Date(iso), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

interface RenglonProps {
  icono: string[]
  tono: 'rojo' | 'ambar' | 'azul' | 'morado'
  titulo: string
  numero: number | null
  error: string | null
  cargando: boolean
  /** Texto cuando el número es cero. */
  alDia: string
  detalle?: React.ReactNode
  onAbrir?: () => void
  onReintentar: () => void
  tour?: string
}

const Renglon: React.FC<RenglonProps> = ({
  icono,
  tono,
  titulo,
  numero,
  error,
  cargando,
  alDia,
  detalle,
  onAbrir,
  onReintentar,
  tour,
}) => {
  const sinDato = numero === null
  const cabecera = (
    <>
      <span className={`inicio-pendiente-icono inicio-fondo-${tono}`} aria-hidden="true">
        <CIcon icon={icono} />
      </span>
      <span className="inicio-pendiente-texto">
        <span className="inicio-pendiente-titulo">{titulo}</span>
        <span className="inicio-pendiente-sub">
          {sinDato
            ? error
              ? 'No se pudo consultar.'
              : 'Consultando…'
            : numero === 0
              ? alDia
              : error
                ? 'No se pudo actualizar; puede haber cambiado.'
                : null}
        </span>
      </span>
      <span
        className={`inicio-pendiente-numero${numero ? ` inicio-numero-${tono}` : ''}`}
        aria-label={sinDato ? 'sin dato' : undefined}
      >
        {sinDato ? (cargando && !error ? <span className="hf-skeleton inicio-esqueleto-mini" /> : '—') : numero}
      </span>
    </>
  )
  return (
    <li className="inicio-pendiente" data-tour={tour}>
      {onAbrir && !sinDato ? (
        <button type="button" className="inicio-pendiente-fila" onClick={onAbrir}>
          {cabecera}
        </button>
      ) : (
        <div className="inicio-pendiente-fila">{cabecera}</div>
      )}
      {sinDato && error && (
        <button type="button" className="inicio-enlace inicio-pendiente-reintentar" onClick={onReintentar}>
          Reintentar
        </button>
      )}
      {detalle}
    </li>
  )
}

interface Props {
  criticos: DatoVivo<Criticos>
  resultados: DatoVivo<number>
  cirugias: DatoVivo<Appointment[]>
}

export const PendientesYSeguimiento: React.FC<Props> = ({ criticos, resultados, cirugias }) => {
  const navigate = useNavigate()
  const abrirExpediente = (patientId: number) => navigate(rutaDelExpediente(patientId))
  const listaCirugias = cirugias.datos ?? []

  return (
    <section className="inicio-tarjeta inicio-aparece" data-tour="doctora-pendientes" aria-labelledby="inicio-pendientes-titulo">
      <div className="inicio-tarjeta-cabecera">
        <h2 id="inicio-pendientes-titulo" className="inicio-tarjeta-titulo">
          Pendientes y seguimiento
        </h2>
      </div>
      <ul className="inicio-pendientes">
        <Renglon
          icono={cilWarning}
          tono="rojo"
          titulo="Resultados críticos sin cerrar"
          numero={criticos.datos ? criticos.datos.total : null}
          error={criticos.error}
          cargando={criticos.cargando}
          alDia="Ninguno abierto"
          onReintentar={() => void criticos.recargar()}
          onAbrir={() => {
            pedirFiltroBandeja('criticos')
            navigate('/doctor/results')
          }}
        />
        <Renglon
          icono={cilTask}
          tono="morado"
          titulo="Resultados sin revisar"
          numero={resultados.datos}
          error={resultados.error}
          cargando={resultados.cargando}
          alDia="No tienes resultados esperando revisión"
          onReintentar={() => void resultados.recargar()}
          onAbrir={() => {
            pedirFiltroBandeja('por_revisar')
            navigate('/doctor/results')
          }}
          tour="doctora-resultados-sin-revisar"
        />
        <Renglon
          icono={cilMedicalCross}
          tono="azul"
          titulo="Cirugías programadas"
          numero={cirugias.datos ? cirugias.datos.length : null}
          error={cirugias.error}
          cargando={cirugias.cargando}
          alDia={`Ninguna en los próximos ${DIAS_DE_CIRUGIAS} días`}
          onReintentar={() => void cirugias.recargar()}
          tour="medico-cirugias"
          detalle={
            listaCirugias.length > 0 && (
              <ul className="inicio-sublista">
                {listaCirugias.slice(0, 3).map((cita) => (
                  <li key={cita.id}>
                    <button type="button" className="inicio-subitem" onClick={() => abrirExpediente(cita.patient_id)}>
                      <span className="inicio-subitem-nombre">
                        {cita.patient ? `${cita.patient.first_name} ${cita.patient.last_name}` : 'Paciente'}
                        {cita.cirugia_type && <span className="inicio-subitem-dato"> · {cita.cirugia_type}</span>}
                      </span>
                      <span className="inicio-subitem-dato">{fechaYHora(cita.scheduled_at)}</span>
                    </button>
                  </li>
                ))}
                {listaCirugias.length > 3 && <li className="inicio-subitem-mas">y {listaCirugias.length - 3} más</li>}
              </ul>
            )
          }
        />
      </ul>
    </section>
  )
}

export default PendientesYSeguimiento
