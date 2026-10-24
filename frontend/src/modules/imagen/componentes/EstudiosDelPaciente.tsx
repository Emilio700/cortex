/**
 * Los estudios DICOM del paciente, dentro de la pestaña Imágenes.
 *
 * Convive con la galería que ya existía: los documentos y las fotos se siguen
 * leyendo igual, y aquí aparecen los estudios que se pudieron abrir con todas
 * sus series. La diferencia se dice en pantalla: un estudio DICOM se recorre
 * corte por corte y se mide; una foto de la pantalla, no.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CAlert, CButton, CSpinner } from '@coreui/react-pro'

import { mensajeDeError } from '../../../shared/utils/errors'
import { estadoDeEstudio, resumenDeEstudio, type EstudioDicom } from '../dominio/tipos'
import { estudiosApi } from '../servicios/estudiosApi'

export default function EstudiosDelPaciente({ patientId }: { patientId: number }) {
  const [estudios, setEstudios] = useState<EstudioDicom[] | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const selector = useRef<HTMLInputElement>(null)
  const navegar = useNavigate()

  const cargar = useCallback(async () => {
    try {
      setEstudios(await estudiosApi.listar(patientId))
      setError(null)
    } catch (fallo) {
      setError(mensajeDeError(fallo))
    }
  }, [patientId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const subir = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return
    setSubiendo(true)
    setError(null)
    setAviso(null)
    try {
      const lista = Array.from(archivos)
      const esZip = lista.length === 1 && /\.zip$/i.test(lista[0].name)
      const resultado = esZip
        ? await estudiosApi.subirZip(patientId, lista[0])
        : await estudiosApi.subirArchivos(patientId, lista)

      if (resultado.creados.length > 0) {
        setAviso(
          resultado.creados.length === 1
            ? 'Estudio guardado.'
            : `Se guardaron ${resultado.creados.length} estudios.`
        )
      } else if (resultado.ya_existentes.length > 0) {
        setAviso('Ese estudio ya estaba en el expediente; no se duplicó.')
      }
      const descartados = resultado.archivos_descartados
      if (descartados > 0) {
        setAviso(
          `${descartados} archivo(s) no se pudieron leer. Si eran fotos o un PDF, súbelos como documento.`
        )
      }
      await cargar()
    } catch (fallo) {
      setError(mensajeDeError(fallo))
    } finally {
      setSubiendo(false)
      if (selector.current) selector.current.value = ''
    }
  }

  return (
    <section className="mb-4" data-tour="estudios-dicom">
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-2">
        <div>
          <h6 className="mb-0">Estudios de imagen (DICOM)</h6>
          <small className="text-body-secondary">
            El estudio completo, con todas sus series y sus mediciones. No es una foto del
            estudio: es el estudio.
          </small>
        </div>
        <div>
          <input
            ref={selector}
            type="file"
            multiple
            accept=".zip,.dcm,.ima,.img"
            className="d-none"
            onChange={(evento) => void subir(evento.target.files)}
          />
          <CButton
            size="sm"
            color="primary"
            variant="outline"
            disabled={subiendo}
            onClick={() => selector.current?.click()}
          >
            {subiendo ? <CSpinner size="sm" /> : 'Subir estudio'}
          </CButton>
        </div>
      </div>

      {error && (
        <CAlert color="danger" className="py-2">
          {error}
        </CAlert>
      )}
      {aviso && (
        <CAlert color="info" className="py-2">
          {aviso}
        </CAlert>
      )}

      {estudios === null ? (
        <CSpinner size="sm" />
      ) : estudios.length === 0 ? (
        <p className="text-body-secondary mb-0">
          Todavía no hay estudios DICOM. Si el paciente trae un CD, copia la carpeta al equipo y
          súbela aquí: los cortes se detectan por su contenido, no por la extensión.
        </p>
      ) : (
        <ul className="list-unstyled mb-0">
          {estudios.map((estudio) => {
            const estado = estadoDeEstudio(estudio)
            return (
              <li
                key={estudio.id}
                className="d-flex flex-wrap gap-2 align-items-center justify-content-between border-bottom py-2"
              >
                <div>
                  <Link
                    className="fw-semibold"
                    to={`/pacientes/${patientId}/estudios/${estudio.id}`}
                  >
                    {estudio.study_description ?? 'Estudio de imagen'}
                  </Link>
                  <div className="small text-body-secondary">{resumenDeEstudio(estudio)}</div>
                  {estado.tono !== 'ok' && (
                    <div className="small text-warning-emphasis">{estado.texto}</div>
                  )}
                </div>
                <CButton
                  size="sm"
                  color="primary"
                  variant="ghost"
                  onClick={() => navegar(`/pacientes/${patientId}/estudios/${estudio.id}`)}
                >
                  Abrir visor
                </CButton>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
