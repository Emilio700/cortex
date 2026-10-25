/**
 * «Reducir movimiento»: el del sistema operativo o el interruptor de Cortex
 * (clase `.reduce-motion` en <html>). Se escucha en vivo: si alguien lo
 * enciende con el atlas abierto, la rotación y las animaciones se detienen ya.
 */
import { useEffect, useState } from 'react'

const CONSULTA = '(prefers-reduced-motion: reduce)'

export const quiereMenosMovimiento = (): boolean => {
  if (typeof window === 'undefined') return true
  const sistema = typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches
  return sistema || document.documentElement.classList.contains('reduce-motion')
}

export const useReducirMovimiento = (): boolean => {
  const [reducir, setReducir] = useState(quiereMenosMovimiento)
  useEffect(() => {
    const actualizar = () => setReducir(quiereMenosMovimiento())
    const consulta = typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA) : null
    consulta?.addEventListener?.('change', actualizar)
    const observador = typeof MutationObserver === 'function' ? new MutationObserver(actualizar) : null
    observador?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      consulta?.removeEventListener?.('change', actualizar)
      observador?.disconnect()
    }
  }, [])
  return reducir
}
