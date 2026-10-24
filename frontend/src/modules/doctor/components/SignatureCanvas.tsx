import { useEffect, useRef, useState } from 'react'
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilReload } from '@coreui/icons'

interface SignatureCanvasProps { onChange: (signature: string | null) => void; disabled?: boolean }

const SignatureCanvas = ({ onChange, disabled = false }: SignatureCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const hasSignatureRef = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      const previous = document.createElement('canvas')
      previous.width = canvas.width
      previous.height = canvas.height
      if (hasSignatureRef.current) previous.getContext('2d')?.drawImage(canvas, 0, 0)
      canvas.width = Math.max(1, Math.floor(rect.width * ratio))
      canvas.height = Math.max(1, Math.floor(rect.height * ratio))
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(ratio, ratio); context.lineWidth = 2.2; context.lineCap = 'round'; context.strokeStyle = '#17365d'
      if (hasSignatureRef.current) {
        context.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, rect.width, rect.height)
        onChange(canvas.toDataURL('image/png'))
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('orientationchange', resize)
    return () => { observer.disconnect(); window.removeEventListener('orientationchange', resize) }
  }, [onChange])

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !event.isPrimary) return
    const context = canvasRef.current?.getContext('2d'); if (!context) return
    const point = position(event); drawingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); context.beginPath(); context.moveTo(point.x, point.y)
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return
    const context = canvasRef.current?.getContext('2d'); if (!context) return
    const point = position(event); context.lineTo(point.x, point.y); context.stroke()
    if (!hasSignatureRef.current) { hasSignatureRef.current = true; setHasSignature(true) }
  }
  const end = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    onChange(canvasRef.current?.toDataURL('image/png') ?? null)
  }
  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const context = canvas.getContext('2d'); if (!context) return
    context.save(); context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height); context.restore()
    hasSignatureRef.current = false; setHasSignature(false); onChange(null)
  }

  return <div className="border rounded bg-white p-2">
    <canvas ref={canvasRef} className="w-100" style={{ height: 160, touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={end} aria-label="Área para firma de la paciente" />
    <div className="d-flex justify-content-between align-items-center border-top pt-2"><small className="text-body-secondary">La paciente puede firmar directamente en esta pantalla.</small><CButton size="sm" color="secondary" variant="ghost" onClick={clear} disabled={disabled || !hasSignature}><CIcon icon={cilReload} className="me-1" />Limpiar</CButton></div>
  </div>
}

export default SignatureCanvas
