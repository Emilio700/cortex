// Medidor de fortaleza de contraseña (heurístico, sin dependencias). El servidor exige mínimo 10 caracteres
// y rechaza contraseñas débiles (400 contrasena_debil).
import { cx } from '../lib/utils'

const COMUNES = ['password', 'contrasena', 'contraseña', '123456', 'qwerty', 'medisuite', 'admin', 'abc123', 'letmein', 'bienvenido', 'mexico', 'clinica', 'doctor']

export function fuerzaPassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; tips: string[] } {
  const tips: string[] = []
  if (!pw) return { score: 0, label: '', tips }
  let pts = 0
  if (pw.length >= 10) pts++
  if (pw.length >= 14) pts++
  if (pw.length >= 18) pts++
  const clases = [/[a-zñ]/, /[A-ZÑ]/, /\d/, /[^A-Za-z0-9ñÑ]/].filter((r) => r.test(pw)).length
  if (clases >= 3) pts++
  if (clases === 4 && pw.length >= 12) pts++
  const low = pw.toLowerCase()
  if (COMUNES.some((c) => low.includes(c))) {
    pts -= 2
    tips.push('Evita palabras comunes como «password», «123456» o el nombre del sistema.')
  }
  if (/(.)\1{3,}/.test(pw) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(pw)) {
    pts -= 1
    tips.push('Evita repeticiones o secuencias (aaaa, 1234).')
  }
  if (pw.length < 10) tips.push('Usa al menos 10 caracteres.')
  else if (pw.length < 14 && clases < 3) tips.push('Agrega más palabras o mezcla mayúsculas, números y símbolos.')
  const score = (pw.length < 10 ? Math.min(1, Math.max(0, pts)) : Math.max(0, Math.min(4, pts))) as 0 | 1 | 2 | 3 | 4
  return { score, label: ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'][score], tips }
}

export function PasswordStrength({ value, id }: { value: string; id?: string }) {
  const f = fuerzaPassword(value)
  if (!value) return null
  const color = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-ok', 'bg-ok'][f.score]
  return (
    <div className="mt-1.5" id={id}>
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cx('h-1.5 flex-1 rounded-full', i < Math.max(1, f.score) ? color : 'bg-surface-2')} />
        ))}
      </div>
      <div className="mt-1 text-xs" role="status" aria-live="polite">
        Fortaleza: <b>{f.label}</b>
        {f.tips[0] && <span className="text-muted"> · {f.tips[0]}</span>}
      </div>
    </div>
  )
}
