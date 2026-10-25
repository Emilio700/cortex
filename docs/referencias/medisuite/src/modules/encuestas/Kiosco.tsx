// Modo kiosco / tableta: pantalla completa, botones grandes, una pregunta por pantalla y reinicio automático.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Angry, ArrowLeft, Frown, Laugh, LogOut, Meh, Smile, UserRound, type LucideIcon } from 'lucide-react'
import { Button, Field, Modal, Select } from '../../components/ui'
import { add, useCollection, useSettings } from '../../lib/store'
import { useSession } from '../../lib/session'
import { cx, fmtHora, nombreCompleto } from '../../lib/utils'
import { toast } from '../../components/toast'
import { usePreferencia } from '../../lib/preferencias'
import { ESCALA5, PLANTILLA_BASE, faltante, normalizarPlantilla, tituloEncuesta, type Plantilla, type Respuestas } from './nps'
import { CLAVE_PLANTILLA } from './comun'

const INACTIVIDAD_MS = 90_000
const GRACIAS_MS = 7_000
const CARAS: LucideIcon[] = [Angry, Frown, Meh, Smile, Laugh]

type Fase = { f: 'inicio' } | { f: 'pregunta'; i: number } | { f: 'gracias' }

export default function Kiosco() {
  const nav = useNavigate()
  const [plantillaRaw] = usePreferencia<Plantilla>(CLAVE_PLANTILLA, 'org', PLANTILLA_BASE)
  const pl = useMemo(() => normalizarPlantilla(plantillaRaw), [plantillaRaw])
  const settings = useSettings()
  const ses = useSession()
  const [fase, setFase] = useState<Fase>({ f: 'inicio' })
  const [resp, setResp] = useState<Respuestas>({})
  const [vinculo, setVinculo] = useState<{
    patientId: string
    appointmentId: string
  } | null>(null)
  const [medico, setMedico] = useState(() => (ses.user?.rol === 'medico' ? ses.user.nombre : settings.doctor.nombre) || '')
  const [panel, setPanel] = useState(false)
  const [salir, setSalir] = useState(false)
  const ultimo = useRef(Date.now())

  // citas de hoy (para vincular, opcional)
  const hoy = new Date().toDateString()
  const citas = useCollection('appointments', (a) => new Date(a.inicio).toDateString() === hoy && a.estado !== 'cancelada', [hoy])
  const patients = useCollection('patients')
  const pac = (id: string) => patients.find((p) => p.id === id)
  const citasHoy = useMemo(() => [...citas].sort((a, b) => a.inicio.localeCompare(b.inicio)), [citas])

  const reiniciar = useCallback(() => {
    setResp({})
    setVinculo(null)
    setFase({ f: 'inicio' })
  }, [])

  // inactividad durante la encuesta: se descarta y vuelve al inicio
  useEffect(() => {
    if (fase.f !== 'pregunta') return
    const t = setInterval(() => {
      if (Date.now() - ultimo.current > INACTIVIDAD_MS) reiniciar()
    }, 5000)
    return () => clearInterval(t)
  }, [fase.f, reiniciar])

  // agradecimiento con reinicio automático
  const [cuenta, setCuenta] = useState(0)
  useEffect(() => {
    if (fase.f !== 'gracias') return
    const fin = Date.now() + GRACIAS_MS
    setCuenta(Math.ceil(GRACIAS_MS / 1000))
    const t = setInterval(() => {
      const s = Math.ceil((fin - Date.now()) / 1000)
      if (s <= 0) reiniciar()
      else setCuenta(s)
    }, 250)
    return () => clearInterval(t)
  }, [fase.f, reiniciar])

  // foco al título de cada pantalla (lectores de pantalla)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    tituloRef.current?.focus()
  }, [fase])

  function comenzar() {
    ultimo.current = Date.now()
    const el = document.documentElement
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => undefined)
    setResp({})
    setFase({ f: 'pregunta', i: 0 })
  }

  function responder(id: string, v: number | string, avanzar: boolean) {
    ultimo.current = Date.now()
    setResp((r) => ({ ...r, [id]: v }))
    if (avanzar && fase.f === 'pregunta') {
      const i = fase.i
      setTimeout(() => (i + 1 < pl.preguntas.length ? setFase({ f: 'pregunta', i: i + 1 }) : enviar({ ...resp, [id]: v })), 220)
    }
  }

  function enviar(r: Respuestas) {
    const falta = faltante(pl, r)
    if (falta) {
      const i = pl.preguntas.findIndex((q) => q.id === falta)
      setFase({ f: 'pregunta', i })
      return
    }
    const limpio: Respuestas = {}
    for (const q of pl.preguntas) {
      const v = r[q.id]
      if (v === undefined || (typeof v === 'string' && !v.trim())) continue
      limpio[q.id] = typeof v === 'string' ? v.trim().slice(0, 1000) : v
    }
    try {
      add('registros', {
        tipo: 'encuesta',
        estado: 'respondida',
        patientId: vinculo?.patientId || undefined,
        titulo: tituloEncuesta(limpio),
        datos: {
          respuestas: limpio,
          preguntas: pl.preguntas.map(({ id, tipo, texto }) => ({
            id,
            tipo,
            texto,
          })),
          ...(medico ? { medico } : {}),
          canal: new URLSearchParams(location.hash.split('?')[1] ?? '').get('origen') === 'qr' ? 'qr' : 'kiosco',
          ...(vinculo?.appointmentId ? { appointmentId: vinculo.appointmentId } : {}),
        },
      })
      setFase({ f: 'gracias' })
    } catch {
      toast('No se pudo guardar la respuesta.', 'danger')
    }
  }

  function terminar() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    nav('/encuestas?tab=aplicar')
  }

  const q = fase.f === 'pregunta' ? pl.preguntas[fase.i] : null
  const total = pl.preguntas.length

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface text-ink"
      onPointerDown={() => (ultimo.current = Date.now())}
      onKeyDown={() => (ultimo.current = Date.now())}
    >
      {/* barra discreta para el personal */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-muted">
        <span className="truncate">{settings.clinica || 'Encuesta de satisfacción'}</span>
        <div className="flex items-center gap-1">
          {fase.f === 'inicio' && (
            <button type="button" onClick={() => setPanel(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2">
              <UserRound className="size-3.5" /> {vinculo ? 'Paciente vinculado' : 'Personal'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSalir(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2"
            aria-label="Salir del modo kiosco"
          >
            <LogOut className="size-3.5" /> Salir
          </button>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-10">
        {fase.f === 'inicio' && (
          <div className="text-center">
            <h1 ref={tituloRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none sm:text-4xl">
              {pl.titulo}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">{pl.intro}</p>
            <button
              type="button"
              onClick={comenzar}
              className="mt-10 min-h-16 rounded-2xl bg-brand px-12 text-xl font-semibold text-white shadow-lg hover:bg-brand-strong focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand dark:text-black"
            >
              Comenzar
            </button>
            {vinculo && <p className="mt-6 text-sm text-muted">Esta respuesta quedará vinculada a la cita seleccionada por el personal.</p>}
          </div>
        )}

        {q && fase.f === 'pregunta' && (
          <div>
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-sm text-muted">
                <span>
                  Pregunta {fase.i + 1} de {total}
                </span>
                {q.opcional && <span>Opcional</span>}
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={fase.i + 1}
                aria-label="Progreso"
              >
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((fase.i + 1) / total) * 100}%` }} />
              </div>
            </div>
            <h1 ref={tituloRef} tabIndex={-1} id="kq" className="text-2xl font-semibold leading-snug outline-none sm:text-3xl">
              {q.texto}
            </h1>

            {q.tipo === 'nps' && (
              <div className="mt-8" role="radiogroup" aria-labelledby="kq">
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
                  {Array.from({ length: 11 }, (_, v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={resp[q.id] === v}
                      onClick={() => responder(q.id, v, true)}
                      className={cx(
                        'h-14 min-w-0 rounded-xl sm:h-16 border-2 text-xl font-semibold tabular-nums transition focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand',
                        resp[q.id] === v ? 'border-brand bg-brand text-white dark:text-black' : 'border-line bg-surface hover:border-brand',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-sm text-muted">
                  <span>0 = Nada probable</span>
                  <span>10 = Muy probable</span>
                </div>
              </div>
            )}

            {q.tipo === 'escala5' && (
              <div className="mt-8 grid grid-cols-5 gap-2 sm:gap-3" role="radiogroup" aria-labelledby="kq">
                {ESCALA5.map((label, k) => {
                  const v = k + 1
                  const Icon = CARAS[k]
                  const on = resp[q.id] === v
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`${v}: ${label}`}
                      onClick={() => responder(q.id, v, true)}
                      className={cx(
                        'flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-2 transition focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand',
                        on ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface hover:border-brand',
                      )}
                    >
                      <Icon className="size-9 sm:size-11" aria-hidden />
                      <span className="text-center text-xs font-medium leading-tight sm:text-sm">{label}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {q.tipo === 'opciones' && (
              <div className="mt-8 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="kq">
                {(q.opciones ?? []).map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={resp[q.id] === o}
                    onClick={() => responder(q.id, o, true)}
                    className={cx(
                      'min-h-16 rounded-2xl border-2 px-4 text-left text-lg font-medium transition focus-visible:outline-4 focus-visible:outline-brand',
                      resp[q.id] === o ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface hover:border-brand',
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}

            {q.tipo === 'texto' && (
              <div className="mt-6">
                <label htmlFor="ktexto" className="sr-only">
                  {q.texto}
                </label>
                <textarea
                  id="ktexto"
                  rows={5}
                  maxLength={1000}
                  value={typeof resp[q.id] === 'string' ? (resp[q.id] as string) : ''}
                  onChange={(e) => responder(q.id, e.target.value, false)}
                  className="w-full rounded-2xl border-2 border-line bg-surface p-4 text-lg outline-none focus:border-brand"
                  placeholder="Escriba aquí (opcional). No incluya datos personales."
                />
              </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => (fase.i === 0 ? reiniciar() : setFase({ f: 'pregunta', i: fase.i - 1 }))}
                className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-line px-5 text-lg font-medium hover:bg-surface-2"
              >
                <ArrowLeft className="size-5" /> {fase.i === 0 ? 'Cancelar' : 'Atrás'}
              </button>
              {(fase.i === total - 1 || q.tipo === 'texto' || resp[q.id] !== undefined) && (
                <button
                  type="button"
                  disabled={!q.opcional && (resp[q.id] === undefined || resp[q.id] === '')}
                  onClick={() => (fase.i + 1 < total ? setFase({ f: 'pregunta', i: fase.i + 1 }) : enviar(resp))}
                  className="min-h-14 rounded-2xl bg-brand px-8 text-lg font-semibold text-white hover:bg-brand-strong disabled:opacity-50 dark:text-black"
                >
                  {fase.i + 1 < total ? 'Siguiente' : 'Enviar'}
                </button>
              )}
            </div>
          </div>
        )}

        {fase.f === 'gracias' && (
          <div className="text-center" aria-live="polite">
            <Laugh className="mx-auto size-20 text-brand" aria-hidden />
            <h1 ref={tituloRef} tabIndex={-1} className="mt-4 text-3xl font-semibold outline-none">
              {pl.gracias}
            </h1>
            <p className="mt-6 text-muted">Puede entregar el dispositivo en recepción. Volviendo al inicio en {cuenta} s…</p>
            <Button className="mt-6" onClick={reiniciar}>
              Volver al inicio ahora
            </Button>
          </div>
        )}
      </main>

      <Modal open={panel} onClose={() => setPanel(false)} title="Opciones del personal">
        <div className="space-y-3">
          <Field label="Vincular a una cita de hoy (opcional)" hint="Por defecto la encuesta es anónima. Si la vinculas, aparecerá en el expediente del paciente.">
            <Select
              value={vinculo?.appointmentId ?? ''}
              onChange={(e) => {
                const a = citasHoy.find((x) => x.id === e.target.value)
                setVinculo(a ? { appointmentId: a.id, patientId: a.patientId } : null)
              }}
            >
              <option value="">Anónima</option>
              {citasHoy.map((a) => {
                const p = pac(a.patientId)
                return (
                  <option key={a.id} value={a.id}>
                    {fmtHora(a.inicio)} · {p ? nombreCompleto(p) : 'Paciente'}
                  </option>
                )
              })}
            </Select>
          </Field>
          <Field label="Médico que atendió" hint="Permite filtrar los resultados por médico.">
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={medico}
              onChange={(e) => setMedico(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setPanel(false)}>
              Listo
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={salir} onClose={() => setSalir(false)} title="¿Salir del modo kiosco?">
        <p className="text-sm">Esta opción es para el personal. Se cerrará la pantalla de encuesta y se mostrará el sistema.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setSalir(false)}>Seguir en kiosco</Button>
          <Button variant="primary" onClick={terminar}>
            Salir
          </Button>
        </div>
      </Modal>
    </div>
  )
}
