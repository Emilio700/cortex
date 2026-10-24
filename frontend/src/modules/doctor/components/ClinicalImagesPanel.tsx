import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormTextarea,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilImage, cilPlus, cilReload } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { useAuth } from '../../../shared/context/AuthContext'
import type { ClinicalImage, ClinicalImageCategory } from '../types/clinicalImage'
import { formatearInstante, ahoraParaCampoFechaHora, instanteDesdeHoraDelConsultorio } from '../../../shared/utils/date'
import VisorDocumentos, { type ArchivoVisor } from '../../../shared/components/VisorDocumentos'

const CATEGORY_LABELS: Record<ClinicalImageCategory, string> = {
  clinical_photo: 'Fotografía clínica',
  reference: 'Imagen de referencia',
  ultrasound: 'Ultrasonido / estudio',
  procedure: 'Procedimiento',
  other: 'Otra imagen clínica',
}

// En hora del consultorio: con toISOString() se prellenaba la hora UTC (7 h de adelanto).
const dateTimeInputValue = () => ahoraParaCampoFechaHora()
const formatDate = (value: string) => formatearInstante(value, { dateStyle: 'medium', timeStyle: 'short' })

interface ClinicalImagesPanelProps {
  patientId: number
  appointmentId?: number
  /**
   * En el expediente la galería es la combinada de la pestaña Imágenes (plan
   * 32, punto 6); aquí queda solo el formulario para agregar una foto.
   */
  mostrarGaleria?: boolean
  onSubida?: () => void
}

const ClinicalImagePreview = ({ image, onAbrir }: { image: ClinicalImage; onAbrir: () => void }) => {
  const containerRef = useRef<HTMLElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element || requested) return
    const load = () => setRequested(true)
    if (!('IntersectionObserver' in window)) {
      load()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          load()
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [requested])

  useEffect(() => {
    if (!requested) return
    let active = true
    let objectUrl: string | null = null
    void apiClient.get(`/clinical-images/${image.id}/thumbnail`, { responseType: 'blob' })
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data)
        if (active) setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image.id, requested])

  return (
    // La miniatura recorta la imagen (4:3, «cover») y antes no había manera de
    // verla completa: pulsarla no hacía nada (plan 29, lote 6). Ahora abre el
    // visor, con zoom y descarga, igual que los documentos.
    <button
      type="button"
      ref={containerRef as unknown as React.Ref<HTMLButtonElement>}
      className="tarjeta-clicable bg-body-tertiary d-flex align-items-center justify-content-center w-100 border-0 p-0"
      style={{ aspectRatio: '4 / 3' }}
      onClick={onAbrir}
      aria-label={`Ver imagen completa: ${image.caption || image.body_region || image.file_name}`}
    >
      {url ? <img src={url} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} /> : <CSpinner size="sm" />}
    </button>
  )
}

