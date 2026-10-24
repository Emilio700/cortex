/**
 * Vista previa obligatoria antes de imprimir una orden (plan 26, D-2).
 *
 * Imprimir ya no manda el PDF a la impresora a ciegas: se abre el PDF real en
 * el visor y desde ahí se imprime o se descarga. Cuando el papel junta varios
 * estudios se elige cómo repartirlo («Separado por destino» o «Todo en una
 * hoja»); arranca con el que el médico fijó en su perfil. Al cambiarlo se
 * vuelve a pedir el PDF: lo que se imprime es exactamente lo que se ve.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CFormLabel, CFormSelect } from '@coreui/react-pro'
import VisorDocumentos, { type ArchivoVisor } from '../../../shared/components/VisorDocumentos'
import { useModoImpresionPredeterminado } from '../hooks/useModoImpresionPredeterminado'
import {
  MODOS_DE_IMPRESION,
  registrarImpresion,
  type ModoImpresion,
  type PdfConOrdenes,
} from '../utils/ordenEstudioPdf'

interface Props {
  visible: boolean
  onClose: () => void
  titulo: string
  nombreArchivo: string
  /**
   * Pide el PDF; `modo` llega vacío cuando debe decidir el perfil del médico
   * autora. Si el servidor dice qué órdenes imprimió, se devuelven con el PDF y
   * son las que se anotan en la bitácora.
   */
  obtener: (modo?: ModoImpresion | null) => Promise<Blob | PdfConOrdenes>
  /** Si el papel junta varios estudios y se puede elegir cómo repartirlo. */
  conModo?: boolean
  /** Órdenes que van en el papel, para anotar en la bitácora la impresión real (M2). */
  orderIds?: number[]
  folio?: string
}

const VistaPreviaOrden = ({
  visible,
  onClose,
  titulo,
  nombreArchivo,
  obtener,
  conModo = false,
  orderIds = [],
  folio,
}: Props) => {
  const { modo: predeterminado, listo } = useModoImpresionPredeterminado(visible && conModo)
  const [elegido, setElegido] = useState<ModoImpresion | null>(null)
  // Las órdenes que de verdad van en el PDF mostrado, si el servidor las dijo.
  const impresas = useRef<number[] | null>(null)
  // El folio y el nombre que dio el servidor con el PDF: con eso se descarga
  // y se anota en la bitácora, no con uno armado en la pantalla (plan 32).
  const [delServidor, setDelServidor] = useState<{ folio: string | null; nombre: string | null }>({
    folio: null,
    nombre: null,
  })

  // Cada vez que se abre arranca con el modo del perfil, no con el de la vez anterior.
  useEffect(() => {
    if (visible) {
      setElegido(null)
      setDelServidor({ folio: null, nombre: null })
    }
  }, [visible])

  const modo = conModo ? (elegido ?? predeterminado) : null

  const esperando = conModo && !listo
  const archivos: ArchivoVisor[] = useMemo(
    () =>
      esperando
        ? []
        : [
            {
              clave: `orden-${nombreArchivo}-${modo ?? 'perfil'}`,
              nombre: delServidor.nombre ?? nombreArchivo,
              mime: 'application/pdf',
              cargar: async () => {
                const r = await obtener(modo)
                if (r instanceof Blob) return r
                if (r.orderIds.length > 0) impresas.current = r.orderIds
                setDelServidor({ folio: r.folio ?? null, nombre: r.nombreArchivo ?? null })
                return r.pdf
              },
            },
          ],
    [esperando, nombreArchivo, modo, obtener, delServidor.nombre],
  )

  const selector = conModo ? (
    <div className="d-flex align-items-center gap-2 flex-wrap" data-tour="orden-modo-impresion">
      <CFormLabel htmlFor="orden-modo-impresion" className="mb-0 small fw-semibold">
        Cómo se imprime
      </CFormLabel>
      <CFormSelect
        id="orden-modo-impresion"
        size="sm"
        style={{ maxWidth: 260 }}
        value={modo ?? ''}
        onChange={(e) => setElegido((e.target.value || null) as ModoImpresion | null)}
      >
        {modo === null && <option value="">Como lo configuró el médico</option>}
        {MODOS_DE_IMPRESION.map(({ valor, etiqueta }) => (
          <option key={valor} value={valor}>
            {etiqueta}
          </option>
        ))}
      </CFormSelect>
    </div>
  ) : undefined

  return (
    <VisorDocumentos
      visible={visible}
      onClose={onClose}
      titulo={titulo}
      archivos={archivos}
      cargando={esperando}
      imprimible
      alUsar={(accion) => registrarImpresion(impresas.current ?? orderIds, accion, delServidor.folio ?? folio)}
      barraSuperior={selector}
      dataTour="orden-vista-previa"
    />
  )
}

export default VistaPreviaOrden
