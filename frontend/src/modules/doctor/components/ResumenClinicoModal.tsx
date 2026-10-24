/**
 * Resumen clínico en PDF (plan 32, punto 8).
 *
 * El médico elige las secciones y cuántas consultas, ve la vista previa (sin
 * folio, con la marca de vista previa) y solo entonces emite. El servidor
 * exige la constancia de esa vista previa con las mismas opciones: si la
 * doctora cambia algo, la vista previa se vuelve a pedir y el botón de emitir
 * espera a que llegue.
 *
 * Si el sistema no emitió, la pantalla no dice que sí: el aviso de éxito solo
 * sale con el folio que devolvió el servidor.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormCheck,
  CFormLabel,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'
import VisorDocumentos, { type ArchivoVisor } from '../../../shared/components/VisorDocumentos'
import BotonAyudaContextual from '../../../shared/tutoriales/BotonAyudaContextual'
import { emitirResumenClinico, pedirVistaPreviaResumen, SECCIONES_DEL_RESUMEN, type SeccionResumen } from '../utils/resumenClinico'

interface Props {
  visible: boolean
  onClose: () => void
  patientId: number
  patientName: string
}

const CONSULTAS = [1, 2, 3, 5, 10]

export const ResumenClinicoModal: React.FC<Props> = ({ visible, onClose, patientId, patientName }) => {
  const [secciones, setSecciones] = useState<SeccionResumen[]>(SECCIONES_DEL_RESUMEN.map((s) => s.clave))
  const [consultas, setConsultas] = useState(3)
  // La constancia de la vista previa que está a la vista, con sus opciones.
  const constancia = useRef<{ token: string; opciones: string } | null>(null)
  const [previaLista, setPreviaLista] = useState(false)
  const [emitiendo, setEmitiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emitido, setEmitido] = useState<{ folio: string; pdf: Blob } | null>(null)

  useEffect(() => {
    if (!visible) return
    setSecciones(SECCIONES_DEL_RESUMEN.map((s) => s.clave))
    setConsultas(3)
    setEmitido(null)
    setError(null)
  }, [visible])

  const opciones = JSON.stringify({ secciones, consultas })

  const archivos: ArchivoVisor[] = useMemo(() => {
    if (emitido) {
      return [{
        clave: `resumen-${emitido.folio}`,
        nombre: `Resumen_clinico_${emitido.folio}.pdf`,
        mime: 'application/pdf',
        cargar: async () => emitido.pdf,
      }]
    }
    return [{
      clave: `resumen-previa-${opciones}`,
      nombre: 'Resumen_clinico_vista_previa.pdf',
      mime: 'application/pdf',
      cargar: async () => {
        setPreviaLista(false)
        constancia.current = null
        const r = await pedirVistaPreviaResumen(patientId, secciones, consultas)
        constancia.current = { token: r.constancia, opciones }
        setPreviaLista(true)
        return r.pdf
      },
    }]
    // `opciones` resume secciones y consultas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones, patientId, emitido])

  const alternar = (clave: SeccionResumen) =>
    setSecciones((prev) => (prev.includes(clave) ? prev.filter((s) => s !== clave) : [...prev, clave]))

  const emitir = async () => {
    const vigente = constancia.current
    if (!vigente || vigente.opciones !== opciones) return
    setEmitiendo(true)
    setError(null)
    try {
      setEmitido(await emitirResumenClinico(patientId, secciones, consultas, vigente.token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir el resumen.')
    } finally {
      setEmitiendo(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} size="xl" aria-labelledby="titulo-resumen-clinico">
      <CModalHeader>
        <CModalTitle as="h2" className="h5" id="titulo-resumen-clinico">Resumen clínico de {patientName}</CModalTitle>
        <BotonAyudaContextual recorridoId="resumen-clinico" className="ms-auto me-2" />
      </CModalHeader>
      <CModalBody data-tour="resumen-formulario">
        {emitido ? (
          <CAlert color="success" role="status">
            Resumen emitido con folio <b>{emitido.folio}</b>. Ya quedó en la bitácora; imprímelo o descárgalo desde aquí.
          </CAlert>
        ) : (
          <div className="mb-3" data-tour="resumen-secciones">
            <CFormLabel className="fw-semibold d-block">Qué incluir</CFormLabel>
            <p className="small text-body-secondary mb-2">
              Los datos del paciente, la firma, la fecha y el folio van siempre. Lo que no esté capturado sale como «Sin registro».
            </p>
            <div className="d-flex flex-wrap gap-3">
              {SECCIONES_DEL_RESUMEN.map((s) => (
                <CFormCheck key={s.clave} id={`resumen-${s.clave}`} label={s.nombre}
                  checked={secciones.includes(s.clave)} onChange={() => alternar(s.clave)} />
              ))}
            </div>
            {secciones.includes('consultas') && (
              <div className="d-flex align-items-center gap-2 mt-2">
                <CFormLabel htmlFor="resumen-consultas" className="mb-0 small">Consultas a incluir</CFormLabel>
                <CFormSelect id="resumen-consultas" size="sm" style={{ maxWidth: 110 }} value={consultas}
                  onChange={(e) => setConsultas(Number(e.target.value))}>
                  {CONSULTAS.map((n) => <option key={n} value={n}>Últimas {n}</option>)}
                </CFormSelect>
              </div>
            )}
          </div>
        )}
        {error && <CAlert color="danger" role="alert">{error} El resumen no se emitió.</CAlert>}
        <div data-tour="resumen-vista-previa">
          <VisorDocumentos enLinea titulo={emitido ? 'Resumen emitido' : 'Vista previa'} archivos={archivos}
            imprimible={Boolean(emitido)} alto="60vh" />
        </div>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose}>{emitido ? 'Cerrar' : 'Cancelar'}</CButton>
        {!emitido && (
          <CButton color="primary" onClick={emitir} data-tour="resumen-emitir"
            disabled={!previaLista || emitiendo || constancia.current?.opciones !== opciones}>
            {emitiendo ? <><CSpinner size="sm" className="me-2" />Emitiendo…</> : 'Emitir con folio'}
          </CButton>
        )}
      </CModalFooter>
    </CModal>
  )
}

export default ResumenClinicoModal
