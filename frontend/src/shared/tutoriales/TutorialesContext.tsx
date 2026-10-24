/**
 * Estado de los tutoriales en la sesión: cuáles le tocan a la persona, qué
 * quedó a medias, el recorrido completo de su rol y el centro de ayuda.
 *
 * Regla de fondo: nada arranca solo. Un recorrido se ve porque la persona lo
 * pidió (el botón «?», un «¿Cómo se llena?» o el recorrido completo que ella
 * empezó). Lo único que aparece sin pedirlo es un aviso de una línea, una sola
 * vez, que dice dónde está la ayuda y no abre nada.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CATALOGO } from './recorridos'
import { RECORRIDOS_COMPLETOS } from './recorridos/completos'
import type { EtapaCompleta, Recorrido, RecorridoCompleto } from './tipos'
import {
  avisoYaMostrado,
  borrarProgreso,
  guardarProgreso,
  leerAvance,
  leerProgreso,
  marcarAvisoMostrado,
  marcarNovedadesAvisadas,
  novedadesYaAvisadas,
  marcarVisto,
  olvidarVistos,
  yaLoVio,
} from './almacen'
import { esMomentoOportuno } from './arranque'
import { VERSION_NOVEDADES } from './novedades'
import {
  comoAbrir,
  completoDeRol,
  etapaActual,
  etapaSiguiente,
  pasoEnPantalla,
  puedeIrA,
  resolverCompleto,
  type EtapaResuelta,
} from './centro'
import {
  cargarMotor,
  detenerRecorrido,
  hayRecorridoActivo,
  iniciarRecorrido,
  limpiarRestos,
  type MotivoCierre,
} from './motor'
import {
  contextoPresente,
  recorridosDeRuta,
  recorridosDisponibles,
  tieneAncla,
} from './visibilidad'

/** Lo que tarda el centro de ayuda en cerrarse; antes, el recorrido señalaría detrás. */
export const ESPERA_CIERRE_CENTRO_MS = 350
/** Pausa entre una etapa del recorrido completo y la siguiente. */
export const PAUSA_ENTRE_ETAPAS_MS = 400
const INTERVALO_MS = 250
/** Si en este tiempo la pantalla no tiene qué señalar, se desiste y se explica. */
export const PACIENCIA_MS = 8000
/** El mensaje de estado se quita solo: informa, no pide nada. */
export const DURACION_MENSAJE_MS = 15000

/** Lo que se muestra en el índice: Visto, A medias (X de Y) o Nuevo. */
export type EstadoRecorrido =
  | { tipo: 'visto' }
  /** Desde 1, contado como lo mostró el globo: sobre los pasos que estaban en pantalla. */
  | { tipo: 'a-medias'; paso: number; total: number }
  | { tipo: 'nuevo' }

/** `continuar` retoma donde se quedó; `inicio` empieza desde el primer paso. */
export type ModoInicio = 'continuar' | 'inicio'

/**
 * Por qué el centro muestra un recorrido en lugar de arrancarlo:
 * - `datos`: necesita una paciente o consulta concreta.
 * - `formulario`: necesita un formulario abierto.
 * - `sin-elementos`: se intentó, pero la pantalla no tiene nada que señalar.
 * - `paso-no-visible`: se buscó un paso que ahora no está a la vista.
 */
export type RazonDetalle = 'datos' | 'formulario' | 'sin-elementos' | 'paso-no-visible'

export interface Detalle {
  recorridoId: string
  razon: RazonDetalle
  /** Paso buscado (índice declarado), para resaltarlo al leer. */
  paso?: number
  /** Es la etapa del recorrido completo en que va. */
  enCompleto: boolean
}

export interface EstadoCompleto {
  definicion: RecorridoCompleto
  aplicables: EtapaResuelta[]
  /** Etapas que no le tocan por permisos: se saltan y se dice. */
  saltadas: EtapaCompleta[]
  tipo: 'nuevo' | 'a-medias' | 'visto'
  /** Etapa en que va (a medias) o la primera (nuevo). */
  actual: EtapaResuelta | null
  /** Posición de `actual` entre las aplicables, desde 1. */
  numero: number
  total: number
  /** Se está recorriendo ahora mismo (no en pausa). */
  enCurso: boolean
}

