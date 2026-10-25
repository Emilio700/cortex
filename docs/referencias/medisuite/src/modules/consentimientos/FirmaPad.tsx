// Lienzo de firma con signature_pad: escala por devicePixelRatio y conserva el trazo al redimensionar.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { Eraser } from 'lucide-react'
import { Button } from '../../components/ui'

export interface FirmaHandle {
  isEmpty: () => boolean
  toPNG: () => string
  clear: () => void
}

export const FirmaPad = forwardRef<FirmaHandle, { label: string; onChange?: (vacia: boolean) => void }>(function FirmaPad({ label, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pad = useRef<SignaturePad | null>(null)
  const [vacia, setVacia] = useState(true)
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    const c = canvas.current!
    const sp = new SignaturePad(c, { penColor: '#0b1f4a', minWidth: 0.8, maxWidth: 2.6, backgroundColor: 'rgba(0,0,0,0)' })
    pad.current = sp
    const marcar = () => {
      const v = sp.isEmpty()
      setVacia(v)
      cb.current?.(v)
    }
    sp.addEventListener('endStroke', marcar)
    const ajustar = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const w = c.offsetWidth
      const h = c.offsetHeight
      if (!w || (c.width === w * ratio && c.height === h * ratio)) return
      const datos = sp.toData()
      c.width = w * ratio
      c.height = h * ratio
      c.getContext('2d')!.scale(ratio, ratio)
      sp.clear()
      if (datos.length) sp.fromData(datos) // redibuja el trazo vectorial sin perderlo
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(c)
    return () => {
      ro.disconnect()
      sp.removeEventListener('endStroke', marcar)
      sp.off()
    }
  }, [])

  const clear = () => {
    pad.current?.clear()
    setVacia(true)
    cb.current?.(true)
  }
  useImperativeHandle(ref, () => ({
    isEmpty: () => pad.current?.isEmpty() ?? true,
    toPNG: () => pad.current!.toDataURL('image/png'),
    clear,
  }))

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <Button size="sm" variant="ghost" onClick={clear} disabled={vacia}>
          <Eraser className="size-3.5" /> Borrar
        </Button>
      </div>
      <div className="relative rounded-lg border border-line bg-white">
        <canvas ref={canvas} className="block h-36 w-full touch-none rounded-lg" />
        <div className="pointer-events-none absolute inset-x-6 bottom-7 border-b border-dashed border-gray-300" />
        {vacia && <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-gray-400">Firme aquí</span>}
      </div>
    </div>
  )
})
