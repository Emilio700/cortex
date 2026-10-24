import { CButton, CFormInput } from '@coreui/react-pro'

import { formatearMedida, resumirEvolucion, type Evolucion } from '../dominio/medidas'
import type { AnotacionDicom } from '../dominio/tipos'

interface Pendiente {
  value: number
  unit: string
}

interface Props {
  medidas: AnotacionDicom[]
  pendiente: Pendiente | null
  etiqueta: string
  evoluciones: Record<number, Evolucion | null>
  onEtiqueta: (valor: string) => void
  onGuardar: () => void
  onDescartar: () => void
  onConfirmar: (medicion: AnotacionDicom) => void
  onBorrar: (medicion: AnotacionDicom) => void
}

/**
 * Las mediciones del estudio.
 *
 * Una medición recién trazada no es dato del expediente: queda «sin aceptar»
 * hasta que el médico la acepta, y mientras tanto se puede borrar. Una aceptada
 * ya no se borra; se corrige en la nota. Es la misma regla que en el resto del
 * sistema: el rastro de lo que se midió no se pierde.
 */
export default function PanelMediciones({
  medidas,
  pendiente,
  etiqueta,
  evoluciones,
  onEtiqueta,
  onGuardar,
  onDescartar,
  onConfirmar,
  onBorrar,
}: Props) {
  return (
    <div data-tour="visor-mediciones">
      {pendiente && (
        <div className="visor-medida mb-2">
          <div className="visor-medida__valor">
            {formatearMedida(pendiente.value, pendiente.unit)}
          </div>
          <CFormInput
            className="mt-1"
            size="sm"
            placeholder="¿Qué se midió? (opcional)"
            value={etiqueta}
            maxLength={120}
            onChange={(evento) => onEtiqueta(evento.target.value)}
          />
          <div className="visor-medida__pie">
            <CButton size="sm" color="primary" onClick={onGuardar}>
              Guardar
            </CButton>
            <CButton size="sm" color="secondary" variant="outline" onClick={onDescartar}>
              Descartar
            </CButton>
          </div>
        </div>
      )}

      {medidas.length === 0 ? (
        <p className="mb-0 visor-encabezado__meta">
          Todavía no hay mediciones. Elige «Medir» y traza una distancia sobre la imagen.
        </p>
      ) : (
        <ul className="visor-medidas">
          {medidas.map((medicion) => {
            const evolucion = resumirEvolucion(evoluciones[medicion.id] ?? null)
            const delta = evoluciones[medicion.id]?.delta ?? 0
            const signo = delta > 0 ? 'sube' : delta < 0 ? 'baja' : 'igual'
            return (
              <li className="visor-medida" key={medicion.id}>
                <div className="visor-medida__valor">
                  {formatearMedida(medicion.value, medicion.unit)}
                </div>
                {medicion.label && <div>{medicion.label}</div>}
                {evolucion && (
                  <div className="visor-medida__evolucion" data-signo={signo}>
                    {evolucion} vs. estudio previo
                  </div>
                )}
                <div className="visor-medida__pie">
                  <span>
                    {medicion.is_confirmed ? 'Aceptada' : 'Sin aceptar'}
                    {medicion.created_by ? ` · ${medicion.created_by}` : ''}
                  </span>
                  {!medicion.is_confirmed && (
                    <span>
                      <CButton
                        size="sm"
                        color="primary"
                        variant="ghost"
                        onClick={() => onConfirmar(medicion)}
                      >
                        Aceptar
                      </CButton>
                      <CButton
                        size="sm"
                        color="danger"
                        variant="ghost"
                        onClick={() => onBorrar(medicion)}
                      >
                        Borrar
                      </CButton>
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
