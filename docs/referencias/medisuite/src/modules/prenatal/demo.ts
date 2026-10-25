// Datos demo: embarazo de Ana Paula (p5), ~22 SDG, con 4 consultas que coinciden con las
// observaciones de peso y TA del seed (hace 90, 62, 34 y 6 días).
import type { Registro } from '../../lib/types'
import { hoyISO, lccAEdad, percentilHadlock91, pfeHadlock, sdgEn } from './calc'
import { tituloEmbarazo, type DatosConsulta, type DatosEmbarazo } from './modelo'

const DIA = 864e5

export function demoPrenatal(now: number): Registro[] {
  const f = (diasAtras: number) => hoyISO(new Date(now - diasAtras * DIA))
  const iso = (diasAtras: number) => new Date(f(diasAtras) + 'T12:00:00').toISOString()
  const fum = f(154)
  const usgFecha = f(90)
  const lcc = 25
  const pfe = pfeHadlock(17.8, 15.2, 3.3)
  const fechaUsg2 = f(13)
  const sdgUsg2 = sdgEn(fum, fechaUsg2)
  const emb: DatosEmbarazo = {
    clase: 'embarazo',
    fum,
    fumConfiable: true,
    usg: { fecha: usgFecha, sdgDias: Math.round(lccAEdad(lcc)), lcc },
    gesta: 2,
    para: 1,
    cesareas: 0,
    abortos: 0,
    grupoRh: 'A-',
    pesoPre: 57,
    talla: 160,
    riesgos: ['Isoinmunización / Rh negativo'],
    riesgoNotas: 'Parto eutócico previo en 2021 sin complicaciones. Alergia a sulfas.',
    biometrias: [
      { fecha: usgFecha, sdgDias: sdgEn(fum, usgFecha), lcc, notas: 'Embrión único, vivo. FCF 168 lpm.' },
      { fecha: fechaUsg2, sdgDias: sdgUsg2, cc: 17.8, ca: 15.2, lf: 3.3, pfe, percentil: percentilHadlock91(pfe, sdgUsg2 / 7).percentil, notas: 'USG estructural sin alteraciones. Placenta posterior normoinserta.' },
    ],
  }
  const embId = 'demo-prenatal-p5-emb'
  const visitas: [number, Partial<DatosConsulta>][] = [
    [90, { peso: 58, pas: 108, pad: 70, movimientos: '', edema: 'no', proteinuria: 'negativa', notas: 'Primera consulta. Náusea matutina leve. Se indica ácido fólico y laboratorios de primer trimestre.' }],
    [62, { peso: 59.5, pas: 110, pad: 70, fcf: 158, edema: 'no', proteinuria: 'negativa', notas: 'Laboratorios normales. Coombs indirecto negativo.' }],
    [34, { peso: 61.2, pas: 112, pad: 72, au: 16, fcf: 150, movimientos: 'presentes', edema: 'no', proteinuria: 'negativa', notas: 'Percibe movimientos fetales.' }],
    [6, { peso: 63, pas: 114, pad: 74, au: 21, fcf: 146, movimientos: 'presentes', edema: 'leve', proteinuria: 'negativa', presentacion: 'no-valorable', notas: 'Edema maleolar vespertino. Se programa Tdpa y tamiz de diabetes 24–28 SDG.' }],
  ]
  const consultas: Registro[] = visitas.map(([d, c], i) => {
    const sdgDias = sdgEn(fum, f(d))
    const datos: DatosConsulta = { fecha: f(d), ...c, clase: 'consulta', embarazoId: embId, sdgDias, obsIds: [] }
    return { id: `demo-prenatal-p5-c${i + 1}`, patientId: 'p5', tipo: 'prenatal', fecha: iso(d), estado: 'normal', titulo: `Consulta prenatal ${Math.floor(sdgDias / 7)}.${sdgDias % 7} SDG`, datos: datos as unknown as Registro['datos'] }
  })
  return [
    { id: embId, patientId: 'p5', tipo: 'prenatal', fecha: iso(154), estado: 'activo', titulo: tituloEmbarazo(emb), datos: emb as unknown as Registro['datos'] },
    ...consultas,
  ]
}
