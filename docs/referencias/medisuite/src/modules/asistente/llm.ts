// Motores de IA: (1) Claude dentro de claude.ai (runtime de artifacts), (2) API de Anthropic con la llave
// del usuario directo desde el navegador (streaming SSE), (3) local sin LLM (ver local.ts).

export type Motor = 'auto' | 'claude' | 'api' | 'local'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const claudeRt = (): any => (typeof window !== 'undefined' ? (window as any).claude : null)

export const hayClaude = () => !!claudeRt()?.use

export function resolverMotor(m: Motor, apiKey?: string): Exclude<Motor, 'auto'> {
  if (m !== 'auto') return m
  if (hayClaude()) return 'claude'
  if (apiKey) return 'api'
  return 'local'
}

export async function generar(
  motor: 'claude' | 'api',
  system: string,
  prompt: string,
  opts: { apiKey?: string; onText: (t: string) => void; signal?: AbortSignal },
): Promise<string> {
  if (motor === 'claude') {
    const c = claudeRt()
    const sample = c?.use ? await c.use('sample') : null
    if (!sample) throw new Error('El runtime de Claude no está disponible en esta página.')
    const r = await sample(`${system}\n\n${prompt}`, { onText: ({ text }: { text: string }) => opts.onText(text) })
    return String(r?.text ?? '')
  }
  if (!opts.apiKey) throw new Error('Falta la llave de API de Anthropic (Configuración).')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' }, // tareas de redacción: poco razonamiento, respuesta rápida
      stream: true,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok || !res.body) {
    let msg = `${res.status}`
    try {
      const j = await res.json()
      msg += ' ' + (j?.error?.message ?? '')
    } catch { /* ignorar */ }
    throw new Error('API de Anthropic: ' + msg)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = '', out = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const evento = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const data = evento.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
      if (!data) continue
      let j
      try { j = JSON.parse(data) } catch { continue }
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
        out += j.delta.text
        opts.onText(out)
      } else if (j.type === 'message_delta' && j.delta?.stop_reason === 'refusal') {
        out += '\n\n_(El modelo declinó completar la respuesta.)_'
        opts.onText(out)
      } else if (j.type === 'error') {
        throw new Error('API de Anthropic: ' + (j.error?.message ?? 'error'))
      }
    }
  }
  return out
}
