/**
 * «Novedades de la 1.2.0» en el centro de ayuda (plan 32, agregado del
 * 2026-10-09).
 *
 * Dice qué se movió y a dónde. Nunca se abre sola: la franja del encabezado
 * lo avisa una vez por usuaria y la página vive en el «?». Cada novedad enlaza
 * a su recorrido guiado; `recorridos` es una lista de candidatos porque el
 * recorrido que explica un cambio depende del rol (la bienvenida de la doctora
 * no es la de recepción). Una novedad cuyo recorrido nadie del rol puede ver
 * no se le muestra, salvo las marcadas `paraTodas`.
 *
 * Al cambiar de versión se cambia `VERSION_NOVEDADES`: la franja vuelve a
 * salir una vez para cada usuaria.
 */
export const VERSION_NOVEDADES = '1.2.0'

export interface Novedad {
  id: string
  titulo: string
  texto: string
  /** Recorridos que la explican, en orden de preferencia. */
  recorridos: string[]
  /** Se muestra aunque no haya recorrido disponible para el rol. */
  paraTodas?: boolean
}

export const NOVEDADES: Novedad[] = [
  {
    id: 'encabezado',
    titulo: 'Un solo título arriba de cada pantalla',
    texto:
      'Desaparecieron el título y la ruta que se repetían arriba. Cada pantalla tiene un solo encabezado y, si vive dentro de otra, un enlace «←» para volver. Las pestañas abiertas tienen ícono, el nombre completo al pasar el cursor, clic derecho para «Cerrar las demás» y, al pasar de 8, se cierra la usada hace más tiempo con «Deshacer».',
    recorridos: ['bienvenida-doctora', 'bienvenida-recepcion', 'bienvenida-administracion'],
    paraTodas: true,
  },
  {
    id: 'preregistro',
    titulo: 'Preregistro se quitó: la paciente nueva se da de alta al agendar',
    texto:
      'En la ventana de la cita, «+ Registrar paciente nueva» pide nombre, apellidos y celular, y si los da, correo, alergias y última menstruación. Avisa si parece que ya está registrada. La doctora que trabaja sin recepción puede hacerlo en su propia agenda si administración le concede el permiso.',
    recorridos: ['cita-formulario'],
  },
  {
    id: 'expediente',
    titulo: 'El expediente es el centro de cada paciente',
    texto:
      'Todo lo de una paciente está en su expediente, por secciones: resumen, consultas, estudios, documentos, imágenes, embarazo, consentimientos y equipo. «Documentos» ya no es una pantalla del menú: vive ahí, y las fotos clínicas y los estudios de imagen se ven juntos en una sola pestaña de Imágenes. Se abre desde Pacientes, el buscador de arriba, la Agenda o la bandeja.',
    recorridos: ['doctora-expediente', 'documentos'],
  },
  {
    id: 'directorio',
    titulo: 'Pacientes es el directorio',
    texto:
      'Cada fila tiene una sola acción principal, «Abrir expediente», igual para todas. En «⋯» quedan Editar ficha, Agendar y Ver sus citas; los archivos se suben desde el expediente.',
    recorridos: ['pacientes'],
  },
  {
    id: 'menu',
    titulo: 'El menú se llama como cada pantalla',
    texto:
      'La doctora encuentra «Mis Consultas» y «Órdenes y resultados» con el mismo nombre que llevan arriba. El mostrador de órdenes de recepción también se llama «Órdenes y resultados», y sólo sale en el menú de recepción: la doctora y administración conservan su bandeja.',
    recorridos: ['doctora-mis-consultas', 'ordenes-resultados', 'recepcion-entrega'],
    paraTodas: true,
  },
  {
    id: 'documentos-y-resultados',
    titulo: 'Documentos y resultados, cada uno en su lugar',
    texto:
      'Los resultados ya no se suben por Documentos: van a su orden de estudio o, si vienen de otro lugar, como estudio externo. Recepción sube en Documentos sólo las referencias y notas de otro médico.',
    recorridos: ['documentos', 'resultado-anexar', 'recepcion-resultados'],
  },
  {
    id: 'fichas',
    titulo: 'Fichas incompletas, sin estorbar',
    texto:
      'Un punto amarillo junto al nombre indica que a la ficha le falta la fecha de nacimiento, y en Pacientes hay un filtro «Fichas incompletas». En la consulta aparece una sola línea gris, «Completa sus datos», que se puede ocultar. Nunca impide agendar ni atender.',
    recorridos: ['pacientes'],
  },
  {
    id: 'mis-consultas',
    titulo: 'Mis Consultas, con páginas y un diseño más limpio',
    texto:
      'Ya no se corta en las primeras 100: se recorre por páginas, con el resumen del día arriba y los filtros a la mano.',
    recorridos: ['doctora-mis-consultas'],
  },
  {
    id: 'bandeja',
    titulo: 'Órdenes y resultados: por paciente y con los atrasados a la vista',
    texto:
      'La bandeja se pliega por paciente, tiene una franja con lo que espera resultado o revisión, los críticos y los atrasados, y cada estudio guarda su rastro con fecha y autor.',
    recorridos: ['ordenes-resultados', 'recepcion-resultados'],
  },
  {
    id: 'resumen',
    titulo: 'Resumen clínico en PDF',
    texto: 'Desde el expediente se genera un resumen clínico de la paciente, con su folio, para imprimir o entregar.',
    recorridos: ['resumen-clinico'],
  },
  {
    id: 'folios',
    titulo: 'Folios con formato nuevo',
    texto:
      'Las recetas, certificados, órdenes y resúmenes que se emiten desde ahora llevan un folio como GYG-REC-2026-0042: clínica, tipo, año y número. Los documentos que ya se entregaron conservan su folio de siempre.',
    recorridos: [],
    paraTodas: true,
  },
  {
    id: 'privacidad',
    titulo: 'Más cuidado con la información clínica',
    texto:
      'Recepción ve y captura la ficha (nombre, contacto, fecha de nacimiento, alergias y última menstruación), las citas y los documentos de referencia, pero no las notas, recetas, resultados, antecedentes ni datos obstétricos. Cada vez que alguien consulta un expediente queda anotado en la bitácora.',
    recorridos: [],
    paraTodas: true,
  },
  {
    id: 'acceso',
    titulo: 'Pantalla de acceso nueva',
    texto:
      'Con el emblema de GEMS y la opción «Recordar mi correo en este equipo», que guarda sólo el correo, nunca la contraseña.',
    recorridos: [],
    paraTodas: true,
  },
]
