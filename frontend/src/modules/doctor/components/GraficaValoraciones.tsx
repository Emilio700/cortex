/**
 * Progreso de las valoraciones de la paciente, por estudio (plan 26, D-9).
 *
 * Cada resultado puede llevar una valoración (Excelente…Crítico). Aquí se ve
 * cómo fue cambiando en el tiempo: una línea por estudio, con la valoración en
 * el eje vertical (Excelente arriba, Crítico abajo). Los datos salen de
 * `GET /patient/{id}/valoraciones`, que ya trae solo los resultados valorados.
 *
 * Accesibilidad: los colores son la paleta categórica validada (tema claro y
 * oscuro), cada estudio lleva además su propia forma de punto, hay leyenda, y
 * la tabla de abajo dice lo mismo sin depender del color. Con más de seis
 * estudios, la gráfica muestra los seis con más valoraciones y la tabla todos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CAlert, CButton, CSpinner } from '@coreui/react-pro'
import { CChart } from '@coreui/react-chartjs'
import { getStyle } from '@coreui/utils'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import { formatearFechaISO } from '../../../shared/utils/date'
import { VALORACIONES, datosValoracion, etiquetaValoracion } from '../utils/valoracion'

export interface PuntoValoracion {
  result_id: number
  order_id: number
  fecha: string
  study_name: string
  catalog_code?: string | null
  category?: string | null
  valoracion: string
}

export interface SerieValoracion {
  clave: string
  nombre: string
  puntos: PuntoValoracion[]
}

const MAX_SERIES = 6

// Paleta categórica validada (adyacentes: ΔE CVD ≥ 9, normal ≥ 19; ver skill
// dataviz). En tema claro tres tonos quedan bajo 3:1 contra el fondo: por eso
// la tabla y las formas de punto son obligatorias, no adorno.
const COLORES_CLARO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
const COLORES_OSCURO = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300']
const FORMAS = ['circle', 'rect', 'triangle', 'rectRot', 'star', 'crossRot'] as const

/**
 * Eje horizontal: un lugar por fecha y, si un mismo estudio tiene varios
 * resultados ese día, uno por cada uno («30/09/26», «30/09/26 (2)»). Regla
 * explícita: no se promedian ni se pisan; se ven todos, en el orden en que
 * llegaron (N10).
 */
export const ejeDeFechas = (series: SerieValoracion[]) => {
  const maximo = new Map<string, number>()
  for (const s of series) {
    const cuenta = new Map<string, number>()
    for (const p of s.puntos) cuenta.set(p.fecha, (cuenta.get(p.fecha) ?? 0) + 1)
    cuenta.forEach((n, f) => maximo.set(f, Math.max(maximo.get(f) ?? 0, n)))
  }
  const ranuras: { fecha: string; vez: number }[] = []
  ;[...maximo.keys()].sort().forEach((f) => {
    for (let i = 1; i <= maximo.get(f)!; i++) ranuras.push({ fecha: f, vez: i })
  })
  return ranuras
}

/** El valor de una serie en cada ranura del eje; `null` donde no tiene resultado. */
export const valoresEnEje = (serie: SerieValoracion, ranuras: { fecha: string; vez: number }[]) => {
  const vistas = new Map<string, number>()
  const porRanura = new Map<string, number>()
  for (const p of serie.puntos) {
    const vez = (vistas.get(p.fecha) ?? 0) + 1
    vistas.set(p.fecha, vez)
    porRanura.set(`${p.fecha}#${vez}`, datosValoracion(p.valoracion)!.nivel)
  }
  return ranuras.map((r) => porRanura.get(`${r.fecha}#${r.vez}`) ?? null)
}

/** Agrupa por estudio (código del catálogo o, si no hay, el nombre), en orden de fecha. */
export const seriesPorEstudio = (puntos: PuntoValoracion[]): SerieValoracion[] => {
  const mapa = new Map<string, SerieValoracion>()
  for (const p of [...puntos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!datosValoracion(p.valoracion)) continue
    const clave = (p.catalog_code || p.study_name).trim().toUpperCase()
    const serie = mapa.get(clave) ?? { clave, nombre: p.study_name, puntos: [] }
    serie.puntos.push(p)
    mapa.set(clave, serie)
  }
  // Las que tienen más historia primero: son las que dicen algo en una línea.
  return [...mapa.values()].sort(
    (a, b) => b.puntos.length - a.puntos.length || a.nombre.localeCompare(b.nombre),
  )
}

const temaOscuro = () =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-coreui-theme') === 'dark'

interface Props {
  patientId: number
}

