import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, Send, Trash2, UserRound } from 'lucide-react'
import { Badge, Button, Field, Input, Modal, Notice, Select, Textarea } from '../../components/ui'
import { add, remove, update, useCollection } from '../../lib/store'
import { useCanRegistro, useRegistros } from '../../lib/registros'
import { cx, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { toast } from '../../components/toast'
import { confirmar } from '../../components/dialogos'
import {
  ESTADOS,
  ETIQUETAS,
  PRIORIDADES,
  RECURRENCIAS,
  datosLimpios,
  fechaLocal,
  siguienteRecurrente,
  type DatosTarea,
  type EstadoTarea,
  type Prioridad,
  type Recurrencia,
  type Tarea,
} from './tareas'
import { useEquipo } from './equipo'

export interface TareaInicial {
  titulo?: string
  descripcion?: string
  patientId?: string
  etiquetas?: string[]
  vence?: string
  prioridad?: Prioridad
}

const OTRO = '__otro__'

/** Cambia el estado de una tarea (y crea la siguiente si es recurrente y se completó). */
export function cambiarEstado(t: Tarea, estado: EstadoTarea) {
  if (t.estado === estado) return
  const datos: DatosTarea = {
    ...t.datos,
    completadaEn: estado === 'hecha' ? new Date().toISOString() : undefined,
  }
  update('registros', t.id, { estado, datos: datosLimpios(datos) })
  if (estado === 'hecha') {
    const sig = siguienteRecurrente(t, fechaLocal(Date.now()))
    if (sig) {
      add('registros', sig)
      toast(`Se programó la siguiente: «${t.titulo}».`, 'ok', {
        title: 'Tarea recurrente',
      })
    }
  }
}

/** Formulario de alta/edición de tarea con comentarios (solo al editar). */
export function TareaModal({ open, onClose, tarea, inicial }: { open: boolean; onClose: () => void; tarea?: Tarea; inicial?: TareaInicial }) {
  const patients = useCollection('patients')
  const { yo, usuarios } = useEquipo()
  const todas = useRegistros('tarea')
  const puede = useCanRegistro('tarea', 'write')
  const nombresPrevios = useMemo(() => {
    const s = new Set<string>()
    if (yo?.nombre) s.add(yo.nombre)
    for (const r of todas) {
      const n = (r.datos as { asignadoNombre?: unknown }).asignadoNombre
      if (typeof n === 'string' && n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  }, [todas, yo?.nombre])

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [patientId, setPatientId] = useState('')
  const [asignadoA, setAsignadoId] = useState('')
  const [asignadoNombre, setAsignadoNombre] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('media')
  const [vence, setVence] = useState('')
  const [estado, setEstado] = useState<EstadoTarea>('abierta')
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [recurrencia, setRecurrencia] = useState<Recurrencia | ''>('')
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState('')
  const [otro, setOtro] = useState(false)

  useEffect(() => {
    if (!open) return
    const d = tarea?.datos
    setTitulo(tarea?.titulo ?? inicial?.titulo ?? '')
    setDescripcion(d?.descripcion ?? inicial?.descripcion ?? '')
    setPatientId(tarea?.patientId ?? inicial?.patientId ?? '')
    setAsignadoId(d?.asignadoA ?? '')
    setAsignadoNombre(d?.asignadoNombre ?? '')
    setPrioridad(d?.prioridad ?? inicial?.prioridad ?? 'media')
    setVence(d?.vence ?? inicial?.vence ?? '')
    setEstado(tarea?.estado ?? 'abierta')
    setEtiquetas(d?.etiquetas ?? inicial?.etiquetas ?? [])
    setRecurrencia(d?.recurrencia ?? '')
    setComentario('')
    setError('')
    setOtro(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tarea?.id])

  // valor del selector de usuarios (solo cuando se puede listar el equipo)
  const selUsuario = asignadoA ? asignadoA : asignadoNombre ? OTRO : ''
  function guardar() {
    const t = titulo.trim()
    if (!t) return setError('Escribe un título.')
    const prev = tarea?.datos
    const datos: DatosTarea = {
      descripcion: descripcion.trim(),
      asignadoA: asignadoA || undefined,
      asignadoNombre: asignadoNombre.trim() || undefined,
      prioridad,
      vence: vence || undefined,
      etiquetas,
      comentarios: prev?.comentarios ?? [],
      recurrencia: recurrencia || undefined,
      creadoPorNombre: prev?.creadoPorNombre ?? yo?.nombre,
      completadaEn: prev?.completadaEn,
    }
    if (tarea) {
      update('registros', tarea.id, {
        titulo: t,
        patientId: patientId || undefined,
        datos: datosLimpios(datos),
      })
      if (estado !== tarea.estado) cambiarEstado({ ...tarea, titulo: t, patientId: patientId || undefined, datos }, estado)
      toast('Tarea actualizada.', 'ok')
    } else {
      add('registros', {
        tipo: 'tarea',
        titulo: t,
        estado,
        patientId: patientId || undefined,
        datos: datosLimpios(datos),
      })
      toast('Tarea creada.', 'ok')
    }
    onClose()
  }

  async function eliminar() {
    if (!tarea) return
    const ok = await confirmar(`Se eliminará «${tarea.titulo}» con sus comentarios. Si solo ya no aplica, considera marcarla como cancelada para conservar el historial.`, {
      titulo: '¿Eliminar tarea?',
      aceptar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    remove('registros', tarea.id)
    onClose()
    toast('Tarea eliminada.', 'ok')
  }

  function comentar() {
    if (!tarea || !comentario.trim()) return
    const c = {
      fecha: new Date().toISOString(),
      autor: yo?.nombre || 'Equipo',
      texto: comentario.trim(),
    }
    update('registros', tarea.id, {
      datos: datosLimpios({
        ...tarea.datos,
        comentarios: [...tarea.datos.comentarios, c],
      }),
    })
    setComentario('')
  }

  const toggleEtiqueta = (id: string) => setEtiquetas((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  const paciente = patients.find((p) => p.id === patientId)

  return (
    <>
      <Modal open={open} onClose={onClose} title={tarea ? 'Editar tarea' : 'Nueva tarea'} wide>
        <Notice tone="warn">
          Las tareas las ve todo el equipo, <b>incluida recepción</b>. No escribas diagnósticos, resultados ni otros datos clínicos: usa frases operativas («llamar para agendar
          control», «resultado de laboratorio listo»).
        </Notice>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            guardar()
          }}
        >
          <Field label="Título *" className="sm:col-span-2">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} placeholder="Ej. Llamar para confirmar cita de control" autoFocus />
          </Field>
          <Field label="Descripción (sin detalle clínico)" className="sm:col-span-2">
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={1000} rows={3} />
          </Field>
          <Field
            label="Paciente (opcional)"
            hint={
              paciente ? (
                <Link className="text-brand underline" to={`/pacientes/${paciente.id}`}>
                  Abrir expediente
                </Link>
              ) : undefined
            }
          >
            <Select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">— Ninguno —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {nombreCompleto(p)}
                </option>
              ))}
            </Select>
          </Field>
          {usuarios && !otro && selUsuario !== OTRO ? (
            <Field label="Asignada a">
              <Select
                value={selUsuario}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === OTRO) {
                    setOtro(true)
                    setAsignadoId('')
                    return
                  }
                  const u = usuarios.find((x) => x.id === v)
                  setAsignadoId(u?.id ?? '')
                  setAsignadoNombre(u?.nombre ?? '')
                }}
              >
                <option value="">— Sin asignar —</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
                <option value={OTRO}>Otra persona (escribir)…</option>
              </Select>
            </Field>
          ) : (
            <Field
              label="Asignada a"
              hint={
                yo ? (
                  <button type="button" className="text-brand underline" onClick={() => (setAsignadoNombre(yo.nombre), setAsignadoId(yo.id ?? ''))}>
                    Asignarme a mí
                  </button>
                ) : undefined
              }
            >
              <Input
                value={asignadoNombre}
                onChange={(e) => {
                  setAsignadoNombre(e.target.value)
                  setAsignadoId(yo?.id && e.target.value === yo.nombre ? yo.id : '')
                }}
                list="tareas-nombres"
                placeholder="Nombre de quien la atiende"
              />
              <datalist id="tareas-nombres">
                {nombresPrevios.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
          )}
          <Field label="Prioridad">
            <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}>
              {PRIORIDADES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha límite">
            <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoTarea)}>
              {ESTADOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Repetir" hint={recurrencia ? 'Al marcarla como hecha se crea la siguiente automáticamente.' : undefined}>
            <Select value={recurrencia} onChange={(e) => setRecurrencia(e.target.value as Recurrencia | '')}>
              <option value="">No se repite</option>
              {RECURRENCIAS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-medium text-muted">Etiquetas</legend>
            <div className="flex flex-wrap gap-2">
              {ETIQUETAS.map((e) => {
                const on = etiquetas.includes(e.id)
                return (
                  <button
                    type="button"
                    key={e.id}
                    aria-pressed={on}
                    onClick={() => toggleEtiqueta(e.id)}
                    className={cx(
                      'rounded-full border px-3 py-1 text-xs font-medium',
                      on ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-muted hover:bg-surface-2',
                    )}
                  >
                    {e.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            {tarea && puede ? (
              <Button type="button" variant="ghost" className="text-danger" onClick={eliminar}>
                <Trash2 className="size-4" /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={!puede}>
                Guardar
              </Button>
            </div>
          </div>
        </form>

        {tarea && (
          <section className="mt-5 border-t border-line pt-4" aria-labelledby="tarea-coms">
            <h3 id="tarea-coms" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <MessageSquare className="size-4" /> Comentarios <Badge>{tarea.datos.comentarios.length}</Badge>
            </h3>
            {tarea.datos.creadoPorNombre && (
              <p className="mb-2 text-xs text-muted">
                Creada por {tarea.datos.creadoPorNombre} el {fmtFechaHora(tarea.fecha)}
              </p>
            )}
            <ol className="mb-3 space-y-2">
              {tarea.datos.comentarios.map((c, i) => (
                <li key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <UserRound className="size-3" /> <b className="text-ink">{c.autor}</b> · {fmtFechaHora(c.fecha)}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{c.texto}</p>
                </li>
              ))}
            </ol>
            <div className="flex gap-2">
              <Input
                aria-label="Nuevo comentario"
                placeholder="Agregar comentario (no se puede editar después)"
                value={comentario}
                maxLength={500}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    comentar()
                  }
                }}
              />
              <Button type="button" onClick={comentar} disabled={!comentario.trim()} aria-label="Enviar comentario">
                <Send className="size-4" />
              </Button>
            </div>
          </section>
        )}
      </Modal>
    </>
  )
}
