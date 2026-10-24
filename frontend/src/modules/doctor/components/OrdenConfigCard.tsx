/**
 * «Mi orden de estudio» en el perfil de la doctora (plan 26, D-7 y D-11).
 *
 * Va junto a «Mi Receta» y es igual de editable, pero con su **propia**
 * configuración: nombre impreso, qué datos salen, color, letra y estilo de la
 * firma, leyenda y cómo se reparte el papel. Al desplegar la segunda ronda la
 * migración copió la configuración de la receta de cada doctora a su orden:
 * lo que se ve aquí ya es lo que imprime. «Copiar de mi receta» se queda para
 * volver a copiar después de cambiar la receta (no guarda solo).
 *
 * Lo que se cambia no se aplica hasta guardarlo, y la vista previa es **el PDF
 * de verdad**, generado por el servidor (`POST /doctor-profile/me/order-preview`)
 * con una paciente de ejemplo y los ajustes aún sin guardar.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormSwitch,
  CRow,
  CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCopy, cilDescription, cilReload, cilSave } from '@coreui/icons'

import { apiClient } from '../../../shared/services/api'
import { mensajeDeError } from '../../../shared/utils/errors'
import VisorDocumentos, { type ArchivoVisor } from '../../../shared/components/VisorDocumentos'
import {
  AJUSTES_ORDEN_POR_DEFECTO,
  GRUPOS_ORDEN,
  LEYENDA_ORDEN_POR_DEFECTO,
  LIMITE_LEYENDA_ORDEN,
  LIMITE_NOMBRE_ORDEN,
  ajustesOrdenParaEnviar,
  combinarAjustesOrden,
  type AjustesOrden,
} from '../utils/ajustesOrden'
import {
  COLOR_ACENTO_POR_DEFECTO,
  COLOR_FIRMA_POR_DEFECTO,
  ESTILO_FIRMA_POR_DEFECTO,
  FUENTES_FIRMA,
  TAMANO_FIRMA_MAX,
  TAMANO_FIRMA_MIN,
  combinarEstiloFirma,
  nombreImpreso,
  type EstiloFirma,
  type FuenteFirma,
} from '../utils/ajustesReceta'
import { MODOS_DE_IMPRESION, type ModoImpresion } from '../utils/ordenEstudioPdf'

interface Props {
  guardados?: Partial<AjustesOrden> | null
  onGuardar: (ajustes: AjustesOrden) => Promise<boolean>
  guardando?: boolean
  /** El nombre de la cuenta, sin tratamiento: el que sale si no escribe otro. */
  nombreDeLaCuenta?: string
  tratamientoDeLaCuenta?: string | null
}

type Mensaje = { color: 'info' | 'danger' | 'warning'; texto: string }

