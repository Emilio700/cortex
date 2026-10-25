import { NavLink } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'

import {
  CCloseButton,
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarToggler,
} from '@coreui/react-pro'

import { AppSidebarNav } from './AppSidebarNav'
import CortexMarca from './marca/CortexMarca'

// sidebar nav config
import navigation, { filterNavByAccess, resolverInicio } from '../_nav'
import { useAuth } from '../shared/context/AuthContext'
import { rutaDeInicioPermitida } from '../shared/utils/inicio'

import type { State } from '../store'
import {
  insigniaDeResultados,
  useResultadosSinRevisar,
} from '../modules/doctor/hooks/useResultadosSinRevisar'

const RUTA_BANDEJA = '/doctor/results'

const AppSidebar = () => {
  const dispatch = useDispatch()
  const { user, permissions, modulosActivos } = useAuth()
  const unfoldable = useSelector((state: State) => state.sidebarUnfoldable)
  const sidebarShow = useSelector((state: State) => state.sidebarShow)
  // El menú se arma por permiso; el rol queda de respaldo para las sesiones
  // que iniciaron antes de que el perfil trajera permisos.
  const inicio = rutaDeInicioPermitida(user?.role, permissions)
  const navItems = resolverInicio(
    filterNavByAccess(navigation, {
      role: user?.role,
      permissions: user?.permissions,
      // base-modulos-extra: lo opcional solo si el consultorio lo encendió.
      modulos: modulosActivos,
    }),
    inicio,
  )
  // Sólo se cuenta si el menú muestra la bandeja: a recepción el servidor le
  // respondería 403 y no tiene nada que revisar.
  const veBandeja = navItems.some((item) => item.to === RUTA_BANDEJA)
  const { total, error } = useResultadosSinRevisar(veBandeja)
  const badge = insigniaDeResultados(total, error)
  const itemsConInsignia = badge
    ? navItems.map((item) => (item.to === RUTA_BANDEJA ? { ...item, badge } : item))
    : navItems

  // El menú es el landmark de navegación principal: con `as="nav"` y un
  // nombre, el lector de pantalla puede saltar aquí y el logotipo del sidebar
  // deja de quedar «fuera de regiones» (paso axe).
  return (
    <CSidebar
      as="nav"
      aria-label="Menú principal"
      className="bg-dark-gradient border-end"
      data-tour="menu-lateral"
      colorScheme="dark"
      position="fixed"
      unfoldable={unfoldable}
      visible={sidebarShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', sidebarShow: visible })
      }}
    >
      <CSidebarHeader className="border-bottom">
        <CSidebarBrand
          as={NavLink}
          to={inicio}
          className="sidebar-brand-full text-white text-decoration-none d-flex align-items-center"
          // El nombre del enlace es el texto visible del logo más «ir al
          // inicio». Antes un aria-label «Ir al inicio» tapaba ese texto, y
          // quien maneja la computadora por voz no podía decir lo que ve
          // (axe, label-content-name-mismatch; plan 32).
          style={{ gap: 0 }}
        >
          <CortexMarca
            variante={unfoldable ? 'icono' : 'completa'}
            tamano={unfoldable ? 30 : 38}
            conLema
            animada
          />
          <span className="visually-hidden">, ir al inicio</span>
        </CSidebarBrand>
        <CCloseButton
          aria-label="Cerrar el menú"
          className="d-lg-none"
          dark
          onClick={() => dispatch({ type: 'set', sidebarShow: false })}
        />
        <CSidebarToggler
          aria-label={unfoldable ? 'Mostrar el menú completo' : 'Contraer el menú'}
          onClick={() => dispatch({ type: 'set', sidebarUnfoldable: !unfoldable })}
        />
      </CSidebarHeader>

      <AppSidebarNav items={itemsConInsignia} />
    </CSidebar>
  )
}

export default AppSidebar
