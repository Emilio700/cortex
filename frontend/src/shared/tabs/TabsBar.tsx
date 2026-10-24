/**
 * TabsBar — la tira de pestañas abiertas, arriba del contenido.
 *
 * Desde que se quitaron las migas (plan 32, punto 2) es la única forma de
 * decir dónde se está, así que tiene que leerse aunque haya ocho abiertas:
 *
 * - ancho máximo con «…» y el nombre completo al pasar el cursor;
 * - el ícono del módulo (el del menú), para reconocerla aunque se corte;
 * - la activa con fondo, línea de color abajo y la «×» siempre visible;
 * - «Cerrar las demás» y «Cerrar todas» con clic derecho;
 * - si no caben, flechas discretas para desplazarse de lado;
 * - al pasar de 8 se cierra la usada hace más tiempo, con «Deshacer».
 *
 * Marca con un punto las pestañas que tienen trabajo sin guardar. Sin esa
 * marca la doctora sólo se entera de lo que dejó a medias cuando intenta
 * cerrar la pestaña, que es tarde y a destiempo.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import CIcon from '@coreui/icons-react'
import { cilChevronLeft, cilChevronRight, cilX } from '@coreui/icons'
import { useTabs } from './TabsContext'
import { pestanasSinGuardar, suscribir } from './cambiosSinGuardar'
import { iconoDeRuta } from './iconosDeModulo'

// `useSyncExternalStore` compara la instantánea con `Object.is`, así que no
// puede devolver un arreglo nuevo en cada lectura (bucle infinito de render).
// Una cadena ordenada sí es estable mientras no cambie el contenido.
const instantaneaDeSucias = () => pestanasSinGuardar().slice().sort().join('|')

/** Cuánto se queda el aviso «Se cerró…» antes de irse solo. */
const DURACION_AVISO_MS = 8000

interface MenuAbierto {
    key: string
    x: number
    y: number
}

