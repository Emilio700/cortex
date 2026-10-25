/**
 * Sistema → Estado de servicios (base-modulos-extra).
 *
 * Solo muestra lo que averigua el servidor: es quien ve la red donde viven
 * Orthanc, Whisper y compañía. Si la consulta falla, se dice y no se pinta
 * ningún estado: un «en línea» inventado es peor que no saber.
 */
import { useCallback, useEffect, useState } from 'react'
import { CAlert, CBadge, CButton, CCard, CCardBody, CCol, CRow, CSpinner } from '@coreui/react-pro'
import { cilApplications } from '@coreui/icons'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { mensajeDeError } from '../../../shared/utils/errors'
import { presentacionDeEstado, type ServicioAuxiliar } from '../dominio/sistema'
import { sistemaApi } from '../servicios/sistemaApi'

type Carga =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; servicios: ServicioAuxiliar[] }

const EstadoServiciosPage = () => {
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })

  const revisar = useCallback(async () => {
    setCarga({ estado: 'cargando' })
    try {
      const servicios = await sistemaApi.estadoDeServicios()
      setCarga({ estado: 'listo', servicios })
    } catch (err) {
      setCarga({
        estado: 'error',
        mensaje: mensajeDeError(err, 'No se pudo consultar el estado de los servicios.'),
      })
    }
  }, [])

  useEffect(() => {
    void revisar()
  }, [revisar])

  return (
    <>
      <EncabezadoPantalla
        titulo="Estado de servicios"
        descripcion="Los servicios del servidor que necesitan algunos módulos: imagen, dictado e IA."
        icono={cilApplications}
        acciones={
          <CButton
            color="primary"
            data-tour="servicios-estado-revisar"
            disabled={carga.estado === 'cargando'}
            onClick={() => void revisar()}
          >
            Volver a revisar
          </CButton>
        }
      />

      {carga.estado === 'cargando' && (
        <div className="text-center py-5">
          <CSpinner color="primary" aria-label="Revisando servicios" />
        </div>
      )}

      {carga.estado === 'error' && <CAlert color="danger">{carga.mensaje}</CAlert>}

      {carga.estado === 'listo' && (
        <CRow className="g-3" data-tour="servicios-estado-lista">
          {carga.servicios.map((servicio) => {
            const { texto, color } = presentacionDeEstado(servicio.estado)
            return (
              <CCol key={servicio.id} xs={12} md={6} xl={4}>
                <CCard className="h-100">
                  <CCardBody>
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <h2 className="h6 mb-1">{servicio.nombre}</h2>
                      <CBadge color={color}>{texto}</CBadge>
                    </div>
                    <p className="text-body-secondary small mb-2">{servicio.para_que}</p>
                    <p className="small mb-0">{servicio.detalle}</p>
                  </CCardBody>
                </CCard>
              </CCol>
            )
          })}
        </CRow>
      )}
    </>
  )
}

export default EstadoServiciosPage
