/**
 * Anexar el resultado de un estudio: uno o varios archivos (plan 26, D-1).
 *
 * Es el caso del estudio que la paciente le manda a la doctora por WhatsApp o
 * correo, o del sobre que recepción recibe del laboratorio. Se pueden elegir
 * varios archivos a la vez (el PDF del reporte y las fotos). La orden no exige
 * ninguno; aquí, como es para anexar, se pide al menos uno.
 *
 * Se suben uno por uno y el aviso dice exactamente cuáles quedaron y cuáles no,
 * con el motivo del servidor (regla del plan 22: si el sistema no lo hizo, la
 * interfaz no dice que sí). Los que fallan se quedan en la lista para
 * reintentarlos.
 */
import { useEffect, useRef, useState } from 'react'
import {
  CAlert,
  CButton,
  CCol,
  CFormInput,
  CFormLabel,
  CListGroup,
  CListGroupItem,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import {
  anexarArchivoDeResultado,
  TIPOS_DE_ARCHIVO_ACEPTADOS,
  type ResultadoAdjuntado,
} from '../utils/anexarResultado'

interface Props {
  visible: boolean
  onClose: () => void
  orden: { id: number; study_name: string; patient_name?: string | null }
  /** Se llama con lo que el servidor confirmó, aunque otros archivos hayan fallado. */
  onAnexado: (resultados: ResultadoAdjuntado[]) => void
}

interface Pendiente {
  clave: string
  file: File
  error?: string
}

const tamano = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

const AnexarResultadoModal = ({ visible, onClose, orden, onAnexado }: Props) => {
  const [archivos, setArchivos] = useState<Pendiente[]>([])
  const [resultedOn, setResultedOn] = useState('')
  const [provider, setProvider] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [aviso, setAviso] = useState<{ color: 'warning' | 'danger'; texto: string } | null>(null)
  const entrada = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (visible) {
      setArchivos([])
      setResultedOn('')
      setProvider('')
      setAviso(null)
    }
  }, [visible])

  const agregar = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return
    const base = Date.now()
    const nuevos = Array.from(lista).map((file, i) => ({
      clave: `${file.name}-${file.size}-${base}-${i}`,
      file,
    }))
    setArchivos((actuales) => [...actuales, ...nuevos])
    setAviso(null)
    if (entrada.current) entrada.current.value = ''
  }

  const quitar = (clave: string) => setArchivos((a) => a.filter((p) => p.clave !== clave))

  const subir = async () => {
    if (archivos.length === 0) return
    setSubiendo(true)
    setAviso(null)
    const confirmados: ResultadoAdjuntado[] = []
    const fallidos: Pendiente[] = []
    for (const pendiente of archivos) {
      try {
        confirmados.push(
          await anexarArchivoDeResultado(orden.id, pendiente.file, {
            resulted_on: resultedOn || undefined,
            reporting_provider: provider.trim() || undefined,
          }),
        )
      } catch (err) {
        fallidos.push({ ...pendiente, error: (err as Error).message })
      }
    }
    setSubiendo(false)
    if (confirmados.length > 0) onAnexado(confirmados)
    if (fallidos.length === 0) {
      onClose()
      return
    }
    setArchivos(fallidos)
    setAviso(
      confirmados.length > 0
        ? {
            color: 'warning',
            texto: `Se anexaron ${confirmados.length} de ${confirmados.length + fallidos.length} archivos. Los que siguen en la lista no se anexaron.`,
          }
        : { color: 'danger', texto: 'No se anexó ningún archivo. Revisa el motivo de cada uno.' },
    )
  }

  return (
    <CModal
      visible={visible}
      onClose={() => {
        if (!subiendo) onClose()
      }}
      alignment="center"
      backdrop="static"
    >
      <CModalHeader closeButton={!subiendo}>
        <CModalTitle>Anexar resultado</CModalTitle>
        <BotonAyudaContextual recorridoId="resultado-anexar" />
      </CModalHeader>
      <CModalBody data-tour="anexar-formulario">
        <div className="small text-body-secondary mb-3">
          {orden.patient_name ? `${orden.patient_name} · ` : ''}
          <strong>{orden.study_name}</strong> · Orden n.º {orden.id}
        </div>
        {aviso && <CAlert color={aviso.color} role="alert">{aviso.texto}</CAlert>}
        <div className="mb-3" data-tour="anexar-archivos">
          <CFormLabel htmlFor={`anexar-${orden.id}`}>
            Archivos del resultado (PDF, JPG o PNG; puedes elegir varios)
          </CFormLabel>
          <CFormInput
            id={`anexar-${orden.id}`}
            ref={entrada}
            type="file"
            multiple
            accept={TIPOS_DE_ARCHIVO_ACEPTADOS}
            disabled={subiendo}
            onChange={(e) => agregar(e.target.files)}
          />
          <div className="form-text">
            El reporte del laboratorio, la interpretación o las fotos del estudio que mandó la paciente.
          </div>
        </div>
        {archivos.length > 0 && (
          <CListGroup className="mb-3" aria-label="Archivos por anexar">
            {archivos.map((p) => (
              <CListGroupItem
                key={p.clave}
                className="d-flex justify-content-between align-items-start gap-2"
              >
                <div className="small text-break">
                  <div>
                    {p.file.name}{' '}
                    <span className="text-body-secondary">· {tamano(p.file.size)}</span>
                  </div>
                  {p.error && <div className="text-danger">{p.error}</div>}
                </div>
                <CButton
                  size="sm"
                  color="danger"
                  variant="ghost"
                  disabled={subiendo}
                  aria-label={`Quitar ${p.file.name}`}
                  onClick={() => quitar(p.clave)}
                >
                  Quitar
                </CButton>
              </CListGroupItem>
            ))}
          </CListGroup>
        )}
        <CRow className="g-2">
          <CCol md={6}>
            <CFormLabel htmlFor={`anexar-fecha-${orden.id}`}>Fecha del reporte (opcional)</CFormLabel>
            <CFormInput
              id={`anexar-fecha-${orden.id}`}
              type="date"
              value={resultedOn}
              disabled={subiendo}
              onChange={(e) => setResultedOn(e.target.value)}
            />
          </CCol>
          <CCol md={6}>
            <CFormLabel htmlFor={`anexar-lab-${orden.id}`}>Quién lo emitió (opcional)</CFormLabel>
            <CFormInput
              id={`anexar-lab-${orden.id}`}
              value={provider}
              disabled={subiendo}
              placeholder="Ej. Laboratorio Central"
              onChange={(e) => setProvider(e.target.value)}
            />
          </CCol>
        </CRow>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" disabled={subiendo} onClick={onClose}>
          Cerrar
        </CButton>
        <CButton
          color="primary"
          disabled={subiendo || archivos.length === 0}
          onClick={() => void subir()}
          data-tour="anexar-guardar"
        >
          {subiendo ? (
            <CSpinner size="sm" />
          ) : archivos.length > 1 ? (
            `Anexar ${archivos.length} archivos`
          ) : (
            'Anexar'
          )}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default AnexarResultadoModal
