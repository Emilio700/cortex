/**
 * El expediente único de un paciente (plan 32, punto 6).
 *
 * Una sola pieza para la página del expediente y para la consulta, que lo
 * reutiliza en vez de repetir sus pestañas. Qué pestañas salen lo decide el
 * servidor (`pestanas` del encabezado); cada pestaña pide sus datos solo al
 * abrirse por primera vez —un expediente con años de historia no debe tardar
 * en abrir— y se queda montada para no perder lo que se estaba viendo. La
 * pestaña activa se recuerda por paciente en este navegador.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CAlert, CButton, CSpinner } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
  cilBaby,
  cilDescription,
  cilFolderOpen,
  cilHistory,
  cilImage,
  cilNotes,
  cilPeople,
  cilShieldAlt,
  cilCloudUpload,
} from '@coreui/icons'

import { apiClient } from '../../shared/services/api'
import { useAuth } from '../../shared/context/AuthContext'
import { mensajeDeError } from '../../shared/utils/errors'
import { pedir } from '../../shared/utils/pedidos'
import { hoyLocalISO } from '../../shared/utils/date'
import { PatientHistory } from '../secretaria/components/PatientHistory'
import MedicalHistoryViewer from '../doctor/components/MedicalHistoryViewer'
import HistorialEstudios from '../doctor/components/HistorialEstudios'
import GraficaValoraciones from '../doctor/components/GraficaValoraciones'
import PatientDocuments from '../doctor/components/PatientDocuments'
import PestanaImagenes from './PestanaImagenes'
import ClinicalRecordPanel from '../doctor/components/ClinicalRecordPanel'
import EncabezadoClinico from './EncabezadoClinico'
import SubirArchivoModal from './SubirArchivoModal'
import AvisoResultadosSinOrden from './AvisoResultadosSinOrden'
import PestanaResumen from './PestanaResumen'
import { ConsentimientosDeRecepcion, EstudiosDeRecepcion } from './PestanasDeRecepcion'
import type { EncabezadoExpediente, PestanaExpediente } from './tipos'
import './expediente.css'

const PESTANAS: Record<PestanaExpediente, { nombre: string; icono: string[] }> = {
  resumen: { nombre: 'Resumen', icono: cilNotes },
  consultas: { nombre: 'Consultas', icono: cilHistory },
  estudios: { nombre: 'Estudios', icono: cilDescription },
  documentos: { nombre: 'Documentos', icono: cilFolderOpen },
  imagenes: { nombre: 'Imágenes', icono: cilImage },
  embarazo: { nombre: 'Embarazo', icono: cilBaby },
  consentimientos: { nombre: 'Consentimientos', icono: cilShieldAlt },
  equipo: { nombre: 'Equipo', icono: cilPeople },
}
const ORDEN: PestanaExpediente[] = ['resumen', 'consultas', 'estudios', 'documentos', 'imagenes', 'embarazo', 'consentimientos', 'equipo']

const llave = (patientId: number) => `gems.expediente.pestana.${patientId}`
const leerPestana = (patientId: number): PestanaExpediente | null => {
  try {
    return (window.localStorage.getItem(llave(patientId)) as PestanaExpediente | null) ?? null
  } catch {
    return null
  }
}
const guardarPestana = (patientId: number, p: PestanaExpediente) => {
  try {
    window.localStorage.setItem(llave(patientId), p)
  } catch {
    // Sin memoria entre visitas; el expediente funciona igual.
  }
}

const EVENTO = 'gems:expediente-pestana'

/** Pide que el expediente de ese paciente se abra (o cambie) en una pestaña. */
export const pedirPestanaDelExpediente = (patientId: number, pestana: PestanaExpediente) => {
  guardarPestana(patientId, pestana)
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { patientId, pestana } }))
}

interface Props {
  patientId: number
  /** Dentro de la consulta: sin «Abrir la consulta de hoy» y con la cita para los paneles. */
  appointmentId?: number
  enConsulta?: boolean
  /** Para que la página ponga el nombre en su encabezado. */
  onCargado?: (datos: EncabezadoExpediente) => void
}

