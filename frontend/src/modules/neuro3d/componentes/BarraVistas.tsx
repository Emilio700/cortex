/** Vistas predefinidas sobre la escena, cada una con su tecla. */
import { VISTAS, type VistaId } from '../dominio/vistas'

interface Props {
  activa: VistaId | null
  alElegir: (id: VistaId) => void
}

export default function BarraVistas({ activa, alElegir }: Props) {
  return (
    <div className="atlas-vistas" role="toolbar" aria-label="Vistas predefinidas (teclas 1 a 7)" data-tour="atlas-vistas">
      {VISTAS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`atlas-vistas__boton${activa === v.id ? ' is-activa' : ''}`}
          aria-pressed={activa === v.id}
          aria-keyshortcuts={v.tecla}
          title={`${v.descripcion} (tecla ${v.tecla})`}
          onClick={() => alElegir(v.id)}
        >
          <kbd aria-hidden="true">{v.tecla}</kbd>
          <span>{v.nombre}</span>
        </button>
      ))}
    </div>
  )
}
