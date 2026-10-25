// Catálogo local CIE-10 (OMS) con los diagnósticos más frecuentes en consulta de primer contacto en México.
// Formato: código | nombre | sinónimos coloquiales separados por ";"
const RAW = `
A09|Diarrea y gastroenteritis de presunto origen infeccioso|diarrea;gastroenteritis;chorro;infeccion intestinal;deposiciones liquidas
A08.4|Infección intestinal viral, sin otra especificación|gastroenteritis viral;rotavirus
A05.9|Intoxicación alimentaria bacteriana, no especificada|intoxicacion por alimentos;comida en mal estado
A01.0|Fiebre tifoidea|tifoidea
A06.0|Disentería amebiana aguda|amibiasis;amibas
A07.1|Giardiasis [lambliasis]|giardia
A15.0|Tuberculosis del pulmón, confirmada por hallazgo microscópico del bacilo tuberculoso en esputo|tuberculosis;tb;fimico
A37.9|Tos ferina, no especificada|tosferina;pertussis
A46|Erisipela|
A49.9|Infección bacteriana, no especificada|
A63.0|Verrugas anogenitales (venéreas)|condilomas;vph
A90|Fiebre del dengue [dengue clásico]|dengue
A91|Fiebre del dengue hemorrágico|dengue grave
A92.0|Enfermedad por virus Chikungunya|chikungunya
B00.1|Dermatitis vesicular debida al virus del herpes simple|herpes labial;fuegos;fuego en la boca
B01.9|Varicela sin complicaciones|varicela;viruela loca
B02.9|Herpes zóster sin complicaciones|culebrilla;zoster
B05.9|Sarampión sin complicaciones|sarampion
B06.9|Rubéola sin complicaciones|rubeola
B07|Verrugas víricas|verrugas;mezquinos
B08.4|Estomatitis vesicular enteroviral con exantema|mano pie boca
B15.9|Hepatitis aguda tipo A, sin coma hepático|hepatitis a
B18.1|Hepatitis viral tipo B crónica, sin agente delta|hepatitis b
B18.2|Hepatitis viral tipo C crónica|hepatitis c
B24|Enfermedad por virus de la inmunodeficiencia humana [VIH], sin otra especificación|vih;sida
B27.9|Mononucleosis infecciosa, no especificada|mononucleosis;enfermedad del beso
B34.9|Infección viral, no especificada|virosis;virus
B35.1|Tiña de las uñas|onicomicosis;hongos en las unas
B35.3|Tiña del pie|pie de atleta;hongos en los pies
B35.4|Tiña del cuerpo|tina;hongos en la piel
B36.0|Pitiriasis versicolor|manchas blancas;paño blanco
B37.0|Estomatitis candidiásica|algodoncillo;candidiasis oral
B37.3|Candidiasis de la vulva y de la vagina|candidiasis vaginal;hongos vaginales
B77.9|Ascariasis, no especificada|lombrices;ascaris
B80|Enterobiasis|oxiuros;lombrices
B82.9|Parasitosis intestinal, sin otra especificación|parasitos;bichos;desparasitar
B85.0|Pediculosis debida a Pediculus humanus capitis|piojos
B86|Escabiosis|sarna;rona
U07.1|COVID-19, virus identificado|covid;coronavirus;sars-cov-2
U07.2|COVID-19, virus no identificado|covid sospechoso
C16.9|Tumor maligno del estómago, parte no especificada|cancer de estomago
C18.9|Tumor maligno del colon, parte no especificada|cancer de colon
C34.9|Tumor maligno de los bronquios o del pulmón, parte no especificada|cancer de pulmon
C44.9|Tumor maligno de la piel, sitio no especificado|cancer de piel
C50.9|Tumor maligno de la mama, parte no especificada|cancer de mama
C53.9|Tumor maligno del cuello del útero, sin otra especificación|cancer cervicouterino
C61|Tumor maligno de la próstata|cancer de prostata
C91.0|Leucemia linfoblástica aguda|leucemia
D17.9|Tumor benigno lipomatoso, de sitio no especificado|lipoma;bolita de grasa
D22.9|Nevo melanocítico, sitio no especificado|lunar
D24|Tumor benigno de la mama|fibroadenoma
D25.9|Leiomioma del útero, sin otra especificación|miomas;mioma
D50.9|Anemia por deficiencia de hierro sin otra especificación|anemia ferropenica;falta de hierro
D64.9|Anemia de tipo no especificado|anemia
D69.6|Trombocitopenia no especificada|plaquetas bajas
E03.9|Hipotiroidismo, no especificado|tiroides;hipotiroidismo
E04.9|Bocio no tóxico, no especificado|bocio
E05.9|Tirotoxicosis, no especificada|hipertiroidismo
E06.3|Tiroiditis autoinmune|hashimoto
E10.9|Diabetes mellitus tipo 1, sin complicaciones|diabetes tipo 1;dm1;azucar
E11.9|Diabetes mellitus tipo 2 sin complicaciones|diabetes;azucar;azucar alta;dm2;diabetico
E11.2|Diabetes mellitus tipo 2 con complicaciones renales|nefropatia diabetica;azucar
E11.3|Diabetes mellitus tipo 2 con complicaciones oftálmicas|retinopatia diabetica;azucar
E11.4|Diabetes mellitus tipo 2 con complicaciones neurológicas|neuropatia diabetica;azucar
E11.5|Diabetes mellitus tipo 2 con complicaciones circulatorias periféricas|pie diabetico;azucar
E11.6|Diabetes mellitus tipo 2 con otras complicaciones especificadas|azucar
E16.2|Hipoglucemia, no especificada|azucar baja;bajon de azucar
E28.2|Síndrome de ovario poliquístico|sop;ovario poliquistico
E44.0|Desnutrición proteicocalórica moderada|desnutricion
E46|Desnutrición proteicocalórica, no especificada|desnutricion
E55.9|Deficiencia de vitamina D, no especificada|vitamina d baja
E66.0|Obesidad debida a exceso de calorías|obesidad;gordura
E66.9|Obesidad, no especificada|obesidad;sobrepeso;gordura;peso alto
E73.9|Intolerancia a la lactosa, no especificada|lactosa;leche
E78.0|Hipercolesterolemia pura|colesterol alto;colesterol
E78.1|Hipergliceridemia pura|trigliceridos altos;trigliceridos
E78.2|Hiperlipidemia mixta|colesterol y trigliceridos altos
E78.5|Hiperlipidemia no especificada|dislipidemia;colesterol;grasa en la sangre
E79.0|Hiperuricemia sin signos de artritis inflamatoria y enfermedad tofácea|acido urico alto
E86|Depleción del volumen|deshidratacion
E87.6|Hipopotasemia|potasio bajo
F03|Demencia, no especificada|demencia;perdida de memoria
F10.2|Trastornos mentales y del comportamiento debidos al uso de alcohol: síndrome de dependencia|alcoholismo
F17.2|Trastornos mentales y del comportamiento debidos al uso de tabaco: síndrome de dependencia|tabaquismo;fumar
F20.9|Esquizofrenia, no especificada|esquizofrenia
F31.9|Trastorno afectivo bipolar, no especificado|bipolar
F32.0|Episodio depresivo leve|depresion leve
F32.1|Episodio depresivo moderado|depresion moderada
F32.9|Episodio depresivo, no especificado|depresion;tristeza;deprimido
F33.9|Trastorno depresivo recurrente, no especificado|depresion recurrente
F41.0|Trastorno de pánico [ansiedad paroxística episódica]|ataques de panico;panico
F41.1|Trastorno de ansiedad generalizada|ansiedad;nervios;tag;angustia
F41.2|Trastorno mixto de ansiedad y depresión|ansiedad y depresion
F41.9|Trastorno de ansiedad, no especificado|ansiedad;nervios
F42.9|Trastorno obsesivo-compulsivo, no especificado|toc
F43.1|Trastorno de estrés postraumático|tept;trauma
F43.2|Trastornos de adaptación|estres;duelo
F50.0|Anorexia nerviosa|anorexia
F50.2|Bulimia nerviosa|bulimia
F51.0|Insomnio no orgánico|insomnio;no puedo dormir
F84.0|Autismo en la niñez|autismo;tea
F90.0|Perturbación de la actividad y de la atención|tdah;hiperactividad;deficit de atencion
G20|Enfermedad de Parkinson|parkinson
G30.9|Enfermedad de Alzheimer, no especificada|alzheimer
G35|Esclerosis múltiple|esclerosis multiple
G40.9|Epilepsia, tipo no especificado|epilepsia;convulsiones;ataques
G43.0|Migraña sin aura [migraña común]|migrana
G43.9|Migraña, no especificada|migrana;jaqueca
G44.2|Cefalea debida a tensión|dolor de cabeza tensional;cefalea tensional
G45.9|Ataque isquémico cerebral transitorio, sin otra especificación|ait;isquemia transitoria
G47.0|Trastornos del inicio y del mantenimiento del sueño [insomnios]|insomnio;no puedo dormir
G47.3|Apnea del sueño|apnea;ronquido
G51.0|Parálisis de Bell|paralisis facial
G56.0|Síndrome del túnel carpiano|tunel carpiano;manos dormidas
G62.9|Polineuropatía, no especificada|neuropatia;hormigueo
G80.9|Parálisis cerebral, sin otra especificación|paralisis cerebral
H00.0|Orzuelo y otras inflamaciones profundas del párpado|perrilla;orzuelo
H01.0|Blefaritis|parpados inflamados
H10.3|Conjuntivitis aguda, no especificada|conjuntivitis;ojo rojo
H10.9|Conjuntivitis, no especificada|conjuntivitis;ojo rojo;laganas
H25.9|Catarata senil, no especificada|catarata;nube en el ojo
H40.9|Glaucoma, no especificado|glaucoma
H52.1|Miopía|miopia;no veo de lejos
H52.4|Presbicia|vista cansada;presbicia
H60.9|Otitis externa, sin otra especificación|otitis externa;oido de nadador
H61.2|Cerumen impactado|cerilla;tapon de cera
H65.9|Otitis media no supurativa, sin otra especificación|otitis serosa
H66.9|Otitis media, no especificada|otitis;dolor de oido
H81.1|Vértigo paroxístico benigno|vertigo;vppb
H91.9|Hipoacusia, no especificada|sordera;no oigo
H93.1|Tinnitus|zumbido de oidos;acufeno
I10|Hipertensión esencial (primaria)|presion alta;presion;hipertension;has;hta
I11.9|Enfermedad cardíaca hipertensiva sin insuficiencia cardíaca (congestiva)|cardiopatia hipertensiva;presion
I20.9|Angina de pecho, no especificada|angina
I21.9|Infarto agudo del miocardio, sin otra especificación|infarto;iam;ataque al corazon
I25.1|Enfermedad aterosclerótica del corazón|cardiopatia isquemica;coronarias
I25.9|Enfermedad isquémica crónica del corazón, no especificada|cardiopatia isquemica
I26.9|Embolia pulmonar sin mención de corazón pulmonar agudo|tromboembolia pulmonar;tep
I48|Fibrilación y aleteo auricular|fibrilacion auricular;fa
I49.9|Arritmia cardíaca, no especificada|arritmia
I50.9|Insuficiencia cardíaca, no especificada|insuficiencia cardiaca;falla cardiaca;corazon crecido
I63.9|Infarto cerebral, no especificado|evc isquemico;embolia;derrame
I64|Accidente vascular encefálico agudo, no especificado como hemorrágico o isquémico|evc;derrame cerebral;embolia
I73.9|Enfermedad vascular periférica, no especificada|mala circulacion
I80.2|Flebitis y tromboflebitis de otros vasos profundos de los miembros inferiores|trombosis venosa profunda;tvp
I83.9|Venas varicosas de los miembros inferiores sin úlcera ni inflamación|varices;varices
I95.9|Hipotensión, no especificada|presion baja
J00|Rinofaringitis aguda [resfriado común]|gripa;resfriado;catarro;resfrio;mocos
J01.9|Sinusitis aguda, no especificada|sinusitis
J02.0|Faringitis estreptocócica|faringitis estreptococica;estreptococo
J02.9|Faringitis aguda, no especificada|dolor de garganta;faringitis;garganta irritada
J03.9|Amigdalitis aguda, no especificada|anginas;amigdalitis;placas en la garganta
J04.0|Laringitis aguda|laringitis;afonia;ronquera
J05.0|Laringitis obstructiva aguda [crup]|crup;tos de perro
J06.9|Infección aguda de las vías respiratorias superiores, no especificada|ira;infeccion respiratoria;gripa;resfriado
J10.1|Influenza con otras manifestaciones respiratorias, debida a virus de la influenza identificado|influenza;gripe
J11.1|Influenza con otras manifestaciones respiratorias, virus no identificado|influenza;gripe
J12.9|Neumonía viral, no especificada|neumonia viral
J18.9|Neumonía, no especificada|neumonia;pulmonia
J20.9|Bronquitis aguda, no especificada|bronquitis;tos con flemas
J21.9|Bronquiolitis aguda, no especificada|bronquiolitis
J30.4|Rinitis alérgica, no especificada|rinitis alergica;alergia nasal;estornudos
J31.0|Rinitis crónica|rinitis
J32.9|Sinusitis crónica, no especificada|sinusitis cronica
J34.2|Desviación del tabique nasal|tabique desviado
J35.0|Amigdalitis crónica|anginas cronicas
J40|Bronquitis, no especificada como aguda o crónica|bronquitis
J44.1|Enfermedad pulmonar obstructiva crónica con exacerbación aguda, no especificada|epoc exacerbado
J44.9|Enfermedad pulmonar obstructiva crónica, no especificada|epoc;enfisema;bronquitis cronica
J45.0|Asma predominantemente alérgica|asma alergica
J45.9|Asma, no especificada|asma;bronquitis asmatica;silbido de pecho
J46|Estado asmático|crisis asmatica;ataque de asma
J96.0|Insuficiencia respiratoria aguda|insuficiencia respiratoria
K02.9|Caries dental, no especificada|caries;muela picada
K04.7|Absceso periapical sin fístula|absceso dental;muela infectada
K05.0|Gingivitis aguda|encias inflamadas;gingivitis
K05.1|Gingivitis crónica|gingivitis
K12.0|Estomatitis aftosa recurrente|aftas;llagas en la boca;fuegos
K21.0|Enfermedad del reflujo gastroesofágico con esofagitis|esofagitis;reflujo
K21.9|Enfermedad del reflujo gastroesofágico sin esofagitis|reflujo;agruras;erge
K25.9|Úlcera gástrica, no especificada como aguda ni crónica, sin hemorragia ni perforación|ulcera gastrica;ulcera
K26.9|Úlcera duodenal, no especificada como aguda ni crónica, sin hemorragia ni perforación|ulcera duodenal
K29.5|Gastritis crónica, no especificada|gastritis cronica
K29.7|Gastritis, no especificada|gastritis;ardor de estomago;dolor de estomago
K30|Dispepsia|indigestion;empacho;dispepsia
K37|Apendicitis, no especificada|apendicitis
K40.9|Hernia inguinal unilateral o no especificada, sin obstrucción ni gangrena|hernia inguinal
K42.9|Hernia umbilical sin obstrucción ni gangrena|hernia umbilical;ombligo salido
K43.9|Hernia ventral sin obstrucción ni gangrena|eventracion;hernia
K44.9|Hernia diafragmática sin obstrucción ni gangrena|hernia hiatal
K52.9|Colitis y gastroenteritis no infecciosas, no especificadas|colitis
K57.3|Enfermedad diverticular del intestino grueso sin perforación ni absceso|diverticulos;diverticulosis
K58.9|Síndrome del colon irritable sin diarrea|colon irritable;colitis nerviosa;inflamacion
K59.0|Constipación|estrenimiento;constipacion
K60.2|Fisura anal, no especificada|fisura anal
K64.9|Hemorroides, no especificadas|hemorroides;almorranas
K70.3|Cirrosis hepática alcohólica|cirrosis alcoholica
K74.6|Otras cirrosis del hígado y las no especificadas|cirrosis
K76.0|Degeneración grasa del hígado, no clasificada en otra parte|higado graso;esteatosis
K80.2|Cálculo de la vesícula biliar sin colecistitis|piedras en la vesicula;colelitiasis
K81.0|Colecistitis aguda|colecistitis;vesicula inflamada
K81.1|Colecistitis crónica|vesicula
K85.9|Pancreatitis aguda, no especificada|pancreatitis
K90.0|Enfermedad celíaca|celiaco;gluten
K92.2|Hemorragia gastrointestinal, no especificada|sangrado digestivo
L01.0|Impétigo [cualquier organismo]|impetigo
L02.9|Absceso cutáneo, furúnculo y carbunco, de sitio no especificado|absceso;nacido;furunculo;grano enterrado
L03.9|Celulitis de sitio no especificado|celulitis infecciosa
L20.9|Dermatitis atópica, no especificada|dermatitis atopica;eccema;piel reseca
L21.9|Dermatitis seborreica, no especificada|caspa;dermatitis seborreica
L22|Dermatitis del pañal|rozadura;pañalitis
L23.9|Dermatitis alérgica de contacto, de causa no especificada|dermatitis de contacto;alergia en la piel
L30.9|Dermatitis, no especificada|dermatitis;irritacion de piel
L40.0|Psoriasis vulgar|psoriasis
L50.9|Urticaria, no especificada|urticaria;ronchas;alergia
L57.0|Queratosis actínica|manchas por sol
L60.0|Uña encarnada|unero;una enterrada
L63.9|Alopecia areata, no especificada|alopecia areata;calvicie en zonas
L65.9|Pérdida del pelo no cicatricial, no especificada|caida del cabello;alopecia
L70.0|Acné vulgar|acne;granos;espinillas
L72.0|Quiste epidérmico|quiste
L80|Vitiligo|vitiligo
L81.1|Cloasma|paño;melasma;manchas en la cara
L84|Callos y callosidades|callos
L89.9|Úlcera de decúbito y por presión, de sitio no especificado|escaras;ulcera por presion
M06.9|Artritis reumatoide, no especificada|artritis reumatoide;reumas
M10.9|Gota, no especificada|gota;acido urico
M13.9|Artritis, no especificada|artritis
M16.9|Coxartrosis, no especificada|artrosis de cadera
M17.9|Gonartrosis, no especificada|artrosis de rodilla;desgaste de rodilla
M19.9|Artrosis, no especificada|artrosis;osteoartritis;desgaste
M23.2|Trastorno de menisco debido a desgarro o lesión antigua|menisco
M25.5|Dolor en articulación|dolor articular;artralgia
M32.9|Lupus eritematoso sistémico, sin otra especificación|lupus
M41.9|Escoliosis, no especificada|escoliosis;columna chueca
M45|Espondilitis anquilosante|espondilitis
M47.9|Espondilosis, no especificada|espondilosis;artrosis de columna
M51.1|Trastornos de disco lumbar y otros, con radiculopatía|hernia de disco;disco
M53.1|Síndrome cervicobraquial|dolor de cuello y brazo
M54.2|Cervicalgia|dolor de cuello;torticolis;cervicalgia
M54.4|Lumbago con ciática|ciatica;lumbociatica
M54.5|Lumbago no especificado|lumbalgia;dolor de espalda baja;dolor de cintura;dolor de rinones
M54.6|Dolor en la columna dorsal|dorsalgia
M54.9|Dorsalgia, no especificada|dolor de espalda
M62.6|Distensión muscular|desgarre;distension muscular
M65.3|Dedo en gatillo|dedo en gatillo
M65.4|Tenosinovitis de estiloides radial [de Quervain]|de quervain
M72.2|Fibromatosis de la aponeurosis plantar|fascitis plantar;dolor de talon;espolon
M75.0|Capsulitis adhesiva del hombro|hombro congelado
M75.1|Síndrome del manguito rotatorio|manguito rotador;dolor de hombro
M76.6|Tendinitis aquiliana|tendinitis de aquiles
M77.0|Epicondilitis media|codo de golfista
M77.1|Epicondilitis lateral|codo de tenista;epicondilitis
M79.1|Mialgia|dolor muscular;mialgia
M79.7|Fibromialgia|fibromialgia
M81.0|Osteoporosis postmenopáusica, sin fractura patológica|osteoporosis
M81.9|Osteoporosis, no especificada, sin fractura patológica|osteoporosis;huesos debiles
N10|Nefritis tubulointersticial aguda|pielonefritis;infeccion de rinon
N17.9|Insuficiencia renal aguda, no especificada|lesion renal aguda
N18.5|Enfermedad renal crónica, etapa 5|insuficiencia renal terminal;dialisis
N18.9|Enfermedad renal crónica, no especificada|insuficiencia renal cronica;irc;rinones
N20.0|Cálculo del riñón|piedras en el rinon;litiasis renal;calculos
N20.9|Cálculo urinario, no especificado|piedras;litiasis
N23|Cólico renal, no especificado|colico renal
N30.0|Cistitis aguda|cistitis
N39.0|Infección de vías urinarias, sitio no especificado|ivu;infeccion urinaria;mal de orin;ardor al orinar
N39.3|Incontinencia urinaria por tensión|incontinencia de esfuerzo
N40|Hiperplasia de la próstata|prostata crecida;hpb
N41.0|Prostatitis aguda|prostatitis
N45.9|Orquitis, epididimitis y orquiepididimitis sin absceso|orquitis;epididimitis
N47|Prepucio redundante, fimosis y parafimosis|fimosis
N48.4|Impotencia de origen orgánico|disfuncion erectil;impotencia
N60.1|Mastopatía quística difusa|mastopatia fibroquistica
N63|Masa no especificada en la mama|bolita en el seno;nodulo mamario
N64.4|Mastodinia|dolor de senos
N73.9|Enfermedad inflamatoria pélvica femenina, no especificada|epi;enfermedad pelvica inflamatoria
N76.0|Vaginitis aguda|vaginitis;flujo;infeccion vaginal
N80.9|Endometriosis, no especificada|endometriosis
N83.2|Otros quistes ováricos y los no especificados|quiste de ovario
N86|Erosión y ectropión del cuello del útero|ectropion;erosion cervical
N87.9|Displasia del cuello del útero, no especificada|displasia cervical;papanicolaou alterado
N91.2|Amenorrea, sin otra especificación|amenorrea;no me baja
N92.0|Menstruación excesiva y frecuente con ciclo regular|regla abundante;sangrado menstrual
N92.6|Menstruación irregular, no especificada|regla irregular
N94.6|Dismenorrea, no especificada|colicos menstruales;dolor de regla
N95.1|Estados menopáusicos y climatéricos femeninos|menopausia;bochornos;climaterio
N97.9|Infertilidad femenina, no especificada|infertilidad
O03.9|Aborto espontáneo completo o no especificado, sin complicación|aborto
O13|Hipertensión gestacional [inducida por el embarazo] sin proteinuria significativa|hipertension del embarazo;presion alta embarazo
O14.9|Preeclampsia, no especificada|preeclampsia
O20.0|Amenaza de aborto|amenaza de aborto;sangrado en el embarazo
O21.0|Hiperemesis gravídica leve|hiperemesis;vomitos del embarazo
O21.9|Vómitos del embarazo, no especificados|nauseas del embarazo
O23.4|Infección no especificada de las vías urinarias en el embarazo|ivu en el embarazo
O24.4|Diabetes mellitus que se origina con el embarazo|diabetes gestacional;azucar en el embarazo
O47.9|Falso trabajo de parto, sin otra especificación|contracciones falsas
O99.0|Anemia que complica el embarazo, el parto y el puerperio|anemia del embarazo
P07.3|Otros recién nacidos pretérmino|prematuro
P59.9|Ictericia neonatal, no especificada|bebe amarillo;ictericia del recien nacido
Q21.1|Defecto del tabique auricular|cia;soplo
Q53.9|Testículo no descendido, sin otra especificación|criptorquidia
Q90.9|Síndrome de Down, no especificado|sindrome de down;trisomia 21
R00.0|Taquicardia, no especificada|taquicardia;corazon acelerado
R00.2|Palpitaciones|palpitaciones
R04.0|Epistaxis|sangrado de nariz;epistaxis
R05|Tos|tos
R06.0|Disnea|falta de aire;ahogo;disnea
R07.4|Dolor en el pecho, no especificado|dolor de pecho;dolor toracico
R10.1|Dolor abdominal localizado en parte superior|dolor en la boca del estomago;epigastralgia
R10.3|Dolor localizado en otras partes inferiores del abdomen|dolor bajo vientre
R10.4|Otros dolores abdominales y los no especificados|dolor de panza;dolor abdominal;dolor de estomago
R11|Náusea y vómito|nauseas;vomito;guacarear
R12|Acidez|agruras;acidez
R14|Flatulencia y afecciones afines|gases;inflamacion;distension abdominal
R17|Ictericia no especificada|piel amarilla;ictericia
R19.7|Diarrea, no especificada|diarrea
R21|Salpullido y otras erupciones cutáneas no especificadas|salpullido;sarpullido;ronchas
R22.9|Tumefacción, masa o prominencia localizada, parte no especificada|bolita;masa;bulto
R25.1|Temblor, no especificado|temblor
R30.0|Disuria|ardor al orinar;disuria
R31|Hematuria, no especificada|sangre en la orina
R32|Incontinencia urinaria, no especificada|incontinencia;se me sale la orina
R35|Poliuria|orinar mucho
R42|Mareo y desvanecimiento|mareo;vahido
R50.9|Fiebre, no especificada|fiebre;calentura;temperatura
R51|Cefalea|dolor de cabeza;cefalea
R52.9|Dolor, no especificado|dolor
R53|Malestar y fatiga|cansancio;fatiga;debilidad;malestar general
R55|Síncope y colapso|desmayo;sincope
R56.0|Convulsiones febriles|convulsion por fiebre
R60.0|Edema localizado|hinchazon;edema;pies hinchados
R63.4|Pérdida anormal de peso|bajo de peso;perdida de peso
R63.5|Aumento anormal de peso|aumento de peso;sobrepeso
R73.0|Anormalidades en la prueba de tolerancia a la glucosa|prediabetes;azucar;intolerancia a la glucosa
R73.9|Hiperglucemia, no especificada|azucar alta;hiperglucemia
R80|Proteinuria aislada|proteinas en la orina
S06.0|Concusión|conmocion cerebral;golpe en la cabeza
S09.9|Traumatismo de la cabeza, no especificado|golpe en la cabeza;tce
S13.4|Esguince y torcedura de la columna cervical|latigazo cervical;esguince de cuello
S33.5|Esguince y torcedura de la columna lumbar|esguince lumbar
S42.0|Fractura de la clavícula|clavicula rota
S52.5|Fractura de la epífisis inferior del radio|fractura de muneca;colles
S61.0|Herida de dedo(s) de la mano, sin daño de la(s) uña(s)|cortada en dedo
S61.9|Herida de la muñeca y de la mano, parte no especificada|herida en mano
S62.6|Fractura de otro dedo de la mano|dedo roto;fractura de dedo
S80.0|Contusión de la rodilla|golpe en la rodilla
S82.6|Fractura del maléolo externo|fractura de tobillo
S83.2|Desgarro de meniscos, presente|menisco roto
S83.5|Esguince y torcedura de ligamento cruzado de la rodilla|ligamento cruzado;lca
S93.4|Esguince y torcedura del tobillo|esguince de tobillo;torcedura;doblada de pie
T14.0|Traumatismo superficial de región no especificada del cuerpo|raspon;excoriacion
T14.1|Herida de región no especificada del cuerpo|herida;cortada;sutura
T14.9|Traumatismo, no especificado|golpe;contusion;trauma
T15.9|Cuerpo extraño en parte externa del ojo, sitio no especificado|basurita en el ojo
T30.0|Quemadura de región del cuerpo no especificada, grado no especificado|quemadura
T63.0|Efecto tóxico del veneno de serpiente|mordedura de vibora;serpiente
T63.2|Efecto tóxico del veneno de escorpión|piquete de alacran;alacran
T63.4|Efecto tóxico del veneno de otros artrópodos|picadura de insecto;piquete
T78.2|Choque anafiláctico, no especificado|anafilaxia
T78.3|Edema angioneurótico|angioedema
T78.4|Alergia no especificada|alergia
T88.7|Efecto adverso no especificado de droga o medicamento|reaccion a medicamento;alergia a medicamento
Z00.0|Examen médico general|chequeo;revision general;check up;certificado
Z00.1|Control de salud de rutina del niño|nino sano;control del nino
Z01.0|Examen de ojos y de la visión|revision de la vista
Z01.4|Examen ginecológico (general) (de rutina)|revision ginecologica;papanicolaou
Z02.7|Extensión de certificado médico|certificado medico;incapacidad
Z03.9|Observación por sospecha de enfermedad o afección no especificada|observacion
Z09.8|Examen de seguimiento consecutivo a otros tratamientos por otras afecciones|seguimiento;control
Z12.4|Examen de pesquisa especial para tumor del cuello uterino|papanicolaou;tamizaje cervical
Z13.1|Examen de pesquisa especial para diabetes mellitus|tamizaje de diabetes;azucar
Z21|Estado de infección asintomática por el virus de la inmunodeficiencia humana [VIH]|vih asintomatico
Z25.1|Necesidad de inmunización contra la influenza [gripe]|vacuna influenza;vacuna gripe
Z30.0|Consejo y asesoramiento general sobre la anticoncepción|planificacion familiar;anticonceptivos
Z30.1|Inserción de dispositivo anticonceptivo (intrauterino)|diu;dispositivo
Z32.1|Embarazo confirmado|prueba de embarazo positiva
Z34.0|Supervisión de primer embarazo normal|control prenatal primigesta
Z34.9|Supervisión de embarazo normal no especificado|control prenatal;embarazo
Z35.9|Supervisión de embarazo de alto riesgo, sin otra especificación|embarazo de alto riesgo
Z39.2|Seguimiento postparto, de rutina|puerperio;postparto
Z48.0|Atención de los apósitos y suturas|retiro de puntos;curacion
Z71.3|Consulta para instrucción y vigilancia de la dieta|dieta;nutricion
Z72.0|Problemas relacionados con el uso del tabaco|tabaco;fumador
Z76.0|Consulta para repetición de receta|resurtir receta;receta
Z79.4|Uso (presente) de insulina a largo plazo|insulina
Z95.5|Presencia de implantes e injertos de angioplastia coronaria|stent coronario
`

