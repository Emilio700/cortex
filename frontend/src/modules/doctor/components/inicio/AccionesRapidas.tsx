/**
 * Acciones rápidas según permisos (plan 28, §4.4 y D-10).
 *
 * Solo las que la sesión puede usar (`can()`), en este orden y máximo seis:
 * un botón que termina en 403 es peor que no tenerlo. Del boceto se cambió lo
 * que prometía algo que no existe: «Registrar consulta» (no hay consulta sin
 * cita) es «Siguiente paciente»; «Orden de estudio» (se emite dentro de la
 * consulta) es «Órdenes y resultados»; «Cobro / Factura» es «Registrar cobro»
 * (no hay facturación). «Nuevo paciente» solo aparece si la administración le
 * concedió el permiso a esa doctora.
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import {
  cilArrowRight,
  cilCalendarCheck,
  cilCloudUpload,
  cilMoney,
  cilSearch,
  cilTask,
  cilUserPlus,
} from '@coreui/icons'

import { useAuth } from '../../../../shared/context/AuthContext'
import type { Appointment } from '../../../secretaria/types'
import { hoyLocalISO } from '../../../../shared/utils/date'
import { pedir, tomar } from '../../../../shared/utils/pedidos'
import { siguientePaciente } from '../../utils/inicio'

const MAXIMO = 6

interface Accion {
  id: string
  texto: string
  detalle?: string
  icono: string[]
  principal?: boolean
  deshabilitada?: boolean
  onClick: () => void
}

interface Props {
  /** Las citas de hoy; `null` si no se sabe (cargando o error). */
  citasHoy: Appointment[] | null
  errorCitas: string | null
}

export const AccionesRapidas: React.FC<Props> = ({ citasHoy, errorCitas }) => {
  const navigate = useNavigate()
  const { can } = useAuth()

  const acciones: Accion[] = []

  if (can('doctor.appointments.read')) {
    const siguiente = citasHoy ? siguientePaciente(citasHoy) : null
    const nombre = siguiente?.cita.patient
      ? `${siguiente.cita.patient.first_name} ${siguiente.cita.patient.last_name}`
      : ''
    acciones.push({
      id: 'siguiente',
      texto: siguiente?.motivo === 'en_consulta' ? 'Continuar consulta' : 'Siguiente paciente',
      // Lo que va a pasar, dicho antes de tocar: a quién abre o por qué no.
      detalle:
        citasHoy === null
          ? errorCitas
            ? 'No se pudo saber quién sigue'
            : 'Buscando…'
          : siguiente
            ? `${nombre}${siguiente.motivo === 'en_sala' ? ' · en sala' : ''}`
            : 'No hay pacientes por atender',
      icono: cilArrowRight,
      principal: true,
      deshabilitada: !siguiente,
      onClick: () => {
        if (siguiente) navigate(`/doctor/consultation/${siguiente.cita.id}`)
      },
    })
  }

  if (can('appointments.create') && can('appointments.read')) {
    acciones.push({
      id: 'agendar',
      texto: 'Agendar cita',
      icono: cilCalendarCheck,
      onClick: () => {
        pedir('agenda:dia', { fecha: hoyLocalISO(), nueva: true })
        navigate('/secretaria/agenda')
      },
    })
  }

  if (can('patients.read')) {
    acciones.push({
      id: 'buscar',
      texto: 'Buscar paciente',
      icono: cilSearch,
      onClick: () => {
        // Si el buscador del encabezado no está montado, nadie atiende el
        // pedido: se retira y se va a Pacientes, donde también se busca.
        if (!pedir('buscador:enfocar', true)) {
          tomar('buscador:enfocar')
          navigate('/secretaria/pacientes')
        }
      },
    })
  }

  if (can('clinical_tracking.read')) {
    acciones.push({
      id: 'ordenes',
      texto: 'Órdenes y resultados',
      icono: cilTask,
      onClick: () => navigate('/doctor/results'),
    })
  }

  if (can('payments.create') && can('payments.read')) {
    acciones.push({
      id: 'cobro',
      texto: 'Registrar cobro',
      icono: cilMoney,
      onClick: () => {
        pedir('pagos:registrar', true)
        navigate('/finanzas/pagos')
      },
    })
  }

  if (can('patients.create') && can('patients.read')) {
    acciones.push({
      id: 'nuevo-paciente',
      texto: 'Nuevo paciente',
      icono: cilUserPlus,
      onClick: () => {
        pedir('pacientes:nuevo', true)
        navigate('/secretaria/pacientes')
      },
    })
  }

  if (can('documents.upload') && can('documents.read')) {
    acciones.push({
      id: 'documento',
      texto: 'Subir documento',
      icono: cilCloudUpload,
      onClick: () => navigate('/secretaria/documentos'),
    })
  }

  if (acciones.length === 0) return null

  return (
    <section className="inicio-tarjeta inicio-aparece" data-tour="doctora-acciones" aria-labelledby="inicio-acciones-titulo">
      <div className="inicio-tarjeta-cabecera">
        <h2 id="inicio-acciones-titulo" className="inicio-tarjeta-titulo">
          Acciones rápidas
        </h2>
      </div>
      <div className="inicio-acciones">
        {acciones.slice(0, MAXIMO).map((accion) => (
          <button
            key={accion.id}
            type="button"
            className={`inicio-accion${accion.principal ? ' es-principal' : ''}`}
            onClick={accion.onClick}
            disabled={accion.deshabilitada}
            data-accion={accion.id}
          >
            <CIcon icon={accion.icono} className="inicio-accion-icono" aria-hidden="true" />
            <span className="inicio-accion-texto">
              {accion.texto}
              {accion.detalle && <span className="inicio-accion-detalle">{accion.detalle}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default AccionesRapidas
