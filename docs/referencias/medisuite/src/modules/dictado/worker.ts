// Web Worker: Whisper en el navegador con @huggingface/transformers (WebGPU o WASM).
// El modelo se descarga de Hugging Face la primera vez y queda en la caché del navegador.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

type Msg = { type: 'transcribir'; audio: Float32Array; model: string; device: 'webgpu' | 'wasm' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null
let clave = ''

self.onmessage = async (e: MessageEvent<Msg>) => {
  const { audio, model, device } = e.data
  let fase = 'carga'
  try {
    if (!asr || clave !== model + device) {
      self.postMessage({ type: 'estado', texto: 'Cargando modelo…' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts: any = {
        device,
        dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (p: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => self.postMessage({ type: 'progreso', ...p }),
      }
      asr = await pipeline('automatic-speech-recognition', model, opts)
      clave = model + device
    }
    fase = 'transcripcion'
    self.postMessage({ type: 'estado', texto: 'Transcribiendo…' })
    const out = await asr(audio, { language: 'spanish', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
    const texto = Array.isArray(out) ? out.map((o: { text: string }) => o.text).join(' ') : out.text
    self.postMessage({ type: 'resultado', texto: String(texto).trim() })
  } catch (err) {
    const m = String((err as Error)?.message ?? err)
    self.postMessage({ type: 'error', texto: fase === 'carga' ? `No se pudo cargar el modelo ${model} (se necesita internet la primera vez para descargarlo de Hugging Face): ${m}` : m })
  }
}
