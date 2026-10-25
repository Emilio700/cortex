// Decodificadores de perfiles GATT estándar (Bluetooth SIG) + generadores de muestras para simular aparatos.
// Sin dependencias de React: se puede probar en Node.

export type Lectura = {
  valores: Record<string, number> // códigos de Observation: pas, pad, fc, temp, peso, talla, imc, glucosa, spo2
  detalle?: string
  fechaAparato?: string // ISO, si el aparato envía su propia fecha
}

// ---------- IEEE-11073 ----------
/** SFLOAT de 16 bits: exponente con signo de 4 bits + mantisa con signo de 12 bits. */
export function sfloat(raw: number): number {
  const m = raw & 0x0fff
  let e = raw >> 12
  if (e >= 8) e -= 16
  if (e === 0) {
    if (m === 0x07ff || m === 0x0801) return NaN // NaN / reservado
    if (m === 0x0800) return NaN // NRes (sin resolución)
    if (m === 0x07fe) return Infinity
    if (m === 0x0802) return -Infinity
  }
  const mant = m >= 0x0800 ? m - 0x1000 : m
  return round(mant * Math.pow(10, e))
}

/** FLOAT de 32 bits: exponente con signo de 8 bits + mantisa con signo de 24 bits. */
export function float32(raw: number): number {
  const m = raw & 0x00ffffff
  let e = (raw >>> 24) & 0xff
  if (e >= 128) e -= 256
  if (e === 0) {
    if (m === 0x007fffff || m === 0x00800000 || m === 0x00800001) return NaN
    if (m === 0x007ffffe) return Infinity
    if (m === 0x00800002) return -Infinity
  }
  const mant = m >= 0x00800000 ? m - 0x01000000 : m
  return round(mant * Math.pow(10, e))
}

const round = (x: number, d = 6) => Math.round(x * 10 ** d) / 10 ** d

export function encSfloat(v: number, exp = -1): number {
  const m = Math.round(v / Math.pow(10, exp)) & 0x0fff
  return ((exp & 0x0f) << 12) | m
}
export function encFloat(v: number, exp = -2): number {
  const m = Math.round(v / Math.pow(10, exp)) & 0x00ffffff
  return (((exp & 0xff) << 24) | m) >>> 0
}

// ---------- Lector secuencial ----------
class R {
  o = 0
  dv: DataView
  constructor(dv: DataView) { this.dv = dv }
  u8() { return this.dv.getUint8(this.o++) }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v }
  s16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v }
  sf() { return sfloat(this.u16()) }
  fl() { return float32(this.u32()) }
  left() { return this.dv.byteLength - this.o }
  time() {
    const y = this.u16(), mo = this.u8(), d = this.u8(), h = this.u8(), mi = this.u8(), s = this.u8()
    if (!y || !mo || !d) return undefined
    return new Date(y, mo - 1, d, h, mi, s).toISOString()
  }
}

const KPA_MMHG = 7.50062
const r1 = (x: number) => Math.round(x * 10) / 10

// ---------- Parsers ----------
/** 0x2A35 Blood Pressure Measurement */
export function parseBloodPressure(dv: DataView): Lectura {
  const r = new R(dv)
  const f = r.u8()
  const k = f & 1 ? KPA_MMHG : 1
  const sys = r.sf() * k, dia = r.sf() * k, map = r.sf() * k
  const out: Lectura = { valores: {} }
  if (Number.isFinite(sys)) out.valores.pas = Math.round(sys)
  if (Number.isFinite(dia)) out.valores.pad = Math.round(dia)
  if (f & 2) out.fechaAparato = r.time()
  if (f & 4) {
    const pr = r.sf()
    if (Number.isFinite(pr)) out.valores.fc = Math.round(pr)
  }
  const det: string[] = []
  if (Number.isFinite(map)) det.push(`PAM ${Math.round(map)} mmHg`)
  if (f & 1) det.push('aparato en kPa (convertido)')
  if (f & 8) det.push(`usuario ${r.u8()}`)
  if (f & 16 && r.left() >= 2) {
    const st = r.u16()
    if (st & 1) det.push('movimiento detectado')
    if (st & 2) det.push('brazalete flojo')
    if (st & 4) det.push('pulso irregular')
    if (st & 32) det.push('posición incorrecta')
  }
  out.detalle = det.join(' · ')
  return out
}

/** 0x2A37 Heart Rate Measurement */
export function parseHeartRate(dv: DataView): Lectura & { rr: number[] } {
  const r = new R(dv)
  const f = r.u8()
  const hr = f & 1 ? r.u16() : r.u8()
  const det: string[] = []
  if ((f & 0b110) === 0b100) det.push('sin contacto con la piel')
  if (f & 8) det.push(`energía ${r.u16()} kJ`)
  const rr: number[] = []
  if (f & 16) while (r.left() >= 2) rr.push(Math.round((r.u16() / 1024) * 1000))
  if (rr.length) det.push(`RR ${rr.join(', ')} ms`)
  return { valores: { fc: hr }, rr, detalle: det.join(' · ') }
}

