import { useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { Card, Button, Field, Textarea, Input, Empty, Badge } from '../../components/ui'
import { cx } from '../../lib/utils'
import { TURNO_LABEL, turnoDe } from './calc'
import type { NotaEnf } from './hoja'
import { horaEnDia, horaPorOmision, hhmm, nuevoId, type Ctx } from './ctx'

export const SOAPIE: { k: keyof NonNullable<NotaEnf['soapie']>; label: string; ph: string }[] = [
  { k: 's', label: 'S · Subjetivo', ph: 'Lo que refiere el paciente o familiar' },
  { k: 'o', label: 'O · Objetivo', ph: 'Signos, exploración, datos medibles' },
  { k: 'a', label: 'A · Análisis', ph: 'Diagnóstico de enfermería (p. ej., NANDA)' },
  { k: 'p', label: 'P · Planeación', ph: 'Objetivos y cuidados planeados' },
  { k: 'i', label: 'I · Intervención', ph: 'Cuidados realizados' },
  { k: 'e', label: 'E · Evaluación', ph: 'Respuesta del paciente' },
]

export function textoNota(n: NotaEnf): string {
  if (n.formato === 'libre') return n.texto ?? ''
  return SOAPIE.filter((s) => n.soapie?.[s.k]?.trim()).map((s) => `${s.label.split(' · ')[0]}: ${n.soapie![s.k].trim()}`).join('\n')
}

export default function Notas({ ctx }: { ctx: Ctx }) {
  const [formato, setFormato] = useState<NotaEnf['formato']>('soapie')
  const [soapie, setSoapie] = useState<Record<string, string>>({})
  const [texto, setTexto] = useState('')
  const [hora, setHora] = useState(() => horaPorOmision(ctx.rango))
  const [a, b] = ctx.rango
  const notas = ctx.datos.notas.filter((n) => Date.parse(n.hora) >= a && Date.parse(n.hora) < b).sort((x, y) => x.hora.localeCompare(y.hora))
  const lleno = formato === 'libre' ? texto.trim() : Object.values(soapie).some((v) => v.trim())
  function guardar() {
    const t = horaEnDia(hora, ctx.dia0)
    const n: NotaEnf = {
      id: nuevoId(), hora: new Date(t).toISOString(), turno: turnoDe(t, ctx.cfg), formato, autor: ctx.enfermera || 'Enfermería',
      ...(formato === 'libre' ? { texto: texto.trim() } : { soapie: Object.fromEntries(SOAPIE.map((s) => [s.k, (soapie[s.k] ?? '').trim()])) as NotaEnf['soapie'] }),
    }
    ctx.guardar((d) => ({ ...d, notas: [...d.notas, n] }))
    setSoapie({})
    setTexto('')
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {ctx.puede && (
        <Card title="Nueva nota de enfermería">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div role="radiogroup" aria-label="Formato" className="flex rounded-lg border border-line p-0.5">
              {(['soapie', 'libre'] as const).map((f) => (
                <button key={f} role="radio" aria-checked={formato === f} onClick={() => setFormato(f)} className={cx('rounded-md px-3 py-1 text-sm', formato === f ? 'bg-brand-soft font-medium text-brand-strong' : 'hover:bg-surface-2')}>
                  {f === 'soapie' ? 'SOAPIE' : 'Libre'}
                </button>
              ))}
            </div>
            <Field label="Hora"><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-32" /></Field>
          </div>
          {formato === 'libre' ? (
            <Field label="Nota"><Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-40" /></Field>
          ) : (
            <div className="grid gap-2">
              {SOAPIE.map((s) => (
                <Field key={s.k} label={s.label}>
                  <Textarea value={soapie[s.k] ?? ''} onChange={(e) => setSoapie({ ...soapie, [s.k]: e.target.value })} placeholder={s.ph} className="min-h-12" />
                </Field>
              ))}
            </div>
          )}
          <Button variant="primary" className="mt-3" disabled={!lleno} onClick={guardar}><Save className="size-4" /> Guardar nota</Button>
          <p className="mt-2 text-xs text-muted">Las notas guardadas no se editan (registro clínico, NOM-004-SSA3-2012); para corregir, agregue una nueva nota.</p>
        </Card>
      )}
      <Card title={`Notas del turno ${TURNO_LABEL[ctx.turno].toLowerCase()}`}>
        {notas.length === 0 ? (
          <Empty>{ctx.puede ? <><Plus className="mr-1 inline size-4" />Sin notas en este turno.</> : 'Sin notas en este turno.'}</Empty>
        ) : (
          <ol className="space-y-3">
            {notas.map((n) => (
              <li key={n.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-ink tabular-nums">{hhmm(Date.parse(n.hora))}</span>
                  <Badge>{n.formato === 'soapie' ? 'SOAPIE' : 'Libre'}</Badge>
                  <span>{n.autor}</span>
                </div>
                <p className="whitespace-pre-wrap">{textoNota(n)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}
