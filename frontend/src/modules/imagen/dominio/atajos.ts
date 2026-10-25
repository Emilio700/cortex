/**
 * Atajos de teclado del visor.
 *
 * Una sola tabla: de ella sale lo que hace cada tecla y también la lista que se
 * le enseña al médico (`AyudaDeAtajos`). Si estuvieran en dos lugares, la ayuda
 * acabaría describiendo teclas que ya no hacen eso.
 *
 * `accionDeTecla` es una función pura: recibe lo mínimo del evento y dice qué
 * acción corresponde, o `null` si la tecla no es del visor. Así se prueba sin
 * navegador, y la pantalla sólo decide *cuándo* hacerle caso (no mientras se
 * escribe en un campo, ni con un cuadro de diálogo abierto).
 */

export type AccionDelVisor =
  | 'corte-anterior'
  | 'corte-siguiente'
  | 'diez-atras'
  | 'diez-adelante'
  | 'primer-corte'
  | 'ultimo-corte'
  | 'acercar'
  | 'alejar'
  | 'ajustar'
  | 'invertir'
  | 'rotar'
  | 'voltear-horizontal'
  | 'voltear-vertical'
  | 'restablecer'
  | 'cine'
  | 'capturar'
  | 'corte-clave'
  | 'herramienta-ventana'
  | 'herramienta-medir'
  | 'herramienta-angulo'
  | 'herramienta-area'
  | 'herramienta-desplazar'
  | 'herramienta-zoom'
  | 'pantalla-completa'
  | 'presentacion'
  | 'salir'
  | 'ayuda'

export interface EntradaDeAtajo {
  accion: AccionDelVisor
  /** Valores de `KeyboardEvent.key` (en minúscula las letras). */
  teclas: string[]
  /** Cómo se escribe en la ayuda. */
  etiqueta: string
  descripcion: string
  grupo: 'Cortes' | 'Imagen' | 'Herramientas' | 'Pantalla'
}

export const ATAJOS: ReadonlyArray<EntradaDeAtajo> = [
  { accion: 'corte-anterior', teclas: ['arrowup', 'arrowleft'], etiqueta: '↑ ←', descripcion: 'Corte anterior', grupo: 'Cortes' },
  { accion: 'corte-siguiente', teclas: ['arrowdown', 'arrowright'], etiqueta: '↓ →', descripcion: 'Corte siguiente', grupo: 'Cortes' },
  { accion: 'diez-atras', teclas: ['pageup'], etiqueta: 'Re Pág', descripcion: 'Diez cortes atrás', grupo: 'Cortes' },
  { accion: 'diez-adelante', teclas: ['pagedown'], etiqueta: 'Av Pág', descripcion: 'Diez cortes adelante', grupo: 'Cortes' },
  { accion: 'primer-corte', teclas: ['home'], etiqueta: 'Inicio', descripcion: 'Primer corte', grupo: 'Cortes' },
  { accion: 'ultimo-corte', teclas: ['end'], etiqueta: 'Fin', descripcion: 'Último corte', grupo: 'Cortes' },
  { accion: 'cine', teclas: [' '], etiqueta: 'Espacio', descripcion: 'Reproducir o pausar los cortes', grupo: 'Cortes' },
  { accion: 'acercar', teclas: ['+', '='], etiqueta: '+', descripcion: 'Acercar', grupo: 'Imagen' },
  { accion: 'alejar', teclas: ['-', '_'], etiqueta: '−', descripcion: 'Alejar', grupo: 'Imagen' },
  { accion: 'ajustar', teclas: ['0'], etiqueta: '0', descripcion: 'Ajustar a la pantalla', grupo: 'Imagen' },
  { accion: 'invertir', teclas: ['i'], etiqueta: 'I', descripcion: 'Invertir los grises', grupo: 'Imagen' },
  { accion: 'rotar', teclas: ['r'], etiqueta: 'R', descripcion: 'Girar 90°', grupo: 'Imagen' },
  { accion: 'voltear-horizontal', teclas: ['h'], etiqueta: 'H', descripcion: 'Voltear horizontal', grupo: 'Imagen' },
  { accion: 'voltear-vertical', teclas: ['v'], etiqueta: 'V', descripcion: 'Voltear vertical', grupo: 'Imagen' },
  { accion: 'restablecer', teclas: ['backspace'], etiqueta: 'Retroceso', descripcion: 'Restablecer la vista', grupo: 'Imagen' },
  { accion: 'herramienta-ventana', teclas: ['w'], etiqueta: 'W', descripcion: 'Contraste', grupo: 'Herramientas' },
  { accion: 'herramienta-medir', teclas: ['m'], etiqueta: 'M', descripcion: 'Medir distancia', grupo: 'Herramientas' },
  { accion: 'herramienta-angulo', teclas: ['a'], etiqueta: 'A', descripcion: 'Medir ángulo', grupo: 'Herramientas' },
  { accion: 'herramienta-area', teclas: ['e'], etiqueta: 'E', descripcion: 'Elipse (área)', grupo: 'Herramientas' },
  { accion: 'herramienta-desplazar', teclas: ['p'], etiqueta: 'P', descripcion: 'Desplazar la imagen', grupo: 'Herramientas' },
  { accion: 'herramienta-zoom', teclas: ['z'], etiqueta: 'Z', descripcion: 'Acercar con arrastre', grupo: 'Herramientas' },
  { accion: 'capturar', teclas: ['c'], etiqueta: 'C', descripcion: 'Capturar la imagen', grupo: 'Pantalla' },
  { accion: 'corte-clave', teclas: ['k'], etiqueta: 'K', descripcion: 'Marcar corte clave', grupo: 'Pantalla' },
  { accion: 'pantalla-completa', teclas: ['f'], etiqueta: 'F', descripcion: 'Pantalla completa', grupo: 'Pantalla' },
  { accion: 'presentacion', teclas: ['t'], etiqueta: 'T', descripcion: 'Modo presentación (para el paciente)', grupo: 'Pantalla' },
  { accion: 'salir', teclas: ['escape'], etiqueta: 'Esc', descripcion: 'Salir de la presentación', grupo: 'Pantalla' },
  { accion: 'ayuda', teclas: ['?'], etiqueta: '?', descripcion: 'Ver estos atajos', grupo: 'Pantalla' },
]

