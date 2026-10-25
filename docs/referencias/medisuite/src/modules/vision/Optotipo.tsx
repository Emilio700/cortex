// Optotipos dibujados en una cuadrícula de 5 × 5 (trazo = 1/5 de la altura = 1′ de arco cuando MAR = 1′).
// Las letras son una aproximación geométrica del diseño Sloan (NAS-NRC 1980); la E es la «E de Snellen» volteable.
import type { DireccionE, LetraSloan } from './optotipos'

const SLOAN: Record<LetraSloan, string> = {
  C: 'M4.14,1.35 A2,2 0 1 0 4.14,3.65',
  D: 'M0.5,0.5 H2.5 A2,2 0 0 1 2.5,4.5 H0.5 Z',
  H: 'M0.5,0 V5 M4.5,0 V5 M0.5,2.5 H4.5',
  K: 'M0.5,0 V5 M4.7,0 L0.5,3.4 M1.9,2.3 L4.7,5',
  N: 'M0.5,5 V0 L4.5,5 V0',
  O: 'M2.5,0.5 A2,2 0 1 1 2.49,0.5 Z',
  R: 'M0.5,5 V0.5 H3.25 A1.25,1.25 0 0 1 3.25,3 H0.5 M2.4,3 L4.6,5',
  S: 'M4.4,1.3 C4,0.7 3.3,0.5 2.5,0.5 C1.4,0.5 0.6,1 0.6,1.6 C0.6,2.3 1.3,2.5 2.5,2.5 C3.7,2.5 4.4,2.8 4.4,3.4 C4.4,4.1 3.6,4.5 2.5,4.5 C1.6,4.5 0.9,4.2 0.5,3.7',
  V: 'M0.2,0 L2.5,4.7 L4.8,0',
  Z: 'M0,0.5 H4.5 L0.5,4.5 H5',
}
const ROT: Record<DireccionE, number> = { derecha: 0, abajo: 90, izquierda: 180, arriba: 270 }

export function Optotipo({ tipo, valor, px, tachado }: { tipo: 'sloan' | 'e'; valor: string; px: number; tachado?: boolean }) {
  const titulo = tipo === 'e' ? `E hacia ${valor}` : `Letra ${valor}`
  return (
    <svg width={px} height={px} viewBox="0 0 5 5" role="img" aria-label={titulo} style={{ display: 'block', flex: 'none', opacity: tachado ? 0.35 : 1 }}>
      {tipo === 'e' ? (
        <g transform={`rotate(${ROT[valor as DireccionE] ?? 0} 2.5 2.5)`} fill="#000">
          <rect x="0" y="0" width="1" height="5" />
          <rect x="0" y="0" width="5" height="1" />
          <rect x="0" y="2" width="5" height="1" />
          <rect x="0" y="4" width="5" height="1" />
        </g>
      ) : (
        <path d={SLOAN[valor as LetraSloan]} fill="none" stroke="#000" strokeWidth={1} strokeLinejoin="miter" strokeMiterlimit={10} />
      )}
    </svg>
  )
}
