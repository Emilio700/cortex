/**
 * Buscar una estructura por nombre, sinónimo o nivel («L4-L5», «puente»,
 * «cauda equina»). Lista navegable con ↑ ↓ y Enter (guía §7).
 */
import { useId, useMemo, useState } from 'react'
import { CFormInput } from '@coreui/react-pro'
import { buscarEstructuras } from '../dominio/catalogo'

interface Props {
  alElegir: (id: string) => void
}

export default function BuscadorEstructuras({ alElegir }: Props) {
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(0)
  const lista = useId()
  const resultados = useMemo(() => buscarEstructuras(texto), [texto])
  const abierto = texto.trim().length > 0

  const elegir = (id: string) => {
    alElegir(id)
    setTexto('')
    setActivo(0)
  }

  return (
    <div className="atlas-buscador" data-tour="atlas-buscar">
      <label htmlFor={`${lista}-campo`} className="atlas-bloque__titulo">
        Buscar estructura
      </label>
      <CFormInput
        id={`${lista}-campo`}
        className="gems-campo"
        value={texto}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && resultados[activo] ? `${lista}-${resultados[activo].id}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          setTexto(e.target.value)
          setActivo(0)
        }}
        onKeyDown={(e) => {
          if (!abierto) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActivo((a) => Math.min(resultados.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActivo((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && resultados[activo]) {
            e.preventDefault()
            elegir(resultados[activo].id)
          } else if (e.key === 'Escape') {
            setTexto('')
          }
        }}
      />
      {abierto && (
        <ul id={lista} role="listbox" className="atlas-buscador__lista" aria-label="Estructuras encontradas">
          {resultados.length === 0 ? (
            <li className="atlas-buscador__vacio" role="option" aria-selected={false} aria-disabled="true">
              No hay ninguna estructura con ese nombre en el atlas.
            </li>
          ) : (
            resultados.map((r, i) => (
              <li
                key={r.id}
                id={`${lista}-${r.id}`}
                role="option"
                aria-selected={i === activo}
                className={`atlas-buscador__opcion${i === activo ? ' is-activa' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(r.id)
                }}
                onMouseEnter={() => setActivo(i)}
              >
                <span className="atlas-buscador__punto" style={{ background: `var(${r.color})` }} aria-hidden="true" />
                <span className="atlas-buscador__nombre">{r.nombre}</span>
                <span className="atlas-buscador__sistema">{r.sistema}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
