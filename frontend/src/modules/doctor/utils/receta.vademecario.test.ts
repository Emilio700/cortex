/**
 * El predictivo contra el vademecario REAL del consultorio.
 *
 * Los medicamentos vienen en MAYUSCULAS y ahora el doctor tambien teclea en
 * mayusculas: hay que asegurar que el filtrado sigue encontrandolos, porque
 * si falla se queda sin sugerencias y no se entera (el hook falla en silencio).
 */
import { describe, expect, it } from 'vitest'
import vademecario from '../../../../../backend/app/data/vademecario.json'
import { filtrarMedicamentos } from './receta'

const catalogo = vademecario as Array<{
    id: number
    nombre: string
    presentacion: string
    detalle: string | null
    veces_recetado: number
}>

describe('predictivo con el vademecario real', () => {
    it('el catalogo tiene contenido', () => {
        expect(catalogo.length).toBeGreaterThan(300)
    })

    it('encuentra lo mismo escribiendo en minusculas o en MAYUSCULAS', () => {
        for (const texto of ['elevit', 'ELEVIT', 'Elevit']) {
            const r = filtrarMedicamentos(catalogo, texto)
            expect(r.length, `fallo con "${texto}"`).toBeGreaterThan(0)
            expect(r[0].nombre).toContain('ELEVIT')
        }
    })

    it('encuentra por coincidencia parcial en medio del nombre', () => {
        const r = filtrarMedicamentos(catalogo, 'PROTEC')
        expect(r.some((m) => m.nombre === 'ASPIRINA PROTEC')).toBe(true)
    })

    it('ordena por lo que mas se receta', () => {
        const r = filtrarMedicamentos(catalogo, 'CITRACAL')
        expect(r[0].veces_recetado).toBeGreaterThanOrEqual(
            r[r.length - 1].veces_recetado,
        )
    })

    it('los del dia a dia aparecen al teclear sus primeras letras', () => {
        const casos: Array<[string, string]> = [
            ['citr', 'CITRACAL D'],
            ['aspi', 'ASPIRINA PROTEC'],
            ['foliv', 'FOLIVITAL'],
            ['gesta', 'GESTAGENO'],
            ['cefa', 'CEFALEXINA'],
        ]
        for (const [texto, esperado] of casos) {
            const r = filtrarMedicamentos(catalogo, texto.toUpperCase())
            expect(
                r.some((m) => m.nombre === esperado),
                `"${texto}" no encontro ${esperado}`,
            ).toBe(true)
        }
    })
})
