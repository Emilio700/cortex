/**
 * Sistema → Módulos (base-modulos-extra).
 *
 * Un interruptor por módulo opcional ya construido. Tres reglas:
 *
 * - Solo se listan los módulos que existen (el servidor filtra por
 *   `disponible`). Un interruptor que enciende algo que no está construido sería
 *   una promesa falsa; sin ninguno, la pantalla lo dice.
 * - El interruptor muestra lo que confirmó el servidor, no lo que se pulsó. Si
 *   el guardado falla, se queda como estaba y se dice por qué.
 * - Apagar no borra nada: se dice en la pantalla para que nadie dude en hacerlo.
 */
import { useCallback, useEffect, useState } from 'react'
import { CAlert, CButton, CCard, CCardBody, CCol, CRow, CSpinner } from '@coreui/react-pro'
import { cilSettings } from '@coreui/icons'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { useAuth } from '../../../shared/context/AuthContext'
import type { ModuloDelConsultorio } from '../../../shared/services/modulos'
import { mensajeDeError } from '../../../shared/utils/errors'
import TarjetaModulo from '../componentes/TarjetaModulo'
import { sistemaApi } from '../servicios/sistemaApi'

type Carga =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; modulos: ModuloDelConsultorio[] }

const ModulosPage = () => {
  const { recargarModulos } = useAuth()
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [guardando, setGuardando] = useState<Record<string, boolean>>({})
  const [errores, setErrores] = useState<Record<string, string | null>>({})
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({})

  const cargar = useCallback(async () => {
    setCarga({ estado: 'cargando' })
    try {
      const { modulos } = await sistemaApi.obtenerModulos()
      setCarga({ estado: 'listo', modulos })
    } catch (err) {
      setCarga({
        estado: 'error',
        mensaje: mensajeDeError(err, 'No se pudieron cargar los módulos. Intenta de nuevo.'),
      })
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambiar = async (id: string, activo: boolean) => {
    setGuardando((g) => ({ ...g, [id]: true }))
    setErrores((e) => ({ ...e, [id]: null }))
    setConfirmados((c) => ({ ...c, [id]: false }))
    try {
      const confirmado = await sistemaApi.cambiarModulo(id, activo)
      setCarga((actual) =>
        actual.estado === 'listo'
          ? { ...actual, modulos: actual.modulos.map((m) => (m.id === id ? { ...m, ...confirmado } : m)) }
          : actual,
      )
      setConfirmados((c) => ({ ...c, [id]: true }))
      // El menú de esta sesión se entera sin recargar la página.
      void recargarModulos?.()
    } catch (err) {
      setErrores((e) => ({
        ...e,
        [id]: mensajeDeError(err, 'No se guardó el cambio. El módulo sigue como estaba.'),
      }))
    } finally {
      setGuardando((g) => ({ ...g, [id]: false }))
    }
  }

  return (
    <>
      <EncabezadoPantalla
        titulo="Módulos"
        descripcion="Enciende las funciones opcionales que usa tu consultorio."
        icono={cilSettings}
      />
      <CCard className="mb-3" data-tour="modulos-explicacion">
        <CCardBody className="small">
          Cada módulo se enciende o se apaga para <b>todo el consultorio</b>. Apagar uno solo lo oculta:
          <b> no borra nada</b> de lo que guardó, y al volver a encenderlo todo sigue ahí. Los que necesitan un
          servicio del servidor no se dejan encender hasta que esté configurado.
        </CCardBody>
      </CCard>

      {carga.estado === 'cargando' && (
        <div className="text-center py-5">
          <CSpinner color="primary" aria-label="Cargando módulos" />
        </div>
      )}

      {carga.estado === 'error' && (
        <CAlert color="danger" className="d-flex justify-content-between align-items-center gap-3">
          <span>{carga.mensaje}</span>
          <CButton color="danger" variant="outline" onClick={() => void cargar()}>
            Reintentar
          </CButton>
        </CAlert>
      )}

      {carga.estado === 'listo' && carga.modulos.length === 0 && (
        <CCard>
          <CCardBody className="text-center py-5">
            <h2 className="h5">Aún no hay módulos opcionales instalados</h2>
            <p className="text-body-secondary mb-0">
              Cuando se instale uno (por ejemplo, Tareas o la recepción de estudios desde los equipos), aparecerá
              aquí para que decidas si tu consultorio lo usa.
            </p>
          </CCardBody>
        </CCard>
      )}

      {carga.estado === 'listo' && carga.modulos.length > 0 && (
        <CRow className="g-3" data-tour="modulos-lista">
          {carga.modulos.map((modulo) => (
            <CCol key={modulo.id} xs={12} lg={6}>
              <TarjetaModulo
                modulo={modulo}
                guardando={Boolean(guardando[modulo.id])}
                confirmado={confirmados[modulo.id]}
                error={errores[modulo.id]}
                onCambiar={(activo) => void cambiar(modulo.id, activo)}
              />
            </CCol>
          ))}
        </CRow>
      )}
    </>
  )
}

export default ModulosPage
