// Plantillas de nota clínica: prellenan S/O/A/P con encabezados guía
export interface Plantilla {
  id: string
  nombre: string
  descripcion: string
  s: string
  o: string
  a: string
  p: string
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'SOAP',
    nombre: 'SOAP',
    descripcion: 'Nota general de consulta',
    s: 'Motivo de consulta: \nPadecimiento actual: \n',
    o: 'Exploración física: \n',
    a: 'Impresión diagnóstica: \n',
    p: 'Tratamiento: \nEstudios: \nIndicaciones y signos de alarma: \nCita de control: \n',
  },
  {
    id: 'Historia clínica',
    nombre: 'Historia clínica (NOM-004)',
    descripcion: 'Primera vez: interrogatorio completo y exploración por aparatos',
    s:
      'Ficha de identificación: \n' +
      'Motivo de consulta: \n' +
      'Antecedentes heredofamiliares: \n' +
      'Antecedentes personales no patológicos (alimentación, actividad física, tabaquismo, alcoholismo, toxicomanías, vivienda, inmunizaciones): \n' +
      'Antecedentes personales patológicos (crónico-degenerativos, quirúrgicos, traumáticos, transfusionales, alérgicos, hospitalizaciones): \n' +
      'Antecedentes gineco-obstétricos (menarca, ritmo, FUM, G/P/C/A, MPF, citología): \n' +
      'Padecimiento actual: \n' +
      'Interrogatorio por aparatos y sistemas: \n',
    o:
      'Habitus exterior: \n' +
      'Cabeza y cuello: \n' +
      'Tórax (cardiopulmonar): \n' +
      'Abdomen: \n' +
      'Genitales (si aplica): \n' +
      'Extremidades: \n' +
      'Neurológico: \n' +
      'Resultados de laboratorio y gabinete previos: \n',
    a: 'Diagnósticos o problemas clínicos: \nPronóstico: \n',
    p: 'Tratamiento farmacológico: \nMedidas generales: \nEstudios solicitados: \nInterconsultas: \nCita de seguimiento: \n',
  },
  {
    id: 'Evolución',
    nombre: 'Nota de evolución',
    descripcion: 'Consulta subsecuente',
    s: 'Evolución desde la última consulta: \nApego al tratamiento: \nEfectos adversos: \n',
    o: 'Exploración física dirigida: \nResultados de estudios recientes: \n',
    a: 'Evolución del cuadro (mejoría / sin cambios / deterioro): \nActualización de diagnósticos: \n',
    p: 'Ajustes al tratamiento: \nEstudios: \nPronóstico: \nPróxima cita: \n',
  },
  {
    id: 'Pediatría – niño sano',
    nombre: 'Pediatría – niño sano',
    descripcion: 'Control de crecimiento y desarrollo',
    s:
      'Acompañante / informante: \n' +
      'Alimentación (lactancia, ablactación, dieta actual): \n' +
      'Sueño: \nEvacuaciones y micciones: \n' +
      'Desarrollo psicomotor (hitos para la edad): \n' +
      'Esquema de vacunación (Cartilla Nacional de Salud): \n' +
      'Preocupaciones de los padres: \n',
    o:
      'Somatometría: peso, talla, perímetro cefálico y percentiles OMS: \n' +
      'Fontanelas / cráneo: \nOjos (reflejo rojo), oídos, boca: \nCardiopulmonar: \nAbdomen: \nGenitales: \nCaderas (Ortolani/Barlow si aplica): \nPiel: \nNeurológico: \n',
    a: 'Estado de nutrición: \nCrecimiento y desarrollo: \n',
    p: 'Orientación alimentaria: \nEstimulación temprana: \nVacunas aplicadas / pendientes: \nPrevención de accidentes: \nSignos de alarma: \nPróxima cita: \n',
  },
  {
    id: 'Control prenatal',
    nombre: 'Control prenatal',
    descripcion: 'Consulta de embarazo (NOM-007)',
    s:
      'FUM: \nSemanas de gestación (por FUM / USG): \nFPP: \n' +
      'Gesta / Para / Cesáreas / Abortos: \n' +
      'Movimientos fetales: \n' +
      'Síntomas (náusea, cefalea, fosfenos, acúfenos, edema, sangrado, pérdida de líquido, disuria, contracciones): \n' +
      'Suplementación (ácido fólico, hierro, calcio): \n',
    o: 'Fondo uterino (cm): \nFrecuencia cardiaca fetal (lpm): \nPresentación / situación: \nEdema: \nReflejos: \nLaboratorios (BH, glucosa, EGO, VIH, VDRL, grupo y Rh): \n',
    a: 'Embarazo de __ SDG, normoevolutivo / con riesgo: \nFactores de riesgo: \n',
    p: 'Suplementación: \nEstudios del trimestre: \nVacunación (Td/Tdpa, influenza): \nPlan de parto / lactancia: \nSignos de alarma obstétrica explicados: \nPróxima cita: \n',
  },
  {
    id: 'Salud mental',
    nombre: 'Salud mental',
    descripcion: 'Valoración psiquiátrica / psicológica',
    s:
      'Motivo de consulta: \n' +
      'Estado de ánimo, sueño, apetito, energía: \n' +
      'Ansiedad / preocupaciones: \n' +
      'Consumo de sustancias: \n' +
      'Ideación suicida u homicida (explorar siempre): \n' +
      'Red de apoyo y estresores: \n',
    o:
      'Examen mental: apariencia, conducta, lenguaje, afecto, pensamiento (curso y contenido), percepción, orientación, juicio e introspección: \n' +
      'Escalas aplicadas (PHQ-9, GAD-7): \n',
    a: 'Impresión diagnóstica: \nRiesgo (bajo / moderado / alto): \n',
    p: 'Tratamiento farmacológico: \nPsicoterapia / referencia: \nPlan de seguridad: \nLínea de la Vida 800 911 2000 proporcionada: \nPróxima cita: \n',
  },
  {
    id: 'Urgencias',
    nombre: 'Urgencias',
    descripcion: 'Atención inmediata y triage',
    s: 'Motivo de atención y hora de inicio: \nMecanismo (si trauma): \nSíntomas acompañantes: \nAMPLE (alergias, medicamentos, patológicos, última comida, eventos): \n',
    o: 'Triage: \nABCDE: \nGlasgow: \nExploración dirigida: \nEstudios en urgencias: \n',
    a: 'Diagnóstico de urgencia: \nGravedad: \n',
    p: 'Manejo inicial: \nProcedimientos: \nDestino (alta / observación / hospitalización / traslado): \nIndicaciones y signos de alarma: \n',
  },
]

export const plantillaPorId = (id: string) => PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[0]
