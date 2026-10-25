import { useEffect, useMemo, useRef, useState } from 'react'
import { Bluetooth, BluetoothConnected, FlaskConical, Save, Unplug } from 'lucide-react'
import { Page, Card, Button, Field, Input, Badge, Stat, Notice, PatientBar, Unsupported, Disclaimer, Tabs } from '../../components/ui'
import { add, useActivePatient, useCollection } from '../../lib/store'
import { OBS_LABELS, fmtFechaHora, cx } from '../../lib/utils'
import { PERFILES, bluetooth, conectar, type Conexion, type Lectura, type Perfil } from './ble'

const CODIGOS = ['pas', 'pad', 'fc', 'fr', 'temp', 'spo2', 'peso', 'talla', 'imc', 'glucosa'] as const

// Rangos plausibles (fisiológicamente posibles), no rangos normales
const RANGOS: Record<string, [number, number]> = {
  pas: [50, 280], pad: [25, 180], fc: [20, 250], fr: [4, 70], temp: [30, 44], spo2: [50, 100],
  peso: [0.3, 400], talla: [30, 250], glucosa: [10, 1500],
}

function guardar(patientId: string, valores: Record<string, number>, fuente: 'bluetooth' | 'manual', etiqueta?: string, fecha?: string) {
  for (const [codigo, valor] of Object.entries(valores)) {
    if (!Number.isFinite(valor)) continue
    add('observations', { patientId, codigo, valor, unidad: OBS_LABELS[codigo]?.unidad ?? '', fuente, etiqueta, ...(fecha ? { fecha } : {}) })
  }
}

function fmtValores(v: Record<string, number>) {
  return Object.entries(v).map(([k, x]) => ({ k, label: OBS_LABELS[k]?.label ?? k, valor: x, unidad: OBS_LABELS[k]?.unidad ?? '' }))
}

type Estado = 'desconectado' | 'conectando' | 'conectado' | 'simulado' | 'error'

