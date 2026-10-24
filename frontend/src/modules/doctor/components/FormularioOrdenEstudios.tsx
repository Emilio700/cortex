/**
 * Alta de órdenes de estudios, suelta o agrupada (O-02).
 *
 * Antes cada estudio era una orden a mano, una por una. Aquí el médico arma
 * una lista de estudios y los emite juntos: si es uno solo sigue siendo una
 * orden suelta (`POST /orders`, la de siempre); si son varios se crea una
 * orden agrupada (`POST /order-groups`), un solo papel para el paciente aunque
 * cada estudio conserve su estado y su resultado.
 *
 * Regla de oro (plan 22): sólo se dice «creada» cuando el servidor devuelve el
 * 201; mientras tanto no hay aviso de éxito. Si algo falla, se muestra el
 * motivo del servidor tal cual y la lista de estudios no se pierde.
 */
import { useState, type FormEvent } from 'react'
import {
  CAlert,
  CButton,
  CCol,
  CForm,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormTextarea,
  CListGroup,
  CListGroupItem,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilTrash } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import SelectorEstudio, { seleccionVacia } from './SelectorEstudio'
import BotonesOrdenPdf from './BotonesOrdenPdf'
import BotonesOrdenAgrupadaPdf from './BotonesOrdenAgrupadaPdf'
import {
  seleccionCompleta,
  sitioAnatomico,
  textoEstudio,
  type SeleccionEstudio,
} from '../utils/catalogoEstudios'
import { usePlantillasOrden } from '../hooks/usePlantillasOrden'
import type { DiagnosticOrder, DiagnosticOrderGroup } from '../types/clinicalTracking'
import { hoyLocalISO } from '../../../shared/utils/date'
import { TIPOS_DE_ESTUDIO, etiquetaPrioridad } from '../utils/etiquetasOrden'

interface Props {
  patientId: number
  appointmentId: number
  /** `{ pregnancy_id }` si la consulta se ligó al embarazo activo; si no, `{}`. */
  pregnancyContext: Record<string, number>
  /** Se llama tras crear la orden, para recargar el resumen del plan clínico. */
  onCreated: () => void
}

/**
 * Un estudio ya agregado a la orden que se está armando. Guarda los campos
 * finales (no la selección del catálogo) para que una plantilla (O-03) pueda
 * cargar sus estudios con su código y su muestra tal cual.
 */
interface EstudioLote {
  key: number
  category: string
  study_name: string
  catalog_code?: string | null
  specimen_or_body_site?: string | null
  preparation: string
  /** Prioridad propia de este estudio; '' = la del lote (plan 26, D-10). */
  priority: string
}

/** Lo que se muestra tras crear: un lote agrupado o una sola orden suelta. */
type Resultado =
  | { tipo: 'grupo'; group: DiagnosticOrderGroup }
  | { tipo: 'suelta'; order: DiagnosticOrder }

const categoriaVacia = 'laboratory'

