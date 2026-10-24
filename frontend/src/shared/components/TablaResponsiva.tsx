/**
 * Tabla que en el teléfono se lee como tarjetas (plan 29, T-3/P-1/$-2).
 *
 * Las tablas se desplazaban de lado dentro de la tarjeta y lo importante
 * quedaba cortado: el estado en Triage, el teléfono en Pacientes, hasta el
 * «No hay pagos» en Cobros. En ≤ 576 px cada renglón se dibuja como una
 * tarjeta: la primera columna como título, cada dato con el nombre de su
 * columna al lado y la columna «Acciones» abajo, con botones de 44 px. Desde
 * 576 px es la tabla de siempre.
 *
 * Es un `CTable` con dos agregados: la clase `tabla-tarjetas` (el CSS vive en
 * `_movil.scss`) y la etiqueta de cada celda, que se copia del encabezado de
 * su columna para no repetirla a mano en cada `<td>`. Se vuelve a etiquetar
 * cuando cambian los renglones (filtros, páginas, recargas).
 *
 * Una columna se puede marcar a mano en su `<th>`:
 * - `data-tarjeta="titulo"`: va arriba, grande y sin etiqueta (por omisión,
 *   la primera columna);
 * - `data-tarjeta="acciones"`: va abajo, a todo el ancho (por omisión, la que
 *   se llama «Acciones»);
 * - `data-tarjeta="ocultar"`: no se muestra en el teléfono.
 */
import React, { useEffect, useRef } from 'react'
import { CTable } from '@coreui/react-pro'

type Props = React.ComponentProps<typeof CTable>

const PAPELES = ['titulo', 'acciones', 'ocultar'] as const

/**
 * Los botones de solo ícono (lápiz, nube, calendario…) se explicaban con el
 * `title` al pasar el cursor; en el teléfono no hay cursor y eran adivinanzas.
 * Se marcan para que en la tarjeta muestren su `title` como texto.
 */
const marcarBotonesDeIcono = (celda: HTMLElement) => {
  celda.querySelectorAll<HTMLElement>('button[title], a[title]').forEach((boton) => {
    const soloIcono = !(boton.textContent ?? '').trim()
    if (soloIcono && boton.dataset.soloIcono === undefined) boton.dataset.soloIcono = ''
  })
}

/** Copia el nombre y el papel de cada columna a sus celdas. Exportada para probarla. */
export const etiquetarCeldas = (tabla: HTMLTableElement) => {
  const encabezados = [...tabla.querySelectorAll('thead tr:last-child th')] as HTMLElement[]
  const columnas = encabezados.map((th, indice) => {
    const nombre = (th.textContent ?? '').trim()
    const declarado = th.dataset.tarjeta as (typeof PAPELES)[number] | undefined
    const papel =
      declarado && PAPELES.includes(declarado)
        ? declarado
        : indice === 0
          ? 'titulo'
          : /^acciones$/i.test(nombre)
            ? 'acciones'
            : 'dato'
    return { nombre, papel }
  })
  tabla.querySelectorAll('tbody tr').forEach((fila) => {
    const celdas = [...fila.children] as HTMLElement[]
    // Un renglón de una sola celda a todo el ancho (vacío, cargando, error) se
    // deja como está: es un mensaje, no un registro.
    if (celdas.length === 1 && Number(celdas[0].getAttribute('colspan') ?? 1) > 1) {
      celdas[0].dataset.tarjeta = 'mensaje'
      return
    }
    let columna = 0
    for (const celda of celdas) {
      const info = columnas[columna]
      if (info) {
        if (celda.dataset.etiqueta !== info.nombre) celda.dataset.etiqueta = info.nombre
        if (celda.dataset.tarjeta !== info.papel) celda.dataset.tarjeta = info.papel
        if (info.papel === 'acciones') marcarBotonesDeIcono(celda)
      }
      columna += Number(celda.getAttribute('colspan') ?? 1)
    }
  })
}

export const TablaResponsiva: React.FC<Props> = ({ className, children, ...resto }) => {
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tabla = contenedor.current?.querySelector('table')
    if (!tabla) return
    etiquetarCeldas(tabla)
    // Los renglones cambian sin que este componente se entere (los dibuja la
    // pantalla): se vuelve a etiquetar con cada cambio del cuerpo.
    const observador = new MutationObserver(() => etiquetarCeldas(tabla))
    observador.observe(tabla, { childList: true, subtree: true })
    return () => observador.disconnect()
  }, [])

  return (
    <div ref={contenedor} className="tabla-tarjetas-contenedor">
      <CTable className={['tabla-tarjetas', className].filter(Boolean).join(' ')} {...resto}>
        {children}
      </CTable>
    </div>
  )
}

export default TablaResponsiva
