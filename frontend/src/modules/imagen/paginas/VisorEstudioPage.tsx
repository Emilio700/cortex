/**
 * Visor de un estudio: la imagen, sus series y lo que el médico hace con ella.
 *
 * El acomodo sigue una regla: **el análisis no cambia de pantalla**. Series a la
 * izquierda, imagen al centro con su barra de herramientas y su deslizador de
 * cortes, y a la derecha un panel con pestañas donde viven las mediciones, los
 * cortes clave, la comparación con estudios previos y la ficha del estudio.
 * Cuando existan la volumetría o la segmentación, entran en esa misma pestaña
 * como un derivado del estudio, no como otro módulo que hay que abrir aparte.
 *
 * Lo que toca Cornerstone vive en `servicios/pila.ts`; aquí sólo se decide qué
 * pedirle y qué mostrar. Todo lo que no necesita GPU está en `dominio/` y se
 * prueba con vitest.
 *
 * Qué se puede hacer con lo que se ve:
 * - Medir distancia, ángulo y área (elipse); guardarlo como dato del estudio.
 * - Capturar la imagen (con sus mediciones y un sello) para descargarla,
 *   copiarla o guardarla en el expediente.
 * - Marcar cortes clave, con nombre, nota y la vista exacta con que se marcaron.
 * - Compartir: hoja en PDF o enlace temporal sin identidad del paciente.
 * - Modo presentación para enseñárselo al paciente, y pantalla completa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CAlert,
  CBadge,
  CButton,
  CNav,
  CNavItem,
  CNavLink,
  CSpinner,
} from '@coreui/react-pro'

import { mensajeDeFallo } from '../servicios/mensajes'
import { rutaDelExpediente } from '../../expediente/rutas'
import { useAuth } from '../../../shared/context/AuthContext'
import AyudaDeAtajos from '../componentes/AyudaDeAtajos'
import BotonModelo3D from '../componentes/BotonModelo3D'
import BotonVer3D from '../componentes/BotonVer3D'
import BarraDelVisor from '../componentes/BarraDelVisor'
import ModalCaptura from '../componentes/ModalCaptura'
import ModalCompartir from '../componentes/ModalCompartir'
import PanelCortesClave from '../componentes/PanelCortesClave'
import PanelEstudiosPrevios from '../componentes/PanelEstudiosPrevios'
import PanelFichaEstudio from '../componentes/PanelFichaEstudio'
import PanelMediciones from '../componentes/PanelMediciones'
import PanelSeries from '../componentes/PanelSeries'
import SelectorDeCortes from '../componentes/SelectorDeCortes'
import { accionDeTecla, estaEscribiendo, type AccionDelVisor } from '../dominio/atajos'
import { LEYENDA_DE_CAPTURA, lineasDelSello } from '../dominio/captura'
import {
  cortesClaveVecino,
  cortesDeSerie,
  estadoDeVistaGuardada,
  marcaDelCorte,
  vistaParaGuardar,
  type CorteClave,
} from '../dominio/cortesClave'
import { evolucionDeMedida, type Evolucion } from '../dominio/medidas'
import type { MedicionTrazada } from '../dominio/mediciones'
import { presetsParaModalidad, textoDeVentana } from '../dominio/presets'
import {
  corteEquivalente,
  emparejarSerie,
  estadoDeEstudio,
  fechaCorta,
  nombreDeSerie,
  ordenarSeries,
  resumenDeEstudio,
  serieInicial,
  type AnotacionDicom,
  type CandidatoComparacion,
  type EstudioDicom,
  type ManifiestoSerie,
  type SerieDicom,
} from '../dominio/tipos'
import { componerCaptura, descargarBlob } from '../servicios/capturaCanvas'
import { FPS_POR_OMISION, type EstadoDeVista } from '../servicios/controlesDeVista'
import { prepararVisor } from '../servicios/cornerstone'
import { cortesClaveApi, estudiosApi } from '../servicios/estudiosApi'
import { crearPila, type Herramienta, type Pila } from '../servicios/pila'
import '../ui/visor.css'

type Pestana = 'mediciones' | 'claves' | 'comparar' | 'estudio'
type Aviso = { tono: 'ok' | 'error'; texto: string }

const HERRAMIENTA_DE_ACCION: Partial<Record<AccionDelVisor, Herramienta>> = {
  'herramienta-ventana': 'ventana',
  'herramienta-medir': 'medir',
  'herramienta-angulo': 'angulo',
  'herramienta-area': 'area',
  'herramienta-desplazar': 'desplazar',
  'herramienta-zoom': 'zoom',
}

export default function VisorEstudioPage() {
  const { patientId, studyId } = useParams<{ patientId: string; studyId: string }>()
  // Modelo 3D desde TC (feat/modelo-3d-desde-tc): sólo con el módulo encendido.
  const { can, tieneModulo } = useAuth()
  const [estudio, setEstudio] = useState<EstudioDicom | null>(null)
  const [nombreDelPaciente, setNombreDelPaciente] = useState<string | null>(null)
  const [candidatos, setCandidatos] = useState<CandidatoComparacion[]>([])
  const [serieActiva, setSerieActiva] = useState<SerieDicom | null>(null)
  const [medidas, setMedidas] = useState<AnotacionDicom[]>([])
  const [marcas, setMarcas] = useState<CorteClave[]>([])
  const [pendiente, setPendiente] = useState<MedicionTrazada | null>(null)
  const [etiqueta, setEtiqueta] = useState('')
  const [herramienta, setHerramienta] = useState<Herramienta>('ventana')
  const [pestana, setPestana] = useState<Pestana>('mediciones')
  const [compararCon, setCompararCon] = useState('')
  const [previo, setPrevio] = useState<EstudioDicom | null>(null)
  const [avisoComparacion, setAvisoComparacion] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avisoVisor, setAvisoVisor] = useState<string | null>(null)
  // Render volumétrico: el manifiesto de la serie activa decide si hay «Ver en 3D».
  const [manifiestoActivo, setManifiestoActivo] = useState<ManifiestoSerie | null>(null)

  const [vista, setVista] = useState<EstadoDeVista | null>(null)
  const [cineActivo, setCineActivo] = useState(false)
  const [fps, setFps] = useState<number>(FPS_POR_OMISION)
  const [modalCaptura, setModalCaptura] = useState<null | 'captura' | 'clave'>(null)
  const [compartirVisible, setCompartirVisible] = useState(false)
  const [ayudaVisible, setAyudaVisible] = useState(false)
  const [presentacion, setPresentacion] = useState(false)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const [avisoPdf, setAvisoPdf] = useState<Aviso | null>(null)

  const refEscenario = useRef<HTMLDivElement>(null)
  const refIzquierda = useRef<HTMLDivElement>(null)
  const refDerecha = useRef<HTMLDivElement>(null)
  const pilaIzquierda = useRef<Pila | null>(null)
  const pilaDerecha = useRef<Pila | null>(null)
  /** Al abrir un corte clave de otra serie: dónde caer cuando esa serie cargue. */
  const saltoPendiente = useRef<{ indice: number; vista: Partial<EstadoDeVista> } | null>(null)
  const herramientaActual = useRef<Herramienta>('ventana')
  herramientaActual.current = herramienta

  const cargarEstudio = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [detalle, candidatosResp] = await Promise.all([
        estudiosApi.detalle(studyId ?? ''),
        estudiosApi.candidatos(studyId ?? ''),
      ])
      setEstudio(detalle)
      setMedidas(detalle.annotations ?? [])
      setCandidatos(candidatosResp)
      setSerieActiva(serieInicial(detalle.series ?? []))
    } catch (fallo) {
      setError(mensajeDeFallo(fallo))
    } finally {
      setCargando(false)
    }
    // Lo demás no es imprescindible para ver el estudio: si falla, se dice y se sigue.
    try {
      const lista = await cortesClaveApi.listar(studyId ?? '')
      // Una respuesta que no es una lista no se toma por «sin cortes clave»: se descarta.
      setMarcas(Array.isArray(lista) ? lista : [])
    } catch (fallo) {
      setAvisoVisor(`No se pudieron cargar los cortes clave. ${mensajeDeFallo(fallo)}`)
    }
    try {
      setNombreDelPaciente((await estudiosApi.nombreDelPaciente(patientId ?? '')) ?? null)
    } catch {
      setNombreDelPaciente(null)
    }
  }, [studyId, patientId])

  useEffect(() => {
    void cargarEstudio()
  }, [cargarEstudio])

  /** La pila de la izquierda manda: la de la derecha (previo) la sigue. */
  const sincronizarDerecha = useCallback((indice: number, total: number) => {
    const derecha = pilaDerecha.current
    if (derecha) derecha.irA(corteEquivalente(indice, total, derecha.total()))
  }, [])

  const alMedir = useCallback((medicion: MedicionTrazada) => {
    setPendiente(medicion)
    setPestana('mediciones')
  }, [])

  // Pila del estudio actual.
  useEffect(() => {
    const elemento = refIzquierda.current
    if (!elemento || !serieActiva) return
    let cancelado = false
    setAvisoVisor(null)
    setVista(null)
    setCineActivo(false)
    setManifiestoActivo(null)

    const montar = async () => {
      try {
        await prepararVisor()
        if (cancelado) return
        pilaIzquierda.current?.destruir()
        pilaIzquierda.current = null
        const manifiesto = await estudiosApi.manifiesto(serieActiva.id)
        if (cancelado) return
        setManifiestoActivo(manifiesto)
        const pila = await crearPila({
          elemento,
          manifiesto,
          sufijo: 'izq',
          herramienta: herramientaActual.current,
          alMedir,
          alCambiar: setVista,
          alDesplazar: sincronizarDerecha,
        })
        if (cancelado) {
          pila.destruir()
          return
        }
        pilaIzquierda.current = pila
        const salto = saltoPendiente.current
        if (salto) {
          saltoPendiente.current = null
          pila.irA(salto.indice)
          pila.aplicarEstado(salto.vista)
        }
      } catch (fallo) {
        if (!cancelado) setAvisoVisor(mensajeDeFallo(fallo))
      }
    }

    void montar()
    return () => {
      cancelado = true
    }
  }, [serieActiva?.id, alMedir, sincronizarDerecha])

  // Pila del estudio previo, cuando se pide comparar.
  useEffect(() => {
    const elemento = refDerecha.current
    setAvisoComparacion(null)
    if (!compararCon) {
      pilaDerecha.current?.destruir()
      pilaDerecha.current = null
      setPrevio(null)
      return
    }
    if (!elemento || !serieActiva) return
    let cancelado = false

    const montar = async () => {
      try {
        const anterior = await estudiosApi.detalle(compararCon)
        if (cancelado) return
        setPrevio(anterior)
        const pareja = emparejarSerie(anterior.series ?? [], serieActiva)
        if (!pareja) {
          pilaDerecha.current?.destruir()
          pilaDerecha.current = null
          setAvisoComparacion(
            'El estudio previo no tiene una serie equivalente a la que estás viendo. Elige otra serie para comparar.'
          )
          return
        }
        pilaDerecha.current?.destruir()
        const manifiesto = await estudiosApi.manifiesto(pareja.id)
        if (cancelado) return
        const pila = await crearPila({
          elemento,
          manifiesto,
          sufijo: 'der',
          herramienta: 'ventana',
          alDesplazar: (indice, total) => {
            const izquierda = pilaIzquierda.current
            if (izquierda) izquierda.irA(corteEquivalente(indice, total, izquierda.total()))
          },
        })
        if (cancelado) {
          pila.destruir()
          return
        }
        pilaDerecha.current = pila
      } catch (fallo) {
        if (!cancelado) setAvisoComparacion(mensajeDeFallo(fallo))
      }
    }

    void montar()
    return () => {
      cancelado = true
    }
  }, [compararCon, serieActiva?.id])

  useEffect(() => {
    pilaIzquierda.current?.aplicarHerramienta(herramienta)
  }, [herramienta])

  // Al salir del visor no debe quedar ningún motor vivo.
  useEffect(
    () => () => {
      pilaIzquierda.current?.destruir()
      pilaDerecha.current?.destruir()
      pilaIzquierda.current = null
      pilaDerecha.current = null
    },
    []
  )

  // ── Mediciones ────────────────────────────────────────────────────────────
  const guardarMedicion = async () => {
    if (!pendiente || !estudio || !serieActiva) return
    try {
      const guardada = await estudiosApi.guardarMedicion(estudio.id, {
        kind: pendiente.kind,
        series_id: serieActiva.id,
        geometry: { annotation_uid: pendiente.annotationUID, ...pendiente.detalle },
        value: Number(pendiente.value.toFixed(1)),
        unit: pendiente.unit,
        label: etiqueta.trim() || null,
      })
      setMedidas((anteriores) => [...anteriores, guardada])
      setPendiente(null)
      setEtiqueta('')
      setAvisoVisor(null)
    } catch (fallo) {
      setAvisoVisor(mensajeDeFallo(fallo))
    }
  }

  const confirmarMedicion = async (medicion: AnotacionDicom) => {
    try {
      const confirmada = await estudiosApi.confirmarMedicion(medicion.id)
      setMedidas((anteriores) => anteriores.map((m) => (m.id === confirmada.id ? confirmada : m)))
    } catch (fallo) {
      setAvisoVisor(mensajeDeFallo(fallo))
    }
  }

  const borrarMedicion = async (medicion: AnotacionDicom) => {
    try {
      await estudiosApi.borrarMedicion(medicion.id)
      setMedidas((anteriores) => anteriores.filter((m) => m.id !== medicion.id))
    } catch (fallo) {
      setAvisoVisor(mensajeDeFallo(fallo))
    }
  }

  // Evolución contra el estudio previo elegido: se calcula aquí, no en el
  // servidor, porque depende de qué estudio decidió comparar el médico.
  const evoluciones = useMemo(() => {
    const mapa: Record<number, Evolucion | null> = {}
    for (const medicion of medidas) {
      mapa[medicion.id] = evolucionDeMedida(medicion, previo?.annotations ?? [])
    }
    return mapa
  }, [medidas, previo])

  // ── Cortes y vista ────────────────────────────────────────────────────────
  const moverA = useCallback(
    (indice: number) => {
      const pila = pilaIzquierda.current
      if (!pila) return
      pila.irA(indice)
      sincronizarDerecha(indice, pila.total())
    },
    [sincronizarDerecha]
  )

  const alternarCine = useCallback(() => {
    const pila = pilaIzquierda.current
    if (!pila) return
    if (pila.cine.activo()) {
      pila.cine.detener()
      setCineActivo(false)
    } else {
      pila.cine.iniciar(fps)
      setCineActivo(pila.cine.activo())
    }
  }, [fps])

  const cambiarFps = (nuevo: number) => {
    setFps(nuevo)
    const pila = pilaIzquierda.current
    if (pila?.cine.activo()) pila.cine.iniciar(nuevo)
  }

  const aplicarPreset = (id: string) => {
    const pila = pilaIzquierda.current
    if (!pila) return
    if (id === 'auto') {
      pila.ventanaAutomatica()
      return
    }
    const preset = presetsParaModalidad(estudio?.modality).find((p) => p.id === id)
    if (preset) pila.ventana(preset.wc, preset.ww)
  }

  const alternarPantallaCompleta = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.()
    } else {
      await refEscenario.current?.requestFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const alCambiar = () => {
      const enPantallaCompleta = Boolean(document.fullscreenElement)
      setPantallaCompleta(enPantallaCompleta)
      // Salir de pantalla completa con Esc también termina la presentación.
      if (!enPantallaCompleta) setPresentacion(false)
    }
    document.addEventListener('fullscreenchange', alCambiar)
    return () => document.removeEventListener('fullscreenchange', alCambiar)
  }, [])

  /** Las ventanas se pintan fuera del escenario: en pantalla completa quedarían detrás. */
  const salirDePantallaCompleta = async () => {
    if (document.fullscreenElement) await document.exitFullscreen?.()
  }

  const entrarAPresentacion = async () => {
    setPresentacion(true)
    try {
      await refEscenario.current?.requestFullscreen?.()
    } catch {
      // Sin pantalla completa la presentación funciona igual, sólo en la ventana.
    }
  }

  const salirDePresentacion = async () => {
    setPresentacion(false)
    await salirDePantallaCompleta()
  }

  // ── Cortes clave y capturas ───────────────────────────────────────────────
  const marcasDeLaSerie = useMemo(() => cortesDeSerie(marcas, serieActiva?.id), [marcas, serieActiva?.id])
  const marcaActual = vista ? marcaDelCorte(marcas, serieActiva?.id, vista.indice) : null

  const abrirCaptura = useCallback(async (modo: 'captura' | 'clave') => {
    await salirDePantallaCompleta()
    setModalCaptura(modo)
  }, [])

  const componerLaCaptura = async (opciones: { marcas: boolean; paciente: boolean }) => {
    const pila = pilaIzquierda.current
    const lienzo = pila?.lienzo()
    if (!pila || !lienzo || !estudio || !serieActiva) {
      throw new Error('Todavía no hay una imagen que capturar. Espera a que cargue el corte.')
    }
    const estado = pila.estado()
    return componerCaptura({
      lienzo,
      marcas: opciones.marcas ? pila.capaDeMarcas() : null,
      leyenda: LEYENDA_DE_CAPTURA,
      sello: lineasDelSello({
        estudio: estudio.study_description,
        modalidad: estudio.modality,
        fecha: estudio.study_date,
        serie: nombreDeSerie(serieActiva),
        indice: estado.indice,
        total: estado.total,
        ventana: textoDeVentana(estado.wc, estado.ww),
        invertido: estado.invertido,
        paciente: opciones.paciente ? nombreDelPaciente : null,
      }),
    })
  }

  const datosDeCaptura = {
    estudio: estudio?.study_description ?? null,
    modalidad: estudio?.modality ?? null,
    fecha: estudio?.study_date ?? null,
    serie: serieActiva ? nombreDeSerie(serieActiva) : null,
    indice: vista?.indice ?? 0,
    total: vista?.total ?? 0,
  }

  const guardarCorteClave = async (datos: { label: string; notes: string; imagen: Blob | null }) => {
    const pila = pilaIzquierda.current
    if (!pila || !estudio || !serieActiva) throw new Error('El visor todavía no está listo.')
    const estado = pila.estado()
    const guardada = await cortesClaveApi.guardar(estudio.id, {
      series_id: serieActiva.id,
      instance_index: estado.indice,
      sop_instance_uid: pila.corteUid(estado.indice),
      label: datos.label,
      notes: datos.notes,
      view_state: vistaParaGuardar(estado),
      imagen: datos.imagen,
    })
    setMarcas((anteriores) => [...anteriores.filter((m) => m.id !== guardada.id), guardada])
    setPestana('claves')
  }

  const quitarCorteClave = async (marca: CorteClave) => {
    try {
      await cortesClaveApi.quitar(marca.id)
      setMarcas((anteriores) => anteriores.filter((m) => m.id !== marca.id))
    } catch (fallo) {
      setAvisoVisor(mensajeDeFallo(fallo))
    }
  }

  const irAlCorteClave = (marca: CorteClave) => {
    const destino = { indice: marca.instance_index, vista: estadoDeVistaGuardada(marca.view_state ?? {}) }
    if (marca.series_id === serieActiva?.id) {
      moverA(destino.indice)
      pilaIzquierda.current?.aplicarEstado(destino.vista)
      return
    }
    const serie = estudio?.series?.find((s) => s.id === marca.series_id)
    if (!serie) {
      setAvisoVisor('Esa serie ya no está en el estudio.')
      return
    }
    saltoPendiente.current = destino
    setSerieActiva(serie)
  }

  const saltarDeClave = (direccion: 1 | -1) => {
    if (!vista) return
    const vecina = cortesClaveVecino(marcas, serieActiva?.id, vista.indice, direccion)
    if (vecina) irAlCorteClave(vecina)
  }

  const descargarHoja = async ({ anonimo }: { anonimo: boolean }) => {
    if (!estudio) return
    try {
      const blob = await cortesClaveApi.hojaEnPdf(estudio.id, { anonimo })
      descargarBlob(blob, `cortes-clave-${estudio.id}.pdf`)
      setAvisoPdf({ tono: 'ok', texto: 'Hoja descargada.' })
    } catch (fallo) {
      setAvisoPdf({ tono: 'error', texto: mensajeDeFallo(fallo) })
    }
  }

  // ── Teclado ───────────────────────────────────────────────────────────────
  const ejecutar = useCallback(
    (accion: AccionDelVisor) => {
      const pila = pilaIzquierda.current
      const indice = pila?.estado().indice ?? 0
      const herramientaNueva = HERRAMIENTA_DE_ACCION[accion]
      if (herramientaNueva) return setHerramienta(herramientaNueva)
      switch (accion) {
        case 'corte-anterior': return moverA(indice - 1)
        case 'corte-siguiente': return moverA(indice + 1)
        case 'diez-atras': return moverA(indice - 10)
        case 'diez-adelante': return moverA(indice + 10)
        case 'primer-corte': return moverA(0)
        case 'ultimo-corte': return moverA((pila?.total() ?? 1) - 1)
        case 'acercar': return pila?.acercar(1.25)
        case 'alejar': return pila?.acercar(0.8)
        case 'ajustar': return pila?.ajustar()
        case 'invertir': return pila?.invertir()
        case 'rotar': return pila?.rotar(90)
        case 'voltear-horizontal': return pila?.voltear('h')
        case 'voltear-vertical': return pila?.voltear('v')
        case 'restablecer': return pila?.restablecer()
        case 'cine': return alternarCine()
        case 'capturar': return void abrirCaptura('captura')
        case 'corte-clave': return void abrirCaptura('clave')
        case 'pantalla-completa': return void alternarPantallaCompleta()
        case 'presentacion':
          return void (presentacion ? salirDePresentacion() : entrarAPresentacion())
        case 'salir': return presentacion ? void salirDePresentacion() : undefined
        case 'ayuda': return setAyudaVisible(true)
        default: return undefined
      }
    },
    [moverA, alternarCine, abrirCaptura, alternarPantallaCompleta, presentacion]
  )

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (modalCaptura || compartirVisible || ayudaVisible) return
      if (estaEscribiendo(evento.target)) return
      // Espacio sobre un botón es de ese botón (lo «pulsa»), no del cine.
      if (evento.key === ' ' && (evento.target as HTMLElement | null)?.closest?.('button, a, [role="button"]')) return
      const accion = accionDeTecla(evento)
      if (!accion) return
      evento.preventDefault()
      ejecutar(accion)
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [ejecutar, modalCaptura, compartirVisible, ayudaVisible])

  const series = ordenarSeries(estudio?.series ?? [])
  const estado = estudio ? estadoDeEstudio(estudio) : null
  const urlExpediente = rutaDelExpediente(patientId ?? '')
  const presets = presetsParaModalidad(estudio?.modality)
  const cortesConCaptura = marcas.filter((m) => m.has_image).length
  const vecinaAnterior = vista ? cortesClaveVecino(marcas, serieActiva?.id, vista.indice, -1) : null
  const vecinaSiguiente = vista ? cortesClaveVecino(marcas, serieActiva?.id, vista.indice, 1) : null

  if (cargando) {
    return (
      <div className="visor-pagina">
        <CSpinner color="primary" />
        <span>Cargando el estudio…</span>
      </div>
    )
  }

  if (error || !estudio) {
    return (
      <div className="visor-pagina">
        <CAlert color="danger">{error ?? 'No se encontró el estudio.'}</CAlert>
        <Link to={urlExpediente}>Volver al expediente</Link>
      </div>
    )
  }

  return (
    <div className="visor-pagina" data-presentacion={presentacion ? 'true' : 'false'}>
      <div className="visor-encabezado">
        <div>
          <Link to={urlExpediente} className="visor-encabezado__meta">
            ← Volver al expediente
          </Link>
          <h2 className="visor-encabezado__titulo">
            {estudio.study_description ?? 'Estudio de imagen'}
          </h2>
          <div className="visor-encabezado__meta">{resumenDeEstudio(estudio)}</div>
        </div>
        <div className="visor-encabezado__lado">
          {serieActiva && (
            <BotonVer3D
              patientId={patientId ?? ''}
              estudioId={estudio.id}
              serie={serieActiva}
              manifiesto={manifiestoActivo}
            />
          )}
          {tieneModulo('neuro3d_paciente') &&
            serieActiva &&
            ['CT', 'MR'].includes((serieActiva.modality || estudio.modality || '').toUpperCase()) && (
              <BotonModelo3D
                patientId={patientId ?? ''}
                estudioId={estudio.id}
                serieId={serieActiva.id}
                puedeGenerar={can('neuro3d.generar_modelo')}
              />
            )}
          {estado && (
            // Etiqueta corta: el detalle de qué falta va en el aviso de abajo. Si
            // se repite el mismo texto dos veces, el médico deja de leerlo.
            <CBadge
              color={estado.tono === 'ok' ? 'success' : estado.tono === 'aviso' ? 'warning' : 'danger'}
            >
              {estado.tono === 'ok'
                ? 'Estudio completo'
                : estado.tono === 'error'
                  ? 'No se pudo leer'
                  : 'Estudio incompleto'}
            </CBadge>
          )}
        </div>
      </div>

      {(estudio.warnings ?? []).map((aviso) => (
        <CAlert color="warning" key={aviso} className="py-2">
          {aviso}
        </CAlert>
      ))}
      {avisoVisor && (
        <CAlert color="danger" className="py-2">
          {avisoVisor}
        </CAlert>
      )}

      <div className="visor-cuerpo">
        <PanelSeries series={series} activaId={serieActiva?.id} onElegir={setSerieActiva} />

        <section className="visor-central">
          <div className="visor-escenario" ref={refEscenario}>
            <BarraDelVisor
              herramienta={herramienta}
              onHerramienta={setHerramienta}
              estado={vista}
              presets={presets}
              onPreset={aplicarPreset}
              onAcercar={(factor) => pilaIzquierda.current?.acercar(factor)}
              onAjustar={() => pilaIzquierda.current?.ajustar()}
              onRotar={() => pilaIzquierda.current?.rotar(90)}
              onVoltear={(eje) => pilaIzquierda.current?.voltear(eje)}
              onInvertir={() => pilaIzquierda.current?.invertir()}
              onRestablecer={() => pilaIzquierda.current?.restablecer()}
              cineActivo={cineActivo}
              fps={fps}
              onCine={alternarCine}
              onFps={cambiarFps}
              onCapturar={() => void abrirCaptura('captura')}
              onCorteClave={() => void abrirCaptura('clave')}
              esCorteClave={Boolean(marcaActual)}
              onCompartir={async () => {
                await salirDePantallaCompleta()
                setAvisoPdf(null)
                setCompartirVisible(true)
              }}
              onPresentacion={() => void entrarAPresentacion()}
              onPantallaCompleta={() => void alternarPantallaCompleta()}
              pantallaCompleta={pantallaCompleta}
              onAyuda={() => setAyudaVisible(true)}
              extra={
                compararCon ? (
                  <CButton size="sm" color="secondary" variant="outline" onClick={() => setCompararCon('')}>
                    Quitar comparación
                  </CButton>
                ) : (
                  <CButton size="sm" color="secondary" variant="outline" onClick={() => setPestana('comparar')}>
                    Comparar con un previo
                  </CButton>
                )
              }
            />

            <div className="visor-lienzo" data-comparando={compararCon ? 'true' : 'false'}>
              <div className="visor-viewport" ref={refIzquierda}>
                <div className="visor-viewport__etiqueta">
                  {serieActiva ? nombreDeSerie(serieActiva) : 'Sin serie'}
                  <br />
                  {fechaCorta(estudio.study_date)}
                </div>
                {vista && (
                  <div className="visor-viewport__estado" aria-hidden="true">
                    {marcaActual && <span className="visor-viewport__clave">★ Corte clave</span>}
                    <span>
                      Corte {vista.indice + 1} / {vista.total}
                    </span>
                    <span>{textoDeVentana(vista.wc, vista.ww)}</span>
                    <span>Zoom {Math.round(vista.zoom * 100)} %</span>
                    {(vista.rotacion !== 0 || vista.volteoH || vista.volteoV || vista.invertido) && (
                      <span>
                        {[
                          vista.rotacion !== 0 ? `${vista.rotacion}°` : null,
                          vista.volteoH ? 'volteo H' : null,
                          vista.volteoV ? 'volteo V' : null,
                          vista.invertido ? 'invertido' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {compararCon && (
                <div className="visor-viewport" ref={refDerecha}>
                  <div className="visor-viewport__etiqueta">
                    {previo ? fechaCorta(previo.study_date) : 'Estudio previo'}
                  </div>
                </div>
              )}
            </div>

            <SelectorDeCortes
              indice={vista?.indice ?? 0}
              total={vista?.total ?? 0}
              onCambiar={moverA}
              marcas={marcasDeLaSerie}
              onSaltar={saltarDeClave}
              hayAnterior={Boolean(vecinaAnterior)}
              haySiguiente={Boolean(vecinaSiguiente)}
            />

            {presentacion && (
              <CButton
                className="visor-presentacion__salir"
                color="light"
                size="sm"
                onClick={() => void salirDePresentacion()}
              >
                Salir de la presentación (Esc)
              </CButton>
            )}
          </div>
          <div className="visor-encabezado__meta mt-1 visor-ayuda-gestos">
            Rueda: recorrer cortes · botón izquierdo: la herramienta elegida · botón central:
            desplazar · botón derecho: acercar · <kbd>?</kbd> atajos de teclado
          </div>
        </section>

        <aside className="visor-panel visor-panel--derecho">
          <CNav variant="tabs" className="visor-pestanas">
            <CNavItem>
              <CNavLink active={pestana === 'mediciones'} onClick={() => setPestana('mediciones')}>
                Mediciones
              </CNavLink>
            </CNavItem>
            <CNavItem>
              <CNavLink active={pestana === 'claves'} onClick={() => setPestana('claves')}>
                Cortes clave
                {marcas.length > 0 && (
                  <CBadge color="warning" className="ms-1">
                    {marcas.length}
                  </CBadge>
                )}
              </CNavLink>
            </CNavItem>
            <CNavItem>
              <CNavLink active={pestana === 'comparar'} onClick={() => setPestana('comparar')}>
                Comparar
              </CNavLink>
            </CNavItem>
            <CNavItem>
              <CNavLink active={pestana === 'estudio'} onClick={() => setPestana('estudio')}>
                Estudio
              </CNavLink>
            </CNavItem>
          </CNav>

          <div className="visor-pestana-cuerpo">
            {pestana === 'mediciones' && (
              <PanelMediciones
                medidas={medidas}
                pendiente={pendiente}
                etiqueta={etiqueta}
                evoluciones={evoluciones}
                onEtiqueta={setEtiqueta}
                onGuardar={() => void guardarMedicion()}
                onDescartar={() => setPendiente(null)}
                onConfirmar={(medicion) => void confirmarMedicion(medicion)}
                onBorrar={(medicion) => void borrarMedicion(medicion)}
              />
            )}
            {pestana === 'claves' && (
              <PanelCortesClave
                marcas={marcas}
                serieActivaId={serieActiva?.id}
                indiceActual={vista?.indice ?? 0}
                onIr={irAlCorteClave}
                onQuitar={(marca) => void quitarCorteClave(marca)}
                onMarcar={() => void abrirCaptura('clave')}
                onHojaEnPdf={descargarHoja}
                aviso={avisoPdf}
              />
            )}
            {pestana === 'comparar' && (
              <PanelEstudiosPrevios
                candidatos={candidatos}
                seleccionado={compararCon}
                onSeleccionar={setCompararCon}
                aviso={avisoComparacion}
              />
            )}
            {pestana === 'estudio' && <PanelFichaEstudio estudio={estudio} />}
          </div>
        </aside>
      </div>

      <ModalCaptura
        visible={modalCaptura !== null}
        modo={modalCaptura ?? 'captura'}
        onClose={() => setModalCaptura(null)}
        datos={datosDeCaptura}
        nombreDelPaciente={nombreDelPaciente}
        componer={componerLaCaptura}
        marcaExistente={marcaActual}
        onGuardarClave={guardarCorteClave}
        onQuitarClave={marcaActual ? () => quitarCorteClave(marcaActual) : undefined}
      />
      <ModalCompartir
        visible={compartirVisible}
        onClose={() => setCompartirVisible(false)}
        estudioId={estudio.id}
        cortesConCaptura={cortesConCaptura}
        avisoPdf={avisoPdf}
        onAbrirCaptura={() => {
          setCompartirVisible(false)
          void abrirCaptura('captura')
        }}
        onHojaEnPdf={descargarHoja}
      />
      <AyudaDeAtajos visible={ayudaVisible} onClose={() => setAyudaVisible(false)} />
    </div>
  )
}
