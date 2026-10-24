/**
 * Tipos de los recorridos guiados (tutoriales).
 *
 * Un recorrido se declara como datos y no como código: así quien capacita al
 * personal puede leer y corregir los textos sin tocar la mecánica, y las pruebas
 * pueden revisar qué ve cada rol sin montar pantallas.
 */
import type { Role } from '../types'

export type LadoPopover = 'top' | 'right' | 'bottom' | 'left'
export type AlineacionPopover = 'start' | 'center' | 'end'

export interface PasoRecorrido {
  /**
   * Valor del atributo `data-tour` que se señala. Sin él, el paso es una
   * tarjeta centrada (bienvenida, cierre o una explicación general).
   *
   * Una lista quiere decir "el primero que esté": la misma parte de la
   * pantalla puede llevar ids distintos según quién la pinte (p. ej. la
   * tarjeta de la nota o, si aún no tiene id, el formulario de adentro).
   */
  elemento?: string | string[]
  titulo: string
  /** Texto del paso. Admite HTML sencillo (<b>, <br>, <ul>) porque lo pinta driver.js. */
  texto: string
  lado?: LadoPopover
  alinear?: AlineacionPopover
}

export type GrupoRecorrido = 'General' | 'Consulta médica' | 'Recepción' | 'Cobros' | 'Administración'

export interface Recorrido {
  /** Identificador estable; es la llave de "ya lo vi" y del progreso a medias. */
  id: string
  /**
   * Se sube cuando cambia el contenido del recorrido (pasos, textos, ids):
   * quien vio la versión anterior no vio lo nuevo, y el progreso a medias de
   * la anterior se descarta porque "paso 4" ya no quiere decir lo mismo.
   */
  version: number
  titulo: string
  /** Una línea para el menú de tutoriales. */
  resumen: string
  grupo: GrupoRecorrido
  /**
   * Patrón de ruta (mismo formato que `routes.tsx`, con `:param`) de la
   * pantalla donde vive. Sin ruta, el recorrido sirve en cualquier pantalla.
   */
  ruta?: string
  /** Permisos que lo habilitan; basta uno. Deben ser los mismos que abren la pantalla. */
  requiere?: string[]
  /** Respaldo por rol para sesiones que aún no traen permisos, igual que las rutas. */
  roles?: Role[]
  /**
   * Restricción adicional por rol (se suma al permiso, no lo sustituye). Para
   * pantallas que comparten ruta y permiso pero no trabajo: en Pagos, la
   * doctora revisa sus cobros y recepción cobra.
   */
  soloRoles?: Role[]
  /**
   * `data-tour` que tiene que estar a la vista para que el recorrido aplique,
   * p. ej. el cuerpo de un modal. Sirve para recorridos de un formulario.
   */
  contexto?: string
  /**
   * Cómo llegar a donde el recorrido se puede ver, cuando no se puede abrir
   * desde donde está la persona: una consulta concreta, el expediente de una
   * paciente o un formulario abierto. El centro de ayuda lo muestra en vez de
   * elegir por ella un paciente o abrir un formulario (eso ya sería actuar).
   */
  comoLlegar?: string
  /**
   * Pantalla sin datos concretos desde donde se llega (p. ej. «Mis consultas»
   * para la consulta). El centro ofrece ir ahí; lo demás lo decide la persona.
   */
  irA?: { ruta: string; nombre: string }
  pasos: PasoRecorrido[]
}

/**
 * Una parte del recorrido completo: un recorrido del catálogo y el nombre
 * corto con que se anuncia ("vas en Consulta, 3 de 7").
 */
export interface EtapaCompleta {
  recorridoId: string
  nombre: string
}

/**
 * Recorrido completo de un rol: encadena recorridos del catálogo en el orden en
 * que se aprende el trabajo real. No declara permisos propios: cada etapa
 * hereda los de su recorrido, y la que no le toca a la persona se salta.
 */
export interface RecorridoCompleto {
  id: string
  /** Igual que en un recorrido: se sube si cambian las etapas o su orden. */
  version: number
  titulo: string
  resumen: string
  roles: Role[]
  etapas: EtapaCompleta[]
}

/** Lo mínimo de la sesión que hace falta para decidir qué recorridos ve alguien. */
export interface AccesoTutoriales {
  role?: Role
  permissions?: string[]
}
