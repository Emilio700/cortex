/**
 * Convierte la primera imagen de una serie CR/DX en una imagen que la
 * herramienta de marcado puede mostrar, con el mismo cargador del visor
 * (Cornerstone, que ya adjunta la sesión y decodifica los comprimidos).
 *
 * Se importa sólo cuando el médico elige una serie DICOM: Cornerstone es pesado.
 */
import { imageLoader } from '@cornerstonejs/core'
import { prepararVisor } from '../../imagen/servicios/cornerstone'
import { estudiosApi, urlAbsoluta } from '../../imagen/servicios/estudiosApi'
import { ventanaARGBA } from '../dominio/ventanaDicom'

export interface RadiografiaLista {
  url: string
  ancho: number
  alto: number
}

const primero = (v: unknown): number | null => {
  const x = Array.isArray(v) ? v[0] : v
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

export async function radiografiaDeSerie(seriesId: number): Promise<RadiografiaLista> {
  await prepararVisor()
  const manifiesto = await estudiosApi.manifiesto(seriesId)
  const corte = manifiesto.instances[0]
  if (!corte) throw new Error('La serie no tiene imágenes.')
  const imagen = await imageLoader.loadAndCacheImage(`wadouri:${urlAbsoluta(corte.url)}`)
  const ancho = imagen.columns
  const alto = imagen.rows
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no pudo preparar la imagen.')
  const datos = ctx.createImageData(ancho, alto)
  const px = imagen.getPixelData()
  if (imagen.color) {
    // Una radiografía en color (rara, pero existe): se pinta tal cual.
    const canales = px.length / (ancho * alto)
    for (let i = 0; i < ancho * alto; i++) {
      datos.data[i * 4] = px[i * canales]
      datos.data[i * 4 + 1] = px[i * canales + 1]
      datos.data[i * 4 + 2] = px[i * canales + 2]
      datos.data[i * 4 + 3] = 255
    }
  } else {
    ventanaARGBA(
      px,
      {
        pendiente: imagen.slope ?? 1,
        intercepto: imagen.intercept ?? 0,
        centro: primero(imagen.windowCenter),
        ancho: primero(imagen.windowWidth),
        invertir: imagen.invert === true,
      },
      datos.data,
    )
  }
  ctx.putImageData(datos, 0, 0)
  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/png'))
  if (!blob) throw new Error('El navegador no pudo preparar la imagen.')
  return { url: URL.createObjectURL(blob), ancho, alto }
}
