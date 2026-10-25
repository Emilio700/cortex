// Almacén del sistema. Todos los módulos leen y escriben aquí con la MISMA API en los dos modos:
//
// - Modo demo: persiste en IndexedDB del navegador (con respaldo en memoria si el navegador lo bloquea).
// - Modo servidor: al iniciar sesión carga todas las colecciones desde la API (docs/api.md) a memoria
//   (no guarda datos clínicos en el navegador). `add/update/remove` siguen siendo síncronos y optimistas:
//   aplican el cambio local, envían la petición y, al responder, integran el objeto del servidor
//   (folio/firma de recetas, firmadaEn de notas, URL de archivos…). Si falla, se revierte y se avisa.
//   Las peticiones sobre un mismo registro se envían en orden (crear → editar → borrar).
//
// Uso en componentes:
//   const patients = useCollection('patients')
//   const obs = useCollection('observations', o => o.patientId === id)
//   const settings = useSettings()
//   add('observations', { patientId, codigo: 'peso', valor: 70, unidad: 'kg', fuente: 'manual' })
//   const rx = await addAsync('prescriptions', {...})   // espera el objeto guardado por el servidor
//   update('patients', id, { telefono: '...' })
//   remove('documents', id)
//   const [activeId, setActive] = useActivePatient()

import { useSyncExternalStore, useMemo } from 'react'
import type { DB, CollectionName, Settings, ID, Prescription, Encounter } from './types'
import { seedDB } from './seed'
import { api, ApiError, API_BASE, detectMode, errorMessage, isServer } from './api'
import { dataUrlToBlob } from './utils'
import { toast } from '../components/toast'

const IDB_NAME = 'medisuite'
const IDB_STORE = 'kv'
const KEY = 'db'
const LS_TEMA = 'medisuite.tema'
const LS_ACTIVO = 'medisuite.activePatient'
export const COLLECTIONS: CollectionName[] = ['patients', 'appointments', 'encounters', 'observations', 'prescriptions', 'documents', 'payments', 'registros']

function emptySettings(): Settings {
  return {
    doctor: { nombre: '', especialidad: '', cedula: '', universidad: '', direccion: '', telefono: '', email: '' },
    clinica: '',
    tema: localTema() ?? 'claro',
    servicios: {},
  }
}
function emptyDB(): DB {
  return { version: 2, patients: [], appointments: [], encounters: [], observations: [], prescriptions: [], documents: [], payments: [], registros: [], settings: emptySettings() }
}
function localTema(): Settings['tema'] | null {
  try {
    const t = localStorage.getItem(LS_TEMA)
    return t === 'oscuro' || t === 'claro' ? t : null
  } catch {
    return null
  }
}

let state: DB = emptyDB()
let activePatient: ID | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---------- IndexedDB mínima (solo modo demo) ----------
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    } catch (e) {
      reject(e)
    }
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key)
    r.onsuccess = () => resolve(r.result as T)
    r.onerror = () => reject(r.error)
  })
}

async function idbSet(key: string, value: unknown) {
  const db = await openIDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist() {
  if (isServer()) return // en modo servidor no se guarda nada clínico en el navegador
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    idbSet(KEY, state).catch(() => {
      /* sin almacenamiento: seguimos en memoria */
    })
  }, 300)
}

function restoreActivePatient() {
  try {
    activePatient = localStorage.getItem(LS_ACTIVO)
  } catch {
    /* ignorar */
  }
  if (!activePatient || !state.patients.some((p) => p.id === activePatient)) activePatient = state.patients[0]?.id ?? null
}

async function loadDemo() {
  state = seedDB()
  try {
    const saved = await idbGet<DB>(KEY)
    if (saved && saved.version === 1) {
      // v1 → v2: se agregó la colección `registros`; se conservan los datos del usuario y se toman los registros demo
      state = { ...state, ...saved, version: state.version, registros: state.registros, settings: { ...state.settings, ...saved.settings } }
      await idbSet(KEY, state)
    } else if (saved && saved.version === state.version) {
      state = { ...state, ...saved, settings: { ...state.settings, ...saved.settings } }
    } else {
      await idbSet(KEY, state)
    }
  } catch {
    storageOk = false
  }
  restoreActivePatient()
  emit()
}

