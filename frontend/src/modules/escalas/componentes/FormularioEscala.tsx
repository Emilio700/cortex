/**
 * Los ítems de una escala, cada uno como un grupo de opciones.
 *
 * Opciones como botones grandes y no como un desplegable: en la consulta se
 * responde mirando al paciente, y un clic sobre el texto completo es más rápido
 * y se equivoca menos que abrir una lista. Teclado: Tab entre ítems, flechas
 * dentro del ítem (patrón de grupo de radio).
 */
import type { KeyboardEvent } from 'react'
import type { Escala, Item, Respuestas } from '../dominio/tipos'

interface Props {
  escala: Escala
  respuestas: Respuestas
  onCambiar: (itemId: string, codigo: string | undefined) => void
  deshabilitado?: boolean
}

const Verificar = () => (
  <span className="escala-verificar" title="Texto por revisar con la fuente validada">
    {' '}
    (verificar)
  </span>
)

function GrupoDeOpciones({
  item,
  elegido,
  onElegir,
  deshabilitado,
}: {
  item: Item
  elegido: string | undefined
  onElegir: (codigo: string | undefined) => void
  deshabilitado?: boolean
}) {
  const idTitulo = `escala-item-${item.id}`
  const mover = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const paso = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!paso) return
    e.preventDefault()
    const siguiente = (indice + paso + item.opciones.length) % item.opciones.length
    onElegir(item.opciones[siguiente].codigo)
    const grupo = e.currentTarget.parentElement
    ;(grupo?.children[siguiente] as HTMLElement | undefined)?.focus()
  }
  // Solo una opción entra en el orden de Tab: la elegida, o la primera.
  const enfocable = elegido && item.opciones.some((o) => o.codigo === elegido) ? elegido : item.opciones[0].codigo

  return (
    <fieldset className="escala-item">
      <div id={idTitulo} className="escala-item__titulo">
        {item.titulo}
        {item.opcional && <span className="text-body-secondary fw-normal small"> · opcional</span>}
        {item.verificar && <Verificar />}
      </div>
      {item.ayuda && <div className="escala-item__ayuda">{item.ayuda}</div>}
      <div className="escala-opciones" role="radiogroup" aria-labelledby={idTitulo}>
        {item.opciones.map((opcion, indice) => {
          const marcada = elegido === opcion.codigo
          return (
            <button
              key={opcion.codigo}
              type="button"
              role="radio"
              aria-checked={marcada}
              tabIndex={opcion.codigo === enfocable ? 0 : -1}
              className="escala-opcion"
              disabled={deshabilitado}
              // Volver a pulsar la elegida la quita: así se deja una sección
              // opcional sin responder después de haberla tocado.
              onClick={() => onElegir(marcada && item.opcional ? undefined : opcion.codigo)}
              onKeyDown={(e) => mover(e, indice)}
            >
              <span className="escala-opcion__puntos" aria-hidden="true">
                {opcion.puntos === null ? opcion.codigo : opcion.puntos}
              </span>
              <span>{opcion.texto}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function FormularioEscala({ escala, respuestas, onCambiar, deshabilitado }: Props) {
  return (
    <div>
      {escala.instrucciones && <p className="small text-body-secondary mb-3">{escala.instrucciones}</p>}
      {escala.items.map((item) => (
        <GrupoDeOpciones
          key={item.id}
          item={item}
          elegido={respuestas[item.id]}
          onElegir={(codigo) => onCambiar(item.id, codigo)}
          deshabilitado={deshabilitado}
        />
      ))}
    </div>
  )
}

export { Verificar }
