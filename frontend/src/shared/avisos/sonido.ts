/**
 * Sonido corto de los avisos, con Web Audio y sin archivo nuevo (plan 27, §3.7).
 *
 * Es opcional y arranca apagado: un consultorio con pacientes no es lugar para
 * pitidos que nadie pidió. Nunca es el único canal; siempre hay algo visible.
 *
 * El navegador no deja sonar nada hasta que la persona toca la página. Si el
 * contexto de audio sigue suspendido, simplemente no suena: el emergente y el
 * título de la pestaña ya avisan.
 */

export type TonoAviso = 'accionable' | 'urgente'

type ConstructorDeAudio = typeof AudioContext

let contexto: AudioContext | null = null

function obtenerContexto(): AudioContext | null {
  if (contexto) return contexto
  const Constructor: ConstructorDeAudio | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: ConstructorDeAudio }).webkitAudioContext
      : undefined
  if (!Constructor) return null
  try {
    contexto = new Constructor()
  } catch {
    return null
  }
  return contexto
}

/** Notas (Hz) y duración de cada una. El urgente es distinto a propósito: más agudo y de tres. */
const TONOS: Record<TonoAviso, { notas: number[]; duracion: number }> = {
  accionable: { notas: [660, 880], duracion: 0.12 },
  urgente: { notas: [880, 1175, 880], duracion: 0.14 },
}

/** Toca el tono. Devuelve `false` si el navegador no lo permitió. */
export async function tocarSonido(tono: TonoAviso = 'accionable'): Promise<boolean> {
  const ctx = obtenerContexto()
  if (!ctx) return false
  try {
    if (ctx.state === 'suspended') await ctx.resume()
    if (ctx.state !== 'running') return false
    const { notas, duracion } = TONOS[tono]
    let inicio = ctx.currentTime
    for (const frecuencia of notas) {
      const oscilador = ctx.createOscillator()
      const volumen = ctx.createGain()
      oscilador.type = 'sine'
      oscilador.frequency.value = frecuencia
      // Entrada y salida suaves: sin ellas el tono «truena» al empezar y acabar.
      volumen.gain.setValueAtTime(0.0001, inicio)
      volumen.gain.exponentialRampToValueAtTime(0.2, inicio + 0.02)
      volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion)
      oscilador.connect(volumen).connect(ctx.destination)
      oscilador.start(inicio)
      oscilador.stop(inicio + duracion + 0.02)
      inicio += duracion + 0.04
    }
    return true
  } catch {
    return false
  }
}