export let storageOk = true
/** Se resuelve cuando se conoce el modo (y, en demo, cuando ya cargaron los datos locales). */
export const ready: Promise<void> = detectMode().then((m) => (m === 'demo' ? loadDemo() : undefined))

// ---------- Modo servidor: carga, refresco y escritura ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyItem = { id: ID; [k: string]: any }
type Item<C extends CollectionName> = DB[C][number]

let gen = 0 // cambia al cerrar sesión: las respuestas viejas se ignoran
const queues = new Map<string, Promise<void>>()
const pending = new Map<string, number>()
const dead = new Set<string>() // registros cuya creación falló: se cancelan sus operaciones en cola
const pendingListeners = new Set<() => void>()
let pendingTotal = 0
class Skip extends Error {}

function setPending(key: string, delta: number) {
  const n = (pending.get(key) ?? 0) + delta
  if (n <= 0) pending.delete(key)
  else pending.set(key, n)
  pendingTotal = [...pending.values()].reduce((a, b) => a + b, 0)
  pendingListeners.forEach((l) => l())
}

/** Encola una operación remota sobre `key` (colección:id); se ejecutan en orden. */
function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  setPending(key, +1)
  const prev = queues.get(key) ?? Promise.resolve()
  const myGen = gen
  const run = prev.then(() => {
    if (myGen !== gen) throw new Skip('sesión cerrada')
    if (dead.has(key)) throw new Skip('registro descartado')
    return fn()
  })
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(key, settled)
  settled.then(() => {
    if (myGen === gen) setPending(key, -1)
    if (queues.get(key) === settled) queues.delete(key)
  })
  return run
}
const isLast = (key: string) => (pending.get(key) ?? 0) <= 1

const MSG_BLOQUEADO = 'El paciente está bloqueado por una solicitud de derechos ARCO: no se permiten cambios en su expediente.'
function avisarError(e: unknown, titulo: string) {
  if (e instanceof Skip) return
  if (e instanceof ApiError && e.status === 401) return // la sesión se encarga (vuelve al login)
  if (e instanceof ApiError && e.code === 'paciente_bloqueado') return void toast(MSG_BLOQUEADO, 'warn', { title: titulo })
  if (e instanceof ApiError && e.code === 'pago_facturado')
    return void toast('El cobro ya está facturado: no se puede modificar ni eliminar. Cancela primero la factura (Caja › Facturas).', 'warn', { title: titulo })
  if (e instanceof ApiError && (e.code === 'documento_emitido' || e.code === 'movimiento_inmutable' || e.code === 'tipo_inmutable')) return void toast(e.message, 'warn', { title: titulo })
  toast(errorMessage(e), 'danger', { title: titulo })
}

/** ¿El registro pertenece a un paciente bloqueado (ARCO)? En ese caso el servidor rechaza toda escritura. */
function bloqueado(col: CollectionName, item: Record<string, unknown> | undefined): boolean {
  if (!isServer() || !item) return false
  const pid = col === 'patients' ? item.id : item.patientId
  return !!pid && state.patients.some((p) => p.id === pid && p.bloqueado)
}
function rechazarBloqueado(): ApiError {
  toast(MSG_BLOQUEADO, 'warn', { title: 'Paciente bloqueado' })
  return new ApiError(409, 'paciente_bloqueado', MSG_BLOQUEADO)
}

function setCol<C extends CollectionName>(col: C, arr: Item<C>[]) {
  state = { ...state, [col]: arr }
  emit()
}
function replaceLocal<C extends CollectionName>(col: C, id: ID, obj: Item<C>) {
  const arr = state[col] as Item<C>[]
  if (!arr.some((x) => (x as AnyItem).id === id)) return
  setCol(
    col,
    arr.map((x) => ((x as AnyItem).id === id ? obj : x)),
  )
}
function removeLocal<C extends CollectionName>(col: C, id: ID) {
  setCol(
    col,
    (state[col] as Item<C>[]).filter((x) => (x as AnyItem).id !== id),
  )
}

