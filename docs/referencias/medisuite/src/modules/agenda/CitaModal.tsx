import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, Trash2, UserRound } from 'lucide-react'
import type { Appointment, EstadoCita } from '../../lib/types'
import { add, remove, update, useCollection, useSettings, setActivePatient } from '../../lib/store'
import { nombreCompleto, edad } from '../../lib/utils'
import { Button, Field, Input, Modal, Notice, Select, Textarea } from '../../components/ui'
import { ESTADOS, TIPOS } from './estados'
import { BotonRecordatorio, EstadoRecordatorio, SenalesCita } from './Recordatorio'
import { ESTADO_MENSAJE, useMensajes } from '../../lib/mensajes'
import { isServer } from '../../lib/api'
import { fmtFechaHora } from '../../lib/utils'
import { confirmar } from '../../components/dialogos'

export type Borrador = { id?: string; patientId: string; inicio: Date; minutos: number; tipo: Appointment['tipo']; motivo: string; estado: EstadoCita; notas?: string }

const pad = (n: number) => String(n).padStart(2, '0')
const fechaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const horaLocal = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export function CitaModal({ inicial, onClose }: { inicial: Borrador | null; onClose: () => void }) {
  const patients = useCollection('patients')
  const citas = useCollection('appointments')
  const settings = useSettings()
  const nav = useNavigate()
  const mensajes = useMensajes()
  const [b, setB] = useState<Borrador | null>(inicial)
  useEffect(() => setB(inicial), [inicial])

  const conflicto = useMemo(() => {
    if (!b) return null
    const ini = b.inicio.getTime()
    const fin = ini + b.minutos * 60000
    return citas.find(
      (c) => c.id !== b.id && c.estado !== 'cancelada' && new Date(c.inicio).getTime() < fin && new Date(c.fin).getTime() > ini,
    )
  }, [b, citas])

  if (!b) return null
  const set = (patch: Partial<Borrador>) => setB({ ...b, ...patch })
  const paciente = patients.find((p) => p.id === b.patientId)
  const existente = b.id ? citas.find((c) => c.id === b.id) : undefined
  const historial = existente ? mensajes.filter((m) => m.appointmentId === existente.id).sort((x, y) => y.creadoEn.localeCompare(x.creadoEn)) : []

  const guardar = () => {
    if (!b.patientId) return
    const data = {
      patientId: b.patientId,
      inicio: b.inicio.toISOString(),
      fin: new Date(b.inicio.getTime() + b.minutos * 60000).toISOString(),
      tipo: b.tipo,
      motivo: b.motivo.trim() || undefined,
      estado: b.estado,
      ...(isServer() || b.notas !== undefined ? { notas: b.notas?.trim() || undefined } : {}),
    }
    if (b.id) update('appointments', b.id, data)
    else add('appointments', data)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={b.id ? 'Editar cita' : 'Nueva cita'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Paciente" className="sm:col-span-2">
          <Select value={b.patientId} onChange={(e) => set({ patientId: e.target.value })}>
            <option value="">Selecciona…</option>
            {[...patients]
              .sort((x, y) => nombreCompleto(x).localeCompare(nombreCompleto(y)))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {nombreCompleto(p)} · {edad(p.fechaNac).texto}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <Input
            type="date"
            value={fechaLocal(b.inicio)}
            onChange={(e) => {
              if (!e.target.value) return
              const [y, m, d] = e.target.value.split('-').map(Number)
              const n = new Date(b.inicio)
              n.setFullYear(y, m - 1, d)
              set({ inicio: n })
            }}
          />
        </Field>
        <Field label="Hora">
          <Input
            type="time"
            step={300}
            value={horaLocal(b.inicio)}
            onChange={(e) => {
              if (!e.target.value) return
              const [h, mi] = e.target.value.split(':').map(Number)
              const n = new Date(b.inicio)
              n.setHours(h, mi, 0, 0)
              set({ inicio: n })
            }}
          />
        </Field>
        <Field label="Duración">
          <Select value={b.minutos} onChange={(e) => set({ minutos: Number(e.target.value) })}>
            {[15, 20, 30, 45, 60, 90, 120].includes(b.minutos) ? null : <option value={b.minutos}>{b.minutos} min</option>}
            {[15, 20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={b.tipo} onChange={(e) => set({ tipo: e.target.value as Appointment['tipo'] })}>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado" className="sm:col-span-2">
          <Select value={b.estado} onChange={(e) => set({ estado: e.target.value as EstadoCita })}>
            {Object.entries(ESTADOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Motivo de consulta" className="sm:col-span-2">
          <Textarea value={b.motivo} onChange={(e) => set({ motivo: e.target.value })} placeholder="Ej. control de presión, revisión de laboratorios…" className="min-h-16" />
        </Field>
        {isServer() && (
          <Field label="Notas de recepción" className="sm:col-span-2" hint="Aquí se anotan también las respuestas del paciente por WhatsApp.">
            <Textarea value={b.notas ?? ''} onChange={(e) => set({ notas: e.target.value })} className="min-h-14" />
          </Field>
        )}
      </div>
      {existente && (existente.reagendar || existente.confirmacion) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <SenalesCita c={existente} />
        </div>
      )}
      {paciente && paciente.alergias.length > 0 && <p className="mt-2 text-xs font-medium text-danger">Alergias: {paciente.alergias.join(', ')}</p>}
      {conflicto && (
        <div className="mt-3">
          <Notice tone="warn">
            Se empalma con otra cita ({new Date(conflicto.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })},{' '}
            {(() => {
              const p = patients.find((x) => x.id === conflicto.patientId)
              return p ? nombreCompleto(p) : 'otro paciente'
            })()}
            ).
          </Notice>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {existente && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={async () => {
                if (await confirmar('¿Eliminar definitivamente esta cita?', { peligro: true })) {
                  remove('appointments', existente.id)
                  onClose()
                }
              }}
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
            {existente.estado !== 'cancelada' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  update('appointments', existente.id, { estado: 'cancelada' })
                  onClose()
                }}
              >
                Cancelar cita
              </Button>
            )}
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={!b.patientId}>
            Guardar
          </Button>
        </div>
      </div>
      {existente && paciente && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          <Button
            size="sm"
            onClick={() => {
              setActivePatient(paciente.id)
              nav('/pacientes/' + paciente.id)
            }}
          >
            <UserRound className="size-4" /> Expediente
          </Button>
          <Button
            size="sm"
            onClick={() => {
              update('appointments', existente.id, { estado: 'en-consulta' })
              setActivePatient(paciente.id)
              nav('/consulta/nueva?p=' + paciente.id)
            }}
          >
            <Stethoscope className="size-4" /> Iniciar consulta
          </Button>
          <BotonRecordatorio c={existente} p={paciente} settings={settings} mensaje={historial[0]} />
          <EstadoRecordatorio m={historial[0]} className="self-center" />
        </div>
      )}
      {historial.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted">Historial de recordatorios ({historial.length})</summary>
          <ul className="mt-1 space-y-1">
            {historial.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums">{fmtFechaHora(m.creadoEn)}</span>
                <span>{m.canal === 'email' ? 'Correo' : 'WhatsApp'}</span>
                <span>{m.tipo === 'recordatorio' ? `automático${m.horas ? ` (${m.horas} h antes)` : ''}` : 'manual'}</span>
                <b>{ESTADO_MENSAJE[m.estado]?.label ?? m.estado}</b>
                {m.respuesta && <span>· respondió {m.respuesta === 'CONFIRMAR' ? 'confirmar' : 'reagendar'}</span>}
                {m.error && <span className="text-danger">· {m.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  )
}
