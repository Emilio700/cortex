/**
 * Órdenes de estudio en el mostrador de recepción.
 *
 * Dos tareas del mostrador, en pestañas:
 *  - «Por entregar» (O-09): dar al paciente el papel de la orden y marcar la
 *    entrega, sin tocar el estado clínico.
 *  - «Subir resultado» (O-04): adjuntar el PDF o la foto del resultado.
 *
 * Cada pestaña se muestra sólo con su permiso; recepción no ve el seguimiento
 * clínico ni la indicación en ninguna de las dos.
 */
import { useState } from 'react'
import { CAlert, CNav, CNavLink } from '@coreui/react-pro'
import { useAuth } from '../../../shared/context/AuthContext'
import PanelOrdenesPorEntregar from '../components/PanelOrdenesPorEntregar'
import PanelSubirResultado from '../components/PanelSubirResultado'
import { cilCloudUpload } from '@coreui/icons'
import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'

type Pestana = 'entrega' | 'resultado'

const SubirResultadosPage = () => {
  const { can, permissions } = useAuth()
  // Convención del proyecto (igual que PagosPage): una sesión vieja sin
  // permisos en el perfil no se lee como «no puede»; el servidor sigue siendo
  // quien autoriza.
  const sinPermisosEnPerfil = !permissions || permissions.length === 0
  const puede = (accion: string) => sinPermisosEnPerfil || can(accion)
  const puedeEntregar = puede('clinical_tracking.deliver_order')
  const puedeSubir = puede('clinical_tracking.attach_result')
  // Arranca en la pestaña que la persona pueda usar.
  const [pestana, setPestana] = useState<Pestana>(puedeEntregar ? 'entrega' : 'resultado')

  return (
    <>
      <EncabezadoPantalla
        titulo="Órdenes y resultados"
        descripcion="Entrega las órdenes al paciente y sube los resultados que trae."
        icono={cilCloudUpload}
      />

      {/* Pestañas de verdad para el lector de pantalla: botones con role=tab
          y <li> de presentación (CNavItem no pasa el role; axe, plan 29 lote 6). */}
      <CNav variant="pills" role="tablist" aria-label="Órdenes y resultados" className="mb-3 gap-1" data-tour="resultados-pestanas">
        {puedeEntregar && (
          <li className="nav-item" role="presentation">
            <CNavLink
              as="button"
              type="button"
              role="tab"
              aria-selected={pestana === 'entrega'}
              active={pestana === 'entrega'}
              onClick={() => setPestana('entrega')}
            >
              Por entregar
            </CNavLink>
          </li>
        )}
        {puedeSubir && (
          <li className="nav-item" role="presentation">
            <CNavLink
              as="button"
              type="button"
              role="tab"
              aria-selected={pestana === 'resultado'}
              active={pestana === 'resultado'}
              onClick={() => setPestana('resultado')}
            >
              Subir resultado
            </CNavLink>
          </li>
        )}
      </CNav>

      {pestana === 'entrega' && puedeEntregar ? (
        <PanelOrdenesPorEntregar />
      ) : pestana === 'resultado' && puedeSubir ? (
        <PanelSubirResultado puedeSeguir={puede('clinical_tracking.follow_up')} />
      ) : (
        // Con permisos cargados y ninguno de los dos, no se ofrece lo que el
        // servidor negaría (revisión de flujos; mismo criterio que el menú).
        <CAlert color="warning" role="alert">
          No tienes permiso para entregar órdenes ni para subir resultados. Pídeselo a la administración si lo
          necesitas.
        </CAlert>
      )}
    </>
  )
}

export default SubirResultadosPage