async function uploadDocument(d: AnyItem) {
  const dataUrl = String(d.dataUrl ?? '')
  const blob = dataUrl.startsWith('data:') ? dataUrlToBlob(dataUrl) : await (await fetch(dataUrl)).blob()
  if (blob.size > 25 * 1024 * 1024) throw new ApiError(413, 'archivo_grande', 'El archivo pesa más de 25 MB.')
  const fd = new FormData()
  fd.append('meta', JSON.stringify({ id: d.id, patientId: d.patientId, tipo: d.tipo, nombre: d.nombre, fecha: d.fecha, meta: d.meta }))
  fd.append('file', new File([blob], String(d.nombre || 'archivo'), { type: String(d.mime || blob.type || 'application/octet-stream') }))
  return api<AnyItem>('/documents', { method: 'POST', form: fd })
}

function createRemote(col: CollectionName, item: AnyItem) {
  if (col === 'documents') return uploadDocument(item)
  return api<AnyItem>('/' + col, { method: 'POST', body: item })
}

/**
 * Cuerpo del PATCH. JSON no tiene `undefined`: un campo que el cliente quitó (`telefono: undefined`) se envía
 * como `null` («quitar la clave», docs/api.md v1.1) solo si antes tenía valor; si ya estaba vacío, no se envía.
 */
export function patchBody(col: CollectionName, patch: Record<string, unknown>, prev?: Record<string, unknown>) {
  const body: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) body[k] = v
    else if (prev && prev[k] !== undefined && prev[k] !== null) body[k] = null
  }
  delete body.id
  if (col === 'documents') {
    for (const k of Object.keys(body)) if (k !== 'nombre' && k !== 'meta') delete body[k]
  }
  if (col === 'encounters' && body.firmada === true) return { firmada: true } // el servidor fija firmadaEn/firmadoPor
  return body
}

/** Vuelve a leer un registro tras un error (el servidor es la fuente de verdad). */
function resync<C extends CollectionName>(col: C, id: ID, fallback: () => void) {
  const g = gen
  api<Item<C>>(`/${col}/${encodeURIComponent(id)}`)
    .then((obj) => g === gen && obj && replaceLocal(col, id, obj))
    .catch((e) => {
      if (g !== gen) return
      if (e instanceof ApiError && e.status === 404) removeLocal(col, id)
      else fallback()
    })
}

// Colecciones que el rol actual puede leer (evita pedir lo que el servidor negará con 403)
let readable: CollectionName[] = COLLECTIONS
export function setReadableCollections(cols: CollectionName[] | null) {
  readable = cols ?? COLLECTIONS
}

// Marca de sincronización incremental por colección (`?desde=`, encabezado X-Sync-Desde).
const syncDesde = new Map<CollectionName, string>()
/** Tras una lectura completa: el `Date` del servidor menos 30 s de margen (o el reloj local menos 2 min). */
function marcaDesde(res: Response): string {
  const d = Date.parse(res.headers.get('Date') ?? '')
  return new Date(Number.isFinite(d) ? d - 30_000 : Date.now() - 120_000).toISOString()
}

async function fetchCollection(c: CollectionName): Promise<AnyItem[]> {
  let marca: string | undefined
  const r = await api<AnyItem[]>('/' + c, { onResponse: (res) => (marca = marcaDesde(res)) })
  if (marca) syncDesde.set(c, marca)
  return Array.isArray(r) ? r : []
}

async function fetchCollections(): Promise<Partial<Record<CollectionName, AnyItem[]>>> {
  const out: Partial<Record<CollectionName, AnyItem[]>> = {}
  for (const c of COLLECTIONS) if (!readable.includes(c)) out[c] = []
  await Promise.all(
    readable.map(async (c) => {
      try {
        out[c] = await fetchCollection(c)
      } catch (e) {
        // sin permiso para esa colección (p. ej. recepción → notas): lista vacía
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) out[c] = []
        else throw e
      }
    }),
  )
  return out
}