const ClinicalImagesPanel = ({ patientId, appointmentId, mostrarGaleria = true, onSubida }: ClinicalImagesPanelProps) => {
  const { user } = useAuth()
  const [images, setImages] = useState<ClinicalImage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [category, setCategory] = useState<ClinicalImageCategory>('clinical_photo')
  const [bodyRegion, setBodyRegion] = useState('')
  const [caption, setCaption] = useState('')
  const [takenAt, setTakenAt] = useState(dateTimeInputValue())
  const [consent, setConsent] = useState(false)
  const [isReference, setIsReference] = useState(false)
  const canUpload = user?.role === 'doctor' || user?.role === 'master'
  const [viendo, setViendo] = useState<number | null>(null)
  // Cambia al guardar: vuelve a montar el campo de archivo para que no siga
  // mostrando el nombre de la foto que ya se subió.
  const [campoArchivo, setCampoArchivo] = useState(0)
  const archivosDelVisor = useMemo<ArchivoVisor[]>(
    () =>
      images.map((imagen) => ({
        clave: `imagen-clinica-${imagen.id}`,
        nombre: imagen.caption || imagen.body_region || imagen.file_name,
        mime: imagen.mime_type,
        cargar: async () =>
          (await apiClient.get(`/clinical-images/${imagen.id}/download`, { responseType: 'blob' })).data as Blob,
      })),
    [images],
  )

  const loadImages = useCallback(async (append = false, skip = 0) => {
    setLoading(true)
    setError(null)
    try {
      const pageSize = 18
      const response = await apiClient.get<ClinicalImage[]>(`/clinical-images/patient/${patientId}`, {
        params: { skip: append ? skip : 0, limit: pageSize + 1 },
      })
      const page = response.data.slice(0, pageSize)
      setHasMore(response.data.length > pageSize)
      setImages((current) => append ? [...current, ...page] : page)
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible cargar las imágenes clínicas.')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    if (mostrarGaleria) void loadImages()
    else setLoading(false)
  }, [loadImages, mostrarGaleria])

  const uploadImage = async () => {
    if (!selectedFile) {
      setError('Selecciona o toma una imagen antes de guardar.')
      return
    }
    if (!consent) {
      setError('Confirma el consentimiento antes de almacenar una imagen clínica.')
      return
    }
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('patient_id', String(patientId))
    formData.append('category', category)
    formData.append('consent_obtained', 'true')
    formData.append('taken_at', instanteDesdeHoraDelConsultorio(takenAt))
    formData.append('is_reference', String(isReference))
    formData.append('file', selectedFile)
    if (appointmentId) formData.append('appointment_id', String(appointmentId))
    if (bodyRegion.trim()) formData.append('body_region', bodyRegion.trim())
    if (caption.trim()) formData.append('caption', caption.trim())
    try {
      await apiClient.post('/clinical-images/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSelectedFile(null)
      setCampoArchivo((n) => n + 1)
      setBodyRegion('')
      setCaption('')
      setTakenAt(dateTimeInputValue())
      setConsent(false)
      setIsReference(false)
      if (mostrarGaleria) await loadImages()
      onSubida?.()
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'No fue posible guardar la imagen clínica.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      {error && <CAlert color="danger" dismissible onClose={() => setError(null)}>{error}</CAlert>}
      {canUpload && <CCard className="border-0 shadow-sm">
        <CCardBody>
          <div className="d-flex align-items-center gap-2 mb-3"><CIcon icon={cilPlus} className="text-primary" /><h3 className="h5 mb-0">Agregar imagen clínica</h3></div>
          <CAlert color="info" className="small">La imagen quedará vinculada a esta paciente y consulta. Confirma consentimiento y evita incluir información no necesaria.</CAlert>
          <CRow className="g-3">
            <CCol md={6}>
              <CFormLabel htmlFor="clinical-image-file">Tomar foto o seleccionar imagen</CFormLabel>
              <CFormInput key={campoArchivo} id="clinical-image-file" type="file" accept="image/jpeg,image/png" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
              {selectedFile && <small className="text-body-secondary d-block mt-1">{selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(1)} MB</small>}
            </CCol>
            <CCol md={6}>
              <CFormLabel htmlFor="clinical-image-category">Categoría</CFormLabel>
              <CFormSelect id="clinical-image-category" value={category} onChange={(event) => setCategory(event.target.value as ClinicalImageCategory)}>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={6}><CFormLabel htmlFor="clinical-image-region">Región / referencia</CFormLabel><CFormInput id="clinical-image-region" maxLength={100} value={bodyRegion} onChange={(event) => setBodyRegion(event.target.value)} placeholder="Ej. mama izquierda, vulva, resultado externo" /></CCol>
            <CCol md={6}><CFormLabel htmlFor="clinical-image-date">Fecha y hora de captura</CFormLabel><CFormInput id="clinical-image-date" type="datetime-local" value={takenAt} onChange={(event) => setTakenAt(event.target.value)} /></CCol>
            <CCol xs={12}><CFormLabel htmlFor="clinical-image-caption">Comentario clínico</CFormLabel><CFormTextarea id="clinical-image-caption" rows={2} maxLength={2000} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Contexto o hallazgo que quieres conservar." /></CCol>
            <CCol xs={12} className="d-flex flex-wrap gap-3"><CFormCheck id="clinical-image-consent" checked={consent} onChange={(event) => setConsent(event.target.checked)} label="Confirmo que existe consentimiento para almacenar esta imagen clínica." /><CFormCheck id="clinical-image-reference" checked={isReference} onChange={(event) => setIsReference(event.target.checked)} label="Usar como imagen de referencia para comparativas." /></CCol>
            <CCol xs={12}><CButton color="primary" disabled={uploading} onClick={() => void uploadImage()}>{uploading ? 'Guardando...' : 'Guardar imagen clínica'}</CButton></CCol>
          </CRow>
        </CCardBody>
      </CCard>}
      {mostrarGaleria && <CCard className="border-0 shadow-sm"><CCardBody>
        <div className="d-flex justify-content-between align-items-center mb-3"><div className="d-flex align-items-center gap-2"><CIcon icon={cilImage} className="text-primary" /><h5 className="mb-0">Imágenes clínicas</h5><CBadge color="primary">{images.length}</CBadge></div><CButton color="light" size="sm" onClick={() => void loadImages()} title="Recargar imágenes clínicas" aria-label="Recargar imágenes clínicas"><CIcon icon={cilReload} /></CButton></div>
        {loading && images.length === 0 ? <div className="text-center py-4"><CSpinner color="primary" /></div> : images.length === 0 ? <CAlert color="light" className="mb-0">No hay imágenes clínicas registradas.</CAlert> : <><CRow className="g-3">{images.map((image) => <CCol sm={6} lg={4} key={image.id}><div className="border rounded overflow-hidden h-100"><ClinicalImagePreview image={image} onAbrir={() => setViendo(images.indexOf(image))} /><div className="p-2 small"><div className="d-flex flex-wrap gap-1 mb-1"><CBadge color="light" textColor="dark">{CATEGORY_LABELS[image.category]}</CBadge>{image.is_reference && <CBadge color="info">Referencia</CBadge>}</div>{image.body_region && <div className="fw-semibold">{image.body_region}</div>}{image.caption && <div className="text-body-secondary">{image.caption}</div>}<div className="text-body-secondary mt-1">{formatDate(image.taken_at)}</div></div></div></CCol>)}</CRow>{hasMore && <CButton color="secondary" variant="outline" className="w-100 mt-3" disabled={loading} onClick={() => void loadImages(true, images.length)}>{loading ? 'Cargando…' : 'Cargar más imágenes'}</CButton>}</>}
      </CCardBody></CCard>}
      <VisorDocumentos
        visible={viendo !== null}
        onClose={() => setViendo(null)}
        titulo="Imágenes clínicas"
        archivos={archivosDelVisor}
        inicial={viendo ?? 0}
      />
    </div>
  )
}

export default ClinicalImagesPanel
