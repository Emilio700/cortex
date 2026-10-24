import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from '../types'
import routes from '../../routes'
import { CATALOGO } from './recorridos'
import type { Recorrido } from './tipos'
import {
  _limpiarMemoriaParaPruebas,
  borrarProgreso,
  guardarProgreso,
  leerAvance,
  leerProgreso,
  marcarVisto,
  olvidarVistos,
  vioAlgunaVersion,
  yaLoVio,
} from './almacen'
import { esMomentoOportuno } from './arranque'
import { RECORRIDOS_COMPLETOS } from './recorridos/completos'
import {
  buscar,
  comoAbrir,
  completoDeRol,
  etapaActual,
  etapaSiguiente,
  normalizar,
  puedeIrA,
  raizDe,
  resolverCompleto,
} from './centro'
import { indiceParaContinuar } from './motor'
import {
  buscarAncla,
  contextoPresente,
  pasosPresentes,
  puedeVerRecorrido,
  recorridosDeRuta,
  recorridosDisponibles,
  rutaCoincide,
  tieneAncla,
} from './visibilidad'

/** Permisos típicos de cada rol, como los devuelve /auth/me. */
const PERMISOS = {
  doctora: [
    'doctor.dashboard.read',
    'doctor.appointments.read',
    'doctor_profile.read',
    'medical_history.read',
    'clinical_tracking.read',
    'appointments.read',
    'patients.read',
    'documents.read',
    'triage.create',
    'payments.read',
    'payments.cashcut',
  ],
  secretaria: [
    'appointments.read',
    'patients.read',
    'triage.create',
    'documents.read',
    'preregistration.read',
    'payments.read',
    'payments.cashcut',
  ],
  admin: [
    'admin.dashboard.read',
    'users.read',
    'services.create',
    'reports.read',
    'audit.read',
    'appointments.read',
    'patients.read',
    'payments.read',
    'payments.cashcut',
    'doctor.dashboard.read',
    'doctor.appointments.read',
  ],
}

const ids = (lista: Recorrido[]) => lista.map((r) => r.id)

describe('catálogo de recorridos', () => {
  it('no repite identificadores, porque son la llave de "ya lo vi"', () => {
    const todos = ids(CATALOGO)
    expect(new Set(todos).size).toBe(todos.length)
  })

  it('cada recorrido tiene pasos con título y texto', () => {
    for (const r of CATALOGO) {
      expect(r.pasos.length, r.id).toBeGreaterThan(0)
      for (const paso of r.pasos) {
        expect(paso.titulo.trim(), r.id).not.toBe('')
        expect(paso.texto.trim(), r.id).not.toBe('')
      }
    }
  })

  it('cada ruta de recorrido existe y pide el mismo permiso que la pantalla', () => {
    // Si divergen, el menú de ayuda ofrecería un recorrido de una pantalla
    // que a la usuaria la echa a /403.
    for (const r of CATALOGO.filter((x) => x.ruta)) {
      const ruta = routes.find((x) => x.path === r.ruta)
      expect(ruta, `${r.id} → ${r.ruta}`).toBeDefined()
      if (r.requiere?.length && ruta?.requires?.length) {
        expect(
          r.requiere.some((p) => ruta.requires!.includes(p)),
          `${r.id} pide ${r.requiere} y la ruta ${ruta.requires}`,
        ).toBe(true)
      }
    }
  })

  it('hay un solo "cómo moverte por el sistema" por rol, para no repetirlo en el índice', () => {
    for (const role of Object.values(Role)) {
      const generales = recorridosDisponibles(CATALOGO, { role }).filter(
        (r) => !r.ruta && !r.contexto,
      )
      expect(generales, role).toHaveLength(1)
    }
  })

  it('ningún recorrido declara cómo arrancar solo: todos se piden desde la ayuda', () => {
    for (const r of CATALOGO) {
      expect('inicio' in r, r.id).toBe(false)
    }
  })

  it('los que necesitan un paciente o un formulario explican cómo llegar', () => {
    for (const r of CATALOGO.filter((x) => x.contexto || x.ruta?.includes(':'))) {
      expect(r.comoLlegar?.trim(), r.id).toBeTruthy()
    }
  })

  it('el "Ir a…" de cada recorrido lleva a una pantalla que existe y no pide datos', () => {
    for (const r of CATALOGO.filter((x) => x.irA)) {
      expect(routes.some((x) => x.path === r.irA!.ruta), r.id).toBe(true)
      expect(r.irA!.ruta.includes(':'), r.id).toBe(false)
    }
  })
})

