/**
 * Capturar la imagen que se ve, y guardarla como corte clave si se quiere.
 *
 * Una sola ventana para los dos usos: la captura (descargarla o copiarla) y el
 * corte clave (marcarlo con su nombre y su nota, y guardar la captura en el
 * expediente). Muestra la vista previa **exacta** de lo que se va a descargar o
 * guardar, con su sello, para que no haya sorpresas.
 *
 * Reglas:
 * - El nombre del paciente no va en la imagen salvo que se pida (una captura
 *   suelta se reenvía y se queda en cualquier teléfono).
 * - Si se pidieron las mediciones y no se pudieron dibujar, se dice; no se
 *   entrega una captura «sin mediciones» como si fuera la que se pidió.
 * - Nada dice «guardado» hasta que el servidor lo confirmó.
 */
import { useEffect, useRef, useState } from 'react'
import {
  CAlert,
  CButton,
  CFormCheck,
  CFormInput,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CSpinner,
} from '@coreui/react-pro'

import { etiquetaSugerida, nombreDeArchivoCaptura, type DatosDeCaptura } from '../dominio/captura'
import type { CorteClave } from '../dominio/cortesClave'
import { mensajeDeFallo } from '../servicios/mensajes'
import {
  copiarImagen,
  descargarBlob,
  puedeCopiarImagen,
  type CapturaComponer,
} from '../servicios/capturaCanvas'

interface Props {
  visible: boolean
  /** `clave` abre con el nombre y la nota a la vista; `captura`, sólo con la imagen. */
  modo: 'captura' | 'clave'
  onClose: () => void
  datos: DatosDeCaptura
  nombreDelPaciente?: string | null
  /** Compone la captura del momento. Lo implementa la página, que tiene la pila. */
  componer: (opciones: { marcas: boolean; paciente: boolean }) => Promise<CapturaComponer>
  marcaExistente: CorteClave | null
  onGuardarClave: (datos: { label: string; notes: string; imagen: Blob | null }) => Promise<void>
  onQuitarClave?: () => Promise<void>
}

type Aviso = { tono: 'ok' | 'error'; texto: string }

