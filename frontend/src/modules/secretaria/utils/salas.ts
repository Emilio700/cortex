/**
 * Lógica pura de la agenda por salas.
 *
 * Aquí no se toca React ni el backend: sólo se transforman citas y salas en
 * lo que la vista necesita pintar (columnas, huecos libres, etiquetas). Todo
 * está cubierto por pruebas en `salas.test.ts`, que es donde se comprueba que
 * el consultorio no acabe con dos doctores en la misma sala.
 */
import type { Appointment } from '../types'
import type { Sala } from '../../../shared/services/salas'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'

/** Jornada visible por defecto, igual que el calendario (07:00 a 20:00). */
export const JORNADA_INICIO_MIN = 7 * 60
export const JORNADA_FIN_MIN = 20 * 60

/** Hueco de menos de este tamaño no se anuncia: no cabe ni la cita más corta. */
export const HUECO_MINIMO_MIN = 15

/** Etiqueta de la columna que recoge las citas sin sala (las 25 658 históricas). */
export const SIN_SALA_LABEL = 'Sin sala'

/** Estados que NO ocupan la sala: una cita cancelada libera el espacio. */
const ESTADOS_QUE_NO_OCUPAN = new Set(['cancelada'])

/**
 * Salas activas de la sucursal, en el orden en que deben verse: el que
 * configuró el administrador y, a igualdad, por nombre.
 */
export const salasActivas = (salas: Sala[]): Sala[] =>
  [...salas]
    .filter((sala) => sala.is_active)
    .sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name, 'es'),
    )

/** Minutos transcurridos desde la medianoche local de esa misma fecha. */
export const minutosDelDia = (iso: string | Date): number => {
  const fecha = iso instanceof Date ? iso : new Date(iso)
  return fecha.getHours() * 60 + fecha.getMinutes()
}

