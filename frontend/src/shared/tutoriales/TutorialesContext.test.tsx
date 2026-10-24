import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { Role } from '../types'
import type { Recorrido, RecorridoCompleto } from './tipos'
import { TutorialesProvider } from './TutorialesContext'
import BotonAyuda from './BotonAyuda'
import BotonAyudaContextual from './BotonAyudaContextual'
import FranjaAyuda from './FranjaAyuda'
import {
  _limpiarMemoriaParaPruebas,
  guardarProgreso,
  leerProgreso,
  marcarVisto,
  yaLoVio,
} from './almacen'
import { VIGILANCIA_MS, cargarMotor, detenerRecorrido, iniciarRecorrido } from './motor'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const sesion = (role: Role, permissions: string[] = []) => ({
  user: { id: 42, role, full_name: 'Prueba' },
  permissions,
  loading: false,
})

const recorridoAgenda: Recorrido = {
  id: 'agenda-prueba',
  version: 1,
  titulo: 'La agenda',
  resumen: 'Ver citas',
  grupo: 'Recepción',
  ruta: '/secretaria/agenda',
  requiere: ['appointments.read'],
  roles: [Role.SECRETARIA],
  pasos: [
    { elemento: 'no-existe-todavia', titulo: 'Paso fantasma', texto: 'Señala algo que no está' },
    { elemento: 'boton-nueva', titulo: 'Nueva cita', texto: 'Aquí se agenda' },
    { titulo: 'Fin', texto: 'Listo' },
  ],
}

const recorridoConsulta: Recorrido = {
  id: 'consulta-prueba',
  version: 1,
  titulo: 'La consulta',
  resumen: 'Atender',
  grupo: 'Consulta médica',
  ruta: '/doctor/consultation/:appointmentId',
  requiere: ['doctor.appointments.read'],
  roles: [Role.DOCTOR],
  comoLlegar: 'Ábrela desde Mis consultas.',
  irA: { ruta: '/doctor/appointments', nombre: 'Mis consultas' },
  pasos: [{ elemento: 'nota', titulo: 'La nota', texto: 'Aquí se escribe la nota' }],
}

const recorridoAdmin: Recorrido = {
  ...recorridoAgenda,
  id: 'usuarios-prueba',
  titulo: 'Usuarios',
  ruta: '/admin/usuarios',
  requiere: ['users.read'],
  roles: [Role.ADMIN],
  grupo: 'Administración',
}

const recorridoPacientes: Recorrido = {
  ...recorridoAgenda,
  id: 'pacientes-prueba',
  titulo: 'Los pacientes',
  ruta: '/secretaria/pacientes',
}

const recorridoFormulario: Recorrido = {
  id: 'formulario-prueba',
  version: 1,
  titulo: 'Agendar una cita',
  resumen: 'El formulario',
  grupo: 'Recepción',
  ruta: '/secretaria/agenda',
  requiere: ['appointments.read'],
  roles: [Role.SECRETARIA],
  contexto: 'cita-modal',
  comoLlegar: 'Pulsa Nueva cita y luego ¿Cómo se llena?.',
  pasos: [{ elemento: 'cita-paciente', titulo: 'Paciente', texto: 'Busca al paciente' }],
}

const bienvenida: Recorrido = {
  id: 'bienvenida-prueba',
  version: 1,
  titulo: 'Bienvenida',
  resumen: 'Cómo moverse',
  grupo: 'General',
  roles: [Role.SECRETARIA],
  pasos: [
    { titulo: 'Hola', texto: 'Te damos la bienvenida' },
    { elemento: 'boton-nueva', titulo: 'Nueva cita', texto: 'Aquí se agenda' },
    { titulo: 'Fin', texto: 'Listo' },
  ],
}

const tablero: Recorrido = {
  id: 'tablero-prueba',
  version: 1,
  titulo: 'Tu día',
  resumen: 'El tablero',
  grupo: 'Consulta médica',
  ruta: '/doctor/dashboard',
  requiere: ['doctor.dashboard.read'],
  roles: [Role.DOCTOR],
  pasos: [
    { elemento: 'tablero', titulo: 'Tus citas', texto: 'Las citas de hoy' },
    { titulo: 'Fin del tablero', texto: 'Eso es el tablero' },
  ],
}