describe('qué recorridos ve cada rol', () => {
  it('el médico ve la consulta y sus cobros, pero no cobrar como recepción ni administración', () => {
    const vistos = ids(
      recorridosDisponibles(CATALOGO, { role: Role.DOCTOR, permissions: PERMISOS.doctora }),
    )
    expect(vistos).toEqual(
      expect.arrayContaining([
        'bienvenida-doctora',
        'doctora-dashboard',
        'doctora-consulta',
        'doctora-nota',
        'doctora-receta',
        'doctora-certificado',
        'doctora-expediente',
        'consulta-cobro',
        'mis-cobros',
        'corte-caja',
        'agenda',
        // Recibe triage.create desde el commit 4c7dce6.
        'signos-formulario',
      ]),
    )
    expect(vistos).not.toContain('pagos-recepcion')
    expect(vistos).not.toContain('pago-registrar')
    expect(vistos).not.toContain('usuarios')
    expect(vistos).not.toContain('prerregistro')
    expect(vistos).not.toContain('bienvenida-recepcion')
  })

  it('recepción ve agenda, pacientes y cobros, pero no la consulta', () => {
    const vistos = ids(
      recorridosDisponibles(CATALOGO, { role: Role.SECRETARIA, permissions: PERMISOS.secretaria }),
    )
    expect(vistos).toEqual(
      expect.arrayContaining([
        'bienvenida-recepcion',
        'agenda',
        'cita-formulario',
        'signos-formulario',
        'pacientes',
        'pagos-recepcion',
        'pago-registrar',
        'corte-caja',
      ]),
    )
    expect(vistos).not.toContain('doctora-consulta')
    // El preregistro se quitó (plan 32, punto 5): su recorrido tampoco existe.
    expect(vistos).not.toContain('prerregistro')
    expect(vistos).not.toContain('mis-cobros')
    expect(vistos).not.toContain('usuarios')
  })

  it('administración ve sus pantallas pero no las de Master', () => {
    const vistos = ids(
      recorridosDisponibles(CATALOGO, { role: Role.ADMIN, permissions: PERMISOS.admin }),
    )
    expect(vistos).toEqual(
      expect.arrayContaining(['admin-dashboard', 'usuarios', 'servicios', 'reportes', 'auditoria']),
    )
    expect(vistos).not.toContain('permisos')
    expect(vistos).not.toContain('sucursales')
  })

  it('Master ve también roles, permisos y sucursales', () => {
    const vistos = ids(recorridosDisponibles(CATALOGO, { role: Role.MASTER }))
    expect(vistos).toEqual(expect.arrayContaining(['permisos', 'roles', 'sucursales', 'usuarios']))
  })

  it('un permiso concedido abre el recorrido aunque el rol no lo tenga', () => {
    const signos = CATALOGO.find((r) => r.id === 'signos-formulario')!
    expect(puedeVerRecorrido(signos, { role: Role.DOCTOR, permissions: ['triage.create'] })).toBe(true)
    expect(puedeVerRecorrido(signos, { role: Role.DOCTOR, permissions: ['patients.read'] })).toBe(false)
  })

  it('una sesión sin permisos cargados decide por rol en vez de quedarse sin nada', () => {
    const signos = CATALOGO.find((r) => r.id === 'signos-formulario')!
    expect(puedeVerRecorrido(signos, { role: Role.SECRETARIA })).toBe(true)
    expect(puedeVerRecorrido(signos, { role: Role.DOCTOR })).toBe(false)
  })

  it('soloRoles se suma al permiso: el médico con payments.read no ve el cobro de recepción', () => {
    const pagos = CATALOGO.find((r) => r.id === 'pagos-recepcion')!
    expect(puedeVerRecorrido(pagos, { role: Role.DOCTOR, permissions: ['payments.read'] })).toBe(false)
    expect(puedeVerRecorrido(pagos, { role: Role.SECRETARIA, permissions: ['payments.read'] })).toBe(true)
  })
})

