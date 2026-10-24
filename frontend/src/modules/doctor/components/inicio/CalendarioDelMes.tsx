/**
 * Calendario del mes con un punto en cada día con citas (plan 28, §4.1 y D-5).
 *
 * Tocar un día abre la Agenda en ese día. Reusa el `MiniCalendario` de la
 * agenda de recepción (no se mueve: es de esa pantalla). Los días se cuentan
 * con la fecha local de la cita, sin pasar por UTC.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton } from '@coreui/react-pro'

import { apiClient } from '../../../../shared/services/api'
import { MiniCalendario } from '../../../secretaria/components/MiniCalendario'
import { claveDia, mesDesplazado, primerDiaDelMes } from '../../../secretaria/utils/tablero'
import { hoyDelConsultorio } from '../../../../shared/utils/date'
import { pedir } from '../../../../shared/utils/pedidos'
import type { Appointment } from '../../../secretaria/types'
import { conteoPorDia } from '../../utils/inicio'
import { useDatoVivo } from '../../hooks/useDatoVivo'
import { useCicloDeRefresco } from '../../hooks/useCicloDeRefresco'

const ultimoDiaDelMes = (mes: Date) => new Date(mes.getFullYear(), mes.getMonth() + 1, 0)

export const CalendarioDelMes: React.FC = () => {
  const navigate = useNavigate()
  const [mes, setMes] = useState(() => primerDiaDelMes(hoyDelConsultorio()))

  const pedirMes = useCallback(async () => {
    const { data } = await apiClient.get<Appointment[]>('/appointments/my-appointments', {
      params: {
        fecha_desde: claveDia(mes),
        fecha_hasta: claveDia(ultimoDiaDelMes(mes)),
        limit: 500,
      },
    })
    if (!Array.isArray(data)) throw new Error('La agenda del mes no llegó completa.')
    return conteoPorDia(data)
  }, [mes])

  const delMes = useDatoVivo(pedirMes, { mensaje: 'No se pudieron cargar las citas del mes.' })
  const { recargar } = delMes

  // Cambiar de mes vuelve a preguntar (el primer render ya lo hace useDatoVivo).
  const [primeraVez, setPrimeraVez] = useState(true)
  useEffect(() => {
    if (primeraVez) {
      setPrimeraVez(false)
      return
    }
    void recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  useCicloDeRefresco(() => void recargar())

  const abrirDia = (dia: Date) => {
    pedir('agenda:dia', { fecha: claveDia(dia) })
    navigate('/secretaria/agenda')
  }

  return (
    <section className="inicio-tarjeta inicio-aparece" data-tour="doctora-calendario" aria-label="Calendario del mes">
      <div className="inicio-calendario">
        <MiniCalendario
          mes={mes}
          diaSeleccionado={hoyDelConsultorio()}
          hoy={hoyDelConsultorio()}
          conteoPorDia={delMes.datos ?? new Map()}
          onSeleccionarDia={abrirDia}
          onCambiarMes={(delta) => setMes((actual) => mesDesplazado(actual, delta))}
        />
      </div>
      {delMes.error && (
        <div className="inicio-aviso-chico inicio-calendario-aviso" role="status">
          {delMes.datos ? 'No se pudieron actualizar los puntos del mes.' : 'No se pudieron cargar los días con citas.'}{' '}
          <CButton color="link" size="sm" className="p-0 align-baseline" onClick={() => void recargar()}>
            Reintentar
          </CButton>
        </div>
      )}
      <p className="inicio-calendario-ayuda">Toca un día para abrir la agenda en esa fecha.</p>
    </section>
  )
}

export default CalendarioDelMes
