/**
 * La captura del atlas: la vista 3D, la silueta con los dermatomas (si hay) y
 * un pie con lo que se marcó y el aviso de que es un modelo esquemático.
 *
 * PNG sin pérdida. El nombre del paciente no va: una imagen suelta se reenvía
 * y se queda en cualquier teléfono (misma regla que las capturas del visor).
 */

export interface DatosDeCaptura {
  /** La vista 3D, como `data:image/png`. */
  vista: string
  ancho: number
  alto: number
  /** La silueta de dermatomas, si está a la vista. */
  silueta?: SVGSVGElement | null
  titulo: string
  lineas: string[]
  leyenda: string
  /** Colores del pie y del fondo (tokens ya resueltos). */
  fondo: string
  texto: string
  textoSecundario: string
}

const cargarImagen = (url: string) =>
  new Promise<HTMLImageElement>((resolver, rechazar) => {
    const img = new Image()
    img.onload = () => resolver(img)
    img.onerror = () => rechazar(new Error('No se pudo preparar la imagen de la captura.'))
    img.src = url
  })

/**
 * Una copia del SVG con los `var(--…)` ya resueltos: fuera del documento las
 * variables CSS no existen y la silueta saldría negra.
 */
export const svgAutonomo = (svg: SVGSVGElement, origen: Element = svg): string => {
  const copia = svg.cloneNode(true) as SVGSVGElement
  const estilo = getComputedStyle(origen)
  const resolver = (valor: string | null) =>
    valor?.replace(/var\((--[a-z0-9-]+)\)/gi, (_, nombre: string) => estilo.getPropertyValue(nombre).trim() || '#888')
  for (const el of [copia, ...Array.from(copia.querySelectorAll('*'))]) {
    for (const atributo of ['fill', 'stroke', 'stop-color', 'color']) {
      const valor = el.getAttribute(atributo)
      if (valor?.includes('var(')) el.setAttribute(atributo, resolver(valor)!)
    }
    const enLinea = el.getAttribute('style')
    if (enLinea?.includes('var(')) el.setAttribute('style', resolver(enLinea)!)
  }
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(copia)
}

/** Parte un texto en renglones que quepan en `ancho`. */
const renglones = (ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] => {
  const palabras = texto.split(/\s+/)
  const salida: string[] = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (ctx.measureText(prueba).width > ancho && actual) {
      salida.push(actual)
      actual = p
    } else actual = prueba
  }
  if (actual) salida.push(actual)
  return salida
}

export async function componerCaptura(d: DatosDeCaptura): Promise<Blob> {
  const vista = await cargarImagen(d.vista)
  let silueta: HTMLImageElement | null = null
  if (d.silueta) {
    const url = URL.createObjectURL(new Blob([svgAutonomo(d.silueta)], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      silueta = await cargarImagen(url)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const escala = d.alto / 900
  const anchoSilueta = silueta ? Math.round(d.alto * 0.62) : 0
  const ancho = d.ancho + anchoSilueta
  const margen = Math.round(28 * Math.max(1, escala))
  const fuente = Math.round(19 * Math.max(1, escala))

  const lienzo = document.createElement('canvas')
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no permitió preparar la captura.')
  ctx.font = `${fuente}px Inter, system-ui, sans-serif`
  const lineas = [...d.lineas.flatMap((l) => renglones(ctx, l, ancho - margen * 2))]
  const leyenda = renglones(ctx, d.leyenda, ancho - margen * 2)
  const alturaPie = margen * 2 + fuente * 1.5 * (1 + lineas.length + leyenda.length) + margen * 0.5
  lienzo.width = ancho
  lienzo.height = Math.round(d.alto + alturaPie)

  ctx.fillStyle = d.fondo
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  ctx.drawImage(vista, 0, 0, d.ancho, d.alto)
  if (silueta) {
    const alto = d.alto - margen * 2
    const anchoDibujo = (alto * silueta.width) / Math.max(1, silueta.height)
    ctx.drawImage(silueta, d.ancho + (anchoSilueta - anchoDibujo) / 2, margen, anchoDibujo, alto)
  }

  let y = d.alto + margen + fuente
  ctx.fillStyle = d.texto
  ctx.font = `600 ${Math.round(fuente * 1.1)}px Inter, system-ui, sans-serif`
  ctx.fillText(d.titulo, margen, y)
  ctx.font = `${fuente}px Inter, system-ui, sans-serif`
  for (const l of lineas) {
    y += fuente * 1.5
    ctx.fillText(l, margen, y)
  }
  ctx.fillStyle = d.textoSecundario
  y += fuente * 0.6
  for (const l of leyenda) {
    y += fuente * 1.5
    ctx.fillText(l, margen, y)
  }

  return await new Promise<Blob>((resolver, rechazar) =>
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo generar la imagen.'))), 'image/png'),
  )
}

/** Nombre del archivo: lleva la fecha, nunca el nombre del paciente. */
export const nombreDeCaptura = (fecha = new Date()) => {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `atlas-neuro-3d-${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}.png`
}

export const descargar = (blob: Blob, nombre: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
