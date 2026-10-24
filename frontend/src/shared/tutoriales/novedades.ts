/**
 * «Novedades» de Cortex en el centro de ayuda.
 *
 * Dice qué se movió y a dónde. Nunca se abre sola: la franja del encabezado
 * lo avisa una vez por usuaria y la página vive en el «?». Cada novedad enlaza
 * a su recorrido guiado; `recorridos` es una lista de candidatos porque el
 * recorrido que explica un cambio depende del rol (la bienvenida del médico
 * no es la de recepción). Una novedad cuyo recorrido nadie del rol puede ver
 * no se le muestra, salvo las marcadas `paraTodas`.
 *
 * Al cambiar de versión se cambia `VERSION_NOVEDADES`: la franja vuelve a
 * salir una vez para cada usuaria.
 */
export const VERSION_NOVEDADES = '0.1.0'

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
    id: 'cortex',
    titulo: 'Bienvenido a Cortex',
    texto:
      'Cortex es el sistema clínico del consultorio de neurocirugía: agenda, triage, consulta, expediente, recetas, órdenes de estudio, consentimientos y cobros, con una identidad nueva. Todo lo que ya sabías hacer sigue en el mismo lugar.',
    recorridos: ['bienvenida-doctora', 'bienvenida-recepcion', 'bienvenida-administracion'],
    paraTodas: true,
  },
  {
    id: 'ficha-neurologica',
    titulo: 'Ficha neurológica del paciente',
    texto:
      'La ficha registra lateralidad, antecedentes neurológicos y neuroquirúrgicos, implantes y dispositivos (deciden si una resonancia es segura) y anticoagulantes. Los captura el médico en el expediente.',
    recorridos: ['doctora-expediente'],
  },
  {
    id: 'cirugias',
    titulo: 'Cirugías programadas en tu inicio',
    texto:
      'En «Pendientes y seguimiento» ves las cirugías de las próximas dos semanas, con el procedimiento y la hora. Un clic abre el expediente del paciente.',
    recorridos: ['doctora-dashboard'],
  },
  {
    id: 'catalogo-neuro',
    titulo: 'Órdenes y consentimientos de neurocirugía',
    texto:
      'Las plantillas de órdenes traen protocolos de neurocirugía (prequirúrgico, resonancia de encéfalo, columna, epilepsia, nervio periférico y vascular) y las categorías Neuroimagen y Neurofisiología. Los consentimientos son los de craneotomía, columna, derivación, biopsia estereotáctica, dolor, nervio periférico y punción lumbar.',
    recorridos: ['ordenes-resultados'],
  },
]
