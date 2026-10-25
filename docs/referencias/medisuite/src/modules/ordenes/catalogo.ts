// Catálogo local de estudios de laboratorio y gabinete frecuentes en México.
// - Códigos LOINC (https://loinc.org) solo donde se tiene certeza del código; si no, se omiten.
// - Las indicaciones de preparación son orientativas y comunes en laboratorios mexicanos: el paciente debe
//   confirmarlas con el laboratorio o gabinete destino (cada uno puede tener protocolos propios).
// Referencias de preparación: OMS, curva de tolerancia oral a la glucosa (ayuno 8–14 h, dieta habitual ≥150 g
// de carbohidratos los 3 días previos); ATS/ERS 2019 Standardization of Spirometry (Am J Respir Crit Care Med
// 2019;200:e70–e88); ACR Manual on Contrast Media (ayuno y función renal antes de contraste yodado).

export type TipoEstudio = 'laboratorio' | 'gabinete'

export interface Estudio {
  id: string
  nombre: string
  grupo: string
  tipo: TipoEstudio
  loinc?: string
  preparacion?: string
  muestra?: string
  personalizado?: boolean // agregado por la clínica
}

export const PREP: Record<string, string> = {
  ayuno8: 'Ayuno de 8 horas (puede tomar agua natural).',
  ayuno12: 'Ayuno de 9 a 12 horas (solo agua natural); evitar alcohol y comidas muy grasosas el día previo.',
  sinAyuno: 'No requiere ayuno.',
  orina1: 'Primera orina de la mañana, chorro medio, previo aseo genital con agua y jabón, en frasco estéril.',
  urocultivo: 'Primera orina de la mañana, chorro medio, previo aseo genital, frasco estéril. Tomar ANTES de iniciar antibióticos o tras 48–72 h sin ellos (según indique su médico).',
  orina24: 'Recolección de orina de 24 horas: deseche la primera orina del día, recolecte todas las siguientes hasta la primera del día siguiente (inclusive). Mantenga el recipiente en refrigeración.',
  cps: 'Tres muestras de heces de días distintos (serie), en frascos limpios; evitar laxantes y medios de contraste los días previos.',
  heces: 'Muestra de heces reciente en frasco limpio; no mezclar con orina.',
  sangreOculta: 'Siga la dieta indicada por el laboratorio según el método (en pruebas de guayaco: evitar carnes rojas, ciertos vegetales y vitamina C 3 días antes). Las pruebas inmunoquímicas no suelen requerir dieta.',
  embarazoOrina: 'Primera orina de la mañana (más concentrada).',
  coag: 'No requiere ayuno estricto. Informe si toma anticoagulantes o antiagregantes (warfarina, rivaroxabán, apixabán, aspirina, clopidogrel).',
  psa: 'Evitar eyaculación 48 h antes, ciclismo o tacto rectal/procedimientos urológicos recientes (comente con su médico).',
  cortisol: 'Toma matutina (entre 7 y 9 h) salvo otra indicación; informe si usa corticoesteroides.',
  hormonas: 'Toma matutina. En mujeres, la fecha del ciclo puede ser importante: siga la indicación de su médico.',
  tiroides: 'No requiere ayuno. Si toma levotiroxina, tome la muestra antes de la dosis del día. Suspenda biotina 2 días antes (interfiere con el análisis).',
  ctog: 'Ayuno de 8 a 14 horas; dieta habitual (al menos 150 g de carbohidratos al día) los 3 días previos; permanecer sentado y sin fumar durante la prueba (≈ 2–3 h).',
  cultivo: 'Tomar la muestra ANTES de iniciar antibióticos, en lo posible.',
  usgAbdomen: 'Ayuno de 6 a 8 horas (evita gas y contrae la vesícula). Puede tomar sus medicamentos con poca agua.',
  usgPelvico: 'Vejiga llena: tomar 1 litro de agua 1 hora antes del estudio y no orinar hasta terminar (salvo vía transvaginal, que requiere vejiga vacía).',
  usgObst: 'En el primer trimestre: vejiga llena (1 litro de agua 1 h antes). Después del primer trimestre no requiere preparación.',
  usgSinPrep: 'No requiere preparación.',
  usgProstata: 'Vejiga llena: tomar 1 litro de agua 1 hora antes del estudio.',
  mastografia: 'El día del estudio no aplicar desodorante, talco, cremas ni perfume en axilas y mamas. Lleve estudios previos. De preferencia 7–10 días después del inicio de la menstruación.',
  rx: 'No requiere preparación. Retirar objetos metálicos de la zona. Informe si existe posibilidad de embarazo.',
  tacSimple: 'Retirar objetos metálicos. Informe si existe posibilidad de embarazo.',
  tacContraste: 'Ayuno de 4 a 6 horas. Creatinina sérica reciente. Informe alergias a medios de contraste yodado, diabetes con metformina, enfermedad renal o embarazo.',
  rm: 'Retirar todo objeto metálico. Informe si tiene marcapasos, implantes, clips, prótesis, claustrofobia o embarazo. Si lleva contraste (gadolinio): creatinina reciente y ayuno de 4 a 6 h.',
  ecg: 'No requiere preparación. Evitar cremas en el tórax; ropa cómoda.',
  holter: 'Bañarse antes de la colocación (no podrá mojar el equipo 24–48 h). Registre en un diario sus actividades y síntomas.',
  mapa: 'Ropa con manga holgada. Continúe sus actividades y medicamentos habituales salvo otra indicación; registre horarios de sueño y síntomas.',
  eco: 'No requiere preparación. Lleve estudios previos.',
  prueba_esfuerzo: 'Ropa y calzado deportivo. Comida ligera 2–3 h antes. Pregunte a su médico si debe suspender betabloqueadores.',
  espiro: 'No fumar al menos 1 hora antes, no hacer ejercicio vigoroso 1 hora antes, ropa holgada. Su médico le indicará si debe suspender broncodilatadores y por cuánto tiempo (ATS/ERS 2019).',
  densito: 'No tomar suplementos de calcio 24 h antes. Informe estudios recientes con contraste o medicina nuclear.',
  endoscopia: 'Ayuno de 8 horas. Acudir acompañado (sedación).',
  colonoscopia: 'Preparación intestinal con laxante según indicación del gastroenterólogo; dieta de líquidos claros el día previo. Acudir acompañado (sedación).',
  eeg: 'Cabello limpio y seco, sin crema ni gel. Siga las indicaciones sobre sueño y medicamentos.',
  papanicolau: 'No estar menstruando; sin duchas vaginales, óvulos, cremas ni relaciones sexuales 48 h antes.',
}

