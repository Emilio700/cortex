/**
 * El puntaje mientras se llena: una **sugerencia** (DESIGN.md §3, regla 8).
 *
 * Dice de dónde sale (la fuente) y qué está por verificar. El puntaje que se
 * guarda es el que devuelve el servidor; esta tarjeta no afirma que algo quedó
 * registrado.
 */
import { formatearPuntaje } from '../dominio/motor'
import type { Escala, Resultado } from '../dominio/tipos'
import { Verificar } from './FormularioEscala'

interface Props {
  escala: Escala
  resultado: Resultado
}

export default function ResultadoSugerido({ escala, resultado }: Props) {
  const faltan = resultado.faltantes.length
  return (
    <div
      className={`escala-resultado escala-resultado--${resultado.tono}`}
      role="status"
      aria-live="polite"
      data-tour="escalas-resultado"
    >
      <div className="small text-body-secondary">Puntaje sugerido</div>
      {resultado.completo ? (
        <>
          <div className="d-flex align-items-baseline gap-2 flex-wrap">
            <span className="escala-resultado__puntaje">{formatearPuntaje(escala, resultado.puntaje)}</span>
            {resultado.detalle && <span className="small">{resultado.detalle}</span>}
          </div>
          <div className="fw-semibold">
            {resultado.interpretacion}
            {escala.bandasPorVerificar && resultado.puntaje !== null && <Verificar />}
          </div>
          {resultado.avisos.map((aviso) => (
            <div key={aviso} className="small mt-1">
              {aviso}
            </div>
          ))}
        </>
      ) : (
        <div className="small">
          {faltan > 0
            ? `Falta${faltan === 1 ? '' : 'n'} ${faltan} ${faltan === 1 ? 'ítem' : 'ítems'} por responder.`
            : 'Responde al menos una sección.'}
        </div>
      )}
      <div className="escala-fuente mt-2">Fuente: {escala.fuente}</div>
      {escala.verificar && escala.verificar.length > 0 && (
        <ul className="escala-fuente mb-0 mt-1 ps-3">
          {escala.verificar.map((nota) => (
            <li key={nota}>
              <span className="escala-verificar">(verificar)</span> {nota}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
