import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Expand, Keyboard, PencilLine, Save, Shuffle, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, Field, Input, Modal, Notice, Select } from '../../components/ui'
import { toast } from '../../components/toast'
import { confirmar } from '../../components/dialogos'
import { add, useActivePatient } from '../../lib/store'
import { useCan } from '../../lib/session'
import { useCanRegistro } from '../../lib/registros'
import { cx } from '../../lib/utils'
import {
  DISTANCIAS,
  LINEAS_LOGMAR,
  alturaOptotipoMm,
  categoriaOMS,
  fmtLogmar,
  lineaE,
  lineaSloan,
  logmarADecimal,
  parseAgudeza,
  puntuarLetras,
  renderizable,
  snellen,
} from './optotipos'
import { Optotipo } from './Optotipo'
import type { useCalibracion } from './useCalibracion'

export type Ojo = 'OD' | 'OI' | 'AO'
export type Correccion = 'sin' | 'con' | 'estenopeico'
export const OJOS: { id: Ojo; label: string }[] = [
  { id: 'OD', label: 'OD (derecho)' },
  { id: 'OI', label: 'OI (izquierdo)' },
  { id: 'AO', label: 'AO (ambos)' },
]
export const CORRECCIONES: { id: Correccion; label: string }[] = [
  { id: 'sin', label: 'Sin corrección' },
  { id: 'con', label: 'Con corrección' },
  { id: 'estenopeico', label: 'Estenopeico' },
]
export interface ResultadoAV {
  ojo: Ojo
  correccion: Correccion
  logmar: number
  snellen20: string
  snellen6: string
  decimal: number
  lineas?: Record<string, number>
  manual?: boolean
}
export interface DatosAgudeza {
  distanciaM: number
  optotipo: 'sloan' | 'e'
  pxPorMm: number
  calibrada: boolean
  resultados: ResultadoAV[]
  notas?: string
}

type Marcas = Record<string, Record<string, boolean[]>> // "OD|sin" → logMAR → aciertos por letra

const k = (o: Ojo, c: Correccion) => `${o}|${c}`
const lkey = (l: number) => String(l)

export function resultado(ojo: Ojo, correccion: Correccion, logmar: number, extra: Partial<ResultadoAV> = {}): ResultadoAV {
  return { ojo, correccion, logmar, snellen20: snellen(logmar, 20), snellen6: snellen(logmar, 6), decimal: Math.round(logmarADecimal(logmar) * 100) / 100, ...extra }
}