export interface Cie10 {
  codigo: string
  nombre: string
  sinonimos: string[]
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const CIE10: Cie10[] = RAW.trim()
  .split('\n')
  .map((l) => {
    const [codigo, nombre, syn = ''] = l.split('|')
    return { codigo, nombre, sinonimos: syn.split(';').filter(Boolean) }
  })

const INDEX = CIE10.map((c) => ({ c, code: c.codigo.toLowerCase(), name: norm(c.nombre), syn: c.sinonimos.map(norm) }))

/** Búsqueda sin acentos: por código, palabras del nombre o sinónimos coloquiales */
export function buscarCie10(q: string, limite = 12): Cie10[] {
  const nq = norm(q)
  if (!nq) return []
  const palabras = nq.split(/\s+/)
  const res: { c: Cie10; s: number }[] = []
  for (const it of INDEX) {
    let s = 0
    if (it.code === nq || it.code.replace('.', '') === nq.replace('.', '')) s = 100
    else if (it.code.startsWith(nq)) s = 80
    else if (it.syn.some((x) => x === nq)) s = 70
    else if (it.name.startsWith(nq)) s = 60
    else if (it.syn.some((x) => x.startsWith(nq))) s = 50
    else if (palabras.every((w) => it.name.includes(w))) s = 40
    else if (palabras.every((w) => it.syn.some((x) => x.includes(w)))) s = 30
    if (s) res.push({ c: it.c, s })
  }
  return res.sort((a, b) => b.s - a.s || a.c.codigo.localeCompare(b.c.codigo)).slice(0, limite).map((r) => r.c)
}
