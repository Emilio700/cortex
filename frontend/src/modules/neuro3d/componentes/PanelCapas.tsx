/**
 * Panel de navegación: capas (con su opacidad), pelado, corte, columna
 * despiezada y efectos. Sin estado propio: todo llega por props.
 */
import { CButton, CFormRange, CFormSwitch } from '@coreui/react-pro'
import { CAPAS, ETAPAS_DEL_PELADO, PELADO_MAXIMO, etapaDelPelado, type CapaId, type EstadoDeCapas } from '../dominio/capas'
import { LIMITES_DE_CORTE, PLANOS_DE_CORTE, type PlanoDeCorte } from '../dominio/vistas'

interface Props {
  capas: EstadoDeCapas
  alCambiarCapa: (id: CapaId, cambio: { visible?: boolean; opacidad?: number }) => void
  pelado: number
  alCambiarPelado: (v: number) => void
  alPelar: () => void
  corte: { plano: PlanoDeCorte; posicion: number }
  alCambiarCorte: (c: { plano: PlanoDeCorte; posicion: number }) => void
  flujo: boolean
  alCambiarFlujo: (v: boolean) => void
  rotacion: boolean
  alCambiarRotacion: (v: boolean) => void
  reducirMovimiento: boolean
}

export default function PanelCapas(p: Props) {
  const limites = p.corte.plano !== 'ninguno' ? LIMITES_DE_CORTE[p.corte.plano] : null
  const pelando = p.pelado >= PELADO_MAXIMO - 0.01
  return (
    <div className="atlas-panel__bloques">
      <section className="atlas-bloque" aria-labelledby="atlas-capas-titulo" data-tour="atlas-capas">
        <h2 id="atlas-capas-titulo" className="atlas-bloque__titulo">Capas</h2>
        <ul className="atlas-capas">
          {CAPAS.map((c) => {
            const estado = p.capas[c.id]
            return (
              <li key={c.id} className="atlas-capa">
                <div className="atlas-capa__fila">
                  <CFormSwitch
                    id={`atlas-capa-${c.id}`}
                    checked={estado.visible}
                    onChange={(e) => p.alCambiarCapa(c.id, { visible: e.target.checked })}
                    label={
                      <span>
                        {c.nombre}
                        {c.esquematica && <span className="atlas-capa__esquema"> esquemática</span>}
                      </span>
                    }
                  />
                </div>
                <CFormRange
                  className="atlas-capa__opacidad"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={estado.opacidad}
                  disabled={!estado.visible}
                  aria-label={`Opacidad de ${c.nombre.toLowerCase()}`}
                  onChange={(e) => p.alCambiarCapa(c.id, { opacidad: Number(e.target.value) })}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="atlas-bloque" aria-labelledby="atlas-pelado-titulo" data-tour="atlas-pelado">
        <h2 id="atlas-pelado-titulo" className="atlas-bloque__titulo">Pelar por capas</h2>
        <p className="atlas-bloque__ayuda">
          De la piel al encéfalo: <b>{etapaDelPelado(p.pelado)}</b>
        </p>
        <CFormRange
          min={0}
          max={PELADO_MAXIMO}
          step={0.01}
          value={p.pelado}
          aria-label="Pelado por capas"
          aria-valuetext={etapaDelPelado(p.pelado)}
          onChange={(e) => p.alCambiarPelado(Number(e.target.value))}
        />
        <div className="atlas-pelado__marcas" aria-hidden="true">
          {ETAPAS_DEL_PELADO.map((e) => (
            <span key={e}>{e}</span>
          ))}
        </div>
        <CButton color="primary" size="sm" className="w-100 mt-2" onClick={p.alPelar}>
          {pelando ? 'Volver a cubrir' : 'Pelar capas'}
        </CButton>
      </section>

      <section className="atlas-bloque" aria-labelledby="atlas-corte-titulo" data-tour="atlas-corte">
        <h2 id="atlas-corte-titulo" className="atlas-bloque__titulo">Plano de corte</h2>
        <div className="atlas-segmentado" role="group" aria-label="Plano de corte">
          {PLANOS_DE_CORTE.map((pl) => (
            <button
              key={pl.id}
              type="button"
              className={`atlas-segmentado__opcion${p.corte.plano === pl.id ? ' is-activo' : ''}`}
              aria-pressed={p.corte.plano === pl.id}
              onClick={() => p.alCambiarCorte({ plano: pl.id, posicion: pl.id === 'axial' ? 0.5 : 0 })}
            >
              {pl.nombre}
            </button>
          ))}
        </div>
        {limites && (
          <CFormRange
            className="mt-2"
            min={limites[0]}
            max={limites[1]}
            step={0.1}
            value={p.corte.posicion}
            aria-label={`Posición del corte ${p.corte.plano}`}
            onChange={(e) => p.alCambiarCorte({ plano: p.corte.plano, posicion: Number(e.target.value) })}
          />
        )}
      </section>

      <section className="atlas-bloque" aria-labelledby="atlas-efectos-titulo">
        <h2 id="atlas-efectos-titulo" className="atlas-bloque__titulo">Movimiento</h2>
        <CFormSwitch
          id="atlas-flujo"
          checked={p.flujo && !p.reducirMovimiento}
          disabled={p.reducirMovimiento}
          onChange={(e) => p.alCambiarFlujo(e.target.checked)}
          label="Flujo en el polígono de Willis y en las vías"
        />
        <CFormSwitch
          id="atlas-rotacion"
          checked={p.rotacion && !p.reducirMovimiento}
          disabled={p.reducirMovimiento}
          onChange={(e) => p.alCambiarRotacion(e.target.checked)}
          label="Girar solo"
        />
        {p.reducirMovimiento && (
          <p className="atlas-bloque__ayuda mb-0">«Reducir movimiento» está activo: sin giro ni animaciones.</p>
        )}
      </section>
    </div>
  )
}
