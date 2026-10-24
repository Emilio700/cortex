import { useCallback, useEffect, useRef, useState } from 'react'
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
import { cilDescription, cilReload, cilSave } from '@coreui/icons'

import api from '../../../shared/services/api'
import ImagenProtegida from '../../../shared/components/ImagenProtegida'
import {
    AJUSTES_RECETA_POR_DEFECTO,
    COLOR_ACENTO_POR_DEFECTO,
    COLOR_FIRMA_POR_DEFECTO,
    ESTILO_FIRMA_POR_DEFECTO,
    FUENTES_FIRMA,
    GRUPOS_RECETA,
    LEYENDA_POR_DEFECTO,
    LIMITE_LEYENDA,
    TAMANO_FIRMA_MAX,
    TAMANO_FIRMA_MIN,
    combinarAjustes,
    combinarColor,
    combinarEstiloFirma,
    combinarLeyenda,
    nombreImpreso,
    normalizarColor,
    type AjustesReceta,
    type ClaveAjusteReceta,
    type EstiloFirma,
    type FuenteFirma,
} from '../utils/ajustesReceta'

/** Todo lo que el médico configuró de su receta, tal como se ve en pantalla. */
export interface ConfiguracionReceta {
    /** `null` = se usa el nombre de la cuenta. */
    nombre: string | null
    ajustes: AjustesReceta
    /** `null` = se usa la leyenda de fábrica. */
    leyenda: string | null
    color: string
    estilo: EstiloFirma
}

interface Props {
    /** El nombre de la cuenta (``users.full_name``), sin tratamiento. */
    nombreDeLaCuenta: string
    /** "Dr." / "Dra." capturado en la cuenta; sin él, el nombre va solo. */
    tratamientoDeLaCuenta?: string | null
    nombreGuardado?: string | null
    ajustesGuardados?: Partial<AjustesReceta> | null
    leyendaGuardada?: string | null
    colorGuardado?: string | null
    estiloGuardado?: Partial<EstiloFirma> | null
    logoUrl?: string | null
    firmaUrl?: string | null
    onGuardar: (configuracion: ConfiguracionReceta) => Promise<boolean>
    guardando?: boolean
}

/**
 * Configuración de la receta del médico, con vista previa.
 *
 * La vista previa es **el PDF de verdad**: lo genera el servidor con el mismo
 * `generate_prescription_pdf` que imprime una receta real, sobre datos de
 * ejemplo y con los ajustes aún sin guardar. Así no hay dos verdades: esta
 * pantalla no vuelve a dibujar la receta por su cuenta, que es como acabaría
 * mintiendo en cuanto alguien tocara `pdf.py`.
 */
