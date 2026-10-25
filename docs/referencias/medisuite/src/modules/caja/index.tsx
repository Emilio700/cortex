import { useMemo, useState } from 'react'
import { BadgeCheck, Download, FileCode2, Loader2, Plus, Printer, Receipt, Stamp, Trash2 } from 'lucide-react'
import { Page, Card, Button, Field, Input, Select, Badge, Stat, Tabs, Notice, Empty, Modal } from '../../components/ui'
import { add, remove, update, useCollection, useActivePatient, useSettings, refreshServer } from '../../lib/store'
import type { Factura, Payment } from '../../lib/types'
import { api, ApiError, errorMessage, isServer } from '../../lib/api'
import { usePreferencia } from '../../lib/preferencias'
import { useServicio } from '../../lib/health'
import { useCan } from '../../lib/session'
import { FacturaModal, FacturaPanel, FacturasTab } from './facturas'
import { toast } from '../../components/toast'
import { downloadBlob, fmtFecha, fmtFechaHora, mxn, nombreCompleto } from '../../lib/utils'
import { registrarExportacion } from '../../lib/auditoria'
import { CLAVES, FORMAS, REGIMENES, RFC_GENERICO, RFC_RE, USOS, construirCFDI, retencionISR } from './cfdi'
import { confirmar } from '../../components/dialogos'

type Metodo = Payment['metodo']
const METODOS: Metodo[] = ['efectivo', 'tarjeta', 'transferencia']
const ETQ: Record<Metodo, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }
const LS_PRECIOS = 'medisuite.precios'
interface Precio {
  concepto: string
  monto: number
}
const PRECIOS_BASE: Precio[] = [
  { concepto: 'Consulta primera vez', monto: 1000 },
  { concepto: 'Consulta subsecuente', monto: 800 },
  { concepto: 'Videoconsulta', monto: 700 },
  { concepto: 'Procedimiento menor', monto: 1800 },
  { concepto: 'Certificado médico', monto: 400 },
  { concepto: 'Electrocardiograma', monto: 600 },
]
const diaLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const hoy = () => diaLocal(new Date())
const dia = (iso: string) => diaLocal(new Date(iso))
// Nombre fiscal: mayúsculas sin acentos (conserva Ñ), como en la Constancia de Situación Fiscal
const nombreFiscal = (s: string) => s.toUpperCase().replace(/Ñ/g, '\u0000').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0000/g, 'Ñ')

