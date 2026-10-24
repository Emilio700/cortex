import { ReactNode, JSX, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import PropTypes from 'prop-types'

import SimpleBar from 'simplebar-react'
import 'simplebar-react/dist/simplebar.min.css'
import { CBadge, CNavItem, CNavLink, CSidebarNav } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBriefcase, cilCash, cilChevronBottom, cilCode, cilHospital, cilMedicalCross } from '@coreui/icons'

import type { Badge, NavItem } from '../_nav'
import { agruparEnSecciones, seccionDeLaRuta, type SeccionDelMenu } from './menuEnSecciones'

/** El ícono de cada sección padre. Una sección nueva sin ícono usa el genérico. */
const ICONOS_DE_SECCION: Record<string, string[]> = {
  Desarrollador: cilCode,
  Administración: cilBriefcase,
  Consultorio: cilHospital,
  Finanzas: cilCash,
  Médico: cilMedicalCross,
}

const LLAVE_ABIERTAS = 'cortex.menu.secciones-abiertas'

/** Lo que la persona dejó abierto la última vez. Sin almacenamiento, nada. */
const leerAbiertas = (): Set<string> | null => {
  try {
    const crudo = localStorage.getItem(LLAVE_ABIERTAS)
    return crudo ? new Set(JSON.parse(crudo) as string[]) : null
  } catch {
    return null
  }
}

const guardarAbiertas = (abiertas: Set<string>) => {
  try {
    localStorage.setItem(LLAVE_ABIERTAS, JSON.stringify([...abiertas]))
  } catch {
    // Navegador sin almacenamiento: el menú funciona igual, sólo no recuerda.
  }
}

const contenidoDelEnlace = (name: string | JSX.Element, icon: string | ReactNode, badge?: Badge) => (
  <>
    {icon}
    {name}
    {badge && (
      <CBadge color={badge.color} className="ms-auto" title={badge.title}>
        {badge.text}
      </CBadge>
    )}
  </>
)

/**
 * `exacta`: el ítem sólo se marca activo en su propia ruta. Hace falta cuando
 * otro ítem vive debajo de ella («Corte de caja» en /finanzas y «Cobros» en
 * /finanzas/pagos): si no, al abrir Cobros se iluminaban los dos.
 */
const ItemDelMenu = ({ item, exacta = false }: { item: NavItem; exacta?: boolean }) => {
  const { component, name, badge, icon, ...rest } = item
  const Component = component
  return (
    <Component as="div">
      {rest.to || rest.href ? (
        <CNavLink {...(rest.to && { as: NavLink, end: exacta })} {...rest}>
          {contenidoDelEnlace(name, icon, badge)}
        </CNavLink>
      ) : (
        contenidoDelEnlace(name, icon, badge)
      )}
    </Component>
  )
}

interface SeccionProps {
  seccion: SeccionDelMenu
  rutasExactas: Set<string>
  abierta: boolean
  activa: boolean
  onAlternar: () => void
}

/**
 * Una sección padre que se pliega. Cerrada, lleva la insignia de lo pendiente
 * de sus hijos (p. ej. resultados sin revisar) para que no se pierda de vista.
 */
const SeccionDelMenuPlegable = ({ seccion, rutasExactas, abierta, activa, onAlternar }: SeccionProps) => {
  const idLista = useId()
  const pendiente = seccion.items.find((item) => item.badge)?.badge
  return (
    <CNavItem
      as="div"
      className={['cx-seccion', abierta && 'cx-seccion--abierta', activa && 'cx-seccion--activa'].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="nav-link cx-seccion__titulo"
        aria-expanded={abierta}
        aria-controls={idLista}
        onClick={onAlternar}
      >
        <CIcon icon={ICONOS_DE_SECCION[seccion.nombre] ?? cilBriefcase} customClassName="nav-icon" />
        <span className="cx-seccion__nombre">{seccion.nombre}</span>
        {!abierta && pendiente && (
          <CBadge color={pendiente.color} className="ms-auto cx-seccion__insignia" title={pendiente.title}>
            {pendiente.text}
          </CBadge>
        )}
        <CIcon icon={cilChevronBottom} className={`cx-seccion__flecha ${!abierta && pendiente ? '' : 'ms-auto'}`} aria-hidden="true" />
      </button>
      {/* La lista se queda en el DOM y se anima su altura; `inert` evita que
          el tabulador entre a enlaces que no se ven. */}
      <div className="cx-seccion__cuerpo" id={idLista} inert={!abierta || undefined}>
        <div className="cx-seccion__items">
          {seccion.items.map((item, i) => (
            <ItemDelMenu key={`${String(item.name)}-${i}`} item={item} exacta={rutasExactas.has(item.to ?? '')} />
          ))}
        </div>
      </div>
    </CNavItem>
  )
}

export const AppSidebarNav = ({ items }: { items: NavItem[] }) => {
  const { pathname } = useLocation()
  const { sueltos, secciones } = useMemo(() => agruparEnSecciones(items), [items])
  const activa = seccionDeLaRuta(secciones, pathname)
  // Rutas que son prefijo de otra ruta del menú: ésas se marcan sólo exactas.
  const rutasExactas = useMemo(() => {
    const rutas = items.map((item) => item.to).filter((to): to is string => Boolean(to) && to !== '/')
    return new Set(rutas.filter((ruta) => rutas.some((otra) => otra !== ruta && otra.startsWith(`${ruta}/`))))
  }, [items])

  // Primera vez: sólo la sección de la pantalla abierta (o la primera), para
  // no saturar el menú. Después, lo que la persona haya dejado abierto.
  const [abiertas, setAbiertas] = useState<Set<string>>(
    () => leerAbiertas() ?? new Set([activa ?? secciones[0]?.nombre].filter(Boolean) as string[]),
  )

  // Al llegar a una pantalla cuya sección está cerrada, se abre: el elemento
  // activo nunca queda escondido.
  useEffect(() => {
    if (activa && !abiertas.has(activa)) {
      setAbiertas((previas) => {
        const nuevas = new Set(previas).add(activa)
        guardarAbiertas(nuevas)
        return nuevas
      })
    }
  }, [activa]) // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = useCallback((nombre: string) => {
    setAbiertas((previas) => {
      const nuevas = new Set(previas)
      if (nuevas.has(nombre)) nuevas.delete(nombre)
      else nuevas.add(nombre)
      guardarAbiertas(nuevas)
      return nuevas
    })
  }, [])

  return (
    <CSidebarNav as={SimpleBar}>
      {sueltos.map((item, i) => (
        <ItemDelMenu key={`${String(item.name)}-${i}`} item={item} exacta={rutasExactas.has(item.to ?? '')} />
      ))}
      {secciones.map((seccion) => (
        <SeccionDelMenuPlegable
          key={seccion.nombre}
          seccion={seccion}
          rutasExactas={rutasExactas}
          abierta={abiertas.has(seccion.nombre)}
          activa={seccion.nombre === activa}
          onAlternar={() => alternar(seccion.nombre)}
        />
      ))}
    </CSidebarNav>
  )
}

AppSidebarNav.propTypes = {
  items: PropTypes.arrayOf(PropTypes.any).isRequired,
}
