/**
 * Guardia de la voz de la interfaz (U-01, decisión 5.1 de Emilio: «tú»).
 *
 * El barrido quitó el «usted» de los textos visibles y el «doctor/médico» con
 * que se nombraba a quien atiende. Sin esta prueba, el siguiente mensaje de
 * error copiado de otro lado vuelve a mezclar las dos voces y nadie lo nota.
 * Revisa el código de `src` (sin pruebas) con los comentarios quitados; no es
 * exhaustiva, cubre las formas que ya aparecieron. La guía está en
 * `docs/guia_estilo_interfaz.md`.
 */
import { describe, expect, it } from 'vitest'

const fuentes = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Quita comentarios de bloque, de JSX y de línea: ahí se puede hablar de cualquier forma. */
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const buscar = (patron: RegExp) =>
  Object.entries(fuentes).flatMap(([ruta, codigo]) =>
    sinComentarios(codigo)
      .split('\n')
      .filter((linea) => patron.test(linea))
      .map((linea) => `${ruta}: ${linea.trim()}`),
  )

describe('voz de la interfaz', () => {
  it('no le habla de usted a quien usa el sistema', () => {
    const usted =
      /\b(Inténtelo|inténtelo|Seleccione|Escriba|Agregue|Indique|Guarde|Describa|Verifique|Ingrese|Lo decide usted)\b|Debe (seleccionar|elegir|completar|indicar)/
    expect(buscar(usted)).toEqual([])
  })

  it('a quien atiende la llama doctora, no doctor ni médico', () => {
    const doctor =
      /Todos los doctores|lista de doctores|Seleccionar doctor|Doctor Dueño|Nota doctor|Nota del doctor|para el doctor|el doctor (desea|para)|Este doctor|Médico colaborador|Dashboard del Doctor|Buenos días, Doctor/
    expect(buscar(doctor)).toEqual([])
  })
})
