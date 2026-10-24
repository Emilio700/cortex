/**
 * GemsLogo — SVG brand mark for G.E.M.S (Gynecology & Expert Management System).
 *
 * El emblema es el ícono de la app instalada redibujado por capas
 * (`EmblemaGems`, plan 32 punto 1): la misma marca en el login, en el menú
 * lateral y en el teléfono. Antes aquí había un hexágono genérico distinto.
 *
 * Props:
 *  - variant: 'full' (icon + text, default), 'icon' (just the mark), 'text' (just typography)
 *  - size:   number = height in px (default 48)
 *  - mono:   boolean = single-color for dark backgrounds (default false)
 */
import React from 'react'
import EmblemaGems from './EmblemaGems'

interface GemsLogoProps {
  variant?: 'full' | 'icon' | 'text'
  size?: number
  mono?: boolean
}

const GemsLogo: React.FC<GemsLogoProps> = ({ variant = 'full', size = 48, mono = false }) => {
  const scale = size / 48
  const text = mono ? '#ffffff' : '#0f172a'
  const subtitle = mono ? 'rgba(255,255,255,0.6)' : '#64748b'

  const showIcon = variant === 'full' || variant === 'icon'
  const showText = variant === 'full' || variant === 'text'

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: showIcon && showText ? 12 * scale : 0,
        height: size,
        userSelect: 'none',
      }}
    >
      {showIcon && <EmblemaGems size={size} />}

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span
            style={{
              fontSize: 18 * scale,
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: text,
              fontFamily: "'Inter', -apple-system, sans-serif",
            }}
          >
            G.E.M.S
          </span>
          <span
            style={{
              fontSize: 8.5 * scale,
              fontWeight: 400,
              letterSpacing: '0.08em',
              color: subtitle,
              fontFamily: "'Inter', -apple-system, sans-serif",
              marginTop: 1,
            }}
          >
            GYNECOLOGY &amp; EXPERT MANAGEMENT SYSTEM
          </span>
        </div>
      )}
    </div>
  )
}

export default GemsLogo
