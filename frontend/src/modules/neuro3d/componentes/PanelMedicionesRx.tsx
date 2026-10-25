/**
 * Las mediciones de la radiografía, en palabras: cada una con su fuente, de
 * dónde salen los milímetros y lo que falta para medir lo demás.
 *
 * Se usa mientras se marca (`origen="sugerencia"`: lo calculó la pantalla) y en
 * Neuro 3D junto al modelo (`origen="servidor"`: lo que se guardó). Lo que se
 * sale de la referencia va en ámbar: aviso, no diagnóstico.
 */
import { CBadge, CFormSelect } from '@coreui/react-pro'
import {
  FUENTES_RX,
  REFERENCIAS_RX,
  VERTEBRAS_RX,
  discosBajos,
  fueraDeReferencia,
  textoDeEscala,
  textoDeListesis,
  type CalibracionesRx,
  type ResultadoRx,
} from '../dominio/ajusteRadiografico'

interface Props {
  resultado: ResultadoRx
  calibraciones: CalibracionesRx
  origen: 'sugerencia' | 'servidor'
  /** Vértebras de la AP que se pueden elegir como límite del Cobb (sólo al marcar). */
  vertebrasAP?: string[]
  eleccionCobb?: { superior: string; inferior: string } | null
  alCambiarCobb?: (e: { superior: string; inferior: string } | null) => void
  compacto?: boolean
}

const Fila = ({ titulo, valor, fuente, aviso, children }: { titulo: string; valor: string; fuente: string; aviso?: string | null; children?: React.ReactNode }) => (
  <div className="rx-medicion">
    <div className="rx-medicion__fila">
      <span className="rx-medicion__titulo">{titulo}</span>
      <span className="rx-medicion__valor">{valor}</span>
    </div>
    {aviso && <div className="rx-medicion__aviso">{aviso}</div>}
    {children}
    <div className="rx-medicion__fuente">{fuente}</div>
  </div>
)

