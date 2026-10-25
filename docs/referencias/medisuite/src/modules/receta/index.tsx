import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Ban, Baby, Copy, Download, FileSignature, History, MessageCircle, Plus, Printer, Save, Share2, Star, Trash2, X } from 'lucide-react'
import { Page, Card, Button, Field, Input, Textarea, Select, Badge, Notice, Empty, PatientBar, Disclaimer, Modal } from '../../components/ui'
import { addAsync, cancelPrescription, getDB, setActivePatient, update, useActivePatient, useCollection, useSettings } from '../../lib/store'
import { errorMessage, isServer } from '../../lib/api'
import { useCan } from '../../lib/session'
import { usePreferencia } from '../../lib/preferencias'
import type { Patient, Prescription, PrescriptionItem } from '../../lib/types'
import { downloadBlob, edad, fmtFecha, nombreCompleto } from '../../lib/utils'
import { CATALOGO, FRECUENCIAS, VIAS, alertaAlergia, norm } from './catalogo'
import { firmarReceta } from './firma'
import { imprimirPDF, recetaPDF, urlVerificacion, type Formato } from './pdf'
import { confirmar, pedirTexto } from '../../components/dialogos'

const vacio = (): PrescriptionItem => ({ medicamento: '', presentacion: '', dosis: '', via: 'Oral', frecuencia: '', duracion: '', indicaciones: '' })
const LS_TIPO = 'medisuite.recetasTipo'
interface RecetaTipo {
  nombre: string
  items: PrescriptionItem[]
  indicaciones?: string
}

// Folio consecutivo RX-000000
function siguienteFolio() {
  const n = getDB().prescriptions.reduce((m, r) => Math.max(m, parseInt(r.folio.replace(/\D/g, '')) || 0), 100)
  return 'RX-' + String(n + 1).padStart(6, '0')
}

