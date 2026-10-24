import { format, differenceInYears, isValid, parseISO } from 'date-fns'

/**
 * Relleno que dejó la migración del sistema anterior cuando el expediente en
 * papel no traía fecha de nacimiento. No es una fecha real: tratarla como tal
 * pone "126 años" en el expediente de un paciente de treinta.
 */
export const FECHA_NACIMIENTO_RELLENO_LEGACY = '1900-01-01'

/** Lo que se muestra cuando el sistema no sabe la edad. */
export const EDAD_SIN_DATO = '—'

/**
 * Convierte a `Date` lo que se pueda y devuelve null cuando no hay fecha
 * utilizable.
 *
 * Existe por una trampa de JavaScript que nos costó cara: `new Date(null)` no
 * es una fecha inválida, es el 1 de enero de 1970. Un paciente sin fecha de
 * nacimiento capturada aparecía así con la edad que hoy tendría alguien nacido
 * ese día — un número inventado que nadie podía distinguir de un dato real.
 *
 * Se usa `parseISO` y no `new Date` a propósito: `new Date('1990-05-10')`
 * interpreta la cadena como medianoche UTC y en la zona horaria de México eso
 * cae el día anterior, lo que corre la edad un día alrededor del cumpleaños.
 */
const aFechaDeNacimiento = (valor?: string | Date | null): Date | null => {
  if (valor === null || valor === undefined) return null

  let fecha: Date
  if (typeof valor === 'string') {
    if (!valor.trim()) return null
    fecha = parseISO(valor)
  } else {
    fecha = valor
  }

  if (!isValid(fecha)) return null
  if (format(fecha, 'yyyy-MM-dd') === FECHA_NACIMIENTO_RELLENO_LEGACY) return null

  return fecha
}

/**
 * Formatea con un patrón de date-fns un **instante del servidor** (`created_at`,
 * `updated_at`…: UTC sin «Z»), en la hora del consultorio. Antes se leía como
 * hora local del navegador y salía siete horas corrido (plan 26, D-12). Para la
 * hora de una cita usa `formatDateCita`.
 */
export const formatDate = (date: string | Date, formatStr = 'dd/MM/yyyy HH:mm'): string => {
  const instante = typeof date === 'string' ? instanteDelServidor(date) : date
  return format(relojDelConsultorio(instante), formatStr)
}

/** Igual que `formatDate`, para la hora local de una cita (`scheduled_at`). */
export const formatDateCita = (date: string, formatStr = 'dd/MM/yyyy HH:mm'): string =>
  format(relojDelConsultorio(horaDelConsultorio(date)), formatStr)

/**
 * Edad en años cumplidos, o **null cuando no se sabe**.
 *
 * Devolver null y no un número es la parte importante: si el sistema no conoce
 * la fecha de nacimiento, la interfaz no puede afirmar una edad. Alguien puede
 * tomar una decisión clínica con ella.
 */
export const getAge = (dateOfBirth?: string | Date | null): number | null => {
  const fecha = aFechaDeNacimiento(dateOfBirth)
  if (!fecha) return null

  const edad = differenceInYears(new Date(), fecha)

  // Una fecha de nacimiento en el futuro sale de un error de captura, no de una
  // paciente: preferimos el hueco visible a una edad negativa en el expediente.
  return edad < 0 ? null : edad
}

/**
 * Texto de edad listo para pintar: "34 años", o el guion cuando no hay dato.
 * Centralizado para que ninguna pantalla vuelva a resolver el hueco por su
 * cuenta y termine escribiendo "NaN años" o una edad fantasma.
 */
export const formatEdad = (
  dateOfBirth?: string | Date | null,
  sinDato: string = EDAD_SIN_DATO,
): string => {
  const edad = getAge(dateOfBirth)
  return edad === null ? sinDato : `${edad} años`
}

/**
 * Zona del consultorio (plan 26, D-12). Toda fecha y hora visible se formatea
 * con ella **explícitamente**: una computadora con el reloj en otra zona (la
 * laptop que se configuró en Ciudad de México, un navegador en UTC) no debe
 * mover la hora de una cita ni el día de una orden. Mazatlán está en UTC−7 todo
 * el año, sin horario de verano.
 */
