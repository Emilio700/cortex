import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, FileText, Lock, Mic, MicOff, PenLine, Printer, Save, ShieldCheck, UserRound } from 'lucide-react'
import type { Diagnostico, Encounter, Patient } from '../../lib/types'
import { add, addAdenda, getDB, remove, update, useActivePatient, useCollection, useSettings } from '../../lib/store'
import { useCan } from '../../lib/session'
import { OBS_LABELS, cx, edad, fmtFecha, fmtFechaHora, fmtHora, nombreCompleto } from '../../lib/utils'
import { Avatar, Badge, Button, Card, Disclaimer, Empty, Field, Input, Modal, Notice, Page, Select, Textarea, Unsupported } from '../../components/ui'
import { PLANTILLAS, plantillaPorId } from './plantillas'
import { CieBuscador } from './CieBuscador'
import { useDictado } from './dictado'

// Campos extra que guardamos dentro del Encounter (el store persiste el objeto completo)
type Signos = Partial<Record<'pas' | 'pad' | 'fc' | 'fr' | 'temp' | 'spo2' | 'peso' | 'talla', string>>
type EncX = Encounter & { signos?: Signos; obsIds?: Record<string, string> }
type Seccion = 'subjetivo' | 'objetivo' | 'analisis' | 'plan'
type Draft = Pick<Encounter, 'patientId' | 'fecha' | 'plantilla' | 'motivo' | 'subjetivo' | 'objetivo' | 'analisis' | 'plan' | 'diagnosticos'> & { signos: Signos }

const SECCIONES: { key: Seccion; letra: string; titulo: string; ayuda: string }[] = [
  { key: 'subjetivo', letra: 'S', titulo: 'Subjetivo', ayuda: 'Interrogatorio: lo que refiere el paciente' },
  { key: 'objetivo', letra: 'O', titulo: 'Objetivo', ayuda: 'Exploración física y resultados' },
  { key: 'analisis', letra: 'A', titulo: 'Análisis', ayuda: 'Integración diagnóstica y pronóstico' },
  { key: 'plan', letra: 'P', titulo: 'Plan', ayuda: 'Tratamiento, estudios e indicaciones' },
]

const CAMPOS_SIGNOS: { k: keyof Signos; label: string; unidad: string; ph: string; min: number; max: number }[] = [
  { k: 'fc', label: 'FC', unidad: 'lpm', ph: '72', min: 20, max: 250 },
  { k: 'fr', label: 'FR', unidad: 'rpm', ph: '16', min: 5, max: 80 },
  { k: 'temp', label: 'Temp', unidad: '°C', ph: '36.5', min: 30, max: 45 },
  { k: 'spo2', label: 'SpO₂', unidad: '%', ph: '98', min: 50, max: 100 },
  { k: 'peso', label: 'Peso', unidad: 'kg', ph: '70', min: 0.3, max: 400 },
  { k: 'talla', label: 'Talla', unidad: 'cm', ph: '165', min: 30, max: 250 },
]

