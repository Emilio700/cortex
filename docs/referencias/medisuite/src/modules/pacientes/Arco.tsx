// Derechos ARCO (LFPDPPP): exportar el expediente completo y bloquear/desbloquear al paciente (docs/api.md v1.1).
import { useEffect, useState } from 'react'
import { Download, Loader2, Lock, LockOpen, ShieldAlert } from 'lucide-react'
import { Button, Field, Modal, Notice, Textarea } from '../../components/ui'
import { toast } from '../../components/toast'
import { api, apiDownload, ApiError, errorMessage, isServer } from '../../lib/api'
import { applyServerItem, getDB, refreshServer } from '../../lib/store'
import { useSession } from '../../lib/session'
import type { Patient } from '../../lib/types'
import { downloadBlob, fmtFechaHora, nombreCompleto } from '../../lib/utils'
import { confirmar } from '../../components/dialogos'

const archivo = (p: Patient) =>
  `expediente_${nombreCompleto(p)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`

/** Exporta el expediente (servidor: GET /patients/:id/expediente; demo: copia local). */
export async function exportarExpediente(p: Patient) {
  if (!isServer()) {
    const db = getDB()
    const de = <T extends { patientId: string }>(arr: T[]) => arr.filter((x) => x.patientId === p.id)
    const data = {
      formato: 'medisuite-expediente',
      version: 1,
      exportadoEn: new Date().toISOString(),
      paciente: p,
      appointments: de(db.appointments),
      encounters: de(db.encounters),
      observations: de(db.observations),
      prescriptions: de(db.prescriptions),
      documents: de(db.documents).map(({ dataUrl: _d, ...m }) => m),
      payments: de(db.payments),
      registros: db.registros.filter((x) => x.patientId === p.id),
    }
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), archivo(p))
    return
  }
  await apiDownload(`/patients/${encodeURIComponent(p.id)}/expediente`, archivo(p))
  toast('Expediente exportado. Entrégalo al titular por un medio seguro; la descarga quedó registrada en la bitácora.', 'ok', { ms: 6000 })
}

export function BotonExportar({ p }: { p: Patient }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await exportarExpediente(p)
        } catch (e) {
          toast(errorMessage(e), 'danger', { title: 'No se exportó el expediente' })
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Exportar expediente (ARCO)
    </Button>
  )
}

/** Aviso de paciente bloqueado (con motivo para el administrador). */
export function BannerBloqueado({ p }: { p: Patient }) {
  if (!p.bloqueado) return null
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div>
        <b className="text-danger">Paciente bloqueado (derechos ARCO).</b> El expediente es de solo lectura, no aparece para otros roles y no recibe recordatorios.
        {p.bloqueo && (
          <div className="mt-0.5 text-xs">
            Motivo: {p.bloqueo.motivo} · {fmtFechaHora(p.bloqueo.fecha)}
            {p.bloqueo.porNombre ? ` · por ${p.bloqueo.porNombre}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

/** Bloquear / desbloquear (solo admin, modo servidor). */
export function BotonBloqueo({ p }: { p: Patient }) {
  const { user } = useSession()
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (open) {
      setMotivo('')
      setErr('')
    }
  }, [open])
  if (!isServer() || user?.rol !== 'admin') return null
  const ruta = `/patients/${encodeURIComponent(p.id)}/bloqueo`
  const bloquear = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await api<Patient>(ruta, { method: 'POST', body: { motivo: motivo.trim() } })
      applyServerItem('patients', r ?? { ...p, bloqueado: true })
      toast(`${nombreCompleto(p)} quedó bloqueado. Los demás roles ya no verán su expediente.`, 'ok')
      setOpen(false)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'paciente_bloqueado') {
        refreshServer()
        setOpen(false)
      } else setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const desbloquear = async () => {
    if (!(await confirmar(`Su expediente volverá a estar disponible para el personal y recibirá recordatorios.`, { titulo: `¿Desbloquear a ${nombreCompleto(p)}?`, aceptar: 'Desbloquear' }))) return
    setBusy(true)
    try {
      const r = await api<Patient>(ruta, { method: 'DELETE' })
      applyServerItem('patients', r ?? { ...p, bloqueado: undefined, bloqueo: undefined })
      refreshServer()
      toast('Paciente desbloqueado.', 'ok')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'paciente_no_bloqueado') refreshServer()
      else toast(errorMessage(e), 'danger', { title: 'No se desbloqueó' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {p.bloqueado ? (
        <Button size="sm" onClick={desbloquear} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />} Desbloquear
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen(true)}>
          <ShieldAlert className="size-4" /> Bloquear paciente (ARCO)
        </Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Bloquear paciente (derechos ARCO)">
        <div className="space-y-3">
          {err && <Notice tone="danger">{err}</Notice>}
          <Notice tone="warn">
            Usa el bloqueo cuando el titular ejerza su derecho de <b>cancelación u oposición</b>. El expediente no se borra (NOM-004 exige conservarlo al menos 5 años): deja de mostrarse
            al personal, no admite cambios y no recibe recordatorios. Solo un administrador puede desbloquearlo.
          </Notice>
          <Field label="Motivo (queda en la bitácora)">
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Solicitud ARCO de cancelación recibida el 24/10/2026, folio 015" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="danger" disabled={busy || motivo.trim().length < 3} onClick={bloquear}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Bloquear
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
