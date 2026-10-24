import { CAlert, CFormSelect } from '@coreui/react-pro'

import { resumenDeEstudio, type CandidatoComparacion } from '../dominio/tipos'

interface Props {
  candidatos: CandidatoComparacion[]
  seleccionado: string
  onSeleccionar: (valor: string) => void
  aviso: string | null
}

/**
 * Comparación con estudios previos.
 *
 * Se propone el estudio anterior y se enseñan sus avisos antes de comparar: si
 * al previo le falta una secuencia que este sí tiene, el realce no se puede
 * comparar aunque las dos imágenes se vean parecidas. Nunca se compara solo.
 */
export default function PanelEstudiosPrevios({
  candidatos,
  seleccionado,
  onSeleccionar,
  aviso,
}: Props) {
  const elegido = candidatos.find((candidato) => String(candidato.study.id) === seleccionado)

  return (
    <div data-tour="visor-comparar">
      <p className="visor-encabezado__meta">
        Se abre en paralelo, en el mismo plano. La rueda recorre los dos estudios a la vez.
      </p>
      <CFormSelect
        size="sm"
        value={seleccionado}
        onChange={(evento) => onSeleccionar(evento.target.value)}
        aria-label="Comparar con un estudio previo"
      >
        <option value="">Comparar con…</option>
        {candidatos.map((candidato) => (
          <option key={candidato.study.id} value={candidato.study.id}>
            {resumenDeEstudio(candidato.study)}
          </option>
        ))}
      </CFormSelect>

      {seleccionado && candidatos.length === 0 && (
        <p className="visor-encabezado__meta mt-2 mb-0">
          Este paciente no tiene estudios previos de imagen.
        </p>
      )}

      {elegido && elegido.avisos.length > 0 && (
        <CAlert color="warning" className="py-2 mt-2 mb-0">
          <strong>Antes de comparar:</strong>
          <ul className="mb-0 ps-3">
            {elegido.avisos.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
        </CAlert>
      )}

      {aviso && (
        <CAlert color="warning" className="py-2 mt-2 mb-0">
          {aviso}
        </CAlert>
      )}
    </div>
  )
}