export const ZONA_CONSULTORIO = 'America/Mazatlan'
const DESFASE_CONSULTORIO = '-07:00'

const TIENE_ZONA = /([zZ]|[+-]\d{2}:?\d{2})$/

/**
 * Un instante que el servidor guarda en UTC sin la «Z» (`created_at`,
 * `updated_at`, `paid_at`…). Leído tal cual, el navegador lo toma como hora
 * local y lo corre siete horas. Si algún día llega con zona, se respeta.
 */
export const instanteDelServidor = (iso: string): Date =>
  new Date(TIENE_ZONA.test(iso) ? iso : `${iso}Z`)

/**
 * Una hora de reloj del consultorio (`scheduled_at` de las citas, los bloqueos
 * del horario): el servidor la guarda **local**, sin zona («18:00» es a las
 * 6 de la tarde en Mazatlán). Se ancla a la zona del consultorio para que se
 * muestre igual desde cualquier navegador.
 */
export const horaDelConsultorio = (iso: string): Date =>
  new Date(TIENE_ZONA.test(iso) ? iso : `${iso}${DESFASE_CONSULTORIO}`)

/** Formatea un `Date` en la zona del consultorio. */
export const formatearEnConsultorio = (
  fecha: Date,
  opciones: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string => {
  if (Number.isNaN(fecha.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', { ...opciones, timeZone: ZONA_CONSULTORIO }).format(fecha)
}

/**
 * Fecha y hora de un instante del servidor (UTC sin «Z»), en hora del
 * consultorio. `sinDato` cuando no hay valor o no es una fecha.
 */
export const formatearInstante = (
  valor?: string | null,
  opciones?: Intl.DateTimeFormatOptions,
  sinDato = '',
): string => {
  if (!valor || !valor.trim()) return sinDato
  return formatearEnConsultorio(instanteDelServidor(valor), opciones) || sinDato
}

/** Fecha y hora de una cita (`scheduled_at`, hora local del consultorio). */
export const formatearHoraDeCita = (
  valor?: string | null,
  opciones?: Intl.DateTimeFormatOptions,
  sinDato = '',
): string => {
  if (!valor || !valor.trim()) return sinDato
  return formatearEnConsultorio(horaDelConsultorio(valor), opciones) || sinDato
}

/** Año, mes y día de un instante tal como se ven en el consultorio. */
const partesEnConsultorio = (fecha: Date) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CONSULTORIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return { anio: de('year'), mes: de('month'), dia: de('day') }
}

/**
 * Un `Date` cuyos componentes locales (año, mes, día, hora, minuto) son los del
 * reloj del consultorio en ese instante. Solo sirve para dárselo a date-fns,
 * que formatea con los componentes locales; no es el mismo instante.
 */
const relojDelConsultorio = (instante: Date): Date => {
  if (Number.isNaN(instante.getTime())) return instante
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CONSULTORIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante)
  const de = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0)
  return new Date(de('year'), de('month') - 1, de('day'), de('hour'), de('minute'), de('second'))
}

/**
 * El día (`AAAA-MM-DD`) en que cae un instante del servidor en el consultorio.
 * Sirve para agrupar por día: agrupar con `toISOString()` juntaba por día UTC,
 * y una nota de las 18:00 caía en el día siguiente (plan 26, D-12).
 */
export const diaDelConsultorio = (valor: string | Date): string => {
  const fecha = typeof valor === 'string' ? instanteDelServidor(valor) : valor
  const { anio, mes, dia } = partesEnConsultorio(fecha)
  return `${anio}-${mes}-${dia}`
}

/**
 * La fecha de hoy **en el consultorio**, como `AAAA-MM-DD`.
 *
 * Reemplaza a `new Date().toISOString().slice(0, 10)`, que da la fecha **UTC**:
 * en Mazatlán (UTC−7) una orden creada después de las 17:00 se guardaba con la
 * fecha de mañana (plan 26, F-1), y lo mismo vacunas, controles prenatales y
 * episodios del expediente. Se calcula con la zona del consultorio y no con la
 * del navegador (D-12).
 */
