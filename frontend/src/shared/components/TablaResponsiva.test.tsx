import { render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react-pro'

import TablaResponsiva from './TablaResponsiva'

const Tabla = ({ filas }: { filas: string[] }) => (
  <TablaResponsiva responsive>
    <CTableHead>
      <CTableRow>
        <CTableHeaderCell>Nombre</CTableHeaderCell>
        <CTableHeaderCell>Teléfono</CTableHeaderCell>
        <CTableHeaderCell data-tarjeta="ocultar">Sucursal</CTableHeaderCell>
        <CTableHeaderCell>Acciones</CTableHeaderCell>
      </CTableRow>
    </CTableHead>
    <CTableBody>
      {filas.length === 0 ? (
        <CTableRow>
          <CTableDataCell colSpan={4}>No hay pacientes</CTableDataCell>
        </CTableRow>
      ) : (
        filas.map((nombre) => (
          <CTableRow key={nombre}>
            <CTableDataCell>{nombre}</CTableDataCell>
            <CTableDataCell>669 000</CTableDataCell>
            <CTableDataCell>Centro</CTableDataCell>
            <CTableDataCell>
              <button type="button">Editar</button>
              <button type="button" title="Ver citas">
                <svg aria-hidden="true" />
              </button>
            </CTableDataCell>
          </CTableRow>
        ))
      )}
    </CTableBody>
  </TablaResponsiva>
)

describe('TablaResponsiva (plan 29, T-3)', () => {
  it('cada celda lleva el nombre y el papel de su columna', () => {
    render(<Tabla filas={['ANA LÓPEZ']} />)

    expect(screen.getByRole('table')).toHaveClass('tabla-tarjetas')
    const nombre = screen.getByText('ANA LÓPEZ').closest('td')!
    expect(nombre.dataset.tarjeta).toBe('titulo')
    const telefono = screen.getByText('669 000').closest('td')!
    expect(telefono.dataset.etiqueta).toBe('Teléfono')
    expect(telefono.dataset.tarjeta).toBe('dato')
    expect(screen.getByText('Centro').closest('td')!.dataset.tarjeta).toBe('ocultar')
    expect(screen.getByRole('button', { name: 'Editar' }).closest('td')!.dataset.tarjeta).toBe('acciones')
  })

  it('los botones de solo ícono se marcan para mostrar su texto en la tarjeta', () => {
    render(<Tabla filas={['ANA LÓPEZ']} />)
    expect(screen.getByTitle('Ver citas').dataset.soloIcono).toBe('')
    expect(screen.getByRole('button', { name: 'Editar' }).dataset.soloIcono).toBeUndefined()
  })

  it('el renglón de mensaje (vacío) no se trata como registro', () => {
    render(<Tabla filas={[]} />)
    expect(screen.getByText('No hay pacientes').closest('td')!.dataset.tarjeta).toBe('mensaje')
  })

  it('vuelve a etiquetar cuando cambian los renglones', async () => {
    const ConCambio = () => {
      const [filas, setFilas] = useState<string[]>([])
      return (
        <>
          <button type="button" onClick={() => setFilas(['EVA RUIZ'])}>
            cargar
          </button>
          <Tabla filas={filas} />
        </>
      )
    }
    render(<ConCambio />)
    screen.getByRole('button', { name: 'cargar' }).click()

    await waitFor(() => expect(screen.getByText('669 000').closest('td')!.dataset.etiqueta).toBe('Teléfono'))
  })
})
