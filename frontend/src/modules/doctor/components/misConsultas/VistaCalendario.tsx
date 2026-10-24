/**
 * Vista Calendario de Mis Consultas (plan 32, punto 4).
 *
 * Reusa el calendario de la Agenda (`MiniCalendario`) con las citas de la
 * doctora: un punto por día con consultas. Tocar un día vuelve a la lista con
 * ese día como periodo, que es donde se abre una consulta.
 */
import { useCallback, useEffect, useState } from 'react'
import { CButton, CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../../../shared/services/api'
import { mensajeDeError } from '../../../../shared/utils/errors'
import { hoyDelConsultorio } from '../../../../shared/utils/date'
import { MiniCalendario } from '../../../secretaria/components/MiniCalendario'
import { claveDia, mesDesplazado, primerDiaDelMes } from '../../../secretaria/utils/tablero'
import type { Appointment } from '../../../secretaria/types'
import { conteoPorDia } from '../../utils/inicio'

const ultimoDiaDelMes = (mes: Date) => new Date(mes.getFullYear(), mes.getMonth() + 1, 0)

export default function VistaCalendario({ onElegirDia }: { onElegirDia: (dia: string) => void }) {
  const [mes, setMes] = useState(() => primerDiaDelMes(hoyDelConsultorio()))
  const [conteo, setConteo] = useState<Map<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const { data } = await apiClient.get<Appointment[]>('/appointments/my-appointments', {
        params: { fecha_desde: claveDia(mes), fecha_hasta: claveDia(ultimoDiaDelMes(mes)), limit: 500 },
      })
      setConteo(conteoPorDia(data))
    } catch (err) {
      setConteo(null)
      setError(mensajeDeError(err, 'No se pudieron cargar las consultas del mes.'))
    }
  }, [mes])

  useEffect(() => { void cargar() }, [cargar])

  return (
    <div className="consultas-calendario" data-tour="consultas-calendario">
      {error ? (
        <div className="alert alert-danger d-flex justify-content-between align-items-center gap-2 flex-wrap" role="alert">
          <span>{error}</span>
          <CButton color="danger" variant="outline" size="sm" onClick={() => void cargar()}>Reintentar</CButton>
        </div>
      ) : conteo === null ? (
        <div className="text-center p-4"><CSpinner size="sm" /></div>
      ) : (
        <>
          <MiniCalendario
            mes={mes}
            diaSeleccionado={hoyDelConsultorio()}
            hoy={hoyDelConsultorio()}
            conteoPorDia={conteo}
            onSeleccionarDia={(dia) => onElegirDia(claveDia(dia))}
            onCambiarMes={(delta) => setMes((actual) => mesDesplazado(actual, delta))}
          />
          <p className="small text-body-secondary mt-2 mb-0">Toca un día para ver sus consultas en la lista.</p>
        </>
      )}
    </div>
  )
}
