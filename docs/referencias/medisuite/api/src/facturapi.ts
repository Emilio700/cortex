// Cliente mínimo de Facturapi (PAC) v2: https://www.facturapi.io/v2 — autenticación Bearer con la llave secreta.
// Rutas usadas (las mismas del SDK oficial `facturapi`): POST /invoices, GET /invoices/{id}/pdf|xml,
// DELETE /invoices/{id}?motive=&substitution=, POST /invoices/{id}/email.
import { AppError } from './errors.js'
import type { FetchFn } from './types.js'

export const pacNoConfigurado = () => new AppError(503, 'pac_no_configurado', 'La facturación electrónica no está configurada en el servidor (FACTURAPI_KEY).')

export interface FacturapiInvoice {
  id: string
  uuid?: string
  series?: string
  folio_number?: number | string
  status?: string
  cancellation_status?: string
  total?: number
  verification_url?: string
}

export class Facturapi {
  constructor(
    private fetchFn: FetchFn,
    private cfg: { key: string; base: string },
  ) {}

  private async req(method: string, path: string, opts: { body?: unknown; query?: Record<string, string | undefined>; binary?: boolean } = {}) {
    const url = new URL(this.cfg.base + path)
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v)
    let res: Response
    try {
      res = await this.fetchFn(url, {
        method,
        headers: { Authorization: `Bearer ${this.cfg.key}`, ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (e) {
      throw new AppError(502, 'pac_error', `No se pudo contactar al PAC: ${(e as Error).message}`)
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { message?: string }
        if (j?.message) msg = j.message
      } catch {
        /* sin cuerpo JSON */
      }
      if (res.status === 401 || res.status === 403) throw new AppError(502, 'pac_error', 'El PAC rechazó la llave de API (FACTURAPI_KEY).')
      if (res.status >= 400 && res.status < 500) throw new AppError(422, 'pac_rechazo', `El PAC rechazó la solicitud: ${msg}`.slice(0, 1000))
      throw new AppError(502, 'pac_error', `Error del PAC: ${msg}`.slice(0, 1000))
    }
    if (opts.binary) return Buffer.from(await res.arrayBuffer())
    const text = await res.text()
    return text ? JSON.parse(text) : {}
  }

  createInvoice(body: unknown): Promise<FacturapiInvoice> {
    return this.req('POST', '/invoices', { body }) as Promise<FacturapiInvoice>
  }
  download(id: string, kind: 'pdf' | 'xml'): Promise<Buffer> {
    return this.req('GET', `/invoices/${encodeURIComponent(id)}/${kind}`, { binary: true }) as Promise<Buffer>
  }
  cancel(id: string, motive: string, substitution?: string): Promise<FacturapiInvoice> {
    return this.req('DELETE', `/invoices/${encodeURIComponent(id)}`, { query: { motive, substitution } }) as Promise<FacturapiInvoice>
  }
  sendByEmail(id: string, email?: string) {
    return this.req('POST', `/invoices/${encodeURIComponent(id)}/email`, { body: email ? { email } : {} })
  }
}

// ---------- Reglas CFDI 4.0 del receptor ----------
const REGIMEN_FISICA = new Set(['605', '606', '607', '608', '610', '611', '612', '614', '615', '616', '621', '625', '626', '629', '630'])
const REGIMEN_MORAL = new Set(['601', '603', '609', '610', '620', '622', '623', '624', '626', '628'])
const GENERICOS = new Set(['XAXX010101000', 'XEXX010101000'])

/** Devuelve un mensaje de error si RFC, régimen y uso de CFDI no son coherentes; null si están bien. */
export function receptorProblem(r: { rfc: string; regimenFiscal: string; usoCfdi: string }): string | null {
  if (GENERICOS.has(r.rfc)) {
    if (r.regimenFiscal !== '616') return 'El RFC genérico requiere régimen 616 (Sin obligaciones fiscales).'
    if (r.usoCfdi !== 'S01') return 'El RFC genérico requiere uso de CFDI S01 (Sin efectos fiscales).'
    return null
  }
  const fisica = r.rfc.length === 13
  if (fisica && !REGIMEN_FISICA.has(r.regimenFiscal)) return `El régimen ${r.regimenFiscal} no corresponde a una persona física (RFC de 13 caracteres).`
  if (!fisica && !REGIMEN_MORAL.has(r.regimenFiscal)) return `El régimen ${r.regimenFiscal} no corresponde a una persona moral (RFC de 12 caracteres).`
  if (r.usoCfdi.startsWith('D') && !fisica) return 'Las deducciones personales (D01–D10) solo aplican a personas físicas.'
  if (r.regimenFiscal === '616' && !['S01', 'CP01'].includes(r.usoCfdi)) return 'Con régimen 616 solo se permite uso S01 o CP01.'
  return null
}

/** Cuerpo de POST /invoices para un servicio médico exento de IVA (LIVA art. 15 fr. XIV). */
export function invoiceBody(p: {
  receptor: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string; usoCfdi: string; email?: string }
  formaPago: string
  claveProdServ: string
  descripcion: string
  monto: number
  externalId: string
}) {
  return {
    customer: {
      legal_name: p.receptor.nombre,
      tax_id: p.receptor.rfc,
      tax_system: p.receptor.regimenFiscal,
      ...(p.receptor.email ? { email: p.receptor.email } : {}),
      address: { zip: p.receptor.codigoPostal },
    },
    items: [
      {
        quantity: 1,
        product: {
          description: p.descripcion,
          product_key: p.claveProdServ,
          unit_key: 'E48', // Unidad de servicio
          price: Math.round(p.monto * 100) / 100,
          tax_included: false,
          taxability: '02', // Sí objeto de impuesto (ObjetoImp 02) con traslado exento
          taxes: [{ type: 'IVA', rate: 0, factor: 'Exento', withholding: false }],
        },
      },
    ],
    payment_form: p.formaPago,
    payment_method: 'PUE',
    use: p.receptor.usoCfdi,
    external_id: p.externalId,
  }
}
