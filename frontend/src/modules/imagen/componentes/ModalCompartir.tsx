/**
 * Compartir el estudio: la hoja en PDF y el enlace temporal.
 *
 * Dos caminos con riesgos distintos:
 *
 * - **Hoja en PDF** (cortes clave con captura): sale del consultorio como un
 *   archivo; puede ir sin el nombre del paciente.
 * - **Enlace temporal**: para que un colega vea el estudio sin entrar al sistema.
 *   Se ve **sin identidad** (el servidor limpia los archivos), vence solo (máximo
 *   una semana), se puede revocar y exige confirmar el consentimiento del
 *   paciente, que queda registrado. El enlace completo se muestra **una sola
 *   vez**: en el servidor sólo queda su huella, así que si se pierde se revoca y
 *   se crea otro.
 *
 * Nada dice «enlace creado» ni «revocado» hasta que el servidor lo confirmó.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CFormCheck,
  CFormInput,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'

import {
  DURACIONES_DE_ENLACE,
  DURACION_POR_OMISION,
  estadoDeEnlace,
  textoDeAccesos,
  textoDeVencimiento,
  urlDelEnlace,
  type EnlaceCompartido,
  type EnlaceCreado,
} from '../dominio/compartir'
import { mensajeDeFallo } from '../servicios/mensajes'
import { enlacesApi } from '../servicios/estudiosApi'

interface Props {
  visible: boolean
  onClose: () => void
  estudioId: number
  cortesConCaptura: number
  onAbrirCaptura: () => void
  onHojaEnPdf: (opciones: { anonimo: boolean }) => Promise<void>
  /** Resultado de la última hoja pedida (la página la descarga y lo dice). */
  avisoPdf?: { tono: 'ok' | 'error'; texto: string } | null
}

async function copiarTexto(texto: string): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    throw new Error('Este navegador no permite copiar. Selecciona el enlace y cópialo a mano.')
  }
  await navigator.clipboard.writeText(texto)
}