describe('rutas', () => {
  it('reconoce rutas con parámetros', () => {
    expect(rutaCoincide('/doctor/consultation/:appointmentId', '/doctor/consultation/15')).toBe(true)
    expect(rutaCoincide('/doctor/consultation/:appointmentId', '/doctor/consultation')).toBe(false)
    expect(rutaCoincide('/finanzas', '/finanzas/pagos')).toBe(false)
  })

  it('en Cobros el médico tiene "Mis cobros" y recepción "Cobros y recibos"', () => {
    const deDoctora = recorridosDeRuta(
      recorridosDisponibles(CATALOGO, { role: Role.DOCTOR, permissions: PERMISOS.doctora }),
      '/finanzas/pagos',
    )
    const deRecepcion = recorridosDeRuta(
      recorridosDisponibles(CATALOGO, { role: Role.SECRETARIA, permissions: PERMISOS.secretaria }),
      '/finanzas/pagos',
    )
    expect(ids(deDoctora)).toContain('mis-cobros')
    expect(ids(deDoctora)).not.toContain('pagos-recepcion')
    expect(ids(deRecepcion)).toContain('pagos-recepcion')
    expect(ids(deRecepcion)).not.toContain('mis-cobros')
  })
})

describe('pasos presentes en pantalla', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  const recorrido: Recorrido = {
    id: 'prueba',
    version: 1,
    titulo: 'Prueba',
    resumen: '',
    grupo: 'General',
    pasos: [
      { titulo: 'Intro', texto: 'Sin elemento' },
      { elemento: 'existe', titulo: 'A', texto: 'a' },
      { elemento: 'no-existe', titulo: 'B', texto: 'b' },
      { elemento: 'escondido', titulo: 'C', texto: 'c' },
      { elemento: 'plegado', titulo: 'D', texto: 'd' },
      { elemento: ['no-existe', 'alterno'], titulo: 'E', texto: 'e' },
    ],
  }

  it('omite los pasos cuyo elemento no está, está oculto o plegado', () => {
    document.body.innerHTML = `
      <div data-tour="existe"></div>
      <div style="display:none"><div data-tour="escondido"></div></div>
      <div class="collapse"><div data-tour="plegado"></div></div>
      <div data-tour="alterno"></div>`
    expect(pasosPresentes(recorrido.pasos).map((p) => p.titulo)).toEqual(['Intro', 'A', 'E'])
  })

  it('con dos pestañas abiertas señala la que se ve, no la escondida', () => {
    document.body.innerHTML = `
      <div style="display:none"><div data-tour="existe" id="oculta"></div></div>
      <div><div data-tour="existe" id="visible"></div></div>`
    expect(buscarAncla('existe')?.id).toBe('visible')
  })

  it('sin ningún ancla en pantalla no se considera listo para arrancar solo', () => {
    expect(tieneAncla(recorrido.pasos)).toBe(false)
    document.body.innerHTML = '<div data-tour="existe"></div>'
    expect(tieneAncla(recorrido.pasos)).toBe(true)
  })

  it('un recorrido de formulario sólo aplica con el formulario a la vista', () => {
    const conContexto = { ...recorrido, contexto: 'mi-modal' }
    expect(contextoPresente(conContexto)).toBe(false)
    document.body.innerHTML = '<div data-tour="mi-modal"></div>'
    expect(contextoPresente(conContexto)).toBe(true)
  })
})

