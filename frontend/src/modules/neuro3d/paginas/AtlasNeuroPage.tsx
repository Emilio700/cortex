/**
 * Neuro 3D: encéfalo y columna en 3D para explicarle al paciente su
 * lesión y su cirugía.
 *
 * Se abre desde el menú («Imagen y señales») o desde la pestaña Imágenes del
 * expediente; en ese caso trae al paciente en contexto y permite guardar la
 * captura en su expediente. La pantalla dice siempre, a la vista, de dónde
 * sale lo que se ve («Origen del modelo»): el modelo esquemático, el
 * esquemático ajustado a las medidas de sus radiografías o, con el módulo
 * `neuro3d_paciente`, la reconstrucción desde su TC. El aviso cambia sólo
 * cuando la escena ya muestra ese origen.
 *
 * three.js se descarga sólo aquí (paquete `vendor-three`) y la escena se carga
 * aparte, después de comprobar que el equipo puede dibujar en 3D: sin WebGL,
 * un mensaje claro en vez de una pantalla en blanco.
 *
 * Calidad «Estándar | Realista» (feat/neuro3d-realista): se recuerda por
 * usuario; sin preferencia, Realista sólo si el equipo lo aguanta. Cambiarla
 * rehace la escena con la misma cámara. Si en Realista los cuadros caen, la
 * escena avisa y se baja a Estándar diciéndolo. El aviso del origen no cambia
 * con la calidad: un modelo más realista sigue siendo esquemático.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CAlert, CBadge, CButton, CSpinner } from '@coreui/react-pro'
import { cil3d } from '@coreui/icons'

import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { useAuth } from '../../../shared/context/AuthContext'
import { useAlReactivarPestana } from '../../../shared/tabs/useAlReactivarPestana'
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
import SelectorOrigen, { type OpcionDeOrigen } from '../componentes/SelectorOrigen'
import { AVISO_ORIGEN, type OrigenModelo } from '../dominio/origenModelo'
import { AVISO_SINTETICO, describirModelo, opcionDeTc, textoDeRevision, type Modelo3D } from '../dominio/modeloPaciente'
import { useOrigenRadiografia } from '../servicios/origenRadiografia'
import { EVENTO_ORIGEN_PEDIDO, origenPedidoDeLaUrl, tomarOrigenPedido, type OrigenPedido } from '../servicios/origenPedido'
import type { CapaAnatomica } from '../servicios/anatomia/tipos'
import { mensajeDeFallo } from '../../imagen/servicios/mensajes'
import EnlaceEstudio3D from '../../imagen/componentes/EnlaceEstudio3D' // render volumétrico (VOL)
import PanelCapas from '../componentes/PanelCapas'
import PanelExplicar from '../componentes/PanelExplicar'
import { atlasApi } from '../servicios/atlasApi'
// Columna desde radiografías (feat/columna-desde-radiografias)
import { ajusteDelEje } from '../dominio/ajusteRadiografico'
import PanelMedicionesRx from '../componentes/PanelMedicionesRx'
import '../ui/radiografia.css'
import { componerCaptura, descargar, nombreDeCaptura } from '../servicios/captura'
import { useReducirMovimiento } from '../servicios/movimiento'
import { hayWebGL } from '../servicios/webgl'
import type { EscenaAtlas, EstadoDeCamara, Resaltado } from '../servicios/escena'
// Modo realista (feat/neuro3d-realista)
import {
  CALIDADES,
  calidadInicial,
  disponibilidadRealista,
  guardarPreferencia,
  leerPreferencia,
  leyendaDeCalidad,
  motivoParaEstandar,
  type Calidad,
} from '../dominio/calidad'
import { leerCapacidad } from '../servicios/capacidad'
import '../ui/atlas.css'

export const AVISO_ESQUEMATICO = AVISO_ORIGEN.esquematico

/** Encabezado de la descripción al guardar la captura, según el origen. */
const TITULO_DE_CAPTURA: Record<OrigenModelo, string> = {
  esquematico: 'ATLAS NEURO 3D (MODELO ESQUEMÁTICO)',
  radiografia: 'NEURO 3D (APROXIMACIÓN DESDE RADIOGRAFÍA)',
  tc: 'NEURO 3D (RECONSTRUCCIÓN AUTOMÁTICA DESDE TC; REVISAR CONTRA EL ESTUDIO)',
}

