// Tamiz auditivo en el navegador (NO calibrado): tonos puros con Web Audio, método ascendente simplificado.
import { useEffect, useRef, useState } from 'react'
import { Check, Headphones, Play, RotateCcw, Save, Volume2, X } from 'lucide-react'
import { Badge, Button, Card, Notice, Unsupported } from '../../components/ui'
import { toast } from '../../components/toast'
import { add, useActivePatient } from '../../lib/store'
import { useCanRegistro } from '../../lib/registros'
import { cx } from '../../lib/utils'
import { HW, dbfsAGanancia, etiquetaFrec, evaluarTamiz, hwInicio, hwResponder, type EstadoHW } from './audiograma'

export const FRECS_TAMIZ = [1000, 2000, 4000, 500]
type Oido = 'der' | 'izq'
const ORDEN: { oido: Oido; f: number }[] = [...FRECS_TAMIZ.map((f) => ({ oido: 'der' as Oido, f })), ...FRECS_TAMIZ.map((f) => ({ oido: 'izq' as Oido, f }))]
const REF_KEY = 'medisuite.audiometria.referencia'
type Res = Record<Oido, Record<number, number | null>>

function leerRef(): Record<number, number> | null {
  try {
    const r = localStorage.getItem(REF_KEY)
    return r ? (JSON.parse(r) as Record<number, number>) : null
  } catch {
    return null
  }
}