describe('"ya lo vi"', () => {
  beforeEach(() => _limpiarMemoriaParaPruebas())
  afterEach(() => vi.restoreAllMocks())

  it('se recuerda por usuaria y por versión', () => {
    expect(yaLoVio(7, 'agenda', 1)).toBe(false)
    marcarVisto(7, 'agenda', 1)
    expect(yaLoVio(7, 'agenda', 1)).toBe(true)
    // Otra usuaria en la misma computadora no lo vio.
    expect(yaLoVio(8, 'agenda', 1)).toBe(false)
    // Una versión nueva del recorrido vuelve a ofrecerse.
    expect(yaLoVio(7, 'agenda', 2)).toBe(false)
  })

  it('sobrevive a recargar la página (queda en localStorage)', () => {
    marcarVisto(7, 'agenda', 1)
    _limpiarMemoriaParaPruebas()
    expect(yaLoVio(7, 'agenda', 1)).toBe(true)
  })

  it('olvidar lo visto vuelve a ofrecer todo', () => {
    marcarVisto(7, 'agenda', 1)
    olvidarVistos(7)
    expect(yaLoVio(7, 'agenda', 1)).toBe(false)
  })

  it('no truena si localStorage lanza error, y en la sesión no vuelve a insistir', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => yaLoVio(7, 'agenda', 1)).not.toThrow()
    expect(yaLoVio(7, 'agenda', 1)).toBe(false)
    expect(() => marcarVisto(7, 'agenda', 1)).not.toThrow()
    expect(yaLoVio(7, 'agenda', 1)).toBe(true)
  })

  it('ignora datos corruptos en vez de tronar', () => {
    localStorage.setItem('gems.tutoriales.vistos.7', '{no es json')
    expect(yaLoVio(7, 'agenda', 1)).toBe(false)
    localStorage.setItem('gems.tutoriales.vistos.7', JSON.stringify({ agenda: 'uno' }))
    expect(yaLoVio(7, 'agenda', 1)).toBe(false)
  })
})

describe('momento para arrancar lo que se pidió en otra pantalla', () => {
  it('no interrumpe con un modal abierto ni con alguien escribiendo', () => {
    document.body.innerHTML = '<textarea id="nota"></textarea>'
    expect(esMomentoOportuno()).toBe(true)
    ;(document.getElementById('nota') as HTMLTextAreaElement).focus()
    expect(esMomentoOportuno()).toBe(false)
    document.body.innerHTML = '<div class="modal show"></div>'
    expect(esMomentoOportuno()).toBe(false)
  })
})

describe('cómo se abre un recorrido desde el centro', () => {
  const de = (id: string) => CATALOGO.find((r) => r.id === id)!

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('en su pantalla se ve ahí mismo', () => {
    expect(comoAbrir(de('agenda'), '/secretaria/agenda')).toEqual({ tipo: 'aqui' })
    expect(comoAbrir(de('doctora-consulta'), '/doctor/consultation/15')).toEqual({ tipo: 'aqui' })
  })

  it('de otra pantalla sin datos, navega', () => {
    expect(comoAbrir(de('agenda'), '/doctor/dashboard')).toEqual({
      tipo: 'navegar',
      ruta: '/secretaria/agenda',
    })
  })

  it('nunca elige una consulta ni un paciente: pide que la abra la persona', () => {
    expect(comoAbrir(de('doctora-consulta'), '/doctor/dashboard')).toEqual({
      tipo: 'necesita',
      razon: 'datos',
    })
    expect(comoAbrir(de('doctora-expediente'), '/secretaria/pacientes')).toEqual({
      tipo: 'necesita',
      razon: 'datos',
    })
  })

  it('un recorrido de formulario sin el formulario abierto no lo abre: lo explica', () => {
    expect(comoAbrir(de('cita-formulario'), '/secretaria/agenda')).toEqual({
      tipo: 'necesita',
      razon: 'formulario',
    })
    expect(comoAbrir(de('signos-formulario'), '/doctor/consultation/3')).toEqual({
      tipo: 'necesita',
      razon: 'formulario',
    })
    document.body.innerHTML = '<div data-tour="cita-formulario"></div>'
    expect(comoAbrir(de('cita-formulario'), '/secretaria/agenda')).toEqual({ tipo: 'aqui' })
  })

  it('"Ir a…" sólo hacia pantallas que la persona puede abrir', () => {
    expect(
      puedeIrA('/doctor/appointments', { role: Role.DOCTOR, permissions: PERMISOS.doctora }),
    ).toBe(true)
    expect(
      puedeIrA('/doctor/appointments', { role: Role.SECRETARIA, permissions: PERMISOS.secretaria }),
    ).toBe(false)
    expect(puedeIrA('/no/existe', { role: Role.MASTER })).toBe(false)
  })
})

