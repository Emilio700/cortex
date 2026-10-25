import { useRef, useState } from 'react'
import { Eraser, Save } from 'lucide-react'
import { Button, Card, Field, Notice, Select, Textarea } from '../../components/ui'
import { toast } from '../../components/toast'
import { add, useActivePatient } from '../../lib/store'
import { useCanRegistro } from '../../lib/registros'
import { cx, fmtFecha, nombreCompleto } from '../../lib/utils'
import { AMSLER, anguloGrados } from './optotipos'
import type { useCalibracion } from './useCalibracion'

type Marca = 'distorsion' | 'faltante'
const N = AMSLER.cuadros
const COLOR: Record<Marca, string> = { distorsion: 'rgba(234,179,8,0.55)', faltante: 'rgba(220,38,38,0.55)' }

export function Amsler({ c }: { c: ReturnType<typeof useCalibracion> }) {
  const { id: pid, patient } = useActivePatient()
  const puede = useCanRegistro('agudeza-visual', 'write')
  const [ojo, setOjo] = useState<'OD' | 'OI'>('OD')
  const [modo, setModo] = useState<Marca>('distorsion')
  const [celdas, setCeldas] = useState<Record<number, Marca>>({})
  const [notas, setNotas] = useState('')
  const pintando = useRef<null | 'poner' | 'quitar'>(null)
  const lado = AMSLER.ladoMm * c.pxmm
  const cel = lado / N

  const aplicar = (i: number, accion: 'poner' | 'quitar') =>
    setCeldas((m) => {
      const n = { ...m }
      if (accion === 'quitar') delete n[i]
      else n[i] = modo
      return n
    })

  const indiceDe = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * N)
    const y = Math.floor(((e.clientY - r.top) / r.height) * N)
    if (x < 0 || y < 0 || x >= N || y >= N) return null
    return y * N + x
  }

  const total = Object.keys(celdas).length
  const nDist = Object.values(celdas).filter((v) => v === 'distorsion').length
  const nFalt = total - nDist

  async function guardar() {
    if (!pid || !patient) return
    const png = amslerPNG(celdas, ojo, `${nombreCompleto(patient)} · ${fmtFecha(new Date().toISOString())}`, notas)
    const fecha = new Date().toISOString()
    add('documents', {
      patientId: pid,
      tipo: 'estudio',
      nombre: `Rejilla de Amsler ${ojo} ${fmtFecha(fecha)}`,
      mime: 'image/png',
      dataUrl: png,
      meta: { modulo: 'vision', ojo, celdas },
    })
    add('registros', {
      patientId: pid,
      tipo: 'agudeza-visual',
      estado: 'completada',
      titulo: `Rejilla de Amsler ${ojo}: ${total ? `${total} cuadro(s) alterado(s)` : 'sin alteraciones'}`,
      datos: { amsler: { ojo, celdas, distorsion: nDist, faltante: nFalt, notas: notas || undefined, pxPorMm: Math.round(c.pxmm * 1000) / 1000, calibrada: !!c.cal } },
    })
    toast('Rejilla guardada en documentos del paciente.', 'ok')
    setCeldas({})
    setNotas('')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card title="Rejilla de Amsler (10 × 10 cm)" pad={false}>
        <div className="p-4">
          {!c.cal && <Notice tone="warn">Pantalla sin calibrar: la rejilla puede no medir 10 cm. Calibre antes de usarla.</Notice>}
          <p className="text-sm text-muted">
            Distancia de lectura {AMSLER.distanciaCm}–33 cm, con su corrección de cerca, <b>un ojo a la vez</b> (cubra el otro). El paciente fija la vista en el punto central y
            señala zonas onduladas, borrosas o faltantes. Cada cuadro de 5 mm subtiende ≈{anguloGrados(5, AMSLER.distanciaCm).toFixed(1)}°.
          </p>
        </div>
        <div className="overflow-auto border-t border-line bg-white p-4">
          <svg
            width={lado}
            height={lado}
            viewBox={`0 0 ${N} ${N}`}
            className="mx-auto block touch-none select-none"
            style={{ overflow: 'visible' }}
            role="img"
            aria-label={`Rejilla de Amsler, ${total} cuadros marcados`}
            onPointerDown={(e) => {
              const i = indiceDe(e)
              if (i === null) return
              e.currentTarget.setPointerCapture(e.pointerId)
              pintando.current = celdas[i] === modo ? 'quitar' : 'poner'
              aplicar(i, pintando.current)
            }}
            onPointerMove={(e) => {
              if (!pintando.current) return
              const i = indiceDe(e)
              if (i !== null) aplicar(i, pintando.current)
            }}
            onPointerUp={() => (pintando.current = null)}
            onPointerCancel={() => (pintando.current = null)}
          >
            <rect x={0} y={0} width={N} height={N} fill="#fff" />
            {Object.entries(celdas).map(([i, m]) => (
              <rect key={i} x={Number(i) % N} y={Math.floor(Number(i) / N)} width={1} height={1} fill={COLOR[m]} />
            ))}
            {Array.from({ length: N + 1 }, (_, i) => (
              <g key={i} stroke="#000" strokeWidth={Math.max(0.03, 1 / cel)}>
                <line x1={i} y1={0} x2={i} y2={N} />
                <line x1={0} y1={i} x2={N} y2={i} />
              </g>
            ))}
            <circle cx={N / 2} cy={N / 2} r={0.28} fill="#000" />
          </svg>
        </div>
      </Card>
      <div className="space-y-4">
        <Card title="Marcar hallazgos">
          <div className="space-y-3">
            <Field label="Ojo evaluado">
              <Select value={ojo} onChange={(e) => setOjo(e.target.value as 'OD' | 'OI')}>
                <option value="OD">OD (derecho)</option>
                <option value="OI">OI (izquierdo)</option>
              </Select>
            </Field>
            <div role="radiogroup" aria-label="Tipo de alteración" className="grid grid-cols-2 gap-2">
              {(['distorsion', 'faltante'] as Marca[]).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={modo === m}
                  onClick={() => setModo(m)}
                  className={cx('flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm', modo === m ? 'border-brand ring-2 ring-brand/30' : 'border-line')}
                >
                  <span className="size-4 shrink-0 rounded-sm border border-line" style={{ background: COLOR[m] }} />
                  {m === 'distorsion' ? 'Ondulada / distorsión' : 'Borrosa / faltante'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">Toque o arrastre sobre la rejilla para marcar; toque de nuevo para quitar.</p>
            <div className="text-sm">
              <b>{total}</b> cuadro(s): {nDist} con distorsión, {nFalt} borrosos/faltantes
            </div>
            <Field label="Notas">
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. metamorfopsia paracentral superior" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCeldas({})} disabled={!total}>
                <Eraser className="size-4" /> Limpiar
              </Button>
              {puede && (
                <Button variant="primary" onClick={guardar} disabled={!patient}>
                  <Save className="size-4" /> Guardar PNG en documentos
                </Button>
              )}
            </div>
          </div>
        </Card>
        <Notice>
          Una rejilla anormal (líneas onduladas, zonas faltantes) sugiere enfermedad macular y requiere valoración oftalmológica con fondo de ojo / OCT. Una rejilla
          normal no la descarta. Ref.: Amsler M. Br J Ophthalmol 1953;37:521-31; AAO Preferred Practice Pattern, Age-Related Macular Degeneration (2019).
        </Notice>
      </div>
    </div>
  )
}

/** Dibuja la rejilla con las marcas en un PNG (8 px/mm) con encabezado. */
export function amslerPNG(celdas: Record<number, Marca>, ojo: string, subtitulo: string, notas?: string): string {
  const s = 8 // px por mm
  const lado = AMSLER.ladoMm * s
  const m = 40
  const head = 70
  const pie = notas ? 70 : 40
  const cv = document.createElement('canvas')
  cv.width = lado + 2 * m
  cv.height = lado + head + pie + m
  const g = cv.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = '#111'
  g.font = 'bold 22px sans-serif'
  g.fillText(`Rejilla de Amsler — ${ojo === 'OD' ? 'Ojo derecho (OD)' : 'Ojo izquierdo (OI)'}`, m, 34)
  g.font = '15px sans-serif'
  g.fillStyle = '#444'
  g.fillText(subtitulo, m, 58)
  const y0 = head
  const c = lado / N
  for (const [i, t] of Object.entries(celdas)) {
    g.fillStyle = COLOR[t]
    g.fillRect(m + (Number(i) % N) * c, y0 + Math.floor(Number(i) / N) * c, c, c)
  }
  g.strokeStyle = '#000'
  g.lineWidth = 1.5
  for (let i = 0; i <= N; i++) {
    g.beginPath()
    g.moveTo(m + i * c, y0)
    g.lineTo(m + i * c, y0 + lado)
    g.moveTo(m, y0 + i * c)
    g.lineTo(m + lado, y0 + i * c)
    g.stroke()
  }
  g.fillStyle = '#000'
  g.beginPath()
  g.arc(m + lado / 2, y0 + lado / 2, 5, 0, Math.PI * 2)
  g.fill()
  const n = Object.keys(celdas).length
  const nd = Object.values(celdas).filter((v) => v === 'distorsion').length
  g.font = '14px sans-serif'
  g.fillStyle = '#333'
  g.fillText(`Amarillo: distorsión (${nd}) · Rojo: borrosa/faltante (${n - nd}) · Tamizaje, no sustituye la exploración oftalmológica.`, m, y0 + lado + 26)
  if (notas) g.fillText(`Notas: ${notas.slice(0, 110)}`, m, y0 + lado + 50)
  return cv.toDataURL('image/png')
}
