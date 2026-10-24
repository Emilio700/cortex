/**
 * Pendientes y seguimiento (plan 28, §4.1 punto 5).
 *
 * Un renglón por cosa que la doctora tiene que mirar, con su número y a dónde
 * lleva. Los renglones no desaparecen cuando están en cero: aquí sí se espera
 * verlos, y «0 · al día» es la confirmación que la doctora busca. Si un
 * renglón no se pudo consultar, lo dice y ofrece reintentar; nunca «0».
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilBellExclamation, cilTask, cilWarning, cilBabyCarriage } from '@coreui/icons'

import type { DatoVivo } from '../../hooks/useDatoVivo'
import type { Criticos, PartoProximo } from '../../hooks/useInicioDoctora'
import type { RevisionPendiente } from '../TableroRevisionPrenatal'
import { formatearFechaISOCon } from '../../../../shared/utils/date'
import { pedirFiltroBandeja } from '../../utils/filtroBandeja'
import { rutaDelExpediente } from '../../../expediente/rutas'

const fechaCorta = (iso: string) => formatearFechaISOCon(iso, { day: 'numeric', month: 'short' })

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
  prenatales: DatoVivo<RevisionPendiente[]>
  partos: DatoVivo<PartoProximo[]>
}

export const PendientesYSeguimiento: React.FC<Props> = ({ criticos, resultados, prenatales, partos }) => {
  const navigate = useNavigate()
  const abrirExpediente = (patientId: number) => navigate(rutaDelExpediente(patientId))
  const listaPrenatales = prenatales.datos ?? []
  const listaPartos = partos.datos ?? []

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
          icono={cilBellExclamation}
          tono="ambar"
          titulo="Controles prenatales sin cita"
          numero={prenatales.datos ? prenatales.datos.length : null}
          error={prenatales.error}
          cargando={prenatales.cargando}
          alDia="Al día: todas tienen su control agendado"
          onReintentar={() => void prenatales.recargar()}
          tour="doctora-revision-prenatal"
          detalle={
            listaPrenatales.length > 0 && (
              <ul className="inicio-sublista">
                {listaPrenatales.slice(0, 3).map((item) => (
                  <li key={item.pregnancy_id}>
                    <button type="button" className="inicio-subitem" onClick={() => abrirExpediente(item.patient_id)}>
                      <span className="inicio-subitem-nombre">{item.patient_full_name}</span>
                      <span className={item.vencida ? 'inicio-detalle-critico' : 'inicio-subitem-dato'}>
                        {item.vencida ? 'Vencido' : 'Toca'} {fechaCorta(item.next_review_on)}
                      </span>
                    </button>
                  </li>
                ))}
                {listaPrenatales.length > 3 && (
                  <li className="inicio-subitem-mas">y {listaPrenatales.length - 3} más</li>
                )}
              </ul>
            )
          }
        />
        <Renglon
          icono={cilBabyCarriage}
          tono="azul"
          titulo="Partos próximos"
          numero={partos.datos ? partos.datos.length : null}
          error={partos.error}
          cargando={partos.cargando}
          alDia="Ninguna fecha probable de parto cercana"
          onReintentar={() => void partos.recargar()}
          detalle={
            listaPartos.length > 0 && (
              <ul className="inicio-sublista">
                {listaPartos.slice(0, 3).map((item) => (
                  <li key={item.pregnancy_id}>
                    <button type="button" className="inicio-subitem" onClick={() => abrirExpediente(item.patient_id)}>
                      <span className="inicio-subitem-nombre">{item.patient_full_name || 'Paciente sin nombre'}</span>
                      <span className={item.vencida ? 'inicio-detalle-critico' : 'inicio-subitem-dato'}>
                        {item.vencida ? 'FPP vencida' : 'FPP'} {fechaCorta(item.estimated_delivery_date)}
                      </span>
                    </button>
                  </li>
                ))}
                {listaPartos.length > 3 && <li className="inicio-subitem-mas">y {listaPartos.length - 3} más</li>}
              </ul>
            )
          }
        />
      </ul>
    </section>
  )
}

export default PendientesYSeguimiento
