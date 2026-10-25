import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Sparkles, Copy, Download, Save, Square, Pencil, Eye, ShieldCheck } from 'lucide-react'
import { Page, Card, Button, Field, Input, Select, Textarea, Badge, Notice, Tabs, PatientBar, Disclaimer, Empty } from '../../components/ui'
import { add, getDB, useActivePatient, useSettings } from '../../lib/store'
import { downloadBlob, nombreCompleto } from '../../lib/utils'
import { construirContexto, fichaTexto } from './contexto'
import { desidentificar, presidio, reidentificar, type Mapa } from './anon'
import { generar, hayClaude, resolverMotor, type Motor } from './llm'
import { instruccionesLocal, referenciaLocal, resumenLocal, soapLocal } from './local'
import { Markdown } from './md'

type Tarea = 'resumen' | 'soap' | 'referencia' | 'instrucciones'

const TAREAS: { id: Tarea; label: string }[] = [
  { id: 'resumen', label: 'Resumen pre-consulta' },
  { id: 'soap', label: 'Transcripción → SOAP' },
  { id: 'referencia', label: 'Carta de referencia' },
  { id: 'instrucciones', label: 'Instrucciones al paciente' },
]

const SYSTEM =
  'Eres un asistente clínico para un médico en México. Escribe en español de México, claro y conciso, en Markdown con encabezados "##" y viñetas. ' +
  'No inventes datos: si falta información, indícalo. Los datos personales vienen reemplazados por marcadores entre corchetes (p. ej. [PACIENTE], [TELEFONO_1]); ' +
  'consérvalos exactamente así en tu respuesta. Tu texto será revisado por el médico antes de usarse.'

const MOTORES: { id: Motor; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'claude', label: 'Claude (claude.ai)' },
  { id: 'api', label: 'API de Anthropic (tu llave)' },
  { id: 'local', label: 'Local sin IA (plantillas)' },
]

