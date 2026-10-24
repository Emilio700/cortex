/**
 * CortexMarca — la marca de Cortex: el cerebro del logo y la palabra CORTEX.
 *
 * El cerebro es el del logo original (docs/marca/logo-cortex.jpeg) recortado
 * con fondo transparente por `scripts/generar-marca-cortex.py`; sólo se ve bien
 * sobre fondos oscuros, por eso el menú lateral y el acceso son azul marino.
 * La palabra se compone con texto (Michroma) y la «E» de tres barras azules,
 * igual que en el logo, para que escale nítida a cualquier tamaño.
 */
import React from 'react'
import cerebro from '../../assets/images/cortex-cerebro.png'
import cerebroChico from '../../assets/images/cortex-cerebro-chico.png'

interface PalabraCortexProps {
  /** Alto de las letras en px. */
  tamano?: number
  className?: string
}

export const PalabraCortex: React.FC<PalabraCortexProps> = ({ tamano = 18, className }) => (
  <span
    className={['palabra-cortex', className].filter(Boolean).join(' ')}
    style={{ fontSize: tamano }}
    role="img"
    aria-label="CORTEX"
  >
    <span aria-hidden="true">CORT</span>
    <span className="palabra-cortex__e" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
    <span aria-hidden="true">X</span>
  </span>
)

interface CortexMarcaProps {
  variante?: 'completa' | 'icono' | 'palabra'
  /** Alto del cerebro en px. */
  tamano?: number
  /** Muestra «Neurocirugía» debajo de la palabra. */
  conLema?: boolean
  animada?: boolean
  className?: string
}

const CortexMarca: React.FC<CortexMarcaProps> = ({
  variante = 'completa',
  tamano = 40,
  conLema = false,
  animada = false,
  className,
}) => {
  const verCerebro = variante !== 'palabra'
  const verPalabra = variante !== 'icono'
  return (
    <span
      className={['cortex-marca', animada && 'cortex-marca--animada', className].filter(Boolean).join(' ')}
      style={{ gap: tamano * 0.28 }}
    >
      {verCerebro && (
        <img
          className="cortex-marca__cerebro"
          src={tamano > 120 ? cerebro : cerebroChico}
          alt=""
          width={Math.round(tamano * 1.2)}
          height={tamano}
          draggable={false}
        />
      )}
      {verPalabra && (
        <span className="cortex-marca__texto">
          <PalabraCortex tamano={Math.max(12, tamano * 0.42)} />
          {conLema && <span className="cortex-marca__lema">Neurocirugía</span>}
        </span>
      )}
    </span>
  )
}

export default CortexMarca
