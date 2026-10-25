/**
 * Neuro 3D: encéfalo y columna en 3D para explicarle al paciente su
 * lesión y su cirugía.
 *
 * Se abre desde el menú («Imagen y señales») o desde la pestaña Imágenes del
 * expediente; en ese caso trae al paciente en contexto y permite guardar la
 * captura en su expediente. El modelo es esquemático y la pantalla lo dice
 * siempre, a la vista.
 *
 * three.js se descarga sólo aquí (paquete `vendor-three`) y la escena se carga
 * aparte, después de comprobar que el equipo puede dibujar en 3D: sin WebGL,
 * un mensaje claro en vez de una pantalla en blanco.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CAlert, CBadge, CButton, CSpinner } from '@coreui/react-pro'
import { cil3d } from '@coreui/icons'

import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { useAuth } from '../../../shared/context/AuthContext'
import { rutaDelExpediente } from '../../expediente/rutas'
import { capasEfectivas, estadoInicialDeCapas, PELADO_MAXIMO, type CapaId, type EstadoDeCapas } from '../dominio/capas'
import { estructuraPorId, mallasDe } from '../dominio/catalogo'
import { conexionDe } from '../dominio/conexiones'
import { crearMarcaDeRegion, describirMarca, dermatomasDeMarcas, mallasAfectadas, textoDeMarcasParaCaptura, type Marca } from '../dominio/marcas'
import { duracionDeTransicion, vistaPorId, vistaPorTecla, type PlanoDeCorte, type VistaId } from '../dominio/vistas'
import BarraVistas from '../componentes/BarraVistas'
import BuscadorEstructuras from '../componentes/BuscadorEstructuras'
import FichaEstructura from '../componentes/FichaEstructura'
import ModalGuardarExpediente from '../componentes/ModalGuardarExpediente'
import PanelCapas from '../componentes/PanelCapas'
import PanelExplicar from '../componentes/PanelExplicar'
import { atlasApi } from '../servicios/atlasApi'
import { componerCaptura, descargar, nombreDeCaptura } from '../servicios/captura'
import { useReducirMovimiento } from '../servicios/movimiento'
import { hayWebGL } from '../servicios/webgl'
import type { EscenaAtlas, Resaltado } from '../servicios/escena'
import '../ui/atlas.css'

export const AVISO_ESQUEMATICO =
  'Modelo esquemático con fines educativos; no representa la anatomía de este paciente ni sustituye su estudio de imagen.'

type EstadoEscena = { tipo: 'cargando' } | { tipo: 'lista' } | { tipo: 'sin-webgl' } | { tipo: 'error'; mensaje: string }

const esCampoDeTexto = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function AtlasNeuroPage() {
  const { patientId: patientIdTexto } = useParams<{ patientId?: string }>()
  const patientId = patientIdTexto ? Number(patientIdTexto) : null
  const { can } = useAuth()
  const reducirMovimiento = useReducirMovimiento()

  const contenedorRef = useRef<HTMLDivElement>(null)
  const escenaRef = useRef<EscenaAtlas | null>(null)
  const siluetaFichaRef = useRef<SVGSVGElement>(null)
  const siluetaMarcasRef = useRef<SVGSVGElement>(null)

  const [estadoEscena, setEstadoEscena] = useState<EstadoEscena>({ tipo: 'cargando' })
  const [capas, setCapas] = useState<EstadoDeCapas>(estadoInicialDeCapas)
  const [pelado, setPelado] = useState(0)
  const [corte, setCorte] = useState<{ plano: PlanoDeCorte; posicion: number }>({ plano: 'ninguno', posicion: 0 })
  const [despiece, setDespiece] = useState(false)
  const [flujo, setFlujo] = useState(false)
  const [rotacion, setRotacion] = useState(true)
  const [vista, setVista] = useState<VistaId | null>(null)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [explicar, setExplicar] = useState(false)
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [nombrePaciente, setNombrePaciente] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ color: 'success' | 'danger' | 'info'; texto: string } | null>(null)
  const [capturando, setCapturando] = useState(false)
  const [guardar, setGuardar] = useState<{ imagen: Blob; descripcion: string } | null>(null)
  const animacionPelado = useRef(0)

  const puedeGuardar = patientId !== null && can('clinical_images.upload')

  // ── Escena: se carga aparte y se libera al salir ─────────────────────────
  useEffect(() => {
    if (!hayWebGL()) {
      setEstadoEscena({ tipo: 'sin-webgl' })
      return
    }
    let cancelado = false
    let creada: EscenaAtlas | null = null
    const contenedor = contenedorRef.current
    if (!contenedor) return
    void (async () => {
      try {
        const { crearEscena } = await import('../servicios/escena')
        creada = await crearEscena({
          contenedor,
          reducirMovimiento,
          alSeleccionar: (id) => setSeleccion(id),
          alPasar: (id, x, y) => setHover(id ? { id, x, y } : null),
          alInteractuar: () => setRotacion(false),
          alPerderContexto: () =>
            setEstadoEscena({ tipo: 'error', mensaje: 'La tarjeta gráfica dejó de responder. Recarga la pantalla para volver a ver el modelo.' }),
        })
        if (cancelado) {
          creada.liberar()
          return
        }
        escenaRef.current = creada
        setEstadoEscena({ tipo: 'lista' })
      } catch (err) {
        if (cancelado) return
        if (err instanceof Error && err.name === 'SinWebGL') setEstadoEscena({ tipo: 'sin-webgl' })
        else setEstadoEscena({ tipo: 'error', mensaje: 'No se pudo preparar el modelo 3D. Recarga la pantalla; si sigue igual, avisa a soporte.' })
      }
    })()
    return () => {
      cancelado = true
      escenaRef.current = null
      creada?.liberar()
    }
    // La escena se crea una sola vez; el resto de los cambios se le pasan abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lista = estadoEscena.tipo === 'lista'

  // ── Paciente en contexto ─────────────────────────────────────────────────
  useEffect(() => {
    if (patientId === null || Number.isNaN(patientId)) return
    let vigente = true
    atlasApi
      .nombreDelPaciente(patientId)
      .then((n) => vigente && setNombrePaciente(n))
      .catch(() => vigente && setNombrePaciente(null))
    return () => {
      vigente = false
    }
  }, [patientId])

  // ── Lo que React decide y la escena pinta ────────────────────────────────
  const efectivas = useMemo(() => capasEfectivas(capas, pelado), [capas, pelado])
  useEffect(() => {
    if (lista) escenaRef.current?.aplicarCapas(efectivas)
  }, [lista, efectivas])
  useEffect(() => {
    if (lista) escenaRef.current?.fijarCorte(corte.plano, corte.posicion)
  }, [lista, corte])
  useEffect(() => {
    if (lista) escenaRef.current?.fijarDespiece(despiece)
  }, [lista, despiece])
  useEffect(() => {
    if (lista) escenaRef.current?.fijarFlujo(flujo)
  }, [lista, flujo])
  useEffect(() => {
    if (lista) escenaRef.current?.fijarRotacion(rotacion)
  }, [lista, rotacion])
  useEffect(() => {
    if (lista) escenaRef.current?.fijarReducirMovimiento(reducirMovimiento)
  }, [lista, reducirMovimiento])

  const estructura = seleccion ? estructuraPorId(seleccion) ?? null : null
  const conexion = useMemo(() => (seleccion ? conexionDe(seleccion) : null), [seleccion])

  const resaltado = useMemo<Resaltado>(() => {
    const sel = seleccion ? mallasDe(seleccion) : []
    const afectados = marcas.flatMap(mallasAfectadas)
    const etiquetas: Resaltado['etiquetas'] = []
    if (estructura) etiquetas.push({ id: sel[0], texto: estructura.nombre, tono: 'seleccion' })
    for (const p of conexion?.piezas ?? []) {
      if (p.papel !== 'raiz' || p.id !== seleccion) etiquetas.push({ id: p.id, texto: p.etiqueta, tono: 'conexion' })
    }
    for (const m of marcas) {
      const ids = mallasAfectadas(m)
      if (ids[0]) etiquetas.push({ id: ids[0], texto: describirMarca(m), tono: 'afectado' })
    }
    return {
      seleccion: sel,
      conexion: (conexion?.piezas ?? []).filter((p) => !sel.includes(p.id)).map((p) => ({ id: p.id, papel: p.papel })),
      afectados,
      etiquetas,
      atenuarColumna: Boolean(conexion) || marcas.some((m) => m.tipo === 'nivel'),
      rayosX: Boolean(estructura?.profunda),
    }
  }, [seleccion, estructura, conexion, marcas])

  useEffect(() => {
    if (lista) escenaRef.current?.fijarResaltado(resaltado)
  }, [lista, resaltado])

  useEffect(() => {
    if (!lista) return
    escenaRef.current?.fijarHernias(
      marcas.flatMap((m) => (m.tipo === 'nivel' ? [{ disco: m.disco, posicion: m.posicion, lado: m.lado }] : [])),
    )
  }, [lista, marcas])

  // ── Acciones ─────────────────────────────────────────────────────────────
  const irAVista = useCallback((id: VistaId) => {
    setVista(id)
    setRotacion(false)
    const v = vistaPorId(id)
    if (v.corte) setCorte(v.corte)
    else setCorte((c) => (c.plano === 'sagital' && c.posicion === 0 ? { plano: 'ninguno', posicion: 0 } : c))
    if (id === 'columna' || id === 'posterior') setPelado((p) => Math.max(p, 1))
    escenaRef.current?.irAVista(id)
  }, [])

  const alternarPelado = () => {
    cancelAnimationFrame(animacionPelado.current)
    const destino = pelado >= PELADO_MAXIMO - 0.01 ? 0 : PELADO_MAXIMO
    const duracion = duracionDeTransicion(reducirMovimiento) * 3.2
    if (duracion === 0) {
      setPelado(destino)
      return
    }
    const desde = pelado
    const inicio = performance.now()
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion)
      setPelado(desde + (destino - desde) * t)
      if (t < 1) animacionPelado.current = requestAnimationFrame(paso)
    }
    animacionPelado.current = requestAnimationFrame(paso)
  }
  useEffect(() => () => cancelAnimationFrame(animacionPelado.current), [])

  /** Separa o une la columna y encuadra lo que importa: lo elegido o la columna entera. */
  const alternarDespiece = () => {
    const nuevo = !despiece
    setDespiece(nuevo)
    setRotacion(false)
    const escena = escenaRef.current
    if (!escena) return
    escena.fijarDespiece(nuevo)
    const enfoque = seleccion ? [...mallasDe(seleccion), ...(conexion?.piezas.map((p) => p.id) ?? [])] : []
    escena.enfocar(enfoque.length > 0 ? enfoque : ['vertebra-C1', 'sacro'])
  }

  const cambiarCapa = (id: CapaId, cambio: { visible?: boolean; opacidad?: number }) =>
    setCapas((c) => ({ ...c, [id]: { ...c[id], ...cambio } }))

  const elegirDesdeBusqueda = (id: string) => {
    setSeleccion(id)
    setRotacion(false)
    const e = estructuraPorId(id)
    // Si su capa estaba apagada, se enciende: buscar algo y no verlo confunde.
    if (e && !capas[e.capa].visible) cambiarCapa(e.capa, { visible: true })
    // Un corte podría dejar fuera justo lo buscado (la raíz derecha con el
    // sagital medio): se quita para que se vea entero.
    setCorte((c) => (c.plano === 'ninguno' ? c : { plano: 'ninguno', posicion: 0 }))
    // Lo buscado puede estar fuera de cuadro: la cámara va hacia ello y su camino.
    const piezas = conexionDe(id)?.piezas.map((p) => p.id) ?? []
    escenaRef.current?.enfocar([...mallasDe(id), ...piezas.filter((p) => !p.startsWith('sacro'))])
    setVista(null)
  }

  const marcarSeleccion = () => {
    if (!seleccion) return
    const r = crearMarcaDeRegion({ estructura: seleccion, hallazgo: 'lesion', nota: '' })
    if (r.ok) setMarcas((m) => [...m, r.marca])
  }

  // Teclado: 1–7 cambian de vista; Esc quita la selección.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || esCampoDeTexto(e.target)) return
      if (document.querySelector('.modal.show')) return
      if (e.key === 'Escape') {
        setSeleccion(null)
        return
      }
      const v = vistaPorTecla(e.key)
      if (v && lista) {
        e.preventDefault()
        irAVista(v.id)
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [irAVista, lista])

  const capturar = async (): Promise<Blob | null> => {
    const escena = escenaRef.current
    const contenedor = contenedorRef.current
    if (!escena || !contenedor) return null
    const foto = escena.capturar()
    const estilo = getComputedStyle(contenedor)
    const lineas = textoDeMarcasParaCaptura(marcas)
    if (estructura) lineas.unshift(`Estructura: ${estructura.nombre}`)
    return componerCaptura({
      vista: foto.dataUrl,
      ancho: foto.ancho,
      alto: foto.alto,
      silueta: explicar ? siluetaMarcasRef.current : siluetaFichaRef.current,
      titulo: 'Neuro 3D · Cortex',
      lineas,
      leyenda: AVISO_ESQUEMATICO,
      fondo: estilo.getPropertyValue('--cx-anat-fondo').trim() || '#040a18',
      texto: estilo.getPropertyValue('--cx-anat-texto').trim() || '#e4ecfb',
      textoSecundario: estilo.getPropertyValue('--cx-anat-texto-2').trim() || '#9fb2d6',
    })
  }

  const descargarCaptura = async () => {
    setCapturando(true)
    setAviso(null)
    try {
      const blob = await capturar()
      if (!blob) throw new Error('sin escena')
      descargar(blob, nombreDeCaptura())
      setAviso({ color: 'info', texto: 'La captura se descargó como PNG.' })
    } catch {
      setAviso({ color: 'danger', texto: 'No se pudo generar la captura. Inténtalo de nuevo.' })
    } finally {
      setCapturando(false)
    }
  }

  const abrirGuardar = async () => {
    setCapturando(true)
    setAviso(null)
    try {
      const blob = await capturar()
      if (!blob) throw new Error('sin escena')
      const lineas = textoDeMarcasParaCaptura(marcas)
      const descripcion = ['ATLAS NEURO 3D (MODELO ESQUEMÁTICO)', ...lineas.map((l) => l.toUpperCase()), estructura ? estructura.nombre.toUpperCase() : '']
        .filter(Boolean)
        .join('. ')
      setGuardar({ imagen: blob, descripcion })
    } catch {
      setAviso({ color: 'danger', texto: 'No se pudo generar la captura para guardarla. Inténtalo de nuevo.' })
    } finally {
      setCapturando(false)
    }
  }

  const dermatomasDeLasMarcas = dermatomasDeMarcas(marcas)
  const nombreHover = hover ? estructuraPorId(hover.id)?.nombre : null
  const cajaEscena = contenedorRef.current?.getBoundingClientRect()

  return (
    <div className="atlas-neuro">
      <EncabezadoPantalla
        titulo="Neuro 3D"
        descripcion="Encéfalo y columna en 3D para explicarle al paciente su lesión y su cirugía."
        icono={cil3d}
        padre={patientId !== null ? { nombre: 'Expediente', ruta: rutaDelExpediente(patientId) } : undefined}
        insignia={
          patientId !== null ? (
            <CBadge color="light" className="text-dark" data-tour="atlas-paciente">
              {nombrePaciente ? `Paciente: ${nombrePaciente}` : 'Paciente en contexto'}
            </CBadge>
          ) : undefined
        }
        acciones={
          <div className="atlas-acciones">
            <CButton
              color={explicar ? 'warning' : 'light'}
              aria-pressed={explicar}
              onClick={() => setExplicar((v) => !v)}
              data-tour="atlas-explicar"
            >
              Explicar al paciente
            </CButton>
            <CButton color="light" variant="outline" disabled={!lista || capturando} onClick={() => void descargarCaptura()} data-tour="atlas-capturar">
              {capturando ? 'Preparando…' : 'Capturar PNG'}
            </CButton>
            {puedeGuardar && (
              <CButton color="primary" disabled={!lista || capturando} onClick={() => void abrirGuardar()} data-tour="atlas-guardar">
                Guardar en el expediente
              </CButton>
            )}
          </div>
        }
        data-tour="atlas-encabezado"
      />

      <p className="atlas-aviso" role="note" data-tour="atlas-aviso">
        {AVISO_ESQUEMATICO}
      </p>

      {aviso && (
        <CAlert color={aviso.color} dismissible onClose={() => setAviso(null)} className="py-2">
          {aviso.texto}
        </CAlert>
      )}

      <div className={`atlas-rejilla${explicar ? ' atlas-rejilla--explicar' : ''}`}>
        <aside className="atlas-panel atlas-panel--navegacion" aria-label="Navegación del modelo">
          <BuscadorEstructuras alElegir={elegirDesdeBusqueda} />
          <PanelCapas
            capas={capas}
            alCambiarCapa={cambiarCapa}
            pelado={pelado}
            alCambiarPelado={(v) => {
              cancelAnimationFrame(animacionPelado.current)
              setPelado(v)
            }}
            alPelar={alternarPelado}
            corte={corte}
            alCambiarCorte={setCorte}
            flujo={flujo}
            alCambiarFlujo={setFlujo}
            rotacion={rotacion}
            alCambiarRotacion={setRotacion}
            reducirMovimiento={reducirMovimiento}
          />
        </aside>

        <section className="atlas-escena" aria-label="Modelo 3D" data-tour="atlas-escena">
          <div ref={contenedorRef} className="atlas-escena__lienzo-contenedor" />
          {estadoEscena.tipo === 'cargando' && (
            <div className="atlas-escena__estado" role="status">
              <CSpinner size="sm" className="me-2" /> Preparando el modelo…
            </div>
          )}
          {estadoEscena.tipo === 'sin-webgl' && (
            <div className="atlas-escena__estado atlas-escena__estado--aviso" role="alert">
              <h2 className="h5">Este equipo no puede mostrar el modelo 3D</h2>
              <p className="mb-0">
                El navegador no tiene activados los gráficos 3D (WebGL). Prueba con Chrome, Edge o Firefox actualizados, o activa la
                aceleración por hardware en la configuración del navegador. El resto del sistema funciona igual.
              </p>
            </div>
          )}
          {estadoEscena.tipo === 'error' && (
            <div className="atlas-escena__estado atlas-escena__estado--aviso" role="alert">
              <p className="mb-0">{estadoEscena.mensaje}</p>
            </div>
          )}
          {lista && (
            <>
              <BarraVistas activa={vista} alElegir={irAVista} />
              <div className="atlas-escena__acciones">
                <CButton
                  size="sm"
                  color={despiece ? 'primary' : 'dark'}
                  className="atlas-escena__boton"
                  aria-pressed={despiece}
                  onClick={alternarDespiece}
                  data-tour="atlas-despiece"
                >
                  {despiece ? 'Unir vértebras' : 'Separar vértebras'}
                </CButton>
                <CButton size="sm" color="dark" className="atlas-escena__boton" onClick={alternarPelado}>
                  {pelado >= PELADO_MAXIMO - 0.01 ? 'Volver a cubrir' : 'Pelar capas'}
                </CButton>
              </div>
              <p className="atlas-escena__ayuda" aria-hidden="true">
                Arrastra para girar · rueda o pellizco para acercar · toca una estructura
              </p>
            </>
          )}
          {hover && nombreHover && cajaEscena && (
            <div
              className="atlas-escena__tooltip"
              style={{ left: hover.x - cajaEscena.left + 14, top: hover.y - cajaEscena.top + 14 }}
              aria-hidden="true"
            >
              {nombreHover}
            </div>
          )}
        </section>

        <aside className="atlas-panel atlas-panel--ficha" aria-label="Ficha y explicación">
          {estructura ? (
            <FichaEstructura
              ref={siluetaFichaRef}
              estructura={estructura}
              conexion={conexion}
              alCerrar={() => setSeleccion(null)}
              alMarcar={explicar ? marcarSeleccion : undefined}
            />
          ) : (
            !explicar && (
              <div className="atlas-ficha atlas-ficha--vacia" data-tour="atlas-ficha">
                <h2 className="atlas-bloque__titulo">Toca una estructura</h2>
                <p className="atlas-bloque__ayuda mb-2">
                  Se resalta y aquí aparece qué es y para qué sirve. Prueba con una <b>raíz nerviosa</b>: se encienden su vértebra, su
                  disco, su segmento de la médula y la piel que siente.
                </p>
                <CButton color="primary" variant="outline" size="sm" onClick={() => elegirDesdeBusqueda('raiz-L5-der')} disabled={!lista}>
                  Ver la raíz L5 derecha
                </CButton>
              </div>
            )
          )}
          {explicar && (
            <PanelExplicar
              ref={siluetaMarcasRef}
              marcas={marcas}
              alAgregar={(m) => {
                setMarcas((ms) => [...ms, m])
                setRotacion(false)
                // La cámara va a la marca: el disco y la raíz que comprime.
                escenaRef.current?.enfocar(mallasAfectadas(m).slice(0, 4))
              }}
              alQuitar={(id) => setMarcas((ms) => ms.filter((m) => m.id !== id))}
            />
          )}
          {!explicar && dermatomasDeLasMarcas.length > 0 && (
            <p className="atlas-bloque__ayuda mt-2">Hay marcas activas: abre «Explicar al paciente» para verlas.</p>
          )}
        </aside>
      </div>

      {guardar && patientId !== null && (
        <ModalGuardarExpediente
          visible
          imagen={guardar.imagen}
          nombrePaciente={nombrePaciente}
          descripcionInicial={guardar.descripcion}
          alCerrar={() => setGuardar(null)}
          alDescargar={() => descargar(guardar.imagen, nombreDeCaptura())}
          guardar={async ({ descripcion, consentimiento }) => {
            await atlasApi.guardarEnExpediente({
              patientId,
              imagen: guardar.imagen,
              nombreArchivo: nombreDeCaptura(),
              descripcion,
              consentimiento,
            })
          }}
        />
      )}
    </div>
  )
}
