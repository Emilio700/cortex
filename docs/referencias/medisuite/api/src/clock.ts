// Reloj del servidor. Las pruebas pueden adelantarlo para simular expiración de sesiones.
let offsetMs = 0

export const now = (): Date => new Date(Date.now() + offsetMs)
export const nowMs = (): number => Date.now() + offsetMs
export const nowIso = (): string => now().toISOString()

/** Solo para pruebas. */
export function advanceClock(ms: number) {
  offsetMs += ms
}
export function resetClock() {
  offsetMs = 0
}
