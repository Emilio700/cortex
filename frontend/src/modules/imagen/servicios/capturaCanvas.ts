/**
 * La captura de la imagen: lienzo + mediciones + sello, a un PNG.
 *
 * Cornerstone dibuja la imagen en un `<canvas>` y las mediciones en una capa SVG
 * aparte, así que capturar sólo el lienzo perdería lo que el médico midió. Aquí
 * se juntan las dos y se escribe encima el sello (estudio, serie, fecha, corte) y
 * la leyenda de material de apoyo.
 *
 * Salida: PNG, sin pérdida. Un JPEG de una resonancia ya recomprime la imagen y
 * rompe la lectura de bajo contraste (doc. 03, §5); la captura es un derivado
 * para enseñar, no el estudio, pero no por eso se degrada.
 */

export interface OpcionesDeComposicion {
  lienzo: HTMLCanvasElement
  /** La capa SVG con las mediciones; `null` para capturar sólo la imagen. */
  marcas?: SVGElement | null
  /** Líneas del sello, de arriba abajo. */
  sello: string[]
  leyenda: string
}

export interface CapturaComponer {
  blob: Blob
  ancho: number
  alto: number
  /** `false` si se pidieron las mediciones y no se pudieron dibujar. */
  marcasIncluidas: boolean
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => rechazar(new Error('No se pudo dibujar la capa de mediciones.'))
    imagen.src = url
  })
}

/** La capa SVG como imagen; `null` si no se puede (no se inventa una medición). */
async function marcasComoImagen(
  marcas: SVGElement,
  ancho: number,
  alto: number
): Promise<HTMLImageElement | null> {
  try {
    const copia = marcas.cloneNode(true) as SVGElement
    copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    copia.setAttribute('width', String(ancho))
    copia.setAttribute('height', String(alto))
    const caja = marcas.getBoundingClientRect()
    if (caja.width > 0 && caja.height > 0) {
      copia.setAttribute('viewBox', `0 0 ${caja.width} ${caja.height}`)
    }
    const texto = new XMLSerializer().serializeToString(copia)
    const url = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      return await cargarImagen(url)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

function escribirSello(
  ctx: CanvasRenderingContext2D,
  lineas: string[],
  leyenda: string,
  ancho: number,
  alto: number
) {
  const cuerpo = Math.max(12, Math.round(alto / 36))
  ctx.font = `600 ${cuerpo}px Inter, "Segoe UI", system-ui, sans-serif`
  ctx.textBaseline = 'top'
  const margen = Math.round(cuerpo * 0.8)
  lineas.forEach((linea, i) => {
    const y = margen + i * Math.round(cuerpo * 1.35)
    // Un contorno oscuro: el texto se lee sobre cualquier fondo de la imagen.
    ctx.lineWidth = Math.max(3, cuerpo / 4)
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(linea, margen, y)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillText(linea, margen, y)
  })

  const franja = Math.round(cuerpo * 1.9)
  ctx.fillStyle = 'rgba(2, 8, 22, 0.78)'
  ctx.fillRect(0, alto - franja, ancho, franja)
  ctx.font = `500 ${Math.max(10, Math.round(cuerpo * 0.78))}px Inter, "Segoe UI", system-ui, sans-serif`
  ctx.fillStyle = '#9fb2d6'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(leyenda, ancho / 2, alto - franja / 2)
  ctx.textAlign = 'start'
}

export async function componerCaptura(opciones: OpcionesDeComposicion): Promise<CapturaComponer> {
  const { lienzo } = opciones
  const ancho = lienzo.width
  const alto = lienzo.height
  if (ancho <= 0 || alto <= 0) {
    throw new Error('La imagen todavía no está lista para capturarse.')
  }

  const salida = document.createElement('canvas')
  salida.width = ancho
  salida.height = alto
  const ctx = salida.getContext('2d')
  if (!ctx) throw new Error('Este navegador no puede componer la captura.')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(lienzo, 0, 0)

  let marcasIncluidas = true
  if (opciones.marcas) {
    const capa = await marcasComoImagen(opciones.marcas, ancho, alto)
    if (capa) ctx.drawImage(capa, 0, 0, ancho, alto)
    else marcasIncluidas = false
  }

  escribirSello(ctx, opciones.sello, opciones.leyenda, ancho, alto)

  const blob = await new Promise<Blob | null>((resolver) => salida.toBlob(resolver, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen de la captura.')
  return { blob, ancho, alto, marcasIncluidas }
}

/** Baja un Blob como archivo, con el nombre dado. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Se libera después del clic: algunos navegadores empiezan la descarga tarde.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** ¿Este navegador puede copiar una imagen al portapapeles? */
export function puedeCopiarImagen(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  )
}

/**
 * Copia un PNG al portapapeles. Falla con un mensaje claro si el navegador no
 * lo permite (Firefox antiguo, página sin HTTPS): no se finge que se copió.
 */
export async function copiarImagen(blob: Blob): Promise<void> {
  if (!puedeCopiarImagen()) {
    throw new Error(
      'Este navegador no permite copiar imágenes. Usa «Descargar» y pégala desde el archivo.'
    )
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}
