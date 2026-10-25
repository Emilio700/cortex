/**
 * Ficha breve de la estructura elegida: qué es, para qué sirve y, si es una
 * raíz, un segmento o un disco, el camino que se encendió con ella y su
 * dermatoma en la silueta.
 */
import { forwardRef } from 'react'
import { CButton } from '@coreui/react-pro'
import type { Estructura } from '../dominio/catalogo'
import type { Conexion } from '../dominio/conexiones'
import { dermatomaDeRaiz, sinDermatoma } from '../dominio/dermatomas'
import SiluetaDermatomas from './SiluetaDermatomas'

interface Props {
  estructura: Estructura
  conexion: Conexion | null
  alCerrar: () => void
  /** En modo explicar: agregar esta estructura como marca. */
  alMarcar?: () => void
}

const FichaEstructura = forwardRef<SVGSVGElement, Props>(function FichaEstructura({ estructura, conexion, alCerrar, alMarcar }, siluetaRef) {
  const derm = estructura.raiz ? dermatomaDeRaiz(estructura.raiz) : undefined
  const sinDerm = estructura.capa === 'raices' && estructura.raiz ? sinDermatoma(estructura.raiz) : null
  return (
    <article className="atlas-ficha" aria-labelledby="atlas-ficha-nombre" aria-live="polite" data-tour="atlas-ficha">
      <header className="atlas-ficha__cabecera">
        <span className="atlas-ficha__muestra" style={{ background: `var(${estructura.color})` }} aria-hidden="true" />
        <div className="atlas-ficha__titulos">
          <span className="atlas-ficha__sistema">{estructura.sistema}</span>
          <h2 id="atlas-ficha-nombre" className="atlas-ficha__nombre">
            {estructura.nombre}
          </h2>
        </div>
        <CButton color="secondary" variant="outline" size="sm" onClick={alCerrar} aria-label="Cerrar la ficha">
          Cerrar
        </CButton>
      </header>
      <p className="atlas-ficha__descripcion">{estructura.descripcion}</p>
      {estructura.esquematica && (
        <p className="atlas-ficha__nota">Trazo esquemático: no es una tractografía del paciente.</p>
      )}

      {conexion && conexion.explicacion.length > 0 && (
        <section className="atlas-ficha__camino" aria-label="Lo que se encendió">
          <h3 className="atlas-ficha__subtitulo">Lo que se encendió</h3>
          <ul className="atlas-ficha__piezas">
            {conexion.piezas.map((p) => (
              <li key={p.id} className={`atlas-pieza atlas-pieza--${p.papel}`}>
                {p.etiqueta}
              </li>
            ))}
          </ul>
          <ol className="atlas-ficha__pasos">
            {conexion.explicacion.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ol>
        </section>
      )}

      {conexion && conexion.dermatomas.length > 0 && (
        <section aria-label="Dermatoma" data-tour="atlas-dermatoma">
          <h3 className="atlas-ficha__subtitulo">Dermatoma</h3>
          <SiluetaDermatomas ref={siluetaRef} encendidos={conexion.dermatomas} titulo={estructura.nombre} compacta />
          {derm && (
            <p className="atlas-ficha__clave">
              <b>Punto clave (ASIA):</b> {derm.puntoClave}
            </p>
          )}
        </section>
      )}
      {sinDerm && <p className="atlas-ficha__nota">{sinDerm}</p>}

      {alMarcar && (
        <CButton color="warning" size="sm" className="mt-2" onClick={alMarcar}>
          Marcar esta estructura
        </CButton>
      )}
    </article>
  )
})

export default FichaEstructura