export default function Caja() {
  const [tab, setTab] = useState<'cobros' | 'corte' | 'precios' | 'facturas'>('cobros')
  const server = isServer()
  const pagos = useCollection('payments')
  const patients = useCollection('patients')
  const nombre = useMemo(() => {
    const m = new Map(patients.map((p) => [p.id, nombreCompleto(p)]))
    return (id: string) => m.get(id) ?? '—'
  }, [patients])
  // Lista de precios de la clínica (preferencia `caja.precios`, scope org; en demo, este navegador)
  const [preciosRaw, guardarPrecios, precioMeta] = usePreferencia<Precio[]>('caja.precios', 'org', PRECIOS_BASE, { lsKey: LS_PRECIOS })
  const precios = Array.isArray(preciosRaw) ? preciosRaw : PRECIOS_BASE
  const [nuevo, setNuevo] = useState(false)
  const [facturar, setFacturar] = useState<Payment | null>(null)
  const [verFactura, setVerFactura] = useState<string | null>(null)
  const puedeCobrar = useCan('pagos.escribir')

  const h = hoy()
  const mes = h.slice(0, 7)
  const totHoy = pagos.filter((p) => dia(p.fecha) === h).reduce((s, p) => s + p.monto, 0)
  const totMes = pagos.filter((p) => dia(p.fecha).startsWith(mes)).reduce((s, p) => s + p.monto, 0)
  const sinFactura = pagos.filter((p) => !p.facturado).length

  return (
    <Page
      title="Caja y facturación"
      subtitle="Cobros, corte de caja y CFDI 4.0"
      actions={
        puedeCobrar && (
          <Button variant="primary" onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Registrar cobro
          </Button>
        )
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ingresos de hoy" value={mxn.format(totHoy)} />
        <Stat label="Ingresos del mes" value={mxn.format(totMes)} />
        <Stat label="Cobros registrados" value={pagos.length} />
        <Stat label="Sin facturar" value={sinFactura} tone={sinFactura ? 'warn' : 'ok'} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'cobros', label: 'Cobros' },
          { id: 'corte', label: 'Corte de caja' },
          { id: 'precios', label: 'Lista de precios' },
          ...(server ? [{ id: 'facturas' as const, label: 'Facturas' }] : []),
        ]}
      />
      {tab === 'cobros' && <Cobros pagos={pagos} nombre={nombre} onFacturar={setFacturar} onVerFactura={setVerFactura} puedeCobrar={puedeCobrar} />}
      {tab === 'corte' && <Corte pagos={pagos} nombre={nombre} />}
      {tab === 'precios' && <Precios precios={precios} onChange={guardarPrecios} soloLectura={!precioMeta.puedeEscribir} />}
      {tab === 'facturas' && server && <FacturasTab nombre={nombre} />}
      <NuevoCobro open={nuevo} onClose={() => setNuevo(false)} precios={precios} />
      {facturar && <Facturar pago={facturar} paciente={nombre(facturar.patientId)} onClose={() => setFacturar(null)} />}
      {verFactura && <FacturaModal id={verFactura} onClose={() => setVerFactura(null)} />}
    </Page>
  )
}

