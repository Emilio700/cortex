// Utilidades de audio: decodificar a 16 kHz mono (Whisper), Whisper servidor y Whisper en worker.

export async function a16kMono(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const ctx = new AudioContext()
  try {
    const dec = await ctx.decodeAudioData(buf)
    const len = Math.max(1, Math.ceil(dec.duration * 16000))
    const off = new OfflineAudioContext(1, len, 16000)
    const src = off.createBufferSource()
    src.buffer = dec
    src.connect(off.destination) // OfflineAudioContext mono mezcla los canales
    src.start()
    const r = await off.startRendering()
    return r.getChannelData(0)
  } finally {
    void ctx.close()
  }
}

/** Whisper en servidor con API compatible con OpenAI (speaches, faster-whisper-server, etc.). */
export async function whisperServidor(base: string, audio: Blob, modelo: string, signal?: AbortSignal) {
  const fd = new FormData()
  const ext = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'm4a' : audio.type.includes('wav') ? 'wav' : audio.type.includes('mpeg') ? 'mp3' : 'webm'
  fd.append('file', audio, `dictado.${ext}`)
  fd.append('model', modelo)
  fd.append('language', 'es')
  fd.append('response_format', 'json')
  const r = await fetch(base.replace(/\/$/, '') + '/v1/audio/transcriptions', { method: 'POST', body: fd, signal })
  if (!r.ok) throw new Error(`Servidor Whisper respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return String(j.text ?? '').trim()
}

export type EventoWorker =
  | { type: 'estado'; texto: string }
  | { type: 'progreso'; status: string; file?: string; progress?: number; loaded?: number; total?: number }
  | { type: 'resultado'; texto: string }
  | { type: 'error'; texto: string }

let worker: Worker | null = null

export function whisperNavegador(audio: Float32Array, model: string, device: 'webgpu' | 'wasm', on: (e: EventoWorker) => void): Promise<string> {
  if (!worker) worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  return new Promise((res, rej) => {
    w.onmessage = (e: MessageEvent<EventoWorker>) => {
      on(e.data)
      if (e.data.type === 'resultado') res(e.data.texto)
      if (e.data.type === 'error') rej(new Error(e.data.texto))
    }
    w.onerror = (e) => rej(new Error(e.message || 'Error en el worker de Whisper'))
    w.postMessage({ type: 'transcribir', audio, model, device }, [audio.buffer])
  })
}

export async function tieneWebGPU() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu
    return !!(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}
