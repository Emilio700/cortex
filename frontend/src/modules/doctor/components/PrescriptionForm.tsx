/**
 * Prescription Form Component
 *
 * Receta rediseniada para el consultorio: el doctor escribe el medicamento y el
 * campo le va sugiriendo los de su propio vademecario, arma la pauta con atajos
 * de dosis / frecuencia / duracion y va apilando los medicamentos hacia abajo.
 * Al agregar uno, la tarjeta de captura se pliega para dejar de robar espacio.
 *
 * El contrato de datos no cambia: cada medicamento sigue siendo
 * { name, dosage, frequency, duration, intake_time, notes }.
 *
 * "Receta N": en produccion el Dr. Cintia emitio dos recetas identicas con un
 * minuto de diferencia porque el formulario nunca se entero de que ya habia
 * guardado. Ahora guardar SIEMPRE actualiza la receta abierta y el unico camino
 * para crear otra es el boton explicito "Agregar otra receta".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    CButton,
    CCard,
    CCardBody,
    CCardHeader,
    CCol,
    CForm,
    CFormInput,
    CFormSwitch,
    CFormTextarea,
    CModal,
    CRow,
    CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
    cilPlus,
    cilCloudDownload,
    cilPencil,
    cilTrash,
    cilCheckAlt,
    cilPrint,
    cilEnvelopeClosed,
} from '@coreui/icons'
import { aMayusculas, enMayusculas } from '../../../shared/utils/mayusculas'
import { useCambiosSinGuardar } from '../../../shared/tabs/cambiosSinGuardar'
import { usePrescriptions } from '../hooks/usePrescriptions'
import { useMedicamentosFrecuentes } from '../hooks/useMedicamentosFrecuentes'
import {
    agregarIndicacion,
    etiquetaFrecuente,
    filtrarMedicamentos,
    medicamentoCompleto,
    medicamentoVacio,
    resumenMedicamento,
    type MedicamentoFrecuente,
} from '../utils/receta'
import type { MedicationItem, Prescription } from '../types'
import type { Triage } from '../../secretaria/types'

interface PrescriptionFormProps {
    appointmentId: number
    patientId: number
    triage?: Triage | null
    /** Recetas ya emitidas en esta cita. Llega asincrona, despues del primer render. */
    prescriptions?: Prescription[] | null
    onSaved?: (prescription: Prescription) => void
    readOnly?: boolean
}

const ATAJOS_DOSIS = ['1/2 tableta', '1 tableta', '2 tabletas']
const ATAJOS_FRECUENCIA = ['Cada 6 h', 'Cada 8 h', 'Cada 12 h', 'Cada 24 h']
const ATAJOS_DURACION = ['1 día', '3 días', '5 días', '7 días']
// Las vías y presentaciones más comunes en neurocirugía (analgesia, anticomiciales,
// esteroides, relajantes): en GEMS estaban las de ginecología (óvulos, vía vaginal).
const ATAJOS_VIA = ['Vía oral', 'Vía intravenosa', 'Vía intramuscular', 'Vía subcutánea', 'Vía sublingual', 'Vía tópica']
const ATAJOS_PRESENTACION = ['Tabletas', 'Cápsulas', 'Solución', 'Ampolletas', 'Gotas', 'Parche']
const SUGERENCIAS_INDICACIONES = [
    'Tomar con alimentos',
    'No exceder la dosis recomendada',
    'Evitar alcohol',
    'Si persisten los síntomas, acudir al médico',
]
const LIMITE_INDICACIONES = 200
const LIMITE_MOTIVO = 300
const LIMITE_NOTA_MEDICAMENTO = 120
/** Marca discreta de "aqui se escribe", sin texto de ejemplo que estorbe. */
const MARCA_ESCRITURA = '...'

/**
 * El ordinal "Receta N" se DERIVA del orden de creacion dentro de la cita; no se
 * guarda en ningun lado. No existe endpoint para borrar recetas, asi que los
 * numeros nunca se recorren y no hace falta mantener ese estado.
 */
const ordenarPorCreacion = (recetas: Prescription[]): Prescription[] =>
    [...recetas].sort((a, b) => {
        const diferencia =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        return diferencia !== 0 ? diferencia : a.id - b.id
    })

/** Une lo que ya sabe el componente con lo que trae el padre, sin perder nada. */
const fusionarRecetas = (
    locales: Prescription[],
    entrantes: Prescription[],
): Prescription[] => {
    const porId = new Map(locales.map((receta) => [receta.id, receta]))
    entrantes.forEach((receta) => porId.set(receta.id, receta))
    return ordenarPorCreacion(Array.from(porId.values()))
}

const laMasReciente = (recetas?: Prescription[] | null): Prescription | null => {
    const ordenadas = ordenarPorCreacion(recetas ?? [])
    return ordenadas.length > 0 ? ordenadas[ordenadas.length - 1] : null
}

/** Con una sola receta el "de N" sobra y solo hace ruido. */
const etiquetaReceta = (ordinal: number, total: number) =>
    total > 1 ? `Receta ${ordinal} de ${total}` : `Receta ${ordinal}`

/** El identificador que el médico reconoce es el folio, nunca el id de base. */
const textoFolio = (receta: Prescription) =>
    receta.folio_number ? `Folio ${receta.folio_number}` : 'Folio pendiente'

