/**
 * Botón que abre la vista previa de un papel de órdenes (plan 26, D-2).
 *
 * Todos los «Imprimir…» de órdenes pasan por aquí: ninguno imprime directo.
 * Quién lo ve lo decide `clinical_tracking.print_order`, el mismo permiso que
 * exige el servidor.
 */
import { useState } from 'react'
import { CButton } from '@coreui/react-pro'
import { useAuth } from '../../../shared/context/AuthContext'
import VistaPreviaOrden from './VistaPreviaOrden'
import type { ModoImpresion, PdfConOrdenes } from '../utils/ordenEstudioPdf'

interface Props {
  etiqueta: string
  titulo: string
  nombreArchivo: string
  obtener: (modo?: ModoImpresion | null) => Promise<Blob | PdfConOrdenes>
  conModo?: boolean
  color?: string
  variant?: 'outline' | 'ghost'
  size?: 'sm' | 'lg'
  className?: string
  dataTour?: string
  orderIds?: number[]
  folio?: string
}

const BotonVistaPreviaOrden = ({
  etiqueta,
  titulo,
  nombreArchivo,
  obtener,
  conModo = false,
  color = 'primary',
  variant,
  size = 'sm',
  className,
  dataTour,
  orderIds,
  folio,
}: Props) => {
  const { can } = useAuth()
  const [abierta, setAbierta] = useState(false)
  if (!can('clinical_tracking.print_order')) return null
  return (
    <>
      <CButton
        size={size}
        color={color}
        variant={variant}
        className={className}
        data-tour={dataTour}
        onClick={() => setAbierta(true)}
      >
        {etiqueta}
      </CButton>
      <VistaPreviaOrden
        visible={abierta}
        onClose={() => setAbierta(false)}
        titulo={titulo}
        nombreArchivo={nombreArchivo}
        obtener={obtener}
        conModo={conModo}
        orderIds={orderIds}
        folio={folio}
      />
    </>
  )
}

export default BotonVistaPreviaOrden
