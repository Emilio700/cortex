/**
 * Pestaña «Escalas» del expediente: cómo ha cambiado cada escala en el tiempo.
 *
 * Una escala a la vez (sus ejes no se comparan entre sí: un ODI en % y un
 * Glasgow de 3 a 15). La gráfica lleva su tabla debajo, que dice lo mismo sin
 * depender del color, y el cambio se escribe en texto. Las anuladas no entran
 * en la gráfica; en la tabla salen tachadas con su motivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CAlert, CButton, CSpinner } from '@coreui/react-pro'
import { CChart } from '@coreui/react-chartjs'
import { getStyle } from '@coreui/utils'
import { formatearInstante } from '../../../shared/utils/date'
import { mensajeDeError } from '../../../shared/utils/errors'
import { escalaPorId } from '../dominio/catalogo'
import { escalasConRegistro, evolucionDe } from '../dominio/evolucion'
import { formatearPuntaje } from '../dominio/motor'
import { escalasApi, type EscalaAplicada } from '../servicios/escalasApi'
import HistorialEscala from './HistorialEscala'
import '../ui/escalas.css'

interface Props {
  patientId: number
}

const fechaCorta = (iso: string) => formatearInstante(iso, { dateStyle: 'short' }, '—')

export default function EvolucionEscalas({ patientId }: Props) {
  const [registros, setRegistros] = useState<EscalaAplicada[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setRegistros(await escalasApi.listar(patientId))
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las escalas del paciente.'))
    }
  }, [patientId])
  useEffect(() => {
    void cargar()
  }, [cargar])

  const disponibles = useMemo(
    () => escalasConRegistro(registros ?? []).filter((id) => escalaPorId(id)),
    [registros],
  )

  if (error) {
    return (
      <CAlert color="danger" className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <span>{error}</span>
        <CButton size="sm" color="danger" variant="outline" onClick={() => void cargar()}>
          Reintentar
        </CButton>
      </CAlert>
    )
  }
  if (registros === null) {
    return (
      <div className="text-center py-3">
        <CSpinner size="sm" />
      </div>
    )
  }
  if (disponibles.length === 0) {
    return (
      <p className="small text-body-secondary" data-tour="expediente-escalas">
        Todavía no hay escalas aplicadas a este paciente. Se aplican en la consulta, en la sección
        «Escalas neurológicas»; aquí verás cómo cambian en el tiempo (por ejemplo, el ODI antes y
        después de la cirugía).
      </p>
    )
  }

  const id = elegida && disponibles.includes(elegida) ? elegida : disponibles[0]
  const escala = escalaPorId(id)!
  const { puntos, sinTotal, cambio } = evolucionDe(escala, registros)
  const delaEscala = registros.filter((r) => r.escala === id)

  const azul = getStyle('--cx-azul') || '#1e63e9'
  const secundario = getStyle('--cui-secondary-color') || '#4a5b78'
  const rejilla = getStyle('--cui-border-color-translucent') || 'rgba(0,0,0,0.1)'
  const superficie = getStyle('--cui-body-bg') || '#ffffff'
  const resumen = puntos.map((p) => `${fechaCorta(p.fecha)}: ${formatearPuntaje(escala, p.puntaje)}`).join('; ')

  return (
    <div className="d-flex flex-column gap-3" data-tour="expediente-escalas">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <label htmlFor="evolucion-escala" className="small mb-0 fw-semibold">
          Escala
        </label>
        <select
          id="evolucion-escala"
          className="form-select form-select-sm gems-campo"
          style={{ maxWidth: 320 }}
          value={id}
          onChange={(e) => setElegida(e.target.value)}
        >
          {disponibles.map((d) => (
            <option key={d} value={d}>
              {escalaPorId(d)!.nombre}
            </option>
          ))}
        </select>
      </div>

      {cambio && (
        <div className={`escala-resultado escala-resultado--${cambio.tono} py-2`} role="note">
          {cambio.texto}
        </div>
      )}

      {puntos.length > 0 ? (
        <div style={{ height: 260 }}>
          <CChart
            type="line"
            aria-label={`Evolución de ${escala.nombre}. ${resumen}`}
            data={{
              labels: puntos.map((p) => fechaCorta(p.fecha)),
              datasets: [
                {
                  label: escala.nombre,
                  data: puntos.map((p) => p.puntaje),
                  borderColor: azul,
                  backgroundColor: azul,
                  pointRadius: 5,
                  pointHoverRadius: 7,
                  pointBorderColor: superficie,
                  pointBorderWidth: 2,
                  borderWidth: 2,
                  tension: 0,
                },
              ],
            }}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx: { parsed: { y: number | null } }) =>
                      `${escala.nombre}: ${formatearPuntaje(escala, ctx.parsed.y)}`,
                  },
                },
              },
              scales: {
                x: { ticks: { color: secundario }, grid: { display: false } },
                y: {
                  min: escala.min,
                  max: escala.max,
                  // Glasgow y Barthel: más alto es mejor; ODI y NIHSS: al revés.
                  // El eje no se invierte; la dirección la dice el texto del cambio.
                  ticks: { color: secundario },
                  grid: { color: rejilla },
                  title: {
                    display: true,
                    text: escala.presentacion === 'porcentaje' ? '%' : 'Puntaje',
                    color: secundario,
                  },
                },
              },
            }}
          />
        </div>
      ) : (
        <p className="small text-body-secondary mb-0">Ninguna aplicación vigente tiene total para graficar.</p>
      )}
      {sinTotal > 0 && (
        <div className="small text-body-secondary">
          {sinTotal === 1
            ? '1 aplicación sin total (componente no valorable) no está en la gráfica; sí en la tabla.'
            : `${sinTotal} aplicaciones sin total (componente no valorable) no están en la gráfica; sí en la tabla.`}
        </div>
      )}

      <HistorialEscala escala={escala} registros={delaEscala} />
      <div className="escala-fuente">Fuente: {escala.fuente}</div>
    </div>
  )
}
