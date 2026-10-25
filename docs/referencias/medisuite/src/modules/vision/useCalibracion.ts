// Calibración de pantalla por dispositivo (comodidad de interfaz: se guarda en localStorage de este navegador).
import { useCallback, useState } from 'react'
import { pxPorMm } from './optotipos'

const KEY = 'medisuite.vision.calibracion'

export interface Calibracion {
  anchoPx: number // ancho en px CSS que igualó a la tarjeta ID-1
  dpr: number // devicePixelRatio al calibrar (cambia con el zoom del navegador)
  pantalla: string // ancho × alto de la pantalla al calibrar
  fecha: string
}

function leer(): Calibracion | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Calibracion
    return c && c.anchoPx > 50 ? c : null
  } catch {
    return null
  }
}

export function pantallaActual() {
  return typeof window === 'undefined' ? '' : `${window.screen.width}×${window.screen.height}`
}

export function useCalibracion() {
  const [cal, setCal] = useState<Calibracion | null>(leer)
  const guardar = useCallback((anchoPx: number) => {
    const c: Calibracion = { anchoPx, dpr: window.devicePixelRatio || 1, pantalla: pantallaActual(), fecha: new Date().toISOString() }
    try {
      localStorage.setItem(KEY, JSON.stringify(c))
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
    setCal(c)
  }, [])
  const borrar = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignorar */
    }
    setCal(null)
  }, [])
  // Sin calibrar se asume 96 px CSS por pulgada (3.78 px/mm), que casi nunca es exacto.
  const pxmm = cal ? pxPorMm(cal.anchoPx) : 96 / 25.4
  const cambio = !!cal && (Math.abs((window.devicePixelRatio || 1) - cal.dpr) > 0.01 || pantallaActual() !== cal.pantalla)
  return { cal, pxmm, guardar, borrar, cambio }
}