const misCobros: Recorrido = {
  id: 'cobros-prueba',
  version: 1,
  titulo: 'Mis cobros',
  resumen: 'Lo cobrado',
  grupo: 'Cobros',
  ruta: '/finanzas/pagos',
  // Sin respaldo por rol: así la prueba de permisos puede quitárselo.
  requiere: ['payments.read'],
  pasos: [
    { elemento: 'cobros', titulo: 'Tus cobros', texto: 'Lo que cobraste' },
    { titulo: 'Fin de cobros', texto: 'Eso es todo' },
  ],
}

const completoDoctora: RecorridoCompleto = {
  id: 'completo-prueba',
  version: 1,
  titulo: 'Recorrido completo de prueba',
  resumen: 'Todo el día.',
  roles: [Role.DOCTOR],
  etapas: [
    { recorridoId: 'tablero-prueba', nombre: 'Agenda del día' },
    { recorridoId: 'consulta-prueba', nombre: 'Consulta' },
    { recorridoId: 'cobros-prueba', nombre: 'Mis cobros' },
  ],
}

const PERMISOS_DOCTORA = ['doctor.dashboard.read', 'doctor.appointments.read', 'payments.read']

const catalogo = [recorridoAgenda, recorridoConsulta, recorridoAdmin]

/** Una pantalla de mentiras que pinta anclas distintas según la ruta. */
const Pantalla = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <>
      {pathname === '/secretaria/agenda' && <button data-tour="boton-nueva">Nueva cita</button>}
      {pathname === '/doctor/dashboard' && <div data-tour="tablero">Tablero</div>}
      {pathname === '/finanzas/pagos' && <div data-tour="cobros">Cobros</div>}
      {pathname.startsWith('/doctor/consultation') && <div data-tour="nota">Nota</div>}
      <button type="button" onClick={() => navigate('/secretaria/pacientes')}>
        Ir a pacientes
      </button>
      <output data-testid="ruta">{pathname}</output>
    </>
  )
}

const arbol = (
  ruta: string,
  cat: Recorrido[],
  completos: RecorridoCompleto[],
  extra?: React.ReactNode,
) => (
  <MemoryRouter initialEntries={[ruta]}>
    <TutorialesProvider catalogo={cat} completos={completos}>
      <FranjaAyuda />
      <BotonAyuda />
      <Pantalla />
      {extra}
    </TutorialesProvider>
  </MemoryRouter>
)

const montar = (
  ruta: string,
  cat: Recorrido[] = catalogo,
  completos: RecorridoCompleto[] = [],
  extra?: React.ReactNode,
) => render(arbol(ruta, cat, completos, extra))

const popover = () => document.querySelector('.driver-popover')
const siguiente = () =>
  act(() => {
    fireEvent.click(document.querySelector('.driver-popover-next-btn')!)
  })
const escape = () =>
  act(() => {
    fireEvent.keyDown(document.body, { key: 'Escape' })
  })
const esperar = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}
/**
 * Abre el centro desde el «?». Es asíncrona porque el centro entra con
 * `React.lazy`: hay que asegurar su import() y dejar que se pinte.
 */
const abrirCentro = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Ayuda y tutoriales' }))
  await act(async () => {
    await import('./CentroAyuda')
  })
}
/** La pantalla quedó usable: sin fondo oscurecido ni clases que bloqueen el clic. */
const pantallaLibre = () => {
  expect(popover()).toBeNull()
  expect(document.querySelector('.driver-overlay')).toBeNull()
  expect(document.body.classList.contains('driver-active')).toBe(false)
}

const AVISO = '¿Dudas? Aquí encuentras guías de cada pantalla.'

beforeAll(async () => {
  // jsdom no implementa el desplazamiento; driver.js lo usa para llevar el paso a la vista.
  Element.prototype.scrollIntoView = vi.fn()
  // El motor se carga diferido en la aplicación (import()); las pruebas de
  // aquí abajo lo llaman de forma sincrónica, así que se trae una vez.
  await cargarMotor()
  // El centro también entra con React.lazy. La primera prueba que lo abría
  // («el aviso se descarta con Entendido») pagaba la transformación en frío
  // del módulo dentro de sus 5 s, y con la máquina cargada se pasaba del
  // tiempo. Se trae aquí, con holgura, y cada prueba lo encuentra listo.
  await import('./CentroAyuda')
}, 60000)