/** 0x2A1C Temperature Measurement */
export function parseTemperature(dv: DataView): Lectura {
  const r = new R(dv)
  const f = r.u8()
  let t = r.fl()
  if (f & 1) t = (t - 32) * (5 / 9)
  const out: Lectura = { valores: Number.isFinite(t) ? { temp: r1(t) } : {} }
  if (f & 2) out.fechaAparato = r.time()
  if (f & 4) {
    const tipos = ['', 'axilar', 'corporal', 'oído', 'dedo', 'gastrointestinal', 'boca', 'rectal', 'dedo del pie', 'timpánica']
    out.detalle = 'Sitio: ' + (tipos[r.u8()] || 'otro')
  }
  if (f & 1) out.detalle = [out.detalle, 'aparato en °F (convertido)'].filter(Boolean).join(' · ')
  return out
}

/** 0x2A9D Weight Measurement */
export function parseWeight(dv: DataView): Lectura {
  const r = new R(dv)
  const f = r.u8()
  const imp = f & 1
  const raw = r.u16()
  const out: Lectura = { valores: {} }
  if (raw !== 0xffff) out.valores.peso = r1(imp ? raw * 0.01 * 0.45359237 : raw * 0.005)
  if (f & 2) out.fechaAparato = r.time()
  if (f & 4) r.u8()
  if (f & 8) {
    const bmi = r.u16() * 0.1
    const h = r.u16()
    if (bmi) out.valores.imc = r1(bmi)
    if (h) out.valores.talla = r1(imp ? h * 0.1 * 2.54 : h * 0.1) // 0.001 m = 0.1 cm
  }
  if (imp) out.detalle = 'aparato en lb (convertido)'
  return out
}

/** 0x2A18 Glucose Measurement */
export function parseGlucose(dv: DataView): Lectura & { seq: number } {
  const r = new R(dv)
  const f = r.u8()
  const seq = r.u16()
  let fecha = r.time()
  if (f & 1) {
    const off = r.s16()
    if (fecha) fecha = new Date(new Date(fecha).getTime() + off * 60000).toISOString()
  }
  const out = { valores: {} as Record<string, number>, seq, fechaAparato: fecha, detalle: `registro #${seq}` }
  if (f & 2) {
    const c = r.sf()
    const ts = r.u8()
    // kg/L → mg/dL (×100 000); mol/L → mmol/L (×1000) → mg/dL (×18.016)
    const mg = f & 4 ? c * 1000 * 18.016 : c * 100000
    if (Number.isFinite(mg)) out.valores.glucosa = Math.round(mg)
    const tipos = ['', 'sangre capilar', 'plasma capilar', 'sangre venosa', 'plasma venoso', 'sangre arterial', 'plasma arterial', 'sangre indeterminada', 'plasma indeterminado', 'líquido intersticial', 'solución control']
    const t = tipos[ts & 0x0f]
    if (t) out.detalle += ' · ' + t
  }
  return out
}

/** 0x2A5E PLX Spot-check Measurement */
export function parsePlxSpot(dv: DataView): Lectura {
  const r = new R(dv)
  const f = r.u8()
  const spo2 = r.sf(), pr = r.sf()
  const out: Lectura = { valores: {} }
  if (Number.isFinite(spo2)) out.valores.spo2 = Math.round(spo2)
  if (Number.isFinite(pr)) out.valores.fc = Math.round(pr)
  if (f & 1) out.fechaAparato = r.time()
  out.detalle = 'medición puntual'
  return out
}

/** 0x2A5F PLX Continuous Measurement */
export function parsePlxContinuous(dv: DataView): Lectura {
  const r = new R(dv)
  r.u8()
  const spo2 = r.sf(), pr = r.sf()
  const out: Lectura = { valores: {}, detalle: 'continuo' }
  if (Number.isFinite(spo2)) out.valores.spo2 = Math.round(spo2)
  if (Number.isFinite(pr)) out.valores.fc = Math.round(pr)
  return out
}

// ---------- Constructor de muestras (simulación) ----------
class W {
  b: number[] = []
  u8(v: number) { this.b.push(v & 0xff); return this }
  u16(v: number) { this.b.push(v & 0xff, (v >> 8) & 0xff); return this }
  u32(v: number) { for (let i = 0; i < 4; i++) this.b.push((v >>> (8 * i)) & 0xff); return this }
  time(d = new Date()) { return this.u16(d.getFullYear()).u8(d.getMonth() + 1).u8(d.getDate()).u8(d.getHours()).u8(d.getMinutes()).u8(d.getSeconds()) }
  dv() { return new DataView(new Uint8Array(this.b).buffer) }
}
export { W as SampleWriter }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const ri = (a: number, b: number) => Math.round(rnd(a, b))

