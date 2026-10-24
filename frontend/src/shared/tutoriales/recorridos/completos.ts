/**
 * Recorridos completos: uno por rol, que encadena los recorridos del catálogo
 * en el orden en que se aprende el trabajo real, no en el orden del menú.
 *
 * Cada etapa es un recorrido que ya existe; aquí sólo se decide el orden y el
 * nombre corto con que se anuncia. Una etapa cuyo recorrido no le toca a la
 * persona (por permisos) se salta y el centro de ayuda lo dice.
 */
import { Role } from '../../types'
import type { RecorridoCompleto } from '../tipos'

export const RECORRIDOS_COMPLETOS: RecorridoCompleto[] = [
  {
    id: 'completo-doctora',
    version: 4,
    titulo: 'Recorrido completo de tu consulta',
    resumen: 'De la agenda del día al cobro, en el orden en que atiendes a un paciente.',
    roles: [Role.DOCTOR],
    etapas: [
      // Su día empieza en su Inicio: ahí están sus citas de hoy y desde ahí
      // abre la consulta. La agenda de recepción es de toda la clínica.
      { recorridoId: 'doctora-dashboard', nombre: 'Tu inicio' },
      // Los avisos le dicen cuándo llegó su paciente: se aprenden antes que
      // la consulta a la que llevan.
      { recorridoId: 'avisos', nombre: 'Avisos' },
      { recorridoId: 'doctora-consulta', nombre: 'Consulta' },
      { recorridoId: 'signos-formulario', nombre: 'Signos vitales' },
      { recorridoId: 'doctora-nota', nombre: 'Nota de consulta' },
      { recorridoId: 'doctora-receta', nombre: 'Receta' },
      // Los estudios que pide en la consulta se siguen desde su bandeja.
      { recorridoId: 'ordenes-resultados', nombre: 'Órdenes y resultados' },
      { recorridoId: 'consulta-cobro', nombre: 'Finalizar y cobrar' },
      { recorridoId: 'mis-cobros', nombre: 'Mis cobros' },
    ],
  },
  {
    id: 'completo-recepcion',
    version: 4,
    titulo: 'Recorrido completo de recepción',
    resumen: 'De agendar la cita a cerrar la caja, en el orden en que llega un paciente.',
    roles: [Role.SECRETARIA],
    etapas: [
      { recorridoId: 'agenda', nombre: 'Agenda' },
      // «Consulta por cobrar» y «control prenatal sin cita» le llegan aquí.
      { recorridoId: 'avisos', nombre: 'Avisos' },
      { recorridoId: 'cita-formulario', nombre: 'Agendar una cita' },
      { recorridoId: 'pacientes', nombre: 'Pacientes' },
      { recorridoId: 'documentos', nombre: 'Documentos' },
      { recorridoId: 'recepcion-entrega', nombre: 'Entregar órdenes' },
      { recorridoId: 'recepcion-resultados', nombre: 'Subir resultados' },
      { recorridoId: 'triage', nombre: 'Triage' },
      { recorridoId: 'signos-formulario', nombre: 'Signos vitales' },
      { recorridoId: 'pagos-recepcion', nombre: 'Cobros' },
      { recorridoId: 'pago-registrar', nombre: 'Registrar un pago' },
      { recorridoId: 'corte-caja', nombre: 'Corte de caja' },
    ],
  },
  {
    id: 'completo-administracion',
    version: 2,
    titulo: 'Recorrido completo de administración',
    resumen: 'El inicio, el personal, los precios, los reportes y la bitácora.',
    roles: [Role.ADMIN, Role.MASTER],
    etapas: [
      { recorridoId: 'admin-dashboard', nombre: 'Inicio' },
      { recorridoId: 'usuarios', nombre: 'Usuarios' },
      { recorridoId: 'usuario-formulario', nombre: 'Alta de un usuario' },
      { recorridoId: 'servicios', nombre: 'Servicios y precios' },
      { recorridoId: 'reportes', nombre: 'Reportes' },
      { recorridoId: 'corte-caja', nombre: 'Corte de caja' },
      { recorridoId: 'auditoria', nombre: 'Bitácora' },
      // Sólo Master los tiene; para administración se saltan y se dice.
      { recorridoId: 'permisos', nombre: 'Permisos' },
      { recorridoId: 'roles', nombre: 'Roles' },
      { recorridoId: 'sucursales', nombre: 'Sucursales' },
    ],
  },
]
