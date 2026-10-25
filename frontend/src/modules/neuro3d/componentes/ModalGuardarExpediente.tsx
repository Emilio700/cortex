/**
 * Guardar la captura del atlas en el expediente del paciente.
 *
 * Regla del sistema: si el servidor no lo guardó, la pantalla no dice que sí.
 * El botón queda en «Guardando…» hasta la respuesta; sólo con ella aparece
 * «Guardado en el expediente». Si falla, se dice por qué y la captura no se
 * pierde: se puede reintentar o descargar.
 *
 * La pantalla la monta al abrirla y la desmonta al cerrarla: cada vez empieza
 * sin el consentimiento marcado.
 */
import { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormCheck,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
} from '@coreui/react-pro'
import { mensajeDeError } from '../../../shared/utils/errors'
import { enMayusculas } from '../../../shared/utils/mayusculas'

interface Props {
  visible: boolean
  imagen: Blob | null
  nombrePaciente: string | null
  descripcionInicial: string
  alCerrar: () => void
  alDescargar: () => void
  guardar: (datos: { descripcion: string; consentimiento: boolean }) => Promise<void>
}

type Estado = { tipo: 'editando' } | { tipo: 'guardando' } | { tipo: 'guardado' } | { tipo: 'error'; mensaje: string }

export default function ModalGuardarExpediente(p: Props) {
  const [descripcion, setDescripcion] = useState(p.descripcionInicial)
  const [consentimiento, setConsentimiento] = useState(false)
  const [estado, setEstado] = useState<Estado>({ tipo: 'editando' })
  const [vista, setVista] = useState<string | null>(null)

  useEffect(() => {
    if (!p.imagen) {
      setVista(null)
      return
    }
    const url = URL.createObjectURL(p.imagen)
    setVista(url)
    return () => URL.revokeObjectURL(url)
  }, [p.imagen])

  const guardar = async () => {
    if (!consentimiento) {
      setEstado({ tipo: 'error', mensaje: 'Confirma el consentimiento antes de guardar la imagen en el expediente.' })
      return
    }
    setEstado({ tipo: 'guardando' })
    try {
      await p.guardar({ descripcion, consentimiento })
      setEstado({ tipo: 'guardado' })
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: mensajeDeError(err, 'No se pudo guardar la imagen en el expediente. Inténtalo de nuevo o descárgala.') })
    }
  }

  const guardando = estado.tipo === 'guardando'
  return (
    <CModal visible={p.visible} onClose={p.alCerrar} alignment="center" size="lg" backdrop={guardando ? 'static' : true}>
      <CModalHeader closeButton={!guardando}>
        <CModalTitle>Guardar en el expediente</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {p.nombrePaciente && (
          <p className="mb-2">
            Paciente: <b>{p.nombrePaciente}</b>
          </p>
        )}
        {vista && <img src={vista} alt="Vista previa de la captura del atlas" className="atlas-guardar__vista" />}
        <p className="small text-body-secondary mt-2">
          Se guarda como «Imagen de referencia» en la pestaña Imágenes. La imagen no lleva el nombre del paciente.
        </p>
        <label className="form-label" htmlFor="atlas-guardar-descripcion">Descripción</label>
        <CFormTextarea
          id="atlas-guardar-descripcion"
          className="gems-campo"
          rows={3}
          maxLength={2000}
          value={descripcion}
          disabled={guardando || estado.tipo === 'guardado'}
          onChange={enMayusculas((valor) => setDescripcion(valor))}
        />
        <CFormCheck
          className="mt-3"
          id="atlas-guardar-consentimiento"
          checked={consentimiento}
          disabled={guardando || estado.tipo === 'guardado'}
          onChange={(e) => setConsentimiento(e.target.checked)}
          label="Confirmo que existe consentimiento para almacenar esta imagen en el expediente."
        />
        {estado.tipo === 'guardado' && (
          <CAlert color="success" className="mt-3 mb-0" role="status">
            Guardado en el expediente.
          </CAlert>
        )}
        {estado.tipo === 'error' && (
          <CAlert color="danger" className="mt-3 mb-0" role="alert">
            {estado.mensaje}
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={p.alDescargar} disabled={!p.imagen}>
          Descargar PNG
        </CButton>
        {estado.tipo === 'guardado' ? (
          <CButton color="primary" onClick={p.alCerrar}>
            Cerrar
          </CButton>
        ) : (
          <CButton color="primary" onClick={() => void guardar()} disabled={guardando || !p.imagen}>
            {guardando ? 'Guardando…' : 'Guardar en el expediente'}
          </CButton>
        )}
      </CModalFooter>
    </CModal>
  )
}
