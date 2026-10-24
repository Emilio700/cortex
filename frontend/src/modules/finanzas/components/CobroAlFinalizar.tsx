/**
 * Sección "Cobro" del modal de finalizar consulta.
 *
 * Existe para que no se cobre doble: muchas veces la doctora cobra ella misma
 * y recepción, sin saberlo, vuelve a pasar la tarjeta. Al cerrar la consulta
 * la doctora dice en un clic quién cobra, y el servidor lo guarda en la misma
 * operación que cierra la cita (plan 23, "Finalizar y cobrar es UNA operación").
 *
 * Es un componente controlado: el borrador vive en la página para que el
 * reintento después de un error conserve lo que la doctora ya capturó.
 */
import React, { useEffect, useState } from 'react'
import {
  CAlert,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CInputGroup,
  CInputGroupText,
  CRow,
} from '@coreui/react-pro'

import { apiClient } from '../../../shared/services/api'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import type { CamposCobroDeCita, CobroAlFinalizar, PaymentMethod } from '../types'
import { describirCobro, formatoMoneda, pideReferencia } from '../utils/cobro'

export type ModoCobro = 'cobrado' | 'recepcion' | 'sin_cargo'

export interface BorradorCobro {
  modo: ModoCobro
  serviceId: string
  amount: string
  method: string
  referencia: string
  motivo: string
}

/** "Lo cobra recepción" por defecto: es lo que pasaba antes y no cobra nada por error. */
export const borradorInicial = (motivoSinCargo = ''): BorradorCobro => ({
  modo: motivoSinCargo ? 'sin_cargo' : 'recepcion',
  serviceId: '',
  amount: '',
  method: 'cash',
  referencia: '',
  motivo: motivoSinCargo,
})

interface ServicioDelCatalogo {
  id: number
  name: string
  price: string
  is_active?: boolean
}

/** El bloque sin `client_request_id`: ése lo pone quien hace el intento. */
export type CobroCapturado =
  | Exclude<CobroAlFinalizar, { modo: 'cobrado' }>
  | Omit<Extract<CobroAlFinalizar, { modo: 'cobrado' }>, 'client_request_id'>

/**
 * Error de la validación local, con el campo junto al que debe verse el aviso:
 * el mensaje se pinta debajo de ese campo, no en un bloque al pie del modal.
 */
export type ErrorDeCobroDeCampo = { error: string; campo: 'monto' | 'motivo' }

/**
 * Traduce el borrador al bloque que viaja en el PATCH, o dice qué falta.
 * Se valida aquí para no mandar al servidor un cobro que sabemos incompleto.
 */
export const bloqueDeCobro = (
  b: BorradorCobro,
): { bloque: CobroCapturado } | ErrorDeCobroDeCampo => {
  if (b.modo === 'recepcion') return { bloque: { modo: 'recepcion' } }
  if (b.modo === 'sin_cargo') {
    const motivo = b.motivo.trim()
    if (!motivo) return { error: 'Escribe el motivo de que no tenga cargo.', campo: 'motivo' }
    return { bloque: { modo: 'sin_cargo', motivo } }
  }
  const monto = Number(b.amount)
  if (!b.amount || !Number.isFinite(monto) || monto <= 0) {
    return { error: 'Escribe cuánto cobraste (mayor a cero).', campo: 'monto' }
  }
  const referencia = b.referencia.trim()
  return {
    bloque: {
      modo: 'cobrado',
      amount: monto.toFixed(2),
      method: b.method as PaymentMethod,
      ...(b.serviceId ? { service_id: Number(b.serviceId) } : {}),
      ...(referencia && pideReferencia(b.method) ? { referencia } : {}),
    },
  }
}

interface Props {
  cita: CamposCobroDeCita
  borrador: BorradorCobro
  onChange: (b: BorradorCobro) => void
  /** Sin `payments.create` no se ofrece "Lo cobré yo": el servidor lo rechazaría. */
  puedeCobrar: boolean
  disabled?: boolean
  /** Error de la última validación del padre: se pinta junto al campo que lo causó. */
  errorEnvio?: ErrorDeCobroDeCampo | null
}

const OPCIONES: { modo: ModoCobro; titulo: string; detalle: string }[] = [
  { modo: 'cobrado', titulo: 'Lo cobré yo', detalle: 'Ya recibí el pago en consultorio.' },
  { modo: 'recepcion', titulo: 'Lo cobra recepción', detalle: 'Secretaría recibe el aviso para cobrar.' },
  { modo: 'sin_cargo', titulo: 'Sin cargo', detalle: 'Cortesía, seguimiento o revisión incluida.' },
]

