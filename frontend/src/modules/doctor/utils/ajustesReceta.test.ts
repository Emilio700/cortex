import { describe, expect, it } from 'vitest'

import {
    AJUSTES_RECETA_POR_DEFECTO,
    COLOR_ACENTO_POR_DEFECTO,
    ESTILO_FIRMA_POR_DEFECTO,
    GRUPOS_RECETA,
    LEYENDA_POR_DEFECTO,
    TAMANO_FIRMA_MAX,
    TAMANO_FIRMA_MIN,
    combinarAjustes,
    combinarColor,
    combinarEstiloFirma,
    combinarLeyenda,
    esColorValido,
    nombreImpreso,
    normalizarColor,
    tieneTratamiento,
    type ClaveAjusteReceta,
} from './ajustesReceta'

describe('combinarAjustes', () => {
    it('un perfil sin configurar recibe los valores de fábrica', () => {
        expect(combinarAjustes(null)).toEqual(AJUSTES_RECETA_POR_DEFECTO)
        expect(combinarAjustes(undefined)).toEqual(AJUSTES_RECETA_POR_DEFECTO)
    })

    it('lo guardado manda sobre los valores de fábrica', () => {
        const ajustes = combinarAjustes({ mostrar_logo: false })

        expect(ajustes.mostrar_logo).toBe(false)
        expect(ajustes.mostrar_firma).toBe(true)
    })

    it('no devuelve el mismo objeto: tocar un ajuste no puede mutar los de fábrica', () => {
        const ajustes = combinarAjustes(null)
        ajustes.mostrar_logo = false

        expect(AJUSTES_RECETA_POR_DEFECTO.mostrar_logo).toBe(true)
    })

    it('ignora lo que no es booleano en vez de pintar un interruptor a medias', () => {
        const ajustes = combinarAjustes({ mostrar_logo: 1 as unknown as boolean })

        expect(ajustes.mostrar_logo).toBe(true)
    })
})

describe('nombreImpreso', () => {
    it('respeta el tratamiento que escribió el médico', () => {
        expect(nombreImpreso('Dra. Yara Gutiérrez', 'YARA MONTSERRAT GUTIÉRREZ ROMERO')).toBe(
            'Dra. Yara Gutiérrez',
        )
    })

    it('no duplica el tratamiento: nada de "Dr. Dr."', () => {
        expect(nombreImpreso('Dr. Adolfo Pérez', '')).not.toContain('Dr. Dr.')
        expect(nombreImpreso('DRA. YARA', '')).not.toContain('Dra. Dra.')
    })

    it('antepone el tratamiento cuando el nombre no lo trae', () => {
        expect(nombreImpreso('Yara Gutiérrez', '', 'Dra.')).toBe('Dra. Yara Gutiérrez')
        // Sin tratamiento capturado no se inventa un "Dr.".
        expect(nombreImpreso('Yara Gutiérrez', '')).toBe('Yara Gutiérrez')
    })

    it('sin nombre configurado usa el de la cuenta', () => {
        expect(nombreImpreso('   ', 'ADOLFO PÉREZ', 'Dr.')).toBe('Dr. ADOLFO PÉREZ')
        expect(nombreImpreso('   ', 'ADOLFO PÉREZ')).toBe('ADOLFO PÉREZ')
        expect(nombreImpreso('', '')).toBe('')
    })
})

describe('tieneTratamiento', () => {
    it.each(['Dr. Adolfo', 'dra. Yara', 'Doctora Yara', 'M.C. Ana'])('reconoce %s', (nombre) => {
        expect(tieneTratamiento(nombre)).toBe(true)
    })

    it('no confunde un nombre que empieza por Dra sin punto ni espacio', () => {
        expect(tieneTratamiento('Draco Malfoy')).toBe(false)
    })
})

describe('combinarLeyenda', () => {
    it('sin leyenda escrita manda la de fábrica', () => {
        expect(combinarLeyenda(null)).toBe(LEYENDA_POR_DEFECTO)
        expect(combinarLeyenda(undefined)).toBe(LEYENDA_POR_DEFECTO)
        expect(combinarLeyenda('   ')).toBe(LEYENDA_POR_DEFECTO)
    })

    it('respeta la leyenda escrita por el médico', () => {
        expect(combinarLeyenda('AGENDA TU CITA AL 312 123 4567')).toBe(
            'AGENDA TU CITA AL 312 123 4567',
        )
    })
})

