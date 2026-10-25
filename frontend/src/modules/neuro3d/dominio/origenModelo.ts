/**
 * De dónde sale la columna o el encéfalo que se ve en Neuro 3D. Cada origen
 * lleva su propio aviso: sólo «tc» es la anatomía real del paciente.
 */
export type OrigenModelo = 'esquematico' | 'radiografia' | 'tc'

export const AVISO_ORIGEN: Record<OrigenModelo, string> = {
  esquematico: 'Modelo esquemático con fines educativos; no representa la anatomía de este paciente ni sustituye su estudio de imagen.',
  radiografia: 'Aproximación desde radiografía: el modelo esquemático se ajustó a las medidas del paciente. La forma de cada vértebra no es la suya.',
  tc: 'Reconstrucción automática desde el estudio del paciente. Revísala contra las imágenes originales antes de usarla para decidir.',
}