const num = (s?: string) => {
  const v = parseFloat((s ?? '').replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

function calcIMC(s: Signos) {
  const p = num(s.peso)
  const t = num(s.talla)
  if (!p || !t || t < 30) return null
  return Math.round((p / (t / 100) ** 2) * 10) / 10
}

function claseIMC(imc: number) {
  if (imc < 18.5) return { t: 'Bajo peso', tone: 'warn' as const }
  if (imc < 25) return { t: 'Normal', tone: 'ok' as const }
  if (imc < 30) return { t: 'Sobrepeso', tone: 'warn' as const }
  return { t: `Obesidad ${imc < 35 ? 'I' : imc < 40 ? 'II' : 'III'}`, tone: 'danger' as const }
}

// Alertas simples de signos fuera de rango (adulto)
function alerta(k: keyof Signos, s: Signos): 'warn' | 'danger' | null {
  const v = num(s[k])
  if (v === null) return null
  switch (k) {
    case 'pas': return v >= 180 || v < 90 ? 'danger' : v >= 140 ? 'warn' : null
    case 'pad': return v >= 120 || v < 50 ? 'danger' : v >= 90 ? 'warn' : null
    case 'fc': return v > 130 || v < 45 ? 'danger' : v > 100 || v < 55 ? 'warn' : null
    case 'fr': return v > 30 || v < 8 ? 'danger' : v > 22 ? 'warn' : null
    case 'temp': return v >= 39.5 || v < 35 ? 'danger' : v >= 37.8 ? 'warn' : null
    case 'spo2': return v < 90 ? 'danger' : v < 94 ? 'warn' : null
    default: return null
  }
}

function nuevoDraft(patientId: string, plantilla = 'SOAP'): Draft {
  const t = plantillaPorId(plantilla)
  return { patientId, fecha: new Date().toISOString(), plantilla: t.id, motivo: '', subjetivo: t.s, objetivo: t.o, analisis: t.a, plan: t.p, diagnosticos: [], signos: {} }
}

function draftDe(e: EncX): Draft {
  return {
    patientId: e.patientId, fecha: e.fecha, plantilla: e.plantilla, motivo: e.motivo ?? '', subjetivo: e.subjetivo, objetivo: e.objetivo,
    analisis: e.analisis, plan: e.plan, diagnosticos: e.diagnosticos, signos: e.signos ?? {},
  }
}

export default function Editor({ id, onCreado }: { id: string | null; onCreado: (id: string) => void }) {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { id: activeId, setActive } = useActivePatient()
  const patients = useCollection('patients')
  const [encId, setEncId] = useState<string | null>(id)
  const enc = useCollection('encounters', (e) => e.id === encId, [encId])[0] as EncX | undefined
  const [draft, setDraft] = useState<Draft>(() => {
    const e = id ? (getDB().encounters.find((x) => x.id === id) as EncX | undefined) : undefined
    if (e) return draftDe(e)
    const d = nuevoDraft(sp.get('p') ?? activeId ?? '')
    // motivo enviado desde Triaje u otras herramientas (?motivo=)
    return { ...d, motivo: sp.get('motivo')?.slice(0, 300) ?? '' }
  })
  const [dirty, setDirty] = useState(false)
  // Texto enviado desde el módulo Dictado (sessionStorage); se borra al insertarlo o descartarlo
  const [dictadoRecibido, setDictadoRecibido] = useState<string | null>(() => {
    if (id) return null
    try {
      return sessionStorage.getItem('medisuite.dictado') || null
    } catch {
      return null
    }
  })
  const cerrarDictado = () => {
    try {
      sessionStorage.removeItem('medisuite.dictado')
    } catch {
      /* ignorar */
    }
    setDictadoRecibido(null)
  }
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null)
  const [firmarOpen, setFirmarOpen] = useState(false)
  const [plantillaPend, setPlantillaPend] = useState<string | null>(null)
  const refs = useRef<Partial<Record<Seccion, HTMLTextAreaElement | null>>>({})

  const paciente = patients.find((p) => p.id === draft.patientId) ?? null
  const firmada = !!enc?.firmada
  // En modo servidor solo el rol médico escribe notas; los demás las ven en solo lectura
  const puedeEscribir = useCan('notas.escribir')
  const puedeRecetar = useCan('recetas.escribir')
  const bloqueada = firmada || !puedeEscribir

  useEffect(() => {
    if (draft.patientId && draft.patientId !== activeId) setActive(draft.patientId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.patientId])

  const set = (patch: Partial<Draft>) => {
    if (bloqueada) return
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  // Guarda la nota y sincroniza los signos como Observations (una por código, se actualizan al re-guardar)
  const encIdRef = useRef(encId)
  encIdRef.current = encId
  const guardar = useCallback(
    (d: Draft) => {
      if (!d.patientId) return null
      const actual = encIdRef.current ? (getDB().encounters.find((x) => x.id === encIdRef.current) as EncX | undefined) : undefined
      if (actual?.firmada) return actual.id
      const obsIds = { ...(actual?.obsIds ?? {}) }
      const valores: Record<string, number | null> = {}
      for (const c of ['pas', 'pad', 'fc', 'fr', 'temp', 'spo2', 'peso', 'talla'] as const) valores[c] = num(d.signos[c])
      valores.imc = calcIMC(d.signos)
      const existentes = new Set(getDB().observations.map((o) => o.id))
      for (const [codigo, v] of Object.entries(valores)) {
        const oid = obsIds[codigo]
        if (v === null) {
          if (oid && existentes.has(oid)) remove('observations', oid)
          delete obsIds[codigo]
        } else if (oid && existentes.has(oid)) {
          update('observations', oid, { valor: v, fecha: d.fecha, patientId: d.patientId })
        } else {
          obsIds[codigo] = add('observations', { patientId: d.patientId, fecha: d.fecha, codigo, valor: v, unidad: OBS_LABELS[codigo]?.unidad ?? '', fuente: 'manual', etiqueta: undefined }).id
        }
      }
      const data = { ...d, motivo: d.motivo?.trim() || undefined, obsIds }
      if (actual) {
        update('encounters', actual.id, data as Partial<Encounter>)
        setGuardadoEn(new Date().toISOString())
        return actual.id
      }
      const nuevo = add('encounters', { ...data, firmada: false, adendas: [] } as Omit<Encounter, 'id'>)
      encIdRef.current = nuevo.id
      setEncId(nuevo.id)
      setGuardadoEn(new Date().toISOString())
      onCreado(nuevo.id)
      return nuevo.id
    },
    [onCreado],
  )

  // Autoguardado del borrador
  const pendiente = useRef<Draft | null>(null)
  useEffect(() => {
    if (!dirty || bloqueada) return
    pendiente.current = draft
    const t = setTimeout(() => {
      guardar(draft)
      pendiente.current = null
      setDirty(false)
    }, 1200)
    return () => clearTimeout(t)
  }, [draft, dirty, bloqueada, guardar])
  useEffect(
    () => () => {
      if (pendiente.current) guardar(pendiente.current)
    },
    [guardar],
  )

  const dict = useDictado((key, texto) => {
    const k = key as Seccion
    setDraft((d) => {
      const prev = d[k]
      const el = refs.current[k]
      const pos = el && document.activeElement === el ? el.selectionStart : prev.length
      const antes = prev.slice(0, pos)
      const sep = antes && !/\s$/.test(antes) ? ' ' : ''
      const nuevo = antes + sep + texto + prev.slice(pos)
      if (el && document.activeElement === el) {
        const c = pos + sep.length + texto.length
        requestAnimationFrame(() => el.setSelectionRange(c, c))
      }
      return { ...d, [k]: nuevo }
    })
    setDirty(true)
  })

  const aplicarPlantilla = (pid: string) => {
    const t = plantillaPorId(pid)
    set({ plantilla: t.id, subjetivo: t.s, objetivo: t.o, analisis: t.a, plan: t.p })
    setPlantillaPend(null)
  }
  const tieneTexto = SECCIONES.some((s) => {
    const t = plantillaPorId(draft.plantilla)
    const base = { subjetivo: t.s, objetivo: t.o, analisis: t.a, plan: t.p }[s.key]
    return draft[s.key].trim() && draft[s.key] !== base
  })

  const imc = calcIMC(draft.signos)

  if (id && !enc && !getDB().encounters.some((e) => e.id === id))
    return (
      <Page title="Nota no encontrada">
        <Empty>
          La nota no existe. <Link to="/consulta" className="text-brand">Ver notas</Link>
        </Empty>
      </Page>
    )

  const fechaDt = (() => {
    const d = new Date(draft.fecha)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  })()

  return (
    <>
      <div className="no-print">
        <Page
          title={firmada ? 'Nota clínica firmada' : encId ? 'Nota clínica (borrador)' : 'Nueva consulta'}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <Link to="/consulta" className="inline-flex items-center gap-1 hover:text-brand">
                <ArrowLeft className="size-3.5" /> Notas
              </Link>
              {firmada ? (
                <Badge tone="ok">
                  <Lock className="mr-1 size-3" /> Firmada {enc?.firmadaEn && fmtFechaHora(enc.firmadaEn)}
                </Badge>
              ) : dirty ? (
                <span className="text-xs">Guardando…</span>
              ) : guardadoEn ? (
                <span className="inline-flex items-center gap-1 text-xs text-ok">
                  <Check className="size-3.5" /> Borrador guardado {fmtHora(guardadoEn)}
                </span>
              ) : encId ? (
                <span className="text-xs">Borrador</span>
              ) : (
                <span className="text-xs">Se guarda automáticamente al escribir</span>
              )}
            </span>
          }
          actions={
            <>
              <Button onClick={() => window.print()} disabled={!paciente}>
                <Printer className="size-4" /> Imprimir
              </Button>
              {puedeRecetar && (
                <Button onClick={() => paciente && nav('/receta?p=' + paciente.id)} disabled={!paciente}>
                  <FileText className="size-4" /> Crear receta
                </Button>
              )}
              {!bloqueada && (
                <>
                  <Button
                    onClick={() => {
                      guardar(draft)
                      setDirty(false)
                      pendiente.current = null
                    }}
                    disabled={!paciente}
                  >
                    <Save className="size-4" /> Guardar
                  </Button>
                  <Button variant="primary" onClick={() => setFirmarOpen(true)} disabled={!paciente || !tieneTexto}>
                    <PenLine className="size-4" /> Firmar nota
                  </Button>
                </>
              )}
            </>
          }
        >
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-4">
              {/* Encabezado de la nota */}
              <Card>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Paciente" className="sm:col-span-2">
                    <Select value={draft.patientId} onChange={(e) => set({ patientId: e.target.value })} disabled={bloqueada || !!encId}>
                      <option value="">Selecciona un paciente…</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {nombreCompleto(p)} · {edad(p.fechaNac).texto}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Plantilla">
                    <Select
                      value={draft.plantilla}
                      disabled={bloqueada}
                      onChange={(e) => (tieneTexto ? setPlantillaPend(e.target.value) : aplicarPlantilla(e.target.value))}
                    >
                      {PLANTILLAS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Fecha y hora">
                    <Input
                      type="datetime-local"
                      value={fechaDt}
                      disabled={bloqueada}
                      onChange={(e) => e.target.value && set({ fecha: new Date(e.target.value).toISOString() })}
                    />
                  </Field>
                  <Field label="Motivo de consulta" className="sm:col-span-2 lg:col-span-4">
                    <Input value={draft.motivo} disabled={bloqueada} onChange={(e) => set({ motivo: e.target.value })} placeholder="Ej. Control de diabetes, tos de 3 días…" />
                  </Field>
                </div>
                {!paciente && <p className="mt-3 text-sm text-warn">Selecciona un paciente para comenzar.</p>}
                {paciente && paciente.alergias.length > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-danger lg:hidden">
                    <AlertTriangle className="size-4" /> Alergias: {paciente.alergias.join(', ')}
                  </p>
                )}
              </Card>

              {/* Signos vitales */}
              <Card title="Signos vitales y somatometría" actions={<span className="text-xs text-muted">Se guardan en el expediente</span>}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                  <div className="col-span-2">
                    <span className="mb-1 block text-xs font-medium text-muted">PA (mmHg)</span>
                    <div className="flex items-center gap-1">
                      <SignoInput k="pas" ph="120" draft={draft} set={set} disabled={bloqueada} />
                      <span className="text-muted">/</span>
                      <SignoInput k="pad" ph="80" draft={draft} set={set} disabled={bloqueada} />
                    </div>
                  </div>
                  {CAMPOS_SIGNOS.map((c) => (
                    <div key={c.k}>
                      <span className="mb-1 block truncate text-xs font-medium text-muted">
                        {c.label} ({c.unidad})
                      </span>
                      <SignoInput k={c.k} ph={c.ph} draft={draft} set={set} disabled={bloqueada} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">IMC:</span>
                  {imc ? (
                    <>
                      <b className="tabular-nums">{imc} kg/m²</b>
                      <Badge tone={claseIMC(imc).tone}>{claseIMC(imc).t}</Badge>
                    </>
                  ) : (
                    <span className="text-muted">captura peso y talla</span>
                  )}
                  {paciente && edad(paciente.fechaNac).anios < 18 && <span className="text-xs text-muted">· En menores usa percentiles (módulo Crecimiento).</span>}
                </div>
              </Card>

              {dictadoRecibido && !bloqueada && (
                <Notice tone="info" onClose={cerrarDictado}>
                  <div className="font-medium">Texto dictado recibido</div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted">{dictadoRecibido}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs">Insertar en:</span>
                    {SECCIONES.map((x) => (
                      <Button
                        key={x.key}
                        size="sm"
                        onClick={() => {
                          const t = dictadoRecibido
                          setDraft((d) => ({ ...d, [x.key]: d[x.key] + (d[x.key] && !/\s$/.test(d[x.key]) ? '\n' : '') + t }))
                          setDirty(true)
                          cerrarDictado()
                        }}
                      >
                        {x.letra} · {x.titulo}
                      </Button>
                    ))}
                  </div>
                </Notice>
              )}
              {!dict.soportado && !bloqueada && <Unsupported api="Dictado por voz (Web Speech API)">Usa Chrome o Edge para dictar las secciones de la nota.</Unsupported>}
              {dict.error && <Notice tone="warn">{dict.error}</Notice>}

              {/* Secciones SOAP */}
              {SECCIONES.map((s) => (
                <Card
                  key={s.key}
                  title={
                    <span className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-md bg-brand-soft text-xs font-bold text-brand-strong">{s.letra}</span>
                      {s.titulo}
                      <span className="hidden text-xs font-normal text-muted sm:inline">· {s.ayuda}</span>
                    </span>
                  }
                  actions={
                    !bloqueada && dict.soportado ? (
                      <Button
                        size="sm"
                        variant={dict.activo === s.key ? 'danger' : 'ghost'}
                        onClick={() => dict.iniciar(s.key)}
                        aria-label={dict.activo === s.key ? 'Detener dictado' : `Dictar ${s.titulo}`}
                      >
                        {dict.activo === s.key ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                        {dict.activo === s.key ? 'Detener' : 'Dictar'}
                      </Button>
                    ) : null
                  }
                >
                  {bloqueada ? (
                    <p className="text-sm whitespace-pre-wrap">{draft[s.key] || <span className="text-muted">—</span>}</p>
                  ) : (
                    <>
                      <textarea
                        ref={(el) => {
                          refs.current[s.key] = el
                        }}
                        value={draft[s.key]}
                        onChange={(e) => set({ [s.key]: e.target.value } as Partial<Draft>)}
                        className="min-h-32 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        rows={Math.min(14, Math.max(4, draft[s.key].split('\n').length + 1))}
                      />
                      {dict.activo === s.key && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                          <span className="size-2 animate-pulse rounded-full bg-danger" /> Escuchando… <i>{dict.interino}</i>
                        </div>
                      )}
                    </>
                  )}
                  {s.key === 'analisis' && (
                    <div className="mt-4 border-t border-line pt-3">
                      <div className="mb-2 text-xs font-semibold text-muted uppercase">Diagnósticos (CIE-10)</div>
                      <CieBuscador value={draft.diagnosticos} onChange={(diagnosticos: Diagnostico[]) => set({ diagnosticos })} disabled={bloqueada} />
                    </div>
                  )}
                </Card>
              ))}

              {!puedeEscribir && !firmada && <Notice tone="info">Solo lectura: tu rol puede consultar las notas, pero solo los médicos las redactan y firman.</Notice>}
              {firmada && enc && <Adendas enc={enc} puedeAgregar={puedeEscribir} />}
              <Disclaimer>La nota debe cumplir la NOM-004-SSA3-2012 del expediente clínico. Una vez firmada no se puede modificar; las correcciones se agregan como adendas.</Disclaimer>
            </div>

            <PanelPaciente p={paciente} encId={encId} propias={enc?.obsIds} />
          </div>
        </Page>
      </div>

      {paciente && <Impresion d={draft} p={paciente} enc={enc} imc={imc} />}

      <Modal open={!!plantillaPend} onClose={() => setPlantillaPend(null)} title="Cambiar plantilla">
        <p className="text-sm">Al cambiar a «{plantillaPend && plantillaPorId(plantillaPend).nombre}» se reemplazará el texto de las secciones S, O, A y P. Los signos y diagnósticos se conservan.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPlantillaPend(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => plantillaPend && aplicarPlantilla(plantillaPend)}>
            Reemplazar
          </Button>
        </div>
      </Modal>

      <Modal open={firmarOpen} onClose={() => setFirmarOpen(false)} title="Firmar nota clínica">
        <div className="space-y-3 text-sm">
          <p>
            Al firmar, la nota queda <b>bloqueada</b> y no podrá editarse (NOM-004-SSA3-2012). Las aclaraciones posteriores se registran como <b>adendas</b> con fecha y hora.
          </p>
          {draft.diagnosticos.length === 0 && <Notice tone="warn">La nota no tiene diagnóstico CIE-10.</Notice>}
          {Object.values(draft.signos).every((v) => !v) && <Notice tone="warn">No se registraron signos vitales.</Notice>}
          {!draft.motivo?.trim() && <Notice tone="warn">Falta el motivo de consulta.</Notice>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setFirmarOpen(false)}>Seguir editando</Button>
          <Button
            variant="primary"
            onClick={() => {
              const nid = guardar(draft)
              pendiente.current = null
              setDirty(false)
              // Servidor: PATCH { firmada: true } → fija firmadaEn/firmadoPor (409 nota_firmada si ya estaba firmada)
              if (nid) update('encounters', nid, { firmada: true, firmadaEn: new Date().toISOString() })
              setFirmarOpen(false)
            }}
          >
            <ShieldCheck className="size-4" /> Firmar
          </Button>
        </div>
      </Modal>
    </>
  )
}

function SignoInput({ k, ph, draft, set, disabled }: { k: keyof Signos; ph: string; draft: Draft; set: (p: Partial<Draft>) => void; disabled?: boolean }) {
  const a = alerta(k, draft.signos)
  return (
    <Input
      inputMode="decimal"
      value={draft.signos[k] ?? ''}
      placeholder={ph}
      disabled={disabled}
      aria-label={k}
      onChange={(e) => set({ signos: { ...draft.signos, [k]: e.target.value.replace(/[^\d.,]/g, '') } })}
      className={cx('px-2 tabular-nums disabled:bg-surface-2', a === 'warn' && 'border-warn text-warn', a === 'danger' && 'border-danger font-semibold text-danger')}
    />
  )
}

function Adendas({ enc, puedeAgregar }: { enc: EncX; puedeAgregar: boolean }) {
  const [txt, setTxt] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Card title={`Adendas (${enc.adendas.length})`}>
      {enc.adendas.length > 0 && (
        <ul className="mb-3 space-y-2">
          {enc.adendas.map((a, i) => (
            <li key={i} className="rounded-lg border border-line bg-surface-2/60 p-3 text-sm">
              <div className="mb-1 text-xs font-medium text-muted">
                {fmtFechaHora(a.fecha)}
                {a.autor && ` · ${a.autor}`}
              </div>
              <p className="whitespace-pre-wrap">{a.texto}</p>
            </li>
          ))}
        </ul>
      )}
      {puedeAgregar && (
        <>
          <Textarea value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Aclaración, resultado recibido o corrección (no modifica la nota original)…" />
          <div className="mt-2 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              disabled={!txt.trim() || busy}
              onClick={async () => {
                // Servidor: POST /encounters/:id/adendas (el servidor fija fecha y autor)
                setBusy(true)
                try {
                  await addAdenda(enc.id, txt.trim())
                  setTxt('')
                } catch {
                  /* el almacén ya avisó del error y conservamos el texto */
                } finally {
                  setBusy(false)
                }
              }}
            >
              Agregar adenda
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

function PanelPaciente({ p, encId, propias }: { p: Patient | null; encId: string | null; propias?: Record<string, string> }) {
  const pid = p?.id ?? ''
  // excluye las mediciones capturadas en esta misma nota
  const excl = useMemo(() => new Set(Object.values(propias ?? {})), [propias])
  const obs = useCollection('observations', (o) => o.patientId === pid && !excl.has(o.id), [pid, excl])
  const encs = useCollection('encounters', (e) => e.patientId === pid && e.id !== encId, [pid, encId])
  const ultimos = useMemo(() => {
    const m = new Map<string, (typeof obs)[number]>()
    for (const o of obs) if (!m.has(o.codigo) || o.fecha > m.get(o.codigo)!.fecha) m.set(o.codigo, o)
    return m
  }, [obs])
  if (!p) return null
  const previas = [...encs].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3)
  const vit = ['pas', 'fc', 'temp', 'spo2', 'peso', 'imc', 'glucosa', 'hba1c'].filter((c) => ultimos.has(c))

  return (
    <aside className="space-y-4 lg:sticky lg:top-18">
      <Card>
        <div className="flex items-center gap-3">
          <Avatar p={p} size={44} />
          <div className="min-w-0">
            <Link to={'/pacientes/' + p.id} className="block truncate font-semibold hover:text-brand">
              {nombreCompleto(p)}
            </Link>
            <div className="text-xs text-muted">
              {edad(p.fechaNac).texto} · {p.sexo === 'F' ? 'Femenino' : p.sexo === 'M' ? 'Masculino' : 'Otro'}
              {p.tipoSangre && ` · ${p.tipoSangre}`}
            </div>
          </div>
        </div>
        <div className={cx('mt-3 rounded-lg px-3 py-2 text-sm', p.alergias.length ? 'border border-danger/40 bg-danger/10 font-semibold text-danger' : 'bg-surface-2 text-muted')}>
          {p.alergias.length ? (
            <span className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Alergias: {p.alergias.join(', ')}
            </span>
          ) : (
            'Sin alergias conocidas'
          )}
        </div>
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-muted uppercase">Medicamentos actuales</div>
          {p.medicamentosActuales?.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-sm">
              {p.medicamentosActuales.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Ninguno</p>
          )}
        </div>
        {p.antecedentes && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold text-muted uppercase">Antecedentes</div>
            <p className="line-clamp-4 text-sm">{p.antecedentes}</p>
          </div>
        )}
      </Card>
      <Card title="Últimos signos">
        {vit.length === 0 ? (
          <p className="text-sm text-muted">Sin registros previos.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {vit.map((c) => {
              const o = ultimos.get(c)!
              const pad = c === 'pas' ? ultimos.get('pad') : undefined
              return (
                <div key={c}>
                  <dt className="text-xs text-muted">{c === 'pas' ? 'PA' : OBS_LABELS[c]?.label}</dt>
                  <dd className="font-medium tabular-nums">
                    {o.valor}
                    {pad && `/${pad.valor}`} <span className="text-xs font-normal text-muted">{o.unidad}</span>
                  </dd>
                  <dd className="text-[10px] text-muted">{fmtFecha(o.fecha, { day: '2-digit', month: 'short', year: '2-digit' })}</dd>
                </div>
              )
            })}
          </dl>
        )}
      </Card>
      {previas.length > 0 && (
        <Card title="Notas previas" pad={false}>
          <ul className="divide-y divide-line">
            {previas.map((e) => (
              <li key={e.id}>
                <Link to={'/consulta/' + e.id} className="block px-4 py-2.5 hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{fmtFecha(e.fecha)}</span>
                    <span>{e.plantilla}</span>
                  </div>
                  <div className="truncate text-sm font-medium">{e.motivo || 'Sin motivo'}</div>
                  {e.diagnosticos[0] && <div className="truncate text-xs text-muted">{e.diagnosticos.map((d) => d.codigo).join(', ')}</div>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Link to={'/pacientes/' + p.id} className="inline-flex items-center gap-1 text-sm text-brand">
        <UserRound className="size-4" /> Abrir expediente completo
      </Link>
    </aside>
  )
}

// Vista de impresión: solo visible con window.print()
function Impresion({ d, p, enc, imc }: { d: Draft; p: Patient; enc?: EncX; imc: number | null }) {
  const s = useSettings()
  const sig = d.signos
  const vitales = [
    sig.pas && sig.pad && `PA ${sig.pas}/${sig.pad} mmHg`,
    sig.fc && `FC ${sig.fc} lpm`,
    sig.fr && `FR ${sig.fr} rpm`,
    sig.temp && `Temp ${sig.temp} °C`,
    sig.spo2 && `SpO₂ ${sig.spo2}%`,
    sig.peso && `Peso ${sig.peso} kg`,
    sig.talla && `Talla ${sig.talla} cm`,
    imc && `IMC ${imc} kg/m²`,
  ].filter(Boolean)
  return (
    <div className="hidden bg-white p-2 text-[12px] leading-snug text-black print:block">
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <div className="text-[16px] font-bold">{s.doctor.nombre}</div>
          <div>{s.doctor.especialidad} · Céd. prof. {s.doctor.cedula}{s.doctor.cedulaEspecialidad && ` · Céd. esp. ${s.doctor.cedulaEspecialidad}`}</div>
          <div>{s.doctor.universidad}</div>
        </div>
        <div className="text-right">
          <div className="font-bold">{s.clinica}</div>
          <div className="max-w-64">{s.doctor.direccion}</div>
          <div>Tel. {s.doctor.telefono}</div>
        </div>
      </div>
      <h1 className="mt-3 text-center text-[14px] font-bold uppercase">{d.plantilla === 'Historia clínica' ? 'Historia clínica' : 'Nota médica'} · {plantillaPorId(d.plantilla).nombre}</h1>
      <table className="mt-2 w-full">
        <tbody>
          <tr>
            <td><b>Paciente:</b> {nombreCompleto(p)}</td>
            <td><b>Edad:</b> {edad(p.fechaNac, new Date(d.fecha)).texto}</td>
            <td><b>Sexo:</b> {p.sexo === 'F' ? 'Femenino' : p.sexo === 'M' ? 'Masculino' : 'Otro'}</td>
          </tr>
          <tr>
            <td><b>CURP:</b> {p.curp ?? '—'}</td>
            <td><b>Fecha:</b> {fmtFechaHora(d.fecha)}</td>
            <td><b>Alergias:</b> {p.alergias.join(', ') || 'Negadas'}</td>
          </tr>
        </tbody>
      </table>
      {d.motivo && <p className="mt-2"><b>Motivo de consulta:</b> {d.motivo}</p>}
      {vitales.length > 0 && <p className="mt-1"><b>Signos vitales:</b> {vitales.join(' · ')}</p>}
      {SECCIONES.map((x) => (
        <div key={x.key} className="mt-3 break-inside-avoid">
          <div className="border-b border-black/40 font-bold uppercase">{x.titulo}</div>
          <p className="mt-1 whitespace-pre-wrap">{d[x.key].trim() || '—'}</p>
          {x.key === 'analisis' && d.diagnosticos.length > 0 && (
            <ol className="mt-1 list-decimal pl-5">
              {d.diagnosticos.map((dx) => (
                <li key={dx.codigo}>
                  {dx.nombre} <b>({dx.codigo})</b>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
      {enc && enc.adendas.length > 0 && (
        <div className="mt-3">
          <div className="border-b border-black/40 font-bold uppercase">Adendas</div>
          {enc.adendas.map((a, i) => (
            <p key={i} className="mt-1"><b>{fmtFechaHora(a.fecha)}:</b> {a.texto}</p>
          ))}
        </div>
      )}
      <div className="mt-12 flex justify-end">
        <div className="w-64 border-t border-black pt-1 text-center">
          {s.doctor.nombre}
          <br />
          Céd. prof. {s.doctor.cedula}
          {enc?.firmada && enc.firmadaEn && (
            <>
              <br />
              <span className="text-[10px]">Firmada electrónicamente el {fmtFechaHora(enc.firmadaEn)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