export interface EventoDeTecla {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

const POR_TECLA: Map<string, AccionDelVisor> = new Map(
  ATAJOS.flatMap((atajo) => atajo.teclas.map((tecla) => [tecla, atajo.accion] as const))
)

/**
 * Qué acción corresponde a una tecla. Con Ctrl, Cmd o Alt no se interpreta: son
 * de otras cosas (Ctrl+C copia, Ctrl+R recarga) y quitárselas al navegador
 * sería peor que no tener el atajo.
 */
export function accionDeTecla(evento: EventoDeTecla): AccionDelVisor | null {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return null
  return POR_TECLA.get(evento.key.toLowerCase()) ?? null
}

/** ¿El foco está donde se escribe? Ahí los atajos no deben robar teclas. */
export function estaEscribiendo(destino: EventTarget | null): boolean {
  const elemento = destino as HTMLElement | null
  if (!elemento || typeof elemento.tagName !== 'string') return false
  const etiqueta = elemento.tagName.toLowerCase()
  return (
    etiqueta === 'input' ||
    etiqueta === 'textarea' ||
    etiqueta === 'select' ||
    elemento.isContentEditable === true
  )
}

/** Los atajos agrupados para la ayuda, en el orden de la tabla. */
export function atajosPorGrupo(): Array<{ grupo: EntradaDeAtajo['grupo']; atajos: EntradaDeAtajo[] }> {
  const grupos = new Map<EntradaDeAtajo['grupo'], EntradaDeAtajo[]>()
  for (const atajo of ATAJOS) {
    grupos.set(atajo.grupo, [...(grupos.get(atajo.grupo) ?? []), atajo])
  }
  return [...grupos.entries()].map(([grupo, atajos]) => ({ grupo, atajos }))
}

/** «Invertir los grises (I)»: el texto de un botón con su atajo, de la misma tabla. */
export function tituloConAtajo(accion: AccionDelVisor, texto: string): string {
  const atajo = ATAJOS.find((entrada) => entrada.accion === accion)
  return atajo ? `${texto} (${atajo.etiqueta})` : texto
}
