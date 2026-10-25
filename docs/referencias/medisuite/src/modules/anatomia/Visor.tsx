import { createElement, useEffect, useRef, useState } from 'react'
import { Box, Smartphone, Upload } from 'lucide-react'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { Card, Button, Notice } from '../../components/ui'
import { crearManiqui } from './maniqui'

export default function Visor() {
  const [listo, setListo] = useState(false)
  const [src, setSrc] = useState<{ url: string; nombre: string } | null>(null)
  const [error, setError] = useState('')
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    import('@google/model-viewer').then(() => setListo(true)).catch((e) => setError('No se pudo cargar el visor: ' + e.message))
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])
  const usar = (blob: Blob, nombre: string) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = URL.createObjectURL(blob)
    setSrc({ url: urlRef.current, nombre })
    setError('')
  }
  function archivo(f?: File) {
    if (!f) return
    if (!/\.(glb|gltf)$/i.test(f.name)) return setError('Selecciona un archivo .glb o .gltf')
    usar(f, f.name)
  }
  function demo() {
    new GLTFExporter().parse(crearManiqui(), (r) => usar(new Blob([r as ArrayBuffer], { type: 'model/gltf-binary' }), 'maniqui-medisuite.glb'), (e) => setError(String(e)), { binary: true })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-2.5 text-xs font-medium text-white hover:bg-brand-strong dark:text-black">
            <Upload className="size-4" /> Abrir .glb / .gltf
            <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" className="hidden" onChange={(e) => archivo(e.target.files?.[0])} />
          </label>
          <Button size="sm" onClick={demo}><Box className="size-4" /> Maniquí de ejemplo</Button>
          {src && <span className="truncate text-xs text-muted">{src.nombre}</span>}
        </div>
        {error && <div className="p-3"><Notice tone="warn">{error}</Notice></div>}
        <div
          className="relative h-[460px] bg-gradient-to-b from-surface to-surface-2 sm:h-[600px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => (e.preventDefault(), archivo(e.dataTransfer.files[0]))}
        >
          {src && listo ? (
            createElement(
              'model-viewer',
              // Web component: atributos en minúsculas; se usa createElement para no declarar un JSX global.
              { key: src.url, src: src.url, alt: 'Modelo 3D', 'camera-controls': '', 'auto-rotate': '', ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'shadow-intensity': '1', exposure: '1', style: { width: '100%', height: '100%' } },
              <button slot="ar-button" className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white shadow dark:text-black">
                <Smartphone className="size-4" /> Ver en tu espacio (RA)
              </button>,
            )
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">
              {listo ? 'Arrastra aquí un modelo .glb/.gltf o carga el maniquí de ejemplo.' : 'Cargando visor…'}
            </div>
          )}
        </div>
      </Card>
      <Card title="Visor 3D y realidad aumentada">
        <div className="space-y-3 text-sm">
          <p>Abre un modelo anatómico en formato <b>glTF binario (.glb)</b> o <b>.gltf autocontenido</b> (texturas embebidas). El archivo se abre localmente en el navegador; no se sube a ningún servidor.</p>
          <p>Gíralo con el dedo o el ratón y acércalo con pellizco o rueda. En un teléfono compatible aparece el botón <b>“Ver en tu espacio”</b> para colocar el modelo sobre la mesa con realidad aumentada (WebXR en Chrome Android; Quick Look en iPhone/iPad).</p>
          <p className="text-xs text-muted">Scene Viewer de Android necesita que el modelo esté en una URL pública con HTTPS; con archivos locales se usa WebXR. La RA requiere servir la app por HTTPS.</p>
          <div className="rounded-lg bg-surface-2 p-3 text-xs">
            <b>Modelos anatómicos libres:</b> Z-Anatomy y BodyParts3D (licencia CC BY-SA) pueden exportarse a GLB con Blender (Archivo → Exportar → glTF 2.0). Respeta la atribución y la licencia al compartirlos con pacientes.
          </div>
        </div>
      </Card>
    </div>
  )
}
