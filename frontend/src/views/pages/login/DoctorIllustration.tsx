import React from 'react'

/**
 * Ilustración SVG animada de un doctor/estetoscopio para el login.
 * Diseño minimalista con animaciones sutiles (flotación, pulso).
 */
const DoctorIllustration: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg
    viewBox="0 0 500 500"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={style}
  >
    {/* Círculo decorativo de fondo */}
    <circle cx="250" cy="220" r="180" fill="url(#bgGradient)" opacity="0.15">
      <animateTransform attributeName="transform" type="scale" values="1;1.03;1" dur="4s" repeatCount="indefinite" />
    </circle>
    <circle cx="250" cy="220" r="140" fill="url(#bgGradient)" opacity="0.1">
      <animateTransform attributeName="transform" type="scale" values="1;1.05;1" dur="5s" repeatCount="indefinite" />
    </circle>

    <defs>
      <linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
      <linearGradient id="coatGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f8fafc" />
        <stop offset="100%" stopColor="#e2e8f0" />
      </linearGradient>
      <linearGradient id="stethoscopeGradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
    </defs>

    {/* Grupo principal con animación de flotación */}
    <g>
      <animateTransform attributeName="transform" type="translate" values="0,0; 0,-8; 0,0" dur="3s" repeatCount="indefinite" />

      {/* Cuerpo / Bata */}
      <path
        d="M200 280 L200 420 Q200 440 220 440 L280 440 Q300 440 300 420 L300 280 Z"
        fill="url(#coatGradient)"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      {/* Cuello en V de la bata */}
      <path
        d="M220 280 L250 330 L280 280"
        fill="#3b82f6"
        stroke="#2563eb"
        strokeWidth="2"
      />
      {/* Bolsillos */}
      <rect x="215" y="350" width="30" height="25" rx="4" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
      <rect x="255" y="350" width="30" height="25" rx="4" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
      {/* Botones */}
      <circle cx="250" cy="345" r="3" fill="#94a3b8" />
      <circle cx="250" cy="365" r="3" fill="#94a3b8" />
      <circle cx="250" cy="385" r="3" fill="#94a3b8" />

      {/* Cabeza */}
      <circle cx="250" cy="235" r="38" fill="#fcd9b8" stroke="#e2c8a0" strokeWidth="2" />
      {/* Ojos */}
      <ellipse cx="238" cy="230" rx="4" ry="5" fill="#334155" />
      <ellipse cx="262" cy="230" rx="4" ry="5" fill="#334155" />
      {/* Sonrisa */}
      <path d="M242 245 Q250 255 258 245" stroke="#334155" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Pelo */}
      <path
        d="M212 225 Q215 200 250 198 Q285 200 288 225"
        fill="#1e293b"
        stroke="#0f172a"
        strokeWidth="2"
      />

      {/* Estetoscopio */}
      <g>
        {/* Tubo */}
        <path
          d="M235 310 Q210 320 200 300 Q190 280 200 270 Q210 260 220 270"
          fill="none"
          stroke="url(#stethoscopeGradient)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Campana del estetoscopio */}
        <circle cx="200" cy="268" r="10" fill="#475569" stroke="#334155" strokeWidth="2">
          <animate attributeName="r" values="10;11;10" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="200" cy="268" r="5" fill="#64748b" />
        {/* Olivas (auriculares) */}
        <circle cx="225" cy="278" r="4" fill="#475569" />
        <circle cx="218" cy="272" r="4" fill="#475569" />
      </g>

      {/* Brazos */}
      <path d="M200 290 Q170 320 165 350" stroke="#fcd9b8" strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M300 290 Q330 320 335 350" stroke="#fcd9b8" strokeWidth="14" strokeLinecap="round" fill="none" />
      {/* Mangas */}
      <path d="M200 280 L190 300 L205 300 Z" fill="url(#coatGradient)" stroke="#cbd5e1" strokeWidth="1" />
      <path d="M300 280 L310 300 L295 300 Z" fill="url(#coatGradient)" stroke="#cbd5e1" strokeWidth="1" />
    </g>

    {/* Cruces médicas decorativas flotantes */}
    <g opacity="0.12">
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0; -5,-15; 0,0" dur="6s" repeatCount="indefinite" />
        <rect x="70" y="180" width="20" height="6" rx="3" fill="#3b82f6" />
        <rect x="77" y="173" width="6" height="20" rx="3" fill="#3b82f6" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0; 5,-12; 0,0" dur="5s" repeatCount="indefinite" />
        <rect x="400" y="250" width="16" height="5" rx="2.5" fill="#3b82f6" />
        <rect x="405.5" y="244" width="5" height="17" rx="2.5" fill="#3b82f6" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0; -3,-10; 0,0" dur="7s" repeatCount="indefinite" />
        <rect x="380" y="130" width="14" height="4" rx="2" fill="#60a5fa" />
        <rect x="385" y="125" width="4" height="14" rx="2" fill="#60a5fa" />
      </g>
    </g>

    {/* Línea de corazón (signos vitales) */}
    <g opacity="0.2">
      <path
        d="M80 380 L100 370 L120 390 L140 340 L160 370 L180 350 L200 380 L220 360 L240 375 L260 355 L280 380 L300 370"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate attributeName="stroke-dasharray" values="0,300;300,0" dur="3s" fill="freeze" />
      </path>
    </g>
  </svg>
)

export default DoctorIllustration