describe('recorrido completo por rol', () => {
  const doctora = { role: Role.DOCTOR, permissions: PERMISOS.doctora }

  it('cada etapa apunta a un recorrido del catálogo', () => {
    const idsCatalogo = new Set(ids(CATALOGO))
    for (const c of RECORRIDOS_COMPLETOS) {
      for (const e of c.etapas) {
        expect(idsCatalogo.has(e.recorridoId), `${c.id} → ${e.recorridoId}`).toBe(true)
      }
    }
  })

  it('cada rol tiene el suyo', () => {
    for (const role of Object.values(Role)) {
      expect(completoDeRol(RECORRIDOS_COMPLETOS, { role }), role).not.toBeNull()
    }
  })

  it('el médico aprende en el orden de su trabajo: agenda, avisos, consulta, signos, nota, receta, cobro y sus cobros', () => {
    const completo = completoDeRol(RECORRIDOS_COMPLETOS, doctora)!
    const { aplicables, saltadas } = resolverCompleto(
      completo,
      recorridosDisponibles(CATALOGO, doctora),
    )
    expect(aplicables.map((e) => e.recorrido.id)).toEqual([
      'doctora-dashboard',
      'avisos',
      'doctora-consulta',
      'signos-formulario',
      'doctora-nota',
      'doctora-receta',
      'ordenes-resultados',
      'consulta-cobro',
      'mis-cobros',
    ])
    expect(saltadas).toEqual([])
  })

  it('salta la etapa que sus permisos no le dejan ver, y la reporta', () => {
    const sinTriage = {
      role: Role.DOCTOR,
      permissions: PERMISOS.doctora.filter((p) => p !== 'triage.create'),
    }
    const completo = completoDeRol(RECORRIDOS_COMPLETOS, sinTriage)!
    const { aplicables, saltadas } = resolverCompleto(
      completo,
      recorridosDisponibles(CATALOGO, sinTriage),
    )
    expect(aplicables.map((e) => e.recorrido.id)).not.toContain('signos-formulario')
    expect(saltadas.map((e) => e.nombre)).toEqual(['Signos vitales'])
  })

  it('administración no ve las etapas de Master; Master sí', () => {
    const completo = completoDeRol(RECORRIDOS_COMPLETOS, { role: Role.ADMIN })!
    const admin = resolverCompleto(
      completo,
      recorridosDisponibles(CATALOGO, { role: Role.ADMIN, permissions: PERMISOS.admin }),
    )
    expect(admin.saltadas.map((e) => e.recorridoId)).toEqual(['permisos', 'roles', 'sucursales'])
    const master = resolverCompleto(completo, recorridosDisponibles(CATALOGO, { role: Role.MASTER }))
    expect(master.saltadas).toEqual([])
  })

  it('retoma en la etapa guardada, o en la siguiente que le toque', () => {
    const completo = completoDeRol(RECORRIDOS_COMPLETOS, doctora)!
    const { aplicables } = resolverCompleto(completo, recorridosDisponibles(CATALOGO, doctora))
    expect(etapaActual(aplicables, null)?.recorrido.id).toBe('doctora-dashboard')
    expect(etapaActual(aplicables, 4)?.recorrido.id).toBe('doctora-nota')
    expect(etapaSiguiente(aplicables, aplicables[aplicables.length - 1])).toBeNull()
    expect(etapaActual(aplicables, 99)).toBeNull()
  })
})

