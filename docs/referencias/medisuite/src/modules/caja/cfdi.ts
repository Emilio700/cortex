// Construcción de un CFDI 4.0 (Anexo 20) SIN sello ni timbre, como vista previa.
// El timbrado requiere un PAC autorizado y el CSD del emisor en el servidor.

export const REGIMENES: [string, string][] = [
  ['601', 'General de Ley Personas Morales'],
  ['603', 'Personas Morales con Fines no Lucrativos'],
  ['605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios'],
  ['606', 'Arrendamiento'],
  ['612', 'Personas Físicas con Actividades Empresariales y Profesionales'],
  ['616', 'Sin obligaciones fiscales'],
  ['621', 'Incorporación Fiscal'],
  ['625', 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas'],
  ['626', 'Régimen Simplificado de Confianza'],
]
export const USOS: [string, string][] = [
  ['D01', 'Honorarios médicos, dentales y gastos hospitalarios'],
  ['G03', 'Gastos en general'],
  ['S01', 'Sin efectos fiscales'],
  ['CP01', 'Pagos (solo para CFDI tipo Pago)'],
]
export const FORMAS: [string, string][] = [
  ['01', 'Efectivo'],
  ['03', 'Transferencia electrónica de fondos'],
  ['04', 'Tarjeta de crédito'],
  ['28', 'Tarjeta de débito'],
]
export const CLAVES: [string, string][] = [
  ['85121600', 'Servicios médicos de doctores especialistas'],
  ['85121502', 'Servicios de consulta de médicos de atención primaria'],
]

// RFC: 3 letras (moral) o 4 (física) + fecha AAMMDD + homoclave de 3
export const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/
export const RFC_GENERICO = 'XAXX010101000'

export interface DatosCFDI {
  serie: string
  folio: string
  fecha: Date
  emisor: { rfc: string; nombre: string; regimen: string; cp: string }
  receptor: { rfc: string; nombre: string; cp: string; regimen: string; uso: string }
  formaPago: string
  claveProdServ: string
  descripcion: string
  monto: number
  objetoImp: '01' | '02'
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const m2 = (n: number) => n.toFixed(2)
const fechaCFDI = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const attrs = (o: Record<string, string | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${esc(v!)}"`)
    .join(' ')

/** Retención de ISR cuando una persona física (612 / 626) factura a una persona moral (RFC de 12). */
export function retencionISR(d: Pick<DatosCFDI, 'emisor' | 'receptor' | 'objetoImp'>) {
  if (d.objetoImp !== '02' || d.receptor.rfc.length !== 12) return 0
  return d.emisor.regimen === '612' ? 0.1 : d.emisor.regimen === '626' ? 0.0125 : 0
}

export function construirCFDI(d: DatosCFDI) {
  const sub = d.monto
  const tasaRet = retencionISR(d)
  const ret = Math.round(sub * tasaRet * 100) / 100
  const total = sub - ret
  const i = '  '
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(
    `<cfdi:Comprobante ${attrs({
      'xmlns:cfdi': 'http://www.sat.gob.mx/cfd/4',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      'xsi:schemaLocation': 'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
      Version: '4.0',
      Serie: d.serie,
      Folio: d.folio,
      Fecha: fechaCFDI(d.fecha),
      FormaPago: d.formaPago,
      SubTotal: m2(sub),
      Moneda: 'MXN',
      Total: m2(total),
      TipoDeComprobante: 'I',
      Exportacion: '01',
      MetodoPago: 'PUE',
      LugarExpedicion: d.emisor.cp,
    })}>`,
  )
  lines.push(`${i}<cfdi:Emisor ${attrs({ Rfc: d.emisor.rfc, Nombre: d.emisor.nombre, RegimenFiscal: d.emisor.regimen })}/>`)
  lines.push(
    `${i}<cfdi:Receptor ${attrs({
      Rfc: d.receptor.rfc,
      Nombre: d.receptor.nombre,
      DomicilioFiscalReceptor: d.receptor.cp,
      RegimenFiscalReceptor: d.receptor.regimen,
      UsoCFDI: d.receptor.uso,
    })}/>`,
  )
  lines.push(`${i}<cfdi:Conceptos>`)
  const concepto = attrs({
    ClaveProdServ: d.claveProdServ,
    Cantidad: '1',
    ClaveUnidad: 'E48',
    Unidad: 'Unidad de servicio',
    Descripcion: d.descripcion,
    ValorUnitario: m2(sub),
    Importe: m2(sub),
    ObjetoImp: d.objetoImp,
  })
  if (d.objetoImp === '01') lines.push(`${i}${i}<cfdi:Concepto ${concepto}/>`)
  else {
    lines.push(`${i}${i}<cfdi:Concepto ${concepto}>`)
    lines.push(`${i}${i}${i}<cfdi:Impuestos>`)
    // Servicios médicos: IVA exento (art. 15 fr. XIV LIVA)
    lines.push(`${i}${i}${i}${i}<cfdi:Traslados>`)
    lines.push(`${i}${i}${i}${i}${i}<cfdi:Traslado Base="${m2(sub)}" Impuesto="002" TipoFactor="Exento"/>`)
    lines.push(`${i}${i}${i}${i}</cfdi:Traslados>`)
    if (ret) {
      lines.push(`${i}${i}${i}${i}<cfdi:Retenciones>`)
      lines.push(`${i}${i}${i}${i}${i}<cfdi:Retencion Base="${m2(sub)}" Impuesto="001" TipoFactor="Tasa" TasaOCuota="${tasaRet.toFixed(6)}" Importe="${m2(ret)}"/>`)
      lines.push(`${i}${i}${i}${i}</cfdi:Retenciones>`)
    }
    lines.push(`${i}${i}${i}</cfdi:Impuestos>`)
    lines.push(`${i}${i}</cfdi:Concepto>`)
  }
  lines.push(`${i}</cfdi:Conceptos>`)
  if (d.objetoImp === '02') {
    lines.push(`${i}<cfdi:Impuestos${ret ? ` TotalImpuestosRetenidos="${m2(ret)}"` : ''}>`)
    if (ret) {
      lines.push(`${i}${i}<cfdi:Retenciones>`)
      lines.push(`${i}${i}${i}<cfdi:Retencion Impuesto="001" Importe="${m2(ret)}"/>`)
      lines.push(`${i}${i}</cfdi:Retenciones>`)
    }
    lines.push(`${i}${i}<cfdi:Traslados>`)
    lines.push(`${i}${i}${i}<cfdi:Traslado Base="${m2(sub)}" Impuesto="002" TipoFactor="Exento"/>`)
    lines.push(`${i}${i}</cfdi:Traslados>`)
    lines.push(`${i}</cfdi:Impuestos>`)
  }
  lines.push('</cfdi:Comprobante>')
  return { xml: lines.join('\n'), subtotal: sub, retencion: ret, total }
}
