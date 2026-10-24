/**
 * Los avisos de toda la aplicación, en un solo lugar (plan 27, Fase 2).
 *
 * El aviso es lo único vivo del sistema: la agenda, la sala y el inicio no se
 * refrescan solos (§1). Por eso este proveedor:
 *
 * - consulta `GET /notifications/estado` cada 15 s con GEMS a la vista y cada
 *   60 s en segundo plano, y la lista de «Por atender» sólo cuando algo cambió;
 * - vuelve a consultar en cuanto la persona regresa a la pestaña, enfoca la
 *   ventana o recupera la red;
 * - sondea desde **una sola pestaña** y reparte el resultado a las demás, para
 *   que el sonido y la notificación del navegador salgan una vez (F-10);
 * - si una consulta falla, lo dice (`fallo`) en vez de dar la foto vieja por
 *   vigente (F-7);
 * - expone un **latido** (`useLatidoAvisos`) para que otras pantallas se
 *   refresquen al mismo ritmo en vez de tener su propio temporizador.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiClient } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Role } from '../types'
import { avisarResultadosActualizados } from '../../modules/doctor/hooks/useResultadosSinRevisar'
import { instanteDelServidor } from '../utils/date'
import type {
  EstadoAvisos,
  Notification,
  NotificationListResponse,
  PreferenciasAvisos,
} from '../types/notification'
import { validarEstado, validarLista, validarPreferencias } from './validar'
import { crearCoordinador, reclamarAnuncio, type Coordinador } from './coordinacion'
import { tocarSonido } from './sonido'
import { mostrarNotificacion, textoSinDatosDePaciente } from './notificacionNavegador'

export const INTERVALO_VISIBLE_MS = 15_000
export const INTERVALO_OCULTO_MS = 60_000
/** Al entrar sólo se resume lo reciente: un paciente en sala desde hace horas ya no espera a nadie. */
export const VENTANA_RESUMEN_AL_ENTRAR_MS = 2 * 60 * 60 * 1000
/** Si otra pestaña dijo «me están viendo» hace menos de esto, se sondea al ritmo de visible. */
const VIGENCIA_DE_VISIBLE_REMOTO_MS = 25_000
const LIMITE_POR_ATENDER = 200
const TITULO_BASE = 'GEMS'

export const pideAlgo = (aviso: Pick<Notification, 'priority'>): boolean =>
  aviso.priority === 'accionable' || aviso.priority === 'urgente'

/** Lo mínimo de una incidencia crítica abierta (plan 26, `GET /clinical-tracking/critical-results`). */
export interface CriticoAbierto {
  result_id: number
  order_id: number
  patient_name: string
  study_name: string
}

/**
 * Resultados críticos del médico. `fallo` nunca se lee como «sin
 * críticos»: la franja dice que no se pudo consultar.
 */
export type CriticosAbiertos =
  | { estado: 'ok'; items: CriticoAbierto[]; total: number }
  | { estado: 'fallo' }

/** Un emergente en pantalla: un aviso, o el resumen de los que había al entrar. */
export interface Emergente {
  clave: string
  avisos: Notification[]
  resumen: boolean
}

export interface Latido {
  estado: EstadoAvisos
  /** `true` si llegó o se resolvió algo desde el latido anterior. */
  cambio: boolean
}

interface Instantanea {
  estado: EstadoAvisos
  abiertos: Notification[]
  cambio: boolean
  /** `null` para quien no es doctora: la franja de críticos no le aplica. */
  criticos: CriticosAbiertos | null
}

