/**
 * Visor de documentos con carrusel (plan 26, D-2 y §3.5).
 *
 * Un solo visor para todo lo que se abre en GEMS: el resultado que subió
 * recepción, las fotos que la paciente mandó por WhatsApp, el PDF de una orden
 * antes de imprimirla. Antes cada pantalla hacía `window.open` de un Blob sin
 * tipo y el navegador, según su humor, lo mostraba o lo descargaba.
 *
 * - Varios archivos (PDF e imágenes mezclados) en la misma tira: miniaturas
 *   abajo, flechas y teclado para pasar de uno a otro.
 * - Cada Blob lleva su MIME real.
 * - Los PDF se dibujan con pdf.js en todos los dispositivos (N5): en Chrome de
 *   Android un `<iframe>` de Blob no muestra nada y en iOS solo la 1.ª página.
 * - En la computadora «Imprimir» abre el diálogo del navegador sobre el PDF
 *   real; en el teléfono las acciones son «Descargar» y «Abrir / Compartir».
 *   Solo se anota «impreso» cuando el diálogo de impresión de verdad se abrió.
 * - Todas las URL de Blob se liberan al cerrar. El visor anterior guardaba la
 *   URL en el estado y su limpieza leía un valor viejo: nunca liberaba nada.
 *
 * Quien lo usa da, por archivo, una función `cargar` que devuelve el Blob. Así
 * sirve igual para un documento guardado que para un PDF generado al vuelo.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CButton,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
  cilChevronLeft,
  cilChevronRight,
  cilCloudDownload,
  cilFile,
  cilImage,
  cilPrint,
  cilShareAlt,
  cilZoomIn,
  cilZoomOut,
} from '@coreui/icons'

import { apiClient } from '../services/api'
import { mensajeDeError } from '../utils/errors'
import PdfEnCanvas from './pdf/PdfEnCanvas'
import { abrirOCompartirPdf, esDispositivoTactil, imprimirPdfReal } from './pdf/acciones'

export interface ArchivoVisor {
  /** Identificador estable: si cambia, el archivo se vuelve a pedir. */
  clave: string
  /** Nombre con el que se muestra y se descarga. */
  nombre: string
  /** MIME conocido de antemano; si falta, se toma el del Blob. */
  mime?: string | null
  cargar: () => Promise<Blob>
}

interface Props {
  /** Con `enLinea` se ignora: el visor siempre está a la vista. */
  visible?: boolean
  onClose?: () => void
  titulo: string
  archivos: ArchivoVisor[]
  /** Archivo con el que abre (índice en `archivos`). */
  inicial?: number
  /** Ofrece «Imprimir» en los PDF (vista previa obligatoria antes de imprimir, D-2). */
  imprimible?: boolean
  /** Controles extra arriba del documento, p. ej. el modo de impresión. */
  barraSuperior?: ReactNode
  /** Para el recorrido guiado. */
  dataTour?: string
  /**
   * Se llama cuando la usuaria imprime o descarga de verdad, no al abrir la
   * vista previa: así la bitácora registra la impresión real (plan 26, M2).
   * Si devuelve un texto, es un aviso que se muestra (p. ej. que no se pudo
   * registrar); nunca bloquea la impresión.
   */
  alUsar?: (accion: 'impreso' | 'descargado') => Promise<string | null> | void
  /** Todavía no se sabe qué archivo mostrar (p. ej. se está leyendo una preferencia). */
  cargando?: boolean
  /**
   * Dentro de la página en vez de en un modal: el panel de revisar resultados
   * lleva el archivo a la izquierda y el formulario a la derecha (plan 26, §3.4).
   */
  enLinea?: boolean
  /** Alto del área del documento. */
  alto?: string
}

type Carga =
  | { estado: 'cargando' }
  | { estado: 'listo'; url: string; mime: string; blob: Blob }
  | { estado: 'error'; mensaje: string }

const esPdf = (mime: string) => mime === 'application/pdf'
const esImagen = (mime: string) => mime.startsWith('image/')

/**
 * Descarga un documento guardado (`GET /documents/{id}/download`) con su MIME
 * real: el que diga el servidor o, si no lo dice, el que trae la lista.
 */
