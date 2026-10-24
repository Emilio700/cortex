/**
 * Configuración de la orden de estudio en el perfil del médico (plan 26,
 * D-7 y D-11).
 *
 * Desde la segunda ronda la orden tiene su **propio** membrete, tan editable
 * como el de la receta: qué datos salen, nombre impreso, color, letra y estilo
 * de la firma y leyenda. No lee nada de la receta; para no capturarlo dos veces
 * está «Copiar de mi receta». La cédula profesional se imprime siempre: el
 * laboratorio la exige, así que no tiene interruptor.
 *
 * El servidor manda siempre el objeto completo con sus valores de fábrica, es
 * estricto (una clave que no conoce es un 422) y en el PUT se manda completo.
 */
import {
  combinarEstiloFirma,
  normalizarColor,
  type EstiloFirma,
} from './ajustesReceta'
import type { ModoImpresion } from './ordenEstudioPdf'

export interface AjustesOrden {
  modo_impresion: ModoImpresion
  /** `null` = el nombre de la cuenta con su tratamiento. */
  nombre_impreso: string | null
  // Membrete
  mostrar_logo: boolean
  mostrar_nombre: boolean
  mostrar_especialidad: boolean
  mostrar_universidad: boolean
  mostrar_registro_general: boolean
  mostrar_cedula_especialidad: boolean
  mostrar_registro_ssa: boolean
  mostrar_consejo: boolean
  mostrar_consultorio: boolean
  mostrar_direccion: boolean
  mostrar_telefono: boolean
  mostrar_celular: boolean
  mostrar_correo: boolean
  // Paciente
  mostrar_fecha_nacimiento: boolean
  mostrar_edad: boolean
  // Estudios
  mostrar_indicacion: boolean
  mostrar_preparacion: boolean
  mostrar_prioridad: boolean
  mostrar_fecha_limite: boolean
  // Firma
  mostrar_firma: boolean
  /** `null` = el morado de fábrica. */
  color_acento: string | null
  /** `null` = el nombre en Helvetica negrita 10, como antes. */
  estilo_firma: EstiloFirma | null
  /** Leyenda adicional, encima de la advertencia que sale siempre; `null` = ninguna. */
  leyenda_pie: string | null
}

type ClavesNoInterruptor =
  | 'modo_impresion'
  | 'nombre_impreso'
  | 'color_acento'
  | 'estilo_firma'
  | 'leyenda_pie'

export type ClaveInterruptorOrden = Exclude<keyof AjustesOrden, ClavesNoInterruptor>

export const LEYENDA_ORDEN_POR_DEFECTO =
  'CORTEX — Orden de estudio. Es una solicitud: no es un resultado ni un diagnóstico.'

export const LIMITE_LEYENDA_ORDEN = 150
export const LIMITE_NOMBRE_ORDEN = 150

export const AJUSTES_ORDEN_POR_DEFECTO: AjustesOrden = {
  modo_impresion: 'separado',
  nombre_impreso: null,
  mostrar_logo: true,
  mostrar_nombre: true,
  mostrar_especialidad: true,
  mostrar_universidad: true,
  mostrar_registro_general: true,
  mostrar_cedula_especialidad: true,
  mostrar_registro_ssa: true,
  mostrar_consejo: true,
  mostrar_consultorio: true,
  mostrar_direccion: true,
  mostrar_telefono: true,
  mostrar_celular: true,
  mostrar_correo: true,
  mostrar_fecha_nacimiento: true,
  mostrar_edad: true,
  mostrar_indicacion: true,
  mostrar_preparacion: true,
  mostrar_prioridad: true,
  mostrar_fecha_limite: true,
  mostrar_firma: true,
  color_acento: null,
  estilo_firma: null,
  leyenda_pie: null,
}

export interface GrupoOrden {
  titulo: string
  descripcion: string
  opciones: ReadonlyArray<{ clave: ClaveInterruptorOrden; etiqueta: string; ayuda?: string }>
}

