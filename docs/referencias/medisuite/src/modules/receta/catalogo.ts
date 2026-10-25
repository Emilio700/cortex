// Catálogo local de medicamentos comunes en México (nombre genérico + presentaciones).
// Fuente orientativa: Cuadro Básico y presentaciones comerciales frecuentes. No es exhaustivo.

export interface Medicamento {
  nombre: string
  presentaciones: string[]
  via: string
  familia?: string // para alertas de alergia por grupo
}

type Row = [string, string, string, string?]
// nombre | presentaciones separadas por ';' | vía | familia
const rows: Row[] = [
  // Analgésicos / AINEs
  ['Paracetamol', 'Tabletas 500 mg;Tabletas 750 mg;Suspensión 160 mg/5 mL;Gotas 100 mg/mL;Supositorios 300 mg', 'Oral'],
  ['Ibuprofeno', 'Tabletas 400 mg;Tabletas 600 mg;Tabletas 800 mg;Suspensión 100 mg/5 mL;Suspensión 200 mg/5 mL', 'Oral', 'aine'],
  ['Naproxeno', 'Tabletas 250 mg;Tabletas 500 mg;Suspensión 125 mg/5 mL', 'Oral', 'aine'],
  ['Diclofenaco', 'Tabletas 50 mg;Tabletas 100 mg LP;Solución inyectable 75 mg/3 mL;Gel 1%', 'Oral', 'aine'],
  ['Ketorolaco', 'Tabletas 10 mg;Solución inyectable 30 mg/mL;Tabletas sublinguales 30 mg', 'Oral', 'aine'],
  ['Metamizol sódico', 'Tabletas 500 mg;Solución inyectable 1 g/2 mL;Gotas 500 mg/mL', 'Oral'],
  ['Celecoxib', 'Cápsulas 100 mg;Cápsulas 200 mg', 'Oral', 'aine'],
  ['Meloxicam', 'Tabletas 7.5 mg;Tabletas 15 mg', 'Oral', 'aine'],
  ['Ácido acetilsalicílico', 'Tabletas 100 mg;Tabletas 500 mg', 'Oral', 'aine'],
  ['Tramadol', 'Cápsulas 50 mg;Gotas 100 mg/mL;Solución inyectable 100 mg/2 mL', 'Oral'],
  ['Tramadol/Paracetamol', 'Tabletas 37.5/325 mg', 'Oral'],
  ['Ketoprofeno', 'Cápsulas 100 mg;Gel 2.5%', 'Oral', 'aine'],
  ['Indometacina', 'Cápsulas 25 mg', 'Oral', 'aine'],
  // Antibióticos
  ['Amoxicilina', 'Cápsulas 500 mg;Tabletas 875 mg;Suspensión 250 mg/5 mL;Suspensión 500 mg/5 mL', 'Oral', 'penicilina'],
  ['Amoxicilina/Ácido clavulánico', 'Tabletas 500/125 mg;Tabletas 875/125 mg;Suspensión 400/57 mg/5 mL', 'Oral', 'penicilina'],
  ['Ampicilina', 'Cápsulas 500 mg;Suspensión 250 mg/5 mL;Solución inyectable 1 g', 'Oral', 'penicilina'],
  ['Dicloxacilina', 'Cápsulas 500 mg;Suspensión 250 mg/5 mL', 'Oral', 'penicilina'],
  ['Penicilina G benzatínica', 'Solución inyectable 1,200,000 UI', 'Intramuscular', 'penicilina'],
  ['Bencilpenicilina procaínica', 'Solución inyectable 800,000 UI', 'Intramuscular', 'penicilina'],
  ['Cefalexina', 'Cápsulas 500 mg;Suspensión 250 mg/5 mL', 'Oral', 'cefalosporina'],
  ['Cefuroxima', 'Tabletas 500 mg;Suspensión 250 mg/5 mL', 'Oral', 'cefalosporina'],
  ['Cefixima', 'Cápsulas 400 mg;Suspensión 100 mg/5 mL', 'Oral', 'cefalosporina'],
  ['Ceftriaxona', 'Solución inyectable 1 g;Solución inyectable 500 mg', 'Intramuscular', 'cefalosporina'],
  ['Azitromicina', 'Tabletas 500 mg;Suspensión 200 mg/5 mL', 'Oral', 'macrolido'],
  ['Claritromicina', 'Tabletas 500 mg;Suspensión 250 mg/5 mL', 'Oral', 'macrolido'],
  ['Eritromicina', 'Tabletas 500 mg;Suspensión 250 mg/5 mL', 'Oral', 'macrolido'],
  ['Ciprofloxacino', 'Tabletas 250 mg;Tabletas 500 mg;Solución oftálmica 0.3%', 'Oral', 'quinolona'],
  ['Levofloxacino', 'Tabletas 500 mg;Tabletas 750 mg', 'Oral', 'quinolona'],
  ['Moxifloxacino', 'Tabletas 400 mg', 'Oral', 'quinolona'],
  ['Trimetoprima/Sulfametoxazol', 'Tabletas 80/400 mg;Tabletas 160/800 mg;Suspensión 40/200 mg/5 mL', 'Oral', 'sulfa'],
  ['Nitrofurantoína', 'Cápsulas 100 mg', 'Oral'],
  ['Fosfomicina', 'Granulado 3 g', 'Oral'],
  ['Metronidazol', 'Tabletas 500 mg;Suspensión 250 mg/5 mL;Óvulos 500 mg', 'Oral'],
  ['Clindamicina', 'Cápsulas 300 mg;Solución inyectable 600 mg/4 mL;Gel 1%', 'Oral'],
  ['Doxiciclina', 'Cápsulas 100 mg', 'Oral', 'tetraciclina'],
  ['Gentamicina', 'Solución inyectable 80 mg/2 mL;Solución oftálmica 0.3%', 'Intramuscular'],
  ['Mupirocina', 'Ungüento 2%', 'Tópica'],
  ['Neomicina/Polimixina B/Bacitracina', 'Ungüento', 'Tópica'],
  // Antivirales / antimicóticos / antiparasitarios
  ['Aciclovir', 'Tabletas 400 mg;Tabletas 800 mg;Crema 5%', 'Oral'],
  ['Valaciclovir', 'Tabletas 500 mg;Tabletas 1 g', 'Oral'],
  ['Oseltamivir', 'Cápsulas 75 mg;Suspensión 6 mg/mL', 'Oral'],
  ['Fluconazol', 'Cápsulas 150 mg;Cápsulas 100 mg', 'Oral'],
  ['Itraconazol', 'Cápsulas 100 mg', 'Oral'],
  ['Clotrimazol', 'Crema 1%;Óvulos 100 mg;Crema vaginal 2%', 'Tópica'],
  ['Ketoconazol', 'Crema 2%;Shampoo 2%', 'Tópica'],
  ['Terbinafina', 'Tabletas 250 mg;Crema 1%', 'Oral'],
  ['Nistatina', 'Suspensión 100,000 UI/mL;Óvulos 100,000 UI', 'Oral'],
  ['Albendazol', 'Tabletas 200 mg;Tabletas 400 mg;Suspensión 400 mg/20 mL', 'Oral'],
  ['Nitazoxanida', 'Tabletas 500 mg;Suspensión 100 mg/5 mL', 'Oral'],
  ['Ivermectina', 'Tabletas 6 mg', 'Oral'],
  // Cardiovascular
  ['Losartán', 'Tabletas 50 mg;Tabletas 100 mg', 'Oral', 'ara2'],
  ['Telmisartán', 'Tabletas 40 mg;Tabletas 80 mg', 'Oral', 'ara2'],
  ['Valsartán', 'Tabletas 80 mg;Tabletas 160 mg', 'Oral', 'ara2'],
  ['Enalapril', 'Tabletas 10 mg;Tabletas 20 mg', 'Oral', 'ieca'],
  ['Captopril', 'Tabletas 25 mg', 'Oral', 'ieca'],
  ['Lisinopril', 'Tabletas 10 mg;Tabletas 20 mg', 'Oral', 'ieca'],
  ['Amlodipino', 'Tabletas 5 mg;Tabletas 10 mg', 'Oral'],
  ['Nifedipino', 'Tabletas LP 30 mg;Cápsulas 10 mg', 'Oral'],
  ['Metoprolol', 'Tabletas 50 mg;Tabletas 100 mg', 'Oral', 'betabloqueador'],
  ['Propranolol', 'Tabletas 10 mg;Tabletas 40 mg', 'Oral', 'betabloqueador'],
  ['Bisoprolol', 'Tabletas 2.5 mg;Tabletas 5 mg', 'Oral', 'betabloqueador'],
  ['Carvedilol', 'Tabletas 6.25 mg;Tabletas 12.5 mg;Tabletas 25 mg', 'Oral', 'betabloqueador'],
  ['Hidroclorotiazida', 'Tabletas 25 mg', 'Oral', 'sulfa'],
  ['Clortalidona', 'Tabletas 50 mg', 'Oral', 'sulfa'],
  ['Furosemida', 'Tabletas 40 mg;Solución inyectable 20 mg/2 mL', 'Oral', 'sulfa'],
  ['Espironolactona', 'Tabletas 25 mg;Tabletas 100 mg', 'Oral'],
  ['Atorvastatina', 'Tabletas 10 mg;Tabletas 20 mg;Tabletas 40 mg;Tabletas 80 mg', 'Oral'],
  ['Rosuvastatina', 'Tabletas 10 mg;Tabletas 20 mg', 'Oral'],
  ['Simvastatina', 'Tabletas 20 mg;Tabletas 40 mg', 'Oral'],
  ['Pravastatina', 'Tabletas 20 mg', 'Oral'],
  ['Bezafibrato', 'Tabletas 200 mg', 'Oral'],
  ['Ezetimiba', 'Tabletas 10 mg', 'Oral'],
  ['Clopidogrel', 'Tabletas 75 mg', 'Oral'],
  ['Apixabán', 'Tabletas 2.5 mg;Tabletas 5 mg', 'Oral'],
  ['Rivaroxabán', 'Tabletas 15 mg;Tabletas 20 mg', 'Oral'],
  ['Warfarina', 'Tabletas 5 mg', 'Oral'],
  ['Isosorbida, dinitrato', 'Tabletas sublinguales 5 mg;Tabletas 10 mg', 'Sublingual'],
  // Endocrino / metabólico
  ['Metformina', 'Tabletas 500 mg;Tabletas 850 mg;Tabletas LP 1000 mg', 'Oral'],
  ['Glibenclamida', 'Tabletas 5 mg', 'Oral', 'sulfa'],
  ['Glimepirida', 'Tabletas 2 mg;Tabletas 4 mg', 'Oral', 'sulfa'],
  ['Sitagliptina', 'Tabletas 50 mg;Tabletas 100 mg', 'Oral'],
  ['Linagliptina', 'Tabletas 5 mg', 'Oral'],
  ['Empagliflozina', 'Tabletas 10 mg;Tabletas 25 mg', 'Oral'],
  ['Dapagliflozina', 'Tabletas 10 mg', 'Oral'],
  ['Pioglitazona', 'Tabletas 15 mg;Tabletas 30 mg', 'Oral'],
  ['Insulina glargina', 'Solución inyectable 100 UI/mL (pluma)', 'Subcutánea'],
  ['Insulina NPH', 'Suspensión inyectable 100 UI/mL', 'Subcutánea'],
  ['Insulina lispro', 'Solución inyectable 100 UI/mL (pluma)', 'Subcutánea'],
  ['Semaglutida', 'Pluma 0.25/0.5 mg;Pluma 1 mg;Tabletas 7 mg', 'Subcutánea'],
  ['Levotiroxina', 'Tabletas 25 mcg;Tabletas 50 mcg;Tabletas 100 mcg', 'Oral'],
  ['Tiamazol', 'Tabletas 5 mg', 'Oral'],
  ['Alopurinol', 'Tabletas 100 mg;Tabletas 300 mg', 'Oral'],
  ['Colchicina', 'Tabletas 1 mg', 'Oral'],
  ['Prednisona', 'Tabletas 5 mg;Tabletas 20 mg;Tabletas 50 mg', 'Oral', 'corticoide'],
  ['Prednisolona', 'Solución oral 15 mg/5 mL', 'Oral', 'corticoide'],
  ['Dexametasona', 'Tabletas 0.5 mg;Solución inyectable 8 mg/2 mL', 'Oral', 'corticoide'],
  ['Betametasona', 'Solución inyectable 6 mg/mL;Crema 0.05%', 'Intramuscular', 'corticoide'],
  ['Hidrocortisona', 'Crema 1%;Solución inyectable 100 mg', 'Tópica', 'corticoide'],
  ['Calcio + Vitamina D', 'Tabletas 600 mg/400 UI', 'Oral'],
  ['Colecalciferol', 'Cápsulas 1000 UI;Gotas 400 UI', 'Oral'],
  ['Ácido fólico', 'Tabletas 0.4 mg;Tabletas 5 mg', 'Oral'],
  ['Sulfato ferroso', 'Tabletas 200 mg;Gotas 125 mg/mL', 'Oral'],
  ['Complejo B', 'Tabletas;Solución inyectable', 'Oral'],
  // Gastrointestinal
  ['Omeprazol', 'Cápsulas 20 mg;Cápsulas 40 mg;Solución inyectable 40 mg', 'Oral'],
  ['Pantoprazol', 'Tabletas 20 mg;Tabletas 40 mg', 'Oral'],
  ['Esomeprazol', 'Tabletas 20 mg;Tabletas 40 mg', 'Oral'],
  ['Ranitidina', 'Tabletas 150 mg', 'Oral'],
  ['Famotidina', 'Tabletas 20 mg;Tabletas 40 mg', 'Oral'],
  ['Metoclopramida', 'Tabletas 10 mg;Gotas 4 mg/mL;Solución inyectable 10 mg/2 mL', 'Oral'],
  ['Ondansetrón', 'Tabletas 8 mg;Tabletas bucodispersables 4 mg;Solución inyectable 8 mg/4 mL', 'Oral'],
  ['Butilhioscina', 'Tabletas 10 mg;Solución inyectable 20 mg/mL', 'Oral'],
  ['Butilhioscina/Metamizol', 'Tabletas 10/250 mg;Solución inyectable 20 mg/2.5 g', 'Oral'],
  ['Loperamida', 'Tabletas 2 mg', 'Oral'],
  ['Trimebutina', 'Tabletas 200 mg', 'Oral'],
  ['Pinaverio', 'Tabletas 100 mg', 'Oral'],
  ['Lactulosa', 'Jarabe 66.7 g/100 mL', 'Oral'],
  ['Polietilenglicol 3350', 'Polvo 17 g', 'Oral'],
  ['Senósidos A-B', 'Tabletas 8.6 mg', 'Oral'],
  ['Hidróxido de aluminio y magnesio', 'Suspensión', 'Oral'],
  ['Sales de rehidratación oral', 'Sobre 20.5 g', 'Oral'],
  ['Simeticona', 'Tabletas 80 mg;Gotas 100 mg/mL', 'Oral'],
  // Respiratorio / alergia
  ['Salbutamol', 'Aerosol 100 mcg/dosis;Solución para nebulizar 5 mg/mL;Jarabe 2 mg/5 mL', 'Inhalada'],
  ['Bromuro de ipratropio', 'Aerosol 20 mcg/dosis;Solución para nebulizar 0.025%', 'Inhalada'],
  ['Budesonida', 'Aerosol 200 mcg/dosis;Suspensión para nebulizar 0.25 mg/mL;Spray nasal 64 mcg', 'Inhalada', 'corticoide'],
  ['Fluticasona', 'Spray nasal 50 mcg;Aerosol 250 mcg/dosis', 'Nasal', 'corticoide'],
  ['Mometasona', 'Spray nasal 50 mcg;Crema 0.1%', 'Nasal', 'corticoide'],
  ['Salmeterol/Fluticasona', 'Polvo para inhalar 50/250 mcg;Polvo para inhalar 50/500 mcg', 'Inhalada', 'corticoide'],
  ['Montelukast', 'Tabletas 10 mg;Tabletas masticables 4 mg;Tabletas masticables 5 mg;Granulado 4 mg', 'Oral'],
  ['Loratadina', 'Tabletas 10 mg;Jarabe 5 mg/5 mL', 'Oral'],
  ['Desloratadina', 'Tabletas 5 mg;Jarabe 2.5 mg/5 mL', 'Oral'],
  ['Cetirizina', 'Tabletas 10 mg;Gotas 10 mg/mL;Jarabe 5 mg/5 mL', 'Oral'],
  ['Levocetirizina', 'Tabletas 5 mg', 'Oral'],
  ['Clorfenamina', 'Tabletas 4 mg;Jarabe 2.5 mg/5 mL;Solución inyectable 10 mg/mL', 'Oral'],
  ['Difenhidramina', 'Jarabe 12.5 mg/5 mL;Cápsulas 25 mg', 'Oral'],
  ['Ambroxol', 'Jarabe 15 mg/5 mL;Jarabe 30 mg/5 mL;Tabletas 30 mg', 'Oral'],
  ['Dextrometorfano', 'Jarabe 15 mg/5 mL', 'Oral'],
  ['Benzonatato', 'Perlas 100 mg', 'Oral'],
  ['Oximetazolina', 'Solución nasal 0.05%;Solución nasal 0.025%', 'Nasal'],
  ['Cloruro de sodio 0.9% nasal', 'Spray nasal', 'Nasal'],
  // Neuro / psiquiatría
  ['Sertralina', 'Tabletas 50 mg;Tabletas 100 mg', 'Oral'],
  ['Fluoxetina', 'Cápsulas 20 mg', 'Oral'],
  ['Escitalopram', 'Tabletas 10 mg;Tabletas 20 mg', 'Oral'],
  ['Paroxetina', 'Tabletas 20 mg', 'Oral'],
  ['Venlafaxina', 'Cápsulas LP 75 mg;Cápsulas LP 150 mg', 'Oral'],
  ['Duloxetina', 'Cápsulas 30 mg;Cápsulas 60 mg', 'Oral'],
  ['Amitriptilina', 'Tabletas 25 mg', 'Oral'],
  ['Clonazepam', 'Tabletas 2 mg;Gotas 2.5 mg/mL', 'Oral', 'benzodiacepina'],
  ['Alprazolam', 'Tabletas 0.25 mg;Tabletas 0.5 mg', 'Oral', 'benzodiacepina'],
  ['Diazepam', 'Tabletas 10 mg;Solución inyectable 10 mg/2 mL', 'Oral', 'benzodiacepina'],
  ['Quetiapina', 'Tabletas 25 mg;Tabletas 100 mg', 'Oral'],
  ['Gabapentina', 'Cápsulas 300 mg;Tabletas 600 mg', 'Oral'],
  ['Pregabalina', 'Cápsulas 75 mg;Cápsulas 150 mg', 'Oral'],
  ['Carbamazepina', 'Tabletas 200 mg', 'Oral'],
  ['Ácido valproico', 'Tabletas 250 mg;Tabletas LP 500 mg;Jarabe 250 mg/5 mL', 'Oral'],
  ['Levetiracetam', 'Tabletas 500 mg;Solución 100 mg/mL', 'Oral'],
  ['Sumatriptán', 'Tabletas 50 mg', 'Oral'],
  ['Betahistina', 'Tabletas 8 mg;Tabletas 16 mg', 'Oral'],
  ['Cinarizina', 'Tabletas 75 mg', 'Oral'],
  ['Complejo B (B1, B6, B12)', 'Tabletas;Solución inyectable', 'Oral'],
  // Urología / gineco
  ['Tamsulosina', 'Cápsulas 0.4 mg', 'Oral'],
  ['Finasterida', 'Tabletas 5 mg', 'Oral'],
  ['Sildenafil', 'Tabletas 50 mg;Tabletas 100 mg', 'Oral'],
  ['Fenazopiridina', 'Tabletas 100 mg', 'Oral'],
  ['Levonorgestrel', 'Tabletas 1.5 mg', 'Oral'],
  ['Etinilestradiol/Levonorgestrel', 'Tabletas 0.03/0.15 mg', 'Oral'],
  ['Progesterona', 'Cápsulas 100 mg;Cápsulas 200 mg', 'Oral'],
  // Dermatología / oftalmología / otros
  ['Hidroquinona', 'Crema 4%', 'Tópica'],
  ['Ácido fusídico', 'Crema 2%', 'Tópica'],
  ['Óxido de zinc', 'Pasta 25%', 'Tópica'],
  ['Permetrina', 'Crema 5%;Loción 1%', 'Tópica'],
  ['Tobramicina oftálmica', 'Solución oftálmica 0.3%', 'Oftálmica'],
  ['Tobramicina/Dexametasona oftálmica', 'Suspensión oftálmica', 'Oftálmica', 'corticoide'],
  ['Hipromelosa (lágrimas artificiales)', 'Solución oftálmica 0.5%', 'Oftálmica'],
  ['Olopatadina', 'Solución oftálmica 0.1%', 'Oftálmica'],
]