export interface OpcionesAbrir {
  modo?: ModoInicio
  /** Llevar directo a este paso (índice declarado), p. ej. desde la búsqueda. */
  desdePaso?: number
}

interface TutorialesContextValue {
  /** Todos los recorridos que su rol y permisos le permiten. */
  disponibles: Recorrido[]
  /** Los de la pantalla abierta que aplican ahora mismo (se evalúa al llamar). */
  deEstaPantalla: () => Recorrido[]
  visto: (r: Recorrido) => boolean
  estado: (r: Recorrido) => EstadoRecorrido
  progresoGeneral: { vistos: number; total: number }
  /**
   * Arranca ya un recorrido de la pantalla (lo usan los «¿Cómo se llena?»).
   * No devuelve resultado: la primera vez puede tardar un instante en traer
   * el motor pesado (`import()`), así que no hay un «arrancó sí/no» sincrónico.
   */
  iniciar: (id: string, modo?: ModoInicio) => void
  /** Desde el centro: arranca aquí, navega y arranca, o explica cómo llegar. */
  abrir: (id: string, opciones?: OpcionesAbrir) => void
  /** Lo leyó en el centro, sin recorrerlo en pantalla. */
  marcarLeido: (id: string) => void
  completo: EstadoCompleto | null
  empezarCompleto: () => void
  continuarCompleto: () => void
  saltarEtapa: () => void
  pausarCompleto: () => void
  detalle: Detalle | null
  cerrarDetalle: () => void
  centroAbierto: boolean
  abrirCentro: () => void
  cerrarCentro: () => void
  /** Ir a una pantalla (sólo navegar; nunca elige una paciente). */
  irA: (ruta: string) => void
  puedeIrA: (ruta: string) => boolean
  /** Aviso de la primera vez junto al botón de ayuda. */
  aviso: boolean
  descartarAviso: () => void
  /** Aviso de una línea de que GEMS se actualizó: una vez por usuaria y versión. */
  avisoNovedades: boolean
  descartarAvisoNovedades: () => void
  /** Si la página de novedades está desplegada en el centro de ayuda. */
  novedadesAbiertas: boolean
  alternarNovedades: () => void
  /** Abre el centro con las novedades desplegadas (sólo cuando la persona lo pide). */
  abrirNovedades: () => void
  /** Mensaje de estado breve (pausa, cierre por cambio de pantalla, fin). */
  mensaje: string | null
  descartarMensaje: () => void
  reiniciarVistos: () => void
}

const TutorialesContext = createContext<TutorialesContextValue | null>(null)

interface Pedido {
  id: string
  modo: ModoInicio
  desdePaso?: number
  enCompleto: boolean
}

const MENSAJE_POR_MOTIVO: Partial<Record<MotivoCierre | 'ruta', string>> = {
  ruta: 'Pausamos el recorrido porque cambiaste de pantalla. Tu avance quedó guardado: continúalo desde el botón ? cuando quieras.',
  desaparecio:
    'El recorrido se cerró porque lo que señalaba ya no está en pantalla. Tu avance quedó guardado: continúalo desde el botón ?.',
  error:
    'El recorrido tuvo un problema y se cerró; la pantalla sigue funcionando normal. Puedes volver a abrirlo desde el botón ?.',
}

