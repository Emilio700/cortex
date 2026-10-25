// Dictado por voz con Web Speech API (Chrome/Edge: webkitSpeechRecognition). Un solo micrófono activo a la vez.
import { useCallback, useEffect, useRef, useState } from 'react'

interface Rec {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecCtor = new () => Rec

const Ctor: RecCtor | undefined =
  typeof window !== 'undefined' ? ((window as unknown as Record<string, RecCtor | undefined>).SpeechRecognition ?? (window as unknown as Record<string, RecCtor | undefined>).webkitSpeechRecognition) : undefined

export const dictadoDisponible = !!Ctor

export function useDictado(onFinal: (key: string, texto: string) => void) {
  const [activo, setActivo] = useState<string | null>(null)
  const [interino, setInterino] = useState('')
  const [error, setError] = useState('')
  const rec = useRef<Rec | null>(null)
  const clave = useRef<string | null>(null)
  const cb = useRef(onFinal)
  cb.current = onFinal

  const detener = useCallback(() => {
    clave.current = null
    setActivo(null)
    setInterino('')
    rec.current?.stop()
    rec.current = null
  }, [])

  const iniciar = useCallback(
    (key: string) => {
      if (!Ctor) return
      if (clave.current === key) return detener()
      detener()
      setError('')
      const r = new Ctor()
      r.lang = 'es-MX'
      r.continuous = true
      r.interimResults = true
      r.onresult = (e) => {
        let tmp = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]
          if (res.isFinal) cb.current(key, res[0].transcript.trim())
          else tmp += res[0].transcript
        }
        setInterino(tmp)
      }
      r.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        setError(e.error === 'not-allowed' ? 'Permiso de micrófono denegado.' : `Error de dictado: ${e.error}`)
        detener()
      }
      // Chrome corta tras silencios: reiniciamos mientras siga activo
      r.onend = () => {
        if (clave.current === key && rec.current === r) {
          try {
            r.start()
          } catch {
            detener()
          }
        }
      }
      rec.current = r
      clave.current = key
      setActivo(key)
      try {
        r.start()
      } catch {
        detener()
      }
    },
    [detener],
  )

  useEffect(() => detener, [detener])
  return { soportado: dictadoDisponible, activo, interino, error, iniciar, detener }
}