export const sim = {
  bp(o: { sys?: number; dia?: number; pr?: number; kpa?: boolean } = {}) {
    const sys = o.sys ?? ri(108, 138), dia = o.dia ?? ri(66, 88), pr = o.pr ?? ri(60, 92)
    const k = o.kpa ? 1 / KPA_MMHG : 1
    const e = o.kpa ? -2 : 0
    return new W().u8((o.kpa ? 1 : 0) | 2 | 4 | 16)
      .u16(encSfloat(sys * k, e)).u16(encSfloat(dia * k, e)).u16(encSfloat(((sys + 2 * dia) / 3) * k, e))
      .time().u16(encSfloat(pr, 0)).u16(0).dv()
  },
  hr(o: { hr?: number; u16?: boolean } = {}) {
    const hr = o.hr ?? ri(62, 84)
    const w = new W().u8((o.u16 ? 1 : 0) | 0b110 | 16)
    if (o.u16) w.u16(hr); else w.u8(hr)
    const rr = Math.round((60 / hr) * 1024)
    return w.u16(rr + ri(-15, 15)).u16(rr + ri(-15, 15)).dv()
  },
  temp(o: { c?: number; f?: boolean } = {}) {
    const c = o.c ?? rnd(36.2, 37.1)
    const v = o.f ? c * 9 / 5 + 32 : c
    return new W().u8((o.f ? 1 : 0) | 2 | 4).u32(encFloat(v, -2)).time().u8(6).dv()
  },
  weight(o: { kg?: number; tallaCm?: number; lb?: boolean } = {}) {
    const kg = o.kg ?? rnd(55, 95), cm = o.tallaCm ?? ri(150, 185)
    const bmi = kg / (cm / 100) ** 2
    const w = new W().u8((o.lb ? 1 : 0) | 2 | 8)
    w.u16(o.lb ? Math.round(kg / 0.45359237 / 0.01) : Math.round(kg / 0.005)).time()
    w.u16(Math.round(bmi * 10)).u16(o.lb ? Math.round(cm / 2.54 / 0.1) : Math.round(cm * 10))
    return w.dv()
  },
  glucose(o: { mg?: number; seq?: number; mol?: boolean } = {}) {
    const mg = o.mg ?? ri(80, 160)
    // kg/L con exponente -5 → mantisa = mg/dL ; mol/L con exponente -5 → mantisa = mmol/L × 100
    const conc = o.mol ? encSfloat(mg / 18.016 / 1000, -5) : encSfloat(mg / 100000, -5)
    return new W().u8(1 | 2 | (o.mol ? 4 : 0)).u16(o.seq ?? 1).time(new Date(Date.now() - 3600000)).u16(60)
      .u16(conc).u8((1 << 4) | 1).dv()
  },
  plxSpot(o: { spo2?: number; pr?: number } = {}) {
    return new W().u8(1).u16(encSfloat(o.spo2 ?? ri(95, 99), 0)).u16(encSfloat(o.pr ?? ri(60, 90), 0)).time().dv()
  },
  plxCont(o: { spo2?: number; pr?: number } = {}) {
    return new W().u8(0).u16(encSfloat(o.spo2 ?? ri(95, 99), 0)).u16(encSfloat(o.pr ?? ri(60, 90), 0)).dv()
  },
}

// ---------- Perfiles ----------
export type Perfil = {
  id: string
  nombre: string
  servicio: number
  servicioNombre: string
  chars: { uuid: number; nombre: string; parse: (dv: DataView) => Lectura; opcional?: boolean }[]
  racp?: boolean // Glucosa: pedir "todos los registros"
  muestra: () => DataView
  ejemplos: string
}