function seccionesSoap(t: string) {
  const out = { subjetivo: '', objetivo: '', analisis: '', plan: '' }
  const map: [keyof typeof out, RegExp][] = [
    ['subjetivo', /^(s|subjetivo)\b/i],
    ['objetivo', /^(o|objetivo)\b/i],
    ['analisis', /^(a|an[aá]lisis|evaluaci[oó]n|valoraci[oó]n|impresi[oó]n)\b/i],
    ['plan', /^(p|plan)\b/i],
  ]
  let cur: keyof typeof out | null = null
  for (const l of t.split('\n')) {
    const h = l.match(/^#{1,4}\s*(?:\*\*)?(.+?)(?:\*\*)?\s*$/) ?? l.match(/^\*\*(.+?)\*\*:?\s*$/)
    const k = h && map.find(([, re]) => re.test(h[1].trim()))?.[0]
    if (k) cur = k
    else if (cur) out[cur] += l + '\n'
  }
  for (const k in out) out[k as keyof typeof out] = out[k as keyof typeof out].trim()
  return out
}

export default function Modulo() {
  const { id, patient } = useActivePatient()
  const settings = useSettings()
  const [params] = useSearchParams()
  const [tarea, setTarea] = useState<Tarea>((params.get('tarea') as Tarea) || 'resumen')
  const [motor, setMotor] = useState<Motor>('auto')
  const [trans, setTrans] = useState('')
  const [destino, setDestino] = useState('')
  const [motivoRef, setMotivoRef] = useState('')
  const [indic, setIndic] = useState('')
  const [out, setOut] = useState('')
  const [enviado, setEnviado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [editar, setEditar] = useState(false)
  const [usado, setUsado] = useState<string>('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('medisuite.transcripcion')
      if (t) {
        setTrans(t)
        setTarea('soap')
        sessionStorage.removeItem('medisuite.transcripcion')
      }
    } catch { /* ignorar */ }
  }, [])

  // Prellenar indicaciones con el plan de la última consulta
  useEffect(() => {
    if (!id) return
    const c = construirContexto(getDB(), id)
    setIndic(c?.consultas[0]?.plan ?? '')
    setOut('')
    setEnviado(null)
  }, [id])

  const real = resolverMotor(motor, settings.anthropicApiKey)
  const disponible = { claude: hayClaude(), api: !!settings.anthropicApiKey, local: true }

  const promptTarea = useMemo(() => {
    switch (tarea) {
      case 'resumen':
        return 'Elabora un RESUMEN PRE-CONSULTA para el médico: problemas activos, alergias, medicamentos, tendencias de signos vitales y laboratorios (señala valores fuera de meta y su dirección), y una lista de pendientes o puntos a revisar en esta consulta. Máximo 250 palabras.'
      case 'soap':
        return 'Convierte la TRANSCRIPCIÓN de la consulta en una nota clínica SOAP. Usa exactamente los encabezados "## Subjetivo", "## Objetivo", "## Análisis" y "## Plan". Usa solo información de la transcripción y del expediente; si algo no se mencionó escribe "No referido". En Análisis puedes sugerir diagnósticos con código CIE-10, marcados como sugerencia.\n\nTRANSCRIPCIÓN:\n"""\n' + trans + '\n"""'
      case 'referencia':
        return `Redacta una CARTA DE REFERENCIA formal dirigida a: ${destino || 'especialista'}. Motivo de la referencia: ${motivoRef || 'no especificado'}. Incluye resumen clínico, antecedentes relevantes, tratamiento actual, estudios recientes y la pregunta concreta al especialista. Termina exactamente con la línea [FIRMA_MEDICO].`
      case 'instrucciones':
        return 'Escribe INSTRUCCIONES PARA EL PACIENTE en lenguaje muy sencillo (nivel primaria), hablándole de "usted", con viñetas: cómo tomar sus medicamentos, cuidados en casa, señales de alarma para acudir a urgencias y próxima cita. No agregues medicamentos que no estén indicados.\n\nINDICACIONES DEL MÉDICO:\n"""\n' + indic + '\n"""'
    }
  }, [tarea, trans, destino, motivoRef, indic])

  function local() {
    const c = construirContexto(getDB(), id!)!
    return tarea === 'resumen' ? resumenLocal(c) : tarea === 'soap' ? soapLocal(trans, c) : tarea === 'referencia' ? referenciaLocal(c, destino, motivoRef, settings) : instruccionesLocal(c, indic)
  }

  async function ejecutar() {
    if (!id || !patient) return
    setAviso(null)
    setEditar(false)
    setOut('')
    if (tarea === 'soap' && !trans.trim()) return setAviso({ tone: 'warn', text: 'Pega o dicta primero la transcripción.' })
    if (real === 'local') {
      setEnviado(null)
      setUsado('Local (sin IA)')
      setOut(local())
      return
    }
    const c = construirContexto(getDB(), id)!
    const d = settings.doctor
    const mapa: Mapa = {
      '[PACIENTE]': nombreCompleto(patient),
      '[NOMBRE]': patient.nombre,
      '[APELLIDOS]': patient.apellidos,
      '[FECHA_NAC]': patient.fechaNac.split('-').reverse().join('/'),
      ...(patient.telefono ? { '[TELEFONO]': patient.telefono } : {}),
      ...(patient.curp ? { '[CURP]': patient.curp } : {}),
      ...(patient.email ? { '[CORREO]': patient.email } : {}),
      '[FIRMA_MEDICO]': `**${d.nombre}**\n${d.especialidad} · Céd. Prof. ${d.cedula}\n${d.telefono} · ${d.email}`,
    }
    let prompt = `${promptTarea}\n\nEXPEDIENTE:\n${fichaTexto(c)}`
    prompt = desidentificar(prompt, patient, mapa).texto
    if (settings.servicios.presidio) {
      try {
        prompt = await presidio(settings.servicios.presidio, prompt, mapa)
      } catch {
        setAviso({ tone: 'warn', text: 'Presidio no respondió; se usó solo el anonimizador local.' })
      }
    }
    setEnviado(prompt)
    setOcupado(true)
    setUsado(real === 'claude' ? 'Claude (claude.ai)' : 'API de Anthropic · claude-sonnet-5-5')
    abort.current = new AbortController()
    try {
      const r = await generar(real, SYSTEM, prompt, { apiKey: settings.anthropicApiKey, onText: (t) => setOut(reidentificar(t, mapa)), signal: abort.current.signal })
      setOut(reidentificar(r, mapa))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setAviso({ tone: 'danger', text: `${(e as Error).message}. Se muestra el resultado local sin IA.` })
      setUsado('Local (sin IA)')
      setOut(local())
    } finally {
      setOcupado(false)
    }
  }

  function guardarBorrador() {
    if (!id) return
    const s = tarea === 'soap' ? seccionesSoap(out) : null
    const titulo = TAREAS.find((t) => t.id === tarea)!.label
    add('encounters', {
      patientId: id,
      plantilla: `ia-${tarea}`,
      motivo: `Borrador IA: ${titulo}`,
      subjetivo: s ? s.subjetivo || out : tarea === 'instrucciones' ? '' : out,
      objetivo: s?.objetivo ?? '',
      analisis: s?.analisis ?? '',
      plan: s ? s.plan : tarea === 'instrucciones' ? out : '',
      diagnosticos: [],
      firmada: false,
      adendas: [],
    })
    setAviso({ tone: 'info', text: 'Se guardó una nota borrador (sin firmar) en el expediente. Revísala y fírmala en Consulta.' })
  }

  if (!patient) return (
    <Page title="Asistente IA"><PatientBar /><Empty>Selecciona un paciente.</Empty></Page>
  )

  return (
    <Page title="Asistente IA" subtitle="Resúmenes, notas SOAP, cartas e instrucciones a partir del expediente">
      <PatientBar />
      {aviso && <Notice tone={aviso.tone} onClose={() => setAviso(null)}>{aviso.text}</Notice>}
      <Tabs<Tarea> value={tarea} onChange={(t) => { setTarea(t); setOut(''); setEnviado(null) }} tabs={TAREAS} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Entrada">
          <div className="space-y-3">
            {tarea === 'resumen' && <p className="text-sm text-muted">Se usan las últimas consultas, alergias, medicamentos, signos vitales, laboratorios y citas del expediente.</p>}
            {tarea === 'soap' && (
              <Field label="Transcripción de la consulta" hint={<>Puedes traerla desde <Link to="/dictado" className="underline">Dictado</Link> con "Estructurar con IA".</>}>
                <Textarea value={trans} onChange={(e) => setTrans(e.target.value)} className="min-h-48" placeholder="Paciente refiere dolor de cabeza desde hace 3 días… T/A 130/85… Probable cefalea tensional… Se indica paracetamol 500 mg cada 8 horas…" />
              </Field>
            )}
            {tarea === 'referencia' && (
              <>
                <Field label="Dirigida a"><Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Ej. Endocrinología, Dr(a). …" /></Field>
                <Field label="Motivo de la referencia"><Textarea value={motivoRef} onChange={(e) => setMotivoRef(e.target.value)} placeholder="Ej. Descontrol glucémico pese a doble terapia oral" /></Field>
              </>
            )}
            {tarea === 'instrucciones' && (
              <Field label="Indicaciones del médico" hint="Se prellena con el plan de la última consulta.">
                <Textarea value={indic} onChange={(e) => setIndic(e.target.value)} className="min-h-36" />
              </Field>
            )}
            <Field label="Motor">
              <Select value={motor} onChange={(e) => setMotor(e.target.value as Motor)}>
                {MOTORES.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.id !== 'auto' && !disponible[m.id as 'claude' | 'api' | 'local']}>
                    {m.label}{m.id !== 'auto' && !disponible[m.id as 'claude' | 'api' | 'local'] ? ' — no disponible' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              Se usará: <Badge tone={real === 'local' ? 'neutral' : 'brand'}>{MOTORES.find((m) => m.id === real)!.label}</Badge>
              {!disponible.api && real === 'local' && <span>· Agrega tu llave de Anthropic en <Link to="/configuracion" className="underline">Configuración</Link> para usar IA.</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={ejecutar} disabled={ocupado}><Sparkles className="size-4" /> Generar</Button>
              {ocupado && <Button onClick={() => abort.current?.abort()}><Square className="size-4" /> Detener</Button>}
            </div>
            {real !== 'local' && (
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
                Antes de enviar se reemplazan nombre, CURP, teléfono, correo, fecha de nacimiento y direcciones por marcadores{settings.servicios.presidio ? ' (local + Presidio)' : ' (anonimizador local)'}; se restituyen solo en este navegador.
              </p>
            )}
          </div>
        </Card>

        <Card
          title={<span className="flex items-center gap-2">Resultado {usado && out && <Badge>{usado}</Badge>}</span>}
          actions={out ? <Button size="sm" variant="ghost" onClick={() => setEditar(!editar)}>{editar ? <><Eye className="size-4" /> Ver</> : <><Pencil className="size-4" /> Editar</>}</Button> : undefined}
        >
          {enviado && (
            <details className="mb-3 rounded-lg border border-line bg-surface-2 p-2 text-xs">
              <summary className="cursor-pointer font-medium">Lo que se envía (desidentificado)</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono" data-testid="enviado">{SYSTEM}{'\n\n'}{enviado}</pre>
            </details>
          )}
          {!out && !ocupado && <Empty>Elige una tarea y presiona Generar.</Empty>}
          {ocupado && !out && <div className="animate-pulse text-sm text-muted">Generando…</div>}
          {out && (editar ? <Textarea value={out} onChange={(e) => setOut(e.target.value)} className="min-h-96 font-mono text-xs" /> : <div data-testid="resultado"><Markdown text={out} /></div>)}
          {out && !ocupado && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
              <Button onClick={() => navigator.clipboard?.writeText(out)}><Copy className="size-4" /> Copiar</Button>
              <Button onClick={guardarBorrador}><Save className="size-4" /> Guardar como nota borrador</Button>
              <Button onClick={() => downloadBlob(new Blob([out], { type: 'text/plain;charset=utf-8' }), `${tarea}-${patient.apellidos.split(' ')[0].toLowerCase()}.txt`)}><Download className="size-4" /> Descargar .txt</Button>
            </div>
          )}
          <Disclaimer>El texto generado es un borrador: puede contener errores u omisiones y debe ser revisado, corregido y validado por el médico antes de usarse o entregarse al paciente.</Disclaimer>
        </Card>
      </div>
    </Page>
  )
}