beforeEach(() => {
  _limpiarMemoriaParaPruebas()
  localStorage.clear()
  mockUseAuth.mockReset()
})

afterEach(() => {
  act(() => detenerRecorrido())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('motor de recorridos', () => {
  it('salta el paso cuyo elemento no existe y muestra los botones en español', () => {
    document.body.innerHTML = '<button data-tour="boton-nueva">Nueva</button>'
    let arrancó = false
    expect(() => {
      arrancó = iniciarRecorrido(recorridoAgenda)
    }).not.toThrow()
    expect(arrancó).toBe(true)
    expect(popover()?.textContent).toContain('Nueva cita')
    expect(popover()?.textContent).not.toContain('Paso fantasma')
    expect(popover()?.textContent).toContain('Siguiente')
  })

  it('no arranca (y lo dice) si ninguno de sus pasos está en pantalla', () => {
    document.body.innerHTML = ''
    const soloConElementos: Recorrido = {
      ...recorridoAgenda,
      pasos: [{ elemento: 'nada', titulo: 'X', texto: 'x' }],
    }
    expect(iniciarRecorrido(soloConElementos)).toBe(false)
    pantallaLibre()
  })

  it('Escape cierra el recorrido sin llegar al modal de abajo', () => {
    document.body.innerHTML = '<button data-tour="boton-nueva">Nueva</button>'
    const alCerrar = vi.fn()
    const escuchaDelModal = vi.fn()
    window.addEventListener('keydown', escuchaDelModal)
    iniciarRecorrido(recorridoAgenda, { alCerrar })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(escuchaDelModal).not.toHaveBeenCalled()
    expect(alCerrar).toHaveBeenCalledWith(false, 'cerrado')
    pantallaLibre()
    window.removeEventListener('keydown', escuchaDelModal)
  })

  it('llegar al final cuenta como completo', () => {
    document.body.innerHTML = '<button data-tour="boton-nueva">Nueva</button>'
    const alCerrar = vi.fn()
    iniciarRecorrido(recorridoAgenda, { alCerrar })
    fireEvent.click(document.querySelector('.driver-popover-next-btn')!)
    fireEvent.click(document.querySelector('.driver-popover-next-btn')!)
    expect(alCerrar).toHaveBeenCalledWith(true, 'terminado')
    pantallaLibre()
  })

  it('cerrarlo con la ✕ ya en el último paso también cuenta como completo', () => {
    document.body.innerHTML = '<button data-tour="boton-nueva">Nueva</button>'
    const alCerrar = vi.fn()
    iniciarRecorrido(recorridoAgenda, { alCerrar })
    fireEvent.click(document.querySelector('.driver-popover-next-btn')!)
    expect(popover()?.textContent).toContain('Listo')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(alCerrar).toHaveBeenCalledWith(true, 'terminado')
  })

  it('avisa cada paso que muestra con su número entre los declarados', () => {
    document.body.innerHTML = '<button data-tour="boton-nueva">Nueva</button>'
    const alMostrarPaso = vi.fn()
    iniciarRecorrido(recorridoAgenda, { alMostrarPaso })
    // El paso 0 (fantasma) no está: el primero que se ve es el 1, y el globo
    // dice "1 de 2" porque cuenta sólo los que están.
    expect(alMostrarPaso).toHaveBeenLastCalledWith(1, { posicion: 1, total: 2 })
    fireEvent.click(document.querySelector('.driver-popover-next-btn')!)
    expect(alMostrarPaso).toHaveBeenLastCalledWith(2, { posicion: 2, total: 2 })
  })

  it('continúa desde el paso guardado, y si ya no está, desde el siguiente que sí', () => {
    const tres: Recorrido = {
      ...recorridoAgenda,
      pasos: [
        { elemento: 'a', titulo: 'Paso A', texto: 'a' },
        { elemento: 'b', titulo: 'Paso B', texto: 'b' },
        { elemento: 'c', titulo: 'Paso C', texto: 'c' },
      ],
    }
    document.body.innerHTML = '<i data-tour="a">a</i><i data-tour="b">b</i><i data-tour="c">c</i>'
    iniciarRecorrido(tres, { desdePaso: 1 })
    expect(popover()?.textContent).toContain('Paso B')
    act(() => detenerRecorrido())

    document.body.innerHTML = '<i data-tour="a">a</i><i data-tour="c">c</i>'
    iniciarRecorrido(tres, { desdePaso: 1 })
    expect(popover()?.textContent).toContain('Paso C')
  })
})

describe('robustez del motor', () => {
  const tres: Recorrido = {
    ...recorridoAgenda,
    pasos: [
      { elemento: 'a', titulo: 'Paso A', texto: 'a' },
      { elemento: 'b', titulo: 'Paso B', texto: 'b' },
      { titulo: 'Cierre', texto: 'Tarjeta sin elemento' },
    ],
  }

  it('si lo que señala desaparece, pasa al siguiente paso que sí esté', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<i data-tour="a">a</i><i data-tour="b">b</i>'
    iniciarRecorrido(tres)
    expect(popover()?.textContent).toContain('Paso A')
    document.querySelector('[data-tour="a"]')!.remove()
    // La revisión lo detecta y driver.js anima el cambio de paso.
    await esperar(VIGILANCIA_MS + 600)
    expect(popover()?.textContent).toContain('Paso B')
  })

  it('si ya no queda nada que señalar, se cierra solo, guarda el avance y no deja la pantalla oscura', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<i data-tour="a">a</i><i data-tour="b">b</i>'
    const alCerrar = vi.fn()
    iniciarRecorrido(tres, { alCerrar })
    // Se recarga la lista, o se cierra la sección: todo lo señalado se va.
    document.body.innerHTML = '<p>otra cosa</p>'
    await esperar(VIGILANCIA_MS + 50)
    expect(alCerrar).toHaveBeenCalledWith(false, 'desaparecio')
    pantallaLibre()
  })

  it('si el formulario que explica se cierra, el recorrido se cierra con él', async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div class="modal" data-tour="cita-modal"><i data-tour="cita-paciente">p</i></div>'
    const alCerrar = vi.fn()
    iniciarRecorrido(recorridoFormulario, { alCerrar })
    expect(popover()).not.toBeNull()
    document.querySelector('[data-tour="cita-modal"]')!.remove()
    await esperar(VIGILANCIA_MS + 50)
    expect(alCerrar).toHaveBeenCalledWith(false, 'desaparecio')
    pantallaLibre()
  })

  it('un error interno cierra el recorrido y la pantalla queda usable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    document.body.innerHTML = '<button data-tour="boton-nueva">Nueva</button>'
    const clic = vi.fn()
    document.querySelector('button')!.addEventListener('click', clic)
    const alCerrar = vi.fn()
    let arrancó = true
    expect(() => {
      arrancó = iniciarRecorrido(recorridoAgenda, {
        alCerrar,
        alMostrarPaso: () => {
          throw new Error('falla a propósito')
        },
      })
    }).not.toThrow()
    expect(arrancó).toBe(false)
    expect(alCerrar).toHaveBeenCalledWith(false, 'error')
    pantallaLibre()
    fireEvent.click(document.querySelector('button')!)
    expect(clic).toHaveBeenCalled()
  })

  it('un recorrido mal escrito no truena: no arranca y no deja restos', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const roto = { ...recorridoAgenda, pasos: null } as unknown as Recorrido
    expect(() => iniciarRecorrido(roto)).not.toThrow()
    pantallaLibre()
  })
})