// id | grupo | tipo (L/G) | nombre | LOINC (opcional) | clave de preparación (opcional) | muestra (opcional)
const RAW = `
bh|Hematología|L|Biometría hemática completa|58410-2|sinAyuno|Sangre total (EDTA)
hb|Hematología|L|Hemoglobina y hematocrito|718-7|sinAyuno|Sangre total (EDTA)
plaq|Hematología|L|Cuenta de plaquetas|777-3|sinAyuno|Sangre total (EDTA)
reti|Hematología|L|Reticulocitos||sinAyuno|Sangre total (EDTA)
vsg|Hematología|L|Velocidad de sedimentación globular (VSG)|4537-7|sinAyuno|Sangre total
frotis|Hematología|L|Frotis de sangre periférica||sinAyuno|Sangre total (EDTA)
grupo|Hematología|L|Grupo sanguíneo ABO|883-9|sinAyuno|Sangre total
rh|Hematología|L|Factor Rh (D)|10331-7|sinAyuno|Sangre total
coombs|Hematología|L|Prueba de Coombs directa||sinAyuno|Sangre total
tp|Coagulación|L|Tiempo de protrombina (TP)|5902-2|coag|Plasma citratado
inr|Coagulación|L|INR|6301-6|coag|Plasma citratado
ttpa|Coagulación|L|Tiempo de tromboplastina parcial activada (TTPa)||coag|Plasma citratado
fibri|Coagulación|L|Fibrinógeno|3255-7|coag|Plasma citratado
dimd|Coagulación|L|Dímero D||coag|Plasma citratado
qs3|Química sanguínea|L|Química sanguínea de 3 elementos (glucosa, urea, creatinina)||ayuno8|Suero
qs4|Química sanguínea|L|Química sanguínea de 4 elementos (glucosa, urea, creatinina, ácido úrico)||ayuno8|Suero
qs6|Química sanguínea|L|Química sanguínea de 6 elementos (glucosa, urea, creatinina, ácido úrico, colesterol y triglicéridos; varía por laboratorio)||ayuno8|Suero
qs24|Química sanguínea|L|Química sanguínea de 24 elementos (perfil bioquímico)||ayuno12|Suero
bmp|Química sanguínea|L|Panel metabólico básico|51990-0|ayuno8|Suero
cmp|Química sanguínea|L|Panel metabólico completo|24323-8|ayuno8|Suero
glu|Química sanguínea|L|Glucosa sérica en ayuno|2345-7|ayuno8|Suero
ctog|Química sanguínea|L|Curva de tolerancia oral a la glucosa 75 g (2 h)||ctog|Suero
glupp|Química sanguínea|L|Glucosa posprandial 2 h||sinAyuno|Suero
a1c|Química sanguínea|L|Hemoglobina glucosilada (HbA1c)|4548-4|sinAyuno|Sangre total (EDTA)
insulina|Química sanguínea|L|Insulina sérica en ayuno|20448-7|ayuno8|Suero
bun|Química sanguínea|L|Nitrógeno ureico en sangre (BUN)|3094-0|ayuno8|Suero
crea|Química sanguínea|L|Creatinina sérica|2160-0|ayuno8|Suero
au|Química sanguínea|L|Ácido úrico|3084-1|ayuno8|Suero
ca|Química sanguínea|L|Calcio sérico|17861-6|ayuno8|Suero
mg|Química sanguínea|L|Magnesio sérico|19123-9|ayuno8|Suero
p|Química sanguínea|L|Fósforo sérico|2777-1|ayuno8|Suero
prot|Química sanguínea|L|Proteínas totales|2885-2|ayuno8|Suero
alb|Química sanguínea|L|Albúmina sérica|1751-7|ayuno8|Suero
amil|Química sanguínea|L|Amilasa sérica|1798-8|ayuno8|Suero
lipasa|Química sanguínea|L|Lipasa sérica|3040-3|ayuno8|Suero
ck|Química sanguínea|L|Creatina fosfocinasa (CPK) total|2157-6|sinAyuno|Suero
ldh|Química sanguínea|L|Deshidrogenasa láctica (DHL)|2532-0|sinAyuno|Suero
lipidos|Perfil de lípidos|L|Perfil de lípidos (colesterol total, HDL, LDL, triglicéridos)|24331-1|ayuno12|Suero
col|Perfil de lípidos|L|Colesterol total|2093-3|ayuno12|Suero
tg|Perfil de lípidos|L|Triglicéridos|2571-8|ayuno12|Suero
hdl|Perfil de lípidos|L|Colesterol HDL|2085-9|ayuno12|Suero
ldl|Perfil de lípidos|L|Colesterol LDL (calculado)|13457-7|ayuno12|Suero
pfh|Función hepática|L|Pruebas de función hepática (PFH)|24325-3|ayuno8|Suero
alt|Función hepática|L|Alanina aminotransferasa (ALT/TGP)|1742-6|ayuno8|Suero
ast|Función hepática|L|Aspartato aminotransferasa (AST/TGO)|1920-8|ayuno8|Suero
fa|Función hepática|L|Fosfatasa alcalina|6768-6|ayuno8|Suero
ggt|Función hepática|L|Gamma glutamil transferasa (GGT)|2324-2|ayuno8|Suero
bili|Función hepática|L|Bilirrubina total|1975-2|ayuno8|Suero
elec|Electrolitos|L|Electrolitos séricos (Na, K, Cl)|24326-1|sinAyuno|Suero
na|Electrolitos|L|Sodio sérico|2951-2|sinAyuno|Suero
k|Electrolitos|L|Potasio sérico|2823-3|sinAyuno|Suero
cl|Electrolitos|L|Cloro sérico|2075-0|sinAyuno|Suero
tiroideo|Perfil tiroideo|L|Perfil tiroideo (TSH, T4 libre, T3)||tiroides|Suero
tsh|Perfil tiroideo|L|Hormona estimulante de tiroides (TSH)|3016-3|tiroides|Suero
t4l|Perfil tiroideo|L|Tiroxina libre (T4L)|3024-7|tiroides|Suero
t3|Perfil tiroideo|L|Triyodotironina total (T3)|3053-6|tiroides|Suero
antitpo|Perfil tiroideo|L|Anticuerpos antiperoxidasa tiroidea (anti-TPO)||tiroides|Suero
pcr|Inflamación e inmunología|L|Proteína C reactiva (PCR)|1988-5|sinAyuno|Suero
fr|Inflamación e inmunología|L|Factor reumatoide|11572-5|sinAyuno|Suero
aslo|Inflamación e inmunología|L|Antiestreptolisinas O (ASLO)|5370-2|sinAyuno|Suero
reacfeb|Inflamación e inmunología|L|Reacciones febriles||sinAyuno|Suero
ana|Inflamación e inmunología|L|Anticuerpos antinucleares (ANA)||sinAyuno|Suero
ferritina|Hierro y vitaminas|L|Ferritina sérica|2276-4|ayuno8|Suero
hierro|Hierro y vitaminas|L|Hierro sérico|2498-4|ayuno8|Suero
perfhierro|Hierro y vitaminas|L|Perfil de hierro (hierro, transferrina, % saturación, ferritina)||ayuno8|Suero
b12|Hierro y vitaminas|L|Vitamina B12|2132-9|ayuno8|Suero
folato|Hierro y vitaminas|L|Ácido fólico sérico|2284-8|ayuno8|Suero
vitd|Hierro y vitaminas|L|25-hidroxivitamina D|1989-3|sinAyuno|Suero
trop|Cardiaco|L|Troponina I|10839-9|sinAyuno|Suero
bnp|Cardiaco|L|Péptido natriurético tipo B (BNP)|30934-4|sinAyuno|Plasma (EDTA)
ntbnp|Cardiaco|L|NT-proBNP|33762-6|sinAyuno|Suero
ego|Orina|L|Examen general de orina (EGO)|24356-8|orina1|Orina
microalb|Orina|L|Microalbuminuria|14957-5|orina1|Orina
acr|Orina|L|Relación albúmina/creatinina en orina|9318-7|orina1|Orina
dep24|Orina|L|Depuración de creatinina en orina de 24 h||orina24|Orina de 24 h y suero
prot24|Orina|L|Proteínas en orina de 24 h||orina24|Orina de 24 h
emb|Embarazo|L|Prueba inmunológica de embarazo en orina|2106-3|embarazoOrina|Orina
bhcg|Embarazo|L|Fracción beta de hormona gonadotropina coriónica (β-hCG) cuantitativa en sangre||sinAyuno|Suero
vih|Infecciosas|L|Prueba de detección de VIH (requiere consentimiento informado)||sinAyuno|Suero
vdrl|Infecciosas|L|VDRL|5292-8|sinAyuno|Suero
hbsag|Infecciosas|L|Antígeno de superficie de hepatitis B (HBsAg)|5196-1|sinAyuno|Suero
vhc|Infecciosas|L|Anticuerpos contra hepatitis C|16128-1|sinAyuno|Suero
vha|Infecciosas|L|Anticuerpos IgM contra hepatitis A||sinAyuno|Suero
toxo|Infecciosas|L|Perfil TORCH||sinAyuno|Suero
covid|Infecciosas|L|PCR para SARS-CoV-2||sinAyuno|Exudado nasofaríngeo
influenza|Infecciosas|L|Prueba rápida de influenza A/B||sinAyuno|Exudado nasofaríngeo
dengue|Infecciosas|L|Antígeno NS1 / anticuerpos para dengue||sinAyuno|Suero
uro|Microbiología|L|Urocultivo con antibiograma|630-4|urocultivo|Orina
hemo|Microbiología|L|Hemocultivo|600-7|cultivo|Sangre
exfar|Microbiología|L|Exudado faríngeo con cultivo||cultivo|Exudado faríngeo
copro|Microbiología|L|Coprocultivo||cultivo|Heces
cps|Coproparasitoscópico|L|Coproparasitoscópico seriado (3 muestras)||cps|Heces
cpsu|Coproparasitoscópico|L|Coproparasitoscópico único||heces|Heces
amiba|Coproparasitoscópico|L|Amiba en fresco||heces|Heces
copol|Coproparasitoscópico|L|Coprológico||heces|Heces
soh|Coproparasitoscópico|L|Sangre oculta en heces|2335-8|sangreOculta|Heces
psa|Hormonas y marcadores|L|Antígeno prostático específico (PSA) total|2857-1|psa|Suero
psal|Hormonas y marcadores|L|PSA libre||psa|Suero
fsh|Hormonas y marcadores|L|Hormona folículo estimulante (FSH)|15067-2|hormonas|Suero
lh|Hormonas y marcadores|L|Hormona luteinizante (LH)|10501-5|hormonas|Suero
prl|Hormonas y marcadores|L|Prolactina|2842-3|hormonas|Suero
e2|Hormonas y marcadores|L|Estradiol|2243-4|hormonas|Suero
testo|Hormonas y marcadores|L|Testosterona total|2986-8|hormonas|Suero
cortisol|Hormonas y marcadores|L|Cortisol sérico matutino|2143-6|cortisol|Suero
ca125|Hormonas y marcadores|L|Antígeno CA-125||sinAyuno|Suero
cea|Hormonas y marcadores|L|Antígeno carcinoembrionario (ACE)||sinAyuno|Suero
pap|Citología|L|Citología cervicovaginal (Papanicolaou)||papanicolau|Exudado cervical
vph|Citología|L|Detección de VPH de alto riesgo||papanicolau|Exudado cervical
rxtorax|Radiología|G|Radiografía de tórax PA||rx|
rxtoraxl|Radiología|G|Radiografía de tórax PA y lateral||rx|
rxabd|Radiología|G|Radiografía simple de abdomen (de pie y decúbito)||rx|
rxcolc|Radiología|G|Radiografía de columna cervical AP y lateral||rx|
rxcoll|Radiología|G|Radiografía de columna lumbosacra AP y lateral||rx|
rxrod|Radiología|G|Radiografía de rodilla AP y lateral||rx|
rxmano|Radiología|G|Radiografía de mano AP y oblicua||rx|
rxsenos|Radiología|G|Radiografía de senos paranasales (Waters)||rx|
rxpelvis|Radiología|G|Radiografía de pelvis AP||rx|
rxedad|Radiología|G|Radiografía de mano izquierda para edad ósea||rx|
usgabd|Ultrasonido|G|Ultrasonido de abdomen superior (hígado y vías biliares)||usgAbdomen|
usgabdc|Ultrasonido|G|Ultrasonido abdominal completo||usgAbdomen|
usgrenal|Ultrasonido|G|Ultrasonido renal y de vías urinarias||usgPelvico|
usgpel|Ultrasonido|G|Ultrasonido pélvico||usgPelvico|
usgtv|Ultrasonido|G|Ultrasonido endovaginal||usgSinPrep|
usgobs|Ultrasonido|G|Ultrasonido obstétrico||usgObst|
usgestr|Ultrasonido|G|Ultrasonido obstétrico estructural (2.º trimestre)||usgSinPrep|
usgmam|Ultrasonido|G|Ultrasonido mamario||usgSinPrep|
usgtir|Ultrasonido|G|Ultrasonido de tiroides||usgSinPrep|
usgprost|Ultrasonido|G|Ultrasonido prostático suprapúbico||usgProstata|
usgtest|Ultrasonido|G|Ultrasonido testicular||usgSinPrep|
usgpb|Ultrasonido|G|Ultrasonido de partes blandas||usgSinPrep|
doppler|Ultrasonido|G|Ultrasonido Doppler venoso de miembros inferiores||usgSinPrep|
dopcar|Ultrasonido|G|Ultrasonido Doppler carotídeo||usgSinPrep|
mastoT|Mastografía|G|Mastografía de tamizaje bilateral||mastografia|
mastoD|Mastografía|G|Mastografía diagnóstica||mastografia|
densito|Mastografía|G|Densitometría ósea (DXA) de columna y cadera||densito|
tacsimple|Tomografía|G|Tomografía de cráneo simple||tacSimple|
taccont|Tomografía|G|Tomografía de abdomen y pelvis contrastada||tacContraste|
tactorax|Tomografía|G|Tomografía de tórax simple||tacSimple|
angiotac|Tomografía|G|Angiotomografía de tórax (protocolo TEP)||tacContraste|
urotac|Tomografía|G|Urotomografía simple||tacSimple|
rmcraneo|Resonancia magnética|G|Resonancia magnética de cráneo||rm|
rmlumbar|Resonancia magnética|G|Resonancia magnética de columna lumbar||rm|
rmrodilla|Resonancia magnética|G|Resonancia magnética de rodilla||rm|
rmhombro|Resonancia magnética|G|Resonancia magnética de hombro||rm|
ecg|Cardiología|G|Electrocardiograma de 12 derivaciones|11524-6|ecg|
eco|Cardiología|G|Ecocardiograma transtorácico||eco|
holter|Cardiología|G|Holter de 24 horas||holter|
mapa|Cardiología|G|Monitoreo ambulatorio de presión arterial (MAPA) 24 h||mapa|
esfuerzo|Cardiología|G|Prueba de esfuerzo||prueba_esfuerzo|
espiro|Neumología|G|Espirometría con broncodilatador||espiro|
eeg|Neurología|G|Electroencefalograma||eeg|
endo|Endoscopia|G|Endoscopia de tubo digestivo alto||endoscopia|
colono|Endoscopia|G|Colonoscopia||colonoscopia|
audio|Otros|G|Audiometría tonal||usgSinPrep|
`

