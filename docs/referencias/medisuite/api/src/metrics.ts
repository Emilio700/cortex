// Contadores en memoria (por proceso) expuestos en formato de texto de Prometheus.
// Sin etiquetas con datos de pacientes: solo método, ruta (patrón), clase de estado, canal, etc.

type Labels = Record<string, string>

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

function key(labels: Labels) {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
    .join(',')
}

class Counter {
  values = new Map<string, number>()
  constructor(
    public name: string,
    public help: string,
  ) {}
  inc(labels: Labels = {}, n = 1) {
    const k = key(labels)
    this.values.set(k, (this.values.get(k) ?? 0) + n)
  }
  get(labels: Labels = {}) {
    return this.values.get(key(labels)) ?? 0
  }
  render() {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`]
    if (!this.values.size) out.push(`${this.name} 0`)
    for (const [k, v] of this.values) out.push(`${this.name}${k ? `{${k}}` : ''} ${v}`)
    return out.join('\n')
  }
}

class Histogram {
  series = new Map<string, { buckets: number[]; sum: number; count: number }>()
  constructor(
    public name: string,
    public help: string,
  ) {}
  observe(labels: Labels, v: number) {
    const k = key(labels)
    let s = this.series.get(k)
    if (!s) this.series.set(k, (s = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }))
    BUCKETS.forEach((b, i) => {
      if (v <= b) s!.buckets[i]++
    })
    s.sum += v
    s.count++
  }
  render() {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`]
    for (const [k, s] of this.series) {
      const pre = k ? `${k},` : ''
      BUCKETS.forEach((b, i) => out.push(`${this.name}_bucket{${pre}le="${b}"} ${s.buckets[i]}`))
      out.push(`${this.name}_bucket{${pre}le="+Inf"} ${s.count}`)
      out.push(`${this.name}_sum${k ? `{${k}}` : ''} ${s.sum}`)
      out.push(`${this.name}_count${k ? `{${k}}` : ''} ${s.count}`)
    }
    return out.join('\n')
  }
}

export class Metrics {
  readonly startedAt = Date.now()
  requests = new Counter('medisuite_http_requests_total', 'Solicitudes HTTP atendidas')
  errors = new Counter('medisuite_http_errors_total', 'Respuestas HTTP 5xx')
  latency = new Histogram('medisuite_http_request_duration_seconds', 'Latencia de las solicitudes HTTP')
  schedulerRuns = new Counter('medisuite_scheduler_runs_total', 'Ejecuciones del programador de recordatorios')
  mensajes = new Counter('medisuite_mensajes_total', 'Mensajes enviados por canal y resultado')
  webhooks = new Counter('medisuite_webhooks_total', 'Eventos de webhook recibidos')
  facturas = new Counter('medisuite_facturas_total', 'Operaciones con el PAC')

  recordRequest(method: string, route: string, status: number, seconds: number) {
    const cls = `${Math.floor(status / 100)}xx`
    this.requests.inc({ method, route, status: cls })
    if (status >= 500) this.errors.inc({ method, route })
    this.latency.observe({ method }, seconds)
  }

  render(): string {
    const parts = [this.requests, this.errors, this.latency, this.schedulerRuns, this.mensajes, this.webhooks, this.facturas].map((m) => m.render())
    parts.push('# HELP medisuite_uptime_seconds Segundos desde el inicio del proceso', '# TYPE medisuite_uptime_seconds gauge', `medisuite_uptime_seconds ${Math.round((Date.now() - this.startedAt) / 1000)}`)
    return parts.join('\n') + '\n'
  }
}
