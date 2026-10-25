// Firma digital de recetas con ES256 (ECDSA P-256) usando `jose`.
// La llave privada vive en settings (solo demo); en producción debe estar en el servidor/HSM.
import { generateKeyPair, exportJWK, importJWK, CompactSign, compactVerify, decodeProtectedHeader } from 'jose'
import { getDB, updateSettings } from '../../lib/store'

export interface PayloadReceta {
  folio: string
  fecha: string
  paciente: string // iniciales + año de nacimiento, ej. "MFLR-1968"
  medicamentos: string[]
  cedula: string
  medico?: string
}

export async function generarLlaves() {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
  const priv = await exportJWK(privateKey)
  const pub = await exportJWK(publicKey)
  const kid = 'ms-' + Date.now().toString(36)
  priv.alg = pub.alg = 'ES256'
  ;(priv as Record<string, unknown>).kid = kid
  ;(pub as Record<string, unknown>).kid = kid
  updateSettings({ llavePrivada: priv, llavePublica: pub })
  return { priv, pub }
}

/** Obtiene la llave privada; la genera la primera vez. */
async function llavePrivada() {
  let priv = getDB().settings.llavePrivada
  if (!priv) priv = (await generarLlaves()).priv
  return priv
}

export async function firmarReceta(payload: PayloadReceta): Promise<string> {
  const jwk = await llavePrivada()
  const key = await importJWK(jwk as Parameters<typeof importJWK>[0], 'ES256')
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const kid = (jwk as Record<string, unknown>).kid as string | undefined
  return new CompactSign(data).setProtectedHeader({ alg: 'ES256', typ: 'JWT', ...(kid ? { kid } : {}) }).sign(key)
}

export type Verificacion = { ok: true; payload: PayloadReceta; kid?: string } | { ok: false; error: string; payload?: PayloadReceta }

/** Decodifica el payload sin verificar (para mostrar qué se alteró). */
export function decodificar(jws: string): PayloadReceta | undefined {
  try {
    const part = jws.split('.')[1]
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4)
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
  } catch {
    return undefined
  }
}

export async function verificarReceta(jws: string, pub?: JsonWebKey): Promise<Verificacion> {
  const token = jws.trim()
  if (token.split('.').length !== 3) return { ok: false, error: 'El texto no tiene formato de token JWS (tres partes separadas por puntos).' }
  if (!pub) return { ok: false, error: 'No hay llave pública configurada para verificar.', payload: decodificar(token) }
  try {
    const h = decodeProtectedHeader(token)
    if (h.alg !== 'ES256') return { ok: false, error: `Algoritmo no permitido: ${h.alg}` }
    const key = await importJWK(pub as Parameters<typeof importJWK>[0], 'ES256')
    const { payload } = await compactVerify(token, key)
    return { ok: true, payload: JSON.parse(new TextDecoder().decode(payload)), kid: h.kid }
  } catch (e) {
    return { ok: false, error: 'La firma no es válida: el documento fue alterado o no fue emitido con esta llave. (' + (e as Error).message + ')', payload: decodificar(token) }
  }
}
