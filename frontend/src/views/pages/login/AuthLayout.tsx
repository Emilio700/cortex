/**
 * AuthLayout — la pantalla de acceso que comparten Login, «¿Olvidaste tu
 * contraseña?», «Restablecer contraseña» y el cambio obligatorio.
 *
 * La marca de Cortex: azul marino profundo con una red neuronal viva al fondo
 * (`RedNeuronal`), el cerebro del logo con su halo y un barrido de escáner que
 * lo recorre como un corte de resonancia. En la computadora, dos columnas:
 * marca a la izquierda y la tarjeta de vidrio a la derecha. En el teléfono,
 * el cerebro chico arriba y el formulario enseguida, sin desplazarse para
 * llegar al botón. El estilo vive en `scss/_acceso.scss`.
 */
import React from 'react'
import cerebro from '../../../assets/images/cortex-cerebro.png'
import RedNeuronal from '../../../components/marca/RedNeuronal'
import { PalabraCortex } from '../../../components/marca/CortexMarca'

interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}

const MODULOS = ['Agenda', 'Expediente', 'Neuroimagen', 'Neurofisiología']

const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer }) => (
  <div className="acceso">
    <RedNeuronal className="acceso-red" densidad={0.75} />
    <div className="acceso-vineta" aria-hidden="true" />

    <section className="acceso-marca" aria-label="CORTEX">
      <div className="acceso-cerebro" aria-hidden="true">
        <span className="acceso-cerebro__halo" />
        <span className="acceso-cerebro__orbita acceso-cerebro__orbita--1" />
        <span className="acceso-cerebro__orbita acceso-cerebro__orbita--2" />
        <img className="acceso-cerebro__imagen" src={cerebro} alt="" draggable={false} />
        <span className="acceso-cerebro__escaner" />
      </div>
      <PalabraCortex className="acceso-marca__palabra" tamano={44} />
      <p className="acceso-marca__lema">Neurocirugía de precisión</p>
      <ul className="acceso-marca__modulos" aria-label="Módulos">
        {MODULOS.map((m, i) => (
          <li key={m} style={{ animationDelay: `${1.5 + i * 0.12}s` }}>
            {m}
          </li>
        ))}
      </ul>
    </section>

    <main className="acceso-formulario">
      <div className="acceso-formulario__columna">
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