export function Prueba({ c }: { c: ReturnType<typeof useCalibracion> }) {
  const { id: pid, patient } = useActivePatient()
  const puede = useCanRegistro('agudeza-visual', 'write')
  const puedeObs = useCan('obs.escribir')
  const [dist, setDist] = useState<string>('3')
  const [tipo, setTipo] = useState<'sloan' | 'e'>('sloan')
  const [modoLetra, setModoLetra] = useState(false)
  const [espejo, setEspejo] = useState(false)
  const [linea, setLinea] = useState(3) // logMAR 0.7
  const [letras, setLetras] = useState<string[]>(() => lineaSloan())
  const [letraIdx, setLetraIdx] = useState(0)
  const [ojo, setOjo] = useState<Ojo>('OD')
  const [corr, setCorr] = useState<Correccion>('sin')
  const [marcas, setMarcas] = useState<Marcas>({})
  const [manual, setManual] = useState<Record<string, number>>({})
  const [modalManual, setModalManual] = useState(false)
  const [ancho, setAncho] = useState(800)
  const pantalla = useRef<HTMLDivElement>(null)

  const distanciaM = Number(dist)
  const l = LINEAS_LOGMAR[linea]
  const hPx = alturaOptotipoMm(distanciaM, l) * c.pxmm
  const okRender = renderizable(distanciaM, l, c.pxmm)
  const anchoLinea = hPx * 9 // 5 letras + 4 espacios de una letra (diseño Bailey-Lovie/ETDRS)
  const unaLetra = modoLetra || anchoLinea > ancho - 16

  useEffect(() => {
    const el = pantalla.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nuevas = useCallback(() => {
    setLetras(tipo === 'e' ? lineaE() : lineaSloan())
    setLetraIdx(0)
  }, [tipo])
  useEffect(() => nuevas(), [linea, nuevas])

  const clave = k(ojo, corr)
  const marcasLinea = marcas[clave]?.[lkey(l)]

  const toggleLetra = useCallback(
    (i: number) => {
      setMarcas((m) => {
        const actual = m[clave]?.[lkey(l)] ?? [true, true, true, true, true]
        const sig = actual.map((v, j) => (j === i ? !v : v))
        return { ...m, [clave]: { ...m[clave], [lkey(l)]: sig } }
      })
    },
    [clave, l],
  )
  const marcarLinea = useCallback(
    (v: boolean) => setMarcas((m) => ({ ...m, [clave]: { ...m[clave], [lkey(l)]: [v, v, v, v, v] } })),
    [clave, l],
  )
  const quitarLinea = useCallback(
    () =>
      setMarcas((m) => {
        const copia = { ...m[clave] }
        delete copia[lkey(l)]
        return { ...m, [clave]: copia }
      }),
    [clave, l],
  )

  const mover = useCallback((d: number) => setLinea((x) => Math.max(0, Math.min(LINEAS_LOGMAR.length - 1, x + d))), [])

  // Resultados por ojo/corrección
  const resultados = useMemo(() => {
    const out: ResultadoAV[] = []
    for (const o of OJOS)
      for (const co of CORRECCIONES) {
        const kk = k(o.id, co.id)
        if (manual[kk] !== undefined) {
          out.push(resultado(o.id, co.id, manual[kk], { manual: true }))
          continue
        }
        const m = marcas[kk]
        if (!m || !Object.keys(m).length) continue
        const lineas = Object.fromEntries(Object.entries(m).map(([lk, arr]) => [lk, arr.filter(Boolean).length]))
        const v = puntuarLetras(lineas)
        if (v !== null) out.push(resultado(o.id, co.id, v, { lineas }))
      }
    return out
  }, [marcas, manual])

  // Control por teclado / control remoto de presentaciones (PageUp/PageDown = flechas)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key
      // Enter/Espacio sobre un botón o enlace conservan su acción normal
      if ((key === 'Enter' || key === ' ') && t?.closest('button, a, summary, [role="button"]')) return
      let ok = true
      if (key === 'ArrowUp' || key === 'PageUp') mover(-1)
      else if (key === 'ArrowDown' || key === 'PageDown') mover(1)
      else if (key === 'ArrowRight') setLetraIdx((i) => Math.min(4, i + 1))
      else if (key === 'ArrowLeft') setLetraIdx((i) => Math.max(0, i - 1))
      else if (key === ' ' || key === 'n' || key === 'N') nuevas()
      else if (/^[1-5]$/.test(key)) toggleLetra(Number(key) - 1)
      else if (key === 'Enter') {
        if (!marcasLinea) marcarLinea(true)
        mover(1)
      } else if (key === 'x' || key === 'X') marcarLinea(false)
      else if (key === 'Backspace' || key === 'Delete') quitarLinea()
      else if (key === 'l' || key === 'L') setModoLetra((v) => !v)
      else if (key === 'f' || key === 'F') pantallaCompleta()
      else ok = false
      if (ok) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mover, nuevas, toggleLetra, marcarLinea, quitarLinea, marcasLinea])

  function pantallaCompleta() {
    const el = pantalla.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else el.requestFullscreen?.().catch(() => toast('El navegador no permitió la pantalla completa.', 'warn'))
  }

  function guardar() {
    if (!pid || !resultados.length) return
    const cerca = distanciaM < 1
    const datos: DatosAgudeza = { distanciaM, optotipo: tipo, pxPorMm: Math.round(c.pxmm * 1000) / 1000, calibrada: !!c.cal, resultados }
    const resumen = (['OD', 'OI', 'AO'] as Ojo[])
      .map((o) => {
        const r = mejorHabitual(resultados, o)
        return r ? `${o} ${r.snellen20}` : null
      })
      .filter(Boolean)
      .join(' · ')
    add('registros', { patientId: pid, tipo: 'agudeza-visual', estado: 'completada', titulo: `Agudeza visual ${cerca ? 'cercana' : 'lejana'}: ${resumen}`, datos: datos as unknown as Record<string, unknown> })
    if (!cerca && puedeObs)
      for (const o of ['OD', 'OI'] as const) {
        const r = mejorHabitual(resultados, o)
        if (!r) continue
        add('observations', {
          patientId: pid,
          codigo: o === 'OD' ? 'agudeza-od' : 'agudeza-oi',
          valor: r.logmar,
          unidad: 'logMAR',
          etiqueta: `Agudeza visual ${o} ${r.correccion === 'con' ? 'con' : 'sin'} corrección`,
          fuente: 'manual',
          interpretacion: `${r.snellen20} (${r.snellen6}) · decimal ${r.decimal.toFixed(2)} · a ${distanciaM} m`,
        })
      }
    toast('Agudeza visual guardada en el expediente.', 'ok')
    setMarcas({})
    setManual({})
  }

  const fueraDeRango = !okRender

  return (
    <div className="space-y-4">
      {!c.cal && (
        <Notice tone="warn">
          Pantalla <b>sin calibrar</b>: los optotipos usan 96 px/pulgada y su tamaño puede ser incorrecto. Calibre en la pestaña «Calibración».
        </Notice>
      )}
      {c.cambio && <Notice tone="warn">El zoom o la resolución cambiaron desde la calibración. Vuelva a calibrar antes de medir.</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Distancia de examen">
          <Select value={dist} onChange={(e) => setDist(e.target.value)}>
            {DISTANCIAS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Optotipo">
          <Select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as 'sloan' | 'e')
            }}
          >
            <option value="sloan">Letras tipo Sloan (C D H K N O R S V Z)</option>
            <option value="e">E de Snellen (volteable)</option>
          </Select>
        </Field>
        <Field label="Ojo">
          <Select value={ojo} onChange={(e) => setOjo(e.target.value as Ojo)}>
            {OJOS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Corrección">
          <Select value={corr} onChange={(e) => setCorr(e.target.value as Correccion)}>
            {CORRECCIONES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Pantalla de optotipos: siempre negro sobre blanco (contraste máximo), independiente del tema */}
      <div
        ref={pantalla}
        className="relative flex min-h-56 flex-col items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-4 text-black [&:fullscreen]:rounded-none"
        style={{ minHeight: Math.max(224, hPx * 1.8) }}
      >
        <div className="absolute left-3 top-2 text-xs text-neutral-500">
          {snellen(l)} · {snellen(l, 6)} · logMAR {fmtLogmar(l)}
        </div>
        <div className="absolute right-3 top-2 text-xs text-neutral-500">
          {ojo} · {CORRECCIONES.find((x) => x.id === corr)?.label}
        </div>
        {fueraDeRango ? (
          <p className="max-w-sm text-center text-sm text-neutral-600">
            Esta línea mide {(hPx).toFixed(1)} px y no puede dibujarse con fidelidad en esta pantalla a {distanciaM < 1 ? `${distanciaM * 100} cm` : `${distanciaM} m`}. Use una distancia mayor o una
            pantalla de mayor densidad.
          </p>
        ) : (
          <div className="flex items-center" style={{ gap: hPx, transform: espejo ? 'scaleX(-1)' : undefined }}>
            {(unaLetra ? [letras[letraIdx]] : letras).map((v, i) => {
              const idx = unaLetra ? letraIdx : i
              return <Optotipo key={idx + v} tipo={tipo} valor={v} px={hPx} />
            })}
          </div>
        )}
        <div className="absolute bottom-2 left-3 text-[11px] text-neutral-500">
          Altura {alturaOptotipoMm(distanciaM, l).toFixed(2)} mm · {hPx.toFixed(1)} px
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card
          title="Control del examinador"
          actions={
            <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
              <Keyboard className="size-4" /> Teclado o control remoto
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => mover(-1)} aria-label="Línea más grande" disabled={linea === 0}>
              <ChevronUp className="size-4" /> Más grande
            </Button>
            <Button onClick={() => mover(1)} aria-label="Línea más pequeña" disabled={linea === LINEAS_LOGMAR.length - 1}>
              <ChevronDown className="size-4" /> Más pequeña
            </Button>
            <Button variant="ghost" onClick={nuevas}>
              <Shuffle className="size-4" /> Nuevo orden
            </Button>
            <Button variant="ghost" onClick={pantallaCompleta}>
              <Expand className="size-4" /> Pantalla completa
            </Button>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={modoLetra} onChange={(e) => setModoLetra(e.target.checked)} /> Letra aislada
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={espejo} onChange={(e) => setEspejo(e.target.checked)} /> Espejo
            </label>
          </div>

          <div className="mt-4">
            <div className="mb-1 text-xs font-medium text-muted">
              Línea {fmtLogmar(l)} ({snellen(l)}) — toque cada letra que el paciente <b>falló</b>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {letras.map((v, i) => {
                const ok = marcasLinea ? marcasLinea[i] : null
                return (
                  <button
                    key={i}
                    onClick={() => toggleLetra(i)}
                    aria-pressed={ok === false}
                    aria-label={`Letra ${i + 1} (${v}): ${ok === null ? 'sin calificar' : ok ? 'correcta' : 'fallada'}`}
                    className={cx(
                      'flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold',
                      ok === null && 'border-line bg-surface',
                      ok === true && 'border-ok/40 bg-ok/10 text-ok',
                      ok === false && 'border-danger/40 bg-danger/10 text-danger line-through',
                      unaLetra && i === letraIdx && 'ring-2 ring-brand',
                    )}
                  >
                    <span className="text-[10px] font-normal text-muted">{i + 1}</span>
                    {tipo === 'e' ? flecha(v) : v}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => marcarLinea(true)}>
                <Check className="size-4" /> Todas correctas
              </Button>
              <Button size="sm" variant="secondary" onClick={() => marcarLinea(false)}>
                <X className="size-4" /> Ninguna
              </Button>
              {marcasLinea && (
                <Button size="sm" variant="ghost" onClick={quitarLinea}>
                  Quitar calificación
                </Button>
              )}
            </div>
          </div>

          <details className="mt-4 text-xs text-muted">
            <summary className="cursor-pointer font-medium">Atajos de teclado</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              <li>↑ / RePág: línea más grande</li>
              <li>↓ / AvPág: línea más pequeña</li>
              <li>1–5: marcar/desmarcar letra fallada</li>
              <li>Enter: línea correcta y bajar</li>
              <li>X: ninguna correcta · Supr: quitar</li>
              <li>Espacio / N: nuevo orden aleatorio</li>
              <li>L: letra aislada · ← →: cambiar letra</li>
              <li>F: pantalla completa</li>
            </ul>
          </details>
        </Card>

        <Card title="Resultados de esta exploración">
          {resultados.length === 0 ? (
            <p className="text-sm text-muted">Califique al menos una línea o capture un valor manual.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {resultados.map((r) => {
                const cat = categoriaOMS(r.logmar)
                return (
                  <li key={r.ojo + r.correccion} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {r.ojo} · {CORRECCIONES.find((x) => x.id === r.correccion)?.label}
                        {r.manual && <span className="ml-1 text-xs text-muted">(manual)</span>}
                      </span>
                      <span className="font-semibold tabular-nums">{r.snellen20}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted tabular-nums">
                      <span>{r.snellen6}</span>
                      <span>decimal {r.decimal.toFixed(2)}</span>
                      <span>logMAR {fmtLogmar(r.logmar)}</span>
                      {r.ojo !== 'AO' && distanciaM >= 1 && <Badge tone={cat.tono}>{cat.grado}</Badge>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setModalManual(true)}>
              <PencilLine className="size-4" /> Captura manual
            </Button>
            {resultados.length > 0 && (
              <Button size="sm" variant="ghost" onClick={async () => {
                if (await confirmar('Se borrarán las calificaciones y capturas de esta exploración que aún no se guardaron.', { titulo: '¿Limpiar resultados?', aceptar: 'Limpiar', peligro: true })) {
                  setMarcas({})
                  setManual({})
                }
              }}>
                <Trash2 className="size-4" /> Limpiar
              </Button>
            )}
            {puede && (
              <Button variant="primary" onClick={guardar} disabled={!patient || !resultados.length}>
                <Save className="size-4" /> Guardar en expediente
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            Puntuación letra por letra (ETDRS): 0.02 logMAR por letra. Categoría de deterioro: OMS / CIE-11 (9D90), solo de lejos.
          </p>
        </Card>
      </div>

      <ModalManual
        open={modalManual}
        onClose={() => setModalManual(false)}
        ojo={ojo}
        corr={corr}
        onGuardar={(o, co, v) => {
          setManual((m) => ({ ...m, [k(o, co)]: v }))
          setModalManual(false)
        }}
      />
    </div>
  )
}

/** Resultado «habitual» de un ojo: con corrección si se midió; si no, sin corrección (el estenopeico solo se guarda en el registro). */
export function mejorHabitual(rs: ResultadoAV[], ojo: Ojo): ResultadoAV | undefined {
  return rs.find((r) => r.ojo === ojo && r.correccion === 'con') ?? rs.find((r) => r.ojo === ojo && r.correccion === 'sin')
}

function flecha(d: string) {
  return d === 'derecha' ? '→' : d === 'izquierda' ? '←' : d === 'arriba' ? '↑' : '↓'
}

function ModalManual({ open, onClose, ojo, corr, onGuardar }: { open: boolean; onClose: () => void; ojo: Ojo; corr: Correccion; onGuardar: (o: Ojo, c: Correccion, logmar: number) => void }) {
  const [o, setO] = useState<Ojo>(ojo)
  const [co, setCo] = useState<Correccion>(corr)
  const [txt, setTxt] = useState('')
  const [fallas, setFallas] = useState('0')
  useEffect(() => {
    if (open) {
      setO(ojo)
      setCo(corr)
      setTxt('')
      setFallas('0')
    }
  }, [open, ojo, corr])
  const base = parseAgudeza(txt)
  const v = base === null ? null : Math.round((base + 0.02 * Number(fallas)) * 100) / 100
  return (
    <Modal open={open} onClose={onClose} title="Captura manual (cartilla física)">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ojo">
          <Select value={o} onChange={(e) => setO(e.target.value as Ojo)}>
            {OJOS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Corrección">
          <Select value={co} onChange={(e) => setCo(e.target.value as Correccion)}>
            {CORRECCIONES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Agudeza (20/x, 6/x o decimal)" hint="Ej. 20/40, 6/12 o 0.5">
          <Input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="20/40" autoFocus />
        </Field>
        <Field label="Letras falladas en esa línea">
          <Select value={fallas} onChange={(e) => setFallas(e.target.value)}>
            {[0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Ninguna' : `−${n}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-3 text-sm">{v === null ? <span className="text-muted">Escriba un valor válido.</span> : <>logMAR {fmtLogmar(v)} · {snellen(v)} · {snellen(v, 6)} · decimal {logmarADecimal(v).toFixed(2)}</>}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={v === null} onClick={() => v !== null && onGuardar(o, co, v)}>
          Agregar
        </Button>
      </div>
    </Modal>
  )
}
