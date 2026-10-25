// Acciones de una orden: PDF, imprimir, WhatsApp, compartir; avanzar estado, adjuntar resultado, cancelar.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, CheckCircle2, Download, Eye, FileUp, MessageCircle, Printer, ScanText, Share2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { pedirTexto } from '../../components/dialogos'
import { toast } from '../../components/toast'
import { add, setActivePatient, update, useCollection, useSettings } from '../../lib/store'
import { useCan, useSession } from '../../lib/session'
import { useCanRegistro } from '../../lib/registros'
import type { Patient, Registro } from '../../lib/types'
import { downloadBlob, fetchDocBlob, fileToDataUrl } from '../../lib/utils'
import { telWhatsApp } from './comun'
import { datosOrden, estadoRegistro, estadoOrden, preparacionCombinada, siguienteEstado, type CambioEstado, type EstadoOrden } from './ordenes'
import { ordenPDF } from './pdf'
import { compartirPDF, imprimirPDF } from './pdfComun'

export function useQuien(): string | undefined {
  const ses = useSession()
  const s = useSettings()
  return ses.user?.nombre ?? (s.doctor.nombre || undefined)
}

/** Cambia el estado de la orden y agrega el paso al historial. */
export function cambiarEstado(r: Registro, estado: EstadoOrden, por: string | undefined, extra: Record<string, unknown> = {}) {
  const d = datosOrden(r)
  const paso: CambioEstado = { estado, fecha: new Date().toISOString(), ...(por ? { por } : {}) }
  // PATCH reemplaza `datos` completo: siempre se envía el objeto entero
  update('registros', r.id, { estado: estadoRegistro(estado), datos: { ...r.datos, ...extra, fase: estado, historial: [...d.historial, paso] } })
}

const BOTON: Partial<Record<EstadoOrden, string>> = {
  muestra: 'Muestra tomada',
  resultado: 'Resultado recibido',
  revisado: 'Marcar revisado',
}

