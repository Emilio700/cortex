// Llaves de firma ES256 por organización. La privada se guarda cifrada con MASTER_KEY (AES-256-GCM).
import { CompactSign, compactVerify, decodeProtectedHeader, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose'
import { randomBytes } from 'node:crypto'
import { decrypt, encrypt } from './crypto.js'
import type { Q } from './db.js'

export async function createOrgKey(q: Q, orgId: string, masterKey: Buffer): Promise<string> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
  const kid = `ms-${orgId.slice(0, 12)}-${randomBytes(6).toString('hex')}`
  const pub = { ...(await exportJWK(publicKey)), alg: 'ES256', use: 'sig', kid }
  const priv = { ...(await exportJWK(privateKey)), alg: 'ES256', kid }
  await q.query('UPDATE org_keys SET active = false WHERE org_id = $1', [orgId])
  await q.query('INSERT INTO org_keys (kid, org_id, public_jwk, private_enc, active) VALUES ($1, $2, $3, $4, true)', [
    kid,
    orgId,
    pub,
    encrypt(JSON.stringify(priv), masterKey, `orgkey:${kid}`),
  ])
  return kid
}

export async function signForOrg(q: Q, orgId: string, masterKey: Buffer, payload: unknown): Promise<string> {
  let row = (await q.query<{ kid: string; private_enc: string }>('SELECT kid, private_enc FROM org_keys WHERE org_id = $1 AND active ORDER BY created_at DESC LIMIT 1', [orgId])).rows[0]
  if (!row) {
    await createOrgKey(q, orgId, masterKey)
    row = (await q.query<{ kid: string; private_enc: string }>('SELECT kid, private_enc FROM org_keys WHERE org_id = $1 AND active ORDER BY created_at DESC LIMIT 1', [orgId])).rows[0]
  }
  const jwk = JSON.parse(decrypt(row.private_enc, masterKey, `orgkey:${row.kid}`)) as JWK
  const key = await importJWK(jwk, 'ES256')
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: row.kid })
    .sign(key)
}

export async function publicJwks(q: Q): Promise<{ keys: JWK[] }> {
  const rows = (await q.query<{ public_jwk: JWK }>('SELECT public_jwk FROM org_keys ORDER BY created_at')).rows
  return { keys: rows.map((r) => r.public_jwk) }
}

/** Verifica un JWS contra las llaves públicas registradas. Devuelve null si no es válido. */
export async function verifyJws(q: Q, token: string): Promise<{ orgId: string; kid: string; payload: Record<string, unknown> } | null> {
  try {
    const h = decodeProtectedHeader(token)
    if (h.alg !== 'ES256' || typeof h.kid !== 'string') return null
    const row = (await q.query<{ org_id: string; public_jwk: JWK }>('SELECT org_id, public_jwk FROM org_keys WHERE kid = $1', [h.kid])).rows[0]
    if (!row) return null
    const key = await importJWK(row.public_jwk, 'ES256')
    const { payload } = await compactVerify(token, key, { algorithms: ['ES256'] })
    const parsed = JSON.parse(new TextDecoder().decode(payload))
    if (!parsed || typeof parsed !== 'object') return null
    return { orgId: row.org_id, kid: h.kid, payload: parsed }
  } catch {
    return null
  }
}
