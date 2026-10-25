import { useEffect, useRef, useState } from 'react'
import { Download, FileIcon, FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import type { DocumentFile, Patient } from '../../lib/types'
import { add, remove, useCollection } from '../../lib/store'
import { isServer } from '../../lib/api'
import { cx, downloadBlob, fetchDocBlob, fileToDataUrl, fmtFecha } from '../../lib/utils'
import { Badge, Button, Card, Empty, Modal, Notice, Select } from '../../components/ui'
import { confirmar } from '../../components/dialogos'

const TIPOS: Record<DocumentFile['tipo'], string> = {
  estudio: 'Estudio', laboratorio: 'Laboratorio', consentimiento: 'Consentimiento', foto: 'Foto', receta: 'Receta', dicom: 'DICOM', ecg: 'ECG', factura: 'Factura', otro: 'Otro',
}
const maxMb = () => (isServer() ? 25 : 15) // servidor: límite del contrato (25 MB)

function tipoPorArchivo(f: File): DocumentFile['tipo'] {
  if (f.type.startsWith('image/')) return 'foto'
  if (/\.dcm$/i.test(f.name) || f.type === 'application/dicom') return 'dicom'
  if (/lab|biometr|quimica|perfil/i.test(f.name)) return 'laboratorio'
  return 'estudio'
}

export default function Documentos({ p }: { p: Patient }) {
  const docs = useCollection('documents', (d) => d.patientId === p.id, [p.id])
  const [tipo, setTipo] = useState<'auto' | DocumentFile['tipo']>('auto')
  const [filtro, setFiltro] = useState('')
  const [ver, setVer] = useState<DocumentFile | null>(null)
  const [error, setError] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const subir = async (files: FileList | File[]) => {
    setError('')
    for (const f of Array.from(files)) {
      if (f.size > maxMb() * 1024 * 1024) {
        setError(isServer() ? `"${f.name}" pesa más de ${maxMb()} MB.` : `"${f.name}" pesa más de ${maxMb()} MB; en el navegador se guardan archivos pequeños (los grandes van al servidor/PACS).`)
        continue
      }
      const dataUrl = await fileToDataUrl(f)
      add('documents', { patientId: p.id, tipo: tipo === 'auto' ? tipoPorArchivo(f) : tipo, nombre: f.name, mime: f.type || 'application/octet-stream', dataUrl, meta: { tamano: f.size } })
    }
  }

  const lista = [...docs].filter((d) => !filtro || d.tipo === filtro).sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          subir(e.dataTransfer.files)
        }}
        className={cx('flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-4', arrastrando ? 'border-brand bg-brand-soft/40' : 'border-line bg-surface')}
      >
        <Upload className="size-6 text-muted" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">Arrastra archivos aquí o elígelos</div>
          <div className="text-xs text-muted">Imágenes, PDF u otros (máx. {maxMb()} MB c/u). {isServer() ? 'Se guardan en el servidor de la clínica.' : 'Se guardan en este navegador.'}</div>
        </div>
        <Select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="w-40" aria-label="Tipo de documento">
          <option value="auto">Tipo automático</option>
          {Object.entries(TIPOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Button variant="primary" onClick={() => input.current?.click()}>
          <Upload className="size-4" /> Subir
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="image/*,application/pdf,.dcm,.txt,.csv,.doc,.docx"
          onChange={(e) => {
            if (e.target.files) subir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {error && <Notice tone="warn" onClose={() => setError('')}>{error}</Notice>}

      <Card
        title={`Documentos (${docs.length})`}
        actions={
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 py-0 text-xs" aria-label="Filtrar">
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
      >
        {lista.length === 0 ? (
          <Empty>Sin documentos.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {lista.map((d) => (
              <div key={d.id} className="group overflow-hidden rounded-lg border border-line bg-surface">
                <button onClick={() => setVer(d)} className="block aspect-[4/3] w-full bg-surface-2">
                  {d.mime.startsWith('image/') ? (
                    <img src={d.dataUrl} alt={d.nombre} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-muted">
                      {d.mime === 'application/pdf' ? <FileText className="size-10" /> : <FileIcon className="size-10" />}
                    </span>
                  )}
                </button>
                <div className="flex items-start gap-1 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium" title={d.nombre}>
                      {d.nombre}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                      <Badge>{TIPOS[d.tipo]}</Badge> {fmtFecha(d.fecha, { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>
                  </div>
                  <button
                    className="grid size-7 shrink-0 place-items-center rounded text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label="Eliminar documento"
                    onClick={() => void confirmar(`¿Eliminar "${d.nombre}"?`, { peligro: true }).then((ok) => ok && remove('documents', d.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {ver && (
        <Modal open onClose={() => setVer(null)} title={ver.nombre} wide>
          {ver.mime.startsWith('image/') ? (
            <img src={ver.dataUrl} alt={ver.nombre} className="mx-auto max-h-[70vh] rounded" />
          ) : ver.mime === 'application/pdf' ? (
            <VisorPdf doc={ver} />
          ) : (
            <div className="grid place-items-center gap-2 py-10 text-sm text-muted">
              <ImageIcon className="size-10" />
              Vista previa no disponible para este tipo de archivo.
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button onClick={() => downloadBlob(ver.dataUrl, ver.nombre)}>
              <Download className="size-4" /> Descargar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// Los PDF se muestran desde un blob: URL (Chrome bloquea algunos data: URL en iframes)
function VisorPdf({ doc }: { doc: DocumentFile }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let u = ''
    fetchDocBlob(doc)
      .then((b) => setUrl((u = URL.createObjectURL(new Blob([b], { type: 'application/pdf' })))))
      .catch(() => setUrl(doc.dataUrl))
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [doc])
  return url ? <iframe src={url} title={doc.nombre} className="h-[70vh] w-full rounded border border-line" /> : null
}
