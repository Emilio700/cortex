import { useMemo, useState } from 'react'
import { Printer, RotateCcw, Save } from 'lucide-react'
import { Card, Button, Field, Textarea, Notice } from '../../components/ui'
import { toast } from '../../components/toast'
import { useCollection, useSettings } from '../../lib/store'
import { edad, fmtFecha, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { imprimirHTML } from '../../lib/imprimir'
import { TURNO_LABEL, VIAS_EGRESO, VIAS_INGRESO } from './calc'
import { dosisDelDia, type SBAR } from './hoja'
import { COLS, useObsTurno } from './Signos'
import { totalesTurno } from './Balance'
import { resumenMar, useOrdenes } from './Mar'
import { textoNota } from './Notas'
import { hhmm, usePeso, type Ctx } from './ctx'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export default function Entrega({ ctx }: { ctx: Ctx }) {
  const settings = useSettings()
  const p = ctx.patient
  const obs = useObsTurno(ctx)
  const peso = usePeso(ctx)
  const ordenes = useOrdenes(ctx)
  const dosis = useMemo(() => dosisDelDia(ordenes, ctx.datos, ctx.dia0), [ordenes, ctx.datos, ctx.dia0])
  const mar = resumenMar(ctx, dosis)
  const tot = totalesTurno(ctx, ctx.turno, peso)
  const encs = useCollection('encounters', (e) => e.patientId === ctx.pid, [ctx.pid])
  const escalas = useCollection('observations', (o) => o.patientId === ctx.pid && o.codigo === 'escala' && (o.etiqueta === 'Braden' || o.etiqueta === 'Morse'), [ctx.pid])
  const ultimaEnc = [...encs].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const ultimo = (k: string) => obs.filter((o) => o.codigo === k).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const esc1 = (n: string) => escalas.filter((o) => o.etiqueta === n).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]

  const auto = useMemo((): Omit<SBAR, 'por' | 'fecha'> => {
    if (!p) return { s: '', b: '', a: '', r: '' }
    const dx = ultimaEnc?.diagnosticos.map((d) => `${d.codigo} ${d.nombre}`).join('; ')
    const vit = COLS.map((c) => { const o = ultimo(c.k); return o ? `${c.label} ${o.valor}` : null }).filter(Boolean).join(', ')
    const braden = esc1('Braden'), morse = esc1('Morse')
    return {
      s: `${nombreCompleto(p)}, ${edad(p.fechaNac).texto}. ${ultimaEnc?.motivo ? `Motivo: ${ultimaEnc.motivo}. ` : ''}${dx ? `Dx: ${dx}.` : ''}`.trim(),
      b: [`Alergias: ${p.alergias.length ? p.alergias.join(', ') : 'negadas'}.`, p.antecedentes ? `Antecedentes: ${p.antecedentes}` : '', p.medicamentosActuales?.length ? `Medicamentos habituales: ${p.medicamentosActuales.join(', ')}.` : ''].filter(Boolean).join('\n'),
      a: [
        vit ? `Últimos signos del turno: ${vit}.` : 'Sin signos vitales registrados en el turno.',
        `Balance del turno: ingresos ${tot.ingresos} mL, egresos ${tot.egresos} mL (incluye ${tot.insensibles} mL insensibles) = ${tot.balance > 0 ? '+' : ''}${tot.balance} mL.`,
        `Medicamentos: ${mar.aplicadas} aplicados, ${mar.pendientes.length} pendientes${mar.noAplicadas.length ? `, ${mar.noAplicadas.length} omitidos/rechazados` : ''}.`,
        braden || morse ? `Escalas: ${[braden && `Braden ${braden.valor} (${braden.interpretacion ?? ''})`, morse && `Morse ${morse.valor} (${morse.interpretacion ?? ''})`].filter(Boolean).join('; ')}.` : '',
      ].filter(Boolean).join('\n'),
      r: mar.pendientes.length ? `Dosis pendientes: ${mar.pendientes.map((d) => `${hhmm(d.programada)} ${d.orden.medicamento}`).join('; ')}.` : '',
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, ultimaEnc, obs, tot.ingresos, tot.egresos, tot.balance, mar.aplicadas, mar.pendientes.length, mar.noAplicadas.length, escalas])

  const guardada = ctx.datos.entregas[ctx.turno]
  const [sbar, setSbar] = useState<Omit<SBAR, 'por' | 'fecha'>>(() => guardada ?? auto)
  const set = (k: keyof typeof sbar, v: string) => setSbar({ ...sbar, [k]: v })

  function guardar() {
    ctx.guardar((d) => ({ ...d, entregas: { ...d.entregas, [ctx.turno]: { ...sbar, por: ctx.enfermera || 'Enfermería', fecha: new Date().toISOString() } } }))
    toast('Entrega de turno guardada', 'ok')
  }

  function imprimir() {
    if (!p) return
    const [a, b] = ctx.rango
    const horas = [...new Set(obs.map((o) => Math.floor(Date.parse(o.fecha) / 3600000) * 3600000))].sort()
    const filasSignos = horas
      .map((h) => `<tr><td>${hhmm(h)}</td>${COLS.map((c) => { const o = obs.filter((x) => x.codigo === c.k && Date.parse(x.fecha) >= h && Date.parse(x.fecha) < h + 3600000).pop(); return `<td>${o ? o.valor : ''}</td>` }).join('')}</tr>`)
      .join('')
    const movs = ctx.datos.movimientos.filter((m) => Date.parse(m.hora) >= a && Date.parse(m.hora) < b).sort((x, y) => x.hora.localeCompare(y.hora))
    const etiquetaVia = (v: string) => (VIAS_INGRESO as Record<string, string>)[v] ?? (VIAS_EGRESO as Record<string, string>)[v] ?? v
    const notas = ctx.datos.notas.filter((n) => Date.parse(n.hora) >= a && Date.parse(n.hora) < b)
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de enfermería</title><style>
      body{font:11px/1.4 system-ui,sans-serif;color:#111;margin:16px}h1{font-size:16px;margin:0}h2{font-size:12px;margin:14px 0 4px;border-bottom:1px solid #999}
      table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:2px 4px;text-align:left}th{background:#eee}.r{text-align:right}
      .sbar b{display:inline-block;width:18px}.pre{white-space:pre-wrap}.muted{color:#555}@page{margin:12mm}</style></head><body>
      <h1>Hoja de enfermería · Turno ${TURNO_LABEL[ctx.turno].toLowerCase()}</h1>
      <div class="muted">${esc(settings.clinica)} · ${fmtFecha(new Date(a).toISOString())} ${hhmm(a)}–${hhmm(b)}</div>
      <p><b>${esc(nombreCompleto(p))}</b> · ${edad(p.fechaNac).texto} · ${p.sexo === 'F' ? 'Femenino' : 'Masculino'}${p.curp ? ` · CURP ${esc(p.curp)}` : ''} · Peso ${peso ?? '—'} kg · <b>Alergias:</b> ${esc(p.alergias.join(', ') || 'negadas')}</p>
      <h2>Entrega de turno (SBAR)</h2><div class="sbar">${(['s', 'b', 'a', 'r'] as const).map((k) => `<p class="pre"><b>${k.toUpperCase()}</b>${esc(sbar[k])}</p>`).join('')}</div>
      <h2>Signos vitales</h2>${filasSignos ? `<table><tr><th>Hora</th>${COLS.map((c) => `<th>${c.label} (${c.unidad})</th>`).join('')}</tr>${filasSignos}</table>` : '<p class="muted">Sin registros.</p>'}
      <h2>Balance hídrico</h2><table><tr><th>Hora</th><th>Tipo</th><th>Vía</th><th class="r">mL</th></tr>${movs.map((m) => `<tr><td>${hhmm(Date.parse(m.hora))}</td><td>${m.tipo}</td><td>${esc(etiquetaVia(m.via))}${m.nota ? ` · ${esc(m.nota)}` : ''}</td><td class="r">${m.ml}</td></tr>`).join('')}
      <tr><th colspan="3">Ingresos</th><th class="r">${tot.ingresos}</th></tr><tr><th colspan="3">Egresos medidos + insensibles (${tot.insensibles})</th><th class="r">${tot.egresos}</th></tr><tr><th colspan="3">Balance</th><th class="r">${tot.balance > 0 ? '+' : ''}${tot.balance}</th></tr></table>
      <h2>Medicamentos</h2>${mar.turno.length ? `<table><tr><th>Programada</th><th>Medicamento</th><th>Dosis / vía</th><th>Estado</th><th>Hora · enfermera</th></tr>${mar.turno.map((d) => `<tr><td>${hhmm(d.programada)}</td><td>${esc(d.orden.medicamento)}</td><td>${esc(d.orden.dosis)} · ${esc(d.orden.via)}</td><td>${d.aplicacion?.estado ?? 'pendiente'}</td><td>${d.aplicacion ? `${hhmm(Date.parse(d.aplicacion.hora))} · ${esc(d.aplicacion.enfermera)}${d.aplicacion.nota ? ` · ${esc(d.aplicacion.nota)}` : ''}` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Sin dosis programadas.</p>'}
      <h2>Notas de enfermería</h2>${notas.map((n) => `<p class="pre"><b>${hhmm(Date.parse(n.hora))}</b> (${esc(n.autor)}) ${esc(textoNota(n))}</p>`).join('') || '<p class="muted">Sin notas.</p>'}
      <p style="margin-top:28px">Entrega: ______________________ &nbsp;&nbsp; Recibe: ______________________</p>
      <p class="muted">Impreso ${fmtFechaHora(new Date().toISOString())} · MediSuite</p></body></html>`
    imprimirHTML(html, 'Hoja de enfermería')
  }

  if (!p) return <Notice tone="warn">Selecciona un paciente.</Notice>
  const campos: { k: keyof typeof sbar; label: string }[] = [
    { k: 's', label: 'S · Situación' },
    { k: 'b', label: 'B · Antecedentes (Background)' },
    { k: 'a', label: 'A · Evaluación (Assessment)' },
    { k: 'r', label: 'R · Recomendación' },
  ]
  return (
    <Card
      title={`Entrega del turno ${TURNO_LABEL[ctx.turno].toLowerCase()} (SBAR)`}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => setSbar(auto)}><RotateCcw className="size-4" /> Regenerar</Button>
          <Button size="sm" onClick={imprimir}><Printer className="size-4" /> Imprimir hoja</Button>
        </>
      }
    >
      {guardada && <p className="mb-3 text-xs text-muted">Guardada por {guardada.por} · {fmtFechaHora(guardada.fecha)}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {campos.map((c) => (
          <Field key={c.k} label={c.label}>
            <Textarea value={sbar[c.k]} onChange={(e) => set(c.k, e.target.value)} className="min-h-28" disabled={!ctx.puede} />
          </Field>
        ))}
      </div>
      {ctx.puede && <Button variant="primary" className="mt-3" onClick={guardar}><Save className="size-4" /> Guardar entrega</Button>}
      <p className="mt-3 text-xs text-muted">SBAR (Situation, Background, Assessment, Recommendation): técnica de comunicación estructurada recomendada para el traspaso de pacientes (OMS, «Comunicación durante el traspaso de pacientes», Soluciones para la seguridad del paciente, solución 3, 2007; en México, Acción Esencial para la Seguridad del Paciente 2 «Comunicación efectiva», Consejo de Salubridad General, que la describe como SAER — verificar).</p>
    </Card>
  )
}
