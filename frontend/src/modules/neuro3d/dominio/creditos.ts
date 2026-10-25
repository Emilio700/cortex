/**
 * Créditos de lo que se ve en Neuro 3D: modelos y código de terceros con su
 * licencia y el texto de atribución que esa licencia pide.
 *
 * Cada fuente de modelos trae su `CREDITOS.json` (lo escribe el script que la
 * prepara, p. ej. `scripts/atlas/preparar_atlas.py`); el pie de la pantalla
 * junta los de las fuentes **activas** con los fijos de aquí. Puro.
 */

export interface Credito {
  /** Único: con él se quitan los repetidos. */
  id: string
  titulo: string
  autor: string
  licencia: string
  urlLicencia?: string
  /** El texto de atribución, tal cual lo pide la licencia o el autor. */
  texto: string
  /** De dónde sale (página oficial o de la licencia). */
  url?: string
  version?: string
  /** Qué se le cambió (CC BY pide decirlo). */
  cambios?: string
  nota?: string
  /** Cuándo se preparó la copia que se sirve. */
  fecha?: string
}

/** Lo que Neuro 3D usa siempre, con o sin atlas detallado. */
export const CREDITOS_BASE: Credito[] = [
  {
    id: 'threejs',
    titulo: 'three.js',
    autor: 'three.js authors',
    licencia: 'MIT',
    urlLicencia: 'https://github.com/mrdoob/three.js/blob/dev/LICENSE',
    texto: 'Copyright © 2010-2026 three.js authors. The MIT License.',
    url: 'https://threejs.org/',
    version: '0.186',
    nota: 'Motor 3D de la escena. El modelo simplificado (encéfalo, columna, raíces y vías) lo dibuja Cortex en código.',
  },
]

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * Valida un `CREDITOS.json` leído del servidor. Sin título, licencia o texto de
 * atribución no se acepta: un crédito incompleto no cumple la licencia y la
 * fuente no debería mostrarse.
 */
export function leerCredito(json: unknown): Credito | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const id = texto(o.id)
  const titulo = texto(o.titulo)
  const licencia = texto(o.licencia)
  const atribucion = texto(o.texto)
  if (!id || !titulo || !licencia || !atribucion) return null
  return {
    id,
    titulo,
    autor: texto(o.autor) ?? titulo,
    licencia,
    texto: atribucion,
    urlLicencia: texto(o.urlLicencia),
    url: texto(o.url),
    version: texto(o.version),
    cambios: texto(o.cambios),
    nota: texto(o.nota),
    fecha: texto(o.fecha),
  }
}

/** Junta listas de créditos sin repetir (gana la primera aparición) y en orden de llegada. */
export function combinarCreditos(...listas: (readonly Credito[] | null | undefined)[]): Credito[] {
  const vistos = new Set<string>()
  const salida: Credito[] = []
  for (const lista of listas) {
    for (const c of lista ?? []) {
      if (vistos.has(c.id)) continue
      vistos.add(c.id)
      salida.push(c)
    }
  }
  return salida
}

/** Una línea para la captura: «BodyParts3D, © … (CC BY 4.0)». */
export const lineaDeCredito = (c: Credito): string => (c.texto.includes(c.licencia) ? c.texto : `${c.texto} (${c.licencia})`)