function mergeSettings(remote: Partial<Settings> | undefined): Settings {
  const base = emptySettings()
  const r = remote ?? {}
  return {
    ...base,
    ...r,
    doctor: { ...base.doctor, ...(r.doctor ?? {}) },
    servicios: { ...(r.servicios ?? {}) },
    tema: localTema() ?? r.tema ?? 'claro',
    anthropicApiKey: state.settings.anthropicApiKey, // solo en memoria, nunca viene del servidor
    llavePrivada: undefined,
  }
}

/** Carga inicial tras iniciar sesión. */
export async function loadServer() {
  const g = gen
  const [cols, settings] = await Promise.all([fetchCollections(), api<Settings>('/settings').catch(() => undefined)])
  if (g !== gen) return
  state = { ...emptyDB(), ...(cols as Partial<DB>), settings: mergeSettings(settings) }
  restoreActivePatient()
  emit()
}

const sameJSON = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

function reconcile(col: CollectionName, local: AnyItem[], remote: AnyItem[]): AnyItem[] {
  const byId = new Map(local.map((x) => [x.id, x]))
  const seen = new Set<ID>()
  const out: AnyItem[] = []
  for (const r of remote) {
    seen.add(r.id)
    const l = byId.get(r.id)
    if (pending.has(col + ':' + r.id)) {
      if (l) out.push(l) // cambio local en curso: gana lo local
      continue
    }
    out.push(l && sameJSON(l, r) ? l : r)
  }
  for (const l of local) if (!seen.has(l.id) && pending.has(col + ':' + l.id)) out.push(l) // creaciones en curso
  if (out.length === local.length && out.every((x, i) => x === local[i])) return local
  return out
}

/** Aplica un lote incremental: `{ id, eliminado: true }` quita; el resto se agrega o reemplaza (idempotente). */
export function applyDelta(local: AnyItem[], delta: AnyItem[], isPending: (id: ID) => boolean): AnyItem[] {
  if (!delta.length) return local
  const out = [...local]
  const idx = new Map(out.map((x, i) => [x.id, i]))
  const quitar = new Set<ID>()
  let changed = false
  for (const r of delta) {
    if (!r || typeof r.id !== 'string' || isPending(r.id)) continue
    const i = idx.get(r.id)
    if (r.eliminado) {
      if (i !== undefined && !quitar.has(r.id)) {
        quitar.add(r.id)
        changed = true
      }
      continue
    }
    quitar.delete(r.id)
    if (i === undefined) {
      idx.set(r.id, out.length)
      out.push(r)
      changed = true
    } else if (!sameJSON(out[i], r)) {
      out[i] = r
      changed = true
    }
  }
  if (!changed) return local
  return quitar.size ? out.filter((x) => !quitar.has(x.id)) : out
}