export default function ExpedienteDePaciente({ patientId, appointmentId, enConsulta, onCargado }: Props) {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [datos, setDatos] = useState<EncabezadoExpediente | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activa, setActiva] = useState<PestanaExpediente>(() => leerPestana(patientId) ?? 'resumen')
  const [visitadas, setVisitadas] = useState<Set<PestanaExpediente>>(() => new Set([activa]))
  const [subiendo, setSubiendo] = useState(false)
  const [subido, setSubido] = useState<string | null>(null)
  // Cambiar la llave vuelve a montar la pestaña, que vuelve a pedir lo suyo.
  const [version, setVersion] = useState<Record<string, number>>({})
  const refrescar = (p: PestanaExpediente) => setVersion((v) => ({ ...v, [p]: (v[p] ?? 0) + 1 }))

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const { data } = await apiClient.get<EncabezadoExpediente>(`/patients/${patientId}/expediente`)
      setDatos(data)
      onCargado?.(data)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo abrir el expediente.'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])
  useEffect(() => { void cargar() }, [cargar])

  const disponibles = useMemo(() => ORDEN.filter((p) => datos?.pestanas.includes(p)), [datos])
  // Si la recordada ya no le toca a esta sesión, la primera que sí.
  const visible: PestanaExpediente = disponibles.includes(activa) ? activa : disponibles[0] ?? 'resumen'

  const abrir = (p: PestanaExpediente) => {
    setActiva(p)
    guardarPestana(patientId, p)
    setVisitadas((v) => (v.has(p) ? v : new Set(v).add(p)))
  }
  useEffect(() => {
    const alPedir = (e: Event) => {
      const { patientId: id, pestana } = (e as CustomEvent<{ patientId: number; pestana: PestanaExpediente }>).detail
      if (id === patientId) abrir(pestana)
    }
    window.addEventListener(EVENTO, alPedir)
    return () => window.removeEventListener(EVENTO, alPedir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])
  useEffect(() => {
    if (visible !== activa) setVisitadas((v) => (v.has(visible) ? v : new Set(v).add(visible)))
  }, [visible, activa])

  if (error) {
    return (
      <CAlert color="danger" className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <span>{error}</span>
        <CButton color="danger" variant="outline" size="sm" onClick={() => void cargar()}>Reintentar</CButton>
      </CAlert>
    )
  }
  if (!datos) return <div className="text-center py-5"><CSpinner color="primary" /></div>

  const clinica = datos.vista_clinica
  // El botón solo a quien puede subir algo (C7: antes se ofrecía y daba 403).
  const puedeSubir = can('documents.upload') || can('clinical_tracking.attach_result')
  const contenido = (p: PestanaExpediente) => {
    switch (p) {
      case 'resumen':
        return <PestanaResumen datos={datos} appointmentId={appointmentId} onIrA={abrir} />
      case 'consultas':
        return (
          <div className="d-flex flex-column gap-3">
            <PatientHistory patientId={patientId} />
            {can('soap_notes.read') && <MedicalHistoryViewer patientId={patientId} />}
          </div>
        )
      case 'estudios':
        return can('clinical_tracking.read') ? (
          <div className="d-flex flex-column gap-3" data-tour="expediente-estudios">
            {can('clinical_tracking.update') && (
              <AvisoResultadosSinOrden patientId={patientId} onLigado={() => refrescar('estudios')} />
            )}
            <GraficaValoraciones patientId={patientId} />
            <HistorialEstudios patientId={patientId} />
          </div>
        ) : (
          <EstudiosDeRecepcion patientId={patientId} />
        )
      case 'documentos':
        return <PatientDocuments patientId={patientId} onVerEstudios={() => abrir('estudios')} />
      case 'imagenes':
        return <PestanaImagenes patientId={patientId} appointmentId={appointmentId} />
      case 'embarazo':
        return <ClinicalRecordPanel patientId={patientId} appointmentId={appointmentId} secciones={['prenatal']} />
      case 'consentimientos':
        return can('clinical_consents.read') ? (
          <ClinicalRecordPanel patientId={patientId} secciones={['consentimientos']} />
        ) : (
          <ConsentimientosDeRecepcion patientId={patientId} />
        )
      case 'equipo':
        return <ClinicalRecordPanel patientId={patientId} ownerDoctorId={datos.owner_doctor_id} secciones={['equipo']} />
    }
  }

  return (
    <div className={`expediente ${clinica ? '' : 'expediente--recepcion'}`}>
      <EncabezadoClinico
        datos={datos}
        enConsulta={enConsulta}
        puedeAgendar={can('appointments.create')}
        onAbrirConsulta={(id) => navigate(`/doctor/consultation/${id}`)}
        onAgendar={() => {
          pedir('agenda:dia', {
            fecha: hoyLocalISO(),
            nueva: true,
            paciente: { id: datos.patient_id, first_name: datos.first_name, last_name: datos.last_name, phone: datos.phone ?? undefined },
          })
          navigate('/secretaria/agenda')
        }}
        onIrA={abrir}
      />

      <div className="expediente-pestanas" role="tablist" aria-label="Secciones del expediente" data-tour="expediente-pestanas">
        {disponibles.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            id={`expediente-tab-${p}`}
            aria-selected={visible === p}
            aria-controls={`expediente-panel-${p}`}
            tabIndex={visible === p ? 0 : -1}
            className={`expediente-pestana ${visible === p ? 'is-activa' : ''}`}
            onClick={() => abrir(p)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              const i = disponibles.indexOf(visible)
              const siguiente = disponibles[(i + (e.key === 'ArrowRight' ? 1 : -1) + disponibles.length) % disponibles.length]
              abrir(siguiente)
              document.getElementById(`expediente-tab-${siguiente}`)?.focus()
            }}
          >
            <CIcon icon={PESTANAS[p].icono} aria-hidden="true" />
            <span>{PESTANAS[p].nombre}</span>
          </button>
        ))}
      </div>

      {puedeSubir && (visible === 'estudios' || visible === 'documentos') && (
        <div className="expediente-acciones">
          {subido && (
            <span className="text-success small" role="status">{subido}</span>
          )}
          <CButton color="primary" variant="outline" onClick={() => setSubiendo(true)} data-tour="expediente-subir">
            <CIcon icon={cilCloudUpload} className="me-2" aria-hidden="true" />
            Subir archivo
          </CButton>
        </div>
      )}
      <SubirArchivoModal
        visible={subiendo}
        patientId={patientId}
        patientName={datos.nombre}
        onClose={() => setSubiendo(false)}
        onSubido={(destino, mensaje) => {
          setSubido(mensaje)
          refrescar(destino)
          abrir(destino)
        }}
      />

      {disponibles.map((p) =>
        visitadas.has(p) || visible === p ? (
          <div
            key={`${p}-${version[p] ?? 0}`}
            id={`expediente-panel-${p}`}
            role="tabpanel"
            aria-labelledby={`expediente-tab-${p}`}
            hidden={visible !== p}
            className="expediente-panel"
          >
            {contenido(p)}
          </div>
        ) : null,
      )}
    </div>
  )
}
