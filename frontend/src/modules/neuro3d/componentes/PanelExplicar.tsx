/**
 * Modo «Explicar al paciente»: marcar un nivel («hernia L4-L5 paracentral
 * derecha») o una región, y ver la raíz comprimida y su dermatoma.
 *
 * Las marcas no se guardan solas: son para la explicación en consulta. Lo que
 * se conserva, si el médico quiere, es la captura en el expediente.
 */
import { forwardRef, useState } from 'react'
import { CAlert, CButton, CFormSelect, CFormTextarea } from '@coreui/react-pro'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { DISCOS, TIPOS_DE_HERNIA, type TipoDeHernia } from '../dominio/columna'
import {
  HALLAZGOS_DE_NIVEL,
  LARGO_MAXIMO_DE_NOTA,
  crearMarcaDeNivel,
  dermatomasDeMarcas,
  describirMarca,
  efectoDeMarca,
  type HallazgoDeNivel,
  type LadoDeMarca,
  type Marca,
} from '../dominio/marcas'
import SiluetaDermatomas from './SiluetaDermatomas'

interface Props {
  marcas: Marca[]
  alAgregar: (m: Marca) => void
  alQuitar: (id: string) => void
}

const LADOS: { id: LadoDeMarca; nombre: string }[] = [
  { id: 'derecho', nombre: 'Derecho' },
  { id: 'izquierdo', nombre: 'Izquierdo' },
  { id: 'ambos', nombre: 'Ambos lados' },
]

const PanelExplicar = forwardRef<SVGSVGElement, Props>(function PanelExplicar({ marcas, alAgregar, alQuitar }, siluetaRef) {
  const [disco, setDisco] = useState('L4-L5')
  const [hallazgo, setHallazgo] = useState<HallazgoDeNivel>('hernia')
  const [posicion, setPosicion] = useState<TipoDeHernia>('paracentral')
  const [lado, setLado] = useState<LadoDeMarca>('derecho')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  const agregar = () => {
    const r = crearMarcaDeNivel({ disco, hallazgo, posicion, lado, nota })
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    setNota('')
    alAgregar(r.marca)
  }

  const encendidos = dermatomasDeMarcas(marcas)

  return (
    <section className="atlas-explicar" aria-labelledby="atlas-explicar-titulo" data-tour="atlas-marcas">
      <h2 id="atlas-explicar-titulo" className="atlas-bloque__titulo">Explicar al paciente</h2>
      <p className="atlas-bloque__ayuda">
        Marca el nivel y el atlas enciende la raíz comprimida y la piel que siente. Las marcas no se guardan: para conservarlas, guarda la captura.
      </p>
      <div className="atlas-explicar__formulario">
        <label className="form-label" htmlFor="atlas-marca-disco">Nivel</label>
        <CFormSelect id="atlas-marca-disco" className="gems-campo" value={disco} onChange={(e) => setDisco(e.target.value)}>
          {DISCOS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </CFormSelect>
        <label className="form-label" htmlFor="atlas-marca-hallazgo">Hallazgo</label>
        <CFormSelect
          id="atlas-marca-hallazgo"
          className="gems-campo"
          value={hallazgo}
          onChange={(e) => setHallazgo(e.target.value as HallazgoDeNivel)}
        >
          {HALLAZGOS_DE_NIVEL.map((h) => (
            <option key={h.id} value={h.id}>{h.nombre}</option>
          ))}
        </CFormSelect>
        {hallazgo === 'hernia' && (
          <>
            <label className="form-label" htmlFor="atlas-marca-posicion">Posición</label>
            <CFormSelect
              id="atlas-marca-posicion"
              className="gems-campo"
              value={posicion}
              onChange={(e) => {
                const p = e.target.value as TipoDeHernia
                setPosicion(p)
                if (p === 'central') setLado('ambos')
              }}
            >
              {TIPOS_DE_HERNIA.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </CFormSelect>
          </>
        )}
        <span className="form-label" id="atlas-marca-lado">Lado</span>
        <div className="atlas-segmentado" role="group" aria-labelledby="atlas-marca-lado">
          {LADOS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`atlas-segmentado__opcion${lado === l.id ? ' is-activo' : ''}`}
              aria-pressed={lado === l.id}
              onClick={() => setLado(l.id)}
            >
              {l.nombre}
            </button>
          ))}
        </div>
        <label className="form-label" htmlFor="atlas-marca-nota">Nota (opcional)</label>
        <CFormTextarea
          id="atlas-marca-nota"
          className="gems-campo"
          rows={2}
          maxLength={LARGO_MAXIMO_DE_NOTA}
          value={nota}
          onChange={enMayusculas((valor) => setNota(valor))}
        />
        {error && (
          <CAlert color="warning" className="py-2 mb-0">
            {error}
          </CAlert>
        )}
        <CButton color="primary" onClick={agregar}>
          Marcar nivel
        </CButton>
      </div>

      {marcas.length > 0 ? (
        <ul className="atlas-marcas" aria-label="Marcas">
          {marcas.map((m) => {
            const efecto = m.tipo === 'nivel' ? efectoDeMarca(m) : null
            return (
              <li key={m.id} className="atlas-marca">
                <div>
                  <div className="atlas-marca__titulo">{describirMarca(m)}</div>
                  {efecto && <div className="atlas-marca__detalle">{efecto.explicacion}</div>}
                  {m.nota && <div className="atlas-marca__detalle">{m.nota}</div>}
                </div>
                <CButton color="danger" variant="outline" size="sm" onClick={() => alQuitar(m.id)} aria-label={`Quitar la marca ${describirMarca(m)}`}>
                  Quitar
                </CButton>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="atlas-bloque__ayuda">Todavía no hay marcas. También puedes tocar una estructura en el modelo y marcarla desde su ficha.</p>
      )}

      <div data-tour="atlas-dermatomas">
        <SiluetaDermatomas ref={siluetaRef} encendidos={encendidos} titulo="Dermatomas de las marcas" />
      </div>
    </section>
  )
})

export default PanelExplicar