interface AvisosContextValue {
  estado: EstadoAvisos | null
  /** Lo que sigue pidiendo algo, del más viejo al más nuevo. */
  abiertos: Notification[]
  /** Incidencias críticas abiertas del médico; `null` si no le aplica o aún no se sabe. */
  criticos: CriticosAbiertos | null
  /** Número rojo de la campana y del título: accionables y urgentes sin resolver. */
  porAtender: number
  cargando: boolean
  fallo: boolean
  /** Cuándo fue la última consulta que sí salió (ms). */
  actualizadoEn: number | null
  emergentes: Emergente[]
  cerrarEmergente: (clave: string) => void
  refrescar: () => Promise<void>
  cargarTodos: (offset: number, limite?: number) => Promise<NotificationListResponse>
  marcarLeidos: (ids: number[]) => Promise<void>
  marcarTodasLeidas: () => Promise<void>
  descartar: (id: number) => Promise<void>
  borrar: (id: number) => Promise<void>
  borrarLeidas: () => Promise<void>
  preferencias: PreferenciasAvisos | null
  guardarPreferencias: (cambios: Partial<PreferenciasAvisos>) => Promise<PreferenciasAvisos>
  suscribirLatido: (fn: (latido: Latido) => void) => () => void
  centroAbierto: boolean
  abrirCentro: () => void
  cerrarCentro: () => void
}

const AvisosContext = createContext<AvisosContextValue | null>(null)

export const useAvisos = (): AvisosContextValue => {
  const ctx = useContext(AvisosContext)
  if (!ctx) throw new Error('useAvisos debe usarse dentro de <AvisosProvider>')
  return ctx
}

/**
 * Los avisos si hay proveedor, o `null` fuera de él (una pantalla probada
 * suelta). Para quien sólo quiere ofrecer «abrir el centro de avisos».
 */
export const useAvisosOpcional = (): AvisosContextValue | null => useContext(AvisosContext)

/**
 * Se llama en cada latido del sondeo de avisos (cada 15 s a la vista, 60 s
 * oculto, y en cuanto la persona vuelve a la pestaña), en todas las pestañas.
 * Pensado para pantallas que deben refrescarse solas, como el inicio de la
 * doctora: con `latido.cambio` sabe si llegó o se resolvió algo.
 *
 * Fuera de `<AvisosProvider>` no hace nada (pruebas de una pantalla suelta).
 */
export function useLatidoAvisos(fn: (latido: Latido) => void): void {
  const ctx = useContext(AvisosContext)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const suscribir = ctx?.suscribirLatido
  useEffect(() => {
    if (!suscribir) return undefined
    return suscribir((latido) => fnRef.current(latido))
  }, [suscribir])
}

const huboCambio = (antes: EstadoAvisos | null, ahora: EstadoAvisos): boolean =>
  !antes ||
  antes.ultimo_id !== ahora.ultimo_id ||
  antes.ultima_resolucion !== ahora.ultima_resolucion ||
  antes.sin_leer !== ahora.sin_leer ||
  antes.abiertos.accionable !== ahora.abiertos.accionable ||
  antes.abiertos.urgente !== ahora.abiertos.urgente

/** La misma validación que `IncidenciasCriticas`: una respuesta sin la forma esperada no es «cero críticos». */
async function consultarCriticos(): Promise<CriticosAbiertos> {
  try {
    const { data } = await apiClient.get<{ items: CriticoAbierto[]; total: number }>(
      '/clinical-tracking/critical-results',
      { params: { limit: 50 } },
    )
    if (!Array.isArray(data?.items) || typeof data?.total !== 'number') return { estado: 'fallo' }
    if (!data.items.every((c) => typeof c?.result_id === 'number')) return { estado: 'fallo' }
    return { estado: 'ok', items: data.items, total: data.total }
  } catch {
    return { estado: 'fallo' }
  }
}

const idsDe = (c: { items: CriticoAbierto[] }) => c.items.map((x) => x.result_id).join()

const criticosCambiaron = (antes: CriticosAbiertos | null, ahora: CriticosAbiertos | null): boolean => {
  if (antes === null || ahora === null) return antes !== ahora
  if (antes.estado !== ahora.estado) return true
  if (antes.estado === 'fallo' || ahora.estado === 'fallo') return false
  return antes.total !== ahora.total || idsDe(antes) !== idsDe(ahora)
}

