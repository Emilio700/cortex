/**
 * Un solo modal para subir cualquier archivo de un paciente (plan 32, punto 6).
 *
 * La pregunta clave va primero: «¿Es el resultado de un estudio que se le
 * pidió?». Si sí, se elige su orden pendiente y el archivo se adjunta a la
 * orden: le llega al médico como resultado. Si no, se dice qué es: un
 * estudio de otro lugar (va a Estudios, marcado como externo), una referencia
 * de otro médico o, para el médico, otro archivo (van a Documentos). Antes
 * había dos maneras de «subir un resultado» que hacían cosas distintas (C4).
 *
 * Solo se dice «subido» con la respuesta del servidor; si algo falla, el
 * modal se queda abierto con el motivo.
 */
import { useEffect, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'

import { apiClient } from '../../shared/services/api'
import { useAuth } from '../../shared/context/AuthContext'
import { mensajeDeError } from '../../shared/utils/errors'
import { formatearFechaISO, hoyLocalISO } from '../../shared/utils/date'
import BotonAyudaContextual from '../../shared/tutoriales/BotonAyudaContextual'
import SelectorEstudio, { seleccionVacia } from '../doctor/components/SelectorEstudio'
import { textoEstudio, type SeleccionEstudio } from '../doctor/utils/catalogoEstudios'
import { TIPOS_DE_ARCHIVO_ACEPTADOS, anexarArchivoDeResultado } from '../doctor/utils/anexarResultado'
import type { OrdenPendienteResultado } from '../secretaria/hooks/useOrdenesResultado'

type Que = 'externo' | 'referencia' | 'otro'

/** Los nombres de los tipos, iguales aquí y en la lista (C9). */
export const NOMBRE_DE_TIPO: Record<string, string> = {
  external_note: 'Referencia o nota de otro médico',
  other: 'Otro archivo',
  lab_result: 'Resultado de laboratorio',
  imaging_study: 'Estudio de imagen',
}

const CATEGORIAS_EXTERNAS = [
  { valor: 'laboratory', etiqueta: 'Laboratorio' },
  { valor: 'imaging', etiqueta: 'Imagen (ultrasonido, rayos X, mastografía…)' },
  { valor: 'other', etiqueta: 'Otro' },
]

const MAXIMO = 15 * 1024 * 1024
const ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png']

interface Props {
  visible: boolean
  patientId: number
  patientName?: string
  onClose: () => void
  /** Qué se subió, para que quien abrió el modal refresque lo suyo. */
  onSubido: (destino: 'estudios' | 'documentos', mensaje: string) => void
}

export default function SubirArchivoModal({ visible, patientId, patientName, onClose, onSubido }: Props) {
  const { can } = useAuth()
  const puedeAdjuntar = can('clinical_tracking.attach_result')
  const puedeDocumentos = can('documents.upload')
  const esClinica = can('medical_history.read')

  const [esResultado, setEsResultado] = useState<boolean | null>(null)
  const [que, setQue] = useState<Que>('externo')
  const [ordenes, setOrdenes] = useState<OrdenPendienteResultado[] | null>(null)
  const [errorOrdenes, setErrorOrdenes] = useState<string | null>(null)
  const [ordenId, setOrdenId] = useState<number | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [fecha, setFecha] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [estudio, setEstudio] = useState<SeleccionEstudio>(seleccionVacia())
  const [categoria, setCategoria] = useState('laboratory')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setEsResultado(puedeAdjuntar ? null : false)
    setQue(puedeAdjuntar ? 'externo' : 'referencia')
    setOrdenId(null)
    setArchivo(null)
    setFecha('')
    setProveedor('')
    setTitulo('')
    setDescripcion('')
    setEstudio(seleccionVacia())
    setError(null)
  }, [visible, puedeAdjuntar])

  useEffect(() => {
    if (!visible || esResultado !== true || ordenes !== null) return
    apiClient
      .get('/clinical-tracking/orders/awaiting-result', { params: { patient_id: patientId, limit: 100 } })
      .then(({ data }) => setOrdenes(data.items))
      .catch((err) => setErrorOrdenes(mensajeDeError(err, 'No se pudieron cargar sus órdenes pendientes.')))
  }, [visible, esResultado, ordenes, patientId])

  const elegirArchivo = (f: File | undefined) => {
    setError(null)
    if (!f) return setArchivo(null)
    if (!ACEPTADOS.includes(f.type) || f.size > MAXIMO) {
      setArchivo(null)
      setError('Selecciona un PDF, JPG o PNG de máximo 15 MB.')
      return
    }
    setArchivo(f)
    if (!titulo) setTitulo(f.name.replace(/\.[^.]+$/, ''))
  }

  const nombreEstudio = estudio.manual !== undefined ? (estudio.manual ?? '').trim() : textoEstudio(estudio)
  const listo =
    !!archivo &&
    (esResultado === true
      ? ordenId !== null
      : esResultado === false &&
        (que === 'externo' ? nombreEstudio.length >= 2 : titulo.trim().length >= 2))

  const guardar = async () => {
    if (!archivo || !listo) return
    setGuardando(true)
    setError(null)
    try {
      if (esResultado) {
        const orden = ordenes?.find((o) => o.order_id === ordenId)
        await anexarArchivoDeResultado(ordenId!, archivo, {
          resulted_on: fecha || undefined,
          reporting_provider: proveedor || undefined,
        })
        onSubido('estudios', `Se adjuntó el resultado a ${orden?.study_name ?? 'su orden'}. El médico lo revisará.`)
      } else if (que === 'externo') {
        const datos = new FormData()
        datos.append('patient_id', String(patientId))
        datos.append('study_name', nombreEstudio)
        datos.append('category', estudio.grupo ? 'imaging' : categoria)
        if (estudio.grupo) datos.append('catalog_code', estudio.grupo.clave)
        if (fecha) datos.append('resulted_on', fecha)
        if (proveedor) datos.append('reporting_provider', proveedor)
        datos.append('file', archivo)
        await apiClient.post('/clinical-tracking/external-studies', datos, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        onSubido('estudios', `Se guardó «${nombreEstudio}» como estudio de otro lugar, en Estudios.`)
      } else {
        const datos = new FormData()
        datos.append('patient_id', String(patientId))
        datos.append('document_type', que === 'referencia' ? 'external_note' : 'other')
        datos.append('title', titulo.trim())
        if (descripcion.trim()) datos.append('description', descripcion.trim())
        datos.append('file', archivo)
        await apiClient.post('/documents/upload', datos, { headers: { 'Content-Type': 'multipart/form-data' } })
        onSubido('documentos', `Se guardó «${titulo.trim()}» en Documentos.`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error && !(err as { response?: unknown }).response ? err.message : mensajeDeError(err, 'No se subió el archivo.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <CModal visible={visible} onClose={() => !guardando && onClose()} alignment="center" backdrop="static" size="lg"
      aria-labelledby="subir-archivo-titulo">
      <CModalHeader closeButton={!guardando}>
        <CModalTitle as="h2" className="h5" id="subir-archivo-titulo">
          Subir archivo{patientName ? ` de ${patientName}` : ''}
        </CModalTitle>
        <BotonAyudaContextual recorridoId="subir-archivo" />
      </CModalHeader>
      <CModalBody data-tour="subir-archivo-formulario">
        {error && <CAlert color="danger" role="alert">{error}</CAlert>}

        {puedeAdjuntar && (
          <fieldset className="mb-3" data-tour="subir-archivo-pregunta">
            <legend className="fs-6 fw-semibold">¿Es el resultado de un estudio que se le pidió?</legend>
            <CFormCheck type="radio" name="es-resultado" id="es-resultado-si" label="Sí, de una orden de Cortex"
              checked={esResultado === true} onChange={() => setEsResultado(true)} disabled={guardando} />
            <CFormCheck type="radio" name="es-resultado" id="es-resultado-no" label="No"
              checked={esResultado === false} onChange={() => setEsResultado(false)} disabled={guardando} />
          </fieldset>
        )}

        {esResultado === true && (
          <div className="mb-3">
            <CFormLabel htmlFor="subir-orden">Su orden pendiente</CFormLabel>
            {errorOrdenes ? (
              <CAlert color="danger" className="py-2">{errorOrdenes}</CAlert>
            ) : ordenes === null ? (
              <div><CSpinner size="sm" /></div>
            ) : ordenes.length === 0 ? (
              <CAlert color="light" className="py-2 mb-0">
                No tiene órdenes esperando resultado. Si lo trajo de otro lugar, responde «No» y elige «Estudio de otro lugar».
              </CAlert>
            ) : (
              <CFormSelect id="subir-orden" value={ordenId ?? ''} disabled={guardando}
                onChange={(e) => setOrdenId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Elige el estudio…</option>
                {ordenes.map((o) => (
                  <option key={o.order_id} value={o.order_id}>
                    {o.study_name} · Orden n.º {o.order_id} · {formatearFechaISO(o.requested_on)}
                  </option>
                ))}
              </CFormSelect>
            )}
          </div>
        )}

        {esResultado === false && (
          <fieldset className="mb-3" data-tour="subir-archivo-que">
            <legend className="fs-6 fw-semibold">¿Qué es?</legend>
            {puedeAdjuntar && (
              <CFormCheck type="radio" name="que-es" id="que-externo" checked={que === 'externo'} disabled={guardando}
                onChange={() => setQue('externo')}
                label="Estudio de otro lugar (laboratorio o imagen que trajo de otro médico)" />
            )}
            {puedeDocumentos && (
              <CFormCheck type="radio" name="que-es" id="que-referencia" checked={que === 'referencia'} disabled={guardando}
                onChange={() => setQue('referencia')} label={NOMBRE_DE_TIPO.external_note} />
            )}
            {puedeDocumentos && esClinica && (
              <CFormCheck type="radio" name="que-es" id="que-otro" checked={que === 'otro'} disabled={guardando}
                onChange={() => setQue('otro')} label={NOMBRE_DE_TIPO.other} />
            )}
            <div className="form-text">Una foto de la consulta se sube en la pestaña Imágenes.</div>
          </fieldset>
        )}

        {esResultado === false && que === 'externo' && (
          <div className="mb-3">
            <SelectorEstudio seleccion={estudio} onChange={setEstudio} disabled={guardando} />
            {estudio.manual !== undefined && (
              <div className="mt-2">
                <CFormLabel htmlFor="subir-categoria">Tipo de estudio</CFormLabel>
                <CFormSelect id="subir-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={guardando}>
                  {CATEGORIAS_EXTERNAS.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
                </CFormSelect>
              </div>
            )}
          </div>
        )}

        {esResultado === false && que !== 'externo' && (
          <>
            <div className="mb-3">
              <CFormLabel htmlFor="subir-titulo">Título</CFormLabel>
              <CFormInput id="subir-titulo" value={titulo} maxLength={255} disabled={guardando}
                onChange={(e) => setTitulo(e.target.value)} placeholder="Por ejemplo: referencia del Dr. Pérez" />
            </div>
            <div className="mb-3">
              <CFormLabel htmlFor="subir-descripcion">Nota (opcional)</CFormLabel>
              <CFormTextarea id="subir-descripcion" rows={2} value={descripcion} disabled={guardando}
                onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </>
        )}

        {esResultado !== null && (
          <>
            <div className="mb-3" data-tour="subir-archivo-archivo">
              <CFormLabel htmlFor="subir-archivo">Archivo (PDF, JPG o PNG, máximo 15 MB)</CFormLabel>
              <CFormInput id="subir-archivo" type="file" accept={TIPOS_DE_ARCHIVO_ACEPTADOS} disabled={guardando}
                onChange={(e) => elegirArchivo((e.target as HTMLInputElement).files?.[0])} />
            </div>
            {(esResultado || que === 'externo') && (
              <div className="d-flex flex-wrap gap-3">
                <div>
                  <CFormLabel htmlFor="subir-fecha">Fecha del estudio (opcional)</CFormLabel>
                  <CFormInput id="subir-fecha" type="date" max={hoyLocalISO()} value={fecha} disabled={guardando}
                    onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div className="flex-grow-1">
                  <CFormLabel htmlFor="subir-proveedor">Laboratorio o médico (opcional)</CFormLabel>
                  <CFormInput id="subir-proveedor" value={proveedor} maxLength={255} disabled={guardando}
                    onChange={(e) => setProveedor(e.target.value)} />
                </div>
              </div>
            )}
          </>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</CButton>
        <CButton color="primary" onClick={() => void guardar()} disabled={!listo || guardando} data-tour="subir-archivo-guardar">
          {guardando && <CSpinner size="sm" className="me-2" />}
          Subir
        </CButton>
      </CModalFooter>
    </CModal>
  )
}