const GraficaValoraciones = ({ patientId }: Props) => {
  const [puntos, setPuntos] = useState<PuntoValoracion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // En el celular la leyenda de seis estudios se comía la gráfica: ahí se elige
  // un estudio y se ve solo (N10). En pantalla ancha, todos con su leyenda.
  const [angosta] = useState(
    () =>
      typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 575.98px)').matches,
  )
  const [elegido, setElegido] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const { data } = await apiClient.get<{ items: PuntoValoracion[] }>(
        `/clinical-tracking/patient/${patientId}/valoraciones`,
      )
      setPuntos(Array.isArray(data?.items) ? data.items : [])
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar el progreso de las valoraciones.'))
    }
  }, [patientId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const series = useMemo(() => seriesPorEstudio(puntos ?? []), [puntos])

  if (error) {
    return (
      <CAlert
        color="danger"
        className="d-flex justify-content-between align-items-center gap-2 flex-wrap"
      >
        <span>{error}</span>
        <CButton size="sm" color="danger" variant="outline" onClick={() => void cargar()}>
          Reintentar
        </CButton>
      </CAlert>
    )
  }
  if (puntos === null) {
    return (
      <div className="text-center py-3">
        <CSpinner size="sm" />
      </div>
    )
  }
  if (series.length === 0) {
    return (
      <p className="small text-body-secondary" data-tour="expediente-valoraciones">
        Todavía no hay resultados valorados. Cuando valores un resultado (Excelente, Bien, Regular,
        Malo o Crítico), aquí verás cómo cambia en el tiempo.
      </p>
    )
  }

  const clave = elegido ?? (angosta ? series[0].clave : '')
  const enGrafica = clave ? series.filter((s) => s.clave === clave) : series.slice(0, MAX_SERIES)
  const ranuras = ejeDeFechas(enGrafica)
  const colores = temaOscuro() ? COLORES_OSCURO : COLORES_CLARO
  const texto = getStyle('--cui-body-color') || '#212631'
  const secundario = getStyle('--cui-secondary-color') || '#6b7785'
  const rejilla = getStyle('--cui-border-color-translucent') || 'rgba(0,0,0,0.1)'
  const superficie = getStyle('--cui-body-bg') || '#ffffff'

  const datasets = enGrafica.map((serie) => {
    // El color y la forma siguen al estudio, no a su lugar en la lista filtrada.
    const i = Math.max(0, series.indexOf(serie)) % MAX_SERIES
    return {
      label: serie.nombre,
      data: valoresEnEje(serie, ranuras),
      borderColor: colores[i],
      backgroundColor: colores[i],
      pointStyle: FORMAS[i],
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBorderColor: superficie,
      pointBorderWidth: 2,
      borderWidth: 2,
      spanGaps: true,
      tension: 0,
    }
  })

  const resumen = enGrafica
    .map((s) => `${s.nombre}: ${s.puntos.map((p) => etiquetaValoracion(p.valoracion)).join(', ')}`)
    .join('; ')

  return (
    <div data-tour="expediente-valoraciones">
      {(angosta || series.length > 1) && (
        <div className="d-flex align-items-center gap-2 mb-2">
          <label htmlFor="valoraciones-estudio" className="small mb-0">
            Estudio
          </label>
          <select
            id="valoraciones-estudio"
            className="form-select form-select-sm"
            style={{ maxWidth: 260 }}
            value={clave}
            onChange={(e) => setElegido(e.target.value)}
          >
            {!angosta && <option value="">Todos ({Math.min(series.length, MAX_SERIES)})</option>}
            {series.map((s) => (
              <option key={s.clave} value={s.clave}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={{ height: 260 }}>
        <CChart
          type="line"
          aria-label={`Progreso de las valoraciones por estudio. ${resumen}`}
          data={{
            labels: ranuras.map(
              (r) => `${formatearFechaISO(r.fecha, '', 'short')}${r.vez > 1 ? ` (${r.vez})` : ''}`,
            ),
            datasets,
          }}
          options={{
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
              legend: {
                // Con un solo estudio el selector ya dice cuál es.
                display: enGrafica.length > 1,
                position: 'bottom',
                labels: {
                  color: texto,
                  usePointStyle: true,
                  boxWidth: 8,
                  padding: 10,
                  font: { size: 11 },
                },
              },
              tooltip: {
                callbacks: {
                  label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
                    `${ctx.dataset.label}: ${
                      VALORACIONES.find((v) => v.nivel === ctx.parsed.y)?.etiqueta ?? ''
                    }`,
                },
              },
            },
            scales: {
              x: { ticks: { color: secundario }, grid: { display: false } },
              y: {
                min: 0.5,
                max: 5.5,
                ticks: {
                  color: secundario,
                  stepSize: 1,
                  callback: (valor: number | string) =>
                    VALORACIONES.find((v) => v.nivel === Number(valor))?.etiqueta ?? '',
                },
                grid: { color: rejilla },
              },
            },
          }}
        />
      </div>
      {!clave && series.length > MAX_SERIES && (
        <div className="small text-body-secondary mt-1">
          La gráfica muestra los {MAX_SERIES} estudios con más valoraciones; la tabla, todos.
        </div>
      )}
      <details className="mt-2">
        <summary className="small">Ver como tabla</summary>
        <div className="table-responsive">
          <table className="table table-sm small mt-2 mb-0">
            <thead>
              <tr>
                <th scope="col">Estudio</th>
                <th scope="col">Fecha</th>
                <th scope="col">Valoración</th>
              </tr>
            </thead>
            <tbody>
              {series.flatMap((s) =>
                s.puntos.map((p) => (
                  <tr key={p.result_id}>
                    <td>{s.nombre}</td>
                    <td>{formatearFechaISO(p.fecha)}</td>
                    <td>{etiquetaValoracion(p.valoracion)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

export default GraficaValoraciones