/**
 * Atajos de un clic bajo cada columna de la pauta. Cada columna lleva su propio
 * color para que el doctor la ubique de un vistazo y el atajo elegido queda
 * relleno, no solo con el borde marcado.
 */
const ChipsAtajo: React.FC<{
    opciones: string[]
    valor: string
    tono: 'dosis' | 'frecuencia' | 'duracion'
    onElegir: (valor: string) => void
}> = ({ opciones, valor, tono, onElegir }) => (
    <div className="d-flex flex-wrap gap-1 mt-2">
        {opciones.map((opcion) => {
            const activo = valor === opcion
            return (
                <CButton
                    key={opcion}
                    type="button"
                    size="sm"
                    color="primary"
                    variant="outline"
                    className={`gems-chip gems-chip-${tono}${activo ? ' gems-chip-activo' : ''}`}
                    aria-pressed={activo}
                    onClick={() => onElegir(activo ? '' : opcion)}
                >
                    {opcion}
                </CButton>
            )
        })}
    </div>
)

export const PrescriptionForm: React.FC<PrescriptionFormProps> = ({
    appointmentId,
    patientId,
    triage,
    prescriptions,
    onSaved,
    readOnly = false,
}) => {
    const {
        loading,
        error,
        createPrescription,
        updatePrescription,
        downloadPrescriptionPDF,
        printPrescription,
        previewPrescription,
        sendPrescriptionEmail,
    } = usePrescriptions()
    const { medicamentos: vademecario } = useMedicamentosFrecuentes()

    const [emitidas, setEmitidas] = useState<Prescription[]>(() =>
        ordenarPorCreacion(prescriptions ?? []),
    )
    /**
     * Identidad interna de la receta abierta en el editor. Es lo que decide
     * crear-vs-actualizar: el padre puede no haberse enterado todavia del create
     * y confiar en el prop es justo lo que duplicaba la receta en produccion.
     */
    const [recetaId, setRecetaId] = useState<number | null>(
        () => laMasReciente(prescriptions)?.id ?? null,
    )
    const [medications, setMedications] = useState<MedicationItem[]>(
        () => laMasReciente(prescriptions)?.medications ?? [],
    )
    const [instructions, setInstructions] = useState(
        () => laMasReciente(prescriptions)?.instructions ?? '',
    )
    /**
     * Motivo de consulta impreso en la receta. Arranca APAGADO siempre, aunque
     * el triage ya traiga el motivo: es expediente clinico y la receta viaja a
     * la farmacia, asi que lo decide el médico para este paciente. Al
     * encenderlo se propone lo que dijo el paciente al llegar, y ella edita.
     */
    const [diagnosis, setDiagnosis] = useState(
        () => laMasReciente(prescriptions)?.diagnosis ?? '',
    )
    const [incluirMotivo, setIncluirMotivo] = useState(
        () => Boolean(laMasReciente(prescriptions)?.diagnosis),
    )
    const [borrador, setBorrador] = useState<MedicationItem>(medicamentoVacio())
    const [nombreTecleado, setNombreTecleado] = useState('')
    const [resaltado, setResaltado] = useState(0)
    const [editando, setEditando] = useState<number | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [mensaje, setMensaje] = useState<{
        texto: string
        tono: 'success' | 'warning'
    } | null>(null)
    const [aviso, setAviso] = useState<string | null>(null)
    // La captura arranca abierta solo cuando la receta esta vacia: si ya hay
    // medicamentos, el doctor ve primero la lista y abre la captura si la ocupa.
    const [capturaAbierta, setCapturaAbierta] = useState(
        () => (laMasReciente(prescriptions)?.medications ?? []).length === 0,
    )
    const campoNombreRef = useRef<HTMLInputElement | null>(null)

    const sugerencias = useMemo(
        () => filtrarMedicamentos(vademecario, nombreTecleado),
        [vademecario, nombreTecleado],
    )
    const medicamentoElegido = Boolean(borrador.name)

    /** Hay texto capturado que todavia no esta en ninguna receta guardada. */
    const hayCapturaEnCurso =
        medications.length > 0 ||
        instructions.trim() !== '' ||
        diagnosis.trim() !== '' ||
        Boolean(borrador.name) ||
        nombreTecleado.trim() !== ''

    const recetaAbierta = emitidas.find((receta) => receta.id === recetaId) ?? null

    const hayCambiosSinGuardar =
        !readOnly &&
        (recetaAbierta
            ? JSON.stringify(recetaAbierta.medications) !== JSON.stringify(medications) ||
              (recetaAbierta.instructions ?? '') !== instructions ||
              (recetaAbierta.diagnosis ?? '') !== diagnosis ||
              Boolean(borrador.name)
            : hayCapturaEnCurso)

    useCambiosSinGuardar(hayCambiosSinGuardar, 'Receta médica')
    /**
     * El padre carga las recetas despues del primer render, asi que sin esto no
     * se pintaban nunca. La sincronizacion se dispara por los ids del registro y
     * no por la identidad del arreglo: en cada render le borraria al médico lo
     * que esta escribiendo.
     */
    const idsDelPadre = (prescriptions ?? []).map((receta) => receta.id).join('-')
    useEffect(() => {
        const entrantes = ordenarPorCreacion(prescriptions ?? [])
        if (entrantes.length === 0) return
        setEmitidas((actuales) => fusionarRecetas(actuales, entrantes))
        // Un registro que llega tarde jamas pisa una captura en curso.
        if (recetaId !== null || hayCapturaEnCurso) return
        const ultima = entrantes[entrantes.length - 1]
        setRecetaId(ultima.id)
        setMedications(ultima.medications ?? [])
        setInstructions(ultima.instructions ?? '')
        setDiagnosis(ultima.diagnosis ?? '')
        setIncluirMotivo(Boolean(ultima.diagnosis))
        setCapturaAbierta((ultima.medications ?? []).length === 0)
    }, [idsDelPadre]) // eslint-disable-line react-hooks/exhaustive-deps

    const anunciar = (texto: string, tono: 'success' | 'warning' = 'success') => {
        setMensaje({ texto, tono })
        // El aviso de exito se va solo; el de problema se queda hasta la siguiente
        // accion, porque es justo lo que el médico necesita leer con calma.
        if (tono === 'success') setTimeout(() => setMensaje(null), 3000)
    }

    const elegirMedicamento = (nombre: string) => {
        setBorrador((actual) => ({ ...actual, name: nombre }))
        setNombreTecleado('')
        setResaltado(0)
        setAviso(null)
    }

    /**
     * Al elegir del vademecario, la presentacion se guarda en SU campo y no
     * pegada al nombre: asi la receta la puede imprimir aparte y el nombre del
     * medicamento queda limpio. Los valores se copian tal cual vienen —el
     * vademecario ya esta capturado en mayusculas y la presentacion conserva su
     * forma ("Tabletas"), que es como se imprimia antes de tener su campo— y el
     * detalle ("4 MG") solo se propone como dosis si no hay ninguna escrita.
     */
    const elegirDelVademecario = (med: MedicamentoFrecuente) => {
        setBorrador((actual) => ({
            ...actual,
            name: med.nombre,
            presentation: actual.presentation || med.presentacion || '',
            dosage: actual.dosage || med.detalle || '',
        }))
        setNombreTecleado('')
        setResaltado(0)
        setAviso(null)
    }

    /** Propone en el motivo lo que el paciente dijo al llegar al triage. */
    const motivoSugerido = (triage?.chief_complaint || '').toUpperCase()

    const cambiarIncluirMotivo = (incluir: boolean) => {
        setIncluirMotivo(incluir)
        if (incluir && !diagnosis.trim() && motivoSugerido) setDiagnosis(motivoSugerido)
        if (!incluir) setDiagnosis('')
    }

    const enfocarNombre = () => window.setTimeout(() => campoNombreRef.current?.focus(), 0)

    const cambiarMedicamento = () => {
        setBorrador((actual) => ({ ...actual, name: '' }))
        setNombreTecleado('')
        setResaltado(0)
        enfocarNombre()
    }

    const tecladoEnNombre = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const total = sugerencias.length + (nombreTecleado.trim() ? 1 : 0)
        if (!total) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setResaltado((i) => (i + 1) % total)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setResaltado((i) => (i - 1 + total) % total)
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (resaltado < sugerencias.length) elegirDelVademecario(sugerencias[resaltado])
            else elegirMedicamento(nombreTecleado.trim())
        }
    }

    const limpiarBorrador = () => {
        setBorrador(medicamentoVacio())
        setNombreTecleado('')
        setResaltado(0)
        setEditando(null)
        setAviso(null)
    }

    const agregarALaReceta = () => {
        if (!medicamentoCompleto(borrador)) {
            setAviso('Indica al menos el medicamento, la dosis y la frecuencia.')
            return
        }
        if (editando !== null) {
            setMedications(medications.map((med, i) => (i === editando ? borrador : med)))
        } else {
            setMedications([...medications, borrador])
        }
        limpiarBorrador()
        // Ya quedo capturado: la tarjeta se pliega sola para no robar espacio.
        setCapturaAbierta(false)
    }

    /** Vuelve a abrir la captura vacia para el siguiente medicamento. */
    const abrirCapturaVacia = () => {
        limpiarBorrador()
        setCapturaAbierta(true)
        enfocarNombre()
    }

    const editarMedicamento = (index: number) => {
        setBorrador(medications[index])
        setEditando(index)
        setNombreTecleado('')
        setAviso(null)
        setCapturaAbierta(true)
    }

    const quitarMedicamento = (index: number) => {
        setMedications(medications.filter((_, i) => i !== index))
        if (editando === index) limpiarBorrador()
    }

    // Las indicaciones se capturan en MAYUSCULAS: la sugerencia entra igual.
    const anadirSugerenciaIndicacion = (sugerencia: string) =>
        setInstructions((actual) =>
            agregarIndicacion(actual, aMayusculas(sugerencia), LIMITE_INDICACIONES),
        )

    const handlePreview = async () => {
        if (medications.length === 0) {
            setAviso('Agrega al menos un medicamento para la vista previa.')
            return
        }
        setShowPreview(true)
        setPreviewUrl(null)
        const url = await previewPrescription({
            appointment_id: appointmentId,
            patient_id: patientId,
            medications,
            instructions,
            diagnosis: incluirMotivo ? diagnosis : null,
        })
        if (url) setPreviewUrl(url)
    }

    /** Lo que viaja al servidor: el motivo vacio no se manda como texto. */
    const motivoParaGuardar = incluirMotivo && diagnosis.trim() ? diagnosis.trim() : null

    const savePrescription = async (): Promise<Prescription | null> => {
        if (medications.length === 0) {
            setAviso('Agrega al menos un medicamento.')
            return null
        }
        const guardada =
            recetaId !== null
                ? await updatePrescription(recetaId, {
                      medications,
                      instructions,
                      diagnosis: motivoParaGuardar,
                  })
                : await createPrescription({
                      appointment_id: appointmentId,
                      patient_id: patientId,
                      medications,
                      instructions,
                      diagnosis: motivoParaGuardar,
                  })
        if (!guardada) return null
        setRecetaId(guardada.id)
        setEmitidas((actuales) => fusionarRecetas(actuales, [guardada]))
        if (onSaved) onSaved(guardada)
        return guardada
    }

    /**
     * Guardar sin imprimir. El mensaje dice exactamente lo que ocurrio: decirle
     * "enviada a imprimir" cuando nadie imprimio es lo que la mando a Vista
     * Previa a crear la receta duplicada.
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const guardada = await savePrescription()
        if (guardada) anunciar('Receta guardada.')
    }

    const guardarEImprimir = async () => {
        const guardada = await savePrescription()
        if (!guardada) return
        setShowPreview(false)
        const impresa = await printPrescription(guardada.id)
        anunciar(
            impresa
                ? 'Receta guardada y enviada a imprimir.'
                : 'Receta guardada, pero no se pudo enviar a imprimir. Usa Imprimir o descarga el PDF.',
            impresa ? 'success' : 'warning',
        )
    }

    /**
     * Unico camino que crea una receta nueva. Deliberado y visible: mientras el
     * editor tenga una receta abierta, guardar siempre actualiza esa misma.
     */
    const agregarOtraReceta = () => {
        setRecetaId(null)
        setMedications([])
        setInstructions('')
        setDiagnosis('')
        setIncluirMotivo(false)
        limpiarBorrador()
        setCapturaAbierta(true)
        setMensaje(null)
        enfocarNombre()
    }

    const editarReceta = (receta: Prescription) => {
        if (hayCambiosSinGuardar) {
            anunciar(
                'Guarda los cambios de la receta abierta antes de editar otra.',
                'warning',
            )
            return
        }
        setRecetaId(receta.id)
        setMedications(receta.medications ?? [])
        setInstructions(receta.instructions ?? '')
        setDiagnosis(receta.diagnosis ?? '')
        setIncluirMotivo(Boolean(receta.diagnosis))
        limpiarBorrador()
        setCapturaAbierta((receta.medications ?? []).length === 0)
    }

    const imprimirReceta = async (receta: Prescription) => {
        const impresa = await printPrescription(receta.id)
        anunciar(
            impresa ? 'Receta enviada a imprimir.' : 'No se pudo enviar a imprimir.',
            impresa ? 'success' : 'warning',
        )
    }

    const descargarReceta = (receta: Prescription) =>
        downloadPrescriptionPDF(
            receta.id,
            `${receta.folio_number ?? `Receta_${receta.id}`}.pdf`,
        )

    const enviarRecetaPorCorreo = async (receta: Prescription) => {
        const enviada = await sendPrescriptionEmail(receta.id)
        anunciar(
            enviada
                ? `Receta enviada a ${enviada.to_email}.`
                : 'No se pudo enviar la receta por correo.',
            enviada ? 'success' : 'warning',
        )
    }

    const ordinalDe = (receta: Prescription) =>
        emitidas.findIndex((emitida) => emitida.id === receta.id) + 1
    // La receta en blanco tambien cuenta para el "de N": es la que se esta haciendo.
    const totalRecetas = emitidas.length + (!readOnly && recetaId === null ? 1 : 0)
    const ordinalEditor = recetaAbierta ? ordinalDe(recetaAbierta) : emitidas.length + 1
    const otrasRecetas = emitidas.filter((receta) => receta.id !== recetaId)

    /**
     * Tarjeta de una receta ya emitida: folio, contenido y que hacer con ella.
     * Es una funcion y no un componente a proposito: declarado aqui adentro, un
     * componente cambiaria de identidad en cada render y remontaria el bloque.
     */
    const tarjetaReceta = (receta: Prescription) => (
        <div key={receta.id} className="border rounded p-3 mb-2">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                    <strong>{etiquetaReceta(ordinalDe(receta), totalRecetas)}</strong>
                    <div className="small text-muted">{textoFolio(receta)}</div>
                </div>
                <div className="d-flex flex-wrap gap-1">
                    <CButton
                        type="button"
                        color="primary"
                        variant="outline"
                        size="sm"
                        onClick={() => imprimirReceta(receta)}
                    >
                        <CIcon icon={cilPrint} className="me-1" />
                        Imprimir
                    </CButton>
                    <CButton
                        type="button"
                        color="secondary"
                        variant="outline"
                        size="sm"
                        onClick={() => descargarReceta(receta)}
                    >
                        <CIcon icon={cilCloudDownload} className="me-1" />
                        PDF
                    </CButton>
                    <CButton
                        type="button"
                        color="secondary"
                        variant="outline"
                        size="sm"
                        onClick={() => enviarRecetaPorCorreo(receta)}
                    >
                        <CIcon icon={cilEnvelopeClosed} className="me-1" />
                        Correo
                    </CButton>
                    {!readOnly && (
                        <CButton
                            type="button"
                            color="primary"
                            variant="outline"
                            size="sm"
                            onClick={() => editarReceta(receta)}
                        >
                            <CIcon icon={cilPencil} className="me-1" />
                            Editar
                        </CButton>
                    )}
                </div>
            </div>
            <ul className="mb-0 mt-2 ps-3 small">
                {(receta.medications ?? []).map((med, i) => (
                    <li key={`${receta.id}-${med.name}-${i}`}>{resumenMedicamento(med)}</li>
                ))}
            </ul>
        </div>
    )

    return (
        <CCard data-tour="receta-formulario">
            <CCardHeader className="d-flex flex-wrap align-items-center gap-2">
                <strong>
                    {readOnly
                        ? 'Recetas de esta consulta'
                        : etiquetaReceta(ordinalEditor, totalRecetas)}
                </strong>
                {!readOnly && recetaAbierta && (
                    <span className="small text-muted">{textoFolio(recetaAbierta)}</span>
                )}
            </CCardHeader>
            <CCardBody>
                {error && (
                    <div className="alert alert-danger mb-3" role="alert">
                        {error}
                    </div>
                )}
                {mensaje && (
                    <div className={`alert alert-${mensaje.tono} mb-3`} role="alert">
                        {mensaje.tono === 'success' && (
                            <CIcon icon={cilCheckAlt} className="me-2" />
                        )}
                        {mensaje.texto}
                    </div>
                )}

                {readOnly ? (
                    emitidas.length === 0 ? (
                        <div className="text-center py-4 text-muted border rounded">
                            No se emitio receta en esta consulta.
                        </div>
                    ) : (
                        emitidas.map((receta) => tarjetaReceta(receta))
                    )
                ) : (
                    <>
                        <CForm onSubmit={handleSubmit}>
                            {!capturaAbierta && (
                                <CButton
                                    type="button"
                                    color="primary"
                                    size="lg"
                                    className="w-100 mb-3 py-3 fw-semibold"
                                    data-tour="receta-captura"
                                    onClick={abrirCapturaVacia}
                                >
                                    <CIcon icon={cilPlus} className="me-2" />
                                    Agregar otro medicamento
                                </CButton>
                            )}

                            {capturaAbierta && (
                                <CCard className="mb-3 border-primary border-2" data-tour="receta-captura">
                                    <CCardBody>
                                        {/* Paso 1 - medicamento */}
                                        <div className="mb-3">
                                            <label className="form-label mb-0" htmlFor="medicamento">
                                                <strong>Medicamento</strong>
                                            </label>
                                            <div className="small text-muted mb-2">
                                                ¿Qué le vas a recetar?
                                            </div>

                                            {medicamentoElegido ? (
                                                <div className="d-flex justify-content-between align-items-center border border-primary rounded p-3 bg-body-tertiary">
                                                    <div>
                                                        <div className="small text-muted">
                                                            Medicamento seleccionado
                                                        </div>
                                                        <strong className="fs-5">
                                                            {borrador.name}
                                                        </strong>
                                                    </div>
                                                    <CButton
                                                        type="button"
                                                        color="primary"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={cambiarMedicamento}
                                                    >
                                                        Cambiar medicamento
                                                    </CButton>
                                                </div>
                                            ) : (
                                                <div className="position-relative">
                                                    <CFormInput
                                                        id="medicamento"
                                                        ref={campoNombreRef}
                                                        className="gems-campo"
                                                        value={nombreTecleado}
                                                        autoComplete="off"
                                                        placeholder={MARCA_ESCRITURA}
                                                        onChange={enMayusculas((valor) => {
                                                            setNombreTecleado(valor)
                                                            setResaltado(0)
                                                        })}
                                                        onKeyDown={tecladoEnNombre}
                                                    />
                                                    {nombreTecleado.trim() !== '' && (
                                                        <div
                                                            className="list-group position-absolute w-100 shadow-sm"
                                                            style={{ zIndex: 5 }}
                                                        >
                                                            {sugerencias.map((med, i) => (
                                                                <button
                                                                    key={med.id}
                                                                    type="button"
                                                                    className={`list-group-item list-group-item-action${resaltado === i ? ' active' : ''}`}
                                                                    onMouseEnter={() =>
                                                                        setResaltado(i)
                                                                    }
                                                                    onClick={() =>
                                                                        elegirDelVademecario(med)
                                                                    }
                                                                >
                                                                    {etiquetaFrecuente(med)}
                                                                </button>
                                                            ))}
                                                            <button
                                                                type="button"
                                                                className={`list-group-item list-group-item-action${resaltado === sugerencias.length ? ' active' : ''}`}
                                                                onMouseEnter={() =>
                                                                    setResaltado(sugerencias.length)
                                                                }
                                                                onClick={() =>
                                                                    elegirMedicamento(
                                                                        nombreTecleado.trim(),
                                                                    )
                                                                }
                                                            >
                                                                Usar &laquo;{nombreTecleado.trim()}
                                                                &raquo;
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Paso 2 - pauta en tres columnas */}
                                        <CRow className="mb-3 g-3">
                                            <CCol md={4}>
                                                <label className="form-label mb-0" htmlFor="dosis">
                                                    <strong>Dosis</strong>
                                                </label>
                                                <div className="small text-muted mb-1">
                                                    ¿Cuánto debe tomar?
                                                </div>
                                                <CFormInput
                                                    id="dosis"
                                                    autoComplete="off"
                                                    enterKeyHint="next"
                                                    className="gems-campo"
                                                    value={borrador.dosage}
                                                    placeholder={MARCA_ESCRITURA}
                                                    onChange={(e) =>
                                                        setBorrador({
                                                            ...borrador,
                                                            dosage: e.target.value,
                                                        })
                                                    }
                                                />
                                                <ChipsAtajo
                                                    opciones={ATAJOS_DOSIS}
                                                    tono="dosis"
                                                    valor={borrador.dosage}
                                                    onElegir={(v) =>
                                                        setBorrador({ ...borrador, dosage: v })
                                                    }
                                                />
                                            </CCol>
                                            <CCol md={4}>
                                                <label
                                                    className="form-label mb-0"
                                                    htmlFor="frecuencia"
                                                >
                                                    <strong>Frecuencia</strong>
                                                </label>
                                                <div className="small text-muted mb-1">
                                                    ¿Cada cuánto debe tomarlo?
                                                </div>
                                                <CFormInput
                                                    id="frecuencia"
                                                    autoComplete="off"
                                                    enterKeyHint="next"
                                                    className="gems-campo"
                                                    value={borrador.frequency}
                                                    placeholder={MARCA_ESCRITURA}
                                                    onChange={(e) =>
                                                        setBorrador({
                                                            ...borrador,
                                                            frequency: e.target.value,
                                                        })
                                                    }
                                                />
                                                <ChipsAtajo
                                                    opciones={ATAJOS_FRECUENCIA}
                                                    tono="frecuencia"
                                                    valor={borrador.frequency}
                                                    onElegir={(v) =>
                                                        setBorrador({ ...borrador, frequency: v })
                                                    }
                                                />
                                            </CCol>
                                            <CCol md={4}>
                                                <label
                                                    className="form-label mb-0"
                                                    htmlFor="duracion"
                                                >
                                                    <strong>Duración</strong>
                                                </label>
                                                <div className="small text-muted mb-1">
                                                    ¿Por cuántos días?
                                                </div>
                                                <CFormInput
                                                    id="duracion"
                                                    autoComplete="off"
                                                    enterKeyHint="next"
                                                    className="gems-campo"
                                                    value={borrador.duration}
                                                    placeholder={MARCA_ESCRITURA}
                                                    onChange={(e) =>
                                                        setBorrador({
                                                            ...borrador,
                                                            duration: e.target.value,
                                                        })
                                                    }
                                                />
                                                <ChipsAtajo
                                                    opciones={ATAJOS_DURACION}
                                                    tono="duracion"
                                                    valor={borrador.duration}
                                                    onElegir={(v) =>
                                                        setBorrador({ ...borrador, duration: v })
                                                    }
                                                />
                                            </CCol>
                                        </CRow>

                                        {/* Paso 3 - como se surte: presentacion, via y
                                            cantidad. La farmacia necesita estos datos para
                                            despachar sin llamar al consultorio. */}
                                        <CRow className="mb-3 g-3" data-tour="receta-detalles">
                                            <CCol md={4}>
                                                <label
                                                    className="form-label mb-0"
                                                    htmlFor="presentacion"
                                                >
                                                    <strong>Presentación</strong>
                                                </label>
                                                <div className="small text-muted mb-1">
                                                    Tabletas, cápsulas, solución&hellip;
                                                </div>
                                                <CFormInput
                                                    id="presentacion"
                                                    autoComplete="off"
                                                    enterKeyHint="next"
                                                    className="gems-campo"
                                                    value={borrador.presentation || ''}
                                                    placeholder={MARCA_ESCRITURA}
                                                    onChange={enMayusculas((valor) =>
                                                        setBorrador({
                                                            ...borrador,
                                                            presentation: valor,
                                                        }),
                                                    )}
                                                />
                                                <ChipsAtajo
                                                    opciones={ATAJOS_PRESENTACION}
                                                    tono="dosis"
                                                    valor={borrador.presentation || ''}
                                                    onElegir={(v) =>
                                                        setBorrador({
                                                            ...borrador,
                                                            presentation: v,
                                                        })
                                                    }
                                                />
                                            </CCol>
                                            <CCol md={4}>
                                                <label className="form-label mb-0" htmlFor="via">
                                                    <strong>Vía</strong>
                                                </label>
                                                <div className="small text-muted mb-1">
                                                    Por dónde se administra
                                                </div>
                                                <CFormInput
                                                    id="via"
                                                    autoComplete="off"
                                                    enterKeyHint="next"
                                                    className="gems-campo"
                                                    value={borrador.route || ''}
                                                    placeholder={MARCA_ESCRITURA}
                                                    onChange={enMayusculas((valor) =>
                                                        setBorrador({ ...borrador, route: valor }),
                                                    )}
                                                />
                                                <ChipsAtajo
                                                    opciones={ATAJOS_VIA}
                                                    tono="frecuencia"
                                                    valor={borrador.route || ''}
                                                    onElegir={(v) =>
                                                        setBorrador({ ...borrador, route: v })
                                                    }
                                                />
                                            </CCol>
                                            <CCol md={4}>
                                                <label
                                                    className="form-label mb-0"
                                                    htmlFor="cantidad"
                                                >
                                                    <strong>Cantidad a surtir</strong>
                                                </label>
                                                <div className="small text-muted mb-1">
                                                    Cuánto entrega la farmacia
                                                </div>
                                                <CFormInput
                                                    id="cantidad"
                                                    autoComplete="off"
                                                    enterKeyHint="next"
                                                    className="gems-campo"
                                                    value={borrador.quantity || ''}
                                                    placeholder={MARCA_ESCRITURA}
                                                    onChange={enMayusculas((valor) =>
                                                        setBorrador({
                                                            ...borrador,
                                                            quantity: valor,
                                                        }),
                                                    )}
                                                />
                                            </CCol>
                                        </CRow>

                                        {/* Paso 4 - lo propio de ESTE medicamento. Se
                                            imprime bajo su renglon, no con las indicaciones
                                            generales del pie. */}
                                        <div className="mb-3">
                                            <label className="form-label mb-0" htmlFor="nota-med">
                                                <strong>Indicaciones de este medicamento</strong>
                                                <span className="text-muted fw-normal">
                                                    {' '}
                                                    (opcional)
                                                </span>
                                            </label>
                                            <div className="small text-muted mb-1">
                                                Solo para este medicamento: &laquo;tomar con
                                                alimentos&raquo;, &laquo;no acostarse después&raquo;&hellip;
                                            </div>
                                            <CFormInput
                                                id="nota-med"
                                                autoComplete="off"
                                                enterKeyHint="next"
                                                className="gems-campo"
                                                maxLength={LIMITE_NOTA_MEDICAMENTO}
                                                value={borrador.notes || ''}
                                                placeholder={MARCA_ESCRITURA}
                                                onChange={enMayusculas((valor) =>
                                                    setBorrador({ ...borrador, notes: valor }),
                                                )}
                                            />
                                        </div>

                                        {aviso && (
                                            <div className="alert alert-warning py-2" role="alert">
                                                {aviso}
                                            </div>
                                        )}

                                        <div className="d-flex justify-content-end gap-2">
                                            <CButton
                                                type="button"
                                                color="secondary"
                                                variant="outline"
                                                onClick={limpiarBorrador}
                                            >
                                                Limpiar todo
                                            </CButton>
                                            <CButton
                                                type="button"
                                                color="primary"
                                                onClick={agregarALaReceta}
                                            >
                                                <CIcon icon={cilPlus} className="me-1" />
                                                {editando !== null
                                                    ? 'Guardar cambios'
                                                    : 'Agregar a receta'}
                                            </CButton>
                                        </div>
                                    </CCardBody>
                                </CCard>
                            )}

                            {/* Medicamentos ya agregados: se apilan hacia abajo */}
                            <div className="mb-3" data-tour="receta-lista">
                                <label className="form-label">
                                    <strong>
                                        Medicamentos en la receta ({medications.length})
                                    </strong>
                                </label>
                                {medications.length === 0 ? (
                                    <div className="text-center py-4 text-muted border rounded">
                                        Todavía no hay medicamentos en esta receta.
                                    </div>
                                ) : (
                                    medications.map((med, index) => (
                                        <div
                                            key={`${med.name}-${index}`}
                                            className="d-flex justify-content-between align-items-center border rounded p-2 mb-2"
                                        >
                                            <div className="me-2">
                                                <span className="text-primary fw-bold me-2">
                                                    {index + 1}.
                                                </span>
                                                {resumenMedicamento(med)}
                                            </div>
                                            <div className="d-flex gap-1">
                                                <CButton
                                                    type="button"
                                                    color="primary"
                                                    variant="ghost"
                                                    size="sm"
                                                    title="Editar medicamento"
                                                    onClick={() => editarMedicamento(index)}
                                                >
                                                    <CIcon icon={cilPencil} />
                                                </CButton>
                                                <CButton
                                                    type="button"
                                                    color="danger"
                                                    variant="ghost"
                                                    size="sm"
                                                    title="Quitar medicamento"
                                                    onClick={() => quitarMedicamento(index)}
                                                >
                                                    <CIcon icon={cilTrash} />
                                                </CButton>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Motivo de consulta. Arranca apagado a proposito: la
                                receta se entrega impresa y viaja a la farmacia, asi que
                                el expediente no va en ella salvo que el médico lo pida
                                para este paciente. */}
                            <div className="mb-3" data-tour="receta-motivo">
                                <CFormSwitch
                                    id="incluir-motivo"
                                    label="Incluir el motivo de la consulta en esta receta"
                                    checked={incluirMotivo}
                                    onChange={(e) => cambiarIncluirMotivo(e.target.checked)}
                                />
                                <div className="small text-muted ms-4">
                                    Se imprime bajo los datos del paciente. Lo decides tú,
                                    y solo para esta receta.
                                </div>
                                {incluirMotivo && (
                                    <div className="ms-4 mt-2">
                                        <label className="form-label mb-1" htmlFor="motivo">
                                            <strong>Motivo de la consulta</strong>
                                        </label>
                                        <CFormTextarea
                                            id="motivo"
                                            className="gems-campo"
                                            rows={2}
                                            maxLength={LIMITE_MOTIVO}
                                            placeholder={MARCA_ESCRITURA}
                                            value={diagnosis}
                                            onChange={enMayusculas(setDiagnosis)}
                                        />
                                        <div className="d-flex justify-content-between align-items-center small text-muted">
                                            <span>
                                                {diagnosis.length}/{LIMITE_MOTIVO}
                                            </span>
                                            {motivoSugerido && motivoSugerido !== diagnosis && (
                                                <CButton
                                                    type="button"
                                                    size="sm"
                                                    color="secondary"
                                                    variant="outline"
                                                    onClick={() => setDiagnosis(motivoSugerido)}
                                                >
                                                    Usar lo que dijo el paciente en el triage
                                                </CButton>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Indicaciones adicionales de la receta */}
                            <div className="mb-3" data-tour="receta-indicaciones">
                                <label htmlFor="instructions" className="form-label mb-0">
                                    <strong>Indicaciones adicionales (opcional)</strong>
                                </label>
                                <div className="small text-muted mb-1">
                                    Se imprimen al pie de la receta
                                </div>
                                <CFormTextarea
                                    id="instructions"
                                    className="gems-campo"
                                    rows={3}
                                    maxLength={LIMITE_INDICACIONES}
                                    placeholder={MARCA_ESCRITURA}
                                    value={instructions}
                                    onChange={enMayusculas(setInstructions)}
                                />
                                <div className="d-flex justify-content-end small text-muted">
                                    {instructions.length}/{LIMITE_INDICACIONES}
                                </div>
                                <div className="d-flex flex-wrap gap-1">
                                    {SUGERENCIAS_INDICACIONES.map((sugerencia) => (
                                        <CButton
                                            key={sugerencia}
                                            type="button"
                                            size="sm"
                                            color="secondary"
                                            variant="outline"
                                            onClick={() => anadirSugerenciaIndicacion(sugerencia)}
                                        >
                                            {sugerencia}
                                        </CButton>
                                    ))}
                                </div>
                            </div>

                            {/* Una receta se imprime siempre: ese es el boton primario. */}
                            <div className="d-grid gap-2 d-md-flex justify-content-md-end" data-tour="receta-botones">
                                <CButton
                                    type="button"
                                    color="info"
                                    variant="outline"
                                    onClick={handlePreview}
                                    disabled={loading}
                                >
                                    Vista previa
                                </CButton>
                                <CButton
                                    type="submit"
                                    color="primary"
                                    variant="outline"
                                    disabled={loading}
                                >
                                    {loading && <CSpinner size="sm" className="me-2" />}
                                    Guardar
                                </CButton>
                                <CButton
                                    type="button"
                                    color="primary"
                                    onClick={guardarEImprimir}
                                    disabled={loading}
                                >
                                    <CIcon icon={cilPrint} className="me-2" />
                                    Guardar e imprimir
                                </CButton>
                            </div>
                        </CForm>

                        {/* Crear otra receta es una decision explicita, nunca un descuido. */}
                        {recetaAbierta && (
                            <div className="mt-3 pt-3 border-top" data-tour="receta-otra">
                                <CButton
                                    type="button"
                                    color="success"
                                    variant="outline"
                                    onClick={agregarOtraReceta}
                                >
                                    <CIcon icon={cilPlus} className="me-1" />
                                    Agregar otra receta
                                </CButton>
                            </div>
                        )}

                        {otrasRecetas.length > 0 && (
                            <div className="mt-3">
                                <div className="fw-semibold mb-2">
                                    Otras recetas de esta consulta
                                </div>
                                {otrasRecetas.map((receta) => tarjetaReceta(receta))}
                            </div>
                        )}
                    </>
                )}
            </CCardBody>

            {/* Preview & Summary Modal */}
            <CModal visible={showPreview} onClose={() => setShowPreview(false)} size="xl">
                <CCardHeader>
                    <strong>Vista previa de la receta</strong>
                </CCardHeader>
                <CCardBody>
                    {loading && !previewUrl ? (
                        <div className="text-center p-5">
                            <CSpinner color="primary" />
                            <p className="mt-2">Generando vista previa del documento...</p>
                        </div>
                    ) : previewUrl ? (
                        <div style={{ height: '70vh' }}>
                            <iframe
                                src={previewUrl}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                title="Vista previa"
                            />
                        </div>
                    ) : (
                        <div className="text-center text-danger p-5">
                            Error al cargar la vista previa.
                        </div>
                    )}
                </CCardBody>
                <div className="modal-footer">
                    <CButton color="secondary" onClick={() => setShowPreview(false)}>
                        Cerrar y Editar
                    </CButton>
                    <CButton
                        color="success"
                        onClick={guardarEImprimir}
                        className="text-white"
                        disabled={loading}
                    >
                        <CIcon icon={cilCloudDownload} className="me-2" />
                        Confirmar e Imprimir
                    </CButton>
                </div>
            </CModal>
        </CCard>
    )
}

export default PrescriptionForm
