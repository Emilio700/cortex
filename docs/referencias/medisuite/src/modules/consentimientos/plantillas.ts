// Plantillas de consentimiento informado. Marcadores: {{paciente}}, {{edad}}, {{medico}}, {{cedula}},
// {{especialidad}}, {{clinica}}, {{direccion}}, {{fecha}}, {{procedimiento}}, {{riesgos}}, {{beneficios}}, {{alternativas}}
// Basadas en los elementos mínimos de la NOM-004-SSA3-2012 (carta de consentimiento bajo información)
// y la LFPDPPP. Deben revisarse por el área legal antes de su uso real.

export interface Plantilla {
  id: string
  titulo: string
  campos: ('procedimiento' | 'riesgos' | 'beneficios' | 'alternativas')[]
  defaults?: Partial<Record<'procedimiento' | 'riesgos' | 'beneficios' | 'alternativas', string>>
  texto: string
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'general',
    titulo: 'Carta de consentimiento informado para atención médica',
    campos: [],
    texto: `En {{direccion}}, a {{fecha}}.

Yo, {{paciente}}, de {{edad}} de edad, en pleno uso de mis facultades, declaro que he sido informado(a) de manera clara, suficiente y en lenguaje comprensible por {{medico}}, {{especialidad}}, con cédula profesional {{cedula}}, sobre mi estado de salud, los estudios diagnósticos y los tratamientos que me han sido propuestos, sus beneficios, riesgos y alternativas.

Autorizo la realización de la historia clínica, exploración física, toma de signos vitales y los procedimientos diagnósticos y terapéuticos de bajo riesgo que se requieran durante mi atención en {{clinica}}.

Entiendo que la medicina no es una ciencia exacta y que no se me han garantizado resultados. Autorizo al personal de salud para atender contingencias y urgencias derivadas del acto autorizado, atendiendo al principio de libertad prescriptiva.

Se me ha informado que puedo revocar este consentimiento en cualquier momento antes de la realización de un procedimiento, sin que ello afecte mi derecho a recibir atención. Mis datos serán tratados conforme al aviso de privacidad del consultorio.

He leído y comprendido este documento, se me han resuelto todas mis dudas y otorgo mi consentimiento de forma libre y voluntaria.`,
  },
  {
    id: 'procedimiento',
    titulo: 'Consentimiento informado para procedimiento',
    campos: ['procedimiento', 'riesgos', 'beneficios', 'alternativas'],
    defaults: {
      procedimiento: 'Escisión de lesión cutánea con anestesia local',
      riesgos: 'Dolor, sangrado, hematoma, infección de la herida, cicatriz hipertrófica o queloide, reacción alérgica al anestésico local, recurrencia de la lesión.',
      beneficios: 'Retiro de la lesión y obtención de tejido para estudio histopatológico.',
      alternativas: 'Vigilancia clínica, crioterapia o electrofulguración, según el caso.',
    },
    texto: `En {{direccion}}, a {{fecha}}.

Yo, {{paciente}}, de {{edad}} de edad, autorizo a {{medico}}, {{especialidad}}, con cédula profesional {{cedula}}, y al personal que designe, a realizarme el siguiente procedimiento:

PROCEDIMIENTO: {{procedimiento}}

Se me ha explicado en qué consiste, el motivo por el que se indica y lo que se espera obtener.

BENEFICIOS ESPERADOS: {{beneficios}}

RIESGOS Y POSIBLES COMPLICACIONES: {{riesgos}}

ALTERNATIVAS: {{alternativas}}

Entiendo que durante el procedimiento pueden presentarse situaciones imprevistas que requieran medidas distintas a las planeadas, por lo que autorizo al médico a atender dichas contingencias y urgencias conforme a su criterio profesional.

Declaro que he informado verazmente sobre mis antecedentes, alergias y medicamentos. Comprendo que puedo revocar este consentimiento antes del procedimiento. He leído este documento, he podido hacer preguntas y todas fueron respondidas a mi satisfacción.`,
  },
  {
    id: 'telemedicina',
    titulo: 'Consentimiento informado para atención por telemedicina',
    campos: [],
    texto: `A {{fecha}}.

Yo, {{paciente}}, acepto recibir atención médica a distancia (videoconsulta, llamada o mensajería) por parte de {{medico}}, {{especialidad}}, con cédula profesional {{cedula}}, de {{clinica}}.

Se me ha informado que:
1. La telemedicina tiene limitaciones: no permite una exploración física completa, por lo que el médico puede indicarme acudir a consulta presencial o a un servicio de urgencias.
2. La calidad de la atención depende de la conexión a internet y de los dispositivos utilizados; si la comunicación se interrumpe se intentará restablecerla o reprogramar la consulta.
3. La sesión se realiza mediante plataformas con medidas de seguridad razonables; aun así, existe un riesgo residual de acceso no autorizado a la información.
4. La consulta no será grabada sin mi autorización expresa. La información se integrará a mi expediente clínico conforme a la NOM-004-SSA3-2012.
5. Me comprometo a estar en un lugar privado, a proporcionar información veraz y a identificarme al inicio de la sesión.
6. En caso de urgencia debo acudir al servicio de urgencias más cercano o llamar al 911.

Puedo retirar este consentimiento en cualquier momento. He comprendido lo anterior y acepto la atención por telemedicina.`,
  },
  {
    id: 'fotografias',
    titulo: 'Autorización para uso de fotografías clínicas',
    campos: ['procedimiento'],
    defaults: { procedimiento: 'Seguimiento de la evolución clínica (antes y después del tratamiento)' },
    texto: `A {{fecha}}.

Yo, {{paciente}}, autorizo a {{medico}}, con cédula profesional {{cedula}}, a tomar fotografías y/o videos clínicos de mi persona con la finalidad de: {{procedimiento}}.

Marque o indique las finalidades autorizadas:
( ) Integración a mi expediente clínico y seguimiento médico.
( ) Interconsulta con otros profesionales de la salud, protegiendo mi identidad.
( ) Fines docentes, académicos o de publicación científica, sin mostrar rasgos que permitan identificarme.

Entiendo que las imágenes forman parte de mi expediente clínico, que serán resguardadas con medidas de seguridad y que no se utilizarán con fines publicitarios ni se difundirán en redes sociales sin mi consentimiento expreso y por separado.

Puedo revocar esta autorización en cualquier momento mediante solicitud por escrito, sin que ello afecte mi atención médica. La revocación no tendrá efectos sobre el uso realizado previamente con mi autorización.`,
  },
  {
    id: 'privacidad',
    titulo: 'Aviso de privacidad integral (LFPDPPP)',
    campos: [],
    texto: `{{medico}}, con domicilio en {{direccion}} (en adelante, "el Responsable"), es responsable del tratamiento de sus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).

DATOS QUE RECABAMOS: datos de identificación y contacto; datos patrimoniales para facturación; y datos personales sensibles relativos a su estado de salud presente y pasado, antecedentes, estudios, imágenes clínicas, diagnóstico y tratamiento.

FINALIDADES PRIMARIAS: prestación de servicios médicos; integración y conservación del expediente clínico conforme a la NOM-004-SSA3-2012; emisión de recetas, estudios y referencias; facturación y cobranza; seguimiento de su tratamiento y recordatorios de citas.

FINALIDADES SECUNDARIAS: encuestas de calidad y envío de información de salud. Si no desea que sus datos se usen para estas finalidades, indíquelo: ( ) No acepto finalidades secundarias.

TRANSFERENCIAS: sus datos podrán compartirse sin su consentimiento sólo en los casos del artículo 37 de la LFPDPPP, por ejemplo con laboratorios o instituciones de salud para su diagnóstico o tratamiento, autoridades sanitarias cuando la ley lo exija, y aseguradoras cuando usted lo solicite.

DERECHOS ARCO: usted puede ejercer sus derechos de Acceso, Rectificación, Cancelación y Oposición, así como revocar su consentimiento, mediante solicitud en el domicilio del Responsable o al correo electrónico del consultorio. La solicitud se responderá en un plazo máximo de 20 días hábiles.

CAMBIOS AL AVISO: cualquier modificación se informará en el consultorio.

CONSENTIMIENTO: Yo, {{paciente}}, consiento que mis datos personales, incluidos los sensibles, sean tratados conforme a este aviso de privacidad.

Fecha: {{fecha}}.`,
  },
]

export function rellenar(texto: string, vars: Record<string, string>) {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k]?.trim() || '________________')
}