describe('nada arranca solo', () => {
  it('ni la bienvenida ni el de la pantalla, por más tiempo que pase', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda', [bienvenida, recorridoAgenda])
    await esperar(30000)
    expect(popover()).toBeNull()
    expect(screen.queryByText(/Primera vez/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Seguimos/)).not.toBeInTheDocument()
  })

  it('tampoco uno dejado a medias: se ofrece continuar sólo en el centro de ayuda', async () => {
    vi.useFakeTimers()
    guardarProgreso(42, 'agenda-prueba', 1, 1)
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda')
    await esperar(30000)
    expect(popover()).toBeNull()
  })

  it('el aviso de la primera vez aparece una sola vez y no abre nada', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    const vista = montar('/secretaria/agenda')
    expect(screen.getByText(AVISO)).toBeInTheDocument()
    await esperar(30000)
    expect(popover()).toBeNull()
    expect(screen.getByText(AVISO)).toBeInTheDocument()
    vista.unmount()

    // Otra vez en el sistema (recargó la página): ya no se muestra.
    montar('/secretaria/agenda')
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })

  it('el aviso se descarta con «Entendido» y lleva a la ayuda sólo si se pide', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    const vista = montar('/secretaria/agenda')
    fireEvent.click(screen.getByRole('button', { name: 'Entendido: cerrar el aviso de ayuda' }))
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
    vista.unmount()

    localStorage.clear()
    _limpiarMemoriaParaPruebas()
    montar('/secretaria/agenda')
    fireEvent.click(screen.getByRole('button', { name: 'Ver la ayuda' }))
    // El centro entra con React.lazy: hay que asegurar su import() y dejarlo pintar.
    await act(async () => {
      await import('./CentroAyuda')
    })
    expect(screen.getByText('Esta pantalla')).toBeInTheDocument()
    expect(popover()).toBeNull()
  })

  it('quien ya conocía GEMS ve una vez «GEMS se actualizó», y las novedades sólo si las pide', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    // Ya había visto el aviso de la primera vez en una versión anterior.
    localStorage.setItem('gems.tutoriales.aviso.42', '1')
    const vista = montar('/secretaria/agenda')
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
    expect(screen.getByText(/GEMS se actualizó a la 1\.2\.0/)).toBeInTheDocument()
    await esperar(30000)
    // Nada se abrió solo.
    expect(popover()).toBeNull()
    expect(screen.queryByText('Novedades de la 1.2.0')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver las novedades' }))
    await act(async () => {
      await import('./CentroAyuda')
    })
    expect(screen.getByRole('button', { name: /Novedades de la 1\.2\.0/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Folios con formato nuevo')).toBeInTheDocument()
    vista.unmount()

    // Ya se avisó: no se repite.
    montar('/secretaria/agenda')
    expect(screen.queryByText(/GEMS se actualizó/)).not.toBeInTheDocument()
  })

  it('a quien llega por primera vez no se le dice que algo cambió', () => {
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    const vista = montar('/secretaria/agenda')
    expect(screen.getByText(AVISO)).toBeInTheDocument()
    expect(screen.queryByText(/GEMS se actualizó/)).not.toBeInTheDocument()
    vista.unmount()
    montar('/secretaria/agenda')
    expect(screen.queryByText(/GEMS se actualizó/)).not.toBeInTheDocument()
  })

  it('con localStorage bloqueado, el aviso sale y en la sesión no se repite', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    const vista = montar('/secretaria/agenda')
    expect(screen.getByText(AVISO)).toBeInTheDocument()
    vista.unmount()
    montar('/secretaria/agenda')
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })
})

