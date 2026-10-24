/**
 * Encabezado del inicio: saludo según la hora de Mazatlán, la fecha, la
 * sucursal que se está viendo y cuándo se actualizó (plan 28, §4.1 y §4.3).
 *
 * Sin frase ni ilustración (D-6): en el celular empujaban la agenda hacia
 * abajo. En Cortex el encabezado es la banda marina de la marca, con la red
 * neuronal viva de fondo y el cerebro a la derecha sólo en escritorio; su
 * alto no crece en el celular. Un refresco fallido se anuncia en una región `aria-live`; el exitoso
 * no (sería ruido cada minuto).
 */
import React, { useEffect, useState } from 'react'
import { CButton } from '@coreui/react-pro'

import { formatearEnConsultorio } from '../../../../shared/utils/date'
import { haceCuanto, horaEnConsultorio, saludoPorHora } from '../../utils/inicio'
import RedNeuronal from '../../../../components/marca/RedNeuronal'
import cerebro from '../../../../assets/images/cortex-cerebro-chico.png'

interface Props {
  nombre: string
  sucursal: string | null
  /** MASTER ve las citas de todas las doctoras: la pantalla lo dice. */
  esMaster: boolean
  actualizadoEn: Date | null
  /** Error del último refresco de la agenda, si falló. */
  errorDeRefresco: string | null
  actualizando: boolean
  onActualizar: () => void
}

export const EncabezadoDelDia: React.FC<Props> = ({
  nombre,
  sucursal,
  esMaster,
  actualizadoEn,
  errorDeRefresco,
  actualizando,
  onActualizar,
}) => {
  // Reloj de la pantalla: mueve el saludo y el «hace N min» sin pedir nada al servidor.
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const saludo = saludoPorHora(horaEnConsultorio(ahora))
  const fecha = formatearEnConsultorio(ahora, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header className="inicio-encabezado inicio-encabezado--cortex inicio-aparece" data-tour="doctora-saludo">
      <RedNeuronal className="inicio-encabezado-red" densidad={0.55} alcance={110} interactiva={false} />
      <img className="inicio-encabezado-cerebro" src={cerebro} alt="" aria-hidden="true" draggable={false} />
      <div className="inicio-encabezado-texto">
        <h1 className="inicio-saludo">{nombre ? `${saludo}, ${nombre}` : saludo}</h1>
        <p className="inicio-encabezado-sub">
          <span className="inicio-fecha">{fecha}</span>
          {sucursal && <span> · {sucursal}</span>}
          {esMaster && <span> · Viendo las citas de todas las doctoras</span>}
        </p>
      </div>
      <div className="inicio-actualizado" aria-live="polite">
        {errorDeRefresco ? (
          <span className="inicio-actualizado-error" role="status">
            No se pudo actualizar
            {actualizadoEn ? ` (datos de ${haceCuanto(actualizadoEn, ahora)})` : ''}
          </span>
        ) : (
          actualizadoEn && <span>Actualizado {haceCuanto(actualizadoEn, ahora)}</span>
        )}
        <CButton
          color="link"
          size="sm"
          className="inicio-actualizar"
          onClick={onActualizar}
          disabled={actualizando}
        >
          {actualizando ? 'Actualizando…' : errorDeRefresco ? 'Reintentar' : 'Actualizar'}
        </CButton>
      </div>
    </header>
  )
}

export default EncabezadoDelDia
