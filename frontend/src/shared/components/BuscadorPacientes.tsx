/**
 * Buscador de pacientes del encabezado (plan 28, Fase 4 y D-7).
 *
 * Busca **solo pacientes** —por nombre, teléfono o número de expediente—, y
 * el texto lo dice: el boceto prometía «paciente, cita o expediente» y las
 * citas no se buscan. Usa `GET /patients?search=`, que ya acota a las
 * pacientes que la sesión puede ver. Se dibuja solo con `patients.read`.
 *
 * - Espera 300 ms a que se deje de escribir y pide al menos 2 caracteres.
 * - `Ctrl+K` / `⌘K` lo enfoca desde cualquier pantalla; «Buscar paciente» del
 *   inicio también (pedido `buscador:enfocar`).
 * - Teclado completo con el patrón `combobox` de ARIA: flechas, Inicio/Fin,
 *   Enter abre, Esc cierra.
 * - En el celular no ocupa el encabezado: es una lupa que abre el campo
 *   encima, a todo el ancho.
 * - Elegir un paciente abre su expediente si la sesión puede leerlo
 *   (`medical_history.read`); si no, su historial de recepción.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilX } from '@coreui/icons'

import { apiClient } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { mensajeDeError } from '../utils/errors'
import { formatEdad } from '../utils/date'
import { useAtenderPedido } from '../utils/pedidos'
import { rutaDelExpediente } from '../../modules/expediente/rutas'

export const MINIMO_DE_CARACTERES = 2
export const ESPERA_MS = 300
const LIMITE = 8

export interface PacienteEncontrado {
  id: number
  first_name: string
  last_name: string
  phone?: string | null
  cell_phone?: string | null
  date_of_birth?: string | null
  expediente_legacy?: number | null
}

type Estado =
  | { tipo: 'inactivo' }
  | { tipo: 'buscando' }
  | { tipo: 'listo'; pacientes: PacienteEncontrado[] }
  | { tipo: 'error'; mensaje: string }

const esMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export const BuscadorPacientes: React.FC = () => {
  const { can } = useAuth()
  const navigate = useNavigate()
  const id = useId()
  const idLista = `${id}-resultados`
  const campo = useRef<HTMLInputElement>(null)
  const contenedor = useRef<HTMLDivElement>(null)
  const turno = useRef(0)

  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  // En el celular el campo vive en una capa que se abre con la lupa.
  const [capaMovil, setCapaMovil] = useState(false)
  const [estado, setEstado] = useState<Estado>({ tipo: 'inactivo' })
  const [activo, setActivo] = useState(-1)

  const puedeBuscar = can('patients.read')
  const consulta = texto.trim()

  const buscar = useCallback(async (termino: string) => {
    const mio = ++turno.current
    setEstado({ tipo: 'buscando' })
    try {
      const { data } = await apiClient.get<PacienteEncontrado[]>('/patients', {
        params: { search: termino, limit: LIMITE },
      })
      if (mio !== turno.current) return
      setEstado({ tipo: 'listo', pacientes: Array.isArray(data) ? data : [] })
      setActivo(-1)
    } catch (err) {
      if (mio !== turno.current) return
      setEstado({ tipo: 'error', mensaje: mensajeDeError(err, 'No se pudo buscar.') })
    }
  }, [])

  // Espera a que se deje de escribir.
  useEffect(() => {
    if (consulta.length < MINIMO_DE_CARACTERES) {
      turno.current += 1
      setEstado({ tipo: 'inactivo' })
      return
    }
    const temporizador = window.setTimeout(() => void buscar(consulta), ESPERA_MS)
    return () => window.clearTimeout(temporizador)
  }, [consulta, buscar])

  const enfocar = useCallback(() => {
    setCapaMovil(true)
    setAbierto(true)
    // La capa del celular se monta en este mismo render: se enfoca después.
    window.setTimeout(() => campo.current?.focus(), 0)
  }, [])

  // Ctrl+K / ⌘K desde cualquier pantalla.
  useEffect(() => {
    if (!puedeBuscar) return
    const alTeclear = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault()
        enfocar()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [puedeBuscar, enfocar])

  useAtenderPedido('buscador:enfocar', () => {
    if (puedeBuscar) enfocar()
  })

  // Tocar fuera cierra la lista.
  useEffect(() => {
    if (!abierto) return
    const alTocar = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) {
        setAbierto(false)
        setCapaMovil(false)
      }
    }
    document.addEventListener('mousedown', alTocar)
    return () => document.removeEventListener('mousedown', alTocar)
  }, [abierto])

  if (!puedeBuscar) return null

  const pacientes = estado.tipo === 'listo' ? estado.pacientes : []
  const mostrarLista = abierto && consulta.length > 0

  const cerrar = () => {
    setAbierto(false)
    setCapaMovil(false)
    setActivo(-1)
  }

  const abrirPaciente = (paciente: PacienteEncontrado) => {
    cerrar()
    setTexto('')
    navigate(rutaDelExpediente(paciente.id))
  }

  const alTeclear = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    const total = pacientes.length
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault()
        setAbierto(true)
        if (total) setActivo((i) => (i + 1) % total)
        break
      case 'ArrowUp':
        evento.preventDefault()
        if (total) setActivo((i) => (i <= 0 ? total - 1 : i - 1))
        break
      case 'Home':
        if (total && mostrarLista) {
          evento.preventDefault()
          setActivo(0)
        }
        break
      case 'End':
        if (total && mostrarLista) {
          evento.preventDefault()
          setActivo(total - 1)
        }
        break
      case 'Enter':
        if (activo >= 0 && pacientes[activo]) {
          evento.preventDefault()
          abrirPaciente(pacientes[activo])
        } else if (total === 1) {
          evento.preventDefault()
          abrirPaciente(pacientes[0])
        }
        break
      case 'Escape':
        evento.preventDefault()
        if (mostrarLista) cerrar()
        else {
          setTexto('')
          cerrar()
          campo.current?.blur()
        }
        break
    }
  }

  let contenidoLista: React.ReactNode = null
  if (mostrarLista) {
    if (consulta.length < MINIMO_DE_CARACTERES) {
      contenidoLista = <li className="buscador-nota">Escribe al menos {MINIMO_DE_CARACTERES} letras o números.</li>
    } else if (estado.tipo === 'buscando' || estado.tipo === 'inactivo') {
      contenidoLista = <li className="buscador-nota">Buscando…</li>
    } else if (estado.tipo === 'error') {
      contenidoLista = (
        <li className="buscador-nota buscador-error">
          {estado.mensaje}{' '}
          <button type="button" className="buscador-enlace" onClick={() => void buscar(consulta)}>
            Reintentar
          </button>
        </li>
      )
    } else if (pacientes.length === 0) {
      contenidoLista = <li className="buscador-nota">Ninguna paciente coincide con «{consulta}».</li>
    } else {
      contenidoLista = pacientes.map((paciente, indice) => {
        const nombre = `${paciente.first_name} ${paciente.last_name}`.trim()
        const telefono = paciente.cell_phone || paciente.phone
        const edad = formatEdad(paciente.date_of_birth, '')
        const datos = [
          edad,
          telefono ? `Tel. ${telefono}` : '',
          paciente.expediente_legacy ? `Exp. ${paciente.expediente_legacy}` : '',
        ].filter(Boolean)
        return (
          <li
            key={paciente.id}
            id={`${id}-opcion-${indice}`}
            role="option"
            aria-selected={indice === activo}
            className={`buscador-opcion${indice === activo ? ' es-activa' : ''}`}
            // mousedown y no click: el campo no pierde el foco antes de elegir.
            onMouseDown={(e) => {
              e.preventDefault()
              abrirPaciente(paciente)
            }}
            onMouseEnter={() => setActivo(indice)}
          >
            <span className="buscador-opcion-nombre">{nombre}</span>
            {datos.length > 0 && <span className="buscador-opcion-datos">{datos.join(' · ')}</span>}
          </li>
        )
      })
    }
  }

  const atajo = esMac() ? '⌘K' : 'Ctrl K'

  return (
    <div className={`buscador${capaMovil ? ' es-abierto-movil' : ''}`} ref={contenedor} data-tour="encabezado-buscar">
      <button
        type="button"
        className="buscador-lupa"
        aria-label="Buscar paciente"
        onClick={enfocar}
      >
        <CIcon icon={cilSearch} />
      </button>
      <div className="buscador-campo">
        <CIcon icon={cilSearch} className="buscador-icono" aria-hidden="true" />
        <input
          ref={campo}
          type="search"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={activo >= 0 ? `${id}-opcion-${activo}` : undefined}
          aria-label="Buscar paciente por nombre, teléfono o expediente"
          placeholder="Buscar paciente por nombre, teléfono o expediente"
          autoComplete="off"
          spellCheck={false}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
        />
        <kbd className="buscador-atajo" aria-hidden="true">
          {atajo}
        </kbd>
        <button type="button" className="buscador-cerrar" aria-label="Cerrar la búsqueda" onClick={cerrar}>
          <CIcon icon={cilX} />
        </button>
        <ul id={idLista} role="listbox" aria-label="Pacientes encontradas" className="buscador-lista" hidden={!mostrarLista}>
          {contenidoLista}
        </ul>
        {/* El número de resultados se anuncia; cada tecla no. */}
        <span className="visually-hidden" aria-live="polite">
          {mostrarLista && estado.tipo === 'listo'
            ? pacientes.length === 0
              ? 'Sin resultados'
              : `${pacientes.length} pacientes encontradas`
            : ''}
        </span>
      </div>
    </div>
  )
}

export default BuscadorPacientes
