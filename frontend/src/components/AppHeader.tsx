import { useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import classNames from 'classnames'
import {
  CContainer,
  CHeader,
  CHeaderNav,
  CHeaderToggler,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
  cilMenu,
} from '@coreui/icons'

import { AppHeaderDropdown } from './header/index'
import NotificationBell from '../shared/components/NotificationBell'
import { TenantSwitcher } from '../shared/components/TenantSwitcher'
import BotonAyuda from '../shared/tutoriales/BotonAyuda'
import FranjaAyuda from '../shared/tutoriales/FranjaAyuda'
import FranjaCriticos from '../shared/avisos/FranjaCriticos'
import BuscadorPacientes from '../shared/components/BuscadorPacientes'

import type { State } from 'src/store'

const AppHeader = () => {
  const headerRef = useRef<HTMLDivElement>(null)

  const dispatch = useDispatch()
  const sidebarShow = useSelector((state: State) => state.sidebarShow)

  useEffect(() => {
    document.addEventListener('scroll', () => {
      headerRef.current &&
        headerRef.current.classList.toggle('shadow-sm', document.documentElement.scrollTop > 0)
    })
  }, [])

  // El alto real del encabezado (crece con la franja de ayuda o la de
  // críticos) queda en una variable CSS: los emergentes de avisos se colocan
  // debajo y no tapan ninguna de las dos.
  useEffect(() => {
    const encabezado = headerRef.current
    if (!encabezado || typeof ResizeObserver === 'undefined') return undefined
    const medir = () =>
      document.documentElement.style.setProperty('--gems-alto-encabezado', `${encabezado.offsetHeight}px`)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(encabezado)
    return () => {
      observador.disconnect()
      document.documentElement.style.removeProperty('--gems-alto-encabezado')
    }
  }, [])

  // El encabezado de la aplicación es el landmark «banner» (paso axe): CHeader
  // no lo trae y envolverlo por fuera rompería su `sticky`, que se apoya en
  // que su contenedor sea el alto completo de la página.
  return (
    <CHeader position="sticky" className="mb-4 p-0" ref={headerRef} role="banner">
      <CContainer className="px-4 px-xl-5" fluid>
        {/* Sólo lleva el icono: sin nombre, el lector anunciaba un «botón» a
            secas (paso axe). */}
        <CHeaderToggler
          aria-label="Abrir el menú"
          className={classNames('d-lg-none', {
            'prevent-hide': !sidebarShow,
          })}
          onClick={() => dispatch({ type: 'set', sidebarShow: !sidebarShow })}
          style={{ marginInlineStart: '-14px' }}
          data-tour="abrir-menu"
        >
          <CIcon icon={cilMenu} size="lg" />
        </CHeaderToggler>
        {/* Buscar paciente desde cualquier pantalla (plan 28, Fase 4). En el
            celular es solo la lupa; el campo se abre encima al tocarla. */}
        <BuscadorPacientes />
        {/* La ayuda va a la vista y no dentro del menú de perfil: quien más la
            necesita es quien menos va a ir a buscarla. */}
        {/* La librería fija `role="navigation"` en estos grupos; aquí no son
            navegación y el rol sobraba con el pie forzado, así que se
            neutraliza. Los dos que sólo llevan un botón pasan a `div` (no
            contienen listas); el de perfil conserva su `ul` con el `li` del
            menú (paso axe: roles y lista mal formada). */}
        <CHeaderNav as="div" role={undefined} className="ms-auto">
          <BotonAyuda />
        </CHeaderNav>
        <CHeaderNav as="div" role={undefined} className="ms-2" data-tour="notificaciones">
          <NotificationBell />
        </CHeaderNav>
        <CHeaderNav role={undefined} className="ms-2" data-tour="perfil">
          <AppHeaderDropdown />
        </CHeaderNav>
        <div className="encabezado-sucursal d-flex align-items-center border-start ps-3 ms-2" data-tour="sucursal">
          <TenantSwitcher />
        </div>
      </CContainer>
      {/* Renglón propio dentro del encabezado: el aviso de la primera vez y
          los mensajes de la ayuda no tapan nada de la pantalla. */}
      <FranjaAyuda />
      {/* Resultados críticos sin cerrar del médico: en cualquier pantalla y
          sólo hasta que la incidencia se cierra (plan 27, Fase 3). */}
      <FranjaCriticos />
    </CHeader>
  )
}

export default AppHeader