function DeviceCard({ p, soporte, patientId }: { p: Perfil; soporte: boolean; patientId: string | null }) {
  const [estado, setEstado] = useState<Estado>('desconectado')
  const [msg, setMsg] = useState('')
  const [lectura, setLectura] = useState<(Lectura & { t: string }) | null>(null)
  const [n, setN] = useState(0)
  const [guardado, setGuardado] = useState(false)
  const con = useRef<Conexion | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const recibir = (l: Lectura) => {
    setLectura({ ...l, t: new Date().toISOString() })
    setN((x) => x + 1)
    setGuardado(false)
  }
  const parar = () => {
    clearInterval(timer.current)
    con.current?.desconectar()
    con.current = null
    setEstado('desconectado')
  }
  useEffect(() => () => { clearInterval(timer.current); con.current?.desconectar() }, [])

  const onConectar = async () => {
    parar()
    setEstado('conectando')
    setMsg('')
    try {
      con.current = await conectar(p, recibir, () => { setEstado('desconectado'); setMsg('El aparato se desconectó') })
      setEstado('conectado')
      setMsg(con.current.nombre + (p.racp ? ' · solicitando todos los registros…' : ' · esperando medición'))
    } catch (e) {
      const err = e as Error
      setEstado(err.name === 'NotFoundError' ? 'desconectado' : 'error')
      setMsg(err.name === 'NotFoundError' ? 'Búsqueda cancelada' : err.message)
    }
  }
  const onSimular = () => {
    parar()
    setEstado('simulado')
    setMsg('Generando paquetes GATT de ejemplo')
    // la muestra se construye byte por byte y pasa por el mismo decodificador
    const tick = () => recibir(p.chars.length > 1 ? (Math.random() < 0.5 ? p.chars[0] : p.chars[1]).parse(p.muestra()) : p.chars[0].parse(p.muestra()))
    tick()
    timer.current = setInterval(tick, p.id === 'hr' || p.id === 'plx' ? 1000 : 4000)
  }

  const tone = estado === 'conectado' ? 'ok' : estado === 'simulado' ? 'brand' : estado === 'error' ? 'danger' : estado === 'conectando' ? 'warn' : 'neutral'
  const valores = lectura ? fmtValores(lectura.valores) : []
  return (
    <Card
      title={<span className="flex items-center gap-2">{estado === 'conectado' ? <BluetoothConnected className="size-4 text-ok" /> : <Bluetooth className="size-4 text-muted" />}{p.nombre}</span>}
      actions={<Badge tone={tone}>{estado}</Badge>}
    >
      <div className="text-xs text-muted">Servicio {p.servicioNombre} · 0x{p.servicio.toString(16).toUpperCase()}</div>
      <div className="mt-3 flex min-h-20 flex-wrap items-end gap-x-5 gap-y-2">
        {valores.length ? valores.map((v) => (
          <div key={v.k}>
            <div className="text-[11px] text-muted">{v.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{v.valor}<span className="ml-1 text-xs font-normal text-muted">{v.unidad}</span></div>
          </div>
        )) : <div className="text-sm text-muted">Sin lecturas</div>}
      </div>
      {lectura && <div className="mt-1 text-xs text-muted">{[lectura.detalle, lectura.fechaAparato && 'fecha del aparato ' + fmtFechaHora(lectura.fechaAparato), `${n} paquete(s)`].filter(Boolean).join(' · ')}</div>}
      {msg && <div className={cx('mt-1 text-xs', estado === 'error' ? 'text-danger' : 'text-muted')}>{msg}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {estado === 'conectado' || estado === 'simulado' ? (
          <Button size="sm" onClick={parar}><Unplug className="size-4" />Detener</Button>
        ) : (
          <Button size="sm" onClick={onConectar} disabled={!soporte || estado === 'conectando'}><Bluetooth className="size-4" />Conectar</Button>
        )}
        <Button size="sm" variant="ghost" onClick={onSimular}><FlaskConical className="size-4" />Simular aparato</Button>
        <Button
          size="sm"
          variant="primary"
          className="ml-auto"
          disabled={!lectura || !patientId || guardado || !valores.length}
          onClick={() => {
            if (!lectura || !patientId) return
            guardar(patientId, lectura.valores, 'bluetooth', p.nombre + (estado === 'simulado' ? ' (simulado)' : ''), lectura.fechaAparato)
            setGuardado(true)
          }}
        >
          <Save className="size-4" />{guardado ? 'Guardado' : 'Guardar'}
        </Button>
      </div>
    </Card>
  )
}

function ManualForm({ patientId }: { patientId: string | null }) {
  const [f, setF] = useState<Record<string, string>>({})
  const [ok, setOk] = useState('')
  const num = (k: string) => (f[k]?.trim() ? Number(f[k].replace(',', '.')) : NaN)
  const pk = num('peso'), tc = num('talla')
  const imc = pk > 0 && tc > 0 ? Math.round((pk / (tc / 100) ** 2) * 10) / 10 : NaN
  const errores: Record<string, string> = {}
  for (const k of Object.keys(RANGOS)) {
    const v = num(k)
    if (f[k]?.trim() && (!Number.isFinite(v) || v < RANGOS[k][0] || v > RANGOS[k][1])) errores[k] = `Fuera de rango plausible (${RANGOS[k][0]}–${RANGOS[k][1]})`
  }
  if (Number.isFinite(num('pas')) && Number.isFinite(num('pad')) && num('pad') >= num('pas')) errores.pad = 'La diastólica debe ser menor que la sistólica'
  const llenos = Object.keys(RANGOS).filter((k) => f[k]?.trim())
  const puede = !!patientId && llenos.length > 0 && Object.keys(errores).length === 0

  const campo = (k: string, step = '1') => (
    <Field key={k} label={`${OBS_LABELS[k].label} (${OBS_LABELS[k].unidad})`} hint={errores[k] && <span className="text-danger">{errores[k]}</span>}>
      <Input inputMode="decimal" type="number" step={step} value={f[k] ?? ''} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setOk('') }} className={errores[k] ? 'border-danger' : ''} />
    </Field>
  )
  return (
    <Card title="Captura manual">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {campo('pas')}{campo('pad')}{campo('fc')}{campo('fr')}{campo('temp', '0.1')}
        {campo('spo2')}{campo('glucosa')}{campo('peso', '0.1')}{campo('talla', '0.1')}
        <Field label="IMC (kg/m²)" hint="Automático">
          <div className="flex h-[38px] items-center rounded-lg border border-line bg-surface-2 px-3 text-sm tabular-nums">{Number.isFinite(imc) ? imc : '—'}</div>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!puede}
          onClick={() => {
            const v: Record<string, number> = {}
            for (const k of llenos) v[k] = num(k)
            if (Number.isFinite(imc)) v.imc = imc
            guardar(patientId!, v, 'manual')
            setF({})
            setOk(`${Object.keys(v).length} signo(s) guardado(s)`)
          }}
        >
          <Save className="size-4" />Guardar signos
        </Button>
        {ok && <span className="text-sm text-ok">{ok}</span>}
      </div>
    </Card>
  )
}

