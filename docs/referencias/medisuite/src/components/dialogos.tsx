// Diálogos de confirmación y de texto que reemplazan a confirm()/prompt() nativos
// (bloqueados en iframes con sandbox y poco accesibles). Montar <Dialogos /> una vez en la app.
//   if (!(await confirmar('¿Eliminar esta cita?', { peligro: true }))) return
//   const texto = await pedirTexto('Texto de la anotación')
import { useState, useSyncExternalStore } from 'react'
import { Button, Input, Modal } from './ui'

interface Pendiente {
  tipo: 'confirmar' | 'texto'
  mensaje: string
  titulo: string
  aceptar: string
  peligro: boolean
  valor: string
  resolver: (v: boolean | string | null) => void
}

let actual: Pendiente | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function abrir(p: Omit<Pendiente, 'resolver'>) {
  // si ya hay uno abierto, se cancela para no dejar promesas colgadas
  actual?.resolver(actual.tipo === 'confirmar' ? false : null)
  return new Promise<boolean | string | null>((resolver) => {
    actual = { ...p, resolver }
    emit()
  })
}

export function confirmar(mensaje: string, opts: { titulo?: string; aceptar?: string; peligro?: boolean } = {}): Promise<boolean> {
  return abrir({
    tipo: 'confirmar',
    mensaje,
    titulo: opts.titulo ?? 'Confirmar',
    aceptar: opts.aceptar ?? (opts.peligro ? 'Eliminar' : 'Aceptar'),
    peligro: opts.peligro ?? false,
    valor: '',
  }) as Promise<boolean>
}

export function pedirTexto(mensaje: string, opts: { titulo?: string; inicial?: string; aceptar?: string } = {}): Promise<string | null> {
  return abrir({ tipo: 'texto', mensaje, titulo: opts.titulo ?? mensaje, aceptar: opts.aceptar ?? 'Aceptar', peligro: false, valor: opts.inicial ?? '' }) as Promise<
    string | null
  >
}

function cerrar(v: boolean | string | null) {
  const p = actual
  actual = null
  emit()
  p?.resolver(v)
}

export function Dialogos() {
  const p = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => actual,
  )
  const [texto, setTexto] = useState('')
  const [abiertoPara, setAbiertoPara] = useState<Pendiente | null>(null)
  if (p !== abiertoPara) {
    setAbiertoPara(p)
    setTexto(p?.valor ?? '')
  }
  if (!p) return null
  const cancelar = () => cerrar(p.tipo === 'confirmar' ? false : null)
  return (
    <Modal open onClose={cancelar} title={p.titulo}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          cerrar(p.tipo === 'confirmar' ? true : texto)
        }}
      >
        <p className="whitespace-pre-line text-sm">{p.mensaje}</p>
        {p.tipo === 'texto' && <Input autoFocus aria-label={p.mensaje} className="mt-3" value={texto} onChange={(e) => setTexto(e.target.value)} />}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" onClick={cancelar}>
            Cancelar
          </Button>
          <Button type="submit" variant={p.peligro ? 'danger' : 'primary'} autoFocus={p.tipo === 'confirmar'}>
            {p.aceptar}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
