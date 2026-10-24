/**
 * Los cuatro indicadores del día (plan 28, §4.1 punto 3).
 *
 * Cada uno es un botón con su nombre completo para el lector de pantalla
 * («12 citas hoy, 4 por atender»). Un número que no se sabe es «—», nunca
 * «0»: cero es un dato y le diría a la doctora que no tiene nada.
 */
import React from 'react'
import CIcon from '@coreui/icons-react'
import { cilCalendarCheck, cilCheckCircle, cilPeople, cilTask, cilMedicalCross } from '@coreui/icons'

import type { ConteoDelDia } from '../../utils/inicio'
import CifraAnimada from '../../../../shared/components/CifraAnimada'

const SIN_DATO = '—'

interface BarraProps {
  valor: number
  maximo: number
  etiqueta: string
  tono: string
}

/** Barra de avance con su porcentaje también en texto (no solo color). */
const Barra: React.FC<BarraProps> = ({ valor, maximo, etiqueta, tono }) => {
  const porcentaje = maximo > 0 ? Math.round((valor / maximo) * 100) : 0
  return (
    <div
      className="inicio-barra"
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={valor}
      aria-valuetext={`${porcentaje} %`}
    >
      <span className={`inicio-barra-relleno inicio-tono-${tono}`} style={{ width: `${porcentaje}%` }} />
    </div>
  )
}

interface TarjetaProps {
  icono: string[]
  tono: 'azul' | 'ambar' | 'verde' | 'morado' | 'rojo'
  valor: React.ReactNode
  etiqueta: string
  detalle: React.ReactNode
  nombreCompleto: string
  barra?: React.ReactNode
  onClick: () => void
  cargando?: boolean
}

const Tarjeta: React.FC<TarjetaProps> = ({
  icono,
  tono,
  valor,
  etiqueta,
  detalle,
  nombreCompleto,
  barra,
  onClick,
  cargando,
}) => (
  // El botón cubre toda la tarjeta (CSS) pero no la envuelve: dentro de un
  // botón la barra perdería su papel de `progressbar` para el lector.
  <div className="inicio-indicador">
    <button type="button" className="inicio-indicador-accion" onClick={onClick} aria-label={nombreCompleto} />
    <span className={`inicio-indicador-icono inicio-fondo-${tono}`} aria-hidden="true">
      <CIcon icon={icono} />
    </span>
    <span className="inicio-indicador-valor" aria-hidden="true">
      {cargando ? <span className="hf-skeleton inicio-esqueleto-numero" /> : <CifraAnimada valor={valor} />}
    </span>
    <span className="inicio-indicador-etiqueta" aria-hidden="true">
      {etiqueta}
    </span>
    {barra}
    <span className="inicio-indicador-detalle" aria-hidden="true">
      {detalle}
    </span>
  </div>
)

interface Props {
  conteo: ConteoDelDia | null
  /** La agenda del día no se pudo leer y no hay datos anteriores. */
  errorCitas: string | null
  cargandoCitas: boolean
  veSeguimiento: boolean
  resultados: number | null
  errorResultados: string | null
  cargandoResultados: boolean
  criticos: number | null
  onIrAPestana: (pestana: 'todas' | 'en_sala' | 'atendidas' | 'en_consulta') => void
  onIrABandeja: () => void
}

