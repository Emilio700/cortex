/**
 * El encabezado único de cada pantalla (plan 32, punto 2).
 *
 * Al quitar las migas, el `<h1>` de este componente es el único nombre de la
 * página para el lector de pantalla, y el enlace «← Padre» la única manera de
 * volver que daban las migas. Lo que se fija aquí es eso.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { cilShieldAlt } from '@coreui/icons'

import { EncabezadoPantalla } from './EncabezadoPantalla'
import routes from '../../routes'

describe('EncabezadoPantalla', () => {
  it('el título es el único <h1> de la página, con su descripción', () => {
    render(
      <MemoryRouter>
        <EncabezadoPantalla titulo="Gestión de Permisos" descripcion="Permisos por usuario" icono={cilShieldAlt} />
      </MemoryRouter>,
    )
    const titulos = screen.getAllByRole('heading', { level: 1 })
    expect(titulos).toHaveLength(1)
    expect(titulos[0]).toHaveTextContent('Gestión de Permisos')
    expect(screen.getByText('Permisos por usuario')).toBeInTheDocument()
  })

  it('una pantalla hija enlaza a su padre y el enlace lleva ahí', async () => {
    render(
      <MemoryRouter initialEntries={['/master/permisos']}>
        <Routes>
          <Route
            path="/master/permisos"
            element={
              <EncabezadoPantalla
                titulo="Gestión de Permisos"
                padre={{ nombre: 'Panel de Desarrollador', ruta: '/master' }}
              />
            }
          />
          <Route path="/master" element={<p>Panel</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Panel de Desarrollador' }))
    expect(screen.getByText('Panel')).toBeInTheDocument()
  })

  it('sin padre no pinta enlace de regreso', () => {
    render(
      <MemoryRouter>
        <EncabezadoPantalla titulo="Agenda" acciones={<button type="button">Nueva Cita</button>} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nueva Cita' })).toBeInTheDocument()
  })

  it('respeta el margen que trae la pantalla en vez de sumarle mb-4', () => {
    const { container } = render(
      <MemoryRouter>
        <EncabezadoPantalla titulo="Expediente clínico" className="mb-3" />
      </MemoryRouter>,
    )
    const encabezado = container.querySelector('header')!
    expect(encabezado).toHaveClass('mb-3')
    expect(encabezado).not.toHaveClass('mb-4')
  })
})

// Inventario (plan 32, punto 2): ninguna pantalla queda sin título. Las que
// no usan el componente tienen su propio <h1> a propósito y están anotadas.
const paginas = import.meta.glob<string>('/src/modules/**/pages/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const CON_H1_PROPIO: Record<string, string> = {
  // El saludo del día es la identidad del inicio de la doctora (plan 28).
  DoctorDashboard: 'EncabezadoDelDia',
  // La consulta lleva sus secciones dentro de la misma tarjeta del encabezado.
  ConsultationPage: '<h1',
}

describe('inventario de encabezados', () => {
  const fuenteDe = (nombre: string) =>
    Object.entries(paginas).find(([ruta]) => ruta.endsWith(`/${nombre}.tsx`))?.[1]

  const conPantalla = routes.filter((r) => r.element)
  // El nombre del componente se lee del import perezoso de routes.tsx.
  const fuenteDeRutas = import.meta.glob<string>('/src/routes.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  })['/src/routes.tsx']
  const nombres = [...fuenteDeRutas.matchAll(/import\('\.\/modules\/[^']*\/pages\/(\w+)'\)/g)].map((m) => m[1])

  it('routes.tsx declara pantallas y todas se encuentran', () => {
    expect(conPantalla.length).toBeGreaterThan(20)
    for (const nombre of nombres) expect(fuenteDe(nombre), nombre).toBeTruthy()
  })

  it.each(nombres)('%s tiene un solo encabezado con su <h1>', (nombre) => {
    const fuente = fuenteDe(nombre)!
    const propio = CON_H1_PROPIO[nombre]
    if (propio) {
      expect(fuente).toContain(propio)
    } else {
      expect(fuente).toContain('<EncabezadoPantalla')
      // Ni la banda vieja ni un <h1> suelto al lado del componente.
      expect(fuente).not.toMatch(/className="hero-banner/)
      // (al inicio del renglón: los comentarios sí pueden nombrar el `<h1>`).
      expect(fuente).not.toMatch(/^\s*<h1[\s>]/m)
    }
  })
})
