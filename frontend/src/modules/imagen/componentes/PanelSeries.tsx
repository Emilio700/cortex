import { nombreDeSerie, type SerieDicom } from '../dominio/tipos'

interface Props {
  series: SerieDicom[]
  activaId?: number
  onElegir: (serie: SerieDicom) => void
}

/**
 * Lista de series del estudio.
 *
 * El nombre combina la etiqueta deducida con la descripción del equipo cuando no
 * coinciden: así se ve que «T1+C» fue una deducción y «t1_ax_post» es lo que
 * escribió el técnico. Una serie sin geometría lo dice, porque entonces el
 * visor no puede reconstruir planos.
 */
export default function PanelSeries({ series, activaId, onElegir }: Props) {
  return (
    <aside className="visor-panel" data-tour="visor-series">
      <div className="visor-panel__titulo">Series ({series.length})</div>
      {series.length === 0 ? (
        <p className="mb-0 visor-encabezado__meta">El estudio no tiene series legibles.</p>
      ) : (
        <ul className="visor-series">
          {series.map((serie) => (
            <li key={serie.id}>
              <button
                type="button"
                className="visor-series__boton"
                aria-pressed={serie.id === activaId}
                onClick={() => onElegir(serie)}
              >
                <span className="visor-series__nombre">{nombreDeSerie(serie)}</span>
                <span className="visor-series__detalle">
                  {serie.instance_count} cortes
                  {serie.has_geometry ? '' : ' · sin posición'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