export const CATALOGO: Medicamento[] = rows.map(([nombre, p, via, familia]) => ({ nombre, presentaciones: p.split(';'), via, familia }))

export const VIAS = ['Oral', 'Sublingual', 'Tópica', 'Intramuscular', 'Intravenosa', 'Subcutánea', 'Inhalada', 'Nasal', 'Oftálmica', 'Ótica', 'Rectal', 'Vaginal']
export const FRECUENCIAS = ['Cada 4 horas', 'Cada 6 horas', 'Cada 8 horas', 'Cada 12 horas', 'Cada 24 horas', 'Dosis única', 'En caso de dolor o fiebre', 'Antes de dormir', 'Con cada comida']

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Grupos de alergia: términos que puede escribir el médico en "alergias" → familia/medicamentos que coinciden
const GRUPOS: { claves: string[]; familia?: string; nombres?: string[]; etiqueta: string }[] = [
  { claves: ['penicilina', 'betalactam', 'amoxicilina', 'ampicilina'], familia: 'penicilina', etiqueta: 'penicilinas' },
  { claves: ['cefalosporina', 'cef'], familia: 'cefalosporina', etiqueta: 'cefalosporinas' },
  { claves: ['sulfa', 'sulfonamida', 'sulfametoxazol'], familia: 'sulfa', etiqueta: 'sulfonamidas' },
  { claves: ['aine', 'antiinflamatorio', 'ibuprofeno', 'aspirina', 'acido acetilsalicilico', 'naproxeno', 'diclofenaco'], familia: 'aine', etiqueta: 'AINEs' },
  { claves: ['macrolido', 'eritromicina', 'azitromicina', 'claritromicina'], familia: 'macrolido', etiqueta: 'macrólidos' },
  { claves: ['quinolona', 'ciprofloxacino', 'levofloxacino'], familia: 'quinolona', etiqueta: 'quinolonas' },
  { claves: ['benzodiacepina'], familia: 'benzodiacepina', etiqueta: 'benzodiacepinas' },
  { claves: ['metamizol', 'dipirona'], nombres: ['metamizol'], etiqueta: 'metamizol' },
]

/** Devuelve un texto de alerta si el medicamento coincide con alguna alergia del paciente. */
export function alertaAlergia(medicamento: string, alergias: string[]): string | null {
  const m = norm(medicamento)
  if (!m) return null
  const fam = CATALOGO.find((c) => norm(c.nombre) === m)?.familia
  for (const a of alergias) {
    const na = norm(a)
    if (!na) continue
    // coincidencia directa por nombre
    if (m.includes(na) || na.includes(m)) return `Alergia registrada: "${a}"`
    for (const g of GRUPOS) {
      if (!g.claves.some((k) => na.includes(k))) continue
      if ((g.familia && fam === g.familia) || g.nombres?.some((n) => m.includes(n)) || (g.familia && m.includes(g.familia)))
        return `Posible reacción cruzada: alergia a "${a}" (grupo ${g.etiqueta})`
    }
  }
  return null
}