export default function PanelMedicionesRx({ resultado: r, calibraciones, origen, vertebrasAP, eleccionCobb, alCambiarCobb, compacto }: Props) {
  const lordosis = r.lordosisLumbar
  const cifosis = r.cifosisToracica
  const cobb = r.cobbCoronal
  const listesis = r.listesis.filter((l) => l.apreciable)
  const bajos = discosBajos(r.discos)
  const opcionesAP = (vertebrasAP ?? []).filter((v) => VERTEBRAS_RX.includes(v))

  return (
    <section className={`rx-mediciones${compacto ? ' rx-mediciones--compacto' : ''}`} aria-label="Mediciones de la radiografía" data-tour="rx-mediciones">
      <div className="rx-mediciones__encabezado">
        <h2 className="rx-mediciones__titulo">Mediciones</h2>
        {origen === 'sugerencia' ? (
          <CBadge color="info" className="text-dark">Sugerencia</CBadge>
        ) : (
          <CBadge color="success">Calculadas por el servidor</CBadge>
        )}
      </div>
      {origen === 'sugerencia' && (
        <p className="rx-mediciones__nota">Se calculan mientras marcas. Lo que se guarda lo vuelve a calcular el servidor.</p>
      )}

      {lordosis && (
        <Fila
          titulo="Lordosis lumbar L1–S1"
          valor={`${lordosis.grados}°`}
          fuente={`${FUENTES_RX.cobb} · ${REFERENCIAS_RX.lordosisLumbar.texto}`}
          aviso={fueraDeReferencia(lordosis.grados, REFERENCIAS_RX.lordosisLumbar) ? 'Fuera de la referencia aproximada.' : null}
        />
      )}
      {cifosis && (
        <Fila
          titulo="Cifosis torácica T4–T12"
          valor={`${cifosis.grados}°`}
          fuente={`${FUENTES_RX.cobb} · ${REFERENCIAS_RX.cifosisToracica.texto}`}
          aviso={fueraDeReferencia(cifosis.grados, REFERENCIAS_RX.cifosisToracica) ? 'Fuera de la referencia aproximada.' : null}
        />
      )}
      {cobb && (
        <Fila
          titulo={`Cobb coronal ${cobb.superior}–${cobb.inferior}`}
          valor={`${cobb.grados}°`}
          fuente={`${FUENTES_RX.cobb} · escoliosis desde 10°, ${FUENTES_RX.srs}`}
          aviso={cobb.escoliosis ? `Escoliosis convexa a la ${cobb.convexidad} del paciente.` : 'Menos de 10°: no se considera escoliosis.'}
        >
          <div className="rx-medicion__detalle">
            {cobb.automatico ? 'Vértebras límite elegidas por el sistema.' : 'Vértebras límite elegidas por ti.'}
          </div>
          {alCambiarCobb && opcionesAP.length > 1 && (
            <div className="rx-medicion__cobb">
              <label className="visually-hidden" htmlFor="rx-cobb-superior">Vértebra límite superior</label>
              <CFormSelect
                id="rx-cobb-superior"
                size="sm"
                value={eleccionCobb?.superior ?? ''}
                onChange={(e) =>
                  alCambiarCobb(e.target.value ? { superior: e.target.value, inferior: eleccionCobb?.inferior ?? cobb.inferior } : null)
                }
              >
                <option value="">Superior: automática</option>
                {opcionesAP.map((v) => (
                  <option key={v} value={v}>Superior: {v}</option>
                ))}
              </CFormSelect>
              <label className="visually-hidden" htmlFor="rx-cobb-inferior">Vértebra límite inferior</label>
              <CFormSelect
                id="rx-cobb-inferior"
                size="sm"
                value={eleccionCobb?.inferior ?? ''}
                onChange={(e) =>
                  alCambiarCobb(e.target.value ? { superior: eleccionCobb?.superior ?? cobb.superior, inferior: e.target.value } : null)
                }
              >
                <option value="">Inferior: automática</option>
                {opcionesAP.map((v) => (
                  <option key={v} value={v}>Inferior: {v}</option>
                ))}
              </CFormSelect>
            </div>
          )}
        </Fila>
      )}
      {r.pelvis && (
        <Fila
          titulo="Pelvis"
          valor={`PI ${r.pelvis.incidencia}°`}
          fuente={FUENTES_RX.pelvis}
          aviso={fueraDeReferencia(r.pelvis.pendienteSacra, REFERENCIAS_RX.pendienteSacra) ? 'Pendiente sacra fuera de la referencia aproximada (30°–50°, verificar).' : null}
        >
          <div className="rx-medicion__detalle">
            Inclinación pélvica {r.pelvis.inclinacion}° · pendiente sacra {r.pelvis.pendienteSacra}°
          </div>
        </Fila>
      )}
      {r.listesis.length > 0 && (
        <Fila
          titulo="Listesis"
          valor={listesis.length ? `${listesis.length} nivel${listesis.length === 1 ? '' : 'es'}` : 'Sin listesis'}
          fuente={FUENTES_RX.meyerding}
        >
          {listesis.length === 0 ? (
            <div className="rx-medicion__detalle">Sin desplazamiento apreciable en los niveles marcados.</div>
          ) : (
            <ul className="rx-medicion__lista">
              {listesis.map((l) => (
                <li key={l.nivel}>
                  {textoDeListesis(l)}
                  {l.mm !== null ? ` · ${l.mm} mm` : ''}
                </li>
              ))}
            </ul>
          )}
        </Fila>
      )}
      {r.discos.length > 0 && (
        <Fila titulo="Altura de los discos" valor={`${r.discos.length} medidos`} fuente={FUENTES_RX.disco}>
          {bajos.length > 0 && <div className="rx-medicion__aviso">Más bajos que sus vecinos: {bajos.join(', ')}.</div>}
          {!compacto && (
            <ul className="rx-medicion__lista">
              {r.discos.map((d) => (
                <li key={d.nivel}>
                  {d.nivel}: {d.indice.toFixed(2)} del cuerpo de arriba{d.mm !== null ? ` · ${d.mm} mm` : ''}
                </li>
              ))}
            </ul>
          )}
        </Fila>
      )}

      <div className="rx-mediciones__escala">
        <div><b>Lateral:</b> {textoDeEscala(calibraciones.lateral)}</div>
        <div><b>AP:</b> {textoDeEscala(calibraciones.ap)}</div>
      </div>

      {r.faltan.length > 0 && (
        <details className="rx-mediciones__faltan">
          <summary>Lo que falta para medir ({r.faltan.length})</summary>
          <ul>
            {r.faltan.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
