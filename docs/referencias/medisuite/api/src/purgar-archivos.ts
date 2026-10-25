// Purga de archivos de documentos borrados lógicamente antes de una fecha.
// Uso: npm run purgar-archivos -- --antes 2031-01-01 [--confirmar]
// Sin --confirmar solo informa (simulación). Nunca toca registros clínicos: el documento (metadatos) se conserva
// con deleted_at; solo se elimina el contenido almacenado y su fila en `files`. La bitácora registra cada purga.
import type pg from 'pg'
import { audit } from './audit.js'
import { loadConfig } from './config.js'
import { createPool } from './db.js'
import { createStorage, type Storage } from './storage.js'

export interface PurgeResult {
  candidatos: number
  purgados: number
  bytes: number
  errores: number
}

export async function purgarArchivos(pool: pg.Pool, storage: Storage, antes: Date, confirmar: boolean, log: (m: string) => void = () => {}): Promise<PurgeResult> {
  const rows = (
    await pool.query<{ org_id: string; id: string; patient_id: string | null; storage_name: string; size: string }>(
      `SELECT d.org_id, d.id, d.patient_id, f.storage_name, f.size
       FROM documents d JOIN files f ON f.org_id = d.org_id AND f.id = d.id
       WHERE d.deleted_at IS NOT NULL AND d.deleted_at < $1
       ORDER BY d.deleted_at`,
      [antes],
    )
  ).rows
  const res: PurgeResult = { candidatos: rows.length, purgados: 0, bytes: 0, errores: 0 }
  for (const r of rows) {
    res.bytes += Number(r.size)
    if (!confirmar) continue
    try {
      await storage.delete(r.storage_name)
      await pool.query('DELETE FROM files WHERE org_id = $1 AND id = $2', [r.org_id, r.id])
      await audit(pool, { orgId: r.org_id, userNombre: 'purgar-archivos', accion: 'borrar', recurso: 'files', recursoId: r.id, patientId: r.patient_id, detalle: { operacion: 'purga', antes: antes.toISOString() } })
      res.purgados++
    } catch (e) {
      res.errores++
      log(`Error al purgar ${r.id}: ${(e as Error).message}`)
    }
  }
  return res
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const antesRaw = arg('--antes')
  if (!antesRaw || !/^\d{4}-\d{2}-\d{2}$/.test(antesRaw)) {
    console.error('Uso: npm run purgar-archivos -- --antes AAAA-MM-DD [--confirmar]')
    process.exit(2)
  }
  const antes = new Date(antesRaw + 'T00:00:00.000Z')
  const confirmar = process.argv.includes('--confirmar')
  const cfg = loadConfig()
  // La purga borra filas de `files`: usa la conexión del dueño (DATABASE_URL_MIGRATIONS) si existe.
  const pool = createPool(cfg.migrationsDatabaseUrl)
  try {
    const storage = await createStorage(cfg)
    const r = await purgarArchivos(pool, storage, antes, confirmar, console.error)
    const mb = (r.bytes / 1024 / 1024).toFixed(1)
    if (!confirmar) console.log(`Simulación: ${r.candidatos} archivo(s) (${mb} MB) de documentos borrados antes de ${antesRaw}. Agrega --confirmar para purgarlos.`)
    else console.log(`Purgados ${r.purgados} de ${r.candidatos} archivo(s) (${mb} MB). Errores: ${r.errores}.`)
    if (r.errores) process.exitCode = 1
  } finally {
    await pool.end()
  }
}

// Solo al ejecutarse como script (no al importarse en pruebas).
if (process.argv[1] && /purgar-archivos\.(js|ts)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error((e as Error).message)
    process.exit(1)
  })
}
