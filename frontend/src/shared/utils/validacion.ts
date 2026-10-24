/**
 * Validación de campos con el error junto al campo, en español.
 *
 * Los formularios que la usan van con `noValidate`: el navegador deja de
 * enseñar su globo («Please fill out this field») y el mensaje se pinta
 * debajo del campo con `ErrorDeCampo`. La misma frase que se ve es la que
 * anuncian los lectores de pantalla (el aviso lleva `role="alert"` y el
 * campo lo referencia con `aria-describedby`).
 */

/** ¿El texto está vacío? Los espacios no cuentan. */
export const estaVacio = (valor: string): boolean => valor.trim().length === 0

/** Forma razonable de correo: algo@algo.algo, sin espacios. */
export const esCorreo = (valor: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())

/** Mensajes compartidos de los formularios de correo. */
export const CORREO = {
  falta: 'Escribe tu correo.',
  invalido: 'Escribe un correo válido.',
} as const

/** Mensajes compartidos de los formularios de contraseña. */
export const CONTRASENA = {
  falta: 'Escribe tu contraseña.',
  actualFalta: 'Escribe tu contraseña actual.',
  nuevaFalta: 'Escribe la nueva contraseña.',
  confirmarFalta: 'Repite la nueva contraseña.',
  corta: 'La nueva contraseña debe tener al menos 8 caracteres.',
  noCoinciden: 'Las contraseñas no coinciden.',
} as const
