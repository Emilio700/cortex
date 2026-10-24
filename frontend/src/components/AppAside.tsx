/**
 * AppAside — right-side slide-out panel (gear icon in header).
 *
 * Was previously filled with CoreUI demo data (fake avatars, hardware metrics,
 * lorem ipsum). Now provides 3 clean tabs:
 *   1. Agenda / Quick view (placeholder for future daily overview)
 *   2. Notifications (placeholder — full notifications are in NotificationBell)
 *   3. Settings / Accesibilidad (real toggles for system preferences)
 */
import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  CCloseButton,
  CFormSwitch,
  CNav,
  CNavItem,
  CNavLink,
  CTabContent,
  CTabPane,
  CSidebar,
  CSidebarHeader,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBell, cilCalendar, cilSettings } from '@coreui/icons'

import type { State } from './../store'
import { VERSION_GEMS } from '../shared/version'

const AppAside = () => {
  const dispatch = useDispatch()
  const asideShow = useSelector((state: State) => state.asideShow)
  const [activeKey, setActiveKey] = useState(1)

  return (
    <CSidebar
      className="border-start"
      colorScheme="light"
      size="lg"
      overlaid
      placement="end"
      visible={asideShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', asideShow: visible })
      }}
    >
      <CSidebarHeader className="p-0 position-relative">
        <CNav className="w-100" variant="underline-border">
          <CNavItem>
            <CNavLink
              href="#"
              active={activeKey === 1}
              onClick={(e) => {
                e.preventDefault()
                setActiveKey(1)
              }}
              title="Agenda"
            >
              <CIcon icon={cilCalendar} />
            </CNavLink>
          </CNavItem>
          <CNavItem>
            <CNavLink
              href="#"
              active={activeKey === 2}
              onClick={(e) => {
                e.preventDefault()
                setActiveKey(2)
              }}
              title="Notificaciones"
            >
              <CIcon icon={cilBell} />
            </CNavLink>
          </CNavItem>
          <CNavItem>
            <CNavLink
              href="#"
              active={activeKey === 3}
              onClick={(e) => {
                e.preventDefault()
                setActiveKey(3)
              }}
              title="Configuración"
            >
              <CIcon icon={cilSettings} />
            </CNavLink>
          </CNavItem>
        </CNav>
        <CCloseButton
          className="position-absolute top-50 end-0 translate-middle my-0"
          onClick={() => dispatch({ type: 'set', asideShow: false })}
        />
      </CSidebarHeader>

      <CTabContent>
        {/* Tab 1: Agenda Quick View */}
        <CTabPane className="p-3" visible={activeKey === 1}>
          <h6 className="mb-3">Agenda rápida</h6>
          <div className="text-center py-5 text-muted">
            <CIcon icon={cilCalendar} size="xl" className="mb-3 opacity-50" />
            <p className="small">
              Aquí se mostrará un resumen de las citas del día cuando se conecte
              con el calendario en tiempo real.
            </p>
          </div>
        </CTabPane>

        {/* Tab 2: Notifications */}
        <CTabPane className="p-3" visible={activeKey === 2}>
          <h6 className="mb-3">Notificaciones</h6>
          <div className="text-center py-5 text-muted">
            <CIcon icon={cilBell} size="xl" className="mb-3 opacity-50" />
            <p className="small">
              Las notificaciones del sistema aparecen en la campana del encabezado
              principal. Este panel se integrará con el historial completo próximamente.
            </p>
          </div>
        </CTabPane>

        {/* Tab 3: Settings / Accessibility */}
        <CTabPane className="p-3" visible={activeKey === 3}>
          <h6 className="mb-3">Configuración</h6>

          <div className="mb-4">
            <div className="clearfix mt-3">
              <CFormSwitch
                size="lg"
                label="Animaciones reducidas"
                id="reduceAnimations"
                defaultChecked={false}
                onChange={(e) => {
                  // Respects prefers-reduced-motion; toggle for manual override
                  document.documentElement.classList.toggle('reduce-motion', e.target.checked)
                }}
              />
            </div>
            <small className="text-body-secondary">
              Reduce o elimina las animaciones y transiciones visuales en toda la aplicación.
            </small>
          </div>

          {/* Aquí había un interruptor «Sonidos de notificación» encendido que no
              hacía nada (plan 27, F-9). Un control que promete algo que el
              sistema no hace no se deja ni apagado: el sonido de los avisos,
              cuando exista, se configura desde la campana. */}

          <hr />
          <h6 className="mb-3">Acerca de G.E.M.S</h6>
          <div className="small text-body-secondary">
            <p>
              <strong>G.E.M.S</strong> — Gynecology &amp; Expert Management System
            </p>
            <p>Versión {VERSION_GEMS}</p>
            <p className="mb-0">Sistema de gestión médica para consultorios y clínicas.</p>
          </div>
        </CTabPane>
      </CTabContent>
    </CSidebar>
  )
}

export default AppAside