describe('centro de ayuda', () => {
  it('arriba, el recorrido de esta pantalla, con un clic', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda')
    await abrirCentro()
    const seccion = screen.getByRole('region', { name: 'Esta pantalla' })
    expect(seccion.textContent).toContain('La agenda')
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver «La agenda»' })[0])
    await esperar(400)
    expect(popover()?.textContent).toContain('Aquí se agenda')
  })

  it('el índice muestra Visto, A medias (X de Y), Nuevo y el progreso general', async () => {
    vi.useFakeTimers()
    marcarVisto(42, 'agenda-prueba', 1)
    guardarProgreso(42, 'bienvenida-prueba', 1, 1)
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda', [bienvenida, recorridoAgenda, recorridoPacientes])
    await abrirCentro()
    const temas = screen.getByRole('region', { name: 'Todos los temas' })
    expect(temas.textContent).toContain('Visto')
    expect(temas.textContent).toContain('A medias (2 de 3)')
    expect(temas.textContent).toContain('Nuevo')
    expect(temas.textContent).toContain('Completaste 1 de 3')
    fireEvent.click(
      screen.getByRole('button', { name: 'Continuar «Bienvenida» en el paso 2 de 3' }),
    )
    await esperar(400)
    expect(popover()?.textContent).toContain('Aquí se agenda')
  })

  it('«Empezar de nuevo» arranca desde el primer paso, y lo visto sigue disponible', async () => {
    vi.useFakeTimers()
    marcarVisto(42, 'agenda-prueba', 1)
    guardarProgreso(42, 'bienvenida-prueba', 1, 1)
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda', [bienvenida, recorridoAgenda])
    await abrirCentro()
    expect(screen.getAllByRole('button', { name: 'Ver «La agenda»' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Empezar de nuevo «Bienvenida»' }))
    await esperar(400)
    expect(popover()?.textContent).toContain('Te damos la bienvenida')
  })

  it('sólo muestra lo que su rol y sus permisos le dejan usar', async () => {
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    const vista = montar('/secretaria/agenda')
    await abrirCentro()
    expect(screen.getAllByText('La agenda').length).toBeGreaterThan(0)
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByText('La consulta')).not.toBeInTheDocument()
    vista.unmount()

    mockUseAuth.mockReturnValue(sesion(Role.ADMIN, ['users.read']))
    montar('/admin/usuarios')
    await abrirCentro()
    expect(screen.getAllByText('Usuarios').length).toBeGreaterThan(0)
    expect(screen.queryByText('La agenda')).not.toBeInTheDocument()
  })

  it('no se pinta para quien no tiene ningún recorrido', () => {
    mockUseAuth.mockReturnValue(sesion(Role.MASTER, ['nada.que.ver']))
    montar('/secretaria/agenda')
    expect(screen.queryByRole('button', { name: 'Ayuda y tutoriales' })).not.toBeInTheDocument()
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
  })

  it('un recorrido que necesita una consulta no abre ninguna: explica cómo llegar y deja leerlo', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.DOCTOR, PERMISOS_DOCTORA))
    montar('/doctor/dashboard', [tablero, recorridoConsulta])
    await abrirCentro()
    fireEvent.click(screen.getByRole('button', { name: 'Ver «La consulta»' }))
    await esperar(400)
    expect(popover()).toBeNull()
    expect(screen.getByTestId('ruta').textContent).toBe('/doctor/dashboard')
    expect(screen.getByText('Ábrela desde Mis consultas.')).toBeInTheDocument()
    expect(screen.getByText('Aquí se escribe la nota')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ya lo leí/ }))
    expect(yaLoVio(42, 'consulta-prueba', 1)).toBe(true)
  })

  it('«Ir a…» sólo navega a la pantalla, sin arrancar nada', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.DOCTOR, PERMISOS_DOCTORA))
    montar('/doctor/dashboard', [tablero, recorridoConsulta])
    await abrirCentro()
    fireEvent.click(screen.getByRole('button', { name: 'Ver «La consulta»' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Mis consultas' }))
    await esperar(2000)
    expect(screen.getByTestId('ruta').textContent).toBe('/doctor/appointments')
    expect(popover()).toBeNull()
  })

  it('si la pantalla está en otra ruta sin datos, navega y lo arranca al cargar', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/pacientes', [recorridoAgenda])
    await abrirCentro()
    fireEvent.click(screen.getByRole('button', { name: 'Ver «La agenda»' }))
    await esperar(400)
    expect(screen.getByTestId('ruta').textContent).toBe('/secretaria/agenda')
    expect(popover()?.textContent).toContain('Aquí se agenda')
  })

  it('un error al pintar la ayuda la apaga a ella sola: la pantalla sigue funcionando', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const roto = { ...recorridoAgenda, resumen: { no: 'es texto' } } as unknown as Recorrido
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda', [roto])
    await abrirCentro()
    expect(screen.getByText(/La ayuda no está disponible en este momento/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nueva cita' })).toBeInTheDocument()
    pantallaLibre()
  })
})