export const PERFILES: Perfil[] = [
  { id: 'bp', nombre: 'Baumanómetro', servicio: 0x1810, servicioNombre: 'Blood Pressure', chars: [{ uuid: 0x2a35, nombre: 'Blood Pressure Measurement (indicación)', parse: parseBloodPressure }], muestra: () => sim.bp(Math.random() < 0.2 ? { kpa: true } : {}), ejemplos: 'Omron (modelos con Bluetooth Smart), A&D UA-651BLE, Beurer BM 54/85' },
  { id: 'hr', nombre: 'Banda de frecuencia cardiaca', servicio: 0x180d, servicioNombre: 'Heart Rate', chars: [{ uuid: 0x2a37, nombre: 'Heart Rate Measurement (notificación)', parse: parseHeartRate }], muestra: () => sim.hr({ u16: Math.random() < 0.3 }), ejemplos: 'Polar H9/H10, Garmin HRM-Dual, Wahoo TICKR, muchos relojes en modo "transmitir FC"' },
  { id: 'temp', nombre: 'Termómetro', servicio: 0x1809, servicioNombre: 'Health Thermometer', chars: [{ uuid: 0x2a1c, nombre: 'Temperature Measurement (indicación)', parse: parseTemperature }], muestra: () => sim.temp({ f: Math.random() < 0.25 }), ejemplos: 'A&D UT-201BLE, Beurer FT 95, termómetros "Health Thermometer" genéricos' },
  { id: 'peso', nombre: 'Báscula', servicio: 0x181d, servicioNombre: 'Weight Scale', chars: [{ uuid: 0x2a9d, nombre: 'Weight Measurement (indicación)', parse: parseWeight }], muestra: () => sim.weight({ lb: Math.random() < 0.2 }), ejemplos: 'A&D UC-352BLE, Omron VIVA, Beurer BF 600/850' },
  { id: 'glu', nombre: 'Glucómetro', servicio: 0x1808, servicioNombre: 'Glucose', chars: [{ uuid: 0x2a18, nombre: 'Glucose Measurement + RACP 0x2A52', parse: parseGlucose }], racp: true, muestra: () => sim.glucose({ mol: Math.random() < 0.3 }), ejemplos: 'Accu-Chek Guide/Instant, Contour Next One, OneTouch Verio Flex' },
  { id: 'plx', nombre: 'Oxímetro de pulso', servicio: 0x1822, servicioNombre: 'Pulse Oximeter (PLX)', chars: [{ uuid: 0x2a5f, nombre: 'PLX Continuous', parse: parsePlxContinuous, opcional: true }, { uuid: 0x2a5e, nombre: 'PLX Spot-check', parse: parsePlxSpot, opcional: true }], muestra: () => (Math.random() < 0.5 ? sim.plxSpot() : sim.plxCont()), ejemplos: 'Nonin 3230, Masimo MightySat Rx, Beurer PO 60' },
]

// ---------- Web Bluetooth mínimo (tipos locales; no vienen en lib.dom) ----------
type Char = EventTarget & { value?: DataView; startNotifications(): Promise<Char>; stopNotifications(): Promise<Char>; writeValue(v: BufferSource): Promise<void> }
type Service = { getCharacteristic(u: number): Promise<Char> }
type Gatt = { connected: boolean; connect(): Promise<Gatt>; disconnect(): void; getPrimaryService(u: number): Promise<Service> }
type Device = EventTarget & { name?: string; gatt?: Gatt }
type BT = { requestDevice(o: unknown): Promise<Device>; getAvailability?(): Promise<boolean> }

export function bluetooth(): BT | null {
  return ((navigator as unknown as { bluetooth?: BT }).bluetooth) ?? null
}

export type Conexion = { nombre: string; desconectar: () => void }

export async function conectar(p: Perfil, onLectura: (l: Lectura) => void, onDesconexion: () => void): Promise<Conexion> {
  const bt = bluetooth()
  if (!bt) throw new Error('Web Bluetooth no disponible')
  const dev = await bt.requestDevice({ filters: [{ services: [p.servicio] }] })
  dev.addEventListener('gattserverdisconnected', onDesconexion)
  const gatt = await dev.gatt!.connect()
  const svc = await gatt.getPrimaryService(p.servicio)
  let n = 0
  for (const c of p.chars) {
    try {
      const ch = await svc.getCharacteristic(c.uuid)
      ch.addEventListener('characteristicvaluechanged', () => ch.value && onLectura(c.parse(ch.value)))
      await ch.startNotifications()
      n++
    } catch (e) {
      if (!c.opcional) throw e
    }
  }
  if (!n) throw new Error('El aparato no expone las características esperadas')
  if (p.racp) {
    const racp = await svc.getCharacteristic(0x2a52)
    racp.addEventListener('characteristicvaluechanged', () => {
      const v = racp.value
      // Respuesta: 0x06 (Response Code) ... 0x01 éxito; 0x06 "sin registros"
      if (v && v.getUint8(0) === 0x06 && v.byteLength >= 4 && v.getUint8(3) !== 0x01 && v.getUint8(3) !== 0x06) console.warn('RACP código', v.getUint8(3))
    })
    await racp.startNotifications()
    await racp.writeValue(new Uint8Array([0x01, 0x01])) // Report stored records, All records
  }
  return { nombre: dev.name || p.nombre, desconectar: () => { dev.removeEventListener('gattserverdisconnected', onDesconexion); gatt.disconnect() } }
}