function Ultimos({ patientId }: { patientId: string | null }) {
  const obs = useCollection('observations', (o) => o.patientId === patientId && (CODIGOS as readonly string[]).includes(o.codigo), [patientId])
  const ult = useMemo(() => {
    const m: Record<string, (typeof obs)[number]> = {}
    for (const o of obs) if (!m[o.codigo] || o.fecha > m[o.codigo].fecha) m[o.codigo] = o
    return m
  }, [obs])
  if (!patientId) return null
  const pa = ult.pas ? `${Math.round(ult.pas.valor)}/${ult.pad ? Math.round(ult.pad.valor) : '—'}` : '—'
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <Stat label="Presión arterial" value={pa} sub={ult.pas ? 'mmHg · ' + fmtFechaHora(ult.pas.fecha) : 'mmHg'} tone={ult.pas && (ult.pas.valor >= 140 || (ult.pad?.valor ?? 0) >= 90) ? 'warn' : undefined} />
      {(['fc', 'temp', 'spo2', 'glucosa', 'peso', 'imc'] as const).map((k) => (
        <Stat key={k} label={OBS_LABELS[k].label} value={ult[k] ? Math.round(ult[k].valor * 10) / 10 : '—'} sub={ult[k] ? `${OBS_LABELS[k].unidad} · ${fmtFechaHora(ult[k].fecha)}` : OBS_LABELS[k].unidad}
          tone={k === 'spo2' && ult[k] && ult[k].valor < 92 ? 'danger' : k === 'temp' && ult[k] && ult[k].valor >= 38 ? 'warn' : undefined} />
      ))}
    </div>
  )
}

export default function Vitales() {
  const { id } = useActivePatient()
  const soporte = !!bluetooth()
  const [tab, setTab] = useState<'aparatos' | 'manual' | 'perfiles'>('aparatos')
  return (
    <Page title="Signos vitales" subtitle="Aparatos Bluetooth estándar (GATT), simulación y captura manual">
      <PatientBar />
      <Ultimos patientId={id} />
      <Tabs tabs={[{ id: 'aparatos', label: 'Aparatos Bluetooth' }, { id: 'manual', label: 'Captura manual' }, { id: 'perfiles', label: 'Perfiles compatibles' }]} value={tab} onChange={setTab} />
      {tab === 'aparatos' && (
        <>
          {!soporte && <Unsupported api="Web Bluetooth">Úsalo en Chrome o Edge (PC/Android) con HTTPS y fuera de un iframe. Mientras tanto, "Simular aparato" y la captura manual funcionan.</Unsupported>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PERFILES.map((p) => <DeviceCard key={p.id} p={p} soporte={soporte} patientId={id} />)}
          </div>
          <Disclaimer>Las lecturas provienen del aparato; verifica que esté validado clínicamente y calibrado. Revisa cada valor antes de guardarlo.</Disclaimer>
        </>
      )}
      {tab === 'manual' && <ManualForm patientId={id} />}
      {tab === 'perfiles' && (
        <Card title="Perfiles GATT soportados" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr><th className="px-4 py-2">Aparato</th><th className="px-4 py-2">Servicio</th><th className="px-4 py-2">Característica</th><th className="px-4 py-2">Ejemplos</th></tr>
              </thead>
              <tbody>
                {PERFILES.map((p) => (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="px-4 py-2 font-medium">{p.nombre}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{p.servicioNombre} <span className="text-muted">0x{p.servicio.toString(16).toUpperCase()}</span></td>
                    <td className="px-4 py-2">{p.chars.map((c) => `${c.nombre} 0x${c.uuid.toString(16).toUpperCase()}`).join(' / ')}</td>
                    <td className="px-4 py-2 text-muted">{p.ejemplos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4">
            <Notice tone="warn">
              Muchos aparatos económicos (marcas genéricas de oxímetros, baumanómetros y básculas) usan protocolos <b>propietarios</b> que solo funcionan con su app; no aparecerán en la búsqueda. Antes de comprar, verifica que declaren soporte del perfil Bluetooth estándar (p. ej. “Bluetooth SIG Blood Pressure Profile”, Continua/PHD).
            </Notice>
            <p className="text-xs text-muted">Valores IEEE-11073 SFLOAT/FLOAT con valores especiales (NaN, NRes, ±INF). Las unidades kPa, °F, lb y mol/L se convierten automáticamente a mmHg, °C, kg y mg/dL. El glucómetro descarga su memoria con RACP (“todos los registros”).</p>
          </div>
        </Card>
      )}
    </Page>
  )
}
