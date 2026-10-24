/**
 * El único encabezado de cada pantalla (plan 32, punto 2).
 *
 * Antes cada pantalla traía su propia banda y, arriba de ella, `AppBreadcrumb`
 * repetía el título y las migas: el nombre se leía dos veces. Al quitar las
 * migas, este componente se vuelve el único nombre de la página, así que su
 * título es siempre el `<h1>`: es el punto de llegada del lector de pantalla y
 * no puede faltar en ninguna pantalla.
 *
 * Para las pantallas que viven dentro de otra (Gestión de Permisos dentro del
 * Panel de Desarrollador, la consulta dentro de Mis Consultas), `padre` pinta
 * un enlace chico «← Padre»: es lo único útil que daban las migas, cómo volver.
 */
import React, { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilArrowLeft } from '@coreui/icons'

export interface PantallaPadre {
  /** Cómo se llama la pantalla de arriba, igual que en el menú. */
  nombre: string
  /** Su ruta. Se navega con el router, así que abre (o activa) su pestaña. */
  ruta: string
}

export interface EncabezadoPantallaProps {
  titulo: ReactNode
  /** Una línea que dice para qué sirve la pantalla. En el teléfono se oculta. */
  descripcion?: ReactNode
  /** Ícono del módulo (el mismo del menú), en su chip de vidrio. */
  icono?: string[]
  /** Botones a la derecha del título; en el teléfono bajan a su renglón. */
  acciones?: ReactNode
  /** Junto al título: un folio, un estado. No sustituye a la descripción. */
  insignia?: ReactNode
  /** Para pantallas hijas: el enlace «← Padre». */
  padre?: PantallaPadre
  /** Contenido extra debajo del título (avisos que pertenecen al encabezado). */
  children?: ReactNode
  'data-tour'?: string
  className?: string
}

const traeMargen = (className?: string) =>
  (className ?? '').split(/\s+/).some((clase) => clase.startsWith('mb-'))

export const EncabezadoPantalla: React.FC<EncabezadoPantallaProps> = ({
  titulo,
  descripcion,
  icono,
  acciones,
  insignia,
  padre,
  children,
  'data-tour': dataTour,
  className,
}) => (
  <header
    // El margen de abajo es `mb-4` salvo que la pantalla traiga el suyo: dos
    // `mb-*` juntos los resuelve el orden del CSS, no quien los escribió.
    className={`hero-banner encabezado-pantalla ${traeMargen(className) ? '' : 'mb-4 '}${className ?? ''}`.trim()}
    data-tour={dataTour}
  >
    {padre && (
      <Link to={padre.ruta} className="encabezado-pantalla__padre">
        <CIcon icon={cilArrowLeft} size="sm" aria-hidden="true" />
        <span>{padre.nombre}</span>
      </Link>
    )}
    <div className="encabezado-pantalla__cuerpo">
      {icono && (
        <span className="encabezado-pantalla__icono" aria-hidden="true">
          <CIcon icon={icono} size="xl" />
        </span>
      )}
      <div className="encabezado-pantalla__texto">
        <div className="encabezado-pantalla__titulo">
          <h1 className="h2 mb-0">{titulo}</h1>
          {insignia}
        </div>
        {descripcion && <p className="encabezado-pantalla__descripcion">{descripcion}</p>}
        {children}
      </div>
      {acciones && <div className="encabezado-pantalla__acciones">{acciones}</div>}
    </div>
  </header>
)

export default EncabezadoPantalla