describe('búsqueda', () => {
  const buscarTexto = (texto: string) =>
    fireEvent.change(screen.getByLabelText('Buscar en la ayuda'), { target: { value: texto } })

  it('encuentra un paso suelto y lleva directo a él', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda', [recorridoAgenda, recorridoPacientes])
    await abrirCentro()
    buscarTexto('agendar')
    const paso = screen.getByRole('button', { name: 'Ir al paso «Nueva cita» de «La agenda»' })
    fireEvent.click(paso)
    await esperar(400)
    expect(popover()?.textContent).toContain('Aquí se agenda')
    expect(popover()?.textContent).not.toContain('Señala algo que no está')
  })

  it('si el paso buscado no está a la vista, lo muestra para leerlo en vez de fallar', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda', [recorridoAgenda])
    await abrirCentro()
    buscarTexto('fantasma')
    fireEvent.click(
      screen.getByRole('button', { name: 'Ir al paso «Paso fantasma» de «La agenda»' }),
    )
    await esperar(400)
    expect(popover()).toBeNull()
    expect(screen.getByText(/Ese paso no está a la vista/)).toBeInTheDocument()
    const buscado = document.querySelector('[aria-current="step"]')
    expect(buscado?.textContent).toContain('Paso fantasma')
  })

  it('sólo encuentra lo que su rol puede ver, y dice cuando no hay nada', async () => {
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda')
    await abrirCentro()
    buscarTexto('nota')
    expect(screen.getByText(/No encontramos «nota»/)).toBeInTheDocument()
  })
})