const TabsBar: React.FC = () => {
    const {
        tabs,
        activeTabKey,
        setActiveTab,
        closeTab,
        closeOthers,
        closeAll,
        cierrePorLimite,
        deshacerCierre,
        descartarCierre,
    } = useTabs()
    const sucias = useSyncExternalStore(suscribir, instantaneaDeSucias, () => '')
    const conCambios = new Set(sucias ? sucias.split('|') : [])

    const tiraRef = useRef<HTMLDivElement>(null)
    const [desborde, setDesborde] = useState({ izquierda: false, derecha: false })
    const [menu, setMenu] = useState<MenuAbierto | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const medir = useCallback(() => {
        const tira = tiraRef.current
        if (!tira) return
        setDesborde({
            izquierda: tira.scrollLeft > 1,
            derecha: tira.scrollLeft + tira.clientWidth < tira.scrollWidth - 1,
        })
    }, [])

    useLayoutEffect(() => {
        medir()
    }, [medir, tabs.length])

    useEffect(() => {
        window.addEventListener('resize', medir)
        return () => window.removeEventListener('resize', medir)
    }, [medir])

    // La activa siempre a la vista: si se abrió desde el menú y quedó fuera
    // del borde, la tira se desplaza hasta ella.
    useEffect(() => {
        const activa = tiraRef.current?.querySelector<HTMLElement>('.tabs-bar-item-active')
        activa?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }, [activeTabKey])

    // El aviso del límite se va solo; «Deshacer» sigue a mano mientras dura.
    useEffect(() => {
        if (!cierrePorLimite) return
        const id = window.setTimeout(descartarCierre, DURACION_AVISO_MS)
        return () => window.clearTimeout(id)
    }, [cierrePorLimite, descartarCierre])

    // El menú contextual se cierra con Escape, al hacer clic fuera o al
    // desplazar: es un menú de un solo uso, no un panel.
    useEffect(() => {
        if (!menu) return
        const alPulsar = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) setMenu(null)
        }
        const alTeclear = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenu(null)
        }
        document.addEventListener('mousedown', alPulsar)
        document.addEventListener('keydown', alTeclear)
        window.addEventListener('resize', cerrarMenu)
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
        return () => {
            document.removeEventListener('mousedown', alPulsar)
            document.removeEventListener('keydown', alTeclear)
            window.removeEventListener('resize', cerrarMenu)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menu])

    function cerrarMenu() {
        setMenu(null)
    }

    if (tabs.length === 0) return null

    const desplazar = (sentido: 1 | -1) => {
        const tira = tiraRef.current
        if (!tira) return
        tira.scrollBy({ left: sentido * Math.max(160, tira.clientWidth * 0.6), behavior: 'smooth' })
    }

    const abrirMenu = (e: React.MouseEvent, key: string) => {
        e.preventDefault()
        setMenu({ key, x: e.clientX, y: e.clientY })
    }

    return (
        <div className="tabs-bar-marco">
            <div className="tabs-bar-fila">
                {desborde.izquierda && (
                    <button
                        type="button"
                        className="tabs-bar-flecha tabs-bar-flecha--izq"
                        aria-label="Ver pestañas a la izquierda"
                        onClick={() => desplazar(-1)}
                    >
                        <CIcon icon={cilChevronLeft} size="sm" aria-hidden="true" />
                    </button>
                )}
                <div
                    ref={tiraRef}
                    className="tabs-bar d-flex align-items-end"
                    data-tour="barra-pestanas"
                    onScroll={medir}
                >
                    {tabs.map((tab) => {
                        const isActive = tab.key === activeTabKey
                        const sinGuardar = conCambios.has(tab.key)
                        return (
                            <div
                                key={tab.key}
                                className={`tabs-bar-item${isActive ? ' tabs-bar-item-active' : ''}`}
                                onClick={() => setActiveTab(tab.key)}
                                onContextMenu={(e) => abrirMenu(e, tab.key)}
                                aria-current={isActive ? 'page' : undefined}
                                title={sinGuardar ? `${tab.title} — tiene cambios sin guardar` : tab.title}
                            >
                                <CIcon
                                    icon={iconoDeRuta(tab.path)}
                                    size="sm"
                                    className="tabs-bar-icono"
                                    aria-hidden="true"
                                />
                                <span className="tabs-bar-titulo">{tab.title}</span>
                                {sinGuardar && (
                                    <>
                                        {/* El punto es sólo el adorno visible; el aviso
                                            real va en texto, porque el color por sí solo
                                            no se lo comunica a nadie que no lo vea. */}
                                        <span aria-hidden="true" className="tabs-bar-sucia" />
                                        <span className="visually-hidden">Tiene cambios sin guardar</span>
                                    </>
                                )}
                                {/* Un <button> de verdad: el icono con role=button quedaba
                                    dentro de un aria-hidden (lo pone CIcon) y el lector de
                                    pantalla no lo encontraba aunque se pudiera enfocar
                                    (axe, plan 29 lote 6). */}
                                <button
                                    type="button"
                                    className="pestana-cerrar"
                                    aria-label={
                                        sinGuardar
                                            ? `Cerrar ${tab.title} (tiene cambios sin guardar)`
                                            : `Cerrar ${tab.title}`
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        closeTab(tab.key)
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                >
                                    <CIcon icon={cilX} size="sm" aria-hidden="true" />
                                </button>
                            </div>
                        )
                    })}
                </div>
                {desborde.derecha && (
                    <button
                        type="button"
                        className="tabs-bar-flecha tabs-bar-flecha--der"
                        aria-label="Ver pestañas a la derecha"
                        onClick={() => desplazar(1)}
                    >
                        <CIcon icon={cilChevronRight} size="sm" aria-hidden="true" />
                    </button>
                )}
            </div>

            {menu && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Opciones de pestañas"
                    className="tabs-bar-menu"
                    style={{ left: menu.x, top: menu.y }}
                >
                    <button
                        type="button"
                        role="menuitem"
                        disabled={tabs.length < 2}
                        onClick={() => {
                            const key = menu.key
                            setMenu(null)
                            closeOthers(key)
                        }}
                    >
                        Cerrar las demás
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setMenu(null)
                            closeAll()
                        }}
                    >
                        Cerrar todas
                    </button>
                </div>
            )}

            {/* Lo dice en texto y en una región viva: el cierre automático no
                puede pasar sin que la usuaria se entere (CLAUDE.md). */}
            <div className="tabs-bar-aviso-region" role="status" aria-live="polite">
                {cierrePorLimite && (
                    <div className="tabs-bar-aviso">
                        <span>
                            Se cerró <strong>{cierrePorLimite.title}</strong> para no pasar de 8 pestañas.
                        </span>
                        <button type="button" className="tabs-bar-aviso-deshacer" onClick={deshacerCierre}>
                            Deshacer
                        </button>
                        <button
                            type="button"
                            className="tabs-bar-aviso-cerrar"
                            aria-label="Cerrar el aviso"
                            onClick={descartarCierre}
                        >
                            <CIcon icon={cilX} size="sm" aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default TabsBar
