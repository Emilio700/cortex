// Primitivas criptográficas: contraseñas (scrypt), tokens de sesión, cifrado AES-256-GCM.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const scrypt = (pw: string | Buffer, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))))

// N=2^15, r=8, p=1 → ~32 MiB de memoria por hash.
const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 32
const MAXMEM = 64 * 1024 * 1024

/** Formato: scrypt$N$r$p$salt(b64)$hash(b64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Igualar el tiempo de respuesta cuando el usuario no existe.
    await scrypt(password, randomBytes(16), KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
    return false
  }
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

export const sha256Hex = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** AES-256-GCM. Formato: v1.iv.tag.ciphertext (base64url). */
export function encrypt(plain: string, key: Buffer, aad = 'medisuite'): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function decrypt(blob: string, key: Buffer, aad = 'medisuite'): string {
  const [v, iv, tag, ct] = blob.split('.')
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Formato de cifrado desconocido')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  d.setAAD(Buffer.from(aad))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
}

/** Reglas mínimas de contraseña: 10+ caracteres y no trivial. */
export function passwordProblem(pw: string | undefined, email?: string): string | null {
  if (!pw || pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.'
  if (pw.length > 200) return 'La contraseña es demasiado larga.'
  if (new Set(pw).size < 4) return 'La contraseña es demasiado simple.'
  const low = pw.toLowerCase()
  if (['password123', 'contraseña123', '1234567890', 'qwertyuiop', 'medisuite123', 'administrador'].includes(low)) return 'La contraseña es demasiado común.'
  if (email && low.includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) return 'La contraseña no debe contener tu correo.'
  return null
}
