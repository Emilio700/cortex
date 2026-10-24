/**
 * El emblema de G.E.M.S, dibujado en vectores por capas (plan 32, punto 1).
 *
 * Es el ícono de la app instalada (`public/icons/icon-512.png`): un hexágono
 * con la cruz médica y la silueta de una mujer, en degradado de azul a
 * violeta. El PNG sólo existe a 512 px y se veía borroso en grande; aquí cada
 * capa es un trazo propio, nítido a cualquier tamaño y animable por separado:
 *
 * - `hex-ext`: el anillo exterior, que en la entrada «se dibuja» con su trazo;
 * - `hex-int`: el hexágono claro de adentro;
 * - `cruz`: la cruz, que crece desde el centro;
 * - `silueta`: el perfil y el cabello, que aparecen con un barrido de luz;
 * - `brillo`: una franja de luz que, en reposo, cruza el hexágono cada tanto.
 *
 * El movimiento vive en `scss/_acceso.scss` y se apaga con «reducir
 * movimiento»: entonces el emblema se ve completo y quieto desde el inicio.
 * Es decorativo: el nombre del sistema siempre va en texto junto a él.
 */
import React, { useId } from 'react'

export interface EmblemaGemsProps {
  size?: number
  /**
   * `entrada`: se arma capa por capa una vez (unos 2.5 s) y luego queda en
   * reposo con el brillo lento. `reposo`: sólo el brillo. Sin valor: quieto.
   */
  animacion?: 'entrada' | 'reposo'
  className?: string
}

// Hexágono de punta arriba centrado en (256, 256).
const hexagono = (r: number) => {
  const puntos = [-90, -30, 30, 90, 150, 210].map((grados) => {
    const a = (grados * Math.PI) / 180
    return `${(256 + r * Math.cos(a)).toFixed(1)} ${(256 + r * Math.sin(a)).toFixed(1)}`
  })
  return `M${puntos.join(' L')} Z`
}

const HEX_EXT = hexagono(196)
const HEX_INT = hexagono(160)

export const EmblemaGems: React.FC<EmblemaGemsProps> = ({ size = 48, animacion, className }) => {
  const id = useId().replace(/:/g, '')
  const g = (nombre: string) => `${nombre}-${id}`
  const clases = ['emblema-gems', animacion ? `emblema-gems--${animacion}` : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      className={clases}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* El degradado del ícono: azul intenso abajo a la izquierda, celeste
            arriba y violeta abajo a la derecha. */}
        <linearGradient id={g('anillo')} x1="70" y1="420" x2="450" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2457d6" />
          <stop offset="0.55" stopColor="#3b9af2" />
          <stop offset="1" stopColor="#52b8f6" />
        </linearGradient>
        <linearGradient id={g('violeta')} x1="300" y1="300" x2="460" y2="470" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7d6cf2" stopOpacity="0" />
          <stop offset="1" stopColor="#8b6ff5" />
        </linearGradient>
        <linearGradient id={g('cruz')} x1="256" y1="110" x2="256" y2="400" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5fb4fb" />
          <stop offset="1" stopColor="#2f6fe4" />
        </linearGradient>
        <linearGradient id={g('cabello')} x1="190" y1="110" x2="300" y2="430" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3f8ff3" />
          <stop offset="0.6" stopColor="#4f7ef0" />
          <stop offset="1" stopColor="#7c66f1" />
        </linearGradient>
        <linearGradient id={g('brillo')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g('dentro')}>
          <path d={HEX_EXT} />
        </clipPath>
      </defs>

      {/* Fondo blanco entre el anillo y el hexágono interior, como en el ícono:
          sin él se veía el fondo de la página por la rendija. */}
      <path className="emblema-gems__hex-int" d={HEX_EXT} fill="#ffffff" />

      {/* Anillo exterior: dos trazos superpuestos dan el azul→violeta. */}
      <g className="emblema-gems__hex-ext">
        <path d={HEX_EXT} stroke={`url(#${g('anillo')})`} strokeWidth="34" strokeLinejoin="round" strokeLinecap="round" pathLength={1} />
        <path d={HEX_EXT} stroke={`url(#${g('violeta')})`} strokeWidth="34" strokeLinejoin="round" strokeLinecap="round" pathLength={1} />
      </g>

      {/* Hexágono interior, claro, con su filo blanco. */}
      <path
        className="emblema-gems__hex-int"
        d={HEX_INT}
        fill="#f1f6ff"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinejoin="round"
      />

      {/* La cruz médica. */}
      <g className="emblema-gems__cruz" fill={`url(#${g('cruz')})`}>
        <rect x="200" y="118" width="112" height="276" rx="26" />
        <rect x="118" y="196" width="276" height="112" rx="26" />
      </g>

      {/* La silueta: el cabello en degradado y el perfil en blanco. */}
      <g className="emblema-gems__silueta">
        <path
          d="M246 104C186 122 158 188 174 248C188 302 236 322 262 352C284 378 284 410 262 434C322 412 334 352 298 316C264 284 222 262 214 214C208 172 222 132 246 104Z"
          fill={`url(#${g('cabello')})`}
        />
        <path
          d="M250 120C280 122 294 150 291 178C290 191 297 201 303 212C305 217 299 219 294 220C297 226 293 231 290 233C292 239 288 245 282 247C280 257 275 266 262 268C258 286 262 300 276 318C240 314 213 292 205 259C195 214 205 150 250 120Z"
          fill="#ffffff"
        />
        <path
          d="M232 114C198 150 194 206 214 248C234 290 284 312 298 362C302 330 278 300 252 278C222 252 206 200 232 114Z"
          fill="#a9d4ff"
          opacity="0.75"
        />
      </g>

      {/* Franja de luz que cruza el emblema, recortada al hexágono. */}
      <g clipPath={`url(#${g('dentro')})`}>
        <g transform="rotate(20 256 256)">
          <rect
            className="emblema-gems__brillo"
            x="-160"
            y="-60"
            width="120"
            height="640"
            fill={`url(#${g('brillo')})`}
          />
        </g>
      </g>
    </svg>
  )
}

export default EmblemaGems