function Cobros({
  pagos,
  nombre,
  onFacturar,
  onVerFactura,
  puedeCobrar,
}: {
  pagos: Payment[]
  nombre: (id: string) => string
  onFacturar: (p: Payment) => void
  onVerFactura: (id: string) => void
  puedeCobrar: boolean
}) {
  const [desde, setDesde] = useState(() => diaLocal(new Date(Date.now() - 30 * 86400000)))
  const [hasta, setHasta] = useState(hoy)
  const [metodo, setMetodo] = useState<'' | Metodo>('')
  const [fact, setFact] = useState<'' | 'si' | 'no'>('')
  const [q, setQ] = useState('')
  const lista = useMemo(
    () =>
      pagos
        .filter((p) => {
          const d = dia(p.fecha)
          return (
            (!desde || d >= desde) &&
            (!hasta || d <= hasta) &&
            (!metodo || p.metodo === metodo) &&
            (!fact || p.facturado === (fact === 'si')) &&
            (!q || (nombre(p.patientId) + ' ' + p.concepto).toLowerCase().includes(q.toLowerCase()))
          )
        })
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [pagos, desde, hasta, metodo, fact, q, nombre],
  )
  const total = lista.reduce((s, p) => s + p.monto, 0)

  const csv = () => {
    const c = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const filas = [['Fecha', 'Paciente', 'Concepto', 'Monto', 'Método', 'Facturado', 'RFC'], ...lista.map((p) => [fmtFechaHora(p.fecha), nombre(p.patientId), p.concepto, p.monto.toFixed(2), ETQ[p.metodo], p.facturado ? 'Sí' : 'No', p.rfc ?? ''])]
    downloadBlob(new Blob(['﻿' + filas.map((f) => f.map(c).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `cobros_${desde}_${hasta}.csv`)
    void registrarExportacion('caja', { formato: 'csv', recursos: lista.length })
  }

  return (
    <Card pad={false}>
      <div className="grid grid-cols-2 gap-2 border-b border-line p-3 md:grid-cols-6">
        <Field label="Desde">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        <Field label="Método">
          <Select value={metodo} onChange={(e) => setMetodo(e.target.value as Metodo | '')}>
            <option value="">Todos</option>
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {ETQ[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Facturado">
          <Select value={fact} onChange={(e) => setFact(e.target.value as '' | 'si' | 'no')}>
            <option value="">Todos</option>
            <option value="si">Facturados</option>
            <option value="no">Sin facturar</option>
          </Select>
        </Field>
        <Field label="Buscar" className="col-span-2 md:col-span-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paciente o concepto" />
        </Field>
        <div className="col-span-2 flex items-end md:col-span-1">
          <Button className="w-full" onClick={csv} disabled={!lista.length}>
            <Download className="size-4" /> CSV
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <span className="text-muted">{lista.length} cobros</span>
        <span className="font-semibold tabular-nums">Total {mxn.format(total)}</span>
      </div>
      {lista.length === 0 ? (
        <div className="p-4">
          <Empty>Sin cobros con estos filtros</Empty>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <div className="truncate text-sm font-medium">{nombre(p.patientId)}</div>
                <div className="truncate text-xs text-muted">
                  {fmtFechaHora(p.fecha)} · {p.concepto}
                </div>
              </div>
              <Badge tone={p.metodo === 'efectivo' ? 'neutral' : 'brand'}>{ETQ[p.metodo]}</Badge>
              <div className="w-24 text-right font-semibold tabular-nums">{mxn.format(p.monto)}</div>
              <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                {p.facturado && p.facturaId ? (
                  <Button size="sm" variant="ghost" onClick={() => onVerFactura(p.facturaId!)} aria-label={`Ver factura de ${nombre(p.patientId)}`}>
                    <BadgeCheck className="size-3.5 text-ok" /> Facturado{p.rfc ? ` · ${p.rfc}` : ''}
                  </Button>
                ) : p.facturado ? (
                  <Badge tone="ok">Facturado{p.rfc ? ` · ${p.rfc}` : ''}</Badge>
                ) : puedeCobrar ? (
                  <Button size="sm" onClick={() => onFacturar(p)}>
                    <FileCode2 className="size-3.5" /> Facturar
                  </Button>
                ) : (
                  <Badge>Sin factura</Badge>
                )}
                {puedeCobrar && !(isServer() && p.facturado) && (
                  <button className="ml-1 p-1 text-muted hover:text-danger" aria-label={`Eliminar cobro de ${nombre(p.patientId)}`} onClick={() => void confirmar('¿Eliminar este cobro?', { peligro: true }).then((ok) => ok && remove('payments', p.id))}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function NuevoCobro({ open, onClose, precios }: { open: boolean; onClose: () => void; precios: Precio[] }) {
  const { id: activo } = useActivePatient()
  const patients = useCollection('patients')
  const [pid, setPid] = useState('')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<Metodo>('efectivo')
  const paciente = pid || activo || ''
  const guardar = () => {
    const m = parseFloat(monto)
    if (!paciente || !concepto.trim() || !(m > 0)) return
    add('payments', { patientId: paciente, concepto: concepto.trim(), monto: Math.round(m * 100) / 100, metodo, facturado: false })
    setConcepto('')
    setMonto('')
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Registrar cobro">
      <div className="space-y-3">
        <Field label="Paciente">
          <Select value={paciente} onChange={(e) => setPid(e.target.value)}>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {nombreCompleto(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Concepto">
          <Input
            list="caja-precios"
            value={concepto}
            onChange={(e) => {
              setConcepto(e.target.value)
              const pr = precios.find((x) => x.concepto === e.target.value)
              if (pr) setMonto(String(pr.monto))
            }}
            placeholder="Elige de la lista o escribe"
          />
          <datalist id="caja-precios">
            {precios.map((p, i) => (
              <option key={p.concepto + i} value={p.concepto}>
                {mxn.format(p.monto)}
              </option>
            ))}
          </datalist>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {precios.map((p, i) => (
            <button
              key={p.concepto + i}
              onClick={() => {
                setConcepto(p.concepto)
                setMonto(String(p.monto))
              }}
              className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-brand hover:text-brand"
            >
              {p.concepto} · {mxn.format(p.monto)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (MXN)">
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <Field label="Método de pago">
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as Metodo)}>
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {ETQ[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={!paciente || !concepto.trim() || !(parseFloat(monto) > 0)}>
            <Receipt className="size-4" /> Guardar cobro
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Corte({ pagos, nombre }: { pagos: Payment[]; nombre: (id: string) => string }) {
  const [d, setD] = useState(hoy)
  const delDia = pagos.filter((p) => dia(p.fecha) === d).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const total = delDia.reduce((s, p) => s + p.monto, 0)
  const por = METODOS.map((m) => {
    const l = delDia.filter((p) => p.metodo === m)
    return { m, n: l.length, t: l.reduce((s, p) => s + p.monto, 0) }
  })
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end gap-2">
        <Field label="Fecha del corte">
          <Input type="date" value={d} onChange={(e) => setD(e.target.value)} />
        </Field>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir corte
        </Button>
      </div>
      <h2 className="text-base font-semibold">Corte de caja · {fmtFecha(d + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {por.map((x) => (
          <Stat key={x.m} label={ETQ[x.m]} value={mxn.format(x.t)} sub={`${x.n} cobro${x.n === 1 ? '' : 's'}`} />
        ))}
        <Stat label="Total del día" value={mxn.format(total)} sub={`${delDia.length} cobros · ${delDia.filter((p) => p.facturado).length} facturados`} tone="ok" />
      </div>
      <Card title="Detalle" pad={false}>
        {delDia.length === 0 ? (
          <div className="p-4">
            <Empty>No hay cobros en esta fecha</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Hora</th>
                  <th className="px-4 py-2">Paciente</th>
                  <th className="px-4 py-2">Concepto</th>
                  <th className="px-4 py-2">Método</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {delDia.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 tabular-nums">{new Date(p.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2">{nombre(p.patientId)}</td>
                    <td className="px-4 py-2">{p.concepto}</td>
                    <td className="px-4 py-2">{ETQ[p.metodo]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{mxn.format(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-semibold">
                  <td className="px-4 py-2" colSpan={4}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{mxn.format(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Precios({ precios, onChange, soloLectura }: { precios: Precio[]; onChange: (p: Precio[]) => void; soloLectura?: boolean }) {
  const [c, setC] = useState('')
  const [m, setM] = useState('')
  const server = isServer()
  return (
    <Card
      title="Lista de precios"
      actions={
        !soloLectura && (
          <Button size="sm" variant="ghost" onClick={() => void confirmar('¿Restaurar la lista de precios original?').then((ok) => ok && onChange(PRECIOS_BASE))}>
            Restaurar
          </Button>
        )
      }
    >
      {server && (
        <p className="mb-2 text-xs text-muted">
          {soloLectura ? 'Lista compartida de la clínica. Solo el administrador o un médico pueden cambiarla.' : 'Lista compartida por toda la clínica (se guarda en el servidor).'}
        </p>
      )}
      <ul className="divide-y divide-line">
        {precios.map((p, i) => (
          <li key={i} className="flex items-center gap-2 py-2">
            <Input
              aria-label={`Concepto ${i + 1}`}
              readOnly={soloLectura}
              value={p.concepto}
              onChange={(e) => onChange(precios.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))}
              className="flex-1"
            />
            <Input
              aria-label={`Precio de ${p.concepto || 'concepto ' + (i + 1)}`}
              readOnly={soloLectura}
              type="number"
              value={p.monto}
              onChange={(e) => onChange(precios.map((x, j) => (j === i ? { ...x, monto: +e.target.value } : x)))}
              className="w-28 text-right"
            />
            {!soloLectura && (
              <button className="p-1 text-muted hover:text-danger" aria-label={`Quitar ${p.concepto}`} onClick={() => onChange(precios.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className={soloLectura ? 'hidden' : 'mt-3 flex gap-2'}>
        <Input aria-label="Nuevo concepto" value={c} onChange={(e) => setC(e.target.value)} placeholder="Nuevo concepto" className="flex-1" />
        <Input aria-label="Precio del nuevo concepto" type="number" value={m} onChange={(e) => setM(e.target.value)} placeholder="Precio" className="w-28" />
        <Button
          aria-label="Agregar concepto"
          disabled={!c.trim() || !(+m > 0)}
          onClick={() => {
            onChange([...precios, { concepto: c.trim(), monto: +m }])
            setC('')
            setM('')
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </Card>
  )
}

function Facturar({ pago, paciente, onClose }: { pago: Payment; paciente: string; onClose: () => void }) {
  const s = useSettings()
  const [emRfc, setEmRfc] = useState(s.doctor.rfc ?? '')
  const [emNombre, setEmNombre] = useState(nombreFiscal(s.doctor.nombre.replace(/^(Dra?\.?\s+)/i, '')))
  const [emReg, setEmReg] = useState('612')
  const [emCp, setEmCp] = useState(() => s.doctor.direccion.match(/\b\d{5}\b/)?.[0] ?? '03100')
  const [rfc, setRfc] = useState(pago.rfc ?? '')
  const [rNombre, setRNombre] = useState(nombreFiscal(paciente))
  const [rCp, setRCp] = useState('')
  const [rReg, setRReg] = useState('605')
  const [uso, setUso] = useState('D01')
  const [forma, setForma] = useState(pago.metodo === 'efectivo' ? '01' : pago.metodo === 'transferencia' ? '03' : '04')
  const [clave, setClave] = useState('85121600')
  const [obj, setObj] = useState<'01' | '02'>('02')
  const [desc, setDesc] = useState(pago.concepto)
  const [rEmail, setREmail] = useState('')
  const server = isServer()
  const pacConfigurado = useServicio('pac')
  const [sinPac, setSinPac] = useState(false)
  const [timbrando, setTimbrando] = useState(false)
  const [errPac, setErrPac] = useState('')
  const [factura, setFactura] = useState<Factura | null>(null)
  const usarPac = server && pacConfigurado !== false && !sinPac

  const R = rfc.trim().toUpperCase()
  const rfcOk = RFC_RE.test(R)
  const fisica = R.length === 13
  const errores = [
    !rfcOk && 'RFC del receptor inválido',
    !RFC_RE.test(emRfc.toUpperCase()) && 'RFC del emisor inválido (configúralo en Configuración)',
    !/^\d{5}$/.test(rCp) && 'Código postal del receptor (5 dígitos)',
    !/^\d{5}$/.test(emCp) && 'Lugar de expedición (CP del emisor)',
    !rNombre.trim() && 'Nombre o razón social',
    uso === 'CP01' && 'CP01 solo aplica a CFDI de tipo Pago (P); usa D01, G03 o S01',
    rfcOk && R !== RFC_GENERICO && fisica && ['601', '603'].includes(rReg) && 'Régimen 601/603 es solo para personas morales',
    rfcOk && !fisica && ['605', '606', '612', '621', '625'].includes(rReg) && 'Ese régimen es solo para personas físicas',
  ].filter(Boolean) as string[]
  // Con PAC, el emisor lo pone el servidor: solo cuentan los errores del receptor
  const erroresPac = errores.filter((e) => !/emisor|expedición/i.test(e))

  const datos = {
    serie: 'A',
    folio: pago.id.replace(/\W/g, '').slice(-10).toUpperCase(),
    fecha: new Date(),
    emisor: { rfc: emRfc.toUpperCase(), nombre: emNombre, regimen: emReg, cp: emCp },
    receptor: { rfc: R, nombre: rNombre.trim().toUpperCase(), cp: rCp, regimen: rReg, uso },
    formaPago: forma,
    claveProdServ: clave,
    descripcion: desc,
    monto: pago.monto,
    objetoImp: obj,
  }
  const { xml, retencion, total } = construirCFDI(datos)
  const nombreXml = `CFDI_${datos.serie}${datos.folio}_${R || 'SINRFC'}.xml`

  const publico = () => {
    setRfc(RFC_GENERICO)
    setRNombre('PUBLICO EN GENERAL')
    setRReg('616')
    setUso('S01')
    setRCp(emCp)
  }
  const timbrar = async () => {
    setTimbrando(true)
    setErrPac('')
    try {
      const f = await api<Factura>('/facturas', {
        method: 'POST',
        timeout: 60_000,
        body: {
          paymentId: pago.id,
          receptor: { rfc: R, nombre: rNombre.trim().toUpperCase(), regimenFiscal: rReg, codigoPostal: rCp, usoCfdi: uso, ...(rEmail.trim() ? { email: rEmail.trim() } : {}) },
          formaPago: forma,
          claveProdServ: clave,
          descripcion: desc.trim() || undefined,
        },
      })
      setFactura(f)
      refreshServer() // el pago queda facturado y aparecen los documentos PDF/XML del paciente
      toast(`Factura timbrada${f.uuid ? ' · UUID ' + f.uuid : ''}.`, 'ok')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'pac_no_configurado') {
        setSinPac(true)
        toast('El servidor no tiene PAC configurado: se muestra la vista previa sin timbre.', 'warn')
      } else if (e instanceof ApiError && e.code === 'ya_facturado') {
        setErrPac('Este cobro ya tiene una factura vigente.')
        refreshServer()
      } else setErrPac(errorMessage(e))
    } finally {
      setTimbrando(false)
    }
  }
  const confirmar = () => {
    add('documents', { patientId: pago.patientId, tipo: 'factura', nombre: nombreXml, mime: 'application/xml', dataUrl: 'data:application/xml;charset=utf-8,' + encodeURIComponent(xml), meta: { cfdi: true, paymentId: pago.id, timbrado: false } })
    update('payments', pago.id, { facturado: true, rfc: R })
    downloadBlob(new Blob([xml], { type: 'application/xml' }), nombreXml)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Facturar · ${mxn.format(pago.monto)} · ${fmtFecha(pago.fecha)}`} wide>
      {factura ? (
        <div className="space-y-3">
          <Notice tone="info">
            <b>CFDI timbrado.</b> El PDF y el XML se guardaron en los documentos del paciente.
          </Notice>
          <FacturaPanel f={factura} onChange={setFactura} />
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Listo
            </Button>
          </div>
        </div>
      ) : (
      <>
      {usarPac ? (
        <Notice tone="info">
          Se timbrará con el PAC configurado en el servidor (emisor, CSD e IVA exento los define el servidor). Revisa los datos del receptor tal como aparecen en su Constancia de
          Situación Fiscal.
        </Notice>
      ) : (
        <Notice tone="warn">
          Vista previa de CFDI 4.0 <b>sin sello ni timbre</b>: no tiene validez fiscal.{' '}
          {server
            ? 'El servidor no tiene un PAC configurado (FACTURAPI_KEY); pide al administrador que lo active para timbrar.'
            : 'Para timbrar se necesita un PAC (Facturama, Finkok, SW Sapien, Facturapi) y el Certificado de Sello Digital (CSD) del médico resguardado en el servidor.'}
        </Notice>
      )}
      {errPac && <Notice tone="danger">{errPac}</Notice>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Receptor</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="RFC" hint={R && !rfcOk ? <span className="text-danger">Formato inválido</span> : R ? (fisica ? 'Persona física' : 'Persona moral') : undefined}>
              <Input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} maxLength={13} placeholder="XAXX010101000" className="font-mono uppercase" />
            </Field>
            <Field label="C.P. domicilio fiscal">
              <Input value={rCp} onChange={(e) => setRCp(e.target.value.replace(/\D/g, ''))} maxLength={5} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Nombre o razón social" hint="Tal como aparece en la Constancia de Situación Fiscal, sin régimen societario (S.A. de C.V.).">
            <Input value={rNombre} onChange={(e) => setRNombre(e.target.value)} />
          </Field>
          {usarPac && (
            <Field label="Correo del receptor (opcional)" hint="El PAC le enviará el PDF y el XML.">
              <Input type="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} placeholder="paciente@correo.mx" />
            </Field>
          )}
          <Field label="Régimen fiscal del receptor">
            <Select value={rReg} onChange={(e) => setRReg(e.target.value)}>
              {REGIMENES.map(([k, v]) => (
                <option key={k} value={k}>
                  {k} – {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Uso del CFDI">
            <Select value={uso} onChange={(e) => setUso(e.target.value)}>
              {USOS.map(([k, v]) => (
                <option key={k} value={k}>
                  {k} – {v}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="sm" variant="ghost" onClick={publico}>
            Usar "Público en general"
          </Button>
          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Comprobante</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Forma de pago">
              <Select value={forma} onChange={(e) => setForma(e.target.value)}>
                {FORMAS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {k} – {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Objeto de impuesto">
              <Select value={obj} onChange={(e) => setObj(e.target.value as '01' | '02')}>
                <option value="02">02 – Sí objeto (IVA exento)</option>
                <option value="01">01 – No objeto de impuesto</option>
              </Select>
            </Field>
          </div>
          <Field label="Clave producto/servicio (ClaveUnidad E48)">
            <Select value={clave} onChange={(e) => setClave(e.target.value)}>
              {CLAVES.map(([k, v]) => (
                <option key={k} value={k}>
                  {k} – {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descripción">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <details className={usarPac ? 'hidden' : 'rounded-lg border border-line p-2 text-sm'}>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">Emisor</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="RFC emisor">
                <Input value={emRfc} onChange={(e) => setEmRfc(e.target.value.toUpperCase())} className="font-mono" />
              </Field>
              <Field label="Lugar de expedición (CP)">
                <Input value={emCp} onChange={(e) => setEmCp(e.target.value.replace(/\D/g, ''))} maxLength={5} />
              </Field>
              <Field label="Nombre" className="col-span-2">
                <Input value={emNombre} onChange={(e) => setEmNombre(e.target.value)} />
              </Field>
              <Field label="Régimen emisor" className="col-span-2">
                <Select value={emReg} onChange={(e) => setEmReg(e.target.value)}>
                  <option value="612">612 – Personas Físicas con Actividades Empresariales y Profesionales</option>
                  <option value="626">626 – Régimen Simplificado de Confianza</option>
                  <option value="601">601 – General de Ley Personas Morales</option>
                </Select>
              </Field>
            </div>
          </details>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>Subtotal {mxn.format(pago.monto)}</span>
            <span>IVA exento</span>
            {retencion > 0 && <span className="text-warn">Ret. ISR {(retencionISR(datos) * 100).toFixed(2)}% −{mxn.format(retencion)}</span>}
            <b>Total {mxn.format(total)}</b>
          </div>
          {uso === 'D01' && forma === '01' && <p className="text-xs text-warn">Los honorarios médicos pagados en efectivo no son deducibles para el paciente (art. 151 LISR).</p>}
          <pre className="max-h-[26rem] overflow-auto rounded-lg border border-line bg-surface-2 p-3 text-[11px] leading-snug">{xml}</pre>
          {(usarPac ? erroresPac : errores).length > 0 && (
            <ul className="list-disc pl-5 text-xs text-danger">
              {(usarPac ? erroresPac : errores).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => downloadBlob(new Blob([xml], { type: 'application/xml' }), nombreXml)}>
              <Download className="size-4" /> {usarPac ? 'Vista previa XML' : 'Descargar XML'}
            </Button>
            {usarPac ? (
              <Button variant="primary" disabled={erroresPac.length > 0 || timbrando} onClick={timbrar}>
                {timbrando ? <Loader2 className="size-4 animate-spin" /> : <Stamp className="size-4" />} Timbrar con PAC
              </Button>
            ) : (
              <Button variant="primary" disabled={errores.length > 0} onClick={confirmar}>
                <FileCode2 className="size-4" /> Marcar como facturado
              </Button>
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </Modal>
  )
}