/** Sincroniza una colección: incremental con `?desde=` si hay marca; si falla, lectura completa. */
async function syncCollection(c: CollectionName): Promise<{ full?: AnyItem[]; delta?: AnyItem[] }> {
  const desde = syncDesde.get(c)
  if (desde) {
    try {
      let next: string | undefined
      const delta = await api<AnyItem[]>('/' + c, { query: { desde }, onResponse: (res) => (next = res.headers.get('X-Sync-Desde') ?? undefined) })
      if (Array.isArray(delta)) {
        if (next) syncDesde.set(c, next)
        return { delta }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return { full: [] }
      /* cualquier otro error: lectura completa */
    }
  }
  try {
    return { full: await fetchCollection(c) }
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return { full: [] }
    throw e
  }
}

let refreshing = false
/** Sincroniza con el servidor (al volver a la ventana y cada 60 s) para ver cambios de otros usuarios. */
export async function refreshServer() {
  if (!isServer() || refreshing) return
  refreshing = true
  const g = gen
  try {
    const [res, settings] = await Promise.all([
      Promise.all(readable.map(async (c) => [c, await syncCollection(c)] as const)),
      pending.has('settings') ? Promise.resolve(undefined) : api<Settings>('/settings').catch(() => undefined),
    ])
    if (g !== gen) return
    const next = { ...state } as DB
    let changed = false
    for (const [c, r] of res) {
      const cur = state[c] as unknown as AnyItem[]
      const merged = r.full ? reconcile(c, cur, r.full) : applyDelta(cur, r.delta ?? [], (id) => pending.has(c + ':' + id))
      if (merged !== cur) {
        ;(next as unknown as Record<string, unknown>)[c] = merged
        changed = true
      }
    }
    if (settings && !pending.has('settings')) {
      const s = mergeSettings(settings)
      if (!sameJSON(s, state.settings)) {
        next.settings = s
        changed = true
      }
    }
    if (changed) {
      state = next
      emit()
    }
  } catch {
    /* sin red o sesión vencida: se reintenta en el siguiente ciclo */
  } finally {
    refreshing = false
  }
}

/** Reemplaza un registro con la versión del servidor (p. ej. tras una acción como bloquear o timbrar). */
export function applyServerItem<C extends CollectionName>(col: C, obj: Item<C>) {
  const arr = state[col] as Item<C>[]
  const id = (obj as AnyItem).id
  if (arr.some((x) => (x as AnyItem).id === id)) replaceLocal(col, id, obj)
  else setCol(col, [...arr, obj])
}
/** Quita un registro solo de la copia local (p. ej. paciente bloqueado). */
export function dropLocal(col: CollectionName, id: ID) {
  removeLocal(col, id)
}

/** Al cerrar sesión o vencer: borra todos los datos de memoria. */
export function clearServer() {
  gen++
  syncDesde.clear()
  queues.clear()
  pending.clear()
  dead.clear()
  pendingTotal = 0
  pendingListeners.forEach((l) => l())
  state = emptyDB()
  activePatient = null
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (pendingTotal > 0) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
}

// ---------- API pública ----------
export function uid(prefix = ''): ID {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function getDB(): DB {
  return state
}

type NewItem<C extends CollectionName> = Omit<Item<C>, 'id' | 'fecha'> & Partial<Pick<Item<C>, 'id'>> & { fecha?: string }

function addLocal<C extends CollectionName>(col: C, item: NewItem<C>): Item<C> {
  const full = { id: uid(), fecha: new Date().toISOString(), ...item } as unknown as Item<C>
  state = { ...state, [col]: [...(state[col] as Item<C>[]), full] }
  emit()
  persist()
  return full
}

function addRemote<C extends CollectionName>(col: C, full: Item<C>): Promise<Item<C>> {
  const id = (full as AnyItem).id
  const key = col + ':' + id
  const g = gen
  const p = enqueue(key, () => createRemote(col, full as unknown as AnyItem)) as Promise<Item<C>>
  return p.then(
    (saved) => {
      if (g === gen && saved && typeof saved === 'object' && isLast(key)) replaceLocal(col, id, saved)
      return saved ?? full
    },
    (e) => {
      if (g === gen && !(e instanceof Skip)) {
        dead.add(key)
        removeLocal(col, id)
      }
      throw e
    },
  )
}

export function add<C extends CollectionName>(col: C, item: NewItem<C>): Item<C> {
  if (bloqueado(col, item as Record<string, unknown>)) throw rechazarBloqueado()
  const full = addLocal(col, item)
  if (isServer()) addRemote(col, full).catch((e) => avisarError(e, 'No se guardó el registro'))
  return full
}

/** Como `add`, pero espera la respuesta del servidor y devuelve el objeto guardado (con folio, firma, URL…). */
export async function addAsync<C extends CollectionName>(col: C, item: NewItem<C>): Promise<Item<C>> {
  if (bloqueado(col, item as Record<string, unknown>)) throw rechazarBloqueado()
  const full = addLocal(col, item)
  if (!isServer()) return full
  return addRemote(col, full)
}

export function update<C extends CollectionName>(col: C, id: ID, patch: Partial<Item<C>>) {
  const prev = (state[col] as Item<C>[]).find((x) => (x as AnyItem).id === id)
  if (bloqueado(col, prev as unknown as Record<string, unknown>)) return void rechazarBloqueado()
  state = {
    ...state,
    [col]: (state[col] as Item<C>[]).map((x) => ((x as AnyItem).id === id ? { ...x, ...patch } : x)),
  }
  emit()
  persist()
  if (!isServer() || !prev) return
  const body = patchBody(col, patch as Record<string, unknown>, prev as unknown as Record<string, unknown>)
  if (!Object.keys(body).length) return
  const key = col + ':' + id
  const g = gen
  enqueue(key, () => api<Item<C>>(`/${col}/${encodeURIComponent(id)}`, { method: 'PATCH', body }))
    .then((saved) => {
      if (g === gen && saved && typeof saved === 'object' && isLast(key)) replaceLocal(col, id, saved)
    })
    .catch((e) => {
      if (g !== gen || e instanceof Skip) return
      avisarError(e, 'No se guardó el cambio')
      resync(col, id, () => replaceLocal(col, id, prev))
    })
}

export function remove<C extends CollectionName>(col: C, id: ID) {
  const arr = state[col] as Item<C>[]
  const idx = arr.findIndex((x) => (x as AnyItem).id === id)
  const prev = arr[idx]
  if (bloqueado(col, prev as unknown as Record<string, unknown>)) return void rechazarBloqueado()
  state = { ...state, [col]: arr.filter((x) => (x as AnyItem).id !== id) }
  emit()
  persist()
  if (!isServer() || !prev) return
  const key = col + ':' + id
  const g = gen
  enqueue(key, () => api(`/${col}/${encodeURIComponent(id)}`, { method: 'DELETE' })).catch((e) => {
    if (g !== gen || e instanceof Skip) return
    if (e instanceof ApiError && e.status === 404) return // ya no existía
    avisarError(e, 'No se eliminó')
    const cur = state[col] as Item<C>[]
    if (cur.some((x) => (x as AnyItem).id === id)) return
    const next = [...cur]
    next.splice(Math.min(idx, next.length), 0, prev)
    setCol(col, next)
  })
}

/** Agrega una adenda a una nota firmada. Servidor: POST /encounters/:id/adendas (pone fecha y autor). */
export async function addAdenda(encId: ID, texto: string): Promise<Encounter | undefined> {
  const enc = state.encounters.find((e) => e.id === encId)
  if (!enc) return
  const local = { fecha: new Date().toISOString(), texto, autor: state.settings.doctor.nombre || undefined }
  if (!isServer()) {
    update('encounters', encId, { adendas: [...enc.adendas, local] })
    return state.encounters.find((e) => e.id === encId)
  }
  replaceLocal('encounters', encId, { ...enc, adendas: [...enc.adendas, local] })
  const key = 'encounters:' + encId
  const g = gen
  try {
    const saved = await enqueue(key, () => api<Encounter>(`/encounters/${encodeURIComponent(encId)}/adendas`, { method: 'POST', body: { texto } }))
    if (g === gen && saved) replaceLocal('encounters', encId, saved)
    return saved
  } catch (e) {
    if (g === gen) {
      avisarError(e, 'No se agregó la adenda')
      resync('encounters', encId, () => replaceLocal('encounters', encId, enc))
    }
    throw e
  }
}

/** Cancela una receta emitida. Servidor: POST /prescriptions/:id/cancelar { motivo }. */
export async function cancelPrescription(id: ID, motivo: string): Promise<Prescription | undefined> {
  const rx = state.prescriptions.find((r) => r.id === id)
  if (!rx) return
  if (!isServer()) {
    update('prescriptions', id, { cancelada: true, motivoCancelacion: motivo })
    return state.prescriptions.find((r) => r.id === id)
  }
  const saved = await enqueue('prescriptions:' + id, () => api<Prescription>(`/prescriptions/${encodeURIComponent(id)}/cancelar`, { method: 'POST', body: { motivo } }))
  replaceLocal('prescriptions', id, saved ?? { ...rx, cancelada: true, motivoCancelacion: motivo })
  return saved
}

const LOCAL_SETTINGS: (keyof Settings)[] = ['tema', 'llavePrivada', 'llavePublica', 'anthropicApiKey']
const REMOTE_SETTINGS = ['clinica', 'servicios', 'doctor', 'doctorUserId']

/**
 * Modo servidor: `clinica`, `servicios` y `doctor` se guardan con PATCH /api/settings.
 * `tema` es preferencia de este navegador; la clave de IA vive solo en memoria; no hay llaves locales.
 */
export function updateSettings(patch: Partial<Settings> & { doctorUserId?: ID }) {
  const prev = state.settings
  const { doctorUserId: _ignored, ...visible } = patch
  void _ignored
  state = { ...state, settings: { ...state.settings, ...visible } }
  emit()
  persist()
  if (!isServer()) return
  if (patch.tema) {
    try {
      localStorage.setItem(LS_TEMA, patch.tema)
    } catch {
      /* ignorar */
    }
  }
  const body = Object.fromEntries(Object.entries(patch).filter(([k]) => REMOTE_SETTINGS.includes(k) && !LOCAL_SETTINGS.includes(k as keyof Settings)))
  if (!Object.keys(body).length) return
  const g = gen
  enqueue('settings', () => api<Settings>('/settings', { method: 'PATCH', body }))
    .then((saved) => {
      if (g === gen && saved && typeof saved === 'object' && isLast('settings')) {
        state = { ...state, settings: mergeSettings(saved) }
        emit()
      }
    })
    .catch((e) => {
      if (g !== gen) return
      avisarError(e, 'No se guardó la configuración')
      const restore: Record<string, unknown> = {}
      for (const k of Object.keys(body)) restore[k] = (prev as unknown as Record<string, unknown>)[k]
      state = { ...state, settings: { ...state.settings, ...restore } }
      emit()
    })
}

export function replaceDB(next: DB) {
  if (isServer()) return void toast('En modo servidor los datos se administran en el servidor.', 'warn')
  state = next
  emit()
  persist()
}

export function resetDB() {
  if (isServer()) return void toast('En modo servidor no se pueden restablecer los datos de demostración.', 'warn')
  state = seedDB()
  activePatient = state.patients[0]?.id ?? null
  emit()
  persist()
}

export function setActivePatient(id: ID | null) {
  activePatient = id
  try {
    if (id) localStorage.setItem(LS_ACTIVO, id)
  } catch {
    /* ignorar */
  }
  emit()
}

/** URL absoluta de un archivo del servidor (útil para mostrar documentos). */
export const fileUrl = (id: ID) => `${API_BASE}/files/${encodeURIComponent(id)}`

// ---------- Hooks ----------
export function useDB(): DB {
  return useSyncExternalStore(subscribe, () => state)
}

// `deps`: valores que usa el filtro (ej. [patientId]) para memoizar el resultado.
export function useCollection<C extends CollectionName>(
  col: C,
  filter?: (x: Item<C>) => boolean,
  deps: unknown[] = [],
): Item<C>[] {
  const arr = useSyncExternalStore(subscribe, () => state[col]) as Item<C>[]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (filter ? arr.filter(filter) : arr), [arr, ...deps])
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => state.settings)
}

export function useActivePatient() {
  const id = useSyncExternalStore(subscribe, () => activePatient)
  const patients = useSyncExternalStore(subscribe, () => state.patients)
  const patient = patients.find((p) => p.id === id) ?? null
  return { id, patient, setActive: setActivePatient }
}

/** Número de escrituras pendientes de confirmar por el servidor. */
export function usePendingWrites(): number {
  return useSyncExternalStore(
    (fn) => {
      pendingListeners.add(fn)
      return () => pendingListeners.delete(fn)
    },
    () => pendingTotal,
  )
}