export const TutorialesProvider = ({
  children,
  catalogo = CATALOGO,
  completos = RECORRIDOS_COMPLETOS,
}: {
  children: ReactNode
  /** Inyectables para pruebas. */
  catalogo?: Recorrido[]
  completos?: RecorridoCompleto[]
}) => {
  const { user, permissions } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const ruta = location.pathname
  const [, setVersionEstado] = useState(0)
  const [centroAbierto, setCentroAbierto] = useState(false)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [aviso, setAviso] = useState(false)
  const [avisoNovedades, setAvisoNovedades] = useState(false)
  const [novedadesAbiertas, setNovedadesAbiertas] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [completoEnCurso, setCompletoEnCurso] = useState(false)
  const pendienteRef = useRef<Pedido | null>(null)
  const motivoDetencionRef = useRef<'ruta' | null>(null)
  const centroAbiertoRef = useRef(false)
  centroAbiertoRef.current = centroAbierto
  const completoEnCursoRef = useRef(false)
  completoEnCursoRef.current = completoEnCurso
  const temporizadoresRef = useRef(new Set<ReturnType<typeof setTimeout>>())
  /** El proveedor sigue montado: una carga diferida no debe arrancar nada tras cerrar sesión. */
  const vivoRef = useRef(true)
  /** Ruta vigente, para cancelar un arranque pendiente si la pantalla cambió. */
  const rutaRef = useRef(ruta)
  rutaRef.current = ruta

  const acceso = useMemo(() => ({ role: user?.role, permissions }), [user?.role, permissions])

  // Un catálogo mal escrito no puede tumbar la aplicación que lo aloja: en el
  // peor caso la ayuda queda vacía y todo lo demás sigue funcionando.
  const disponibles = useMemo(() => {
    try {
      return recorridosDisponibles(catalogo, acceso)
    } catch (error) {
      console.error('[tutoriales] no se pudo leer el catálogo', error)
      return []
    }
  }, [catalogo, acceso])

  const refrescar = () => setVersionEstado((v) => v + 1)

  const programar = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      temporizadoresRef.current.delete(t)
      fn()
    }, ms)
    temporizadoresRef.current.add(t)
  }

  const visto = (r: { id: string; version: number }) =>
    user ? yaLoVio(user.id, r.id, r.version) : true

  const progresoDe = (r: { id: string; version: number }) =>
    user ? leerProgreso(user.id, r.id, r.version) : null

  const estado = (r: Recorrido): EstadoRecorrido => {
    if (visto(r)) return { tipo: 'visto' }
    const avance = user ? leerAvance(user.id, r.id, r.version) : null
    if (!avance) return { tipo: 'nuevo' }
    // Se cuenta como lo contó el globo, para que "A medias (2 de 8)" diga lo
    // mismo que la persona vio; si no se guardó, sobre los pasos declarados.
    if (avance.enPantalla) {
      return { tipo: 'a-medias', paso: avance.enPantalla.posicion, total: avance.enPantalla.total }
    }
    return {
      tipo: 'a-medias',
      paso: Math.min(avance.paso, r.pasos.length - 1) + 1,
      total: r.pasos.length,
    }
  }

  /* ---------------- recorrido completo ---------------- */

  const definicion = completoDeRol(completos, acceso)
  const resuelto = definicion ? resolverCompleto(definicion, disponibles) : null

  const calcularCompleto = (): EstadoCompleto | null => {
    if (!definicion || !resuelto || resuelto.aplicables.length === 0) return null
    const avance = progresoDe(definicion)
    const actual = etapaActual(resuelto.aplicables, avance)
    let tipo: EstadoCompleto['tipo'] = 'nuevo'
    if (avance !== null && actual) tipo = 'a-medias'
    else if (visto(definicion) || (avance !== null && !actual)) tipo = 'visto'
    const enLista = actual ?? resuelto.aplicables[0]
    return {
      definicion,
      aplicables: resuelto.aplicables,
      saltadas: resuelto.saltadas,
      tipo,
      actual: tipo === 'visto' ? null : enLista,
      numero: resuelto.aplicables.indexOf(enLista) + 1,
      total: resuelto.aplicables.length,
      enCurso: completoEnCurso,
    }
  }
  const completo = calcularCompleto()

  /** Etapa en que va el recorrido completo, sólo si ya lo empezó. */
  const etapaEnCurso = (): EtapaResuelta | null => {
    if (!definicion || !resuelto) return null
    const avance = progresoDe(definicion)
    if (avance === null) return null
    return etapaActual(resuelto.aplicables, avance)
  }

  /**
   * Si el recorrido terminado es la etapa en que va el completo, lo avanza.
   * Sirve igual si la etapa se vio desde el completo o desde un «¿Cómo se
   * llena?»: lo que cuenta es que ya lo vio.
   */
  const avanzarSiEsEtapa = (recorridoId: string): EtapaResuelta | 'terminado' | null => {
    if (!user || !definicion || !resuelto) return null
    const actual = etapaEnCurso()
    if (!actual || actual.recorrido.id !== recorridoId) return null
    const siguiente = etapaSiguiente(resuelto.aplicables, actual)
    if (siguiente) {
      guardarProgreso(user.id, definicion.id, definicion.version, siguiente.indice)
      return siguiente
    }
    marcarVisto(user.id, definicion.id, definicion.version)
    return 'terminado'
  }

  const posicion = (e: EtapaResuelta) =>
    `«${e.etapa.nombre}» (${(resuelto?.aplicables.indexOf(e) ?? 0) + 1} de ${resuelto?.aplicables.length ?? 0})`

  /* ---------------- arrancar recorridos ---------------- */

  /**
   * Arranca el recorrido. Es asíncrona porque la primera vez espera a que
   * llegue el motor pesado (`cargarMotor()`): driver.js no viaja en el
   * paquete inicial. Devuelve `false` si no hay nada que mostrar donde está,
   * y `'cancelado'` si mientras cargaba cambió la pantalla o se cerró la
   * sesión: arrancar entonces señalaría otra cosa, y nadie lo pidió.
   */
  const lanzarAhora = async (
    recorrido: Recorrido,
    pedido: Omit<Pedido, 'id'>,
  ): Promise<boolean | 'cancelado'> => {
    try {
      if (!user) return 'cancelado'
      const usuarioId = user.id
      const desde =
        pedido.desdePaso !== undefined
          ? pedido.desdePaso
          : pedido.modo === 'continuar'
            ? progresoDe(recorrido)
            : null
      setMensaje(null)
      if (!(await cargarMotor())) return false
      if (!vivoRef.current || rutaRef.current !== ruta) return 'cancelado'
      return iniciarRecorrido(recorrido, {
        desdePaso: desde ?? undefined,
        alMostrarPaso: (paso, enPantalla) =>
          guardarProgreso(usuarioId, recorrido.id, recorrido.version, paso, enPantalla),
        // Sólo cuenta como visto si se llegó al final. Cerrarlo antes deja
        // guardado el último paso para ofrecer continuar ahí.
        alCerrar: (terminado, motivo) =>
          accionesRef.current.alCerrar(recorrido, pedido, terminado, motivo),
      })
    } catch (error) {
      console.error('[tutoriales] no se pudo arrancar el recorrido', error)
      return false
    }
  }

  const alCerrar = (
    recorrido: Recorrido,
    pedido: Omit<Pedido, 'id'>,
    terminado: boolean,
    motivo: MotivoCierre,
  ) => {
    if (!user) return
    const porRuta = motivo === 'detenido' && motivoDetencionRef.current === 'ruta'
    // Se lee antes de pausar: el aviso de pausa sólo tiene sentido si el
    // completo iba avanzando, no si la etapa se vio desde un «¿Cómo se llena?».
    const estabaEnCurso = completoEnCursoRef.current
    if (terminado) {
      marcarVisto(user.id, recorrido.id, recorrido.version)
      const avance = avanzarSiEsEtapa(recorrido.id)
      if (avance === 'terminado') {
        setCompletoEnCurso(false)
        setMensaje(
          '¡Terminaste el recorrido completo! Cualquier parte la puedes repetir cuando quieras desde el botón ?.',
        )
      } else if (avance && pedido.enCompleto && estabaEnCurso) {
        programar(() => accionesRef.current.continuarCompleto('inicio'), PAUSA_ENTRE_ETAPAS_MS)
      } else if (avance) {
        setMensaje(
          `Listo. En el recorrido completo sigue ${posicion(avance)}. Continúalo desde el botón ? cuando quieras.`,
        )
      }
    } else {
      if (pedido.enCompleto) setCompletoEnCurso(false)
      const clave = porRuta ? 'ruta' : motivo
      const texto = MENSAJE_POR_MOTIVO[clave]
      if (texto) setMensaje(texto)
      else if (pedido.enCompleto && estabaEnCurso && motivo === 'cerrado') {
        const actual = etapaEnCurso()
        if (actual) {
          setMensaje(
            `Recorrido completo en pausa: vas en ${posicion(actual)}. Continúalo desde el botón ? cuando quieras.`,
          )
        }
      }
    }
    refrescar()
  }

  /**
   * Arranca el recorrido si se puede ver donde está; si vive en otra
   * pantalla sin datos, navega y lo arranca al cargar; si necesita una
   * paciente o un formulario, lo explica en el centro sin abrir nada.
   */
  const ejecutar = (recorrido: Recorrido, pedido: Omit<Pedido, 'id'>) => {
    const apertura = comoAbrir(recorrido, ruta)
    const explicar = (razon: RazonDetalle) => {
      setDetalle({
        recorridoId: recorrido.id,
        razon,
        paso: pedido.desdePaso,
        enCompleto: pedido.enCompleto,
      })
      setCentroAbierto(true)
    }
    if (apertura.tipo === 'necesita') {
      explicar(apertura.razon)
      return
    }
    if (apertura.tipo === 'navegar') {
      pendienteRef.current = { id: recorrido.id, ...pedido }
      setDetalle(null)
      setCentroAbierto(false)
      navigate(apertura.ruta)
      return
    }
    if (pedido.desdePaso !== undefined) {
      const paso = recorrido.pasos[pedido.desdePaso]
      if (paso && !pasoEnPantalla(paso)) {
        explicar('paso-no-visible')
        return
      }
    }
    const arrancar = async () => {
      const resultado = await lanzarAhora(recorrido, pedido)
      // 'cancelado': cambió la pantalla (o se cerró la sesión) mientras
      // llegaba el motor. No hay nada que explicar, y menos abrir el centro
      // solo: la ayuda nunca aparece sin que se le pida.
      if (resultado === 'cancelado') return
      if (!resultado) {
        if (pedido.enCompleto) setCompletoEnCurso(false)
        explicar('sin-elementos')
      }
    }
    if (centroAbiertoRef.current) {
      setDetalle(null)
      setCentroAbierto(false)
      programar(() => {
        void arrancar()
      }, ESPERA_CIERRE_CENTRO_MS)
    } else {
      void arrancar()
    }
  }

  const buscarDisponible = (id: string) => disponibles.find((r) => r.id === id)

  const continuarCompleto = (modo: ModoInicio = 'continuar') => {
    if (!user || !definicion || !resuelto) return
    const avance = progresoDe(definicion)
    const actual = etapaActual(resuelto.aplicables, avance)
    if (!actual) {
      marcarVisto(user.id, definicion.id, definicion.version)
      setCompletoEnCurso(false)
      refrescar()
      return
    }
    guardarProgreso(user.id, definicion.id, definicion.version, actual.indice)
    setCompletoEnCurso(true)
    completoEnCursoRef.current = true
    ejecutar(actual.recorrido, { modo, enCompleto: true })
    refrescar()
  }

  const acciones = {
    alCerrar,
    continuarCompleto,
    lanzarAhora,
    ejecutar,
  }
  const accionesRef = useRef(acciones)
  accionesRef.current = acciones

  /* ---------------- efectos ---------------- */

  // Cambiar de pantalla a media explicación pausa el recorrido: lo que
  // señalaba ya no está a la vista (las pestañas quedan montadas y ocultas) y
  // dejar el fondo oscurecido sobre otra pantalla sería estorbar.
  // Si el cambio lo pidió el propio centro, al llegar se arranca lo pedido.
  useEffect(() => {
    if (hayRecorridoActivo()) {
      motivoDetencionRef.current = 'ruta'
      detenerRecorrido()
      motivoDetencionRef.current = null
    }
    const pedido = pendienteRef.current
    pendienteRef.current = null
    if (!user || !pedido) return
    const candidato = disponibles.find((r) => r.id === pedido.id)
    if (!candidato) return

    const inicioIntento = Date.now()
    let temporizador: ReturnType<typeof setTimeout>
    let lanzado = false
    const intentar = () => {
      const listo =
        !hayRecorridoActivo() &&
        esMomentoOportuno() &&
        contextoPresente(candidato) &&
        tieneAncla(candidato.pasos)
      if (listo) {
        lanzado = true
        accionesRef.current.ejecutar(candidato, pedido)
        return
      }
      if (Date.now() - inicioIntento > PACIENCIA_MS) {
        lanzado = true
        if (pedido.enCompleto) setCompletoEnCurso(false)
        setDetalle({
          recorridoId: candidato.id,
          razon: 'sin-elementos',
          enCompleto: pedido.enCompleto,
        })
        setCentroAbierto(true)
        return
      }
      temporizador = setTimeout(intentar, INTERVALO_MS)
    }
    // El primer intento espera a que el centro termine de cerrarse.
    temporizador = setTimeout(intentar, ESPERA_CIERRE_CENTRO_MS)
    return () => {
      clearTimeout(temporizador)
      // Se fue a otra pantalla antes de que ésta cargara: el completo queda en pausa.
      if (!lanzado && pedido.enCompleto) setCompletoEnCurso(false)
    }
    // Sólo al cambiar de pantalla o de usuaria.
  }, [ruta, user?.id])

  // El aviso de la primera vez: una sola vez por usuaria, y sólo si hay ayuda
  // que ofrecerle. Se anota al mostrarse.
  useEffect(() => {
    if (!user || disponibles.length === 0) return
    if (avisoYaMostrado(user.id)) {
      // Quien ya conocía GEMS ve, una vez, que hay novedades. Sólo la franja:
      // la página se abre únicamente si la pide (regla de «nada arranca solo»).
      if (!novedadesYaAvisadas(user.id, VERSION_NOVEDADES)) {
        marcarNovedadesAvisadas(user.id, VERSION_NOVEDADES)
        setAvisoNovedades(true)
      }
      return
    }
    marcarAvisoMostrado(user.id)
    // Para quien llega por primera vez todo es nuevo: no se le dice «cambió».
    marcarNovedadesAvisadas(user.id, VERSION_NOVEDADES)
    setAviso(true)
  }, [user, disponibles.length])

  useEffect(() => {
    if (!mensaje) return
    const t = setTimeout(() => setMensaje(null), DURACION_MENSAJE_MS)
    return () => clearTimeout(t)
  }, [mensaje])

  // Al desmontar (cerrar sesión), nada del tutorial se queda en pantalla.
  useEffect(() => {
    vivoRef.current = true
    const temporizadores = temporizadoresRef.current
    return () => {
      vivoRef.current = false
      temporizadores.forEach(clearTimeout)
      temporizadores.clear()
      detenerRecorrido()
      limpiarRestos()
    }
  }, [])

  /* ---------------- valor ---------------- */

  const vistos = disponibles.filter((r) => visto(r)).length

  const value: TutorialesContextValue = {
    disponibles,
    deEstaPantalla: () => recorridosDeRuta(disponibles, ruta).filter((r) => contextoPresente(r)),
    visto,
    estado,
    progresoGeneral: { vistos, total: disponibles.length },
    iniciar: (id, modo = 'inicio') => {
      const r = buscarDisponible(id)
      if (!r) return
      // La primera vez puede tardar un instante (carga del motor). El
      // «¿Cómo se llena?» no tiene nada que mostrar si no se pudo: se pide y ya.
      void lanzarAhora(r, { modo, enCompleto: etapaEnCurso()?.recorrido.id === id })
    },
    abrir: (id, opciones = {}) => {
      const r = buscarDisponible(id)
      if (!r) return
      ejecutar(r, {
        modo: opciones.modo ?? 'inicio',
        desdePaso: opciones.desdePaso,
        enCompleto: false,
      })
    },
    marcarLeido: (id) => {
      const r = buscarDisponible(id)
      if (!r || !user) return
      const eraEtapa = detalle?.enCompleto || etapaEnCurso()?.recorrido.id === id
      marcarVisto(user.id, r.id, r.version)
      const avance = avanzarSiEsEtapa(id)
      setDetalle(null)
      if (avance === 'terminado') {
        setCompletoEnCurso(false)
        setMensaje(
          '¡Terminaste el recorrido completo! Cualquier parte la puedes repetir cuando quieras.',
        )
      } else if (avance && eraEtapa) {
        continuarCompleto('inicio')
      }
      refrescar()
    },
    completo,
    empezarCompleto: () => {
      if (!user || !definicion || !resuelto?.aplicables.length) return
      borrarProgreso(user.id, definicion.id)
      guardarProgreso(user.id, definicion.id, definicion.version, resuelto.aplicables[0].indice)
      continuarCompleto('inicio')
    },
    continuarCompleto: () => continuarCompleto('continuar'),
    saltarEtapa: () => {
      const actual = etapaEnCurso()
      if (!user || !definicion || !resuelto || !actual) return
      const siguiente = etapaSiguiente(resuelto.aplicables, actual)
      setDetalle(null)
      if (!siguiente) {
        marcarVisto(user.id, definicion.id, definicion.version)
        setCompletoEnCurso(false)
        setMensaje('Llegaste al final del recorrido completo.')
        refrescar()
        return
      }
      guardarProgreso(user.id, definicion.id, definicion.version, siguiente.indice)
      continuarCompleto('inicio')
    },
    pausarCompleto: () => {
      setCompletoEnCurso(false)
      setDetalle(null)
    },
    detalle,
    cerrarDetalle: () => {
      if (detalle?.enCompleto) setCompletoEnCurso(false)
      setDetalle(null)
    },
    centroAbierto,
    abrirCentro: () => {
      setAviso(false)
      setAvisoNovedades(false)
      setMensaje(null)
      setCentroAbierto(true)
      // Abrir la ayuda es el momento de traer el motor pesado: hasta aquí no
      // había hecho falta, y quien nunca la use no lo descarga.
      void cargarMotor()
    },
    cerrarCentro: () => {
      // Cerrar el centro con una etapa explicada deja el completo en pausa,
      // con el avance guardado.
      if (detalle?.enCompleto) setCompletoEnCurso(false)
      setDetalle(null)
      setCentroAbierto(false)
    },
    irA: (destino) => {
      if (detalle?.enCompleto) setCompletoEnCurso(false)
      setDetalle(null)
      setCentroAbierto(false)
      navigate(destino)
    },
    puedeIrA: (destino) => puedeIrA(destino, acceso),
    aviso,
    descartarAviso: () => setAviso(false),
    avisoNovedades,
    descartarAvisoNovedades: () => setAvisoNovedades(false),
    novedadesAbiertas,
    alternarNovedades: () => setNovedadesAbiertas((v) => !v),
    abrirNovedades: () => {
      setAviso(false)
      setAvisoNovedades(false)
      setMensaje(null)
      setDetalle(null)
      setNovedadesAbiertas(true)
      setCentroAbierto(true)
      void cargarMotor()
    },
    mensaje,
    descartarMensaje: () => setMensaje(null),
    reiniciarVistos: () => {
      if (!user) return
      olvidarVistos(user.id)
      setCompletoEnCurso(false)
      refrescar()
    },
  }

  return <TutorialesContext.Provider value={value}>{children}</TutorialesContext.Provider>
}