export default function ModalCompartir({
  visible,
  onClose,
  estudioId,
  cortesConCaptura,
  onAbrirCaptura,
  onHojaEnPdf,
  avisoPdf,
}: Props) {
  const [anonimo, setAnonimo] = useState(true)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [horas, setHoras] = useState(DURACION_POR_OMISION)
  const [nota, setNota] = useState('')
  const [consentimiento, setConsentimiento] = useState(false)
  const [creando, setCreando] = useState(false)
  const [creado, setCreado] = useState<EnlaceCreado | null>(null)
  const [enlaces, setEnlaces] = useState<EnlaceCompartido[]>([])
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)

  const cargarEnlaces = useCallback(async () => {
    setCargando(true)
    try {
      setEnlaces(await enlacesApi.listar(estudioId))
    } catch (fallo) {
      setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
    } finally {
      setCargando(false)
    }
  }, [estudioId])

  useEffect(() => {
    if (!visible) {
      // Al cerrar se olvida el enlace completo: no se vuelve a mostrar.
      setCreado(null)
      setConsentimiento(false)
      setNota('')
      setAviso(null)
      return
    }
    void cargarEnlaces()
  }, [visible, cargarEnlaces])

  const crear = async () => {
    setCreando(true)
    setAviso(null)
    try {
      const respuesta = await enlacesApi.crear(estudioId, {
        hours: horas,
        note: nota.trim() || null,
        consent_confirmed: consentimiento,
      })
      setCreado(respuesta)
      setConsentimiento(false)
      setNota('')
      await cargarEnlaces()
    } catch (fallo) {
      setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
    } finally {
      setCreando(false)
    }
  }

  const revocar = async (enlace: EnlaceCompartido) => {
    try {
      await enlacesApi.revocar(enlace.id)
      if (creado?.id === enlace.id) setCreado(null)
      setAviso({ tono: 'ok', texto: 'Enlace revocado: ya no se puede abrir.' })
      await cargarEnlaces()
    } catch (fallo) {
      setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
    }
  }

  const copiar = async (texto: string) => {
    try {
      await copiarTexto(texto)
      setAviso({ tono: 'ok', texto: 'Enlace copiado.' })
    } catch (fallo) {
      setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
    }
  }

  const generarPdf = async () => {
    setGenerandoPdf(true)
    try {
      await onHojaEnPdf({ anonimo })
    } finally {
      setGenerandoPdf(false)
    }
  }

  const direccion = creado ? urlDelEnlace(window.location.origin, creado.token) : ''

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="lg" scrollable>
      <CModalHeader>
        <CModalTitle>Compartir el estudio</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <section className="visor-compartir__bloque">
          <h3 className="visor-compartir__titulo">La imagen que estás viendo</h3>
          <p className="visor-encabezado__meta">
            Descárgala o cópiala con su sello de estudio, serie, fecha y corte.
          </p>
          <CButton size="sm" color="primary" variant="outline" onClick={onAbrirCaptura}>
            Capturar esta imagen…
          </CButton>
        </section>

        <section className="visor-compartir__bloque">
          <h3 className="visor-compartir__titulo">Hoja de cortes clave (PDF)</h3>
          <p className="visor-encabezado__meta">
            {cortesConCaptura === 0
              ? 'Aún no hay cortes clave con captura. Marca un corte y guarda su captura.'
              : `${cortesConCaptura} ${cortesConCaptura === 1 ? 'corte clave con captura' : 'cortes clave con captura'}, con el membrete del consultorio y la leyenda de material de apoyo.`}
          </p>
          <div className="d-flex flex-wrap align-items-center gap-3">
            <CFormCheck
              id="compartir-anonimo"
              label="Sin nombre ni fecha de nacimiento"
              checked={anonimo}
              onChange={(evento) => setAnonimo(evento.target.checked)}
            />
            <CButton
              size="sm"
              color="primary"
              disabled={cortesConCaptura === 0 || generandoPdf}
              onClick={() => void generarPdf()}
            >
              {generandoPdf ? (
                <>
                  <CSpinner size="sm" className="me-1" /> Generando…
                </>
              ) : (
                'Descargar la hoja'
              )}
            </CButton>
          </div>
          {avisoPdf && (
            <p className="small mb-0 mt-2" role="status" style={{ color: avisoPdf.tono === 'error' ? 'var(--cui-danger)' : 'var(--cui-success)' }}>
              {avisoPdf.texto}
            </p>
          )}
        </section>

        <section className="visor-compartir__bloque">
          <h3 className="visor-compartir__titulo">Enlace temporal para un colega</h3>
          <p className="visor-encabezado__meta">
            Quien abra el enlace verá las imágenes <strong>sin nombre, sin fecha de nacimiento y sin
            el hospital</strong>, y no entra al expediente. Vence solo y lo puedes revocar cuando
            quieras.
          </p>

          {creado ? (
            <CAlert color="success" className="mb-3">
              <strong>Enlace creado.</strong> Cópialo ahora: <strong>no se vuelve a mostrar</strong>.
              <div className="d-flex gap-2 mt-2">
                <CFormInput
                  readOnly
                  size="sm"
                  value={direccion}
                  aria-label="Enlace para compartir"
                  onFocus={(evento) => evento.target.select()}
                />
                <CButton size="sm" color="primary" onClick={() => void copiar(direccion)}>
                  Copiar
                </CButton>
              </div>
              <div className="small mt-1">{textoDeVencimiento(creado.expires_at)}</div>
              {creado.avisos.map((texto) => (
                <div key={texto} className="small mt-2 text-warning-emphasis">
                  ⚠ {texto}
                </div>
              ))}
            </CAlert>
          ) : (
            <div className="visor-compartir__formulario">
              <div className="d-flex flex-wrap gap-2">
                <div>
                  <label className="form-label small mb-1" htmlFor="enlace-duracion">
                    Dura
                  </label>
                  <CFormSelect
                    id="enlace-duracion"
                    size="sm"
                    value={horas}
                    onChange={(evento) => setHoras(Number(evento.target.value))}
                  >
                    {DURACIONES_DE_ENLACE.map((duracion) => (
                      <option key={duracion.horas} value={duracion.horas}>
                        {duracion.etiqueta}
                      </option>
                    ))}
                  </CFormSelect>
                </div>
                <div className="flex-grow-1">
                  <label className="form-label small mb-1" htmlFor="enlace-nota">
                    ¿Para quién es? (opcional)
                  </label>
                  <CFormInput
                    id="enlace-nota"
                    size="sm"
                    maxLength={160}
                    value={nota}
                    placeholder="Ej. Dr. Ramírez, interconsulta de columna"
                    onChange={(evento) => setNota(evento.target.value)}
                  />
                </div>
              </div>
              <CFormCheck
                className="mt-2"
                id="enlace-consentimiento"
                label="Confirmo que el paciente dio su consentimiento para compartir este estudio."
                checked={consentimiento}
                onChange={(evento) => setConsentimiento(evento.target.checked)}
              />
              <CButton
                className="mt-2"
                size="sm"
                color="primary"
                disabled={!consentimiento || creando}
                onClick={() => void crear()}
              >
                {creando ? (
                  <>
                    <CSpinner size="sm" className="me-1" /> Creando…
                  </>
                ) : (
                  'Crear enlace'
                )}
              </CButton>
            </div>
          )}

          <div className="visor-panel__titulo mt-3">Enlaces de este estudio</div>
          {cargando && enlaces.length === 0 ? (
            <span className="visor-encabezado__meta">
              <CSpinner size="sm" /> Cargando…
            </span>
          ) : enlaces.length === 0 ? (
            <p className="visor-encabezado__meta mb-0">Todavía no se ha creado ningún enlace.</p>
          ) : (
            <ul className="visor-enlaces">
              {enlaces.map((enlace) => {
                const estado = estadoDeEnlace(enlace)
                return (
                  <li className="visor-enlace" key={enlace.id}>
                    <div>
                      <CBadge color={estado.color} className="me-2">
                        {estado.texto}
                      </CBadge>
                      <strong>{enlace.recipient_note || 'Sin destinatario'}</strong>
                      <div className="visor-encabezado__meta">
                        {enlace.estado === 'activo' ? textoDeVencimiento(enlace.expires_at) : estado.texto.toLowerCase()}
                        {' · '}
                        {textoDeAccesos(enlace.access_count)}
                        {enlace.created_by ? ` · creado por ${enlace.created_by}` : ''}
                      </div>
                    </div>
                    {enlace.estado === 'activo' && (
                      <CButton size="sm" color="danger" variant="outline" onClick={() => void revocar(enlace)}>
                        Revocar
                      </CButton>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {aviso && (
          <CAlert color={aviso.tono === 'ok' ? 'success' : 'danger'} className="py-2 mb-0" role="status">
            {aviso.texto}
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose}>
          Cerrar
        </CButton>
      </CModalFooter>
    </CModal>
  )
}
