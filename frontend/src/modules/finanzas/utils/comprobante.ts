/**
 * Comprobante de pago imprimible (S-08).
 *
 * Decisión de Emilio: comprobante simple, no factura. Lleva los datos de la
 * clínica, el folio del pago, la fecha, el concepto, el monto y el método; nada
 * fiscal y nada clínico. El papel lo dice, para que nadie lo tome por factura.
 *
 * Se arma en el navegador con lo que ya devuelve el API (el pago del listado y
 * la sucursal de `GET /tenants`): sin el paciente con correo no había forma de
 * darle comprobante, y el PDF que manda el correo no tiene endpoint de descarga.
 * Lo que el API no trae no se inventa: sin dirección o teléfono de la sucursal,
 * esa línea simplemente no sale.
 */
import type { Tenant } from '../../../shared/services/tenants'
import type { Payment } from '../types'
import { etiquetaMetodo, formatoMoneda } from './cobro'
import { formatearInstante } from '../../../shared/utils/date'

export type DatosClinica = Pick<Tenant, 'name' | 'address' | 'phone' | 'email'>

const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Un pago anulado no lleva comprobante: el dinero ya no cuenta. */
export const pagoConComprobante = (pago: Payment): boolean => pago.status !== 'anulado'

const renglon = (etiqueta: string, valor: string | null | undefined) =>
  valor ? `<tr><th>${escapar(etiqueta)}</th><td>${escapar(valor)}</td></tr>` : ''

/** HTML completo de la hoja. Todo texto que viene del servidor se escapa. */
export const htmlDelComprobante = (pago: Payment, clinica: DatosClinica): string => {
  const fecha = formatearInstante(pago.paid_at || pago.created_at, {
    dateStyle: 'long',
    timeStyle: 'short',
  })
  const contacto = [clinica.address, clinica.phone ? `Tel. ${clinica.phone}` : null, clinica.email]
    .filter(Boolean)
    .map((dato) => `<div>${escapar(String(dato))}</div>`)
    .join('')
  const concepto = pago.description || pago.service_name || 'Pago'

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante de pago ${pago.id}</title>
<style>
  @page { size: letter; margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12pt; margin: 0; }
  .hoja { max-width: 160mm; margin: 0 auto; }
  .clinica { text-align: center; border-bottom: 1px solid #999; padding-bottom: 8px; }
  .clinica h1 { font-size: 16pt; margin: 0 0 4px; }
  .clinica div { font-size: 10pt; color: #444; }
  h2 { text-align: center; font-size: 13pt; letter-spacing: 1px; margin: 14px 0 4px; }
  .folio { text-align: center; font-size: 10pt; color: #444; margin-bottom: 12px; }
  .monto { text-align: center; font-size: 24pt; font-weight: bold; margin: 8px 0 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { width: 38%; font-weight: normal; color: #444; }
  .aviso { margin-top: 18px; font-size: 9pt; color: #444; text-align: center; }
</style>
</head>
<body>
<div class="hoja">
  <div class="clinica">
    <h1>${escapar(clinica.name)}</h1>
    ${contacto}
  </div>
  <h2>COMPROBANTE DE PAGO</h2>
  <div class="folio">Folio del pago: ${pago.id}</div>
  <div class="monto">${escapar(formatoMoneda(pago.amount))} MXN</div>
  <table>
    ${renglon('Fecha', fecha)}
    ${renglon('Recibimos de', pago.patient_name)}
    ${renglon('Concepto', concepto)}
    ${renglon('Médico', pago.doctor_name)}
    ${renglon('Método de pago', etiquetaMetodo(pago.method))}
    ${renglon('Referencia', pago.referencia)}
    ${renglon('Recibió', pago.received_by_name)}
  </table>
  <p class="aviso">Este comprobante no es una factura ni tiene validez fiscal.</p>
</div>
</body>
</html>`
}

/**
 * Abre el diálogo de impresión con el comprobante en un marco oculto: así la
 * hoja sale sin menús ni botones de la aplicación.
 */
export const imprimirComprobante = (pago: Payment, clinica: DatosClinica) => {
  const marco = document.createElement('iframe')
  marco.style.display = 'none'
  marco.setAttribute('title', `Comprobante de pago ${pago.id}`)
  marco.srcdoc = htmlDelComprobante(pago, clinica)
  marco.onload = () => {
    const ventana = marco.contentWindow
    if (!ventana) return
    // Se quita al cerrar el diálogo para no ir acumulando marcos en la página.
    ventana.addEventListener('afterprint', () => marco.remove())
    ventana.print()
  }
  document.body.appendChild(marco)
}