const OrdenConfigCard = ({
  guardados,
  onGuardar,
  guardando = false,
  nombreDeLaCuenta = '',
  tratamientoDeLaCuenta,
}: Props) => {
  const [ajustes, setAjustes] = useState<AjustesOrden>(combinarAjustesOrden(guardados))
  const [pedido, setPedido] = useState(0)
  const [sinPrevisualizar, setSinPrevisualizar] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [copiando, setCopiando] = useState(false)

  useEffect(() => {
    setAjustes(combinarAjustesOrden(guardados))
    // Llega como objeto nuevo en cada carga: se compara su contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(guardados ?? null)])

  const cambiar = (cambios: Partial<AjustesOrden>) => {
    setAjustes((previos) => ({ ...previos, ...cambios }))
    setSinPrevisualizar(true)
    setMensaje(null)
  }

  const estilo = ajustes.estilo_firma ?? ESTILO_FIRMA_POR_DEFECTO
  const cambiarEstilo = (cambios: Partial<EstiloFirma>) =>
    cambiar({ estilo_firma: combinarEstiloFirma({ ...estilo, ...cambios }) })

  const copiarDeLaReceta = async () => {
    setCopiando(true)
    setMensaje(null)
    try {
      const { data } = await apiClient.get<AjustesOrden>(
        '/doctor-profile/me/order-settings/from-prescription',
      )
      setAjustes(combinarAjustesOrden(data))
      setSinPrevisualizar(true)
      setMensaje({
        color: 'warning',
        texto:
          'Se copiaron de tu receta el nombre, el color, la firma, la leyenda y los datos del membrete que cambiaste ahí; los que dejaste como venían de fábrica conservan lo de tu orden. Todavía no se guardan: revísalos y pulsa «Guardar configuración de la orden».',
      })
    } catch (err) {
      setMensaje({
        color: 'danger',
        texto: mensajeDeError(err, 'No se pudo copiar la configuración de tu receta.'),
      })
    } finally {
      setCopiando(false)
    }
  }

  // Cada «Ver vista previa» pide un PDF nuevo con lo que hay en pantalla en ese momento.
  const archivos: ArchivoVisor[] = useMemo(() => {
    if (pedido === 0) return []
    const cuerpo = {
      order_settings: ajustesOrdenParaEnviar(ajustes),
      modo: ajustes.modo_impresion,
    }
    return [
      {
        clave: `vista-previa-orden-${pedido}`,
        nombre: 'vista-previa-orden.pdf',
        mime: 'application/pdf',
        cargar: async () => {
          try {
            const respuesta = await apiClient.post('/doctor-profile/me/order-preview', cuerpo, {
              responseType: 'blob',
            })
            return new Blob([respuesta.data], { type: 'application/pdf' })
          } catch (err) {
            throw new Error(
              mensajeDeError(
                err,
                'No se pudo generar la vista previa de la orden. Vuelve a intentarlo.',
              ),
            )
          }
        },
      },
    ]
    // Solo se rehace al pedirla: cambiar un interruptor no regenera el PDF sola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido])

  const guardar = async () => {
    const ok = await onGuardar(ajustesOrdenParaEnviar(ajustes))
    setMensaje(
      ok
        ? {
            color: 'info',
            texto: 'Configuración de la orden guardada. Las próximas órdenes saldrán así.',
          }
        : { color: 'danger', texto: 'No fue posible guardar la configuración de la orden.' },
    )
  }

  const comoSaldra = nombreImpreso(
    ajustes.nombre_impreso ?? '',
    nombreDeLaCuenta,
    tratamientoDeLaCuenta,
  )

  return (
    <CCard className="mb-4 glass-card">
      <CCardHeader className="d-flex flex-wrap align-items-center gap-2">
        <CIcon icon={cilDescription} />
        <strong>Mi orden de estudio</strong>
        <small className="text-muted">(Cómo se imprimen tus órdenes de estudio)</small>
        <CButton
          className="ms-auto"
          size="sm"
          color="secondary"
          variant="outline"
          disabled={copiando || guardando}
          onClick={() => void copiarDeLaReceta()}
          data-tour="perfil-orden-copiar"
        >
          {copiando ? <CSpinner size="sm" /> : <CIcon icon={cilCopy} className="me-1" />}
          Copiar de mi receta
        </CButton>
      </CCardHeader>
      <CCardBody>
        <p className="text-body-secondary small">
          Así se imprimen hoy tus órdenes. La configuración es propia de la orden: empezó como una
          copia de tu receta y cambiarla aquí no toca la receta. Si después cambias tu receta y
          quieres lo mismo en la orden, usa «Copiar de mi receta». La{' '}
          <strong>cédula profesional sale siempre</strong>, porque el laboratorio la exige.
        </p>
        {mensaje && (
          <CAlert color={mensaje.color} role={mensaje.color === 'danger' ? 'alert' : 'status'}>
            {mensaje.texto}
          </CAlert>
        )}
        <CRow>
          <CCol lg={6}>
            <div className="mb-3">
              <CFormLabel htmlFor="orden-nombre">Nombre para la orden</CFormLabel>
              <CFormInput
                id="orden-nombre"
                className="gems-campo"
                maxLength={LIMITE_NOMBRE_ORDEN}
                value={ajustes.nombre_impreso ?? ''}
                onChange={(e) => cambiar({ nombre_impreso: e.target.value })}
              />
              <small className="text-body-secondary">
                {comoSaldra
                  ? `En la orden saldrá: ${comoSaldra}`
                  : 'Si lo dejas vacío se usa el nombre de tu cuenta.'}
              </small>
            </div>

            <div className="mb-4 border rounded p-3 bg-body-tertiary" data-tour="perfil-orden-modo">
              <CFormLabel htmlFor="orden-modo-predeterminado" className="fw-semibold">
                Cómo se imprime cuando hay varios estudios
              </CFormLabel>
              <CFormSelect
                id="orden-modo-predeterminado"
                className="gems-campo"
                value={ajustes.modo_impresion}
                onChange={(e) => cambiar({ modo_impresion: e.target.value as ModoImpresion })}
              >
                {MODOS_DE_IMPRESION.map(({ valor, etiqueta }) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </CFormSelect>
              <div className="text-body-secondary small mt-1">
                «Separado por destino» saca una hoja para laboratorio, otra para imagen y gabinete y
                otra para lo demás. Es el valor con el que abre la vista previa al imprimir; ahí lo
                puedes cambiar para esa orden.
              </div>
            </div>

            <div
              className="mb-4 border rounded p-3 bg-body-tertiary"
              data-tour="perfil-orden-firma"
            >
              <div className="fw-semibold mb-1">Cómo se ve tu firma</div>
              <div className="text-body-secondary small mb-2">
                Tu nombre debajo de la raya para firmar.
              </div>
              <CFormSwitch
                id="orden-firma-propia"
                label="Personalizar la letra de mi nombre"
                checked={ajustes.estilo_firma !== null}
                onChange={(e) =>
                  cambiar({
                    estilo_firma: e.target.checked ? { ...ESTILO_FIRMA_POR_DEFECTO } : null,
                  })
                }
              />
              {ajustes.estilo_firma && (
                <>
                  <CRow className="g-3 mt-1">
                    <CCol md={6}>
                      <CFormLabel htmlFor="orden-firma-fuente">Letra</CFormLabel>
                      <CFormSelect
                        id="orden-firma-fuente"
                        value={estilo.fuente}
                        onChange={(e) => cambiarEstilo({ fuente: e.target.value as FuenteFirma })}
                      >
                        {FUENTES_FIRMA.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.etiqueta}
                          </option>
                        ))}
                      </CFormSelect>
                    </CCol>
                    <CCol md={6}>
                      <CFormLabel htmlFor="orden-firma-tamano">Tamaño: {estilo.tamano}</CFormLabel>
                      <CFormInput
                        id="orden-firma-tamano"
                        type="range"
                        min={TAMANO_FIRMA_MIN}
                        max={TAMANO_FIRMA_MAX}
                        value={estilo.tamano}
                        onChange={(e) => cambiarEstilo({ tamano: Number(e.target.value) })}
                      />
                    </CCol>
                  </CRow>
                  <div className="d-flex flex-wrap gap-4 mt-3">
                    <CFormSwitch
                      id="orden-firma-negritas"
                      label="Negritas"
                      checked={estilo.negritas}
                      onChange={(e) => cambiarEstilo({ negritas: e.target.checked })}
                    />
                    <CFormSwitch
                      id="orden-firma-cursiva"
                      label="Cursiva"
                      checked={estilo.cursiva}
                      onChange={(e) => cambiarEstilo({ cursiva: e.target.checked })}
                    />
                    <CFormSwitch
                      id="orden-firma-linea"
                      label="Raya para firmar a mano"
                      checked={estilo.linea_firma}
                      onChange={(e) => cambiarEstilo({ linea_firma: e.target.checked })}
                    />
                  </div>
                  <div className="mt-3 d-flex align-items-center gap-2">
                    <CFormLabel htmlFor="orden-firma-color" className="mb-0">
                      Color del nombre
                    </CFormLabel>
                    <CFormInput
                      id="orden-firma-color"
                      type="color"
                      style={{ width: '64px', height: '38px' }}
                      value={estilo.color || COLOR_FIRMA_POR_DEFECTO}
                      onChange={(e) => cambiarEstilo({ color: e.target.value.toUpperCase() })}
                    />
                  </div>
                </>
              )}
            </div>

            <div
              className="mb-4 border rounded p-3 bg-body-tertiary"
              data-tour="perfil-orden-color"
            >
              <CRow className="g-3">
                <CCol md={5}>
                  <CFormLabel htmlFor="orden-color">Color del membrete</CFormLabel>
                  <div className="d-flex align-items-center gap-2">
                    <CFormInput
                      id="orden-color"
                      type="color"
                      style={{ width: '64px', height: '38px' }}
                      value={ajustes.color_acento || COLOR_ACENTO_POR_DEFECTO}
                      onChange={(e) => cambiar({ color_acento: e.target.value.toUpperCase() })}
                    />
                    <span className="small text-body-secondary">
                      {ajustes.color_acento ?? 'El de fábrica'}
                    </span>
                  </div>
                </CCol>
                <CCol md={7}>
                  <CFormLabel htmlFor="orden-leyenda">Leyenda adicional del pie</CFormLabel>
                  <CFormInput
                    id="orden-leyenda"
                    className="gems-campo"
                    maxLength={LIMITE_LEYENDA_ORDEN}
                    value={ajustes.leyenda_pie ?? ''}
                    placeholder="Ej. Presentarse en ayunas con esta orden"
                    onChange={(e) => cambiar({ leyenda_pie: e.target.value })}
                  />
                  {/* Desde la ronda 4 la advertencia sale siempre y esta va aparte. */}
                  <small className="text-body-secondary">
                    Va en su propia línea, encima de la advertencia que sale siempre: «
                    {LEYENDA_ORDEN_POR_DEFECTO}». Vacía, solo sale la advertencia.
                  </small>
                </CCol>
              </CRow>
            </div>

            <div data-tour="perfil-orden-campos">
              {GRUPOS_ORDEN.map((grupo) => (
                <div key={grupo.titulo} className="mb-4">
                  <div className="fw-semibold">{grupo.titulo}</div>
                  <div className="text-body-secondary small mb-2">{grupo.descripcion}</div>
                  {grupo.titulo === 'Membrete' && (
                    <CFormSwitch
                      id="orden-cedula-profesional"
                      label="Cédula profesional (siempre sale)"
                      checked
                      disabled
                      className="mb-2"
                    />
                  )}
                  {grupo.opciones.map((opcion) => (
                    <div key={opcion.clave} className="mb-2">
                      <CFormSwitch
                        id={`orden-${opcion.clave}`}
                        label={opcion.etiqueta}
                        checked={ajustes[opcion.clave]}
                        onChange={(e) => cambiar({ [opcion.clave]: e.target.checked })}
                      />
                      {opcion.ayuda && (
                        <div className="text-body-secondary small ms-4">{opcion.ayuda}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="d-flex gap-2 flex-wrap">
              <CButton color="primary" onClick={() => void guardar()} disabled={guardando}>
                <CIcon icon={cilSave} className="me-2" />
                Guardar configuración de la orden
              </CButton>
              <CButton
                color="secondary"
                variant="outline"
                disabled={guardando}
                onClick={() => cambiar({ ...AJUSTES_ORDEN_POR_DEFECTO })}
              >
                Restablecer
              </CButton>
            </div>
          </CCol>
          <CCol lg={6} data-tour="perfil-orden-vista-previa">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div>
                <div className="fw-semibold">Vista previa</div>
                <div className="text-body-secondary small">
                  Es la orden real, con una paciente de ejemplo.
                </div>
              </div>
              <CButton
                color="primary"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPedido((n) => n + 1)
                  setSinPrevisualizar(false)
                }}
              >
                <CIcon icon={cilReload} className="me-2" />
                {pedido ? 'Actualizar vista previa' : 'Ver vista previa'}
              </CButton>
            </div>
            {sinPrevisualizar && pedido > 0 && (
              <CAlert color="warning" className="py-2 small">
                Has cambiado algo desde la última vista previa. Actualízala para verlo.
              </CAlert>
            )}
            {pedido > 0 ? (
              <VisorDocumentos
                enLinea
                alto="520px"
                titulo="Vista previa de la orden"
                archivos={archivos}
              />
            ) : (
              <div
                className="border rounded bg-light d-flex align-items-center justify-content-center"
                style={{ minHeight: '520px' }}
              >
                <span className="text-body-secondary small px-3 text-center">
                  Todavía no has generado ninguna vista previa. Pulsa «Ver vista previa» para ver
                  cómo queda tu orden.
                </span>
              </div>
            )}
          </CCol>
        </CRow>
      </CCardBody>
    </CCard>
  )
}

export default OrdenConfigCard