export function AccionesPDF({ r, patient, compact }: { r: Registro; patient: Patient; compact?: boolean }) {
  const s = useSettings()
  const [busy, setBusy] = useState(false)
  const d = datosOrden(r)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message, 'danger', { title: 'No se generó el PDF' })
    } finally {
      setBusy(false)
    }
  }
  const nombre = `${d.folio}.pdf`
  const whatsapp = () => {
    const prep = preparacionCombinada(d.items)
    const txt =
      `Hola ${patient.nombre}, le comparto su solicitud de estudios ${d.folio} de ${s.doctor.nombre}:\n` +
      d.items.map((i) => `• ${i.nombre}`).join('\n') +
      (prep.length ? `\n\nPreparación:\n${prep.map((p) => `- ${p.texto}`).join('\n')}` : '') +
      (d.laboratorio ? `\n\nLaboratorio sugerido: ${d.laboratorio}` : '') +
      '\n\nConfirme la preparación con el laboratorio. Le pedimos traer o enviar sus resultados.'
    window.open(`https://wa.me/${telWhatsApp(patient.telefono)}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener')
  }
  const sz = compact ? 'sm' : 'md'
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={sz} variant={compact ? 'secondary' : 'primary'} disabled={busy} onClick={() => run(async () => downloadBlob(await ordenPDF(r, patient, s), nombre))}>
        <Download className="size-4" /> PDF
      </Button>
      <Button size={sz} disabled={busy} onClick={() => run(async () => imprimirPDF(await ordenPDF(r, patient, s)))} aria-label={`Imprimir ${d.folio}`}>
        <Printer className="size-4" /> {!compact && 'Imprimir'}
      </Button>
      <Button size={sz} disabled={busy} onClick={whatsapp} aria-label={`Enviar ${d.folio} por WhatsApp`}>
        <MessageCircle className="size-4" /> {!compact && 'WhatsApp'}
      </Button>
      <Button
        size={sz}
        disabled={busy}
        aria-label={`Compartir ${d.folio}`}
        onClick={() =>
          run(async () => {
            const ok = await compartirPDF(await ordenPDF(r, patient, s), nombre, `Solicitud de estudios ${d.folio}`)
            if (!ok) toast('Este navegador no permite compartir archivos. Usa «PDF» o WhatsApp.', 'warn')
          })
        }
      >
        <Share2 className="size-4" /> {!compact && 'Compartir'}
      </Button>
    </div>
  )
}

/** Botones de seguimiento: avanzar estado, adjuntar resultado, capturar valores, ver resultado, cancelar. */
export function AccionesSeguimiento({ r }: { r: Registro }) {
  const escribe = useCanRegistro('orden', 'write')
  const puedeAvanzar = escribe && useCan('obs.escribir')
  const puedeRevisar = escribe && useCan('notas.escribir')
  const quien = useQuien()
  const fileRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const e = estadoOrden(r)
  const d = datosOrden(r)
  const sig = siguienteEstado(e)
  const ultimo = useCollection('documents', (x) => x.id === d.resultadoDocId, [d.resultadoDocId])[0]

  const adjuntar = async (f: File | undefined) => {
    if (!f || !r.patientId) return
    if (f.size > 25 * 1024 * 1024) return toast('El archivo pesa más de 25 MB.', 'warn')
    if (!/^(application\/pdf|image\/)/.test(f.type)) return toast('Adjunta un PDF o una imagen.', 'warn')
    setSubiendo(true)
    try {
      const dataUrl = await fileToDataUrl(f)
      const doc = add('documents', { patientId: r.patientId, tipo: 'laboratorio', nombre: f.name || `Resultado ${d.folio}`, mime: f.type, dataUrl, meta: { ordenId: r.id, folio: d.folio } })
      const extra = { resultadoDocId: doc.id, resultadoDocIds: [...(d.resultadoDocIds ?? []), doc.id] }
      if (e === 'pendiente' || e === 'muestra') cambiarEstado(r, 'resultado', quien, extra)
      else update('registros', r.id, { datos: { ...r.datos, ...extra } })
      toast(`Resultado adjuntado a ${d.folio}.`, 'ok')
    } catch (err) {
      toast((err as Error).message, 'danger', { title: 'No se adjuntó el resultado' })
    } finally {
      setSubiendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const ver = async () => {
    if (!ultimo) return
    try {
      const url = URL.createObjectURL(await fetchDocBlob(ultimo))
      const w = window.open(url, '_blank', 'noopener')
      if (!w) downloadBlob(url, ultimo.nombre)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast((err as Error).message, 'danger')
    }
  }

  if (e === 'cancelada') return d.motivoCancelacion ? <p className="text-xs text-muted">Motivo: {d.motivoCancelacion}</p> : null
  return (
    <div className="flex flex-wrap gap-2">
      {sig && sig !== 'revisado' && puedeAvanzar && (
        <Button size="sm" variant="primary" onClick={() => cambiarEstado(r, sig, quien)}>
          <CheckCircle2 className="size-4" /> {BOTON[sig]}
        </Button>
      )}
      {sig === 'revisado' && puedeRevisar && (
        <Button size="sm" variant="primary" onClick={async () => {
            const nota = await pedirTexto('Confirma que revisaste los resultados. Nota de revisión (opcional), p. ej. «Dentro de parámetros; control en 3 meses». Para graficar valores usa «Capturar valores».', { titulo: `Revisar resultados · ${d.folio}`, aceptar: 'Marcar revisado' })
            if (nota === null) return
            cambiarEstado(r, 'revisado', quien, nota.trim() ? { notaRevision: nota.trim() } : {})
          }}>
          <CheckCircle2 className="size-4" /> {BOTON.revisado}
        </Button>
      )}
      {puedeAvanzar && (
        <>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(ev) => adjuntar(ev.target.files?.[0])} />
          <Button size="sm" disabled={subiendo} onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" /> {subiendo ? 'Adjuntando…' : 'Adjuntar resultado'}
          </Button>
        </>
      )}
      {(e === 'resultado' || e === 'revisado') && puedeAvanzar && (
        <Link
          to="/ocr"
          onClick={() => r.patientId && setActivePatient(r.patientId)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium hover:bg-surface-2"
        >
          <ScanText className="size-4" /> Capturar valores
        </Link>
      )}
      {ultimo && (
        <Button size="sm" variant="ghost" onClick={ver}>
          <Eye className="size-4" /> Ver resultado
        </Button>
      )}
      {e !== 'revisado' && puedeRevisar && (
        <Button size="sm" variant="ghost" onClick={async () => {
            const motivo = await pedirTexto('Motivo de cancelación', { titulo: `Cancelar orden ${d.folio}`, aceptar: 'Cancelar orden' })
            if (motivo === null) return
            if (!motivo.trim()) return void toast('Indica el motivo de cancelación.', 'warn')
            cambiarEstado(r, 'cancelada', quien, { motivoCancelacion: motivo.trim() })
          }} aria-label={`Cancelar orden ${d.folio}`}>
          <Ban className="size-4" /> Cancelar
        </Button>
      )}

    </div>
  )
}