export function Tamiz() {
  const { id: pid, patient } = useActivePatient()
  const puede = useCanRegistro('audiometria', 'write')
  const soportado = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)
  const ctx = useRef<AudioContext | null>(null)
  const [fase, setFase] = useState<'intro' | 'prueba' | 'fin'>('intro')
  const [paso, setPaso] = useState(0)
  const [hw, setHw] = useState<EstadoHW>(() => hwInicio())
  const [sonando, setSonando] = useState(false)
  const [presentado, setPresentado] = useState(false)
  const [res, setRes] = useState<Res>({ der: {}, izq: {} })
  const [ref, setRef] = useState<Record<number, number> | null>(leerRef)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void ctx.current?.close()
    },
    [],
  )

  function audio(): AudioContext {
    if (!ctx.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx.current = new AC()
    }
    void ctx.current.resume()
    return ctx.current
  }

  /** Tres pulsos de 300 ms con rampas de 25 ms, solo en el canal del oído indicado. */
  function tono(oido: Oido, f: number, dbfs: number, onFin?: () => void) {
    const ac = audio()
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = f
    const g = ac.createGain()
    g.gain.value = 0
    const merger = ac.createChannelMerger(2)
    osc.connect(g)
    g.connect(merger, 0, oido === 'izq' ? 0 : 1)
    merger.connect(ac.destination)
    const a = dbfsAGanancia(dbfs)
    const t0 = ac.currentTime + 0.05
    for (let i = 0; i < 3; i++) {
      const s = t0 + i * 0.5
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(a, s + 0.025)
      g.gain.setValueAtTime(a, s + 0.275)
      g.gain.linearRampToValueAtTime(0, s + 0.3)
    }
    osc.start(t0)
    osc.stop(t0 + 1.4)
    setSonando(true)
    osc.onended = () => {
      osc.disconnect()
      g.disconnect()
      merger.disconnect()
      setSonando(false)
      onFin?.()
    }
  }

  const actual = ORDEN[paso]

  function responder(oyo: boolean) {
    const s = hwResponder(hw, oyo)
    setPresentado(false)
    if (!s.terminado) return setHw(s)
    const nuevo: Res = { ...res, [actual.oido]: { ...res[actual.oido], [actual.f]: s.umbral } }
    setRes(nuevo)
    if (paso + 1 >= ORDEN.length) {
      setFase('fin')
      return
    }
    setPaso(paso + 1)
    setHw(hwInicio())
  }

  function reiniciar() {
    setFase('intro')
    setPaso(0)
    setHw(hwInicio())
    setRes({ der: {}, izq: {} })
    setPresentado(false)
  }

  const ev = evaluarTamiz(res.der, res.izq, ref ?? undefined)

  function guardar() {
    if (!pid) return
    add('registros', {
      patientId: pid,
      tipo: 'audiometria',
      estado: 'completada',
      titulo: `Tamiz auditivo en navegador (no calibrado): ${ev.sugerirAudiometria ? 'sugerir audiometría' : 'sin diferencias relevantes'}`,
      datos: { modo: 'tamiz-navegador', escala: 'dBFS relativos (no dB HL)', relativos: res, referencia: ref ?? undefined, sugerirAudiometria: ev.sugerirAudiometria, motivos: ev.motivos },
    })
    toast('Tamiz guardado en el expediente.', 'ok')
  }

  function usarComoReferencia() {
    const r: Record<number, number> = {}
    for (const f of FRECS_TAMIZ) {
      const a = res.der[f]
      const b = res.izq[f]
      const vals = [a, b].filter((v): v is number => v != null)
      if (vals.length) r[f] = Math.round(vals.reduce((x, y) => x + y, 0) / vals.length)
    }
    try {
      localStorage.setItem(REF_KEY, JSON.stringify(r))
    } catch {
      /* ignorar */
    }
    setRef(r)
    toast('Referencia guardada para este equipo y audífonos.', 'ok')
  }

  if (!soportado) return <Unsupported api="Web Audio" />

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-warn bg-warn/10 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold text-warn">
          <Volume2 className="size-5" /> Tamiz NO calibrado — demostración guiada
        </div>
        <p>
          El navegador no conoce el volumen real de sus audífonos: los niveles son <b>dB relativos al máximo del equipo (dBFS), no dB HL</b>. Este tamiz no sustituye una
          audiometría tonal con audiómetro calibrado y <b>no permite diagnosticar ni descartar</b> pérdida auditiva. Úselo solo para comparar oídos entre sí o contra una
          persona con audición normal medida en el mismo equipo. Ante cualquier duda, refiera a audiometría formal.
        </p>
      </div>

      {fase === 'intro' && (
        <Card title="Preparación">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Use audífonos de diadema (no bocinas) en un cuarto silencioso.</li>
            <li>Fije el volumen del sistema en un nivel cómodo y no lo cambie durante la prueba (ni entre pacientes si usará una referencia).</li>
            <li>Verifique el lado de cada audífono con los tonos de prueba.</li>
            <li>Presente cada tono y pregunte al paciente si lo escuchó. Frecuencias: 1, 2, 4 kHz y 500 Hz, primero oído derecho.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => tono('der', 1000, -20)} disabled={sonando}>
              <Headphones className="size-4" /> Probar derecho
            </Button>
            <Button onClick={() => tono('izq', 1000, -20)} disabled={sonando}>
              <Headphones className="size-4" /> Probar izquierdo
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                audio()
                setFase('prueba')
              }}
            >
              <Play className="size-4" /> Iniciar tamiz
            </Button>
          </div>
          {ref && <p className="mt-3 text-xs text-muted">Hay una referencia guardada para este equipo: los resultados se compararán contra ella.</p>}
        </Card>
      )}

      {fase === 'prueba' && actual && (
        <Card title={`Oído ${actual.oido === 'der' ? 'derecho' : 'izquierdo'} · ${actual.f} Hz`} actions={<Badge>{paso + 1} / {ORDEN.length}</Badge>}>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className={cx('text-sm', actual.oido === 'der' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400')}>
              Nivel actual: <b className="tabular-nums">{hw.nivel} dB</b> relativos (máx. {HW.max})
            </div>
            <Button variant="primary" onClick={() => tono(actual.oido, actual.f, hw.nivel, () => setPresentado(true))} disabled={sonando} className="h-12 px-6">
              <Play className="size-5" /> {sonando ? 'Sonando…' : 'Presentar tono'}
            </Button>
            <div className="flex gap-2" aria-live="polite">
              <Button onClick={() => responder(true)} disabled={!presentado || sonando} className="h-11">
                <Check className="size-4" /> Lo escuchó
              </Button>
              <Button onClick={() => responder(false)} disabled={!presentado || sonando} className="h-11">
                <X className="size-4" /> No lo escuchó
              </Button>
            </div>
            <p className="max-w-md text-xs text-muted">Método ascendente simplificado (Hughson-Westlake): si lo escucha baja 10 dB; si no, sube 5 dB. El umbral es el nivel más bajo escuchado 2 veces al subir.</p>
          </div>
          <Progreso res={res} />
        </Card>
      )}

      {fase === 'fin' && (
        <Card title="Resultado del tamiz (relativo)">
          <Progreso res={res} ref_={ref} />
          <div className="mt-4">
            {ev.sugerirAudiometria ? (
              <Notice tone="warn">
                <b>Se sugiere audiometría formal.</b>
                <ul className="mt-1 list-disc pl-5">
                  {ev.motivos.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Notice>
            ) : (
              <Notice>
                Sin diferencias ≥ 15 dB entre oídos{ref ? ' ni respecto a la referencia del equipo' : ''}. Esto <b>no</b> confirma audición normal; si hay síntomas o factores
                de riesgo, solicite audiometría.
              </Notice>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={reiniciar}>
              <RotateCcw className="size-4" /> Repetir
            </Button>
            <Button variant="ghost" onClick={usarComoReferencia} title="Solo con una persona joven con audición normal comprobada">
              Usar como referencia del equipo
            </Button>
            {puede && (
              <Button variant="primary" onClick={guardar} disabled={!patient}>
                <Save className="size-4" /> Guardar en expediente
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            «Referencia del equipo»: mida con estos mismos audífonos y volumen a una persona con audición normal comprobada; se guarda solo en este navegador.
          </p>
        </Card>
      )}
    </div>
  )
}

function Progreso({ res, ref_ }: { res: Res; ref_?: Record<number, number> | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted">
            <th className="py-1 text-left font-medium">dB relativos</th>
            {FRECS_TAMIZ.map((f) => (
              <th key={f} className="py-1 text-center font-medium">
                {etiquetaFrec(f)}Hz
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['der', 'izq'] as Oido[]).map((o) => (
            <tr key={o} className="border-t border-line">
              <td className={cx('py-1 font-medium', o === 'der' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400')}>{o === 'der' ? 'Derecho' : 'Izquierdo'}</td>
              {FRECS_TAMIZ.map((f) => (
                <td key={f} className="py-1 text-center">
                  {f in res[o] ? (res[o][f] === null ? 'NR' : res[o][f]) : '·'}
                </td>
              ))}
            </tr>
          ))}
          {ref_ && (
            <tr className="border-t border-line text-muted">
              <td className="py-1">Referencia</td>
              {FRECS_TAMIZ.map((f) => (
                <td key={f} className="py-1 text-center">
                  {ref_[f] ?? '·'}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
