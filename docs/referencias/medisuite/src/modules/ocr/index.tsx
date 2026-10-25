import { useEffect, useRef, useState } from 'react'
import { Camera, FileImage, FlaskConical, RotateCcw, RotateCw, ScanText, Save, RefreshCw } from 'lucide-react'
import { Page, Card, Button, Field, Input, Textarea, Badge, Notice, PatientBar, Disclaimer, Empty } from '../../components/ui'
import { add, useActivePatient } from '../../lib/store'
import { cx } from '../../lib/utils'
import { ANALITOS, bandera, extraer, type Resultado } from './parser'
import { reconocer, preprocesar, cargarImagen, PREPRO_INICIAL, type Prepro, type Progreso } from './ocr'
import { reporteEjemplo } from './ejemplo'
import Tendencias from './Tendencias'

type Fuente = HTMLImageElement | HTMLCanvasElement

const ESTADOS: Record<string, string> = {
  'loading tesseract core': 'Cargando motor OCR',
  'initializing tesseract': 'Inicializando',
  'loading language traineddata': 'Cargando idioma español',
  'initializing api': 'Preparando',
  'recognizing text': 'Reconociendo texto',
}

export default function Modulo() {
  const { id: patientId } = useActivePatient()
  const [fuente, setFuente] = useState<Fuente | null>(null)
  const [nombre, setNombre] = useState('')
  const [pp, setPp] = useState<Prepro>(PREPRO_INICIAL)
  const [prog, setProg] = useState<Progreso | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [texto, setTexto] = useState('')
  const [conf, setConf] = useState<number | null>(null)
  const [filas, setFilas] = useState<Resultado[]>([])
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const procesado = useRef<HTMLCanvasElement | null>(null)
  const autoRun = useRef(false)

  // Vista previa del preprocesamiento
  useEffect(() => {
    if (!fuente || !previewRef.current) return
    const c = preprocesar(fuente, pp)
    procesado.current = c
    c.className = 'mx-auto block h-auto max-h-[420px] w-auto max-w-full rounded border border-line'
    previewRef.current.replaceChildren(c)
    if (autoRun.current) {
      autoRun.current = false
      void correr()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente, pp])

  async function abrir(f: File | undefined) {
    if (!f) return
    setMsg(null)
    if (f.type === 'application/pdf') {
      setMsg({ tone: 'warn', text: 'Los PDF se procesan mejor en el servidor con Docling/PaddleOCR (ver Servicios). Aquí toma una foto o captura de pantalla de la página.' })
      return
    }
    try {
      setFuente(await cargarImagen(f))
      setNombre(f.name)
      setTexto('')
      setFilas([])
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message })
    }
  }

  function ejemplo() {
    setPp(PREPRO_INICIAL)
    setNombre('laboratorio-ejemplo.png')
    setTexto('')
    setFilas([])
    autoRun.current = true
    setFuente(reporteEjemplo())
  }

  async function correr() {
    if (!procesado.current) return
    setOcupado(true)
    setMsg(null)
    setProg({ status: 'loading tesseract core', progress: 0 })
    try {
      const r = await reconocer(procesado.current, setProg)
      setTexto(r.texto)
      setConf(r.confianza)
      const ex = extraer(r.texto)
      setFilas(ex)
      if (!ex.length) setMsg({ tone: 'warn', text: 'No se reconocieron analitos. Ajusta rotación/contraste o edita el texto y vuelve a analizar.' })
    } catch (e) {
      setMsg({ tone: 'danger', text: 'Error de OCR: ' + String((e as Error)?.message ?? e) })
    } finally {
      setOcupado(false)
      setProg(null)
    }
  }

  const setFila = (key: string, patch: Partial<Resultado>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, verificar: 'valor' in patch || 'refBaja' in patch || 'refAlta' in patch ? undefined : f.verificar, ...patch } : f)))

  function guardar() {
    if (!patientId) return
    const sel = filas.filter((f) => f.incluir && Number.isFinite(f.valor))
    if (!sel.length) return
    const iso = new Date(fecha + 'T08:00:00').toISOString()
    for (const f of sel) {
      const b = bandera(f)
      add('observations', {
        patientId,
        fecha: iso,
        codigo: f.analito.codigo,
        valor: f.valor,
        unidad: f.unidad,
        etiqueta: f.analito.label,
        fuente: 'ocr',
        interpretacion: `${b === 'normal' ? 'En rango' : b === 'alto' ? 'Alto' : 'Bajo'} (ref ${f.refBaja ?? '—'}–${f.refAlta ?? '—'})`,
      })
    }
    if (procesado.current && fuente) {
      // guarda la imagen original reducida (JPEG) como documento del expediente
      const c = preprocesar(fuente, { gris: false, contraste: 0, umbral: false, nivel: 0, rotacion: pp.rotacion })
      const k = Math.min(1, 1800 / Math.max(c.width, c.height))
      const out = document.createElement('canvas')
      out.width = Math.round(c.width * k)
      out.height = Math.round(c.height * k)
      out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height)
      add('documents', {
        patientId,
        fecha: iso,
        tipo: 'laboratorio',
        nombre: nombre || 'laboratorio.jpg',
        mime: 'image/jpeg',
        dataUrl: out.toDataURL('image/jpeg', 0.85),
        meta: { ocr: true, texto, analitos: sel.map((f) => f.analito.codigo) },
      })
    }
    setMsg({ tone: 'info', text: `Se guardaron ${sel.length} resultado(s) y la imagen en el expediente.` })
    setFilas([])
  }

  const pct = prog ? Math.round(prog.progress * 100) : 0

  return (
    <Page title="Laboratorios a gráfica" subtitle="Foto del reporte → OCR en el navegador (sin internet) → datos del expediente → tendencias">
      <PatientBar />
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. Imagen del reporte">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong dark:text-black">
              <Camera className="size-4" /> Tomar foto
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
            </label>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
              <FileImage className="size-4" /> Subir imagen
              <input type="file" accept="image/*,application/pdf" className="hidden" data-testid="ocr-file" onChange={(e) => abrir(e.target.files?.[0])} />
            </label>
            <Button onClick={ejemplo} disabled={ocupado}>
              <FlaskConical className="size-4" /> Probar con ejemplo
            </Button>
          </div>

          {fuente ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pp.gris} onChange={(e) => setPp({ ...pp, gris: e.target.checked })} /> Grises
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pp.umbral} onChange={(e) => setPp({ ...pp, umbral: e.target.checked })} /> Umbral (B/N)
                </label>
                <div className="col-span-2 flex items-center gap-1 sm:justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setPp({ ...pp, rotacion: pp.rotacion - 90 })} aria-label="Rotar a la izquierda"><RotateCcw className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setPp({ ...pp, rotacion: pp.rotacion + 90 })} aria-label="Rotar a la derecha"><RotateCw className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setPp(PREPRO_INICIAL)}>Restablecer</Button>
                </div>
                <Field label={`Contraste: ${pp.contraste}`} className="col-span-2">
                  <input type="range" min={-50} max={90} value={pp.contraste} onChange={(e) => setPp({ ...pp, contraste: +e.target.value })} className="w-full accent-[var(--color-brand)]" />
                </Field>
                {pp.umbral && (
                  <Field label={`Nivel de umbral: ${pp.nivel}`} className="col-span-2">
                    <input type="range" min={60} max={230} value={pp.nivel} onChange={(e) => setPp({ ...pp, nivel: +e.target.value })} className="w-full accent-[var(--color-brand)]" />
                  </Field>
                )}
              </div>
              <div ref={previewRef} className="mt-3 overflow-hidden rounded-lg bg-surface-2 p-2" />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={correr} disabled={ocupado}>
                  <ScanText className="size-4" /> {ocupado ? 'Leyendo…' : 'Leer texto (OCR)'}
                </Button>
                {prog && (
                  <div className="min-w-48 flex-1" aria-live="polite">
                    <div className="mb-1 text-xs text-muted">{ESTADOS[prog.status] ?? prog.status} · {pct}%</div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4"><Empty>Toma una foto del reporte (bien iluminada, de frente) o usa el ejemplo.</Empty></div>
          )}
        </Card>

        <Card
          title="2. Texto reconocido"
          actions={conf != null && texto ? <Badge tone={conf > 75 ? 'ok' : conf > 50 ? 'warn' : 'danger'}>Confianza {Math.round(conf)}%</Badge> : undefined}
        >
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-72 font-mono text-xs" placeholder="Aquí aparecerá el texto. Puedes corregirlo antes de analizar." data-testid="ocr-texto" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => setFilas(extraer(texto))} disabled={!texto.trim()}>
              <RefreshCw className="size-4" /> Volver a analizar texto
            </Button>
          </div>
        </Card>
      </div>

      {filas.length > 0 && (
        <Card title="3. Revisión de resultados" className="mt-4" actions={<Badge tone="brand">{filas.filter((f) => f.incluir).length} seleccionados</Badge>}>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Fecha del estudio">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <p className="flex-1 text-xs text-muted">Revisa cada valor contra el reporte original. Solo se guardan las filas marcadas.</p>
          </div>
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="ocr-tabla">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 w-8"></th>
                  <th className="py-2">Analito</th>
                  <th className="py-2">Valor</th>
                  <th className="py-2">Unidad</th>
                  <th className="py-2">Referencia</th>
                  <th className="py-2 pr-4">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const b = bandera(f)
                  return (
                    <tr key={f.key} className={cx('border-b border-line align-middle', !f.incluir && 'opacity-50')} title={f.linea}>
                      <td className="px-4 py-1.5">
                        <input type="checkbox" checked={f.incluir} onChange={(e) => setFila(f.key, { incluir: e.target.checked })} aria-label={`Incluir ${f.analito.label}`} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          className="w-full rounded border border-line bg-surface px-2 py-1"
                          value={f.analito.id}
                          onChange={(e) => {
                            const a = ANALITOS.find((x) => x.id === e.target.value)!
                            setFila(f.key, { analito: a, unidad: a.unidad, ...(f.refTexto ? {} : { refBaja: a.ref[0], refAlta: a.ref[1] }) })
                          }}
                        >
                          {ANALITOS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="number" step="any" className="w-24 rounded border border-line bg-surface px-2 py-1 tabular-nums" value={Number.isFinite(f.valor) ? f.valor : ''} onChange={(e) => setFila(f.key, { valor: parseFloat(e.target.value) })} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input className="w-24 rounded border border-line bg-surface px-2 py-1" value={f.unidad} onChange={(e) => setFila(f.key, { unidad: e.target.value })} />
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <input type="number" step="any" className="w-16 rounded border border-line bg-surface px-1 py-1" value={f.refBaja ?? ''} onChange={(e) => setFila(f.key, { refBaja: e.target.value === '' ? null : +e.target.value })} aria-label="Referencia baja" />
                        <span className="mx-1 text-muted">–</span>
                        <input type="number" step="any" className="w-16 rounded border border-line bg-surface px-1 py-1" value={f.refAlta ?? ''} onChange={(e) => setFila(f.key, { refAlta: e.target.value === '' ? null : +e.target.value })} aria-label="Referencia alta" />
                        {!f.refTexto && <span className="ml-1 text-[10px] text-muted" title="Rango por defecto, no venía en el reporte">*</span>}
                      </td>
                      <td className="py-1.5 pr-4">
                        <span className="flex flex-wrap gap-1">
                          <Badge tone={b === 'normal' ? 'ok' : 'danger'}>{b === 'normal' ? 'En rango' : b === 'alto' ? '↑ Alto' : '↓ Bajo'}</Badge>
                          {f.verificar && <span title={f.verificar}><Badge tone="warn">Verificar</Badge></span>}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">* Rango de referencia por defecto (adulto); el reporte no traía uno legible.</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button onClick={() => setFilas([])}>Descartar</Button>
            <Button variant="primary" onClick={guardar} disabled={!patientId || !filas.some((f) => f.incluir)}>
              <Save className="size-4" /> Guardar en expediente
            </Button>
          </div>
          <Disclaimer>El OCR puede confundir dígitos y unidades. Verifica cada valor contra el documento original antes de guardar; los rangos y banderas son orientativos.</Disclaimer>
        </Card>
      )}

      {patientId && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold">Tendencias de laboratorio del paciente</h2>
          <Tendencias patientId={patientId} />
        </div>
      )}
    </Page>
  )
}