/**
 * Acceso a los tutoriales. Fuera del proveedor devuelve una versión inerte en
 * vez de lanzar: un botón de ayuda nunca debe tumbar la pantalla que lo aloja
 * (p. ej. un modal probado por separado).
 */
export const useTutoriales = (): TutorialesContextValue => {
  const ctx = useContext(TutorialesContext)
  return ctx ?? INERTE
}

const nada = () => undefined

const INERTE: TutorialesContextValue = {
  disponibles: [],
  deEstaPantalla: () => [],
  visto: () => true,
  estado: () => ({ tipo: 'visto' }),
  progresoGeneral: { vistos: 0, total: 0 },
  iniciar: nada,
  abrir: nada,
  marcarLeido: nada,
  completo: null,
  empezarCompleto: nada,
  continuarCompleto: nada,
  saltarEtapa: nada,
  pausarCompleto: nada,
  detalle: null,
  cerrarDetalle: nada,
  centroAbierto: false,
  abrirCentro: nada,
  cerrarCentro: nada,
  irA: nada,
  puedeIrA: () => false,
  aviso: false,
  descartarAviso: nada,
  avisoNovedades: false,
  descartarAvisoNovedades: nada,
  novedadesAbiertas: false,
  alternarNovedades: nada,
  abrirNovedades: nada,
  mensaje: null,
  descartarMensaje: nada,
  reiniciarVistos: nada,
}
