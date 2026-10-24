/**
 * Hoja impresa de la agenda (S-09).
 *
 * Decisión de Emilio: se imprime desde la vista Lista, el rango visible, con
 * hora, paciente, teléfono, doctora, servicio y estado. Nada más: el motivo es
 * una nota para el médico y la hoja se queda en el mostrador.
 *
 * Se arma como documento aparte y se imprime desde un marco oculto. El CSS de
 * impresión de la agenda sólo esconde su panel y la barra del calendario; el
 * menú lateral, el encabezado y los botones de la aplicación seguirían saliendo
 * en el papel, y las columnas de la pantalla no son las de la hoja.
 */
import type { Appointment } from '../types'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'
import {
  agruparCitasPorDia,
  ESTADO_LABELS,
  etiquetaTipoCita,
  horaLocal,
  nombrePaciente,
  tituloDia,
} from './tablero'
import { formatearEnConsultorio } from '../../../shared/utils/date'

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Columnas de la hoja, en el orden de la decisión. */
export const COLUMNAS_AGENDA_IMPRESA = ['Hora', 'Paciente', 'Teléfono', 'Médico', 'Servicio', 'Estado']

/**
 * Una fila de la hoja, en texto plano. «Servicio» es el tipo de cita
 * (consulta, cirugía, procedimiento): la cita no guarda el servicio del
 * catálogo, ése sólo aparece al cobrar.
 */
export const filaAgendaImpresa = (cita: Appointment): string[] => [
  horaLocal(cita.scheduled_at),
  nombrePaciente(cita),
  cita.patient?.phone?.trim() || '—',
  cita.doctor?.full_name ? nombreConTratamiento(cita.doctor) : 'Sin asignar',
  etiquetaTipoCita(cita),
  ESTADO_LABELS[cita.status] ?? cita.status,
]

interface OpcionesHoja {
  inicio: Date
  /** Último día visible (inclusive). */
  fin: Date
  /** Filtros aplicados, para que quien lea la hoja sepa qué no está en ella. */
  filtros: string[]
  impresaEl?: Date
}

const fechaLarga = (d: Date) => `${tituloDia(d)} de ${d.getFullYear()}`

export const htmlDeAgendaImpresa = (citas: Appointment[], opciones: OpcionesHoja): string => {
  const { inicio, fin, filtros, impresaEl = new Date() } = opciones
  const periodo =
    inicio.toDateString() === fin.toDateString()
      ? `${DIAS_LARGOS[inicio.getDay()]} ${fechaLarga(inicio)}`
      : `del ${fechaLarga(inicio)} al ${fechaLarga(fin)}`
  const dias = [...agruparCitasPorDia(citas).entries()].sort(([a], [b]) => a.localeCompare(b))
  const cabeceras = COLUMNAS_AGENDA_IMPRESA.map((c) => `<th>${c}</th>`).join('')

  const secciones = dias
    .map(([, delDia]) => {
      const fecha = new Date(delDia[0].scheduled_at)
      const filas = delDia
        .map((cita) => `<tr>${filaAgendaImpresa(cita).map((v) => `<td>${escapar(v)}</td>`).join('')}</tr>`)
        .join('')
      return `<section>
  <h2>${DIAS_LARGOS[fecha.getDay()]}, ${escapar(tituloDia(fecha))} <span>${delDia.length} cita${delDia.length === 1 ? '' : 's'}</span></h2>
  <table><thead><tr>${cabeceras}</tr></thead><tbody>${filas}</tbody></table>
</section>`
    })
    .join('\n')

  const impresa = formatearEnConsultorio(impresaEl, { dateStyle: 'long', timeStyle: 'short' })

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Agenda ${escapar(periodo)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt; margin: 0; }
  h1 { font-size: 14pt; margin: 0 0 2px; }
  .meta { font-size: 9pt; color: #444; margin-bottom: 10px; }
  section { break-inside: avoid; margin-bottom: 12px; }
  h2 { font-size: 11pt; margin: 10px 0 4px; text-transform: capitalize; }
  h2 span { font-weight: normal; color: #555; font-size: 9pt; text-transform: none; margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 3px 4px; border-bottom: 1px solid #ccc; vertical-align: top; }
  th { border-bottom: 1.5px solid #333; font-size: 9pt; }
  td:first-child { font-weight: bold; white-space: nowrap; }
</style>
</head>
<body>
  <h1>Agenda ${escapar(periodo)}</h1>
  <div class="meta">
    ${citas.length} cita${citas.length === 1 ? '' : 's'}${
      filtros.length ? ` · Filtros: ${escapar(filtros.join(', '))}` : ' · Sin filtros'
    } · Impresa el ${escapar(impresa)}
  </div>
  ${secciones}
</body>
</html>`
}

/** Abre el diálogo de impresión con la hoja, sin menús ni botones de la aplicación. */
export const imprimirAgenda = (html: string) => {
  const marco = document.createElement('iframe')
  marco.style.display = 'none'
  marco.setAttribute('title', 'Agenda para imprimir')
  marco.srcdoc = html
  marco.onload = () => {
    const ventana = marco.contentWindow
    if (!ventana) return
    ventana.addEventListener('afterprint', () => marco.remove())
    ventana.print()
  }
  document.body.appendChild(marco)
}