describe('recorrido completo', () => {
  it('navega entre pantallas, explica la que necesita datos sin abrirla, se pausa y se retoma', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.DOCTOR, PERMISOS_DOCTORA))
    montar('/doctor/dashboard', [tablero, recorridoConsulta, misCobros], [completoDoctora])
    await abrirCentro()
    fireEvent.click(screen.getByRole('button', { name: /Empezar recorrido completo/ }))
    await esperar(400)
    expect(popover()?.textContent).toContain('Las citas de hoy')

    // Termina la etapa 1; la 2 necesita una consulta: no se abre ninguna.
    siguiente()
    siguiente()
    await esperar(500)
    expect(popover()).toBeNull()
    expect(screen.getByTestId('ruta').textContent).toBe('/doctor/dashboard')
    expect(screen.getByText('Recorrido completo · Consulta (2 de 3)')).toBeInTheDocument()
    expect(screen.getByText('Ábrela desde Mis consultas.')).toBeInTheDocument()

    // La salta: la etapa 3 vive en otra pantalla y el recorrido va solo hasta ahí.
    fireEvent.click(screen.getByRole('button', { name: 'Saltar esta parte' }))
    await esperar(400)
    expect(screen.getByTestId('ruta').textContent).toBe('/finanzas/pagos')
    expect(popover()?.textContent).toContain('Lo que cobraste')

    // Pausa con Esc y se retoma desde el centro, donde se quedó.
    escape()
    pantallaLibre()
    expect(
      screen.getByText(/Recorrido completo en pausa: vas en «Mis cobros» \(3 de 3\)/),
    ).toBeInTheDocument()
    await abrirCentro()
    const continuar = screen.getByRole('button', { name: /Continuar recorrido completo/ })
    expect(continuar.textContent).toContain('Vas en Mis cobros, 3 de 3')
    fireEvent.click(continuar)
    await esperar(400)
    expect(popover()?.textContent).toContain('Lo que cobraste')
    siguiente()
    siguiente()
    expect(screen.getByText(/Terminaste el recorrido completo/)).toBeInTheDocument()
    expect(yaLoVio(42, 'completo-prueba', 1)).toBe(true)
  })

  it('el avance sobrevive a recargar la página', async () => {
    vi.useFakeTimers()
    guardarProgreso(42, 'completo-prueba', 1, 2)
    mockUseAuth.mockReturnValue(sesion(Role.DOCTOR, PERMISOS_DOCTORA))
    montar('/doctor/dashboard', [tablero, recorridoConsulta, misCobros], [completoDoctora])
    await abrirCentro()
    expect(
      screen.getByRole('button', { name: /Continuar recorrido completo/ }).textContent,
    ).toContain('Vas en Mis cobros, 3 de 3')
  })

  it('salta y dice la etapa que sus permisos no le dejan ver', async () => {
    mockUseAuth.mockReturnValue(
      sesion(Role.DOCTOR, ['doctor.dashboard.read', 'doctor.appointments.read']),
    )
    montar('/doctor/dashboard', [tablero, recorridoConsulta, misCobros], [completoDoctora])
    await abrirCentro()
    expect(
      screen.getByText(/Se salta «Mis cobros»: tu usuario no tiene acceso a esa pantalla/),
    ).toBeInTheDocument()
  })

  it('una etapa de formulario vista desde su «¿Cómo se llena?» avanza el completo', async () => {
    vi.useFakeTimers()
    const completoRecepcion: RecorridoCompleto = {
      ...completoDoctora,
      id: 'completo-recepcion-prueba',
      roles: [Role.SECRETARIA],
      etapas: [
        { recorridoId: 'formulario-prueba', nombre: 'Agendar una cita' },
        { recorridoId: 'agenda-prueba', nombre: 'Agenda' },
      ],
    }
    guardarProgreso(42, 'completo-recepcion-prueba', 1, 0)
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar(
      '/secretaria/agenda',
      [recorridoFormulario, recorridoAgenda],
      [completoRecepcion],
      <div data-tour="cita-modal">
        <i data-tour="cita-paciente">Paciente</i>
        <BotonAyudaContextual recorridoId="formulario-prueba" />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ver recorrido: ¿Cómo se llena?' }))
    // El arranque espera a que el motor esté listo (carga diferida): dar el microturno.
    await esperar(0)
    expect(popover()?.textContent).toContain('Busca al paciente')
    fireEvent.click(document.querySelector('.driver-popover-next-btn')!)
    expect(
      screen.getByText(/En el recorrido completo sigue «Agenda» \(2 de 2\)/),
    ).toBeInTheDocument()
    expect(leerProgreso(42, 'completo-recepcion-prueba', 1)).toBe(1)
  })
})