function iniciales(p: Patient) {
  return (p.nombre + ' ' + p.apellidos)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** Asegura que la receta esté firmada (las antiguas pueden no tenerlo) y devuelve la versión firmada. */
async function asegurarFirma(rx: Prescription, p: Patient): Promise<Prescription> {
  if (rx.firma) return rx
  // En modo servidor la firma la pone el servidor con la llave de la organización
  if (isServer()) throw new Error('La receta no tiene firma del servidor. Recarga la página e inténtalo de nuevo.')
  const s = getDB().settings
  const firma = await firmarReceta({
    folio: rx.folio,
    fecha: rx.fecha,
    paciente: `${iniciales(p)}-${p.fechaNac.slice(0, 4)}`,
    medicamentos: rx.items.map((i) => [i.medicamento, i.presentacion].filter(Boolean).join(' ')),
    cedula: s.doctor.cedula,
    medico: s.doctor.nombre,
  })
  update('prescriptions', rx.id, { firma })
  return { ...rx, firma }
}

function telWhatsApp(tel?: string) {
  const d = (tel ?? '').replace(/\D/g, '')
  return d.length === 10 ? '52' + d : d
}

export default function Receta() {
  const [sp] = useSearchParams()
  const { patient } = useActivePatient()
  const settings = useSettings()
  useEffect(() => {
    const p = sp.get('p')
    if (p && getDB().patients.some((x) => x.id === p)) setActivePatient(p)
  }, [sp])

  const pid = patient?.id
  const historial = useCollection('prescriptions', (r) => r.patientId === pid, [pid])
  const pesos = useCollection('observations', (o) => o.patientId === pid && o.codigo === 'peso', [pid])
  const peso = useMemo(() => [...pesos].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.valor ?? null, [pesos])
  const hist = useMemo(() => [...historial].sort((a, b) => b.fecha.localeCompare(a.fecha)), [historial])

  const [items, setItems] = useState<PrescriptionItem[]>([vacio()])
  const [indic, setIndic] = useState('')
  const [formato, setFormato] = useState<Formato>(() => {
    try {
      return (localStorage.getItem('medisuite.rxFormato') as Formato) || 'media-carta' // preferencia de impresión de este equipo
    } catch {
      return 'media-carta'
    }
  })
  // Recetas tipo: compartidas por la clínica en modo servidor (preferencia `receta.plantillas`, scope org)
  const [tiposRaw, setTipos] = usePreferencia<RecetaTipo[]>('receta.plantillas', 'org', [], { lsKey: LS_TIPO })
  const tipos = Array.isArray(tiposRaw) ? tiposRaw : []
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const [ultima, setUltima] = useState<Prescription | null>(null)
  const [cancelar, setCancelar] = useState<Prescription | null>(null)
  const puedeEmitir = useCan('recetas.escribir')

  useEffect(() => {
    setUltima(null)
    setMsg(null)
  }, [pid])
  useEffect(() => {
    try {
      localStorage.setItem('medisuite.rxFormato', formato)
    } catch {
      /* ignorar */
    }
  }, [formato])

  const setItem = (i: number, patch: Partial<PrescriptionItem>) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const elegirMed = (i: number, nombre: string) => {
    const c = CATALOGO.find((m) => norm(m.nombre) === norm(nombre))
    setItems((arr) =>
      arr.map((x, j) => {
        if (j !== i) return x
        if (!c) return { ...x, medicamento: nombre }
        // conservar presentación escrita a mano; reemplazar si venía del catálogo
        const propia = x.presentacion && !CATALOGO.some((m) => m.presentaciones.includes(x.presentacion!))
        return { ...x, medicamento: nombre, via: c.via, presentacion: propia ? x.presentacion : c.presentaciones[0] }
      }),
    )
  }
  const validos = items.filter((i) => i.medicamento.trim())
  const alertas = patient ? items.map((i) => alertaAlergia(i.medicamento, patient.alergias)) : []

  const guardarTipo = async () => {
    if (!validos.length) return setMsg({ tone: 'warn', text: 'Agrega al menos un medicamento para guardar la receta tipo.' })
    const nombre = (await pedirTexto('Nombre de la receta tipo (ej. "Faringitis adulto")', { titulo: 'Guardar receta tipo', aceptar: 'Guardar' }))?.trim()
    if (!nombre) return
    const next = [...tipos.filter((t) => t.nombre !== nombre), { nombre, items: validos, indicaciones: indic }]
    setTipos(next)
    setMsg({ tone: 'info', text: `Receta tipo "${nombre}" guardada.` })
  }
  const borrarTipo = (nombre: string) => {
    setTipos(tipos.filter((t) => t.nombre !== nombre))
  }
  const cargar = (its: PrescriptionItem[], ind?: string) => {
    setItems(its.map((x) => ({ ...vacio(), ...x })))
    setIndic(ind ?? '')
    setUltima(null)
  }

  const pdf = async (rx: Prescription) => {
    if (!patient) throw new Error('sin paciente')
    const firmada = await asegurarFirma(rx, patient)
    return { rx: firmada, blob: await recetaPDF(firmada, patient, getDB().settings, peso, formato) }
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setMsg({ tone: 'danger', text: 'Error: ' + (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const descargar = (rx: Prescription) => run(async () => downloadBlob((await pdf(rx)).blob, `${rx.folio}.pdf`))
  const imprimir = (rx: Prescription) => run(async () => imprimirPDF((await pdf(rx)).blob))
  const whatsapp = (rx: Prescription) =>
    run(async () => {
      const f = await asegurarFirma(rx, patient!)
      const txt = `Hola ${patient!.nombre}, le comparto su receta ${f.folio} de ${settings.doctor.nombre}:\n${f.items
        .map((i) => `• ${i.medicamento} ${i.presentacion ?? ''}: ${i.dosis} ${i.frecuencia} por ${i.duracion}`)
        .join('\n')}\n\nVerificar autenticidad: ${urlVerificacion(f.firma!)}`
      window.open(`https://wa.me/${telWhatsApp(patient!.telefono)}?text=${encodeURIComponent(txt)}`, '_blank')
    })
  const compartir = (rx: Prescription) =>
    run(async () => {
      const { rx: f, blob } = await pdf(rx)
      const file = new File([blob], `${f.folio}.pdf`, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Receta ${f.folio}`, text: `Receta médica ${f.folio}` })
        } catch (e) {
          if ((e as Error).name !== 'AbortError') throw e
        }
      } else setMsg({ tone: 'warn', text: 'Este navegador no permite compartir archivos. Usa "Descargar PDF" o WhatsApp.' })
    })

  const guardar = () =>
    run(async () => {
      if (!patient) return
      if (!validos.length) return setMsg({ tone: 'warn', text: 'Agrega al menos un medicamento.' })
      const faltan = validos.filter((i) => !i.dosis.trim() || !i.frecuencia.trim() || !i.duracion.trim())
      if (faltan.length) return setMsg({ tone: 'warn', text: `Completa dosis, frecuencia y duración de: ${faltan.map((f) => f.medicamento).join(', ')}.` })
      if (alertas.some(Boolean) && !(await confirmar('Hay alertas de alergia en esta receta. Revisa los medicamentos marcados antes de emitirla.', { titulo: 'Alerta de alergia', aceptar: 'Emitir de todos modos', peligro: true }))) return
      // Modo servidor: el servidor asigna folio y firma (ES256) y devuelve la receta guardada
      let rx: Prescription
      try {
        rx = await addAsync('prescriptions', { patientId: patient.id, folio: siguienteFolio(), items: validos.map((i) => ({ ...i })), indicaciones: indic.trim() || undefined })
      } catch (e) {
        return setMsg({ tone: 'danger', text: 'No se guardó la receta: ' + errorMessage(e) })
      }
      const f = await asegurarFirma(rx, patient)
      setUltima(f)
      setMsg({ tone: 'info', text: `Receta ${f.folio} guardada y firmada electrónicamente${isServer() ? ' por el servidor' : ''}.` })
    })

  const acciones = (rx: Prescription, compact = false) => (
    <div className="flex flex-wrap gap-2">
      <Button size={compact ? 'sm' : 'md'} variant={compact ? 'secondary' : 'primary'} disabled={busy} onClick={() => descargar(rx)}>
        <Download className="size-4" /> {compact ? 'PDF' : 'Descargar PDF'}
      </Button>
      <Button size={compact ? 'sm' : 'md'} disabled={busy} onClick={() => imprimir(rx)} aria-label="Imprimir">
        <Printer className="size-4" /> {!compact && 'Imprimir'}
      </Button>
      <Button size={compact ? 'sm' : 'md'} disabled={busy} onClick={() => whatsapp(rx)} aria-label="WhatsApp">
        <MessageCircle className="size-4" /> {!compact && 'WhatsApp'}
      </Button>
      <Button size={compact ? 'sm' : 'md'} disabled={busy} onClick={() => compartir(rx)} aria-label="Compartir">
        <Share2 className="size-4" /> {!compact && 'Compartir'}
      </Button>
    </div>
  )

  if (!patient)
    return (
      <Page title="Receta médica">
        <PatientBar />
      </Page>
    )
  const ed = edad(patient.fechaNac)

  return (
    <Page
      title="Receta médica"
      subtitle="Receta con firma electrónica y código QR verificable"
      actions={
        <Select value={formato} onChange={(e) => setFormato(e.target.value as Formato)} className="h-9 w-auto py-1" aria-label="Formato">
          <option value="media-carta">Media carta (horizontal)</option>
          <option value="carta">Carta (vertical)</option>
        </Select>
      }
    >
      <PatientBar />
      {!puedeEmitir && <Notice tone="info">Solo lectura: únicamente los médicos pueden emitir o cancelar recetas.</Notice>}
      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}
      {ultima && (
        <Card className="mb-4 border-brand/40" title={<span className="flex items-center gap-2"><FileSignature className="size-4 text-brand" /> Receta {ultima.folio} lista</span>} actions={<button onClick={() => setUltima(null)} aria-label="Cerrar"><X className="size-4" /></button>}>
          {acciones(ultima)}
          <p className="mt-3 break-all text-xs text-muted">
            Verificación: <a className="text-brand underline" href={urlVerificacion(ultima.firma!)} target="_blank" rel="noreferrer">abrir página de verificación</a>
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card
            title="Medicamentos"
            actions={
              <Button size="sm" onClick={() => setItems((a) => [...a, vacio()])}>
                <Plus className="size-4" /> Agregar
              </Button>
            }
          >
            <datalist id="rx-catalogo">
              {CATALOGO.map((m) => (
                <option key={m.nombre} value={m.nombre} />
              ))}
            </datalist>
            <datalist id="rx-frecuencias">
              {FRECUENCIAS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <div className="space-y-3">
              {items.map((it, i) => {
                const cat = CATALOGO.find((m) => norm(m.nombre) === norm(it.medicamento))
                return (
                  <div key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted">Medicamento {i + 1}</span>
                      {items.length > 1 && (
                        <button className="text-muted hover:text-danger" onClick={() => setItems((a) => a.filter((_, j) => j !== i))} aria-label="Quitar">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Medicamento (genérico)">
                        <Input list="rx-catalogo" value={it.medicamento} onChange={(e) => elegirMed(i, e.target.value)} placeholder="Escribe para buscar…" />
                      </Field>
                      <Field label="Presentación">
                        <Input list={`rx-pres-${i}`} value={it.presentacion} onChange={(e) => setItem(i, { presentacion: e.target.value })} placeholder="Tabletas 500 mg" />
                        <datalist id={`rx-pres-${i}`}>{cat?.presentaciones.map((p) => <option key={p} value={p} />)}</datalist>
                      </Field>
                      <Field label="Dosis">
                        <Input value={it.dosis} onChange={(e) => setItem(i, { dosis: e.target.value })} placeholder="1 tableta / 5 mL" />
                      </Field>
                      <Field label="Vía">
                        <Select value={it.via} onChange={(e) => setItem(i, { via: e.target.value })}>
                          {VIAS.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Frecuencia">
                        <Input list="rx-frecuencias" value={it.frecuencia} onChange={(e) => setItem(i, { frecuencia: e.target.value })} placeholder="Cada 8 horas" />
                      </Field>
                      <Field label="Duración">
                        <Input value={it.duracion} onChange={(e) => setItem(i, { duracion: e.target.value })} placeholder="7 días" />
                      </Field>
                      <Field label="Indicaciones" className="sm:col-span-2">
                        <Input value={it.indicaciones} onChange={(e) => setItem(i, { indicaciones: e.target.value })} placeholder="Tomar con alimentos…" />
                      </Field>
                    </div>
                    {alertas[i] && (
                      <div className="mt-2 flex items-start gap-2 rounded-md bg-danger/10 px-2 py-1.5 text-xs font-medium text-danger">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {alertas[i]}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <Field label="Indicaciones generales" className="mt-3">
              <Textarea value={indic} onChange={(e) => setIndic(e.target.value)} placeholder="Dieta, cuidados, signos de alarma, próxima cita…" />
            </Field>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy || !puedeEmitir} onClick={guardar} title={puedeEmitir ? undefined : 'Solo los médicos pueden emitir recetas'}>
                <Save className="size-4" /> Guardar y firmar
              </Button>
              <Button onClick={guardarTipo}>
                <Star className="size-4" /> Guardar como receta tipo
              </Button>
              <Button variant="ghost" onClick={() => cargar([vacio()])}>
                Limpiar
              </Button>
            </div>
            <Disclaimer>Verifica dosis, interacciones y contraindicaciones. Las alertas de alergia son por coincidencia de texto y grupo; no sustituyen la revisión clínica.</Disclaimer>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {ed.anios < 12 && <DosisPediatrica peso={peso} items={items} onAplicar={(i, dosis) => setItem(i, { dosis })} />}
          <Card title="Atajos">
            <div className="space-y-2">
              <Button className="w-full" disabled={!hist.length} onClick={() => hist[0] && cargar(hist[0].items, hist[0].indicaciones)}>
                <Copy className="size-4" /> Repetir última receta
              </Button>
              {hist[0] && <p className="text-xs text-muted">Última: {hist[0].folio} · {fmtFecha(hist[0].fecha)}</p>}
            </div>
            <div className="mt-4 text-xs font-semibold text-muted">Recetas tipo</div>
            {tipos.length === 0 ? (
              <p className="mt-1 text-xs text-muted">Aún no tienes recetas tipo. Arma una receta y usa "Guardar como receta tipo".</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {tipos.map((t) => (
                  <li key={t.nombre} className="flex items-center gap-2 py-1.5">
                    <button className="min-w-0 flex-1 truncate text-left text-sm hover:text-brand" onClick={() => cargar(t.items, t.indicaciones)} title="Aplicar">
                      <Star className="mr-1 inline size-3.5 text-warn" />
                      {t.nombre} <span className="text-xs text-muted">({t.items.length})</span>
                    </button>
                    <button className="text-muted hover:text-danger" onClick={() => borrarTipo(t.nombre)} aria-label={`Borrar ${t.nombre}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><History className="size-4" /> Historial de recetas</span>}>
            {hist.length === 0 ? (
              <Empty>Sin recetas previas</Empty>
            ) : (
              <ul className="space-y-3">
                {hist.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold">{r.folio}</span>
                      <span className="text-xs text-muted">{fmtFecha(r.fecha)}</span>
                    </div>
                    <div className={r.cancelada ? 'mt-1 text-sm text-muted line-through' : 'mt-1 text-sm'}>{r.items.map((i) => i.medicamento).join(', ')}</div>
                    {r.cancelada && <p className="mt-1 text-xs text-danger">Cancelada{r.motivoCancelacion ? `: ${r.motivoCancelacion}` : ''}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {!r.cancelada && acciones(r, true)}
                      <Button size="sm" variant="ghost" onClick={() => cargar(r.items, r.indicaciones)}>
                        <Copy className="size-3.5" /> Usar
                      </Button>
                      {r.cancelada ? <Badge tone="danger">Cancelada</Badge> : r.firma ? <Badge tone="ok">Firmada</Badge> : <Badge>Sin firma</Badge>}
                      {!r.cancelada && puedeEmitir && (
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setCancelar(r)}>
                          <Ban className="size-3.5" /> Cancelar
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <CancelarModal
        rx={cancelar}
        onClose={() => setCancelar(null)}
        onDone={(r) => {
          setCancelar(null)
          if (ultima?.id === r.id) setUltima(null)
          setMsg({ tone: 'warn', text: `Receta ${r.folio} cancelada. La página de verificación la mostrará como no válida.` })
        }}
      />
      <p className="mt-4 text-xs text-muted">
        Paciente: {nombreCompleto(patient)} · Médico: {settings.doctor.nombre} · Céd. {settings.doctor.cedula}
      </p>
    </Page>
  )
}

/** Calculadora de dosis por peso para menores de 12 años. */
function DosisPediatrica({ peso, items, onAplicar }: { peso: number | null; items: PrescriptionItem[]; onAplicar: (i: number, dosis: string) => void }) {
  const [kg, setKg] = useState(peso?.toString() ?? '')
  const [mgkg, setMgkg] = useState('15')
  const [max, setMax] = useState('')
  const [conc, setConc] = useState('') // mg por 5 mL
  const [dest, setDest] = useState(0)
  useEffect(() => setKg(peso?.toString() ?? ''), [peso])
  const w = parseFloat(kg)
  const bruto = w * parseFloat(mgkg)
  const tope = parseFloat(max)
  const mg = Number.isFinite(bruto) ? (tope > 0 ? Math.min(bruto, tope) : bruto) : NaN
  const ml = parseFloat(conc) > 0 ? (mg * 5) / parseFloat(conc) : NaN
  const texto = Number.isFinite(mg) ? `${Math.round(mg * 10) / 10} mg${Number.isFinite(ml) ? ` (${Math.round(ml * 10) / 10} mL)` : ''}` : ''
  return (
    <Card title={<span className="flex items-center gap-2"><Baby className="size-4 text-brand" /> Dosis pediátrica por peso</span>}>
      {!peso && <p className="mb-2 text-xs text-warn">No hay peso registrado; captúralo manualmente.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Peso (kg)">
          <Input type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
        </Field>
        <Field label="mg/kg/dosis">
          <Input type="number" inputMode="decimal" value={mgkg} onChange={(e) => setMgkg(e.target.value)} />
        </Field>
        <Field label="Dosis máx. (mg)">
          <Input type="number" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="opcional" />
        </Field>
        <Field label="Concentración mg/5 mL">
          <Input type="number" inputMode="decimal" value={conc} onChange={(e) => setConc(e.target.value)} placeholder="ej. 160" />
        </Field>
      </div>
      <div className="mt-3 rounded-lg bg-brand-soft/60 p-3 text-center">
        <div className="text-xs text-muted">Dosis por toma</div>
        <div className="text-xl font-semibold tabular-nums text-brand-strong">{texto || '—'}</div>
        {tope > 0 && bruto > tope && <div className="text-xs text-warn">Limitada a la dosis máxima ({tope} mg)</div>}
      </div>
      <div className="mt-3 flex gap-2">
        <Select value={dest} onChange={(e) => setDest(+e.target.value)} className="h-9 py-1">
          {items.map((it, i) => (
            <option key={i} value={i}>
              {i + 1}. {it.medicamento || '(sin nombre)'}
            </option>
          ))}
        </Select>
        <Button size="md" disabled={!texto} onClick={() => onAplicar(Math.min(dest, items.length - 1), texto)}>
          Aplicar
        </Button>
      </div>
    </Card>
  )
}

/** Cancelar una receta emitida (queda registrada; la verificación pública la muestra como cancelada). */
function CancelarModal({ rx, onClose, onDone }: { rx: Prescription | null; onClose: () => void; onDone: (r: Prescription) => void }) {
  const [motivo, setMotivo] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setMotivo('')
    setErr('')
  }, [rx])
  if (!rx) return null
  const enviar = async () => {
    setBusy(true)
    setErr('')
    try {
      await cancelPrescription(rx.id, motivo.trim())
      onDone(rx)
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Cancelar receta ${rx.folio}`}>
      <div className="space-y-3 text-sm">
        {err && <Notice tone="danger">{err}</Notice>}
        <p>La receta no se borra: queda marcada como <b>cancelada</b> y al escanear su QR la farmacia verá que ya no es válida.</p>
        <Field label="Motivo de la cancelación">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Error en la dosis; se emitió una nueva receta." autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Volver</Button>
          <Button variant="danger" disabled={busy || motivo.trim().length < 3} onClick={enviar}>
            <Ban className="size-4" /> Cancelar receta
          </Button>
        </div>
      </div>
    </Modal>
  )
}
