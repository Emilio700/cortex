// Datos sintéticos para demo (ningún paciente es real). Estilo Synthea, en pequeño.
import type { DB, Patient, Observation, Appointment, Encounter, Payment, Prescription, Registro } from './types'
import { demoAudiometria } from '../modules/audiometria/demo'
import { demoCertificados } from '../modules/certificados/demo'
import { demoDesarrollo } from '../modules/desarrollo/demo'
import { demoEncuestas } from '../modules/encuestas/demo'
import { demoEnfermeria, demoEnfermeriaObs } from '../modules/enfermeria/demo'
import { demoInventario } from '../modules/inventario/demo'
import { demoNutricion } from '../modules/nutricion/demo'
import { demoOrdenes } from '../modules/ordenes/demo'
import { demoPrenatal } from '../modules/prenatal/demo'
import { demoTamizajes } from '../modules/tamizajes/demo'
import { demoTareas } from '../modules/tareas/demo'
import { demoTriaje } from '../modules/triaje/demo'
import { demoVacunacion } from '../modules/vacunacion/demo'
import { demoVision, demoVisionObs } from '../modules/vision/demo'

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const day = 86400000

export function seedDB(): DB {
  const r = rng(42)
  const now = Date.now()
  const iso = (t: number) => new Date(t).toISOString()

  const patients: Patient[] = [
    { id: 'p1', nombre: 'María Fernanda', apellidos: 'López Ramírez', sexo: 'F', fechaNac: '1968-03-14', curp: 'LORM680314MDFPMR09', telefono: '55 1234 5678', email: 'maria.lopez@ejemplo.mx', tipoSangre: 'O+', alergias: ['Penicilina'], antecedentes: 'Diabetes mellitus tipo 2 (2015). Hipertensión arterial (2018). Madre con DM2.', medicamentosActuales: ['Metformina 850 mg c/12 h', 'Losartán 50 mg c/24 h'], creado: iso(now - 400 * day) },
    { id: 'p2', nombre: 'José Luis', apellidos: 'Hernández García', sexo: 'M', fechaNac: '1955-11-02', curp: 'HEGJ551102HJCRRS04', telefono: '33 9876 5432', tipoSangre: 'A+', alergias: [], antecedentes: 'Cardiopatía isquémica, stent en 2021. Exfumador.', medicamentosActuales: ['Ácido acetilsalicílico 100 mg', 'Atorvastatina 40 mg', 'Metoprolol 50 mg'], creado: iso(now - 380 * day) },
    { id: 'p3', nombre: 'Sofía', apellidos: 'Martínez Cruz', sexo: 'F', fechaNac: '2021-06-20', curp: 'MACS210620MNLRRFA1', telefono: '81 5555 1212', tipoSangre: 'B+', alergias: ['Huevo'], antecedentes: 'Producto de término, sin complicaciones. Esquema de vacunación completo para la edad.', creado: iso(now - 300 * day) },
    { id: 'p4', nombre: 'Carlos Alberto', apellidos: 'Sánchez Torres', sexo: 'M', fechaNac: '1990-08-09', telefono: '55 4444 3333', tipoSangre: 'O-', alergias: [], antecedentes: 'Lesión de ligamento cruzado anterior derecho (2025), en rehabilitación.', creado: iso(now - 200 * day) },
    { id: 'p5', nombre: 'Ana Paula', apellidos: 'Gómez Rivera', sexo: 'F', fechaNac: '1995-01-27', telefono: '55 2222 1111', tipoSangre: 'A-', alergias: ['Sulfas'], antecedentes: 'G2 P1. Embarazo actual, FUM hace 22 semanas.', creado: iso(now - 150 * day) },
    { id: 'p6', nombre: 'Roberto', apellidos: 'Díaz Mendoza', sexo: 'M', fechaNac: '1978-04-30', telefono: '22 3333 7777', tipoSangre: 'AB+', alergias: [], antecedentes: 'Obesidad grado I. Dislipidemia.', medicamentosActuales: ['Bezafibrato 200 mg'], creado: iso(now - 120 * day) },
    { id: 'p7', nombre: 'Lucía', apellidos: 'Vargas Ortiz', sexo: 'F', fechaNac: '1983-12-05', telefono: '55 8888 9999', alergias: [], antecedentes: 'Trastorno de ansiedad generalizada en tratamiento.', medicamentosActuales: ['Sertralina 50 mg'], creado: iso(now - 90 * day) },
    { id: 'p8', nombre: 'Miguel Ángel', apellidos: 'Ruiz Castillo', sexo: 'M', fechaNac: '2012-09-18', telefono: '44 1111 2222', tipoSangre: 'O+', alergias: ['Ibuprofeno'], antecedentes: 'Asma intermitente.', creado: iso(now - 60 * day) },
  ]

  const observations: Observation[] = []
  let oid = 0
  const obs = (patientId: string, t: number, codigo: string, valor: number, unidad: string, fuente: Observation['fuente'] = 'manual', etiqueta?: string) =>
    observations.push({ id: 'o' + oid++, patientId, fecha: iso(t), codigo, valor: Math.round(valor * 10) / 10, unidad, fuente, etiqueta })

  // Series de 12 meses para adultos
  const adultos: [string, { peso: number; pas: number; pad: number; glu: number; dPeso: number; dPas: number; dGlu: number }][] = [
    ['p1', { peso: 82, pas: 148, pad: 92, glu: 182, dPeso: -0.5, dPas: -1.6, dGlu: -5 }],
    ['p2', { peso: 76, pas: 132, pad: 84, glu: 104, dPeso: 0, dPas: -0.5, dGlu: 0 }],
    ['p4', { peso: 78, pas: 118, pad: 76, glu: 88, dPeso: 0.1, dPas: 0, dGlu: 0 }],
    ['p6', { peso: 104, pas: 138, pad: 88, glu: 112, dPeso: -1.1, dPas: -0.8, dGlu: -1 }],
    ['p7', { peso: 61, pas: 112, pad: 72, glu: 90, dPeso: 0.2, dPas: 0, dGlu: 0 }],
  ]
  for (const [pid, b] of adultos) {
    for (let m = 11; m >= 0; m--) {
      const t = now - m * 30 * day - 3 * day
      const k = 11 - m
      obs(pid, t, 'peso', b.peso + b.dPeso * k + (r() - 0.5), 'kg')
      obs(pid, t, 'pas', b.pas + b.dPas * k + (r() - 0.5) * 8, 'mmHg')
      obs(pid, t, 'pad', b.pad + b.dPas * 0.5 * k + (r() - 0.5) * 6, 'mmHg')
      obs(pid, t, 'fc', 70 + (r() - 0.5) * 14, 'lpm')
      obs(pid, t, 'glucosa', b.glu + b.dGlu * k + (r() - 0.5) * 12, 'mg/dL')
      if (m % 3 === 0) {
        obs(pid, t, 'colesterol', 210 - k * 2 + (r() - 0.5) * 20, 'mg/dL', 'ocr')
        obs(pid, t, 'trigliceridos', 190 - k * 3 + (r() - 0.5) * 30, 'mg/dL', 'ocr')
        obs(pid, t, 'creatinina', 0.9 + (r() - 0.5) * 0.2, 'mg/dL', 'ocr')
      }
    }
    obs(pid, now - 2 * day, 'talla', pid === 'p7' ? 162 : pid === 'p1' ? 158 : 174, 'cm')
    obs(pid, now - 2 * day, 'spo2', 96 + r() * 3, '%')
    obs(pid, now - 2 * day, 'temp', 36.4 + r() * 0.5, '°C')
  }
  // HbA1c de María
  ;[8.9, 8.4, 7.9, 7.4].forEach((v, i) => obs('p1', now - (270 - i * 90) * day, 'hba1c', v, '%', 'ocr'))
  // PHQ-9 / GAD-7 de Lucía
  ;[16, 13, 10, 7].forEach((v, i) => obs('p7', now - (84 - i * 28) * day, 'escala', v, 'pts', 'escala', 'GAD-7'))
  // Pediatría: Sofía (crecimiento) y Miguel
  const nacSofia = new Date('2021-06-20').getTime()
  ;[[0, 3.2, 50, 34.5], [6, 7.6, 66, 42.5], [12, 9.4, 75, 45.5], [24, 12.1, 86.5, 47.8], [36, 14.2, 95, 49.2], [48, 16.1, 102.5, 50.1], [60, 18.2, 109.5, 50.6]].forEach(([mes, peso, talla, pc]) => {
    const t = nacSofia + mes * 30.44 * day
    if (t > now) return
    obs('p3', t, 'peso', peso, 'kg')
    obs('p3', t, 'talla', talla, 'cm')
    obs('p3', t, 'perimetro-cefalico', pc, 'cm')
  })
  obs('p8', now - 10 * day, 'peso', 44, 'kg')
  obs('p8', now - 10 * day, 'talla', 156, 'cm')
  obs('p8', now - 10 * day, 'spo2', 97, '%')
  // Rehabilitación de Carlos: flexión de rodilla
  ;[85, 98, 110, 121, 128].forEach((v, i) => obs('p4', now - (60 - i * 14) * day, 'rom', v, '°', 'camara', 'Flexión de rodilla derecha'))
  // Embarazo de Ana
  ;[58, 59.5, 61.2, 63].forEach((v, i) => obs('p5', now - (90 - i * 28) * day, 'peso', v, 'kg'))
  ;[108, 110, 112, 114].forEach((v, i) => obs('p5', now - (90 - i * 28) * day, 'pas', v, 'mmHg'))
  ;[70, 70, 72, 74].forEach((v, i) => obs('p5', now - (90 - i * 28) * day, 'pad', v, 'mmHg'))

  // Agenda de la semana (lunes a sábado, 9 a 18)
  const appointments: Appointment[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const tipos: Appointment['tipo'][] = ['subsecuente', 'primera-vez', 'subsecuente', 'procedimiento', 'telemedicina']
  const motivos = ['Control de diabetes', 'Dolor de rodilla', 'Revisión de laboratorios', 'Control prenatal', 'Seguimiento', 'Tos y fiebre', 'Control de presión', 'Ansiedad, seguimiento']
  let aid = 0
  for (let d = 0; d < 6; d++) {
    const slots = d === 5 ? [9, 10, 11] : [9, 10, 11.5, 13, 16, 17]
    for (const h of slots) {
      if (r() < 0.25) continue
      const start = new Date(monday.getTime() + d * day + h * 3600000)
      const p = patients[Math.floor(r() * patients.length)]
      const past = start.getTime() < now
      appointments.push({
        id: 'a' + aid++,
        patientId: p.id,
        inicio: start.toISOString(),
        fin: new Date(start.getTime() + 45 * 60000).toISOString(),
        tipo: tipos[Math.floor(r() * tipos.length)],
        estado: past ? (r() < 0.9 ? 'atendida' : 'no-asistio') : r() < 0.6 ? 'confirmada' : 'agendada',
        motivo: motivos[Math.floor(r() * motivos.length)],
      })
    }
  }

  const encounters: Encounter[] = [
    {
      id: 'e1', patientId: 'p1', fecha: iso(now - 33 * day), plantilla: 'SOAP', motivo: 'Control de diabetes e hipertensión',
      subjetivo: 'Refiere buen apego a metformina. Niega poliuria, polidipsia. Ocasionalmente olvida losartán. Camina 20 min 3 veces por semana.',
      objetivo: 'TA 138/86 mmHg, FC 74 lpm, peso 77.2 kg. Pies sin lesiones, sensibilidad conservada con monofilamento.',
      analisis: 'DM2 con mejoría de control glucémico (HbA1c 7.9 → 7.4%). HAS en metas casi alcanzadas.',
      plan: 'Continuar metformina 850 mg c/12 h. Reforzar apego a losartán. Laboratorios de control en 3 meses (HbA1c, perfil de lípidos, creatinina, EGO). Plan de alimentación.',
      diagnosticos: [{ codigo: 'E11.9', nombre: 'Diabetes mellitus tipo 2 sin complicaciones' }, { codigo: 'I10', nombre: 'Hipertensión esencial (primaria)' }],
      firmada: true, firmadaEn: iso(now - 33 * day), adendas: [],
    },
    {
      id: 'e2', patientId: 'p4', fecha: iso(now - 14 * day), plantilla: 'Evolución', motivo: 'Rehabilitación de rodilla',
      subjetivo: 'Dolor 3/10 al subir escaleras. Mejoría progresiva.', objetivo: 'Flexión de rodilla derecha 121° medida con goniómetro virtual. Sin derrame.',
      analisis: 'Evolución favorable post-lesión de LCA.', plan: 'Continuar ejercicios de fortalecimiento de cuádriceps. Revaloración en 2 semanas.',
      diagnosticos: [{ codigo: 'S83.5', nombre: 'Esguince y torcedura de ligamento cruzado de la rodilla' }], firmada: true, firmadaEn: iso(now - 14 * day), adendas: [],
    },
    {
      id: 'e3', patientId: 'p7', fecha: iso(now - 28 * day), plantilla: 'Salud mental', motivo: 'Seguimiento de ansiedad',
      subjetivo: 'Duerme mejor. Menos episodios de preocupación excesiva.', objetivo: 'GAD-7: 10 puntos (previo 13).',
      analisis: 'TAG con respuesta parcial a sertralina.', plan: 'Continuar sertralina 50 mg. Terapia cognitivo-conductual semanal. Cita en 4 semanas.',
      diagnosticos: [{ codigo: 'F41.1', nombre: 'Trastorno de ansiedad generalizada' }], firmada: true, firmadaEn: iso(now - 28 * day), adendas: [],
    },
  ]

  const prescriptions: Prescription[] = [
    {
      id: 'rx1', patientId: 'p1', fecha: iso(now - 33 * day), folio: 'RX-000101',
      items: [
        { medicamento: 'Metformina', presentacion: 'Tabletas 850 mg', dosis: '1 tableta', via: 'Oral', frecuencia: 'Cada 12 horas', duracion: '90 días', indicaciones: 'Con alimentos' },
        { medicamento: 'Losartán', presentacion: 'Tabletas 50 mg', dosis: '1 tableta', via: 'Oral', frecuencia: 'Cada 24 horas', duracion: '90 días' },
      ],
      indicaciones: 'Dieta baja en azúcares simples. Caminar 30 minutos diarios.',
    },
    {
      id: 'rx2', patientId: 'p2', fecha: iso(now - 20 * day), folio: 'RX-000102',
      items: [
        { medicamento: 'Ácido acetilsalicílico', presentacion: 'Tabletas 100 mg', dosis: '1 tableta', via: 'Oral', frecuencia: 'Cada 24 horas', duracion: '90 días', indicaciones: 'Después de la comida' },
        { medicamento: 'Atorvastatina', presentacion: 'Tabletas 40 mg', dosis: '1 tableta', via: 'Oral', frecuencia: 'Cada 24 horas', duracion: '90 días', indicaciones: 'Por la noche' },
        { medicamento: 'Metoprolol', presentacion: 'Tabletas 50 mg', dosis: '1 tableta', via: 'Oral', frecuencia: 'Cada 12 horas', duracion: '90 días', indicaciones: 'No suspender sin indicación médica' },
      ],
      indicaciones: 'Acudir a urgencias si presenta dolor torácico.',
    },
  ]

  const payments: Payment[] = []
  const conceptos: [string, number][] = [['Consulta subsecuente', 800], ['Consulta primera vez', 1000], ['Procedimiento menor', 1800], ['Videoconsulta', 700]]
  let pid = 0
  for (let i = 0; i < 70; i++) {
    const [c, m] = conceptos[Math.floor(r() * conceptos.length)]
    const metodo = (['efectivo', 'tarjeta', 'transferencia'] as const)[Math.floor(r() * 3)]
    payments.push({ id: 'pay' + pid++, patientId: patients[Math.floor(r() * patients.length)].id, fecha: iso(now - Math.floor(r() * 90) * day), concepto: c, monto: m, metodo, facturado: r() < 0.4 })
  }

  // Registros de las herramientas de especialidad, enfermería y operación (cada módulo define los suyos en demo.ts)
  const registros: Registro[] = [
    ...demoPrenatal(now), ...demoVacunacion(now), ...demoDesarrollo(now), ...demoVision(now), ...demoAudiometria(now),
    ...demoTamizajes(now), ...demoTriaje(now), ...demoEnfermeria(now), ...demoNutricion(now), ...demoOrdenes(now),
    ...demoCertificados(now), ...demoInventario(now), ...demoTareas(now), ...demoEncuestas(now),
  ]
  observations.push(...demoEnfermeriaObs(now), ...demoVisionObs(now))

  return {
    version: 2,
    patients,
    appointments,
    encounters,
    observations,
    prescriptions,
    documents: [],
    payments,
    registros,
    settings: {
      doctor: {
        nombre: 'Dra. Andrea Morales Peña',
        especialidad: 'Medicina Familiar',
        cedula: '12345678',
        cedulaEspecialidad: '87654321',
        universidad: 'Universidad Nacional Autónoma de México',
        direccion: 'Av. Insurgentes Sur 1234, Consultorio 502, Col. Del Valle, CDMX',
        telefono: '55 5000 0000',
        email: 'consultorio@ejemplo.mx',
        rfc: 'MOPA800101AB1',
      },
      clinica: 'Clínica Demo MediSuite',
      tema: 'claro',
      servicios: {},
    },
  }
}