export const CATALOGO: Estudio[] = RAW.trim()
  .split('\n')
  .map((l) => {
    const [id, grupo, t, nombre, loinc, prep, muestra] = l.split('|')
    return {
      id,
      grupo,
      tipo: t === 'G' ? 'gabinete' : 'laboratorio',
      nombre,
      ...(loinc ? { loinc } : {}),
      ...(prep && PREP[prep] ? { preparacion: PREP[prep] } : {}),
      ...(muestra ? { muestra } : {}),
    } as Estudio
  })

/** Paquetes rápidos frecuentes (ids del catálogo). */
export const PAQUETES: { nombre: string; ids: string[] }[] = [
  { nombre: 'Chequeo general', ids: ['bh', 'qs6', 'lipidos', 'ego'] },
  { nombre: 'Control de diabetes', ids: ['glu', 'a1c', 'crea', 'acr', 'lipidos', 'ego'] },
  { nombre: 'Hipertensión', ids: ['bh', 'qs6', 'elec', 'lipidos', 'ego', 'ecg'] },
  { nombre: 'Prenatal 1.er trimestre', ids: ['bh', 'grupo', 'rh', 'glu', 'ego', 'uro', 'vih', 'vdrl', 'hbsag', 'usgobs'] },
  { nombre: 'Prequirúrgicos', ids: ['bh', 'qs3', 'tp', 'ttpa', 'inr', 'grupo', 'rh', 'ego', 'rxtorax', 'ecg'] },
  { nombre: 'Tiroides', ids: ['tiroideo', 'antitpo', 'usgtir'] },
]

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Búsqueda por nombre, grupo, id o LOINC (insensible a acentos). */
export function buscarEstudios(lista: Estudio[], q: string, limite = 30): Estudio[] {
  const t = norm(q)
  if (!t) return lista.slice(0, limite)
  const palabras = t.split(/\s+/)
  return lista
    .filter((e) => {
      const h = norm(`${e.nombre} ${e.grupo} ${e.id} ${e.loinc ?? ''}`)
      return palabras.every((p) => h.includes(p))
    })
    .slice(0, limite)
}

/** Combina el catálogo base con los estudios agregados por la clínica (los de la clínica pueden sobrescribir por id). */
export function catalogoCompleto(extra: Estudio[]): Estudio[] {
  const m = new Map(CATALOGO.map((e) => [e.id, e]))
  for (const e of extra) if (e?.id && e.nombre) m.set(e.id, { ...e, personalizado: true })
  return [...m.values()]
}
