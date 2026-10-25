/**
 * El estudio visto desde un enlace temporal: lo que abre un colega, sin sesión.
 *
 * Es una pantalla aparte, fuera del menú y del expediente. Sólo se puede mirar y
 * medir (a mano, sin guardar nada): no hay capturas, cortes clave ni compartir,
 * porque quien abre un enlace no escribe en el expediente de nadie.
 *
 * Lo que se muestra viene ya sin identidad del servidor. Aquí además se dice
 * claramente qué es (material compartido, no un informe) y cuándo vence. Si el
 * enlace no sirve, el mensaje es siempre el mismo —no existe, venció o se
 * revocó—: no se le dan pistas a quien no lo tiene.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CAlert, CSpinner } from '@coreui/react-pro'

import { mensajeDeFallo } from '../servicios/mensajes'
import BarraDelVisor from '../componentes/BarraDelVisor'
import AyudaDeAtajos from '../componentes/AyudaDeAtajos'
import SelectorDeCortes from '../componentes/SelectorDeCortes'
import { accionDeTecla, estaEscribiendo, type AccionDelVisor } from '../dominio/atajos'
import { textoDeVencimiento } from '../dominio/compartir'
import { presetsParaModalidad, textoDeVentana } from '../dominio/presets'
import { FPS_POR_OMISION, type EstadoDeVista } from '../servicios/controlesDeVista'
import { prepararVisor } from '../servicios/cornerstone'
import { compartidoApi, type EstudioCompartido, type SerieCompartida } from '../servicios/estudiosApi'
import { crearPila, type Herramienta, type Pila } from '../servicios/pila'
import '../ui/visor.css'

const MENSAJE_SIN_ENLACE =
  'Este enlace no existe o ya no está disponible. Pide uno nuevo a quien te lo compartió.'

const HERRAMIENTA_DE_ACCION: Partial<Record<AccionDelVisor, Herramienta>> = {
  'herramienta-ventana': 'ventana',
  'herramienta-medir': 'medir',
  'herramienta-angulo': 'angulo',
  'herramienta-area': 'area',
  'herramienta-desplazar': 'desplazar',
  'herramienta-zoom': 'zoom',
}

export function nombreDeSerieCompartida(serie: SerieCompartida): string {
  const etiqueta = serie.sequence_label?.trim()
  const descripcion = serie.series_description?.trim()
  if (etiqueta && descripcion && etiqueta.toLowerCase() !== descripcion.toLowerCase()) {
    return `${etiqueta} · ${descripcion}`
  }
  return etiqueta || descripcion || `Serie ${serie.series_number}`
}

export default function VisorCompartidoPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [estudio, setEstudio] = useState<EstudioCompartido | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sinEnlace, setSinEnlace] = useState(false)
  const [serie, setSerie] = useState<SerieCompartida | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vista, setVista] = useState<EstadoDeVista | null>(null)
  const [herramienta, setHerramienta] = useState<Herramienta>('ventana')
  const [cineActivo, setCineActivo] = useState(false)
  const [fps, setFps] = useState<number>(FPS_POR_OMISION)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const [ayudaVisible, setAyudaVisible] = useState(false)

  const refEscenario = useRef<HTMLDivElement>(null)
  const refVista = useRef<HTMLDivElement>(null)
  const pila = useRef<Pila | null>(null)
  const herramientaActual = useRef<Herramienta>('ventana')
  herramientaActual.current = herramienta

  useEffect(() => {
    let activo = true
    setCargando(true)
    compartidoApi
      .resumen(token)
      .then((datos) => {
        if (!activo) return
        setEstudio(datos)
        setSerie(datos.series.find((s) => s.instance_count > 0) ?? datos.series[0] ?? null)
      })
      // Cualquier fallo se presenta igual: aquí no se distingue por qué.
      .catch(() => activo && setSinEnlace(true))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [token])

  useEffect(() => {
    const elemento = refVista.current
    if (!elemento || !serie) return
    let cancelado = false
    setAviso(null)
    setVista(null)
    setCineActivo(false)
    const montar = async () => {
      try {
        await prepararVisor()
        if (cancelado) return
        pila.current?.destruir()
        pila.current = null
        const manifiesto = await compartidoApi.manifiesto(token, serie.id)
        if (cancelado) return
        const nueva = await crearPila({
          elemento,
          manifiesto,
          sufijo: 'compartida',
          herramienta: herramientaActual.current,
          alCambiar: setVista,
        })
        if (cancelado) {
          nueva.destruir()
          return
        }
        pila.current = nueva
      } catch (fallo) {
        if (!cancelado) setAviso(mensajeDeFallo(fallo))
      }
    }
    void montar()
    return () => {
      cancelado = true
    }
  }, [serie?.id, token])

  useEffect(() => {
    pila.current?.aplicarHerramienta(herramienta)
  }, [herramienta])

  useEffect(
    () => () => {
      pila.current?.destruir()
      pila.current = null
    },
    []
  )

  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', alCambiar)
    return () => document.removeEventListener('fullscreenchange', alCambiar)
  }, [])

  const alternarCine = useCallback(() => {
    const actual = pila.current
    if (!actual) return
    if (actual.cine.activo()) {
      actual.cine.detener()
      setCineActivo(false)
    } else {
      actual.cine.iniciar(fps)
      setCineActivo(actual.cine.activo())
    }
  }, [fps])

  const alternarPantallaCompleta = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen?.()
    else await refEscenario.current?.requestFullscreen?.()
  }, [])

  const ejecutar = useCallback(
    (accion: AccionDelVisor) => {
      const actual = pila.current
      const indice = actual?.estado().indice ?? 0
      const nueva = HERRAMIENTA_DE_ACCION[accion]
      if (nueva) return setHerramienta(nueva)
      switch (accion) {
        case 'corte-anterior': return actual?.irA(indice - 1)
        case 'corte-siguiente': return actual?.irA(indice + 1)
        case 'diez-atras': return actual?.irA(indice - 10)
        case 'diez-adelante': return actual?.irA(indice + 10)
        case 'primer-corte': return actual?.irA(0)
        case 'ultimo-corte': return actual?.irA((actual?.total() ?? 1) - 1)
        case 'acercar': return actual?.acercar(1.25)
        case 'alejar': return actual?.acercar(0.8)
        case 'ajustar': return actual?.ajustar()
        case 'invertir': return actual?.invertir()
        case 'rotar': return actual?.rotar(90)
        case 'voltear-horizontal': return actual?.voltear('h')
        case 'voltear-vertical': return actual?.voltear('v')
        case 'restablecer': return actual?.restablecer()
        case 'cine': return alternarCine()
        case 'pantalla-completa': return void alternarPantallaCompleta()
        case 'ayuda': return setAyudaVisible(true)
        default: return undefined
      }
    },
    [alternarCine, alternarPantallaCompleta]
  )

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (ayudaVisible || estaEscribiendo(evento.target)) return
      if (evento.key === ' ' && (evento.target as HTMLElement | null)?.closest?.('button, a, [role="button"]')) return
      const accion = accionDeTecla(evento)
      if (!accion) return
      evento.preventDefault()
      ejecutar(accion)
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [ejecutar, ayudaVisible])

  if (cargando) {
    return (
      <div className="visor-compartido visor-compartido--centro">
        <CSpinner color="light" />
        <span>Abriendo el estudio…</span>
      </div>
    )
  }

  if (sinEnlace || !estudio) {
    return (
      <div className="visor-compartido visor-compartido--centro">
        <h1 className="visor-compartido__marca">CORTEX</h1>
        <p role="alert">{MENSAJE_SIN_ENLACE}</p>
      </div>
    )
  }

  const fecha = estudio.study_date.slice(0, 10).split('-').reverse().join('/')

  return (
    <div className="visor-compartido">
      <header className="visor-compartido__encabezado">
        <span className="visor-compartido__marca">CORTEX</span>
        <div>
          <strong>{estudio.study_description ?? 'Estudio de imagen'}</strong>
          <div className="visor-compartido__meta">
            {[estudio.modality, fecha, estudio.body_part].filter(Boolean).join(' · ')} ·{' '}
            {textoDeVencimiento(estudio.expires_at)}
          </div>
        </div>
      </header>

      <p className="visor-compartido__aviso">{estudio.aviso}</p>
      {aviso && (
        <CAlert color="danger" className="py-2">
          {aviso}
        </CAlert>
      )}

      <div className="visor-compartido__cuerpo">
        <aside className="visor-panel" aria-label="Series">
          <div className="visor-panel__titulo">Series ({estudio.series.length})</div>
          <ul className="visor-series">
            {estudio.series.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="visor-series__boton"
                  aria-pressed={s.id === serie?.id}
                  onClick={() => setSerie(s)}
                >
                  <span className="visor-series__nombre">{nombreDeSerieCompartida(s)}</span>
                  <span className="visor-series__detalle">{s.instance_count} cortes</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="visor-central">
          <div className="visor-escenario" ref={refEscenario}>
            <BarraDelVisor
              herramienta={herramienta}
              onHerramienta={setHerramienta}
              estado={vista}
              presets={presetsParaModalidad(estudio.modality)}
              onPreset={(id) => {
                if (id === 'auto') return pila.current?.ventanaAutomatica()
                const preset = presetsParaModalidad(estudio.modality).find((p) => p.id === id)
                if (preset) pila.current?.ventana(preset.wc, preset.ww)
              }}
              onAcercar={(factor) => pila.current?.acercar(factor)}
              onAjustar={() => pila.current?.ajustar()}
              onRotar={() => pila.current?.rotar(90)}
              onVoltear={(eje) => pila.current?.voltear(eje)}
              onInvertir={() => pila.current?.invertir()}
              onRestablecer={() => pila.current?.restablecer()}
              cineActivo={cineActivo}
              fps={fps}
              onCine={alternarCine}
              onFps={(nuevo) => {
                setFps(nuevo)
                if (pila.current?.cine.activo()) pila.current.cine.iniciar(nuevo)
              }}
              onPantallaCompleta={() => void alternarPantallaCompleta()}
              pantallaCompleta={pantallaCompleta}
              onAyuda={() => setAyudaVisible(true)}
            />
            <div className="visor-lienzo">
              <div className="visor-viewport" ref={refVista}>
                <div className="visor-viewport__etiqueta">
                  {serie ? nombreDeSerieCompartida(serie) : 'Sin serie'}
                  <br />
                  {fecha}
                </div>
                {vista && (
                  <div className="visor-viewport__estado" aria-hidden="true">
                    <span>
                      Corte {vista.indice + 1} / {vista.total}
                    </span>
                    <span>{textoDeVentana(vista.wc, vista.ww)}</span>
                    <span>Zoom {Math.round(vista.zoom * 100)} %</span>
                  </div>
                )}
              </div>
            </div>
            <SelectorDeCortes
              indice={vista?.indice ?? 0}
              total={vista?.total ?? 0}
              onCambiar={(indice) => pila.current?.irA(indice)}
            />
          </div>
        </section>
      </div>
      <AyudaDeAtajos visible={ayudaVisible} onClose={() => setAyudaVisible(false)} />
    </div>
  )
}