describe('búsqueda', () => {
  const doctora = recorridosDisponibles(CATALOGO, {
    role: Role.DOCTOR,
    permissions: PERMISOS.doctora,
  })
  const recepcion = recorridosDisponibles(CATALOGO, {
    role: Role.SECRETARIA,
    permissions: PERMISOS.secretaria,
  })

  it('ignora mayúsculas, acentos y las etiquetas de los textos', () => {
    expect(normalizar('<b>Presión</b> ARTERIAL').trim().split(/\s+/)).toEqual(['presion', 'arterial'])
  })

  it('reduce las palabras a su raíz sin confundir receta con recepción', () => {
    expect(raizDe('cobrar')).toBe('cobr')
    expect(raizDe('receta')).toBe('recet')
    expect(raizDe('signos')).toBe('sign')
    expect('recepcion'.startsWith(raizDe('receta'))).toBe(false)
  })

  it('«receta» encuentra el recorrido de la receta y pasos sueltos', () => {
    const { recorridos, pasos } = buscar(doctora, 'receta')
    expect(ids(recorridos)[0]).toBe('doctora-receta')
    expect(
      pasos.some((p) => p.recorrido.id === 'doctora-consulta' && p.paso.titulo === '2. Receta'),
    ).toBe(true)
  })

  it('«cobrar» encuentra cobros y el cobro al finalizar', () => {
    const { recorridos, pasos } = buscar(doctora, 'cobrar')
    const todos = [...ids(recorridos), ...pasos.map((p) => p.recorrido.id)]
    expect(todos).toContain('consulta-cobro')
    expect(todos).toContain('mis-cobros')
  })

  it('«signos» encuentra el formulario de signos y el paso de la consulta', () => {
    const { recorridos, pasos } = buscar(doctora, 'signos')
    expect(ids(recorridos)).toContain('signos-formulario')
    expect(pasos.some((p) => p.recorrido.id === 'doctora-consulta')).toBe(true)
  })

  it('sólo busca en lo que su rol puede ver', () => {
    const { recorridos, pasos } = buscar(recepcion, 'receta')
    expect(ids(recorridos)).not.toContain('doctora-receta')
    expect(pasos.every((p) => recepcion.includes(p.recorrido))).toBe(true)
  })

  it('una búsqueda vacía o de pura palabra de relleno no devuelve nada', () => {
    expect(buscar(doctora, '   ')).toEqual({ recorridos: [], pasos: [] })
    expect(buscar(doctora, 'de la')).toEqual({ recorridos: [], pasos: [] })
  })
})

