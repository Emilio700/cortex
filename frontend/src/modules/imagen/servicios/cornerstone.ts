/**
 * Arranque de Cornerstone y de sus herramientas.
 *
 * Se inicializa una sola vez por pestaña: los `init` de las tres librerías son
 * globales y volver a llamarlos al cambiar de estudio rompe las herramientas ya
 * registradas.
 *
 * El cargador de imágenes pide los cortes por su cuenta, con su propio XHR, así
 * que la sesión se adjunta aquí. Sin esto el visor recibiría 401 aunque la
 * pantalla ya estuviera abierta.
 */
import { init as iniciarCore } from '@cornerstonejs/core'
import { init as iniciarCargador } from '@cornerstonejs/dicom-image-loader'
import {
  AngleTool,
  EllipticalROITool,
  LengthTool,
  PanTool,
  StackScrollTool,
  WindowLevelTool,
  ZoomTool,
  addTool,
  init as iniciarHerramientas,
} from '@cornerstonejs/tools'

const CLAVE_TOKEN = 'access_token'

let preparado: Promise<void> | null = null

export function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

async function iniciar(): Promise<void> {
  await iniciarCore()
  iniciarCargador({
    // Cornerstone 5 estrena una ruta de metadatos «naturalizados» que depende de
    // manejadores registrados aparte; sin ellos el cargador encuentra el archivo
    // pero no los píxeles («no pixel data in NATURALIZED») y el visor se queda en
    // negro. La ruta clásica —la que usan las versiones 3 y 4, y la que decodifica
    // comprimidos con los mismos workers— sigue disponible y aquí es la que
    // funciona. Se deja escrita para que se vea que fue decisión, no descuido.
    useLegacyMetadataProvider: true,
    maxWebWorkers: Math.min(
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
      4
    ),
    beforeSend: () => {
      const token = leerToken()
      return token ? { Authorization: `Bearer ${token}` } : undefined
    },
  })
  await iniciarHerramientas()
  for (const herramienta of [
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollTool,
    LengthTool,
    EllipticalROITool,
    AngleTool,
  ]) {
    addTool(herramienta)
  }
}

export function prepararVisor(): Promise<void> {
  if (!preparado) preparado = iniciar()
  return preparado
}

export const HERRAMIENTAS = {
  ventana: WindowLevelTool.toolName,
  desplazar: PanTool.toolName,
  zoom: ZoomTool.toolName,
  recorrer: StackScrollTool.toolName,
  medir: LengthTool.toolName,
  area: EllipticalROITool.toolName,
  angulo: AngleTool.toolName,
} as const
