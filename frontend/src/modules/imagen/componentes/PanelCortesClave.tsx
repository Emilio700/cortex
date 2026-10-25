/**
 * Los cortes clave del estudio, con su miniatura.
 *
 * Un corte clave es lo que el médico quiere volver a ver o enseñar. Aquí se
 * listan agrupados por serie; un clic lleva al corte (cambia de serie si hace
 * falta) y lo deja con la ventana y el zoom con que se marcó. Abajo, la hoja en
 * PDF con las capturas, para la nota o para el paciente.
 *
 * Las miniaturas se piden con la sesión (no puede ser un `<img src>` directo) y
 * se liberan al salir: un estudio con muchas marcas no debe llenar la memoria.
 */
import { useEffect, useMemo, useState } from 'react'
import { CButton, CFormCheck, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilImage } from '@coreui/icons'

import { tituloDeCorteClave, type CorteClave } from '../dominio/cortesClave'
import { cortesClaveApi } from '../servicios/estudiosApi'

function Miniatura({ marca }: { marca: CorteClave }) {
  const [url, setUrl] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    if (!marca.has_image) return
    let activo = true
    let creada: string | null = null
    setFallo(false)
    cortesClaveApi
      .captura(marca.id)
      .then((blob) => {
        if (!activo) return
        creada = URL.createObjectURL(blob)
        setUrl(creada)
      })
      .catch(() => activo && setFallo(true))
    return () => {
      activo = false
      if (creada) URL.revokeObjectURL(creada)
    }
    // `updated_at` cambia cuando se vuelve a capturar el mismo corte.
  }, [marca.id, marca.has_image, marca.updated_at])

  if (marca.has_image && url) {
    return <img className="visor-clave__miniatura" src={url} alt={`Captura de ${tituloDeCorteClave(marca)}`} />
  }
  return (
    <span
      className="visor-clave__miniatura visor-clave__miniatura--vacia"
      title={fallo ? 'No se pudo cargar la captura' : marca.has_image ? 'Cargando…' : 'Sin captura'}
    >
      <CIcon icon={cilImage} />
    </span>
  )
}

interface Props {
  marcas: CorteClave[]
  serieActivaId?: number
  indiceActual: number
  onIr: (marca: CorteClave) => void
  onQuitar: (marca: CorteClave) => void
  onMarcar: () => void
  onHojaEnPdf: (opciones: { anonimo: boolean }) => Promise<void>
  /** Mensaje de lo último que pasó con la hoja en PDF (éxito o error). */
  aviso?: { tono: 'ok' | 'error'; texto: string } | null
}

export default function PanelCortesClave({
  marcas,
  serieActivaId,
  indiceActual,
  onIr,
  onQuitar,
  onMarcar,
  onHojaEnPdf,
  aviso,
}: Props) {
  const [anonimo, setAnonimo] = useState(false)
  const [generando, setGenerando] = useState(false)

  const grupos = useMemo(() => {
    const porSerie = new Map<number, { nombre: string; marcas: CorteClave[] }>()
    for (const marca of [...marcas].sort(
      (a, b) => a.series_id - b.series_id || a.instance_index - b.instance_index
    )) {
      const grupo = porSerie.get(marca.series_id) ?? {
        nombre: marca.series_description?.trim() || `Serie ${marca.series_id}`,
        marcas: [],
      }
      grupo.marcas.push(marca)
      porSerie.set(marca.series_id, grupo)
    }
    return [...porSerie.entries()].map(([serieId, grupo]) => ({ serieId, ...grupo }))
  }, [marcas])

  const conCaptura = marcas.filter((marca) => marca.has_image).length

  const generar = async () => {
    setGenerando(true)
    try {
      await onHojaEnPdf({ anonimo })
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div data-tour="visor-cortes-clave">
      <CButton size="sm" color="primary" variant="outline" className="w-100 mb-2" onClick={onMarcar}>
        ★ Marcar este corte
      </CButton>

      {marcas.length === 0 ? (
        <p className="mb-0 visor-encabezado__meta">
          Todavía no hay cortes clave. Marca el corte donde está lo importante (lesión, medición,
          comparación) y vuelve a él con un clic. Si guardas su captura, también entra a la hoja en
          PDF.
        </p>
      ) : (
        <>
          {grupos.map((grupo) => (
            <section key={grupo.serieId} className="visor-claves">
              <div className="visor-panel__titulo">{grupo.nombre}</div>
              <ul className="visor-claves__lista">
                {grupo.marcas.map((marca) => {
                  const actual = marca.series_id === serieActivaId && marca.instance_index === indiceActual
                  return (
                    <li className="visor-clave" key={marca.id} data-actual={actual ? 'true' : 'false'}>
                      <button
                        type="button"
                        className="visor-clave__ir"
                        onClick={() => onIr(marca)}
                        title="Ir a este corte, con la vista con que se marcó"
                      >
                        <Miniatura marca={marca} />
                        <span className="visor-clave__texto">
                          <strong>{tituloDeCorteClave(marca)}</strong>
                          <span className="visor-encabezado__meta">
                            Corte {marca.instance_index + 1}
                            {marca.created_by ? ` · ${marca.created_by}` : ''}
                          </span>
                          {marca.notes && <span className="visor-clave__nota">{marca.notes}</span>}
                        </span>
                      </button>
                      <CButton
                        size="sm"
                        color="danger"
                        variant="ghost"
                        aria-label={`Quitar la marca de ${tituloDeCorteClave(marca)}`}
                        title="Quitar la marca (y su captura)"
                        onClick={() => onQuitar(marca)}
                      >
                        Quitar
                      </CButton>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          <div className="visor-claves__hoja">
            <CFormCheck
              id="hoja-anonima"
              label="Sin nombre del paciente"
              checked={anonimo}
              onChange={(evento) => setAnonimo(evento.target.checked)}
            />
            <CButton
              size="sm"
              color="primary"
              disabled={conCaptura === 0 || generando}
              onClick={() => void generar()}
              title={conCaptura === 0 ? 'Ningún corte clave tiene captura todavía' : undefined}
            >
              {generando ? (
                <>
                  <CSpinner size="sm" className="me-1" /> Generando…
                </>
              ) : (
                `Hoja en PDF (${conCaptura})`
              )}
            </CButton>
          </div>
          {conCaptura < marcas.length && (
            <p className="visor-encabezado__meta mb-0 mt-1">
              {marcas.length - conCaptura} sin captura: no entran a la hoja.
            </p>
          )}
          {aviso && (
            <p className="mb-0 mt-1 small" role="status" data-tono={aviso.tono} style={{ color: aviso.tono === 'error' ? 'var(--cui-danger)' : 'var(--cui-success)' }}>
              {aviso.texto}
            </p>
          )}
        </>
      )}
    </div>
  )
}