describe('color del membrete', () => {
    it('acepta un hexadecimal con o sin almohadilla, en cualquier caja', () => {
        expect(esColorValido('#0F6E4F')).toBe(true)
        expect(esColorValido('0f6e4f')).toBe(true)
        expect(esColorValido('morado')).toBe(false)
        expect(esColorValido('#0F6E4')).toBe(false)
    })

    it('normaliza a mayúsculas para que no se guarden dos formas del mismo color', () => {
        expect(normalizarColor('#0f6e4f')).toBe('#0F6E4F')
        expect(normalizarColor(' 8b2e83 ')).toBe('#8B2E83')
        expect(normalizarColor('morado')).toBeNull()
        expect(normalizarColor(null)).toBeNull()
    })

    it('sin color guardado o con basura manda el de fábrica', () => {
        expect(combinarColor(null)).toBe(COLOR_ACENTO_POR_DEFECTO)
        expect(combinarColor('no es un color')).toBe(COLOR_ACENTO_POR_DEFECTO)
        expect(combinarColor('#0f6e4f')).toBe('#0F6E4F')
    })
})

describe('combinarEstiloFirma', () => {
    it('un perfil sin configurar recibe el estilo de fábrica', () => {
        expect(combinarEstiloFirma(null)).toEqual(ESTILO_FIRMA_POR_DEFECTO)
        expect(combinarEstiloFirma(undefined)).toEqual(ESTILO_FIRMA_POR_DEFECTO)
    })

    it('lo guardado manda sobre los valores de fábrica', () => {
        const estilo = combinarEstiloFirma({ fuente: 'cursiva', linea_firma: true })

        expect(estilo.fuente).toBe('cursiva')
        expect(estilo.linea_firma).toBe(true)
        expect(estilo.tamano).toBe(ESTILO_FIRMA_POR_DEFECTO.tamano)
    })

    it('no devuelve el mismo objeto: tocar el estilo no muta los de fábrica', () => {
        const estilo = combinarEstiloFirma(null)
        estilo.negritas = false

        expect(ESTILO_FIRMA_POR_DEFECTO.negritas).toBe(true)
    })

    it('descarta lo que no se entiende en vez de pintarlo', () => {
        const estilo = combinarEstiloFirma({
            fuente: 'comic-sans' as never,
            tamano: 'grande' as never,
            negritas: 1 as never,
            color: 'morado',
        })

        expect(estilo.fuente).toBe(ESTILO_FIRMA_POR_DEFECTO.fuente)
        expect(estilo.tamano).toBe(ESTILO_FIRMA_POR_DEFECTO.tamano)
        expect(estilo.negritas).toBe(ESTILO_FIRMA_POR_DEFECTO.negritas)
        expect(estilo.color).toBeNull()
    })

    it('deja el tamaño dentro de lo que se puede imprimir', () => {
        expect(combinarEstiloFirma({ tamano: 400 }).tamano).toBe(TAMANO_FIRMA_MAX)
        expect(combinarEstiloFirma({ tamano: 1 }).tamano).toBe(TAMANO_FIRMA_MIN)
        expect(combinarEstiloFirma({ tamano: 18 }).tamano).toBe(18)
    })
})

describe('los grupos de la pantalla', () => {
    it('cubren todos los interruptores que entiende el servidor, sin repetir', () => {
        const claves = GRUPOS_RECETA.flatMap((g) => g.opciones.map((o) => o.clave))
        const esperadas = Object.keys(AJUSTES_RECETA_POR_DEFECTO) as ClaveAjusteReceta[]

        expect([...claves].sort()).toEqual([...esperadas].sort())
    })

    it('avisa de lo que es obligatorio en una receta antes de dejarlo apagar', () => {
        const opciones = GRUPOS_RECETA.flatMap((g) => g.opciones)
        const cedula = opciones.find((o) => o.clave === 'mostrar_cedula_profesional')
        const alergias = opciones.find((o) => o.clave === 'mostrar_alergias')

        expect(cedula?.aviso).toMatch(/Reglamento de Insumos para la Salud/)
        expect(alergias?.aviso).toBeTruthy()
    })
})