export const CobroAlFinalizarSeccion: React.FC<Props> = ({
  cita,
  borrador,
  onChange,
  errorEnvio,
  puedeCobrar,
  disabled,
}) => {
  const [servicios, setServicios] = useState<ServicioDelCatalogo[]>([])
  const [errorCatalogo, setErrorCatalogo] = useState(false)
  const yaCobrada = cita.estado_cobro === 'cobrada'

  useEffect(() => {
    if (yaCobrada || !puedeCobrar) return
    let vigente = true
    apiClient
      .get<ServicioDelCatalogo[]>('/services')
      .then((res) => {
        if (!vigente) return
        const lista = Array.isArray(res?.data) ? res.data : []
        setServicios(lista.filter((s) => s.is_active !== false))
      })
      .catch(() => {
        // Sin catálogo se sigue pudiendo cobrar: el monto se escribe a mano.
        if (vigente) setErrorCatalogo(true)
      })
    return () => {
      vigente = false
    }
  }, [yaCobrada, puedeCobrar])

  const cambiar = (parcial: Partial<BorradorCobro>) => onChange({ ...borrador, ...parcial })

  // Reapertura de una consulta ya cobrada: no se ofrece cobrar otra vez. Un
  // cobro extra (estudio agregado) se hace desde Pagos, confirmado aparte.
  if (yaCobrada) {
    const cobros = cita.cobro_resumen ?? []
    return (
      <div data-tour="consulta-cobro" className="mt-3">
        <h6 className="fw-bold mb-2">Cobro</h6>
        <CAlert color="success" className="py-2 mb-0 small">
          <strong>Esta consulta ya está cobrada.</strong>
          {cobros.length > 0 ? (
            <ul className="mb-0 ps-3">
              {cobros.map((c) => (
                <li key={c.id}>
                  {describirCobro(c)}
                  {c.referencia ? ` Referencia ${c.referencia}.` : ''}
                </li>
              ))}
            </ul>
          ) : (
            cita.total_cobrado && <> Total cobrado: {formatoMoneda(cita.total_cobrado)}.</>
          )}
          <div className="mt-1">No se volverá a cobrar al finalizar.</div>
        </CAlert>
      </div>
    )
  }

  const opciones = OPCIONES.filter((o) => o.modo !== 'cobrado' || puedeCobrar)

  return (
    <div data-tour="consulta-cobro" className="mt-3">
      <h6 className="fw-bold mb-2">Cobro</h6>
      <div className="d-grid gap-2 mb-2" role="radiogroup" aria-label="¿Quién cobra esta consulta?">
        {opciones.map((o) => {
          const activa = borrador.modo === o.modo
          return (
            <button
              key={o.modo}
              type="button"
              role="radio"
              aria-checked={activa}
              disabled={disabled}
              className={`btn text-start py-2 ${activa ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => cambiar({ modo: o.modo })}
            >
              <div className="fw-semibold">{o.titulo}</div>
              <div className={`small ${activa ? '' : 'text-body-secondary'}`}>{o.detalle}</div>
            </button>
          )
        })}
      </div>

      {borrador.modo === 'cobrado' && (
        <div className="border rounded-3 p-2">
          {errorCatalogo && (
            <div className="small text-warning-emphasis mb-2">
              No se pudo cargar el catálogo de servicios; escribe el monto a mano.
            </div>
          )}
          <CRow className="g-2">
            <CCol xs={12}>
              <CFormLabel htmlFor="cobro-servicio" className="small mb-1">
                Servicio
              </CFormLabel>
              <CFormSelect
                id="cobro-servicio"
                value={borrador.serviceId}
                disabled={disabled}
                onChange={(e) => {
                  const servicio = servicios.find((s) => String(s.id) === e.target.value)
                  // El precio del catálogo se precarga pero se puede corregir:
                  // descuentos y precios especiales son de todos los días.
                  cambiar({
                    serviceId: e.target.value,
                    amount: servicio ? Number(servicio.price).toFixed(2) : borrador.amount,
                  })
                }}
              >
                <option value="">— Sin servicio del catálogo —</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatoMoneda(s.price)})
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol xs={6}>
              <CFormLabel htmlFor="cobro-monto" className="small mb-1">
                Monto cobrado
              </CFormLabel>
              <CInputGroup>
                <CInputGroupText>$</CInputGroupText>
                <CFormInput
                  id="cobro-monto"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={borrador.amount}
                  disabled={disabled}
                  invalid={errorEnvio?.campo === 'monto'}
                  aria-invalid={errorEnvio?.campo === 'monto' || undefined}
                  aria-describedby={errorEnvio?.campo === 'monto' ? 'error-cobro-monto' : undefined}
                  onChange={(e) => cambiar({ amount: e.target.value })}
                />
              </CInputGroup>
              <ErrorDeCampo
                id="error-cobro-monto"
                mensaje={errorEnvio?.campo === 'monto' ? errorEnvio.error : undefined}
              />
            </CCol>
            <CCol xs={6}>
              <CFormLabel htmlFor="cobro-metodo" className="small mb-1">
                Método
              </CFormLabel>
              <CFormSelect
                id="cobro-metodo"
                value={borrador.method}
                disabled={disabled}
                onChange={(e) => cambiar({ method: e.target.value })}
              >
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
                <option value="other">Otro</option>
              </CFormSelect>
            </CCol>
            {pideReferencia(borrador.method) && (
              <CCol xs={12}>
                <CFormLabel htmlFor="cobro-referencia" className="small mb-1">
                  Referencia (folio o últimos dígitos del voucher)
                </CFormLabel>
                <CFormInput
                  id="cobro-referencia"
                  maxLength={60}
                  value={borrador.referencia}
                  disabled={disabled}
                  onChange={enMayusculas((valor) => cambiar({ referencia: valor }))}
                />
              </CCol>
            )}
          </CRow>
        </div>
      )}

      {borrador.modo === 'sin_cargo' && (
        <div>
          <CFormLabel htmlFor="cobro-motivo" className="small mb-1">
            Motivo de que no tenga cargo
          </CFormLabel>
          <CFormInput
            id="cobro-motivo"
            placeholder="Ej. REVISIÓN INCLUIDA"
            value={borrador.motivo}
            disabled={disabled}
            invalid={errorEnvio?.campo === 'motivo'}
            aria-invalid={errorEnvio?.campo === 'motivo' || undefined}
            aria-describedby={errorEnvio?.campo === 'motivo' ? 'error-cobro-motivo' : undefined}
            onChange={enMayusculas((valor) => cambiar({ motivo: valor }))}
          />
          <ErrorDeCampo
            id="error-cobro-motivo"
            mensaje={errorEnvio?.campo === 'motivo' ? errorEnvio.error : undefined}
          />
        </div>
      )}
    </div>
  )
}

export default CobroAlFinalizarSeccion
