// Pizarra Excalidraw (se carga en diferido desde index.tsx)
import { useState } from 'react'
import { Excalidraw, convertToExcalidrawElements, exportToBlob } from '@excalidraw/excalidraw'
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { ImagePlus, Save } from 'lucide-react'
import { Button, Select, Notice } from '../../components/ui'
import { add, useCollection } from '../../lib/store'
import { docToDataUrl, fileToDataUrl, fmtFecha } from '../../lib/utils'

const imgSize = (src: string) => new Promise<{ w: number; h: number }>((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 400, h: 300 }); i.src = src })

export default function Pizarra({ patientId, dark, sala }: { patientId: string | null; dark: boolean; sala: string }) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [docId, setDocId] = useState('')
  const [msg, setMsg] = useState('')
  const imagenes = useCollection('documents', (d) => d.patientId === patientId && d.mime.startsWith('image/'), [patientId])

  const insertar = async () => {
    const d = imagenes.find((x) => x.id === docId)
    if (!api || !d) return
    // Excalidraw necesita un data: URL (en modo servidor el documento es /api/files/<id>)
    let dataURL: string
    try {
      dataURL = await docToDataUrl(d)
    } catch (e) {
      return setMsg('No se pudo cargar la imagen: ' + (e as Error).message)
    }
    const { w, h } = await imgSize(dataURL)
    const k = Math.min(1, 600 / Math.max(w, h))
    const fileId = 'doc-' + d.id
    api.addFiles([{ id: fileId, dataURL, mimeType: d.mime, created: Date.now() } as unknown as BinaryFileData])
    const st = api.getAppState()
    const x = -st.scrollX + st.width / 2 / st.zoom.value - (w * k) / 2
    const y = -st.scrollY + st.height / 2 / st.zoom.value - (h * k) / 2
    const [el] = convertToExcalidrawElements([{ type: 'image', fileId: fileId as never, x, y, width: w * k, height: h * k }])
    api.updateScene({ elements: [...api.getSceneElements(), el] })
    setMsg(`Imagen “${d.nombre}” insertada.`)
  }

  const guardar = async () => {
    if (!api || !patientId) return
    const elements = api.getSceneElements()
    if (!elements.length) return setMsg('La pizarra está vacía.')
    const blob = await exportToBlob({ elements, files: api.getFiles(), appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }, mimeType: 'image/png', exportPadding: 16 })
    add('documents', { patientId, tipo: 'foto', nombre: `Pizarra telemedicina ${new Date().toLocaleString('es-MX')}.png`, mime: 'image/png', dataUrl: await fileToDataUrl(blob), meta: { zona: 'Otra', nota: 'Pizarra de videoconsulta · sala ' + sala, origen: 'archivo' } })
    setMsg('Pizarra guardada en el expediente (Fotos clínicas).')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={docId} onChange={(e) => setDocId(e.target.value)} className="h-9 w-auto max-w-full flex-1 py-1 sm:max-w-sm">
          <option value="">{imagenes.length ? 'Imagen del expediente…' : 'El paciente no tiene imágenes'}</option>
          {imagenes.map((d) => <option key={d.id} value={d.id}>{d.nombre} · {fmtFecha(d.fecha)}</option>)}
        </Select>
        <Button onClick={insertar} disabled={!api || !docId}><ImagePlus className="size-4" />Insertar imagen del expediente</Button>
        <Button variant="primary" onClick={guardar} disabled={!api || !patientId}><Save className="size-4" />Guardar como imagen</Button>
      </div>
      {msg && <Notice onClose={() => setMsg('')}>{msg}</Notice>}
      <div className="h-[65vh] min-h-[420px] overflow-hidden rounded-xl border border-line">
        <Excalidraw excalidrawAPI={setApi} theme={dark ? 'dark' : 'light'} langCode="es-ES" UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }} />
      </div>
    </div>
  )
}
