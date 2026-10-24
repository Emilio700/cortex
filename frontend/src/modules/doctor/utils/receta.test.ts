import { describe, it, expect } from 'vitest'
import {
    agregarIndicacion,
    etiquetaFrecuente,
    filtrarMedicamentos,
    medicamentoCompleto,
    medicamentoVacio,
    normalizarTexto,
    resumenMedicamento,
    type MedicamentoFrecuente,
} from './receta'

const vademecario: MedicamentoFrecuente[] = [
    { id: 1, nombre: 'ASPIRINA PROTEC', presentacion: 'Tabletas', detalle: null, veces_recetado: 4310 },
    { id: 2, nombre: 'ELEVIT', presentacion: 'Tabletas', detalle: null, veces_recetado: 3892 },
    { id: 3, nombre: 'CITRACAL D', presentacion: 'Tabletas', detalle: null, veces_recetado: 2566 },
    { id: 4, nombre: 'CITRACAL PETITES', presentacion: 'Tabletas', detalle: null, veces_recetado: 900 },
    { id: 5, nombre: 'MADECASSOL C', presentacion: 'Ovulos', detalle: 'CAJA', veces_recetado: 700 },
    { id: 6, nombre: 'FOLIVITAL', presentacion: 'Tabletas', detalle: '4 MG', veces_recetado: 1528 },
]

describe('resumenMedicamento', () => {
    it('arma la linea legible completa', () => {
        expect(
            resumenMedicamento({
                name: 'PARACETAMOL Tabletas',
                dosage: '500 mg',
                frequency: 'cada 8 h',
                duration: '5 dias',
            }),
        ).toBe('PARACETAMOL Tabletas 500 mg — cada 8 h por 5 dias')
    })

    it('omite lo que no se capturo', () => {
        expect(
            resumenMedicamento({ name: 'ELEVIT', dosage: '1 tableta', frequency: '', duration: '' }),
        ).toBe('ELEVIT 1 tableta')
    })

    it('incluye el momento de toma cuando existe', () => {
        expect(
            resumenMedicamento({
                name: 'ELEVIT',
                dosage: '1 tableta',
                frequency: 'Cada 24 h',
                duration: '',
                intake_time: 'en ayunas',
            }),
        ).toBe('ELEVIT 1 tableta — Cada 24 h en ayunas')
    })

    it('agrega la via antes de la frecuencia', () => {
        expect(
            resumenMedicamento({
                name: 'GYNOTRAN',
                dosage: '1 ovulo',
                frequency: 'Cada 24 h',
                duration: '7 dias',
                route: 'Via vaginal',
            }),
        ).toBe('GYNOTRAN 1 ovulo — Via vaginal Cada 24 h por 7 dias')
    })

    it('dice cuanto surtir cuando se capturo', () => {
        expect(
            resumenMedicamento({
                name: 'PARACETAMOL',
                dosage: '500 mg',
                frequency: 'Cada 8 h',
                duration: '5 dias',
                quantity: '15 tabletas',
            }),
        ).toBe('PARACETAMOL 500 mg — Cada 8 h por 5 dias · surtir 15 tabletas')
    })

    it('pone la presentacion en su lugar, junto al nombre', () => {
        expect(
            resumenMedicamento({
                name: 'ELEVIT',
                dosage: '1 tableta',
                frequency: 'Cada 24 h',
                duration: '',
                presentation: 'Tabletas',
            }),
        ).toBe('ELEVIT Tabletas 1 tableta — Cada 24 h')
    })
})

describe('medicamentoVacio', () => {
    it('arranca con todos los campos que se capturan', () => {
        const vacio = medicamentoVacio()

        expect(Object.values(vacio).every((valor) => valor === '')).toBe(true)
        expect(Object.keys(vacio)).toEqual(
            expect.arrayContaining(['presentation', 'route', 'quantity', 'notes']),
        )
    })
})

describe('filtrarMedicamentos', () => {
    it('sin texto no sugiere nada', () => {
        expect(filtrarMedicamentos(vademecario, '  ')).toEqual([])
    })

    it('encuentra por coincidencia parcial sin importar mayusculas', () => {
        expect(filtrarMedicamentos(vademecario, 'elev').map((m) => m.nombre)).toEqual(['ELEVIT'])
    })

    it('ignora los acentos del texto tecleado', () => {
        expect(filtrarMedicamentos(vademecario, 'óvulos').map((m) => m.id)).toEqual([5])
    })

    it('ordena las coincidencias por veces recetado', () => {
        expect(filtrarMedicamentos(vademecario, 'citracal').map((m) => m.nombre)).toEqual([
            'CITRACAL D',
            'CITRACAL PETITES',
        ])
    })

    it('busca tambien en el detalle', () => {
        expect(filtrarMedicamentos(vademecario, '4 mg').map((m) => m.nombre)).toEqual(['FOLIVITAL'])
    })

    it('respeta el limite de sugerencias', () => {
        expect(filtrarMedicamentos(vademecario, 'tabletas', 2)).toHaveLength(2)
    })
})

describe('normalizarTexto', () => {
    it('quita acentos y pasa a minusculas', () => {
        expect(normalizarTexto('ÓVULOS ')).toBe('ovulos')
    })
})

describe('etiquetaFrecuente', () => {
    it('incluye presentacion y detalle', () => {
        expect(etiquetaFrecuente(vademecario[5])).toBe('FOLIVITAL · Tabletas · 4 MG')
    })
})

describe('medicamentoCompleto', () => {
    it('exige nombre, dosis y frecuencia', () => {
        expect(
            medicamentoCompleto({ name: 'ELEVIT', dosage: '1 tableta', frequency: 'Cada 24 h', duration: '' }),
        ).toBe(true)
        expect(
            medicamentoCompleto({ name: 'ELEVIT', dosage: '', frequency: 'Cada 24 h', duration: '' }),
        ).toBe(false)
    })
})

describe('agregarIndicacion', () => {
    it('agrega la sugerencia al texto existente', () => {
        expect(agregarIndicacion('Reposo', 'Evitar alcohol')).toBe('Reposo. Evitar alcohol')
    })

    it('no duplica una sugerencia ya presente', () => {
        expect(agregarIndicacion('Evitar alcohol', 'Evitar alcohol')).toBe('Evitar alcohol')
    })

    it('no se pasa del limite de caracteres', () => {
        const largo = 'a'.repeat(195)
        expect(agregarIndicacion(largo, 'Evitar alcohol', 200)).toBe(largo)
    })
})
