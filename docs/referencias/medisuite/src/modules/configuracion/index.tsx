import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Database, Download, HardDrive, KeyRound, Loader2, Moon, RefreshCw, RotateCcw, Save, ShieldCheck, Sun, Upload } from 'lucide-react'
import { Page, Card, Button, Field, Input, Notice, Badge } from '../../components/ui'
import { getDB, replaceDB, resetDB, updateSettings, useSettings } from '../../lib/store'
import type { DB, Settings } from '../../lib/types'
import { downloadBlob } from '../../lib/utils'
import { generarLlaves } from '../receta/firma'
import { api, apiUrl, errorMessage, isServer } from '../../lib/api'
import { useCan, useSession } from '../../lib/session'
import { EstadoServidor, LlavesFirma } from './Servidor'
import { confirmar } from '../../components/dialogos'

const COLECCIONES = ['patients', 'appointments', 'encounters', 'observations', 'prescriptions', 'documents', 'payments'] as const
// v2: `registros` (opcional en respaldos v1, que no la tenían)
const COLECCIONES_V2 = [...COLECCIONES, 'registros'] as const
const fmtBytes = (b: number) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' KB')

/** Valida la forma básica de un respaldo antes de reemplazar la base. */
function validarDB(x: unknown): string | null {
  if (!x || typeof x !== 'object') return 'El archivo no contiene un objeto JSON.'
  const d = x as Record<string, unknown>
  if (typeof d.version !== 'number') return 'Falta el campo "version".'
  if (d.version !== 1 && d.version !== getDB().version) return `Versión de respaldo ${d.version} incompatible (se espera 1 a ${getDB().version}).`
  if (d.registros !== undefined) {
    if (!Array.isArray(d.registros)) return 'La colección "registros" no es una lista.'
    if ((d.registros as unknown[]).some((i) => {
      const r = i as { id?: unknown; tipo?: unknown; datos?: unknown }
      return !r || typeof r.id !== 'string' || typeof r.tipo !== 'string' || !r.datos || typeof r.datos !== 'object' || Array.isArray(r.datos)
    }))
      return 'Hay registros sin "id", "tipo" o "datos" en "registros".'
  }
  for (const c of COLECCIONES) {
    if (!Array.isArray(d[c])) return `Falta la colección "${c}" o no es una lista.`
    if ((d[c] as unknown[]).some((i) => !i || typeof (i as { id?: unknown }).id !== 'string')) return `Hay elementos sin "id" en "${c}".`
  }
  const s = d.settings as Settings | undefined
  if (!s || typeof s !== 'object' || !s.doctor || typeof s.doctor.nombre !== 'string') return 'Falta la configuración del médico ("settings.doctor").'
  const pids = new Set((d.patients as { id: string }[]).map((p) => p.id))
  const huerfanos = COLECCIONES_V2.filter((c) => c !== 'patients').reduce((n, c) => n + ((d[c] ?? []) as { patientId?: string }[]).filter((i) => i.patientId && !pids.has(i.patientId)).length, 0)
  if (huerfanos) return `${huerfanos} registros hacen referencia a pacientes inexistentes.`
  return null
}

