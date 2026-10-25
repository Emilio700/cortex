/**
 * El pie de créditos junta varias fuentes y dice de cada una su texto de
 * atribución tal cual: es lo que la licencia pide al mostrar el modelo.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CREDITOS_BASE, combinarCreditos, leerCredito, lineaDeCredito, type Credito } from '../dominio/creditos'
import PieCreditos from './PieCreditos'

const BODYPARTS3D: Credito = {
  id: 'bodyparts3d',
  titulo: 'BodyParts3D',
  autor: 'The Database Center for Life Science (DBCLS)',
  version: '4.0',
  licencia: 'CC BY 4.0',
  urlLicencia: 'https://creativecommons.org/licenses/by/4.0/',
  texto: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
  url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
  cambios: 'Cortex eligió, suavizó, simplificó y convirtió las mallas a GLB.',
}
const VOLVIEW: Credito = {
  id: 'volview',
  titulo: 'VolView',
  autor: 'Kitware',
  licencia: 'Apache-2.0',
  texto: 'Copyright Kitware, Inc. Licensed under the Apache License, Version 2.0.',
}

describe('pie de créditos', () => {
  it('es un renglón discreto con todas las fuentes activas, plegado al abrir', () => {
    render(<PieCreditos creditos={combinarCreditos(CREDITOS_BASE, [BODYPARTS3D, VOLVIEW])} />)
    const boton = screen.getByRole('button', { name: /Créditos/ })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(boton).toHaveTextContent('three.js (MIT) · BodyParts3D (CC BY 4.0) · VolView (Apache-2.0)')
    expect(screen.queryByText(BODYPARTS3D.texto)).not.toBeInTheDocument()
  })

  it('al desplegarse muestra el texto exacto de cada licencia, sus enlaces y los cambios', async () => {
    render(<PieCreditos creditos={combinarCreditos(CREDITOS_BASE, [BODYPARTS3D, VOLVIEW])} />)
    await userEvent.click(screen.getByRole('button', { name: /Créditos/ }))
    expect(screen.getByRole('button', { name: /Créditos/ })).toHaveAttribute('aria-expanded', 'true')
    const atribucion = screen.getByRole('link', { name: BODYPARTS3D.texto })
    expect(atribucion).toHaveAttribute('href', BODYPARTS3D.url)
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', BODYPARTS3D.urlLicencia)
    expect(screen.getByText(/Cambios: Cortex eligió/)).toBeInTheDocument()
    expect(screen.getByText(VOLVIEW.texto)).toBeInTheDocument()
    expect(screen.getByText(CREDITOS_BASE[0].texto)).toBeInTheDocument()
  })

  it('sin fuentes no pinta nada', () => {
    const { container } = render(<PieCreditos creditos={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('créditos', () => {
  it('se juntan sin repetir, en orden de llegada', () => {
    const c = combinarCreditos(CREDITOS_BASE, [BODYPARTS3D], null, [BODYPARTS3D, VOLVIEW])
    expect(c.map((x) => x.id)).toEqual(['threejs', 'bodyparts3d', 'volview'])
  })

  it('un CREDITOS.json sin título, licencia o texto de atribución no se acepta', () => {
    expect(leerCredito({ ...BODYPARTS3D })).toMatchObject({ id: 'bodyparts3d', texto: BODYPARTS3D.texto })
    expect(leerCredito({ ...BODYPARTS3D, texto: '' })).toBeNull()
    expect(leerCredito({ ...BODYPARTS3D, licencia: undefined })).toBeNull()
    expect(leerCredito('texto')).toBeNull()
  })

  it('la línea de la captura lleva la licencia', () => {
    expect(lineaDeCredito(BODYPARTS3D)).toBe(`${BODYPARTS3D.texto} (CC BY 4.0)`)
    expect(lineaDeCredito(CREDITOS_BASE[0])).toBe(CREDITOS_BASE[0].texto)
  })
})
