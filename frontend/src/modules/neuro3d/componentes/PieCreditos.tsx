/**
 * Pie de créditos de Neuro 3D: un renglón discreto, siempre visible, que se
 * despliega con la atribución de cada fuente activa (modelos y código de
 * terceros) tal como la pide su licencia.
 *
 * Se arma desde los `CREDITOS.json` de las fuentes cargadas más los fijos
 * (`dominio/creditos.ts`): si el atlas detallado está a la vista, BodyParts3D
 * aparece con su texto exacto.
 */
import { useId, useState } from 'react'
import type { Credito } from '../dominio/creditos'

interface Props {
  creditos: Credito[]
}

export default function PieCreditos({ creditos }: Props) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  if (creditos.length === 0) return null
  const resumen = creditos.map((c) => `${c.titulo} (${c.licencia})`).join(' · ')

  return (
    <footer className="atlas-creditos" data-tour="atlas-creditos">
      <button
        type="button"
        className="atlas-creditos__boton"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="atlas-creditos__titulo">Créditos</span>
        <span className="atlas-creditos__resumen">{resumen}</span>
        <span className="atlas-creditos__flecha" aria-hidden="true">
          {abierto ? '▴' : '▾'}
        </span>
      </button>
      {abierto && (
        <ul className="atlas-creditos__lista" id={id}>
          {creditos.map((c) => (
            <li key={c.id} className="atlas-creditos__fuente">
              <p className="mb-1">
                <b>{c.titulo}</b>
                {c.version ? ` · ${c.version}` : ''} ·{' '}
                {c.urlLicencia ? (
                  <a href={c.urlLicencia} target="_blank" rel="noopener noreferrer">
                    {c.licencia}
                  </a>
                ) : (
                  c.licencia
                )}
              </p>
              <p className="atlas-creditos__texto mb-1">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {c.texto}
                  </a>
                ) : (
                  c.texto
                )}
              </p>
              {c.cambios && <p className="atlas-creditos__nota mb-1">Cambios: {c.cambios}</p>}
              {c.nota && <p className="atlas-creditos__nota mb-0">{c.nota}</p>}
            </li>
          ))}
        </ul>
      )}
    </footer>
  )
}
