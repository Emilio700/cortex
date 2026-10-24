/**
 * Visor de un estudio: la imagen, sus series y lo que el médico mide sobre ella.
 *
 * El acomodo sigue una regla: **el análisis no cambia de pantalla**. Series a la
 * izquierda, imagen al centro, y a la derecha un panel con pestañas donde viven
 * las mediciones, la comparación con estudios previos y la ficha del estudio.
 * Cuando existan la volumetría o la segmentación, entran en esa misma pestaña
 * como un derivado del estudio, no como otro módulo que hay que abrir aparte.
 *
 * Todo lo que no necesita GPU vive en `dominio/` y se prueba con vitest.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CAlert,
  CBadge,
  CButton,
  CButtonGroup,
  CNav,
  CNavItem,
  CNavLink,
  CSpinner,
} from '@coreui/react-pro'
import { Enums, RenderingEngine, type Types } from '@cornerstonejs/core'
import {
  ToolGroupManager,
  annotation as csAnnotation,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools'

import { mensajeDeError } from '../../../shared/utils/errors'
import { rutaDelExpediente } from '../../expediente/rutas'
import PanelEstudiosPrevios from '../componentes/PanelEstudiosPrevios'
import PanelFichaEstudio from '../componentes/PanelFichaEstudio'
import PanelMediciones from '../componentes/PanelMediciones'
import PanelSeries from '../componentes/PanelSeries'
import { evolucionDeMedida, type Evolucion } from '../dominio/medidas'
import {
  corteEquivalente,
  emparejarSerie,
  estadoDeEstudio,
  nombreDeSerie,
  ordenarSeries,
  resumenDeEstudio,
  serieInicial,
  type AnotacionDicom,
  type CandidatoComparacion,
  type EstudioDicom,
  type SerieDicom,
} from '../dominio/tipos'
import { HERRAMIENTAS, prepararVisor } from '../servicios/cornerstone'
import { estudiosApi, urlAbsoluta } from '../servicios/estudiosApi'
import '../ui/visor.css'

type Herramienta = 'ventana' | 'medir'
type Pestana = 'mediciones' | 'comparar' | 'estudio'

interface Pendiente {
  value: number
  unit: string
  annotationUID: string
}

interface Pila {
  destruir: () => void
  irA: (indice: number) => void
  total: () => number
  aplicarHerramienta: (herramienta: Herramienta) => void
}

const BOTON_PRIMARIO = 1 as csToolsEnums.MouseBindings
const BOTON_MEDIO = 4 as csToolsEnums.MouseBindings
const BOTON_DERECHO = 2 as csToolsEnums.MouseBindings

/**
 * Monta una pila de cortes en un elemento. Devuelve cómo destruirla: sin eso,
 * cambiar de serie deja motores y grupos de herramientas vivos y la memoria del
 * navegador se llena a la tercera resonancia.
 */
async function crearPila(
  elemento: HTMLDivElement,
  serieId: number,
  sufijo: string,
  alTerminarMedicion: () => void,
  alDesplazar: (indice: number, total: number) => void
): Promise<Pila> {
  const manifiesto = await estudiosApi.manifiesto(serieId)
  const imageIds = manifiesto.instances.map((corte) => `wadouri:${urlAbsoluta(corte.url)}`)
  if (imageIds.length === 0) {
    throw new Error('La serie no tiene cortes guardados.')
  }

  const motorId = `cx-motor-${sufijo}`
  const viewportId = `cx-vp-${sufijo}`
  const grupoId = `cx-grupo-${sufijo}`

  elemento.innerHTML = ''
  const motor = new RenderingEngine(motorId)
  motor.enableElement({
    viewportId,
    element: elemento,
    type: Enums.ViewportType.STACK,
    defaultOptions: { background: [0, 0, 0] },
  })
  const viewport = motor.getViewport(viewportId) as Types.IStackViewport
  await viewport.setStack(imageIds, 0)
  viewport.render()

  const grupo = ToolGroupManager.createToolGroup(grupoId)
  if (grupo) {
    grupo.addViewport(viewportId, motorId)
    for (const herramienta of [
      HERRAMIENTAS.ventana,
      HERRAMIENTAS.desplazar,
      HERRAMIENTAS.zoom,
      HERRAMIENTAS.medir,
    ]) {
      grupo.addTool(herramienta)
    }
    grupo.setToolActive(HERRAMIENTAS.ventana, { bindings: [{ mouseButton: BOTON_PRIMARIO }] })
    grupo.setToolActive(HERRAMIENTAS.desplazar, { bindings: [{ mouseButton: BOTON_MEDIO }] })
    grupo.setToolActive(HERRAMIENTAS.zoom, { bindings: [{ mouseButton: BOTON_DERECHO }] })
  }

  const irA = (indice: number) => {
    const total = viewport.getImageIds().length
    if (total === 0) return
    viewport.setImageIdIndex(Math.min(total - 1, Math.max(0, indice)))
  }

  // La rueda se maneja a mano: es el gesto que más se usa y así no depende de
  // que una herramienta esté activa o en pasiva.
  const alRodar = (evento: WheelEvent) => {
    evento.preventDefault()
    const total = viewport.getImageIds().length
    const siguiente = viewport.getCurrentImageIdIndex() + (evento.deltaY > 0 ? 1 : -1)
    irA(siguiente)
    alDesplazar(Math.min(total - 1, Math.max(0, siguiente)), total)
  }
  elemento.addEventListener('wheel', alRodar, { passive: false })

  const alAnotar = () => alTerminarMedicion()
  elemento.addEventListener(csToolsEnums.Events.ANNOTATION_COMPLETED, alAnotar)

  return {
    destruir: () => {
      elemento.removeEventListener('wheel', alRodar)
      elemento.removeEventListener(csToolsEnums.Events.ANNOTATION_COMPLETED, alAnotar)
      ToolGroupManager.destroyToolGroup(grupoId)
      motor.destroy()
      elemento.innerHTML = ''
    },
    irA,
    total: () => viewport.getImageIds().length,
    aplicarHerramienta: (herramienta) => {
      const grupoActual = ToolGroupManager.getToolGroup(grupoId)
      if (!grupoActual) return
      if (herramienta === 'medir') {
        grupoActual.setToolPassive(HERRAMIENTAS.ventana)
        grupoActual.setToolActive(HERRAMIENTAS.medir, {
          bindings: [{ mouseButton: BOTON_PRIMARIO }],
        })
      } else {
        grupoActual.setToolPassive(HERRAMIENTAS.medir)
        grupoActual.setToolActive(HERRAMIENTAS.ventana, {
          bindings: [{ mouseButton: BOTON_PRIMARIO }],
        })
      }
    },
  }
}