export const cargarDocumento = async (documentId: number, mime?: string | null): Promise<Blob> => {
  const respuesta = await apiClient.get(`/documents/${documentId}/download`, {
    responseType: 'blob',
  })
  const cabecera = String(respuesta.headers?.['content-type'] ?? '')
    .split(';')[0]
    .trim()
  const datos = respuesta.data as Blob
  const tipo =
    (cabecera && cabecera !== 'application/octet-stream' ? cabecera : '') ||
    mime ||
    datos?.type ||
    'application/octet-stream'
  return new Blob([datos], { type: tipo })
}

/** Un documento guardado, listo para el visor. */
export const archivoDeDocumento = (
  documentId: number,
  nombre?: string | null,
  mime?: string | null,
): ArchivoVisor => ({
  clave: `doc-${documentId}`,
  nombre: nombre || `Documento ${documentId}`,
  mime,
  cargar: () => cargarDocumento(documentId, mime),
})

const VisorDocumentos = ({
  visible: visibleModal = false,
  onClose = () => {},
  titulo,
  archivos,
  inicial = 0,
  imprimible = false,
  barraSuperior,
  dataTour,
  cargando = false,
  alUsar,
  enLinea = false,
  alto = '65vh',
}: Props) => {
  const visible = enLinea || visibleModal
  const [indice, setIndice] = useState(inicial)
  const [cargas, setCargas] = useState<Record<string, Carga>>({})
  const [zoom, setZoom] = useState(100)
  const [avisoUso, setAvisoUso] = useState<{
    color: 'info' | 'warning' | 'danger'
    texto: string
    conDescarga?: boolean
  } | null>(null)
  // Las URL viven en un ref, no en el estado: la limpieza debe ver las vigentes.
  const urls = useRef<Map<string, string>>(new Map())
  const pedidas = useRef<Set<string>>(new Set())
  const [tactil] = useState(esDispositivoTactil)
  const [imprimiendo, setImprimiendo] = useState(false)
  const montado = useRef(true)

  const liberarTodo = useCallback(() => {
    urls.current.forEach((url) => URL.revokeObjectURL(url))
    urls.current.clear()
    pedidas.current.clear()
  }, [])

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
      liberarTodo()
    }
  }, [liberarTodo])

  // Al cerrar se suelta todo; al abrir de nuevo, se parte de cero.
  useEffect(() => {
    if (!visible) {
      liberarTodo()
      setCargas({})
      setZoom(100)
      setAvisoUso(null)
    } else {
      setIndice(Math.min(Math.max(inicial, 0), Math.max(archivos.length - 1, 0)))
    }
    // `archivos.length` cuenta: si la lista cambia con el visor abierto, el índice se ajusta.
  }, [visible, inicial, archivos.length, liberarTodo])

  const pedir = useCallback(async (archivo: ArchivoVisor) => {
    if (pedidas.current.has(archivo.clave)) return
    pedidas.current.add(archivo.clave)
    setCargas((c) => ({ ...c, [archivo.clave]: { estado: 'cargando' } }))
    try {
      const blob = await archivo.cargar()
      const mime = archivo.mime || blob.type || 'application/octet-stream'
      const conTipo = blob.type === mime ? blob : new Blob([blob], { type: mime })
      if (!montado.current || !pedidas.current.has(archivo.clave)) return
      const url = URL.createObjectURL(conTipo)
      const anterior = urls.current.get(archivo.clave)
      if (anterior) URL.revokeObjectURL(anterior)
      urls.current.set(archivo.clave, url)
      setCargas((c) => ({
        ...c,
        [archivo.clave]: { estado: 'listo', url, mime, blob: conTipo },
      }))
    } catch (err) {
      if (!montado.current) return
      pedidas.current.delete(archivo.clave)
      const mensaje =
        err instanceof Error && !(err as any).response
          ? err.message
          : mensajeDeError(err, 'No se pudo cargar el archivo.')
      setCargas((c) => ({ ...c, [archivo.clave]: { estado: 'error', mensaje } }))
    }
  }, [])

  // Se piden todos al abrir: son pocos por orden y así las miniaturas son reales.
  useEffect(() => {
    if (!visible) return
    archivos.forEach((archivo) => void pedir(archivo))
  }, [visible, archivos, pedir])

  // Un archivo que ya no está en la lista (p. ej. cambió el modo de impresión) se suelta.
  useEffect(() => {
    const vigentes = new Set(archivos.map((a) => a.clave))
    urls.current.forEach((url, clave) => {
      if (!vigentes.has(clave)) {
        URL.revokeObjectURL(url)
        urls.current.delete(clave)
        pedidas.current.delete(clave)
      }
    })
  }, [archivos])

  const total = archivos.length
  const actual = archivos[Math.min(indice, total - 1)]
  const carga = actual ? cargas[actual.clave] : undefined

  const ir = useCallback(
    (paso: number) => {
      if (total < 2) return
      setIndice((i) => (i + paso + total) % total)
      setZoom(100)
    },
    [total],
  )

  const alTeclear = (evento: React.KeyboardEvent) => {
    // No se roba la flecha a un campo de texto o a un selector.
    const destino = evento.target as HTMLElement
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(destino.tagName)) return
    if (evento.key === 'ArrowRight') ir(1)
    if (evento.key === 'ArrowLeft') ir(-1)
  }

  const avisarUso = async (accion: 'impreso' | 'descargado') => {
    if (!alUsar) return
    try {
      const nota = await alUsar(accion)
      if (nota) setAvisoUso({ color: 'warning', texto: nota })
    } catch {
      // La bitácora nunca impide imprimir; quien llama decide qué decir.
    }
  }

  const descargar = () => {
    if (!actual || carga?.estado !== 'listo') return
    const enlace = document.createElement('a')
    enlace.href = carga.url
    enlace.download = actual.nombre
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    void avisarUso('descargado')
  }

  /**
   * Se imprime el PDF real que se está viendo, en el diálogo del navegador. Si
   * el navegador no lo deja (M3), se dice y se ofrece descargarlo, sin anotar
   * nada. Aun cuando se abre, el sistema solo sabe que se abrió el diálogo, no
   * que salió la hoja: el aviso dice eso.
   */
  const imprimir = async () => {
    if (carga?.estado !== 'listo') return
    setImprimiendo(true)
    try {
      await imprimirPdfReal(carga.blob)
    } catch {
      setAvisoUso({
        color: 'danger',
        texto:
          'Este navegador no pudo abrir la impresión del PDF. Descárgalo y ábrelo para imprimirlo.',
        conDescarga: true,
      })
      return
    } finally {
      setImprimiendo(false)
    }
    setAvisoUso({ color: 'info', texto: 'Se abrió el diálogo de impresión.' })
    void avisarUso('impreso')
  }

  /**
   * En el teléfono: el menú de compartir (imprimir, guardar, WhatsApp…) o el
   * visor del sistema. El sistema no sabe si después se imprimió: si se
   * compartió se anota «descargado»; si solo se abrió, nada.
   */
  const compartir = async () => {
    if (!actual || carga?.estado !== 'listo') return
    const resultado = await abrirOCompartirPdf(carga.blob, actual.nombre)
    if (resultado === 'compartido') void avisarUso('descargado')
  }

  const listo = carga?.estado === 'listo' ? carga : null

  const cuerpo = (
    <>
      <div className="d-flex align-items-center justify-content-between gap-2 px-3 py-2 border-bottom">
        <div className="text-truncate small fw-semibold" title={actual?.nombre}>
          {actual?.nombre ?? 'Sin archivos'}
        </div>
        {total > 1 && (
          <div className="small text-body-secondary text-nowrap" aria-live="polite">
            {indice + 1} de {total}
          </div>
        )}
      </div>
      <div
        className="position-relative bg-body-tertiary d-flex justify-content-center align-items-center"
        style={{ height: alto, overflow: 'auto' }}
        // Se desplaza por sí mismo (un PDF largo): con foco y nombre se puede
        // recorrer con el teclado (axe, scrollable-region-focusable).
        tabIndex={0}
        role="region"
        aria-label={actual ? `Vista de ${actual.nombre}` : 'Vista del documento'}
      >
        {total > 1 && (
          <CButton
            color="dark"
            variant="ghost"
            className="position-absolute top-50 start-0 translate-middle-y ms-1"
            style={{ zIndex: 2 }}
            aria-label="Archivo anterior"
            onClick={() => ir(-1)}
          >
            <CIcon icon={cilChevronLeft} size="xl" />
          </CButton>
        )}
        {!actual && !cargando && (
          <div className="text-body-secondary">No hay archivos para mostrar.</div>
        )}
        {(carga?.estado === 'cargando' || (!actual && cargando)) && (
          <div className="text-center text-body-secondary">
            <CSpinner />
            <div className="mt-2">Cargando…</div>
          </div>
        )}
        {carga?.estado === 'error' && (
          <div className="text-center p-4" role="alert">
            <p className="text-danger mb-2">{carga.mensaje}</p>
            <CButton color="secondary" size="sm" onClick={() => actual && void pedir(actual)}>
              Reintentar
            </CButton>
          </div>
        )}
        {listo && esPdf(listo.mime) && (
          <div className="w-100 align-self-start">
            <PdfEnCanvas pdf={listo.blob} titulo={actual?.nombre ?? 'PDF'} />
          </div>
        )}
        {listo && esImagen(listo.mime) && (
          <img
            src={listo.url}
            alt={actual?.nombre}
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center top',
              transition: 'transform 0.2s',
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          />
        )}
        {listo && !esPdf(listo.mime) && !esImagen(listo.mime) && (
          <div className="text-center p-4">
            <p>Este tipo de archivo no se puede mostrar aquí ({listo.mime}).</p>
            <CButton color="primary" onClick={descargar}>
              <CIcon icon={cilCloudDownload} className="me-2" />
              Descargar para verlo
            </CButton>
          </div>
        )}
        {total > 1 && (
          <CButton
            color="dark"
            variant="ghost"
            className="position-absolute top-50 end-0 translate-middle-y me-1"
            style={{ zIndex: 2 }}
            aria-label="Archivo siguiente"
            onClick={() => ir(1)}
          >
            <CIcon icon={cilChevronRight} size="xl" />
          </CButton>
        )}
      </div>
      {total > 1 && (
        <div
          className="d-flex gap-2 overflow-auto px-3 py-2 border-top"
          role="group"
          aria-label="Archivos"
        >
          {archivos.map((archivo, i) => {
            const c = cargas[archivo.clave]
            const imagen = c?.estado === 'listo' && esImagen(c.mime) ? c.url : null
            const mime = archivo.mime || (c?.estado === 'listo' ? c.mime : '')
            return (
              <button
                key={archivo.clave}
                type="button"
                className={`btn btn-sm p-1 border ${i === indice ? 'border-primary border-2' : ''}`}
                style={{ width: 96, flex: '0 0 auto' }}
                aria-label={`Ver ${archivo.nombre}`}
                aria-current={i === indice ? 'true' : undefined}
                onClick={() => {
                  setIndice(i)
                  setZoom(100)
                }}
              >
                <div
                  className="d-flex align-items-center justify-content-center bg-body-secondary rounded"
                  style={{ height: 56, overflow: 'hidden' }}
                >
                  {imagen ? (
                    <img src={imagen} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    <CIcon icon={esImagen(mime) ? cilImage : cilFile} size="xl" />
                  )}
                </div>
                <div className="small text-truncate mt-1">{archivo.nombre}</div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )

  const zoomControles = (
    <div className="d-flex align-items-center">
      {listo && esImagen(listo.mime) && (
        <>
          <CButton
            color="secondary"
            variant="ghost"
            size="sm"
            aria-label="Alejar"
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
          >
            <CIcon icon={cilZoomOut} />
          </CButton>
          <span className="mx-2 small text-body-secondary">{zoom}%</span>
          <CButton
            color="secondary"
            variant="ghost"
            size="sm"
            aria-label="Acercar"
            onClick={() => setZoom((z) => Math.min(300, z + 25))}
          >
            <CIcon icon={cilZoomIn} />
          </CButton>
        </>
      )}
    </div>
  )

  if (enLinea) {
    return (
      <div className="border rounded" onKeyDown={alTeclear} data-tour={dataTour}>
        {barraSuperior && <div className="px-3 pt-3">{barraSuperior}</div>}
        {avisoUso && (
          <div
            className={`alert alert-${avisoUso.color} m-3 mb-0 py-2 d-flex flex-wrap align-items-center gap-2`}
            role={avisoUso.color === 'danger' ? 'alert' : 'status'}
          >
            <span>{avisoUso.texto}</span>
            {avisoUso.conDescarga && (
              <CButton
                size="sm"
                color="danger"
                variant="outline"
                onClick={descargar}
                disabled={!listo}
              >
                Descargar el PDF
              </CButton>
            )}
          </div>
        )}
        {cuerpo}
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-2 border-top">
          {zoomControles}
          <div className="d-flex flex-wrap gap-2 ms-auto">
            <CButton color="secondary" onClick={descargar} disabled={!listo}>
              <CIcon icon={cilCloudDownload} className="me-2" />
              Descargar
            </CButton>
            {listo && esPdf(listo.mime) && tactil && (
              <CButton
                color="primary"
                variant={imprimible ? undefined : 'outline'}
                onClick={() => void compartir()}
              >
                <CIcon icon={cilShareAlt} className="me-2" />
                Abrir / Compartir
              </CButton>
            )}
            {imprimible && !tactil && (
              <CButton
                color="primary"
                onClick={() => void imprimir()}
                disabled={!listo || !esPdf(listo.mime) || imprimiendo}
                data-tour="visor-imprimir"
              >
                <CIcon icon={cilPrint} className="me-2" />
                Imprimir
              </CButton>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    // En el celular, a pantalla completa: un PDF en un modal de 360 px no se lee.
    <CModal
      visible={visible}
      onClose={onClose}
      size="xl"
      fullscreen="md"
      alignment="center"
      scrollable
    >
      <div onKeyDown={alTeclear} data-tour={dataTour}>
        <CModalHeader closeButton>
          <CModalTitle className="text-truncate">{titulo}</CModalTitle>
        </CModalHeader>
        {barraSuperior && <div className="px-3 pt-3">{barraSuperior}</div>}
        {avisoUso && (
          <div
            className={`alert alert-${avisoUso.color} m-3 mb-0 py-2 d-flex flex-wrap align-items-center gap-2`}
            role={avisoUso.color === 'danger' ? 'alert' : 'status'}
          >
            <span>{avisoUso.texto}</span>
            {avisoUso.conDescarga && (
              <CButton
                size="sm"
                color="danger"
                variant="outline"
                onClick={descargar}
                disabled={!listo}
              >
                Descargar el PDF
              </CButton>
            )}
          </div>
        )}
        <CModalBody className="p-0">{cuerpo}</CModalBody>
        <CModalFooter className="justify-content-between flex-wrap gap-2">
          {zoomControles}
          <div className="d-flex flex-wrap gap-2 ms-auto">
            <CButton color="secondary" variant="outline" onClick={onClose}>
              Cerrar
            </CButton>
            <CButton color="secondary" onClick={descargar} disabled={!listo}>
              <CIcon icon={cilCloudDownload} className="me-2" />
              Descargar
            </CButton>
            {listo && esPdf(listo.mime) && tactil && (
              <CButton
                color="primary"
                variant={imprimible ? undefined : 'outline'}
                onClick={() => void compartir()}
              >
                <CIcon icon={cilShareAlt} className="me-2" />
                Abrir / Compartir
              </CButton>
            )}
            {imprimible && !tactil && (
              <CButton
                color="primary"
                onClick={() => void imprimir()}
                disabled={!listo || !esPdf(listo.mime) || imprimiendo}
                data-tour="visor-imprimir"
              >
                <CIcon icon={cilPrint} className="me-2" />
                Imprimir
              </CButton>
            )}
          </div>
        </CModalFooter>
      </div>
    </CModal>
  )
}

export default VisorDocumentos