export const hoyLocalISO = (ahora: Date = new Date()): string => diaDelConsultorio(ahora)

/**
 * Hoy en el consultorio como `Date` del navegador a medianoche local (año, mes
 * y día de Mazatlán). Es lo que necesitan los calendarios, que trabajan con
 * los días locales del `Date`: con `new Date()` una laptop con otro huso o un
 * navegador en UTC marcaba como «hoy» el día equivocado por la noche (plan 28).
 */
export const hoyDelConsultorio = (ahora: Date = new Date()): Date => {
  const [anio, mes, dia] = hoyLocalISO(ahora).split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/**
 * El reloj del consultorio como `Date` cuyos componentes locales son los de
 * Mazatlán. Sirve para el «ahora» de un calendario (FullCalendar), no para
 * mandar al servidor: no es el mismo instante.
 */
export const relojLocalDelConsultorio = (ahora: Date = new Date()): Date => relojDelConsultorio(ahora)

/** El primer día del mes en curso, en el consultorio, como `AAAA-MM-DD`. */
export const primerDiaDelMesLocalISO = (ahora: Date = new Date()): string =>
  `${hoyLocalISO(ahora).slice(0, 8)}01`

/**
 * Muestra una fecha **sin hora** del servidor (`requested_on`, `due_on`…) en
 * español, sin correrse un día.
 *
 * `new Date('2026-09-30')` es medianoche UTC, que en México todavía es el 29: así
 * la bandeja decía un día antes que el papel (plan 26, F-2). Una fecha sin hora
 * no tiene zona: se arma a mediodía UTC y se formatea en UTC, así sale el mismo
 * día en cualquier navegador. Para marcas de tiempo con hora usa
 * `formatearInstante`.
 */
export const formatearFechaISO = (
  valor?: string | null,
  sinDato = 'Sin fecha',
  estilo: 'short' | 'medium' | 'long' = 'medium',
): string => {
  if (!valor || !valor.trim()) return sinDato
  const fecha = new Date(`${valor.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(fecha.getTime())) return sinDato
  return new Intl.DateTimeFormat('es-MX', { dateStyle: estilo, timeZone: 'UTC' }).format(fecha)
}

/** Igual que `formatearFechaISO`, con opciones de formato a la medida. */
export const formatearFechaISOCon = (
  valor: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions,
  sinDato = '',
): string => {
  if (!valor || !valor.trim()) return sinDato
  const fecha = new Date(`${valor.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(fecha.getTime())) return sinDato
  return new Intl.DateTimeFormat('es-MX', { ...opciones, timeZone: 'UTC' }).format(fecha)
}

/**
 * Medianoche del día del consultorio como hora de reloj sin zona
 * (`AAAA-MM-DDT00:00:00`), para filtrar por `scheduled_at`, que el servidor
 * guarda como hora local sin zona. Con `toISOString()` se mandaba la medianoche
 * del navegador convertida a UTC (las 07:00) y la agenda del día perdía las
 * citas de la mañana o, en la noche, mostraba las de mañana (plan 26).
 * `dias` corre el día: 1 = mañana.
 */
export const inicioDelDiaEnConsultorio = (dias = 0, ahora: Date = new Date()): string => {
  const hoy = new Date(`${hoyLocalISO(ahora)}T12:00:00Z`)
  hoy.setUTCDate(hoy.getUTCDate() + dias)
  return `${hoy.toISOString().slice(0, 10)}T00:00:00`
}

/**
 * El valor para un `<input type="datetime-local">` con la hora actual del
 * consultorio (`AAAA-MM-DDTHH:mm`), sin importar la zona del navegador.
 */
export const ahoraParaCampoFechaHora = (ahora: Date = new Date()): string =>
  format(relojDelConsultorio(ahora), "yyyy-MM-dd'T'HH:mm")

/**
 * Convierte lo que se capturó en un `datetime-local` (hora del consultorio) al
 * instante UTC que guarda el servidor. Antes se usaba `new Date(valor)`, que
 * lo toma como hora del navegador.
 */
export const instanteDesdeHoraDelConsultorio = (valor: string): string =>
  horaDelConsultorio(valor.length === 16 ? `${valor}:00` : valor).toISOString()