export default function VisorEstudioPage() {
  const { patientId, studyId } = useParams<{ patientId: string; studyId: string }>()
  const [estudio, setEstudio] = useState<EstudioDicom | null>(null)
  const [candidatos, setCandidatos] = useState<CandidatoComparacion[]>([])
  const [serieActiva, setSerieActiva] = useState<SerieDicom | null>(null)
  const [medidas, setMedidas] = useState<AnotacionDicom[]>([])
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [etiqueta, setEtiqueta] = useState('')
  const [herramienta, setHerramienta] = useState<Herramienta>('ventana')
  const [pestana, setPestana] = useState<Pestana>('mediciones')
  const [compararCon, setCompararCon] = useState('')
  const [previo, setPrevio] = useState<EstudioDicom | null>(null)
  const [avisoComparacion, setAvisoComparacion] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avisoVisor, setAvisoVisor] = useState<string | null>(null)

  const refIzquierda = useRef<HTMLDivElement>(null)
  const refDerecha = useRef<HTMLDivElement>(null)
  const pilaIzquierda = useRef<Pila | null>(null)
  const pilaDerecha = useRef<Pila | null>(null)

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
      setError(mensajeDeError(fallo))
    } finally {
      setCargando(false)
    }
  }, [studyId])

  useEffect(() => {
    void cargarEstudio()
  }, [cargarEstudio])

  const alTerminarMedicion = useCallback(() => {
    const elemento = refIzquierda.current
    if (!elemento) return
    const todas = csAnnotation.state.getAnnotations(HERRAMIENTAS.medir, elemento) ?? []
    const ultima = todas[todas.length - 1] as
      | { annotationUID?: string; data?: { cachedStats?: Record<string, unknown> } }
      | undefined
    const estadisticas = ultima?.data?.cachedStats ?? {}
    const primera = Object.values(estadisticas)[0] as
      | { length?: number; unit?: string }
      | undefined
    if (primera?.length === undefined || !ultima?.annotationUID) return
    setPendiente({
      value: Number(primera.length),
      unit: primera.unit ?? 'mm',
      annotationUID: ultima.annotationUID,
    })
    setPestana('mediciones')
  }, [])

  // Pila del estudio actual.
  useEffect(() => {
    const elemento = refIzquierda.current
    if (!elemento || !serieActiva) return
    let cancelado = false
    setAvisoVisor(null)

    const montar = async () => {
      try {
        await prepararVisor()
        if (cancelado) return
        pilaIzquierda.current?.destruir()
        pilaIzquierda.current = null
        pilaIzquierda.current = await crearPila(
          elemento,
          serieActiva.id,
          'izq',
          alTerminarMedicion,
          (indice, total) => {
            const derecha = pilaDerecha.current
            if (!derecha) return
            derecha.irA(corteEquivalente(indice, total, derecha.total()))
          }
        )
        if (cancelado) {
          pilaIzquierda.current?.destruir()
          pilaIzquierda.current = null
          return
        }
        pilaIzquierda.current.aplicarHerramienta(herramienta)
      } catch (fallo) {
        if (!cancelado) setAvisoVisor(mensajeDeError(fallo))
      }
    }

    void montar()
    return () => {
      cancelado = true
    }
    // `herramienta` se aplica en su propio efecto para no recargar la serie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieActiva?.id, alTerminarMedicion])

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
        pilaDerecha.current = await crearPila(
          elemento,
          pareja.id,
          'der',
          () => undefined,
          (indice, total) => {
            const izquierda = pilaIzquierda.current
            if (!izquierda) return
            izquierda.irA(corteEquivalente(indice, total, izquierda.total()))
          }
        )
        if (cancelado) {
          pilaDerecha.current?.destruir()
          pilaDerecha.current = null
        }
      } catch (fallo) {
        if (!cancelado) setAvisoComparacion(mensajeDeError(fallo))
      }
    }

    void montar()
    return () => {
      cancelado = true
    }
  }, [compararCon, serieActiva?.id])

  useEffect(() => {
    pilaIzquierda.current?.aplicarHerramienta(herramienta)
    pilaDerecha.current?.aplicarHerramienta('ventana')
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

  const guardarMedicion = async () => {
    if (!pendiente || !estudio || !serieActiva) return
    try {
      const guardada = await estudiosApi.guardarMedicion(estudio.id, {
        kind: 'length',
        series_id: serieActiva.id,
        geometry: { annotation_uid: pendiente.annotationUID },
        value: Number(pendiente.value.toFixed(1)),
        unit: pendiente.unit,
        label: etiqueta.trim() || null,
      })
      setMedidas((anteriores) => [...anteriores, guardada])
      setPendiente(null)
      setEtiqueta('')
      setAvisoVisor(null)
    } catch (fallo) {
      setAvisoVisor(mensajeDeError(fallo))
    }
  }

  const confirmarMedicion = async (medicion: AnotacionDicom) => {
    try {
      const confirmada = await estudiosApi.confirmarMedicion(medicion.id)
      setMedidas((anteriores) =>
        anteriores.map((m) => (m.id === confirmada.id ? confirmada : m))
      )
    } catch (fallo) {
      setAvisoVisor(mensajeDeError(fallo))
    }
  }

  const borrarMedicion = async (medicion: AnotacionDicom) => {
    try {
      await estudiosApi.borrarMedicion(medicion.id)
      setMedidas((anteriores) => anteriores.filter((m) => m.id !== medicion.id))
    } catch (fallo) {
      setAvisoVisor(mensajeDeError(fallo))
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

  const series = ordenarSeries(estudio?.series ?? [])
  const estado = estudio ? estadoDeEstudio(estudio) : null
  const urlExpediente = rutaDelExpediente(patientId ?? '')

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
    <div className="visor-pagina">
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
        {estado && (
          <CBadge
            color={estado.tono === 'ok' ? 'success' : estado.tono === 'aviso' ? 'warning' : 'danger'}
          >
            {estado.texto}
          </CBadge>
        )}
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

        <section>
          <div className="visor-barra" data-tour="visor-herramientas">
            <CButtonGroup size="sm" role="group" aria-label="Herramienta del visor">
              <CButton
                color={herramienta === 'ventana' ? 'primary' : 'secondary'}
                variant={herramienta === 'ventana' ? undefined : 'outline'}
                onClick={() => setHerramienta('ventana')}
              >
                Contraste
              </CButton>
              <CButton
                color={herramienta === 'medir' ? 'primary' : 'secondary'}
                variant={herramienta === 'medir' ? undefined : 'outline'}
                onClick={() => setHerramienta('medir')}
              >
                Medir
              </CButton>
            </CButtonGroup>

            {compararCon ? (
              <CButton
                size="sm"
                color="secondary"
                variant="outline"
                onClick={() => setCompararCon('')}
              >
                Quitar comparación
              </CButton>
            ) : (
              <CButton
                size="sm"
                color="secondary"
                variant="outline"
                onClick={() => setPestana('comparar')}
              >
                Comparar con un estudio previo
              </CButton>
            )}
            <span className="visor-encabezado__meta ms-auto">
              {serieActiva ? nombreDeSerie(serieActiva) : 'Sin serie'}
            </span>
          </div>

          <div className="visor-lienzo" data-comparando={compararCon ? 'true' : 'false'}>
            <div className="visor-viewport" ref={refIzquierda}>
              <div className="visor-viewport__etiqueta">
                {serieActiva ? nombreDeSerie(serieActiva) : 'Sin serie'}
                <br />
                {estudio.study_date.slice(0, 10)}
              </div>
            </div>
            {compararCon && (
              <div className="visor-viewport" ref={refDerecha}>
                <div className="visor-viewport__etiqueta">
                  {previo ? previo.study_date.slice(0, 10) : 'Estudio previo'}
                </div>
              </div>
            )}
          </div>
          <div className="visor-encabezado__meta mt-1">
            Rueda: recorrer cortes · botón izquierdo: contraste o medición · botón central:
            desplazar · botón derecho: acercar
          </div>
        </section>

        <aside className="visor-panel">
          <CNav variant="tabs" className="visor-pestanas">
            <CNavItem>
              <CNavLink active={pestana === 'mediciones'} onClick={() => setPestana('mediciones')}>
                Mediciones
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
    </div>
  )
}
