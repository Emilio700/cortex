/**
 * Guardia contra recorridos que mienten.
 *
 * Un paso cuyo `data-tour` ya no existe se salta en silencio: nadie se entera
 * de que el recorrido dejó de explicar esa parte, o de que ahora describe un
 * botón que se quitó. Esta prueba revisa que cada ancla que usa el catálogo
 * aparezca en algún componente `.tsx`. No detecta un texto desactualizado (eso
 * sigue siendo revisión humana, ver CLAUDE.md), pero sí el id renombrado.
 */
import { describe, expect, it } from 'vitest'
import { CATALOGO } from './recorridos'
import { idDeTutorial } from '../../modules/doctor/components/ConsultationSection'

/**
 * Anclas que otra rama agrega y que aún no están en esta. Se escriben los
 * pasos antes para que el recorrido quede listo al unir las ramas; mientras,
 * se saltan solos. Al unir, quita de aquí las que ya existan: la prueba lo pide.
 */
// finanzas-mi-caja y finanzas-bloque-doctoras llegan con fix/cobros-revision.
const PENDIENTES_DE_OTRA_RAMA = new Set<string>([])

const fuentes = import.meta.glob<string>(['/src/**/*.tsx', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const codigo = Object.values(fuentes).join('\n')

/** Todas las anclas que usa el catálogo (pasos y contextos), con quién las usa. */
const anclasDelCatalogo = (): Map<string, string[]> => {
  const usos = new Map<string, string[]>()
  const anotar = (id: string, recorrido: string) =>
    usos.set(id, [...(usos.get(id) ?? []), recorrido])
  for (const r of CATALOGO) {
    if (r.contexto) anotar(r.contexto, r.id)
    for (const paso of r.pasos) {
      if (!paso.elemento) continue
      for (const id of Array.isArray(paso.elemento) ? paso.elemento : [paso.elemento]) {
        anotar(id, r.id)
      }
    }
  }
  return usos
}

/**
 * ¿Algún componente pinta este `data-tour`? Se acepta el id como literal
 * (`data-tour="x"`, o pasado por una prop como `tour="x"`), y las secciones de
 * la consulta, cuyo id se arma del título (`consulta-seccion-plan-clinico`).
 */
const existeEnComponentes = (id: string): boolean => {
  if (codigo.includes(`"${id}"`) || codigo.includes(`'${id}'`)) return true
  if (id.startsWith('consulta-seccion-')) {
    const titulos = [...codigo.matchAll(/title="([^"]+)"/g)].map((m) => m[1])
    return titulos.some((t) => `consulta-seccion-${idDeTutorial(t)}` === id)
  }
  return false
}

describe('anclas de los recorridos', () => {
  it('cada data-tour que usa un recorrido existe en algún componente', () => {
    const faltantes = [...anclasDelCatalogo()]
      .filter(([id]) => !PENDIENTES_DE_OTRA_RAMA.has(id) && !existeEnComponentes(id))
      .map(([id, recorridos]) => `${id} (lo usa: ${recorridos.join(', ')})`)
    expect(
      faltantes,
      'Estos pasos señalan algo que ya no está: corrige el id o el paso y sube la versión del recorrido',
    ).toEqual([])
  })

  it('la lista de pendientes no se queda vieja', () => {
    const usadas = anclasDelCatalogo()
    const yaExisten = [...PENDIENTES_DE_OTRA_RAMA].filter(existeEnComponentes)
    const sinUso = [...PENDIENTES_DE_OTRA_RAMA].filter((id) => !usadas.has(id))
    expect(yaExisten, 'Ya existen: quítalos de PENDIENTES_DE_OTRA_RAMA').toEqual([])
    expect(sinUso, 'Ningún recorrido los usa: quítalos de PENDIENTES_DE_OTRA_RAMA').toEqual([])
  })

  it('detecta un id que no existe (la prueba no pasa por pasar)', () => {
    expect(existeEnComponentes('esto-no-existe-en-ningun-lado')).toBe(false)
    expect(existeEnComponentes('ayuda')).toBe(true)
    expect(existeEnComponentes('consulta-seccion-plan-clinico')).toBe(true)
  })
})
