import { useState } from 'react'
import { Save, CalendarCheck } from 'lucide-react'
import { Card, Field, Input, Button, Badge, Notice, Textarea } from '../../components/ui'
import { toast } from '../../components/toast'
import { update } from '../../lib/store'
import type { Registro } from '../../lib/types'
import { LCC_RANGO, datar, hoyISO, lccAEdad, pesoEnZ, percentilHadlock91, pfeHadlock, sdgEn, sdgTexto } from './calc'
import { datosEmb, type Biometria } from './modelo'

const fmtF = (f?: string | null) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))

export function BiometriaFetal({ emb, puede }: { emb: Registro | null; puede: boolean }) {
  const e = emb ? datosEmb(emb) : null
  const [fecha, setFecha] = useState(hoyISO())
  const [lcc, setLcc] = useState('')
  const [cc, setCc] = useState('')
  const [ca, setCa] = useState('')
  const [lf, setLf] = useState('')
  const [egManual, setEgManual] = useState('')
  const [notas, setNotas] = useState('')

  const vLcc = num(lcc)
  const egLccDias = vLcc && vLcc > 0 ? lccAEdad(vLcc) : null
  const lccFuera = vLcc !== undefined && (vLcc < LCC_RANGO[0] || vLcc > LCC_RANGO[1])
  const [vCc, vCa, vLf] = [num(cc), num(ca), num(lf)]
  const pfe = vCc && vCa && vLf ? pfeHadlock(vCc, vCa, vLf) : null
  const fumEf = e ? datar(e.fum, e.usg).fumEfectiva : null
  const egDatacion = fumEf ? sdgEn(fumEf, fecha) : null
  const egSem = num(egManual) ?? (egDatacion !== null ? egDatacion / 7 : undefined)
  const pct = pfe && egSem ? percentilHadlock91(pfe, egSem) : null
  const egFuera = egSem !== undefined && (egSem < 10 || egSem > 40)

  function guardar() {
    if (!emb || !e) return
    const b: Biometria = { fecha, sdgDias: egSem !== undefined ? Math.round(egSem * 7) : undefined, lcc: vLcc, cc: vCc, ca: vCa, lf: vLf, pfe: pfe ?? undefined, percentil: pct && !egFuera ? pct.percentil : undefined, notas: notas || undefined }
    update('registros', emb.id, { datos: { ...e, biometrias: [...(e.biometrias ?? []), b].sort((a, z) => a.fecha.localeCompare(z.fecha)) } as unknown as Registro['datos'] })
    toast('Ultrasonido guardado en el embarazo', 'ok')
  }
  function usarParaDatar() {
    if (!emb || !e || !egLccDias) return
    update('registros', emb.id, { datos: { ...e, usg: { fecha, sdgDias: Math.round(egLccDias), lcc: vLcc } } as unknown as Registro['datos'] })
    const d = datar(e.fum, { fecha, sdgDias: Math.round(egLccDias) })
    toast(d.explicacion, d.metodo === 'USG' ? 'warn' : 'ok', { title: 'USG de datación registrado' })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Longitud cráneo-caudal → edad gestacional">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha del ultrasonido"><Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} /></Field>
          <Field label="LCC (mm)"><Input inputMode="decimal" value={lcc} onChange={(ev) => setLcc(ev.target.value)} placeholder="p. ej. 45" /></Field>
        </div>
        {egLccDias !== null && (
          <div className="mt-3 rounded-lg bg-surface-2 p-3">
            <div className="text-xs text-muted">Edad gestacional por LCC</div>
            <div className="text-2xl font-semibold tabular-nums">{sdgTexto(Math.round(egLccDias))}</div>
            <div className="text-xs text-muted">{egLccDias.toFixed(1)} días · FPP por USG {fmtF(datar(null, { fecha, sdgDias: Math.round(egLccDias) }).fpp)}</div>
          </div>
        )}
        {lccFuera && <Notice tone="warn">La LCC se usa para datar entre {LCC_RANGO[0]} y {LCC_RANGO[1]} mm (hasta 13 6/7 SDG). Fuera de ese rango use biometría (DBP, CC, CA, LF).</Notice>}
        {emb && puede && egLccDias !== null && !lccFuera && (
          <Button className="mt-3" onClick={usarParaDatar}>
            <CalendarCheck className="size-4" /> Usar como USG de datación
          </Button>
        )}
        <p className="mt-3 text-xs text-muted">Robinson HP, Fleming JE. Br J Obstet Gynaecol 1975;82:702–10: EG (días) = 8.052 × √LCC (mm) + 23.73. Re-datación según ACOG CO 700 (&gt; 7 días de discrepancia entre 9 y 13 6/7 SDG; &gt; 5 días antes de 9 SDG).</p>
      </Card>

      <Card title="Peso fetal estimado y percentil">
        <div className="grid grid-cols-3 gap-3">
          <Field label="CC (cm)"><Input inputMode="decimal" value={cc} onChange={(ev) => setCc(ev.target.value)} /></Field>
          <Field label="CA (cm)"><Input inputMode="decimal" value={ca} onChange={(ev) => setCa(ev.target.value)} /></Field>
          <Field label="LF (cm)"><Input inputMode="decimal" value={lf} onChange={(ev) => setLf(ev.target.value)} /></Field>
          <Field label="EG para el percentil (semanas)" className="col-span-3" hint={egDatacion !== null ? `Por datación del embarazo: ${sdgTexto(egDatacion)} el ${fmtF(fecha)}. Escribe otra si es necesario.` : 'Sin datación del embarazo: escribe la EG.'}>
            <Input inputMode="decimal" value={egManual} onChange={(ev) => setEgManual(ev.target.value)} placeholder={egDatacion !== null ? (egDatacion / 7).toFixed(1) : 'p. ej. 30.5'} />
          </Field>
        </div>
        {pfe !== null && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xs text-muted">PFE (Hadlock 1985)</div>
              <div className="text-2xl font-semibold tabular-nums">{Math.round(pfe)} g</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xs text-muted">Percentil (Hadlock 1991)</div>
              {pct && !egFuera ? (
                <>
                  <div className="text-2xl font-semibold tabular-nums">p{pct.percentil < 1 ? '<1' : pct.percentil > 99 ? '>99' : pct.percentil.toFixed(0)}</div>
                  <div className="mt-1">
                    {pct.percentil < 10 ? <Badge tone="danger">&lt; p10: pequeño para la EG</Badge> : pct.percentil > 90 ? <Badge tone="warn">&gt; p90: grande para la EG</Badge> : <Badge tone="ok">p10–p90</Badge>}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted">{egFuera ? 'EG fuera de 10–40 sem' : 'Falta la EG'}</div>
              )}
            </div>
            {pct && egSem && !egFuera && (
              <div className="col-span-2 text-xs text-muted">
                A {egSem.toFixed(1)} sem: p10 ≈ {Math.round(pesoEnZ(egSem, -1.2816))} g · p50 ≈ {Math.round(pct.mediana)} g · p90 ≈ {Math.round(pesoEnZ(egSem, 1.2816))} g (z = {pct.z.toFixed(2)})
              </div>
            )}
          </div>
        )}
        <Field label="Notas del ultrasonido" className="mt-3"><Textarea value={notas} onChange={(ev) => setNotas(ev.target.value)} className="min-h-14" /></Field>
        {emb && puede && (vLcc || pfe) && (
          <Button variant="primary" className="mt-3" onClick={guardar}>
            <Save className="size-4" /> Guardar en el embarazo
          </Button>
        )}
        <p className="mt-3 text-xs text-muted">
          Hadlock FP et al. Am J Obstet Gynecol 1985;151:333–7: log₁₀ PFE = 1.326 − 0.00326·CA·LF + 0.0107·CC + 0.0438·CA + 0.158·LF (cm). Percentil: Hadlock FP et al. Radiology 1991;181:129–33, ln(peso) = 0.578 + 0.332·EG − 0.00354·EG², DE 12.7 %, calculado con la ecuación (la tabla impresa del artículo no coincide con ella; Roberts et al., AJOG 2025).
        </p>
      </Card>
    </div>
  )
}