export const IndicadoresDelDia: React.FC<Props> = ({
  conteo,
  errorCitas,
  cargandoCitas,
  veSeguimiento,
  resultados,
  errorResultados,
  cargandoResultados,
  criticos,
  onIrAPestana,
  onIrABandeja,
}) => {
  const sinCitas = conteo === null
  const cargandoSinDatos = sinCitas && cargandoCitas && !errorCitas
  const noSe = errorCitas && sinCitas ? 'No se pudo cargar' : null

  const total = conteo?.total ?? 0
  const citas = (
    <Tarjeta
      icono={cilCalendarCheck}
      tono="azul"
      valor={conteo ? conteo.total : SIN_DATO}
      etiqueta="Citas de hoy"
      cargando={cargandoSinDatos}
      nombreCompleto={
        conteo
          ? `${conteo.total} citas hoy, ${conteo.porAtender} por atender. Ver la agenda de hoy`
          : 'Citas de hoy: sin dato. Ver la agenda de hoy'
      }
      barra={
        conteo && total > 0 ? (
          <Barra valor={total - conteo.porAtender} maximo={total} etiqueta="Avance del día" tono="azul" />
        ) : undefined
      }
      detalle={
        noSe ??
        (conteo ? (
          <>
            {conteo.porAtender} por atender
            {conteo.canceladas > 0 && (
              <span className="inicio-detalle-chico">
                {' '}
                · {conteo.canceladas} cancelada{conteo.canceladas === 1 ? '' : 's'}
              </span>
            )}
          </>
        ) : (
          ' '
        ))
      }
      onClick={() => onIrAPestana('todas')}
    />
  )

  const enSala = (
    <Tarjeta
      icono={cilPeople}
      tono="ambar"
      valor={conteo ? conteo.enSala : SIN_DATO}
      etiqueta="En sala de espera"
      cargando={cargandoSinDatos}
      nombreCompleto={
        conteo
          ? `${conteo.enSala} en sala de espera, ${conteo.enSalaSinSignos} sin signos vitales. Ver quién espera`
          : 'En sala de espera: sin dato. Ver quién espera'
      }
      barra={
        conteo && conteo.enSala > 0 ? (
          <Barra
            valor={conteo.enSala - conteo.enSalaSinSignos}
            maximo={conteo.enSala}
            etiqueta="Con signos vitales"
            tono="ambar"
          />
        ) : undefined
      }
      detalle={
        noSe ??
        (conteo
          ? conteo.enSala === 0
            ? 'Nadie esperando'
            : conteo.enSalaSinSignos > 0
              ? `${conteo.enSalaSinSignos} sin signos vitales`
              : 'Todas con signos vitales'
          : ' ')
      }
      onClick={() => onIrAPestana('en_sala')}
    />
  )

  const atendidas = (
    <Tarjeta
      icono={cilCheckCircle}
      tono="verde"
      valor={conteo ? conteo.atendidas : SIN_DATO}
      etiqueta="Atendidas"
      cargando={cargandoSinDatos}
      nombreCompleto={
        conteo
          ? conteo.porcentajeAtendidas === null
            ? 'Sin citas hoy. Ver atendidas'
            : `${conteo.atendidas} atendidas, ${conteo.porcentajeAtendidas} % del día. Ver atendidas`
          : 'Atendidas: sin dato. Ver atendidas'
      }
      barra={
        conteo && conteo.porcentajeAtendidas !== null ? (
          <Barra valor={conteo.atendidas} maximo={total} etiqueta="Atendidas del día" tono="verde" />
        ) : undefined
      }
      detalle={
        noSe ??
        (conteo
          ? conteo.porcentajeAtendidas === null
            ? 'Sin citas hoy'
            : `${conteo.porcentajeAtendidas} % del día`
          : ' ')
      }
      onClick={() => onIrAPestana('atendidas')}
    />
  )

  // Sin acceso a la bandeja, el cuarto lugar lo ocupa «En consulta».
  const cuarta = veSeguimiento ? (
    <Tarjeta
      icono={cilTask}
      tono={criticos ? 'rojo' : 'morado'}
      valor={resultados ?? SIN_DATO}
      etiqueta="Resultados por revisar"
      cargando={resultados === null && cargandoResultados && !errorResultados}
      nombreCompleto={
        resultados === null
          ? 'Resultados por revisar: sin dato. Abrir la bandeja'
          : `${resultados} resultados por revisar${criticos ? `, incluye ${criticos} críticos` : ''}. Abrir la bandeja`
      }
      detalle={
        resultados === null && errorResultados ? (
          'No se pudo contar'
        ) : criticos ? (
          <span className="inicio-detalle-critico">
            Incluye {criticos} crítico{criticos === 1 ? '' : 's'}
          </span>
        ) : resultados === 0 ? (
          'Nada esperando'
        ) : (
          'En la bandeja'
        )
      }
      onClick={onIrABandeja}
    />
  ) : (
    <Tarjeta
      icono={cilMedicalCross}
      tono="morado"
      valor={conteo ? conteo.enConsulta : SIN_DATO}
      etiqueta="En consulta"
      cargando={cargandoSinDatos}
      nombreCompleto={conteo ? `${conteo.enConsulta} en consulta. Ver` : 'En consulta: sin dato'}
      detalle={noSe ?? (conteo ? (conteo.enConsulta ? 'Contigo ahora' : 'Nadie en consulta') : ' ')}
      onClick={() => onIrAPestana('en_consulta')}
    />
  )

  return (
    <section className="inicio-indicadores inicio-aparece" data-tour="doctora-indicadores" aria-label="Cómo va el día">
      {citas}
      {enSala}
      {atendidas}
      {cuarta}
    </section>
  )
}

export default IndicadoresDelDia
