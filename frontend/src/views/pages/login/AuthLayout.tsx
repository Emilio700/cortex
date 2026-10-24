/**
 * AuthLayout — la pantalla de acceso que comparten Login, «¿Olvidaste tu
 * contraseña?», «Restablecer contraseña» y el cambio obligatorio.
 *
 * Plan 32, punto 1 (decisiones de Emilio): la marca es el ícono de la app
 * instalada, redibujado por capas (`EmblemaGems`), con su nombre
 * «Gynecology & Expert Management System». En la computadora, dos columnas:
 * el panel de marca con el emblema animado, el electrocardiograma y las
 * partículas, y a la derecha la tarjeta. En el teléfono, una columna: el
 * emblema chico arriba (sólo con su entrada) y el formulario enseguida, sin
 * desplazarse para llegar al botón. El estilo vive en `scss/_acceso.scss`.
 */
import React from 'react'
import EmblemaGems from '../../../components/EmblemaGems'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

// Posición, tamaño y ritmo de cada partícula: fijos, para que la composición
// sea siempre la misma y no salte entre cargas.
const PARTICULAS = [
  { left: 8, size: 10, dur: 19, delay: 0 },
  { left: 18, size: 6, dur: 23, delay: 4 },
  { left: 27, size: 14, dur: 27, delay: 9 },
  { left: 39, size: 8, dur: 21, delay: 2 },
  { left: 52, size: 5, dur: 18, delay: 11 },
  { left: 63, size: 12, dur: 25, delay: 6 },
  { left: 74, size: 7, dur: 20, delay: 14 },
  { left: 85, size: 10, dur: 24, delay: 3 },
  { left: 93, size: 6, dur: 22, delay: 8 },
]

// Un latido completo: línea base, onda P, complejo QRS y onda T, repetido.
const LATIDO = 'h70 l10 -8 l10 8 h18 l7 12 l9 -62 l10 76 l7 -26 h22 q14 -18 28 0 h69'
const ECG = `M0 70 ${LATIDO} ${LATIDO} ${LATIDO} ${LATIDO}`

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer }) => (
  <div className="acceso">
    <section className="acceso-marca" aria-label="G.E.M.S">
      <div className="acceso-particulas" aria-hidden="true">
        {PARTICULAS.map((p) => (
          <span
            key={p.left}
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      <svg className="acceso-ecg" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="acceso-ecg-trazo" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#52b8f6" />
            <stop offset="1" stopColor="#8b6ff5" />
          </linearGradient>
        </defs>
        <path className="acceso-ecg__base" d={ECG} />
        <path d={ECG} pathLength={1} />
      </svg>

      <div className="acceso-marca__emblema">
        <EmblemaGems size={188} animacion="entrada" />
      </div>
      <div>
        <p className="acceso-marca__nombre">G.E.M.S</p>
        <p className="acceso-marca__lema">Gynecology &amp; Expert Management System</p>
      </div>
      <p className="acceso-marca__frase">
        La consulta, el expediente y la agenda del consultorio, en un solo lugar.
      </p>
    </section>

    <main className="acceso-formulario">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="acceso-tarjeta">
          <div className="acceso-tarjeta__acento" aria-hidden="true" />
          <h1 className="acceso-tarjeta__titulo">{title}</h1>
          {subtitle && <p className="acceso-tarjeta__subtitulo">{subtitle}</p>}
          {children}
        </div>
        {footer && <div className="acceso-pie">{footer}</div>}
      </div>
    </main>
  </div>
)

export default AuthLayout