export default function ModalCaptura({
  visible,
  modo,
  onClose,
  datos,
  nombreDelPaciente,
  componer,
  marcaExistente,
  onGuardarClave,
  onQuitarClave,
}: Props) {
  const [incluirMarcas, setIncluirMarcas] = useState(true)
  const [incluirPaciente, setIncluirPaciente] = useState(false)
  const [guardarImagen, setGuardarImagen] = useState(true)
  const [etiqueta, setEtiqueta] = useState('')
  const [notas, setNotas] = useState('')
  const [captura, setCaptura] = useState<CapturaComponer | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const numeroDeGeneracion = useRef(0)

  // Al abrir: los campos arrancan con lo que ya tenga la marca, o con una
  // sugerencia (serie y corte) que se puede cambiar.
  useEffect(() => {
    if (!visible) return
    setEtiqueta(marcaExistente?.label ?? etiquetaSugerida(datos.serie, datos.indice))
    setNotas(marcaExistente?.notes ?? '')
    setGuardarImagen(true)
    setAviso(null)
  }, [visible])

  // La vista previa se rehace cuando cambian las opciones. Si dos se cruzan, gana
  // la última: una imagen vieja no debe pisar a una nueva.
  useEffect(() => {
    if (!visible) {
      setCaptura(null)
      return
    }
    const numero = ++numeroDeGeneracion.current
    setGenerando(true)
    componer({ marcas: incluirMarcas, paciente: incluirPaciente })
      .then((resultado) => {
        if (numero !== numeroDeGeneracion.current) return
        setCaptura(resultado)
        setAviso((previo) =>
          incluirMarcas && !resultado.marcasIncluidas
            ? {
                tono: 'error',
                texto:
                  'No se pudieron dibujar las mediciones en la captura. Desmarca «Incluir las mediciones» para continuar sin ellas.',
              }
            : previo?.tono === 'error' && previo.texto.startsWith('No se pudieron dibujar')
              ? null
              : previo
        )
      })
      .catch((fallo) => {
        if (numero !== numeroDeGeneracion.current) return
        setCaptura(null)
        setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
      })
      .finally(() => {
        if (numero === numeroDeGeneracion.current) setGenerando(false)
      })
    // `componer` cambia en cada render de la página; las opciones son lo que importa.
  }, [visible, incluirMarcas, incluirPaciente])

  // La URL de la vista previa se libera al cambiar o cerrar.
  useEffect(() => {
    if (!captura) {
      setVistaPrevia(null)
      return
    }
    const url = URL.createObjectURL(captura.blob)
    setVistaPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [captura])

  const faltanMarcas = incluirMarcas && captura !== null && !captura.marcasIncluidas

  const descargar = () => {
    if (!captura) return
    descargarBlob(captura.blob, nombreDeArchivoCaptura(datos))
    setAviso({ tono: 'ok', texto: 'Imagen descargada.' })
  }

  const copiar = async () => {
    if (!captura) return
    try {
      await copiarImagen(captura.blob)
      setAviso({ tono: 'ok', texto: 'Imagen copiada. Pégala donde la necesites.' })
    } catch (fallo) {
      setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
    }
  }

  const guardarClave = async () => {
    setOcupado(true)
    try {
      await onGuardarClave({
        label: etiqueta.trim(),
        notes: notas.trim(),
        imagen: guardarImagen && captura ? captura.blob : null,
      })
      onClose()
    } catch (fallo) {
      setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
    } finally {
      setOcupado(false)
    }
  }

  const quitar = async () => {
    if (!onQuitarClave) return
    setOcupado(true)
    try {
      await onQuitarClave()
      onClose()
    } catch (fallo) {
      setAviso({ tono: 'error', texto: mensajeDeFallo(fallo) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="lg" backdrop="static">
      <CModalHeader>
        <CModalTitle>{modo === 'clave' ? 'Corte clave' : 'Capturar la imagen'}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="visor-captura">
          <div className="visor-captura__previa" aria-live="polite">
            {generando && !vistaPrevia && (
              <span className="visor-captura__espera">
                <CSpinner size="sm" /> Preparando la captura…
              </span>
            )}
            {vistaPrevia && (
              <img src={vistaPrevia} alt="Vista previa de la captura" className="visor-captura__imagen" />
            )}
          </div>

          <div className="visor-captura__opciones">
            <CFormCheck
              id="captura-marcas"
              label="Incluir las mediciones"
              checked={incluirMarcas}
              onChange={(evento) => setIncluirMarcas(evento.target.checked)}
            />
            <CFormCheck
              id="captura-paciente"
              label={`Escribir el nombre del paciente en la imagen${nombreDelPaciente ? ` (${nombreDelPaciente})` : ''}`}
              disabled={!nombreDelPaciente}
              checked={incluirPaciente && Boolean(nombreDelPaciente)}
              onChange={(evento) => setIncluirPaciente(evento.target.checked)}
            />
            <p className="visor-encabezado__meta mb-0">
              La imagen lleva el estudio, la serie, la fecha y el corte, y la leyenda «Material de
              apoyo · No es un informe radiológico».
            </p>

            <hr />
            <div className="visor-panel__titulo">
              {marcaExistente ? 'Este corte ya es clave' : 'Guardar como corte clave'}
            </div>
            <label className="form-label small mb-1" htmlFor="clave-etiqueta">
              Nombre
            </label>
            <CFormInput
              id="clave-etiqueta"
              size="sm"
              value={etiqueta}
              maxLength={120}
              placeholder="Ej. Lesión frontal derecha"
              onChange={(evento) => setEtiqueta(evento.target.value)}
            />
            <label className="form-label small mb-1 mt-2" htmlFor="clave-notas">
              Nota (opcional)
            </label>
            <CFormTextarea
              id="clave-notas"
              rows={2}
              maxLength={2000}
              value={notas}
              placeholder="Qué se ve o por qué importa este corte"
              onChange={(evento) => setNotas(evento.target.value)}
            />
            <CFormCheck
              className="mt-2"
              id="clave-con-imagen"
              label="Guardar también la captura en el expediente"
              checked={guardarImagen}
              onChange={(evento) => setGuardarImagen(evento.target.checked)}
            />
          </div>
        </div>

        {aviso && (
          <CAlert color={aviso.tono === 'ok' ? 'success' : 'danger'} className="py-2 mt-3 mb-0" role="status">
            {aviso.texto}
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter className="visor-captura__pie">
        {marcaExistente && onQuitarClave && (
          <CButton color="danger" variant="ghost" disabled={ocupado} onClick={() => void quitar()} className="me-auto">
            Quitar la marca
          </CButton>
        )}
        <CButton color="secondary" variant="outline" disabled={!captura || faltanMarcas} onClick={descargar}>
          Descargar
        </CButton>
        <CButton
          color="secondary"
          variant="outline"
          disabled={!captura || faltanMarcas || !puedeCopiarImagen()}
          title={puedeCopiarImagen() ? undefined : 'Este navegador no permite copiar imágenes'}
          onClick={() => void copiar()}
        >
          Copiar
        </CButton>
        <CButton color="primary" disabled={ocupado || generando || (guardarImagen && (!captura || faltanMarcas))} onClick={() => void guardarClave()}>
          {ocupado ? (
            <>
              <CSpinner size="sm" className="me-1" /> Guardando…
            </>
          ) : marcaExistente ? (
            'Actualizar el corte clave'
          ) : (
            'Guardar como corte clave'
          )}
        </CButton>
        <CButton color="secondary" variant="ghost" onClick={onClose}>
          Cerrar
        </CButton>
      </CModalFooter>
    </CModal>
  )
}
