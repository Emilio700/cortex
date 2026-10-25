// Datos demo: referencia de p2 a Cardiología y certificado médico deportivo de p4, ambos emitidos con huella.
import type { Registro } from '../../lib/types'
import { prepararEmision, tituloCert } from './documento'
import type { Campos } from './plantillas'

const MEDICO = { nombre: 'Dra. Andrea Morales Peña', cedula: '12345678', especialidad: 'Medicina Familiar', cedulaEspecialidad: '87654321' }

export function demoCertificados(now: number): Registro[] {
  const day = 86_400_000
  const out: Registro[] = []
  const emitir = (r: Registro, paciente: { nombre: string; edad: string; sexo: 'F' | 'M'; curp?: string }, fecha: string) => {
    const patch = prepararEmision(r, paciente, MEDICO, out, fecha)
    out.push({ ...r, ...patch })
  }

  const camposRef: Campos = {
    modalidad: 'referencia',
    origen: 'Clínica Demo MediSuite · Av. Insurgentes Sur 1234, Consultorio 502, Col. Del Valle, CDMX · Tel. 55 5000 0000',
    especialidad: 'Cardiología',
    destino: 'Servicio de Cardiología, hospital de segundo nivel',
    urgencia: 'preferente',
    motivo: 'Angina de esfuerzo de reciente aparición (clase II CCS) en paciente con cardiopatía isquémica y stent coronario (2021). Se solicita valoración y estratificación.',
    resumen:
      'Antecedentes: Cardiopatía isquémica, stent en 2021. Exfumador.\nAlergias: negadas.\nMedicamentos actuales: Ácido acetilsalicílico 100 mg; Atorvastatina 40 mg; Metoprolol 50 mg.\nÚltima consulta: refiere opresión retroesternal al subir 2 pisos, cede con reposo en 5 min. Sin síncope. Exploración cardiopulmonar sin alteraciones.\nSignos vitales recientes: TA 138/84 mmHg, FC 68 lpm, SpO2 96 %.',
    impresionDx: 'I20.9 Angina de pecho, no especificada; I25.1 Enfermedad aterosclerótica del corazón; Z95.5 Presencia de implante y injerto vascular coronario',
    tratamiento: 'Ácido acetilsalicílico 100 mg/día; atorvastatina 40 mg/día; metoprolol 50 mg/día. Se indicó isosorbida sublingual PRN.',
    estudiosAdjuntos: [],
    estudiosTexto: 'ECG de reposo en ritmo sinusal, sin cambios agudos del ST',
    recomendaciones: 'Valorar prueba de esfuerzo o estudio de perfusión y ajuste de tratamiento antiisquémico.',
  }
  const fRef = new Date(now - 3 * day).toISOString()
  emitir(
    { id: 'demo-cert-ref-p2', patientId: 'p2', fecha: fRef, tipo: 'referencia', estado: 'borrador', titulo: tituloCert('referencia', camposRef), datos: { plantilla: 'referencia', campos: camposRef } },
    { nombre: 'José Luis Hernández García', edad: '70 años', sexo: 'M', curp: 'HEGJ551102HJCRRS04' },
    fRef,
  )

  const camposSalud: Campos = {
    finalidad: 'deportivo',
    deporte: 'fútbol amateur',
    conclusion: 'apto-restricciones',
    restricciones: 'evitar deportes de contacto con pivoteo de rodilla derecha hasta completar rehabilitación de ligamento cruzado anterior; actividad aeróbica y fortalecimiento sin restricción',
    peso: '78',
    talla: '176',
    ta: '118/76',
    fc: '64',
    fr: '14',
    temp: '36.5',
    tipoSangre: 'O-',
    hallazgos: 'Cardiopulmonar sin alteraciones. Rodilla derecha sin derrame, cajón anterior con tope firme, arcos de movilidad completos. Resto sin alteraciones.',
    vigencia: '6 meses',
  }
  const fSalud = new Date(now - 10 * day).toISOString()
  emitir(
    { id: 'demo-cert-salud-p4', patientId: 'p4', fecha: fSalud, tipo: 'certificado', estado: 'borrador', titulo: tituloCert('salud', camposSalud), datos: { plantilla: 'salud', campos: camposSalud } },
    { nombre: 'Carlos Alberto Sánchez Torres', edad: '36 años', sexo: 'M' },
    fSalud,
  )
  return out
}
