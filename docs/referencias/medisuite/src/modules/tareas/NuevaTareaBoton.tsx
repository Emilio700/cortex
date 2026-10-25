// Botón reutilizable para crear una tarea del equipo desde cualquier módulo.
//
//   import { NuevaTareaBoton } from '../tareas/NuevaTareaBoton'
//   <NuevaTareaBoton patientId={id} titulo="Llamar para entregar resultados" etiquetas={['resultado-pendiente']} />
import { useState } from 'react'
import { ListPlus } from 'lucide-react'
import { Button } from '../../components/ui'
import { useCanRegistro } from '../../lib/registros'
import { TareaModal, type TareaInicial } from './TareaModal'

export function NuevaTareaBoton({
  label = 'Nueva tarea',
  variant = 'secondary',
  size = 'md',
  ...inicial
}: TareaInicial & {
  label?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const puede = useCanRegistro('tarea', 'write')
  if (!puede) return null
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <ListPlus className="size-4" /> {label}
      </Button>
      <TareaModal open={open} onClose={() => setOpen(false)} inicial={inicial} />
    </>
  )
}

export default NuevaTareaBoton