const RecetaConfigCard = ({
    nombreDeLaCuenta,
    tratamientoDeLaCuenta,
    nombreGuardado,
    ajustesGuardados,
    leyendaGuardada,
    colorGuardado,
    estiloGuardado,
    logoUrl,
    firmaUrl,
    onGuardar,
    guardando = false,
}: Props) => {
    const [nombre, setNombre] = useState(nombreGuardado || '')
    const [ajustes, setAjustes] = useState<AjustesReceta>(combinarAjustes(ajustesGuardados))
    const [leyenda, setLeyenda] = useState(combinarLeyenda(leyendaGuardada))
    const [color, setColor] = useState(combinarColor(colorGuardado))
    const [estilo, setEstilo] = useState<EstiloFirma>(combinarEstiloFirma(estiloGuardado))
    const [urlPrevia, setUrlPrevia] = useState<string | null>(null)
    const [cargandoPrevia, setCargandoPrevia] = useState(false)
    const [errorPrevia, setErrorPrevia] = useState<string | null>(null)
    const [sinPrevisualizar, setSinPrevisualizar] = useState(false)
    const [mensaje, setMensaje] = useState<string | null>(null)
    const urlAnterior = useRef<string | null>(null)

    useEffect(() => {
        setNombre(nombreGuardado || '')
    }, [nombreGuardado])

    useEffect(() => {
        setAjustes(combinarAjustes(ajustesGuardados))
        // El JSON llega como objeto nuevo en cada carga; se compara su
        // contenido para no rehacer el estado en cada render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(ajustesGuardados ?? null)])

    useEffect(() => {
        setLeyenda(combinarLeyenda(leyendaGuardada))
    }, [leyendaGuardada])

    useEffect(() => {
        setColor(combinarColor(colorGuardado))
    }, [colorGuardado])

    useEffect(() => {
        setEstilo(combinarEstiloFirma(estiloGuardado))
        // Igual que los ajustes: el estilo llega como objeto nuevo en cada
        // carga, así que se compara su contenido.
    }, [JSON.stringify(estiloGuardado ?? null)])

    const soltarUrl = () => {
        if (urlAnterior.current) {
            URL.revokeObjectURL(urlAnterior.current)
            urlAnterior.current = null
        }
    }

    // Sin esto el navegador retiene el PDF en memoria mientras viva la pestaña.
    useEffect(() => () => soltarUrl(), [])

    const generarVistaPrevia = useCallback(async () => {
        setCargandoPrevia(true)
        setErrorPrevia(null)
        try {
            const respuesta = await api.post(
                '/doctor-profile/me/prescription-preview',
                {
                    prescription_display_name: nombre.trim() || null,
                    prescription_settings: ajustes,
                    prescription_footer_text: leyenda.trim() || null,
                    prescription_accent_color: normalizarColor(color),
                    prescription_signature_style: estilo,
                },
                { responseType: 'blob' },
            )
            soltarUrl()
            const url = URL.createObjectURL(respuesta.data)
            urlAnterior.current = url
            setUrlPrevia(url)
            setSinPrevisualizar(false)
        } catch {
            setErrorPrevia('No se pudo generar la vista previa de la receta. Vuelve a intentarlo.')
        } finally {
            setCargandoPrevia(false)
        }
    }, [nombre, ajustes, leyenda, color, estilo])

    const cambiar = (clave: ClaveAjusteReceta, valor: boolean) => {
        setAjustes((previos) => ({ ...previos, [clave]: valor }))
        setSinPrevisualizar(true)
        setMensaje(null)
    }

    /** Cualquier retoque del estilo invalida la vista previa ya generada. */
    const cambiarEstilo = (cambios: Partial<EstiloFirma>) => {
        setEstilo((previo) => combinarEstiloFirma({ ...previo, ...cambios }))
        setSinPrevisualizar(true)
        setMensaje(null)
    }

    const restablecer = () => {
        setAjustes({ ...AJUSTES_RECETA_POR_DEFECTO })
        setEstilo({ ...ESTILO_FIRMA_POR_DEFECTO })
        setColor(COLOR_ACENTO_POR_DEFECTO)
        setLeyenda(LEYENDA_POR_DEFECTO)
        setSinPrevisualizar(true)
        setMensaje(null)
    }

    const guardar = async () => {
        const ok = await onGuardar({
            nombre: nombre.trim() || null,
            ajustes,
            leyenda: leyenda.trim() || null,
            color: normalizarColor(color) || COLOR_ACENTO_POR_DEFECTO,
            estilo,
        })
        setMensaje(
            ok
                ? 'Configuración de la receta guardada. Las próximas recetas saldrán así.'
                : 'No fue posible guardar la configuración de la receta.',
        )
    }

    const comoSaldra = nombreImpreso(nombre, nombreDeLaCuenta, tratamientoDeLaCuenta)

    return (
        <CCard className="mb-4 glass-card">
            <CCardHeader>
                <CIcon icon={cilDescription} className="me-2" />
                <strong>Mi Receta</strong>
                <small className="text-muted ms-2">(Cómo se imprime tu receta y qué sale en ella)</small>
            </CCardHeader>
            <CCardBody>
                <p className="text-body-secondary small">
                    Elige con qué nombre firmas y qué se ve en tu receta. Los cambios no se aplican
                    hasta que los guardas; la vista previa te los enseña antes.
                </p>

                {mensaje && <CAlert color="info">{mensaje}</CAlert>}

                <CRow>
                    <CCol lg={6}>
                        <div className="mb-3">
                            <CFormLabel htmlFor="nombre-receta">Nombre para la receta</CFormLabel>
                            <div className="text-body-secondary small mb-1">
                                ¿Cómo quieres que aparezca tu nombre impreso?
                            </div>
                            <CFormInput
                                id="nombre-receta"
                                className="gems-campo"
                                value={nombre}
                                onChange={(e) => {
                                    setNombre(e.target.value)
                                    setSinPrevisualizar(true)
                                    setMensaje(null)
                                }}
                                placeholder="..."
                            />
                            <small className="text-body-secondary">
                                {comoSaldra
                                    ? `En la receta saldrá: ${comoSaldra}`
                                    : 'Si lo dejas vacío se usa el nombre de tu cuenta.'}
                            </small>
                        </div>

                        {/* ── Cómo se ve tu firma ──────────────────────────────
                            El logo se queda solo a la izquierda; este bloque es
                            el de la derecha, el que antes era únicamente una
                            imagen que se subía o nada. */}
                        <div className="mb-4 border rounded p-3 bg-body-tertiary" data-tour="perfil-estilo-firma">
                            <div className="fw-semibold mb-1">Cómo se ve tu firma</div>
                            <div className="text-body-secondary small mb-3">
                                Así se dibuja tu nombre en el lado derecho del encabezado. Si subes
                                una imagen de firma, la imagen va arriba y tu nombre debajo.
                            </div>

                            <CRow className="g-3">
                                <CCol md={6}>
                                    <CFormLabel htmlFor="firma-fuente">Letra</CFormLabel>
                                    <CFormSelect
                                        id="firma-fuente"
                                        className="gems-campo"
                                        value={estilo.fuente}
                                        onChange={(e) =>
                                            cambiarEstilo({
                                                fuente: e.target.value as FuenteFirma,
                                            })
                                        }
                                    >
                                        {FUENTES_FIRMA.map((opcion) => (
                                            <option key={opcion.valor} value={opcion.valor}>
                                                {opcion.etiqueta}
                                            </option>
                                        ))}
                                    </CFormSelect>
                                </CCol>
                                <CCol md={6}>
                                    <CFormLabel htmlFor="firma-tamano">
                                        Tamaño: {estilo.tamano}
                                    </CFormLabel>
                                    <CFormInput
                                        id="firma-tamano"
                                        type="range"
                                        min={TAMANO_FIRMA_MIN}
                                        max={TAMANO_FIRMA_MAX}
                                        value={estilo.tamano}
                                        onChange={(e) =>
                                            cambiarEstilo({ tamano: Number(e.target.value) })
                                        }
                                    />
                                </CCol>
                            </CRow>

                            <div className="d-flex flex-wrap gap-4 mt-3">
                                <CFormSwitch
                                    id="firma-negritas"
                                    label="Negritas"
                                    checked={estilo.negritas}
                                    onChange={(e) => cambiarEstilo({ negritas: e.target.checked })}
                                />
                                <CFormSwitch
                                    id="firma-cursiva"
                                    label="Cursiva"
                                    checked={estilo.cursiva}
                                    onChange={(e) => cambiarEstilo({ cursiva: e.target.checked })}
                                />
                                <CFormSwitch
                                    id="firma-linea"
                                    label="Raya para firmar a mano"
                                    checked={estilo.linea_firma}
                                    onChange={(e) =>
                                        cambiarEstilo({ linea_firma: e.target.checked })
                                    }
                                />
                            </div>

                            <div className="mt-3">
                                <CFormLabel htmlFor="firma-color">Color del nombre</CFormLabel>
                                <div className="d-flex align-items-center gap-2">
                                    <CFormInput
                                        id="firma-color"
                                        type="color"
                                        style={{ width: '64px', height: '38px' }}
                                        value={estilo.color || COLOR_FIRMA_POR_DEFECTO}
                                        onChange={(e) =>
                                            cambiarEstilo({ color: e.target.value.toUpperCase() })
                                        }
                                    />
                                    <span className="small text-body-secondary">
                                        {estilo.color
                                            ? `Se imprime en ${estilo.color}`
                                            : 'En el gris de siempre'}
                                    </span>
                                    {estilo.color && (
                                        <CButton
                                            type="button"
                                            size="sm"
                                            color="secondary"
                                            variant="outline"
                                            onClick={() => cambiarEstilo({ color: null })}
                                        >
                                            Usar el gris de siempre
                                        </CButton>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── El color del consultorio y la leyenda del pie ──── */}
                        <div className="mb-4 border rounded p-3 bg-body-tertiary" data-tour="perfil-color-leyenda">
                            <div className="fw-semibold mb-1">Color y leyenda</div>
                            <div className="text-body-secondary small mb-3">
                                El color tiñe los títulos, los marcos y los subrayados. De un solo
                                color salen los tres tonos: no hace falta que aciertes tres.
                            </div>

                            <CRow className="g-3">
                                <CCol md={5}>
                                    <CFormLabel htmlFor="color-membrete">
                                        Color del membrete
                                    </CFormLabel>
                                    <div className="d-flex align-items-center gap-2">
                                        <CFormInput
                                            id="color-membrete"
                                            type="color"
                                            style={{ width: '64px', height: '38px' }}
                                            value={color}
                                            onChange={(e) => {
                                                setColor(e.target.value.toUpperCase())
                                                setSinPrevisualizar(true)
                                                setMensaje(null)
                                            }}
                                        />
                                        <span className="small text-body-secondary">{color}</span>
                                    </div>
                                </CCol>
                                <CCol md={7}>
                                    <CFormLabel htmlFor="leyenda-pie">
                                        Leyenda del pie
                                    </CFormLabel>
                                    <CFormInput
                                        id="leyenda-pie"
                                        className="gems-campo"
                                        maxLength={LIMITE_LEYENDA}
                                        value={leyenda}
                                        placeholder={LEYENDA_POR_DEFECTO}
                                        onChange={(e) => {
                                            setLeyenda(e.target.value)
                                            setSinPrevisualizar(true)
                                            setMensaje(null)
                                        }}
                                    />
                                    <small className="text-body-secondary">
                                        Es el renglón que va al pie, sobre el folio. Vacío deja la
                                        de siempre.
                                    </small>
                                </CCol>
                            </CRow>
                        </div>

                        {GRUPOS_RECETA.map((grupo) => (
                            <div key={grupo.titulo} className="mb-4">
                                <div className="fw-semibold">{grupo.titulo}</div>
                                <div className="text-body-secondary small mb-2">{grupo.descripcion}</div>
                                {grupo.opciones.map((opcion) => (
                                    <div key={opcion.clave} className="mb-2">
                                        <CFormSwitch
                                            id={`receta-${opcion.clave}`}
                                            label={opcion.etiqueta}
                                            checked={ajustes[opcion.clave]}
                                            onChange={(e) => cambiar(opcion.clave, e.target.checked)}
                                        />
                                        {opcion.ayuda && (
                                            <div className="text-body-secondary small ms-4">{opcion.ayuda}</div>
                                        )}
                                        {opcion.aviso && !ajustes[opcion.clave] && (
                                            <div className="text-warning-emphasis small ms-4">{opcion.aviso}</div>
                                        )}
                                        {opcion.clave === 'mostrar_logo' && ajustes.mostrar_logo && logoUrl && (
                                            <div className="ms-4 mt-1">
                                                <ImagenProtegida
                                                    url={logoUrl}
                                                    alt="Logo que saldrá en la receta"
                                                    style={{ maxHeight: '48px', maxWidth: '100%' }}
                                                />
                                            </div>
                                        )}
                                        {opcion.clave === 'mostrar_firma' && ajustes.mostrar_firma && firmaUrl && (
                                            <div className="ms-4 mt-1">
                                                <ImagenProtegida
                                                    url={firmaUrl}
                                                    alt="Firma que saldrá en la receta"
                                                    style={{ maxHeight: '48px', maxWidth: '100%' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}

                        <div className="d-flex gap-2 flex-wrap">
                            <CButton color="primary" onClick={guardar} disabled={guardando}>
                                <CIcon icon={cilSave} className="me-2" />
                                Guardar configuración
                            </CButton>
                            <CButton color="secondary" variant="outline" onClick={restablecer} disabled={guardando}>
                                Restablecer
                            </CButton>
                        </div>
                    </CCol>

                    <CCol lg={6}>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                            <div>
                                <div className="fw-semibold">Vista previa</div>
                                <div className="text-body-secondary small">
                                    Es la receta real, con una paciente de ejemplo.
                                </div>
                            </div>
                            <CButton
                                color="primary"
                                variant="outline"
                                size="sm"
                                onClick={generarVistaPrevia}
                                disabled={cargandoPrevia}
                            >
                                <CIcon icon={cilReload} className="me-2" />
                                {urlPrevia ? 'Actualizar vista previa' : 'Ver vista previa'}
                            </CButton>
                        </div>

                        {errorPrevia && <CAlert color="danger">{errorPrevia}</CAlert>}
                        {sinPrevisualizar && urlPrevia && !cargandoPrevia && (
                            <CAlert color="warning" className="py-2 small">
                                Has cambiado algo desde la última vista previa. Actualízala para verlo.
                            </CAlert>
                        )}

                        <div
                            className="border rounded bg-light d-flex align-items-center justify-content-center"
                            style={{ minHeight: '520px' }}
                        >
                            {cargandoPrevia ? (
                                <div className="text-center">
                                    <CSpinner color="primary" />
                                    <div className="mt-2 small">Generando la receta de ejemplo…</div>
                                </div>
                            ) : urlPrevia ? (
                                <iframe
                                    title="Vista previa de la receta"
                                    src={urlPrevia}
                                    style={{ width: '100%', height: '520px', border: 0 }}
                                />
                            ) : (
                                <span className="text-body-secondary small px-3 text-center">
                                    Todavía no has generado ninguna vista previa. Pulsa «Ver vista previa»
                                    para ver cómo queda tu receta.
                                </span>
                            )}
                        </div>
                    </CCol>
                </CRow>
            </CCardBody>
        </CCard>
    )
}

export default RecetaConfigCard