describe('progreso de un recorrido a medias', () => {
  beforeEach(() => {
    _limpiarMemoriaParaPruebas()
    localStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('se guarda por usuaria y sobrevive a recargar la página', () => {
    expect(leerProgreso(7, 'agenda', 2)).toBeNull()
    guardarProgreso(7, 'agenda', 2, 4)
    expect(leerProgreso(7, 'agenda', 2)).toBe(4)
    expect(leerProgreso(8, 'agenda', 2)).toBeNull()
    _limpiarMemoriaParaPruebas()
    expect(leerProgreso(7, 'agenda', 2)).toBe(4)
  })

  it('dejarlo a medias no lo marca como visto', () => {
    guardarProgreso(7, 'agenda', 2, 4)
    expect(yaLoVio(7, 'agenda', 2)).toBe(false)
  })

  it('terminarlo borra el progreso: ya no hay nada que continuar', () => {
    guardarProgreso(7, 'agenda', 2, 4)
    marcarVisto(7, 'agenda', 2)
    expect(leerProgreso(7, 'agenda', 2)).toBeNull()
    _limpiarMemoriaParaPruebas()
    expect(leerProgreso(7, 'agenda', 2)).toBeNull()
  })

  it('una versión nueva del recorrido descarta el progreso viejo', () => {
    guardarProgreso(7, 'agenda', 1, 4)
    expect(leerProgreso(7, 'agenda', 2)).toBeNull()
    // Y no revive si se vuelve a preguntar por la vieja: se borró.
    _limpiarMemoriaParaPruebas()
    expect(leerProgreso(7, 'agenda', 1)).toBeNull()
  })

  it('volver a ofrecer los recorridos también borra lo dejado a medias', () => {
    guardarProgreso(7, 'agenda', 2, 4)
    olvidarVistos(7)
    expect(leerProgreso(7, 'agenda', 2)).toBeNull()
  })

  it('no truena si localStorage lanza error, y en la sesión recuerda el paso', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => guardarProgreso(7, 'agenda', 2, 3)).not.toThrow()
    expect(leerProgreso(7, 'agenda', 2)).toBe(3)
    expect(() => borrarProgreso(7, 'agenda')).not.toThrow()
    expect(leerProgreso(7, 'agenda', 2)).toBeNull()
  })

  it('un borrado que no llegó a localStorage no revive el progreso en la sesión', () => {
    guardarProgreso(7, 'agenda', 2, 3)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    marcarVisto(7, 'agenda', 2)
    expect(leerProgreso(7, 'agenda', 2)).toBeNull()
    expect(yaLoVio(7, 'agenda', 2)).toBe(true)
  })

  it('ignora progreso corrupto en vez de tronar', () => {
    localStorage.setItem('gems.tutoriales.progreso.7', '{no es json')
    expect(leerProgreso(7, 'agenda', 1)).toBeNull()
    localStorage.setItem(
      'gems.tutoriales.progreso.7',
      JSON.stringify({ agenda: { version: 1, paso: -2 } }),
    )
    expect(leerProgreso(7, 'agenda', 1)).toBeNull()
    localStorage.setItem('gems.tutoriales.progreso.7', JSON.stringify({ agenda: 'tres' }))
    expect(leerProgreso(7, 'agenda', 1)).toBeNull()
  })

  it('distingue a quien vio una versión anterior de quien nunca lo vio', () => {
    expect(vioAlgunaVersion(7, 'bienvenida-recepcion')).toBe(false)
    marcarVisto(7, 'bienvenida-recepcion', 1)
    expect(vioAlgunaVersion(7, 'bienvenida-recepcion')).toBe(true)
    expect(yaLoVio(7, 'bienvenida-recepcion', 2)).toBe(false)
  })
})

describe('desde qué paso continuar', () => {
  it('continúa en el paso guardado si sigue en pantalla', () => {
    // Pasos declarados 0..4; en pantalla están el 0, 2, 3 y 4.
    expect(indiceParaContinuar([0, 2, 3, 4], 3)).toBe(2)
  })

  it('si el paso guardado desapareció, continúa desde el siguiente que sí esté', () => {
    expect(indiceParaContinuar([0, 2, 3, 4], 1)).toBe(1)
  })

  it('si ya no queda ninguno después, empieza desde el principio', () => {
    expect(indiceParaContinuar([0, 1, 2], 5)).toBe(0)
  })
})

describe('lo que decía el globo al dejarlo a medias', () => {
  beforeEach(() => {
    _limpiarMemoriaParaPruebas()
    localStorage.clear()
  })

  it('se guarda con el avance y sobrevive a recargar la página', () => {
    guardarProgreso(9, 'agenda', 3, 4, { posicion: 3, total: 8 })
    _limpiarMemoriaParaPruebas()
    expect(leerAvance(9, 'agenda', 3)).toEqual({ version: 3, paso: 4, enPantalla: { posicion: 3, total: 8 } })
  })

  it('si está corrupto se ignora sin perder el paso', () => {
    localStorage.setItem(
      'gems.tutoriales.progreso.9',
      JSON.stringify({ agenda: { version: 3, paso: 4, enPantalla: { posicion: 9, total: 2 } } }),
    )
    expect(leerAvance(9, 'agenda', 3)).toEqual({ version: 3, paso: 4 })
  })
})
