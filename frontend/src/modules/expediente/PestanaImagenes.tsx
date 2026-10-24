/**
 * Pestaña Imágenes del expediente (plan 32, punto 6): fotos de la consulta y
 * estudios de imagen en una sola galería, por fecha, con filtros por
 * categoría y año. Los datos no se mueven: el servidor lee las dos fuentes
 * (`GET /patients/{id}/imagenes`). Se abren en el visor de documentos.
 *
 * Quien sube fotos clínicas (el médico) tiene arriba el formulario de
 * siempre; un estudio de imagen se sube con «Subir archivo».
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CAlert, CBadge, CButton, CFormSelect, CSpinner } from '@coreui/react-pro'

import { apiClient } from '../../shared/services/api'
import { mensajeDeError } from '../../shared/utils/errors'
import { formatearInstante } from '../../shared/utils/date'
import VisorDocumentos, { type ArchivoVisor } from '../../shared/components/VisorDocumentos'
import ClinicalImagesPanel from '../doctor/components/ClinicalImagesPanel'
import EstudiosDelPaciente from '../imagen/componentes/EstudiosDelPaciente'
import { useAuth } from '../../shared/context/AuthContext'

export interface ImagenDePaciente {
  origen: 'consulta' | 'documento' | 'resultado'
  id: number
  categoria: string
  categoria_texto: string
  fecha: string
  titulo: string
  file_name: string
  mime_type?: string | null
  subido_por?: string | null
  appointment_id?: number | null
  order_id?: number | null
  descarga: string
}

const CATEGORIAS: [string, string][] = [
  ['', 'Todas las categorías'],
  ['foto_clinica', 'Foto clínica'],
  ['ultrasonido', 'Ultrasonido'],
  ['rayos_x', 'Rayos X'],
  ['mastografia', 'Mastografía'],
  ['procedimiento', 'Procedimiento'],
  ['estudio_de_imagen', 'Estudio de imagen'],
  ['referencia', 'Imagen de referencia'],
  ['otro', 'Otro'],
]
const ORIGEN: Record<ImagenDePaciente['origen'], string> = {
  consulta: 'De la consulta',
  documento: 'Traído de otro lugar',
  resultado: 'Resultado de orden',
}
const POR_PAGINA = 30

export default function PestanaImagenes({ patientId, appointmentId }: { patientId: number; appointmentId?: number }) {
  const { user } = useAuth()
  const subeFotos = user?.role === 'doctor' || user?.role === 'master'
  const [items, setItems] = useState<ImagenDePaciente[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [categoria, setCategoria] = useState('')
  const [anio, setAnio] = useState('')
  const [viendo, setViendo] = useState<number | null>(null)

  const cargar = useCallback(async (mas = false) => {
    setError(null)
    try {
      const respuesta = await apiClient.get<ImagenDePaciente[]>(`/patients/${patientId}/imagenes`, {
        params: {
          categoria: categoria || undefined,
          anio: anio || undefined,
          skip: mas ? items?.length ?? 0 : 0,
          limit: POR_PAGINA,
        },
      })
      setTotal(Number(respuesta.headers?.['x-total-count'] ?? respuesta.data.length) || 0)
      setItems((actual) => (mas ? [...(actual ?? []), ...respuesta.data] : respuesta.data))
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las imágenes.'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, categoria, anio])
  useEffect(() => { void cargar() }, [cargar])

  const anios = useMemo(() => {
    const actual = new Date().getFullYear()
    return Array.from({ length: 8 }, (_, i) => String(actual - i))
  }, [])

  const archivos: ArchivoVisor[] = (items ?? []).map((i) => ({
    clave: `${i.origen}-${i.id}`,
    nombre: i.titulo || i.file_name,
    mime: i.mime_type,
    cargar: async () => (await apiClient.get(i.descarga, { responseType: 'blob' })).data as Blob,
  }))

  return (
    <div className="d-flex flex-column gap-3">
      <EstudiosDelPaciente patientId={patientId} />
      {subeFotos && (
        <ClinicalImagesPanel
          patientId={patientId}
          appointmentId={appointmentId}
          mostrarGaleria={false}
          onSubida={() => void cargar()}
        />
      )}
      <section className="expediente-galeria" aria-label="Imágenes del paciente" data-tour="expediente-imagenes">
        <div className="expediente-galeria__filtros">
          <h3 className="h6 mb-0 me-auto">Imágenes {items ? <CBadge color="primary" className="ms-1">{total}</CBadge> : null}</h3>
          <label className="visually-hidden" htmlFor="imagenes-categoria">Categoría</label>
          <CFormSelect id="imagenes-categoria" size="sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </CFormSelect>
          <label className="visually-hidden" htmlFor="imagenes-anio">Año</label>
          <CFormSelect id="imagenes-anio" size="sm" value={anio} onChange={(e) => setAnio(e.target.value)}>
            <option value="">Todos los años</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </CFormSelect>
        </div>
        {error ? (
          <CAlert color="danger" className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-0">
            <span>{error}</span>
            <CButton color="danger" variant="outline" size="sm" onClick={() => void cargar()}>Reintentar</CButton>
          </CAlert>
        ) : items === null ? (
          <div className="text-center p-4"><CSpinner size="sm" /></div>
        ) : items.length === 0 ? (
          <CAlert color="light" className="mb-0">
            {categoria || anio ? 'No hay imágenes con esos filtros.' : 'No tiene imágenes registradas.'}
          </CAlert>
        ) : (
          <>
            <ul className="expediente-galeria__lista">
              {items.map((i, n) => (
                <li key={`${i.origen}-${i.id}`}>
                  <button type="button" className="expediente-galeria__item" onClick={() => setViendo(n)}>
                    <span className="expediente-galeria__categoria">{i.categoria_texto}</span>
                    <span className="expediente-galeria__titulo">{i.titulo}</span>
                    <span className="expediente-galeria__meta">
                      {formatearInstante(i.fecha, { dateStyle: 'medium' })} · {ORIGEN[i.origen]}
                      {i.subido_por ? ` · ${i.subido_por}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {items.length < total && (
              <CButton color="secondary" variant="outline" className="w-100" onClick={() => void cargar(true)}>
                Cargar más
              </CButton>
            )}
          </>
        )}
      </section>
      <VisorDocumentos
        visible={viendo !== null}
        onClose={() => setViendo(null)}
        titulo="Imágenes del paciente"
        archivos={archivos}
        inicial={viendo ?? 0}
      />
    </div>
  )
}
