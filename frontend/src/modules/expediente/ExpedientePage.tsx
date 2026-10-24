/**
 * La página del expediente único (plan 32, punto 6): un solo destino para
 * todos los roles. Se llega desde Pacientes, el buscador del encabezado, la
 * Agenda, Mis Consultas y Órdenes y resultados; no tiene entrada en el menú
 * porque siempre es de una paciente.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { cilFolderOpen } from '@coreui/icons'
import { CButton } from '@coreui/react-pro'

import { EncabezadoPantalla } from '../../shared/components/EncabezadoPantalla'
import ExpedienteDePaciente from './ExpedienteDePaciente'
import ResumenClinicoModal from '../doctor/components/ResumenClinicoModal'
import { useAuth } from '../../shared/context/AuthContext'
import { Role } from '../../shared/types'

export { rutaDelExpediente } from './rutas'

export default function ExpedientePage() {
  const { patientId } = useParams<{ patientId: string }>()
  const [nombre, setNombre] = useState<string | null>(null)
  const id = Number(patientId)
  const [resumenAbierto, setResumenAbierto] = useState(false)
  const { user, can } = useAuth()
  // Lo emite la doctora con permiso clínico, lo mismo que exige el servidor:
  // el papel lleva su membrete y su firma (plan 32, punto 8).
  const puedeResumen = user?.role === Role.DOCTOR && can('soap_notes.read') && Number.isFinite(id) && id > 0
  return (
    <div className="px-0">
      <EncabezadoPantalla
        titulo={nombre ? `Expediente de ${nombre}` : 'Expediente'}
        descripcion="Todo lo de la paciente, en un solo lugar."
        icono={cilFolderOpen}
        padre={{ nombre: 'Pacientes', ruta: '/secretaria/pacientes' }}
        className="mb-3"
        acciones={puedeResumen ? (
          <CButton color="primary" variant="outline" onClick={() => setResumenAbierto(true)} data-tour="expediente-resumen">
            Resumen clínico
          </CButton>
        ) : undefined}
      />
      {Number.isFinite(id) && id > 0 ? (
        <ExpedienteDePaciente patientId={id} onCargado={(d) => setNombre(d.nombre)} />
      ) : (
        <div className="alert alert-danger" role="alert">El enlace no dice de qué paciente es el expediente.</div>
      )}
      {puedeResumen && (
        <ResumenClinicoModal visible={resumenAbierto} onClose={() => setResumenAbierto(false)}
          patientId={id} patientName={nombre ?? 'la paciente'} />
      )}
    </div>
  )
}