describe('pausa y avance a medias', () => {
  it('cambiar de pantalla a mitad de un recorrido lo pausa sin dejar el fondo oscuro', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda')
    await abrirCentro()
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver «La agenda»' })[0])
    await esperar(400)
    expect(popover()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ir a pacientes' }))
    await esperar(50)
    pantallaLibre()
    expect(
      screen.getByText(/Pausamos el recorrido porque cambiaste de pantalla/),
    ).toBeInTheDocument()
    expect(leerProgreso(42, 'agenda-prueba', 1)).toBe(1)
    expect(yaLoVio(42, 'agenda-prueba', 1)).toBe(false)
  })

  it('cerrarlo a medias no cuenta como visto; terminarlo sí y borra el avance', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    const vista = montar('/secretaria/agenda', [bienvenida])
    await abrirCentro()
    fireEvent.click(screen.getByRole('button', { name: 'Ver «Bienvenida»' }))
    await esperar(400)
    siguiente()
    escape()
    expect(yaLoVio(42, 'bienvenida-prueba', 1)).toBe(false)
    expect(leerProgreso(42, 'bienvenida-prueba', 1)).toBe(1)
    vista.unmount()

    montar('/secretaria/agenda', [bienvenida])
    await abrirCentro()
    fireEvent.click(
      screen.getByRole('button', { name: 'Continuar «Bienvenida» en el paso 2 de 3' }),
    )
    await esperar(400)
    expect(popover()?.textContent).toContain('Aquí se agenda')
    siguiente()
    siguiente()
    expect(yaLoVio(42, 'bienvenida-prueba', 1)).toBe(true)
    expect(leerProgreso(42, 'bienvenida-prueba', 1)).toBeNull()
  })

  it('«A medias» cuenta los pasos como los contó el globo, no los declarados', async () => {
    vi.useFakeTimers()
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda')
    await abrirCentro()
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver «La agenda»' })[0])
    await esperar(400)
    // El paso fantasma no está: el globo dice "Paso 1 de 2", no "1 de 3".
    expect(popover()?.textContent).toContain('Paso 1 de 2')
    escape()
    await abrirCentro()
    expect(
      screen.getAllByRole('button', { name: 'Continuar «La agenda» en el paso 1 de 2' }).length,
    ).toBeGreaterThan(0)
  })

  it('con localStorage bloqueado, funciona igual y recuerda el paso en la sesión', async () => {
    vi.useFakeTimers()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    mockUseAuth.mockReturnValue(sesion(Role.SECRETARIA, ['appointments.read']))
    montar('/secretaria/agenda', [bienvenida])
    await abrirCentro()
    fireEvent.click(screen.getByRole('button', { name: 'Ver «Bienvenida»' }))
    await esperar(400)
    siguiente()
    escape()
    expect(leerProgreso(42, 'bienvenida-prueba', 1)).toBe(1)
    expect(yaLoVio(42, 'bienvenida-prueba', 1)).toBe(false)
  })
})