export default function Configuracion() {
  const s = useSettings()
  const [doc, setDoc] = useState(s.doctor)
  const [clinica, setClinica] = useState(s.clinica)
  const [serv, setServ] = useState(s.servicios)
  const [apiKey, setApiKey] = useState(s.anthropicApiKey ?? '')
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const [uso, setUso] = useState<{ usage?: number; quota?: number; persistido?: boolean } | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const server = isServer()
  const puedePerfil = useCan('perfil.escribir')
  const puedeConfig = useCan('config.escribir')
  const puedeExportar = useCan('exportar')
  const [exportando, setExportando] = useState(false)
  const esAdmin = useSession().user?.rol === 'admin'

  // Si la configuración cambia desde fuera (importar/restablecer), refrescar formularios
  useEffect(() => {
    setDoc(s.doctor)
    setClinica(s.clinica)
    setServ(s.servicios)
    setApiKey(s.anthropicApiKey ?? '')
  }, [s.doctor, s.clinica, s.servicios, s.anthropicApiKey])

  const medirAlmacenamiento = async () => {
    const est = await navigator.storage?.estimate?.().catch(() => undefined)
    const persistido = await navigator.storage?.persisted?.().catch(() => undefined)
    setUso({ usage: est?.usage, quota: est?.quota, persistido })
  }
  useEffect(() => {
    if (!isServer()) medirAlmacenamiento()
  }, [])

  const aviso = (tone: 'info' | 'warn' | 'danger', text: string) => {
    setMsg({ tone, text })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const setD = (k: keyof Settings['doctor']) => (e: ChangeEvent<HTMLInputElement>) => setDoc((d) => ({ ...d, [k]: e.target.value }))

  const guardarPerfil = () => {
    if (doc.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(doc.rfc.toUpperCase())) return aviso('warn', 'El RFC no tiene un formato válido.')
    if (server) {
      // PATCH /api/settings: el médico actualiza su propio perfil; el admin, el del médico mostrado (doctorUserId si el servidor lo indica)
      const doctorUserId = (s as unknown as { doctorUserId?: string }).doctorUserId
      updateSettings({ doctor: { ...doc, rfc: doc.rfc?.toUpperCase() }, ...(puedeConfig ? { clinica } : {}), ...(puedeConfig && doctorUserId ? { doctorUserId } : {}) })
      aviso('info', 'Guardando perfil en el servidor…')
      return
    }
    updateSettings({ doctor: { ...doc, rfc: doc.rfc?.toUpperCase() }, clinica })
    aviso('info', 'Perfil guardado.')
  }
  const guardarServicios = () => {
    // En servidor, una cadena vacía borra la URL (undefined no viaja en JSON)
    const limpio = Object.fromEntries(Object.entries(serv).map(([k, v]) => [k, (v ?? '').trim().replace(/\/+$/, '') || (server ? '' : undefined)]))
    const malo = Object.entries(limpio).find(([, v]) => v && !/^https?:\/\//.test(v))
    if (malo) return aviso('warn', `La URL de ${malo[0]} debe iniciar con http:// o https://`)
    updateSettings(server && !puedeConfig ? { anthropicApiKey: apiKey.trim() || undefined } : { servicios: limpio, anthropicApiKey: apiKey.trim() || undefined })
    aviso('info', 'Servicios guardados.')
  }

  const llaves = async () => {
    if (s.llavePrivada && !(await confirmar('Al regenerar las llaves, las recetas firmadas anteriormente ya no se podrán verificar con la nueva llave pública.', { aceptar: 'Regenerar' }))) return
    await generarLlaves()
    aviso('info', 'Par de llaves ES256 generado.')
  }

  const exportarServidor = async () => {
    setExportando(true)
    try {
      const data = await api('/export', { timeout: 120_000 })
      const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `medisuite-servidor-${fecha}.json`)
      aviso('info', 'Exportación descargada. Queda registrada en la bitácora.')
    } catch (e) {
      aviso('danger', 'No se pudo exportar: ' + errorMessage(e))
    } finally {
      setExportando(false)
    }
  }

  const exportar = () => {
    const db = getDB()
    const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    downloadBlob(new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }), `medisuite-respaldo-${fecha}.json`)
  }
  const importar = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      const err = validarDB(data)
      if (err) return aviso('danger', 'Respaldo inválido: ' + err)
      // Respaldo v1 (sin `registros`): se migra a la versión actual con la colección vacía.
      const d = { ...(data as DB), registros: (data as Partial<DB>).registros ?? [], version: getDB().version } as DB
      const resumen = COLECCIONES_V2.map((c) => `${d[c].length} ${c}`).join(', ')
      if (!(await confirmar(`Se reemplazarán TODOS los datos actuales por el respaldo:\n${resumen}`, { titulo: 'Importar respaldo', aceptar: 'Reemplazar datos', peligro: true }))) return
      replaceDB({ ...getDB(), ...d, settings: { ...getDB().settings, ...d.settings } })
      aviso('info', 'Respaldo importado correctamente.')
    } catch (e) {
      aviso('danger', 'No se pudo leer el archivo: ' + (e as Error).message)
    } finally {
      if (archivo.current) archivo.current.value = ''
    }
  }
  const restablecer = async () => {
    if (!(await confirmar('Se borrarán todos los datos y se cargarán los datos de demostración. Esta acción no se puede deshacer; exporta un respaldo antes si lo necesitas.', { titulo: 'Restablecer datos de demostración', aceptar: 'Borrar y restablecer', peligro: true }))) return
    resetDB()
    aviso('info', 'Datos de demostración restablecidos.')
  }
  const persistir = async () => {
    if (!navigator.storage?.persist) return aviso('warn', 'Este navegador no permite solicitar almacenamiento persistente.')
    const ok = await navigator.storage.persist()
    aviso(ok ? 'info' : 'warn', ok ? 'Almacenamiento persistente concedido: el navegador no borrará los datos automáticamente.' : 'El navegador no concedió el almacenamiento persistente (suele concederse al instalar la app o tras uso frecuente).')
    medirAlmacenamiento()
  }

  const db = getDB()
  const pct = uso?.usage && uso.quota ? (uso.usage / uso.quota) * 100 : 0

  return (
    <Page title="Configuración" subtitle={server ? 'Perfil, preferencias y datos de la clínica (servidor)' : 'Perfil, servicios, llaves de firma y respaldo'}>
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Perfil del médico" className="lg:row-span-2" actions={<Button size="sm" variant="primary" onClick={guardarPerfil} disabled={!puedePerfil}><Save className="size-4" /> Guardar</Button>}>
          {server && !puedePerfil && <Notice tone="info">Solo lectura: el perfil lo editan el médico o el administrador.</Notice>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre completo (con título)" className="sm:col-span-2">
              <Input value={doc.nombre} onChange={setD('nombre')} />
            </Field>
            <Field label="Especialidad">
              <Input value={doc.especialidad} onChange={setD('especialidad')} />
            </Field>
            <Field label="Universidad / institución">
              <Input value={doc.universidad} onChange={setD('universidad')} />
            </Field>
            <Field label="Cédula profesional">
              <Input value={doc.cedula} onChange={setD('cedula')} inputMode="numeric" />
            </Field>
            <Field label="Cédula de especialidad">
              <Input value={doc.cedulaEspecialidad ?? ''} onChange={setD('cedulaEspecialidad')} inputMode="numeric" />
            </Field>
            <Field label="Domicilio del consultorio" className="sm:col-span-2" hint="Incluye el código postal: se usa como lugar de expedición del CFDI.">
              <Input value={doc.direccion} onChange={setD('direccion')} />
            </Field>
            <Field label="Teléfono">
              <Input value={doc.telefono} onChange={setD('telefono')} type="tel" />
            </Field>
            <Field label="Correo">
              <Input value={doc.email} onChange={setD('email')} type="email" />
            </Field>
            <Field label="RFC">
              <Input value={doc.rfc ?? ''} onChange={setD('rfc')} className="font-mono uppercase" maxLength={13} />
            </Field>
            <Field label="Nombre de la clínica">
              <Input value={clinica} onChange={(e) => setClinica(e.target.value)} disabled={server && !puedeConfig} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted">La receta impresa debe incluir nombre, institución que expidió el título, cédula profesional y de especialidad, domicilio y teléfono (Reglamento de Insumos para la Salud, art. 29).</p>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
            <span className="text-sm font-medium">Tema</span>
            <Button size="sm" variant={s.tema === 'claro' ? 'primary' : 'secondary'} onClick={() => updateSettings({ tema: 'claro' })}>
              <Sun className="size-4" /> Claro
            </Button>
            <Button size="sm" variant={s.tema === 'oscuro' ? 'primary' : 'secondary'} onClick={() => updateSettings({ tema: 'oscuro' })}>
              <Moon className="size-4" /> Oscuro
            </Button>
          </div>
        </Card>

        {(!server || puedeConfig || puedePerfil) && (
        <Card title="Servicios de servidor" actions={<Button size="sm" variant="primary" onClick={guardarServicios}><Save className="size-4" /> Guardar</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['orthanc', 'Orthanc (DICOMweb)', 'https://pacs.miclinica.mx/dicom-web'],
                ['ohif', 'Visor OHIF', 'https://ohif.miclinica.mx'],
                ['whisper', 'Whisper (dictado)', 'https://ia.miclinica.mx/whisper'],
                ['presidio', 'Presidio (anonimización)', 'https://ia.miclinica.mx/presidio'],
              ] as const
            ).map(([k, l, ph]) => (
              <Field key={k} label={l}>
                <Input type="url" value={serv[k] ?? ''} placeholder={ph} disabled={server && !puedeConfig} onChange={(e) => setServ((x) => ({ ...x, [k]: e.target.value }))} />
              </Field>
            ))}
            <Field label="Clave API de Anthropic" className="sm:col-span-2">
              <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" />
            </Field>
          </div>
          {server ? (
            <Notice tone="info">La clave de IA no se envía al servidor ni se guarda en el navegador: solo vive en memoria durante esta sesión.</Notice>
          ) : (
            <Notice tone="warn">
              Una clave guardada en el navegador puede ser leída por cualquier script o persona con acceso a este equipo. Úsala solo para demostraciones; en producción la clave
              debe vivir en tu servidor (proxy) y nunca en el cliente.
            </Notice>
          )}
        </Card>
        )}

        {server && (
          <Card title={<span className="flex items-center gap-2"><KeyRound className="size-4" /> Firma de recetas</span>}>
            <div className="mb-2">
              <Badge tone="ok">
                <ShieldCheck className="mr-1 size-3" /> ES256 en el servidor
              </Badge>
            </div>
            <p className="text-sm text-muted">
              Las recetas las firma el servidor con la llave de la clínica; la llave privada nunca sale del servidor. Las farmacias verifican con el QR o con la llave pública publicada en{' '}
              <a className="text-brand underline" href={apiUrl('/public/jwks')} target="_blank" rel="noreferrer">
                JWKS
              </a>
              .
            </p>
          </Card>
        )}

        {server && esAdmin && <LlavesFirma />}
        {server && esAdmin && <EstadoServidor />}

        {server && puedeExportar && (
          <Card title={<span className="flex items-center gap-2"><Database className="size-4" /> Exportar datos (servidor)</span>}>
            <p className="text-sm text-muted">Descarga un JSON con todas las colecciones de la organización (respaldo y portabilidad). La exportación queda registrada en la bitácora.</p>
            <Button className="mt-3" variant="primary" onClick={exportarServidor} disabled={exportando}>
              {exportando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Exportar datos (servidor)
            </Button>
            <p className="mt-2 text-xs text-muted">Protégelo como información clínica sensible.</p>
          </Card>
        )}

        {!server && (<>

        <Card title={<span className="flex items-center gap-2"><KeyRound className="size-4" /> Llaves de firma de recetas</span>}>
          {s.llavePublica ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="ok">
                  <ShieldCheck className="mr-1 size-3" /> ES256 activa
                </Badge>
                {typeof (s.llavePublica as { kid?: string }).kid === 'string' && <span className="font-mono text-xs text-muted">kid {(s.llavePublica as { kid?: string }).kid}</span>}
              </div>
              <pre className="max-h-40 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px]">{JSON.stringify(s.llavePublica, null, 2)}</pre>
            </>
          ) : (
            <p className="text-sm text-muted">Aún no hay llaves. Se generan automáticamente al firmar la primera receta, o puedes generarlas aquí.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={llaves}>
              <RefreshCw className="size-4" /> {s.llavePrivada ? 'Regenerar llaves' : 'Generar llaves'}
            </Button>
            <Button
              disabled={!s.llavePublica}
              onClick={() => downloadBlob(new Blob([JSON.stringify({ keys: [s.llavePublica] }, null, 2)], { type: 'application/json' }), 'medisuite-jwks.json')}
            >
              <Download className="size-4" /> Exportar llave pública (JWKS)
            </Button>
            <Button
              variant="ghost"
              disabled={!s.llavePrivada}
              onClick={async () => {
                if (await confirmar('La llave privada permite firmar recetas a tu nombre. Guárdala en un lugar seguro.', { titulo: 'Exportar llave privada', aceptar: 'Exportar' }))
                  downloadBlob(new Blob([JSON.stringify(s.llavePrivada, null, 2)], { type: 'application/json' }), 'medisuite-llave-privada.jwk.json')
              }}
            >
              Exportar llave privada
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">En producción, la llave privada se resguarda en el servidor (o HSM) y la pública se publica como JWKS para que las farmacias verifiquen.</p>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Database className="size-4" /> Respaldo de datos</span>}>
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            {COLECCIONES.map((c) => (
              <Badge key={c}>
                {c}: {db[c].length}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={exportar}>
              <Download className="size-4" /> Exportar JSON
            </Button>
            <Button onClick={() => archivo.current?.click()}>
              <Upload className="size-4" /> Importar JSON
            </Button>
            <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
            <Button variant="danger" onClick={restablecer}>
              <RotateCcw className="size-4" /> Restablecer demo
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">El respaldo incluye pacientes, notas, documentos y la configuración (incluidas las llaves y la clave API): protégelo como información clínica sensible.</p>
        </Card>

        <Card title={<span className="flex items-center gap-2"><HardDrive className="size-4" /> Almacenamiento del navegador</span>}>
          {uso?.usage !== undefined ? (
            <>
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  <b className="tabular-nums">{fmtBytes(uso.usage)}</b> usados
                </span>
                <span className="text-muted">de {fmtBytes(uso.quota ?? 0)} disponibles</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(pct, 0.5)}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Este navegador no informa el uso de almacenamiento.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {uso?.persistido ? <Badge tone="ok">Persistente</Badge> : <Badge tone="warn">No persistente</Badge>}
            <Button size="sm" onClick={persistir} disabled={uso?.persistido}>
              Solicitar almacenamiento persistente
            </Button>
            <Button size="sm" variant="ghost" onClick={medirAlmacenamiento}>
              <RefreshCw className="size-3.5" /> Actualizar
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">Sin almacenamiento persistente, el navegador puede borrar los datos si le falta espacio. Exporta respaldos con regularidad.</p>
        </Card>
        </>)}
      </div>
    </Page>
  )
}
