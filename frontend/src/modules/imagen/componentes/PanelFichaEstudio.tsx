import { formatearBytes, fechaCorta, resumenDeEstudio, type EstudioDicom } from '../dominio/tipos'

/**
 * Ficha técnica del estudio, en lenguaje que sirve para diagnosticar problemas:
 * de qué equipo vino, cuánto pesa, si trae geometría y cuál es su UID.
 *
 * Aquí es donde aparecerán los análisis asistidos cuando existan. Hoy no hay
 * ninguno y se dice tal cual: un panel vacío que promete «IA» es peor que un
 * panel que explica por qué está vacío.
 */
export default function PanelFichaEstudio({ estudio }: { estudio: EstudioDicom }) {
  const filas: [string, string][] = [
    ['Modalidad', estudio.modality],
    ['Fecha del estudio', fechaCorta(estudio.study_date)],
    ['Descripción', estudio.study_description ?? 'Sin descripción'],
    ['Institución', estudio.institution_name ?? 'No registrada'],
    ['Región', estudio.body_part ?? 'No registrada'],
    ['Series', String(estudio.series_count)],
    ['Cortes', String(estudio.instance_count)],
    ['Tamaño', formatearBytes(estudio.total_bytes)],
    ['Contraste', estudio.has_contrast === null ? 'No se pudo determinar' : estudio.has_contrast ? 'Sí' : 'No'],
    ['Geometría', estudio.series?.every((serie) => serie.has_geometry) ? 'Completa' : 'Incompleta'],
    ['StudyInstanceUID', estudio.study_instance_uid],
  ]

  return (
    <div data-tour="visor-ficha">
      <p className="visor-encabezado__meta mb-2">{resumenDeEstudio(estudio)}</p>
      <dl className="visor-ficha mb-3">
        {filas.map(([etiqueta, valor]) => (
          <div className="visor-ficha__fila" key={etiqueta}>
            <dt>{etiqueta}</dt>
            <dd title={valor}>{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="visor-panel__titulo">Análisis asistidos</div>
      <p className="visor-encabezado__meta mb-0">
        Todavía no hay ninguno en este consultorio. Cuando existan, aparecerán aquí, marcados
        con el motor y la versión que los generó, y se podrán apagar para volver a la imagen
        original.
      </p>
    </div>
  )
}