/** 495 -> "08:15". Acepta valores fuera de rango sin reventar. */
export const formatearMinutos = (minutos: number): string => {
  const total = Math.max(0, Math.round(minutos))
  const horas = Math.floor(total / 60)
  const mins = total % 60
  return `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/** ¿Esa cita cae en el día indicado? Comparación en hora local, como el resto de la app. */
export const esMismoDia = (iso: string | Date, dia: Date): boolean => {
  const fecha = iso instanceof Date ? iso : new Date(iso)
  return (
    fecha.getFullYear() === dia.getFullYear() &&
    fecha.getMonth() === dia.getMonth() &&
    fecha.getDate() === dia.getDate()
  )
}

/** Tramo de tiempo en minutos desde la medianoche. `fin` no se incluye. */
export interface Tramo {
  inicio: number
  fin: number
}

/** Duración real de una cita en minutos (las cirugías se miden en horas). */
export const duracionEnMinutos = (cita: Appointment): number => {
  if (cita.duration_hours && cita.duration_hours > 0) return Math.round(cita.duration_hours * 60)
  return cita.duration_minutes > 0 ? cita.duration_minutes : 30
}

/** Tramo que ocupa una cita dentro de su día. */
export const tramoDeCita = (cita: Appointment): Tramo => {
  const inicio = minutosDelDia(cita.scheduled_at)
  return { inicio, fin: inicio + duracionEnMinutos(cita) }
}

/** Orden estable de las citas de una columna: por hora de inicio. */
const porHora = (a: Appointment, b: Appointment): number =>
  new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()

/** Una columna de la vista por salas. `salaId` null = columna "Sin sala". */
export interface ColumnaSala {
  salaId: number | null
  nombre: string
  citas: Appointment[]
}

/**
 * Reparte las citas en una columna por sala activa, en el orden configurado.
 *
 * La columna "Sin sala" sólo aparece si de verdad hay citas sin sala (o con
 * una sala que ya no existe / está desactivada): no se le enseña al usuario
 * una columna vacía que no significa nada.
 */
export const agruparCitasPorSala = (citas: Appointment[], salas: Sala[]): ColumnaSala[] => {
  const activas = salasActivas(salas)

  const columnas: ColumnaSala[] = activas.map((sala) => ({
    salaId: sala.id,
    nombre: sala.name,
    citas: [],
  }))
  const porId = new Map(columnas.map((columna) => [columna.salaId, columna]))

  const sinSala: Appointment[] = []
  for (const cita of citas) {
    const columna = cita.room_id != null ? porId.get(cita.room_id) : undefined
    if (columna) columna.citas.push(cita)
    else sinSala.push(cita)
  }

  for (const columna of columnas) columna.citas.sort(porHora)

  if (sinSala.length > 0) {
    columnas.push({ salaId: null, nombre: SIN_SALA_LABEL, citas: sinSala.sort(porHora) })
  }
  return columnas
}

/**
 * Tramos realmente ocupados de una columna: se fusionan los solapes y se
 * ignoran las citas canceladas, que no retienen la sala.
 */
export const tramosOcupados = (citas: Appointment[]): Tramo[] => {
  const tramos = citas
    .filter((cita) => !ESTADOS_QUE_NO_OCUPAN.has(cita.status))
    .map(tramoDeCita)
    .sort((a, b) => a.inicio - b.inicio)

  const fusionados: Tramo[] = []
  for (const tramo of tramos) {
    const ultimo = fusionados[fusionados.length - 1]
    if (ultimo && tramo.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, tramo.fin)
    } else {
      fusionados.push({ ...tramo })
    }
  }
  return fusionados
}

/**
 * Huecos libres de una sala dentro de la jornada: lo que queda entre los
 * tramos ocupados. Es la pregunta que hace el doctor al abrir la agenda.
 */
export const huecosLibres = (
  citas: Appointment[],
  jornadaInicio = JORNADA_INICIO_MIN,
  jornadaFin = JORNADA_FIN_MIN,
  minimo = HUECO_MINIMO_MIN,
): Tramo[] => {
  const huecos: Tramo[] = []
  let cursor = jornadaInicio

  for (const ocupado of tramosOcupados(citas)) {
    if (ocupado.fin <= jornadaInicio || ocupado.inicio >= jornadaFin) continue
    const inicioOcupado = Math.max(ocupado.inicio, jornadaInicio)
    if (inicioOcupado - cursor >= minimo) huecos.push({ inicio: cursor, fin: inicioOcupado })
    cursor = Math.max(cursor, Math.min(ocupado.fin, jornadaFin))
  }

  if (jornadaFin - cursor >= minimo) huecos.push({ inicio: cursor, fin: jornadaFin })
  return huecos
}

/** "08:00 a 09:30", para leer un hueco de un vistazo. */
export const formatearTramo = (tramo: Tramo): string =>
  `${formatearMinutos(tramo.inicio)} a ${formatearMinutos(tramo.fin)}`

/**
 * Nombre de la sala de una cita. El backend ya lo resuelve y lo devuelve en
 * `room_name` en todos los endpoints de citas, así que NO se cruza contra el
 * catálogo: la cita es la fuente de verdad, incluso si la sala se renombró o
 * se desactivó después.
 */
export const nombreSalaDeCita = (cita: Appointment): string | null => cita.room_name || null

/**
 * Resumen de una línea de una cita con su sala, tal como se lee en la vista
 * por salas y en los avisos: "08:00 a 08:30 · ANA LÓPEZ · Dr. Pérez · Sala 1".
 */
export const formatearResumenCita = (cita: Appointment): string => {
  const tramo = formatearTramo(tramoDeCita(cita))
  const paciente = cita.patient
    ? `${cita.patient.first_name} ${cita.patient.last_name}`.trim()
    : 'Paciente sin nombre'
  const partes = [tramo, paciente]
  if (cita.doctor?.full_name) partes.push(nombreConTratamiento(cita.doctor))
  partes.push(nombreSalaDeCita(cita) ?? SIN_SALA_LABEL)
  return partes.join(' · ')
}

/** Una cita colocada dentro de su columna de sala. */
export interface CitaColocada {
  cita: Appointment
  tramo: Tramo
  /** Carril que ocupa (0 el primero) cuando hay citas solapadas. */
  carril: number
  /** Cuántos carriles hay en total en ese solape, para repartir el ancho. */
  carriles: number
}

/**
 * Coloca las citas de una sala en carriles para que dos que se pisan se vean
 * una al lado de la otra en vez de taparse.
 *
 * Con el backend validando la sala no debería haber solapes nuevos, pero los
 * hay en lo ya agendado (y una cita cancelada puede convivir con la que la
 * sustituyó): esconder una detrás de otra sería mentirle al doctor.
 */
export const repartirEnCarriles = (citas: Appointment[]): CitaColocada[] => {
  const ordenadas = [...citas].sort(porHora).map((cita) => ({ cita, tramo: tramoDeCita(cita) }))

  const colocadas: CitaColocada[] = []
  let grupo: CitaColocada[] = []
  let finGrupo = -1

  const cerrarGrupo = () => {
    const carriles = grupo.reduce((max, item) => Math.max(max, item.carril + 1), 0)
    for (const item of grupo) item.carriles = carriles
    colocadas.push(...grupo)
    grupo = []
    finGrupo = -1
  }

  for (const { cita, tramo } of ordenadas) {
    // Un grupo es un bloque de citas encadenadas por solape; el ancho se
    // reparte dentro del grupo, no en toda la columna.
    if (grupo.length > 0 && tramo.inicio >= finGrupo) cerrarGrupo()

    const ocupados = new Set(
      grupo.filter((item) => item.tramo.fin > tramo.inicio).map((item) => item.carril),
    )
    let carril = 0
    while (ocupados.has(carril)) carril += 1

    grupo.push({ cita, tramo, carril, carriles: 1 })
    finGrupo = Math.max(finGrupo, tramo.fin)
  }
  if (grupo.length > 0) cerrarGrupo()

  return colocadas
}

/**
 * Paleta estable por posición de sala. Se reparte por índice y no por id para
 * que Sala 1 y Sala 2 tengan siempre el mismo color en todas las sucursales.
 */
const COLORES_SALA = ['#0d6efd', '#20c997', '#6f42c1', '#fd7e14', '#d63384', '#0dcaf0']
export const COLOR_SIN_SALA = '#adb5bd'

export const colorDeSala = (salaId: number | null, salas: Sala[]): string => {
  if (salaId == null) return COLOR_SIN_SALA
  const activas = salasActivas(salas)
  const indice = activas.findIndex((sala) => sala.id === salaId)
  if (indice < 0) return COLOR_SIN_SALA
  return COLORES_SALA[indice % COLORES_SALA.length]
}

/**
 * ¿Hay que obligar a elegir sala? Sólo donde hay más de una sala activa
 * (G & G). Donde sólo hay una (San Ignacio) se asigna sola y no se molesta.
 */
export const salaEsObligatoria = (salas: Sala[]): boolean => salasActivas(salas).length > 1

/**
 * Sala que debe quedar preseleccionada al abrir el formulario:
 * la de la cita si se está editando, la única si sólo hay una, o ninguna.
 */
export const salaPorDefecto = (salas: Sala[], actual?: number | null): number | null => {
  if (actual != null) return actual
  const activas = salasActivas(salas)
  return activas.length === 1 ? activas[0].id : null
}