type EstadoEscena = { tipo: 'cargando' } | { tipo: 'lista' } | { tipo: 'sin-webgl' } | { tipo: 'error'; mensaje: string }

const esCampoDeTexto = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function AtlasNeuroPage() {
  const { patientId: patientIdTexto } = useParams<{ patientId?: string }>()
  const patientId = patientIdTexto ? Number(patientIdTexto) : null
  const { user, can, tieneModulo } = useAuth()
  const usuarioId = user?.id ?? null
  const [parametros] = useSearchParams()
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

  // ── Calidad ──────────────────────────────────────────────────────────────
  const [capacidad] = useState(leerCapacidad)
  const [calidad, setCalidad] = useState<Calidad>(() => calidadInicial(leerPreferencia(usuarioId), capacidad))
  // Tras una caída automática, si el médico vuelve a pedir Realista, manda él:
  // ya no se vigila en esta visita.
  const [cayo, setCayo] = useState(false)
  const [vigilar, setVigilar] = useState(true)
  const camaraRef = useRef<EstadoDeCamara | null>(null)
  const usuarioRef = useRef(usuarioId)
  usuarioRef.current = usuarioId
  const realistaDisponible = disponibilidadRealista(capacidad)
  const leyenda = leyendaDeCalidad(capacidad, cayo, calidad)

  // ── Origen del modelo ────────────────────────────────────────────────────
  // `origen` es lo que la escena YA muestra (o, con «radiografia», lo que se
  // está rehaciendo con las medidas): el aviso se lee de aquí. Los tres
  // orígenes pasan por `cambiarOrigen`:
  //  · «tc» pone la capa del paciente sobre el atlas sin ajustar;
  //  · «radiografia» quita esa capa y rehace la escena con el eje ajustado;
  //  · «esquematico» quita las dos cosas.
  const [origen, setOrigen] = useState<OrigenModelo>('esquematico')
  const [cambiandoOrigen, setCambiandoOrigen] = useState(false)
  const [modelos, setModelos] = useState<Modelo3D[] | null | undefined>(undefined)
  const [modeloMostrado, setModeloMostrado] = useState<Modelo3D | null>(null)
  const [revisando, setRevisando] = useState(false)
  const capaPacienteRef = useRef<CapaAnatomica | null>(null)
  const [recargaModelos, setRecargaModelos] = useState(0)
  const conModuloPaciente = patientId !== null && tieneModulo('neuro3d_paciente') && can('clinical_images.read')
  const radiografia = useOrigenRadiografia(patientId)

  // «Ver en Neuro 3D» (desde la radiografía o desde el visor de TC) deja el
  // origen pedido en `origenPedido`, porque las pestañas pierden el `?…`; la
  // URL queda como respaldo (un enlace pegado, las pruebas). Se aplica una vez,
  // en cuanto la escena y el modelo pedido están listos.
  const [pedido, setPedido] = useState<OrigenPedido | null>(
    () => (patientId !== null ? tomarOrigenPedido(patientId) : null) ?? origenPedidoDeLaUrl(parametros),
  )
  // El modelo de TC preferido para la opción «Tomografía del paciente».
  const [preferido, setPreferido] = useState<number | null>(() => pedido?.modeloId ?? null)

  const atenderPedido = useCallback(() => {
    if (patientId === null) return
    // Al volver a la pestaña pudo guardarse o anularse un ajuste de radiografía.
    radiografia.recargar()
    const p = tomarOrigenPedido(patientId)
    if (!p) return
    if (p.modeloId) setPreferido(p.modeloId)
    // El modelo de TC pedido suele ser nuevo: se relee la lista (sin lista, el
    // pedido espera a la nueva).
    if (p.origen === 'tc') {
      setModelos(undefined)
      setRecargaModelos((n) => n + 1)
    }
    setPedido(p)
  }, [patientId, radiografia.recargar])
  // La pestaña de Neuro 3D no se desmonta: el pedido llega por evento (si ya
  // estaba abierta) o al volver a ella.
  useAlReactivarPestana(atenderPedido)
  useEffect(() => {
    const alPedir = (e: Event) => {
      if ((e as CustomEvent<{ patientId: number }>).detail?.patientId === patientId) atenderPedido()
    }
    window.addEventListener(EVENTO_ORIGEN_PEDIDO, alPedir)
    return () => window.removeEventListener(EVENTO_ORIGEN_PEDIDO, alPedir)
  }, [patientId, atenderPedido])

  // Si el ajuste de radiografía deja de estar vigente (se anuló), la escena
  // vuelve al esquemático y el aviso con ella.
  const origenEfectivo: OrigenModelo = origen === 'radiografia' && !radiografia.ajuste ? 'esquematico' : origen
  const ajusteVigente = origenEfectivo === 'radiografia' ? radiografia.ajuste : null
  const ajusteDeEscena = useMemo(() => (ajusteVigente ? ajusteDelEje(ajusteVigente.mediciones) : null), [ajusteVigente])
  const claveDeEscena = `${ajusteDeEscena && ajusteVigente ? `rx-${ajusteVigente.id}` : 'esquematico'}·${calidad}`

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
    setEstadoEscena({ tipo: 'cargando' })
    void (async () => {
      try {
        const { crearEscena } = await import('../servicios/escena')
        creada = await crearEscena({
          contenedor,
          reducirMovimiento,
          ajusteColumna: ajusteDeEscena,
          calidad,
          camara: camaraRef.current,
          vigilarRendimiento: vigilar,
          alRendimientoBajo: () => {
            if (cancelado) return
            // La leyenda junto al interruptor lo dice y ofrece reintentar.
            setCayo(true)
            setCalidad('estandar')
            guardarPreferencia(usuarioRef.current, 'estandar')
          },
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
        else if (calidad === 'realista') {
          // Realista pide más a la tarjeta: si no se pudo, se intenta en
          // Estándar y se dice, en vez de dejar al médico sin modelo.
          setCayo(true)
          setCalidad('estandar')
          setAviso({ color: 'info', texto: 'No se pudo preparar el modo Realista en este equipo; se muestra en Estándar.' })
        } else setEstadoEscena({ tipo: 'error', mensaje: 'No se pudo preparar el modelo 3D. Recarga la pantalla; si sigue igual, avisa a soporte.' })
      }
    })()
    return () => {
      cancelado = true
      escenaRef.current = null
      // La escena siguiente (otra calidad u otra columna) arranca con esta cámara.
      if (creada) camaraRef.current = creada.camara?.() ?? camaraRef.current
      creada?.liberar()
    }
    // La escena se crea una vez por columna (el ajuste de la radiografía cambia
    // la geometría); el resto de los cambios se le pasan abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDeEscena])

  const lista = estadoEscena.tipo === 'lista'

  const elegirCalidad = (c: Calidad) => {
    if (c === calidad) return
    if (c === 'realista' && !realistaDisponible.disponible) return
    if (c === 'realista' && cayo) setVigilar(false)
    guardarPreferencia(usuarioId, c)
    setAviso(null)
    setCalidad(c)
  }

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

  // ── Modelos del paciente ─────────────────────────────────────────────────
  useEffect(() => {
    if (!conModuloPaciente || patientId === null) return
    let vigente = true
    atlasApi
      .modelosDelPaciente(patientId)
      .then((m) => vigente && setModelos(m))
      .catch(() => vigente && setModelos(null))
    return () => {
      vigente = false
    }
  }, [conModuloPaciente, patientId, recargaModelos])

  const tc = useMemo(() => (modelos === undefined ? null : opcionDeTc(modelos, preferido)), [modelos, preferido])
  const opcionesDeOrigen = useMemo(() => {
    const o: Partial<Record<OrigenModelo, OpcionDeOrigen>> = {
      esquematico: { disponible: true },
      radiografia: radiografia.opcion,
    }
    if (conModuloPaciente) o.tc = tc?.opcion ?? { disponible: false, motivo: 'Consultando los modelos del paciente…' }
    return o
  }, [conModuloPaciente, tc, radiografia.opcion])

  const cambiarOrigen = useCallback(
    async (nuevo: OrigenModelo) => {
      const escena = escenaRef.current
      if (!escena) return
      setCambiandoOrigen(true)
      setAviso(null)
      try {
        if (nuevo === 'tc') {
          const modelo = tc?.modelo
          if (!modelo) throw new Error('No hay un modelo listo de este paciente.')
          const [datos, { crearCapaPaciente }] = await Promise.all([
            atlasApi.mallasDelModelo(modelo.id),
            import('../servicios/anatomia/capaPaciente'),
          ])
          const capa = crearCapaPaciente(datos)
          await escena.fijarCapaPaciente(capa)
          // Si se venía de «radiografia», la escena se rehace sin ajuste y el
          // efecto de abajo vuelve a poner esta capa.
          capaPacienteRef.current = capa
          setModeloMostrado(modelo)
        } else {
          if (nuevo === 'radiografia' && !radiografia.ajuste) throw new Error('Este paciente no tiene un ajuste de radiografía vigente.')
          await escena.fijarCapaPaciente(null)
          capaPacienteRef.current = null
          setModeloMostrado(null)
        }
        // Sólo ahora, con la escena ya cambiada, cambia lo que dice el aviso.
        // Con «radiografia» la escena se rehace al cambiar `claveDeEscena` y,
        // mientras, dice «Preparando el modelo…».
        setOrigen(nuevo)
        setRotacion(false)
        escena.enfocar(['vertebra-C1', 'sacro'])
      } catch (err) {
        setAviso({
          color: 'danger',
          texto: `No se pudo mostrar ese modelo: ${mensajeDeFallo(err)} Se sigue viendo el anterior.`,
        })
      } finally {
        setCambiandoOrigen(false)
      }
    },
    [tc, radiografia.ajuste],
  )

  // Si la escena se vuelve a crear (al cambiar el ajuste de la columna), la
  // capa del paciente se vuelve a poner sola.
  useEffect(() => {
    if (lista && capaPacienteRef.current) void escenaRef.current?.fijarCapaPaciente(capaPacienteRef.current)
  }, [lista])

  // El origen pedido se aplica cuando hay con qué: la escena lista y, según el
  // caso, el modelo de TC pedido o el ajuste de radiografía. Si no existe, se
  // descarta y queda el esquemático con la opción deshabilitada y su motivo.
  useEffect(() => {
    if (!pedido || !lista || cambiandoOrigen) return
    if (pedido.origen === 'tc') {
      if (!conModuloPaciente) return setPedido(null)
      // `tc` es null mientras se consulta (o relee) la lista de modelos.
      if (!tc) return
      // Sólo se abre el modelo pedido; si no está listo, queda el selector con su motivo.
      if (!tc.modelo || (pedido.modeloId && tc.modelo.id !== pedido.modeloId)) return setPedido(null)
    } else if (pedido.origen === 'radiografia') {
      if (radiografia.cargando) return
      if (!radiografia.ajuste) return setPedido(null)
    }
    setPedido(null)
    const yaSeVe = pedido.origen === origen && (origen !== 'tc' || tc?.modelo?.id === modeloMostrado?.id)
    if (!yaSeVe) void cambiarOrigen(pedido.origen)
  }, [pedido, lista, cambiandoOrigen, conModuloPaciente, tc, radiografia.cargando, radiografia.ajuste, origen, modeloMostrado, cambiarOrigen])

  const elegirOrigen = (o: OrigenModelo) => {
    // Lo que elige el médico manda sobre un pedido que no se ha aplicado.
    setPedido(null)
    void cambiarOrigen(o)
  }


  const marcarRevisado = async () => {
    if (!modeloMostrado) return
    setRevisando(true)
    try {
      const actualizado = await atlasApi.marcarRevisado(modeloMostrado.id)
      setModeloMostrado(actualizado)
      setModelos((ms) => ms?.map((m) => (m.id === actualizado.id ? actualizado : m)) ?? ms)
      setAviso({ color: 'success', texto: 'Quedó registrado que revisaste la reconstrucción.' })
    } catch (err) {
      setAviso({ color: 'danger', texto: `No se pudo registrar la revisión: ${mensajeDeFallo(err)}` })
    } finally {
      setRevisando(false)
    }
  }

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
    // La estructura misma también va: la médula del paciente es una sola malla
    // con el id de la compuesta («medula-espinal»).
    const sel = seleccion ? [...new Set([...mallasDe(seleccion), seleccion])] : []
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
      leyenda: modeloMostrado?.sintetico ? `${AVISO_ORIGEN[origenEfectivo]} ${AVISO_SINTETICO}` : AVISO_ORIGEN[origenEfectivo],
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
      const descripcion = [TITULO_DE_CAPTURA[origenEfectivo], ...lineas.map((l) => l.toUpperCase()), estructura ? estructura.nombre.toUpperCase() : '']
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
            {patientId !== null && can('clinical_images.read') && <EnlaceEstudio3D patientId={patientId} />}
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

      {patientId !== null && (
        <SelectorOrigen
          valor={origenEfectivo}
          opciones={opcionesDeOrigen}
          alCambiar={elegirOrigen}
          ocupado={cambiandoOrigen || !lista}
        >
          {/* Columna desde radiografías (feat/columna-desde-radiografias) */}
          {can('spine_rx.write') && (
            <Link to={`/pacientes/${patientId}/neuro-3d/radiografia`} className="btn btn-sm btn-outline-primary" data-tour="atlas-marcar-rx">
              Marcar radiografías
            </Link>
          )}
        </SelectorOrigen>
      )}

      <div className={`atlas-aviso${origenEfectivo === 'tc' ? ' atlas-aviso--paciente' : ''}`} role="note" data-tour="atlas-aviso">
        <p className="mb-0">{AVISO_ORIGEN[origenEfectivo]}</p>
        {cambiandoOrigen && (
          <div className="mt-1" role="status">
            <CSpinner size="sm" className="me-2" />
            Cargando el modelo…
          </div>
        )}
        {origenEfectivo === 'tc' && modeloMostrado && (
          <>
            {modeloMostrado.sintetico && <p className="atlas-aviso__sintetico mb-0 mt-1">{AVISO_SINTETICO}</p>}
            <p className="atlas-aviso__detalle mb-0 mt-1" data-tour="atlas-modelo-paciente">
              {describirModelo(modeloMostrado)}. Las raíces, los discos y el encéfalo siguen siendo esquemáticos.{' '}
              <span className={modeloMostrado.confirmado_en ? undefined : 'atlas-aviso__pendiente'}>{textoDeRevision(modeloMostrado)}</span>
              {!modeloMostrado.confirmado_en && can('neuro3d.generar_modelo') && (
                <CButton
                  size="sm"
                  color="primary"
                  variant="outline"
                  className="ms-2"
                  disabled={revisando}
                  onClick={() => void marcarRevisado()}
                >
                  {revisando ? 'Registrando…' : 'Marcar como revisada'}
                </CButton>
              )}
            </p>
          </>
        )}
      </div>

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
                {/* Modo realista (feat/neuro3d-realista) */}
                <div className="atlas-calidad-bloque" data-tour="atlas-calidad">
                  <div className="atlas-calidad" role="group" aria-label="Calidad del modelo" aria-describedby="atlas-calidad-leyenda">
                    {CALIDADES.map((c) => {
                      const bloqueada = c.id === 'realista' && !realistaDisponible.disponible
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`atlas-calidad__opcion${calidad === c.id ? ' is-activa' : ''}`}
                          aria-pressed={calidad === c.id}
                          disabled={bloqueada}
                          title={c.id === 'realista' && calidad === 'estandar' ? (motivoParaEstandar(capacidad) ?? undefined) : undefined}
                          onClick={() => elegirCalidad(c.id)}
                        >
                          {c.nombre}
                        </button>
                      )
                    })}
                  </div>
                  <p
                    id="atlas-calidad-leyenda"
                    className={`atlas-calidad__leyenda atlas-calidad__leyenda--${leyenda.tono}`}
                    role="status"
                    // El nombre de la tarjeta sólo vive aquí, en el tooltip: no se envía a ningún lado.
                    title={capacidad.gpu ? `Tarjeta gráfica: ${capacidad.gpu}` : undefined}
                  >
                    {leyenda.texto}
                    {leyenda.reintentar && (
                      <button type="button" className="atlas-calidad__reintentar" onClick={() => elegirCalidad('realista')}>
                        Reintentar realista
                      </button>
                    )}
                  </p>
                </div>
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
          {ajusteVigente && (
            <div className="mb-3">
              <PanelMedicionesRx resultado={ajusteVigente.mediciones} calibraciones={ajusteVigente.calibracion} origen="servidor" compacto />
            </div>
          )}
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