export const AvisosProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const usuarioId = user?.id

  const [estado, setEstado] = useState<EstadoAvisos | null>(null)
  const [abiertos, setAbiertos] = useState<Notification[]>([])
  const [cargando, setCargando] = useState(true)
  const [fallo, setFallo] = useState(false)
  const [actualizadoEn, setActualizadoEn] = useState<number | null>(null)
  const [emergentes, setEmergentes] = useState<Emergente[]>([])
  const [preferencias, setPreferencias] = useState<PreferenciasAvisos | null>(null)
  const [centroAbierto, setCentroAbierto] = useState(false)
  const [criticos, setCriticos] = useState<CriticosAbiertos | null>(null)
  // La franja es del médico autora: el endpoint le da a administración los
  // críticos de toda la sucursal, que no le toca cerrar a ella.
  const consultaCriticos = user?.role === Role.DOCTOR

  const estadoRef = useRef<EstadoAvisos | null>(null)
  const criticosRef = useRef<CriticosAbiertos | null>(null)
  const criticosConocidos = useRef<Set<number> | null>(null)
  const conocidos = useRef<Set<number> | null>(null)
  const preferenciasRef = useRef<PreferenciasAvisos | null>(null)
  preferenciasRef.current = preferencias
  const latidos = useRef(new Set<(l: Latido) => void>())
  const coordinador = useRef<Coordinador<Instantanea> | null>(null)
  const visibleRemotoEn = useRef(0)
  const enCurso = useRef<Promise<void> | null>(null)
  const abiertosRef = useRef<Notification[]>([])
  abiertosRef.current = abiertos

  /** Sonido y notificación del navegador de lo que acaba de llegar. Una sola pestaña lo hace. */
  const anunciar = useCallback(
    (nuevos: Notification[]) => {
      if (usuarioId === undefined || nuevos.length === 0) return
      const masNuevo = nuevos.reduce((a, b) => (a.id > b.id ? a : b))
      if (!reclamarAnuncio(usuarioId, masNuevo.id)) return
      const pref = preferenciasRef.current
      if (pref?.sonido) {
        void tocarSonido(nuevos.some((a) => a.priority === 'urgente') ? 'urgente' : 'accionable')
      }
      const nadieMira =
        document.visibilityState !== 'visible' && Date.now() - visibleRemotoEn.current > VIGENCIA_DE_VISIBLE_REMOTO_MS
      if (pref?.navegador && nadieMira) {
        const [titulo, texto] =
          nuevos.length === 1
            ? textoSinDatosDePaciente(masNuevo)
            : ['Avisos de GEMS', `Tienes ${nuevos.length} avisos nuevos por atender.`]
        mostrarNotificacion(titulo, texto, {
          etiqueta: `gems-aviso-${masNuevo.id}`,
          alHacerClic: () => setCentroAbierto(true),
        })
      }
    },
    [usuarioId],
  )

  /** Un crítico nuevo: tono urgente y notificación que se queda hasta que la toquen. */
  const anunciarCriticos = useCallback(
    (nuevos: CriticoAbierto[]) => {
      if (usuarioId === undefined || nuevos.length === 0) return
      const masNuevo = nuevos.reduce((a, b) => (a.result_id > b.result_id ? a : b))
      if (!reclamarAnuncio(usuarioId, masNuevo.result_id, 'criticos')) return
      const pref = preferenciasRef.current
      if (pref?.sonido) void tocarSonido('urgente')
      const nadieMira =
        document.visibilityState !== 'visible' && Date.now() - visibleRemotoEn.current > VIGENCIA_DE_VISIBLE_REMOTO_MS
      if (pref?.navegador && nadieMira) {
        // Sin nombre de paciente ni estudio (D-4): eso se ve en GEMS.
        mostrarNotificacion('Resultado crítico', 'Tienes un resultado crítico sin cerrar.', {
          etiqueta: `gems-critico-${masNuevo.result_id}`,
          persistente: true,
          alHacerClic: () => undefined,
        })
      }
    },
    [usuarioId],
  )

  /** Aplica una foto del servidor (propia o de la pestaña líder). */
  const aplicar = useCallback(
    (
      { estado: nuevoEstado, abiertos: nuevosAbiertos, cambio, criticos: nuevosCriticos }: Instantanea,
      { puedeAnunciar }: { puedeAnunciar: boolean },
    ) => {
      estadoRef.current = nuevoEstado
      criticosRef.current = nuevosCriticos
      setCriticos(nuevosCriticos)
      if (nuevosCriticos?.estado === 'ok') {
        const ids = new Set(nuevosCriticos.items.map((c) => c.result_id))
        const previos = criticosConocidos.current
        if (previos !== null) {
          const llegados = nuevosCriticos.items.filter((c) => !previos.has(c.result_id))
          if (puedeAnunciar) anunciarCriticos(llegados)
          const igual = previos.size === ids.size && [...ids].every((id) => previos.has(id))
          // El inicio del médico (IncidenciasCriticas) y el número del menú
          // se refrescan con el mismo evento que usa la bandeja al guardar.
          if (!igual) avisarResultadosActualizados()
        }
        criticosConocidos.current = ids
      }
      setEstado(nuevoEstado)
      setAbiertos(nuevosAbiertos)
      setFallo(false)
      setActualizadoEn(Date.now())

      const previos = conocidos.current
      const sinLeer = new Set(nuevosAbiertos.filter((a) => !a.is_read).map((a) => a.id))
      let nuevos: Emergente[] = []
      if (previos === null) {
        // Primera foto: lo que llegó con GEMS cerrado sale en UN resumen, y
        // sólo lo reciente y sin leer (F-4). No suena: nadie acaba de llegar.
        const limite = Date.now() - VENTANA_RESUMEN_AL_ENTRAR_MS
        const recientes = nuevosAbiertos.filter(
          (a) => sinLeer.has(a.id) && instanteDelServidor(a.created_at).getTime() >= limite,
        )
        if (recientes.length > 1) nuevos = [{ clave: 'resumen-al-entrar', avisos: recientes, resumen: true }]
        else if (recientes.length === 1)
          nuevos = [{ clave: `aviso-${recientes[0].id}`, avisos: recientes, resumen: false }]
      } else {
        const llegados = nuevosAbiertos.filter((a) => !previos.has(a.id) && sinLeer.has(a.id))
        // Los más nuevos arriba.
        nuevos = [...llegados]
          .sort((a, b) => b.id - a.id)
          .map((a) => ({ clave: `aviso-${a.id}`, avisos: [a], resumen: false }))
        if (puedeAnunciar) anunciar(llegados)
      }
      conocidos.current = new Set(nuevosAbiertos.map((a) => a.id))

      setEmergentes((actuales) => {
        const claves = new Set(nuevos.map((e) => e.clave))
        // Un emergente cuyo aviso ya se resolvió o se leyó (aquí, en otra
        // pestaña o en otro equipo) ya no dice nada vigente: se retira solo.
        const vigentes = actuales.filter((e) => !claves.has(e.clave) && e.avisos.some((a) => sinLeer.has(a.id)))
        if (nuevos.length === 0 && vigentes.length === actuales.length) return actuales
        return [...nuevos, ...vigentes]
      })

      for (const fn of latidos.current) {
        try {
          fn({ estado: nuevoEstado, cambio })
        } catch {
          /* una pantalla que falla al refrescarse no detiene el sondeo */
        }
      }
    },
    [anunciar, anunciarCriticos],
  )

  /** Una vuelta: estado ligero y, si cambió algo, la lista de «Por atender». */
  const consultar = useCallback(
    async (forzarLista: boolean) => {
      try {
        const nuevoEstado = validarEstado((await apiClient.get<EstadoAvisos>('/notifications/estado')).data)
        const nuevosCriticos = consultaCriticos ? await consultarCriticos() : null
        const cambio =
          huboCambio(estadoRef.current, nuevoEstado) || criticosCambiaron(criticosRef.current, nuevosCriticos)
        let lista = null as Notification[] | null
        if (cambio || forzarLista || conocidos.current === null) {
          const { data } = await apiClient.get<NotificationListResponse>('/notifications', {
            params: { abiertos: true, limit: LIMITE_POR_ATENDER },
          })
          lista = validarLista(data).items
        }
        const instantanea: Instantanea = {
          estado: nuevoEstado,
          abiertos: lista ?? abiertosRef.current,
          cambio,
          criticos: nuevosCriticos,
        }
        aplicar(instantanea, { puedeAnunciar: true })
        coordinador.current?.publicar({ tipo: 'instantanea', datos: instantanea })
      } catch {
        // Sin emergente de error: un sondeo fallido no debe interrumpir a nadie.
        setFallo(true)
      } finally {
        setCargando(false)
      }
    },
    [aplicar, consultaCriticos],
  )

  const refrescarInterno = useCallback(
    (forzarLista: boolean) => {
      if (enCurso.current) return enCurso.current
      const promesa = consultar(forzarLista).finally(() => {
        enCurso.current = null
      })
      enCurso.current = promesa
      return promesa
    },
    [consultar],
  )

  /** Después de cambiar algo, la consulta que ya iba en vuelo salió antes del cambio: se hace otra. */
  const refrescar = useCallback(async () => {
    if (enCurso.current) await enCurso.current
    await refrescarInterno(true)
  }, [refrescarInterno])

  // Sondeo, coordinación entre pestañas y refresco al volver.
  useEffect(() => {
    if (usuarioId === undefined) return undefined
    conocidos.current = null
    estadoRef.current = null
    criticosConocidos.current = null
    const coord = crearCoordinador<Instantanea>(`gems-avisos-${usuarioId}`)
    coordinador.current = coord
    let temporizador: ReturnType<typeof setTimeout> | null = null
    let activo = true

    const programar = () => {
      if (!activo || !coord.esLider()) return
      if (temporizador) clearTimeout(temporizador)
      const alguienMira =
        document.visibilityState === 'visible' ||
        Date.now() - visibleRemotoEn.current < VIGENCIA_DE_VISIBLE_REMOTO_MS
      temporizador = setTimeout(async () => {
        await refrescarInterno(false)
        programar()
      }, alguienMira ? INTERVALO_VISIBLE_MS : INTERVALO_OCULTO_MS)
    }

    coord.alRecibir((mensaje) => {
      if (mensaje.tipo === 'instantanea') {
        // Lo anuncia la pestaña que lo consultó; aquí sólo se pinta.
        aplicar(mensaje.datos, { puedeAnunciar: false })
        setCargando(false)
      } else if (mensaje.tipo === 'visible') {
        visibleRemotoEn.current = Date.now()
        programar()
      } else if (mensaje.tipo === 'refrescar' && coord.esLider()) {
        visibleRemotoEn.current = Date.now()
        void refrescarInterno(false).then(programar)
      }
    })
    coord.alSerLider(programar)

    // Cada pestaña se pinta sola al abrir; después la mantiene la líder.
    void refrescarInterno(true)

    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      if (coord.esLider()) void refrescarInterno(false).then(programar)
      else {
        coord.publicar({ tipo: 'visible' })
        coord.publicar({ tipo: 'refrescar' })
      }
    }
    // Una pestaña seguidora a la vista le recuerda a la líder que alguien mira.
    const latidoVisible = setInterval(() => {
      if (document.visibilityState === 'visible' && !coord.esLider()) coord.publicar({ tipo: 'visible' })
    }, INTERVALO_VISIBLE_MS)

    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    window.addEventListener('online', alVolver)
    return () => {
      activo = false
      if (temporizador) clearTimeout(temporizador)
      clearInterval(latidoVisible)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener('online', alVolver)
      coord.cerrar()
      coordinador.current = null
    }
  }, [usuarioId, aplicar, refrescarInterno])

  // Preferencias: en el servidor, siguen a la persona entre equipos.
  useEffect(() => {
    if (usuarioId === undefined) return
    apiClient
      .get<PreferenciasAvisos>('/notifications/preferencias')
      // Mal formadas cuentan como no leídas: el panel dice «No se pudieron
      // cargar tus preferencias» y el resto del centro sigue funcionando.
      .then(({ data }) => setPreferencias(validarPreferencias(data)))
      .catch(() => setPreferencias(null))
  }, [usuarioId])

  const porAtender = estado ? estado.abiertos.accionable + estado.abiertos.urgente : 0

  // El título de la pestaña es lo único que se ve con GEMS en segundo plano.
  useEffect(() => {
    document.title = porAtender > 0 ? `(${porAtender}) ${TITULO_BASE}` : TITULO_BASE
  }, [porAtender])
  useEffect(
    () => () => {
      document.title = TITULO_BASE
    },
    [],
  )

  const cerrarEmergente = useCallback((clave: string) => {
    setEmergentes((actuales) => actuales.filter((e) => e.clave !== clave))
  }, [])

  const cargarTodos = useCallback(async (offset: number, limite = 30) => {
    const { data } = await apiClient.get<NotificationListResponse>('/notifications', {
      params: { limit: limite, offset },
    })
    return validarLista(data)
  }, [])

  const marcarLeidos = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return
      await Promise.all(ids.map((id) => apiClient.patch(`/notifications/${id}/read`)))
      await refrescar()
    },
    [refrescar],
  )

  const marcarTodasLeidas = useCallback(async () => {
    await apiClient.patch('/notifications/read-all')
    await refrescar()
  }, [refrescar])

  const descartar = useCallback(
    async (id: number) => {
      await apiClient.patch(`/notifications/${id}/descartar`)
      await refrescar()
    },
    [refrescar],
  )

  const borrar = useCallback(
    async (id: number) => {
      await apiClient.delete(`/notifications/${id}`)
      await refrescar()
    },
    [refrescar],
  )

  const borrarLeidas = useCallback(async () => {
    await apiClient.delete('/notifications/read')
    await refrescar()
  }, [refrescar])

  const guardarPreferencias = useCallback(async (cambios: Partial<PreferenciasAvisos>) => {
    const { tipos_silenciables: _soloLectura, ...cuerpo } = cambios
    void _soloLectura
    const { data } = await apiClient.put<PreferenciasAvisos>('/notifications/preferencias', cuerpo)
    // Si la respuesta no se entiende, se dice que no se guardó (no se sabe).
    const guardadas = validarPreferencias(data)
    setPreferencias(guardadas)
    return guardadas
  }, [])

  const suscribirLatido = useCallback((fn: (l: Latido) => void) => {
    latidos.current.add(fn)
    return () => {
      latidos.current.delete(fn)
    }
  }, [])

  const abrirCentro = useCallback(() => setCentroAbierto(true), [])
  const cerrarCentro = useCallback(() => setCentroAbierto(false), [])

  const valor = useMemo<AvisosContextValue>(
    () => ({
      estado,
      abiertos,
      criticos,
      porAtender,
      cargando,
      fallo,
      actualizadoEn,
      emergentes,
      cerrarEmergente,
      refrescar,
      cargarTodos,
      marcarLeidos,
      marcarTodasLeidas,
      descartar,
      borrar,
      borrarLeidas,
      preferencias,
      guardarPreferencias,
      suscribirLatido,
      centroAbierto,
      abrirCentro,
      cerrarCentro,
    }),
    [
      estado,
      abiertos,
      criticos,
      porAtender,
      cargando,
      fallo,
      actualizadoEn,
      emergentes,
      cerrarEmergente,
      refrescar,
      cargarTodos,
      marcarLeidos,
      marcarTodasLeidas,
      descartar,
      borrar,
      borrarLeidas,
      preferencias,
      guardarPreferencias,
      suscribirLatido,
      centroAbierto,
      abrirCentro,
      cerrarCentro,
    ],
  )

  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>
}