export const GRUPOS_ORDEN: ReadonlyArray<GrupoOrden> = [
  {
    titulo: 'Membrete',
    descripcion:
      'Lo que aparece arriba. La cédula profesional sale siempre: el laboratorio la exige.',
    opciones: [
      { clave: 'mostrar_logo', etiqueta: 'Logo del consultorio' },
      {
        clave: 'mostrar_nombre',
        etiqueta: 'Tu nombre en el membrete',
        ayuda: 'Debajo de la firma tu nombre sale siempre.',
      },
      { clave: 'mostrar_especialidad', etiqueta: 'Especialidad' },
      { clave: 'mostrar_universidad', etiqueta: 'Universidad' },
      { clave: 'mostrar_registro_general', etiqueta: 'R.G.P.' },
      { clave: 'mostrar_cedula_especialidad', etiqueta: 'Cédula de especialidad' },
      { clave: 'mostrar_registro_ssa', etiqueta: 'Registro SSA' },
      { clave: 'mostrar_consejo', etiqueta: 'Consejo / CONACEM' },
      { clave: 'mostrar_consultorio', etiqueta: 'Nombre del consultorio' },
      { clave: 'mostrar_direccion', etiqueta: 'Dirección del consultorio' },
      { clave: 'mostrar_telefono', etiqueta: 'Teléfono del consultorio' },
      {
        clave: 'mostrar_celular',
        etiqueta: 'Celular / WhatsApp',
        ayuda: 'Sale solo si lo capturaste en tus datos profesionales.',
      },
      {
        clave: 'mostrar_correo',
        etiqueta: 'Correo de contacto',
        ayuda: 'Sale solo si lo capturaste en tus datos profesionales.',
      },
    ],
  },
  {
    titulo: 'Datos del paciente',
    descripcion: 'Su nombre sale siempre.',
    opciones: [
      { clave: 'mostrar_fecha_nacimiento', etiqueta: 'Fecha de nacimiento' },
      { clave: 'mostrar_edad', etiqueta: 'Edad' },
    ],
  },
  {
    titulo: 'Estudios',
    descripcion: 'El estudio y su número de orden salen siempre.',
    opciones: [
      { clave: 'mostrar_indicacion', etiqueta: 'Indicación clínica' },
      { clave: 'mostrar_preparacion', etiqueta: 'Preparación (ayuno, vejiga llena…)' },
      { clave: 'mostrar_prioridad', etiqueta: 'Prioridad' },
      { clave: 'mostrar_fecha_limite', etiqueta: 'Fecha límite' },
    ],
  },
  {
    titulo: 'Firma',
    descripcion: 'La raya para firmar con tu nombre debajo sale siempre.',
    opciones: [
      {
        clave: 'mostrar_firma',
        etiqueta: 'Imagen de tu firma',
        ayuda: 'Apagada, queda la raya con tu nombre para firmar a mano.',
      },
    ],
  },
]

const INTERRUPTORES = GRUPOS_ORDEN.flatMap((g) => g.opciones.map((o) => o.clave))

/** Lo guardado sobre los valores de fábrica: una clave que falte no rompe la pantalla. */
export const combinarAjustesOrden = (guardados?: Partial<AjustesOrden> | null): AjustesOrden => {
  const base: AjustesOrden = { ...AJUSTES_ORDEN_POR_DEFECTO }
  if (!guardados) return base
  for (const clave of INTERRUPTORES) {
    if (typeof guardados[clave] === 'boolean') base[clave] = guardados[clave] as boolean
  }
  if (guardados.modo_impresion === 'separado' || guardados.modo_impresion === 'una_hoja') {
    base.modo_impresion = guardados.modo_impresion
  }
  base.nombre_impreso = guardados.nombre_impreso?.trim() ? guardados.nombre_impreso : null
  base.leyenda_pie = guardados.leyenda_pie?.trim() ? guardados.leyenda_pie : null
  base.color_acento = normalizarColor(guardados.color_acento ?? null)
  base.estilo_firma = guardados.estilo_firma ? combinarEstiloFirma(guardados.estilo_firma) : null
  return base
}

/**
 * Lo que se manda al servidor: el objeto completo, con los textos vacíos como
 * `null` (vuelven a los de fábrica). Solo las claves del contrato: una de más
 * sería un 422.
 */
export const ajustesOrdenParaEnviar = (ajustes: AjustesOrden): AjustesOrden => {
  const limpio = combinarAjustesOrden(ajustes)
  return {
    ...limpio,
    nombre_impreso: ajustes.nombre_impreso?.trim() || null,
    leyenda_pie: ajustes.leyenda_pie?.trim() || null,
  }
}