const FormularioOrdenEstudios = ({
  patientId,
  appointmentId,
  pregnancyContext,
  onCreated,
}: Props) => {
  const [category, setCategory] = useState(categoriaVacia)
  const [estudio, setEstudio] = useState<SeleccionEstudio>(seleccionVacia())
  const [preparation, setPreparation] = useState('')
  const [prioridadEstudio, setPrioridadEstudio] = useState('')
  const [lote, setLote] = useState<EstudioLote[]>([])
  const [clinicalIndication, setClinicalIndication] = useState('')
  const [priority, setPriority] = useState('routine')
  const [desiredOn, setDesiredOn] = useState('')
  const [destination, setDestination] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  // Errores junto al campo (`noValidate`): se revisan en el submit y cada
  // aviso se pinta debajo del campo que lo causó, en vez del globo del navegador.
  const [errores, setErrores] = useState<{
    indicacion?: string
    estudioManual?: string
    estudioRegion?: string
  }>({})
  const limpiarError = (campo: keyof typeof errores) =>
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
  // O-03: plantillas que precargan estudios. Sólo el médico ve este formulario.
  const { plantillas, cargarDetalle } = usePlantillasOrden(true)
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false)
  const [avisoPlantilla, setAvisoPlantilla] = useState<string | null>(null)

  // La selección en curso, si ya está completa, cuenta como un estudio más al
  // emitir: así una sola orden no obliga a pulsar «Agregar» antes de crearla.
  const enCurso: EstudioLote | null = seleccionCompleta(estudio)
    ? {
        key: -1,
        category,
        study_name: textoEstudio(estudio),
        catalog_code: estudio.grupo?.clave || null,
        specimen_or_body_site: sitioAnatomico(estudio) || null,
        preparation,
        priority: prioridadEstudio,
      }
    : null
  const efectivos = [...lote, ...(enCurso ? [enCurso] : [])]

  const limpiarErroresDelSelector = () =>
    setErrores((prev) =>
      prev.estudioManual || prev.estudioRegion
        ? { ...prev, estudioManual: undefined, estudioRegion: undefined }
        : prev,
    )

  const limpiarSeleccion = () => {
    setEstudio(seleccionVacia())
    setCategory(categoriaVacia)
    setPreparation('')
    setPrioridadEstudio('')
    limpiarErroresDelSelector()
  }

  /** El aviso del selector se retira en cuanto se toca la selección. */
  const cambiarSeleccion = (nueva: SeleccionEstudio) => {
    setEstudio(nueva)
    limpiarErroresDelSelector()
  }

  const agregar = () => {
    if (!enCurso) return
    setLote((v) => [...v, { ...enCurso, key: Date.now() + v.length }])
    limpiarSeleccion()
  }

  const quitar = (key: number) => setLote((v) => v.filter((e) => e.key !== key))

  /**
   * O-03: al elegir una plantilla, copia sus estudios al lote y su indicación
   * sugerida a la indicación (si está vacía). No crea nada: el médico revisa,
   * edita y confirma con el botón de siempre.
   */
  const aplicarPlantilla = async (clave: string) => {
    if (!clave) return
    setCargandoPlantilla(true)
    setError(null)
    try {
      const detalle = await cargarDetalle(clave)
      const base = Date.now()
      setLote((v) => [
        ...v,
        ...detalle.estudios.map((e, i) => ({
          key: base + i,
          category: e.category,
          study_name: e.study_name,
          catalog_code: e.catalog_code ?? null,
          specimen_or_body_site: e.specimen_or_body_site ?? null,
          preparation: e.preparation_instructions ?? '',
          priority: '',
        })),
      ])
      setClinicalIndication((actual) => actual.trim() || detalle.indicacion_sugerida)
      limpiarError('indicacion')
      setResultado(null)
      setAvisoPlantilla(
        `Se agregaron ${detalle.estudios.length} estudios de «${detalle.nombre}». Revísalos y edítalos antes de crear la orden.`,
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargandoPlantilla(false)
    }
  }

  const reiniciar = () => {
    setLote([])
    limpiarSeleccion()
    setClinicalIndication('')
    setPriority('routine')
    setDesiredOn('')
    setDestination('')
    setAvisoPlantilla(null)
    setErrores({})
  }

  const cuerpoEstudio = (e: EstudioLote) => ({
    category: e.category,
    study_name: e.study_name,
    catalog_code: e.catalog_code || undefined,
    specimen_or_body_site: e.specimen_or_body_site || undefined,
    preparation_instructions: e.preparation || undefined,
    // Sin prioridad propia, el servidor le pone la del lote.
    ...(e.priority ? { priority: e.priority } : {}),
  })

  const emitir = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Con `noValidate` el navegador ya no enseña su globo: lo que falta se dice
    // junto al campo y no viaja al servidor (su 422 llegaría hasta arriba de la
    // pantalla, lejos del campo que lo causó). Se espejan sus reglas: indicación
    // obligatoria de 2+ letras y `study_name` de 2+ letras.
    const faltas: typeof errores = {}
    const indicacion = clinicalIndication.trim()
    if (!indicacion) faltas.indicacion = 'Escribe la indicación clínica.'
    else if (indicacion.length < 2)
      faltas.indicacion = 'La indicación clínica necesita al menos 2 letras.'
    if (estudio.manual !== undefined) {
      const manual = estudio.manual.trim()
      if (!manual) faltas.estudioManual = 'Escribe el estudio que necesitas.'
      else if (manual.length < 2)
        faltas.estudioManual = 'El estudio necesita al menos 2 letras.'
    } else if (estudio.grupo?.requiere_region && !(estudio.region || '').trim()) {
      faltas.estudioRegion = 'Indica la región a estudiar.'
    }
    if (Object.keys(faltas).length > 0) {
      setErrores(faltas)
      return
    }
    setErrores({})
    if (efectivos.length === 0) {
      setError('Agrega al menos un estudio a la orden.')
      return
    }
    setSaving(true)
    setError(null)
    setResultado(null)
    try {
      if (efectivos.length === 1) {
        const e = efectivos[0]
        const { data } = await apiClient.post<DiagnosticOrder>('/clinical-tracking/orders', {
          patient_id: patientId,
          appointment_id: appointmentId,
          ...pregnancyContext,
          requested_on: hoyLocalISO(),
          clinical_indication: clinicalIndication,
          priority: e.priority || priority,
          desired_on: desiredOn || undefined,
          destination: destination || undefined,
          ...cuerpoEstudio(e),
        })
        setResultado({ tipo: 'suelta', order: data })
      } else {
        const { data } = await apiClient.post<DiagnosticOrderGroup>(
          '/clinical-tracking/order-groups',
          {
            patient_id: patientId,
            appointment_id: appointmentId,
            ...pregnancyContext,
            clinical_indication: clinicalIndication,
            priority,
            requested_on: hoyLocalISO(),
            desired_on: desiredOn || undefined,
            destination: destination || undefined,
            studies: efectivos.map(cuerpoEstudio),
          },
        )
        setResultado({ tipo: 'grupo', group: data })
      }
      reiniciar()
      onCreated()
    } catch (requestError) {
      setError(mensajeDeError(requestError, 'No fue posible crear la orden de estudios.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <CForm onSubmit={(event) => void emitir(event)} noValidate>
      {error && (
        <CAlert color="danger" dismissible onClose={() => setError(null)}>
          {error}
        </CAlert>
      )}
      {plantillas.length > 0 && (
        <div className="mb-3">
          <CFormLabel htmlFor="orden-plantilla">Usar una plantilla (opcional)</CFormLabel>
          <CFormSelect
            id="orden-plantilla"
            value=""
            disabled={saving || cargandoPlantilla}
            onChange={(e) => void aplicarPlantilla(e.target.value)}
          >
            <option value="">Elige una plantilla para precargar estudios…</option>
            {plantillas.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.nombre} ({p.num_estudios} estudios)
              </option>
            ))}
          </CFormSelect>
          {avisoPlantilla && <div className="form-text text-success">{avisoPlantilla}</div>}
        </div>
      )}
      <CRow className="g-2">
        <CCol md={12}>
          <CFormTextarea
            rows={2}
            id="orden-indicacion-clinica"
            label="Indicación clínica"
            value={clinicalIndication}
            onChange={(e) => {
              setClinicalIndication(e.target.value)
              limpiarError('indicacion')
            }}
            invalid={Boolean(errores.indicacion)}
            aria-invalid={Boolean(errores.indicacion) || undefined}
            aria-describedby={errores.indicacion ? 'error-orden-indicacion' : undefined}
          />
          <ErrorDeCampo id="error-orden-indicacion" mensaje={errores.indicacion} />
          <div className="form-text">Común a todos los estudios de esta orden.</div>
        </CCol>
        <CCol md={6}>
          <CFormLabel>Prioridad de la orden</CFormLabel>
          <CFormSelect value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="routine">Rutinaria</option>
            <option value="preferential">Preferente</option>
            <option value="urgent">Urgente</option>
          </CFormSelect>
        </CCol>
        <CCol md={6}>
          <CFormLabel>Fecha deseada</CFormLabel>
          <CFormInput
            type="date"
            min={hoyLocalISO()}
            value={desiredOn}
            onChange={(e) => setDesiredOn(e.target.value)}
          />
        </CCol>
        <CCol md={12}>
          <CFormLabel htmlFor="orden-destino">Destino (opcional)</CFormLabel>
          <CFormInput
            id="orden-destino"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Ej. Laboratorio Central"
            aria-describedby="orden-destino-ayuda"
          />
          {/* En el papel salía «Destino: USG MAMA» repetido del estudio (P-8). */}
          <div id="orden-destino-ayuda" className="form-text">
            Laboratorio, gabinete o centro donde se realizará (no el nombre del estudio).
          </div>
        </CCol>
      </CRow>

      {lote.length > 0 && (
        <div className="mt-3">
          <div className="small fw-semibold mb-1">Estudios en esta orden ({lote.length})</div>
          <CListGroup>
            {lote.map((e) => (
              <CListGroupItem
                key={e.key}
                className="d-flex justify-content-between align-items-start gap-2 py-2"
              >
                <span className="small">
                  <strong>{e.study_name}</strong>
                  {e.priority && (
                    <span className="badge text-bg-warning ms-2">
                      {etiquetaPrioridad(e.priority)}
                    </span>
                  )}
                  {e.preparation && <span className="text-body-secondary"> · {e.preparation}</span>}
                </span>
                <CButton
                  size="sm"
                  color="danger"
                  variant="ghost"
                  className="p-1"
                  aria-label={`Quitar ${e.study_name} de la orden`}
                  onClick={() => quitar(e.key)}
                >
                  <CIcon icon={cilTrash} />
                </CButton>
              </CListGroupItem>
            ))}
          </CListGroup>
        </div>
      )}

      <div className="border rounded p-2 mt-3">
        <div className="small fw-semibold mb-2">Agregar un estudio</div>
        <CRow className="g-2">
          <CCol md={12}>
            <CFormLabel>Tipo</CFormLabel>
            <CFormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
              {TIPOS_DE_ESTUDIO.map(({ valor, etiqueta }) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </CFormSelect>
          </CCol>
          <CCol md={12}>
            <SelectorEstudio
              seleccion={estudio}
              onChange={cambiarSeleccion}
              disabled={saving}
              errores={{ manual: errores.estudioManual, region: errores.estudioRegion }}
            />
          </CCol>
          <CCol md={12}>
            <CFormLabel htmlFor="orden-prioridad-estudio">
              Prioridad de este estudio (opcional)
            </CFormLabel>
            <CFormSelect
              id="orden-prioridad-estudio"
              value={prioridadEstudio}
              onChange={(e) => setPrioridadEstudio(e.target.value)}
              data-tour="orden-prioridad-estudio"
            >
              <option value="">La de la orden</option>
              <option value="routine">Rutinaria</option>
              <option value="preferential">Preferente</option>
              <option value="urgent">Urgente</option>
            </CFormSelect>
            <div className="form-text">
              Para que, por ejemplo, la resonancia vaya antes que los laboratorios.
            </div>
          </CCol>
          <CCol md={12}>
            <CFormLabel>Preparación</CFormLabel>
            <CFormTextarea
              rows={2}
              value={preparation}
              onChange={(e) => setPreparation(e.target.value)}
              placeholder="Ayuno, vejiga llena… (de este estudio)"
            />
          </CCol>
        </CRow>
        <CButton
          className="mt-2"
          size="sm"
          color="secondary"
          variant="outline"
          disabled={saving || !seleccionCompleta(estudio)}
          onClick={agregar}
        >
          <CIcon icon={cilPlus} className="me-1" />
          Agregar otro estudio
        </CButton>
      </div>

      <CButton
        className="mt-3"
        type="submit"
        size="sm"
        color="primary"
        disabled={saving || efectivos.length === 0}
      >
        {saving ? (
          <CSpinner size="sm" />
        ) : efectivos.length > 1 ? (
          `Crear orden con ${efectivos.length} estudios`
        ) : (
          'Crear orden'
        )}
      </CButton>

      {resultado?.tipo === 'suelta' && (
        <CAlert color="success" className="mt-3">
          <div className="fw-semibold">Orden creada.</div>
          <div className="small mt-1">
            {resultado.order.study_name} · Orden n.º {resultado.order.id}
          </div>
          <BotonesOrdenPdf orderId={resultado.order.id} status={resultado.order.status} />
        </CAlert>
      )}
      {resultado?.tipo === 'grupo' && (
        <CAlert color="success" className="mt-3">
          <div className="fw-semibold">
            {/* Sin folio aquí: el papel recibe su folio homologado (ORD) al
                generarse, no al crear el lote (plan 32). */}
            Orden agrupada creada con {resultado.group.orders.length} estudios.
          </div>
          <div className="small mt-1">
            {resultado.group.orders.map((orden) => orden.study_name).join(' · ')}
          </div>
          {/* Una sola acción de impresión: el papel del lote, no una hoja por estudio (C-3). */}
          <div className="mt-2">
            <BotonesOrdenAgrupadaPdf
              groupId={resultado.group.id}
              numEstudios={resultado.group.orders.length}
              orderIds={resultado.group.orders.map((o) => o.id)}
            />
          </div>
        </CAlert>
      )}
    </CForm>
  )
}

export default FormularioOrdenEstudios
