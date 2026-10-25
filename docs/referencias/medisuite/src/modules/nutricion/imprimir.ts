// Plan de alimentación imprimible (HTML → imprimir/guardar como PDF).
import { imprimirHTML } from '../../lib/imprimir'
import type { Patient, Settings } from '../../lib/types'
import { edad, fmtFecha, nombreCompleto } from '../../lib/utils'
import { COMIDAS, grupo, nombreGrupo, totalesPlan, type ComidaId, type Distribucion, type Equivalentes, type Gramos } from './nutri'

export interface AlimentoClinica {
  id: string
  grupo: string
  alimento: string
  porcion: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const n05 = (x: number) => (x ? String(x).replace('.5', '½').replace(/^0½$/, '½') : '')

export function imprimirPlan(o: { p: Patient; s: Settings; meta: Gramos; eq: Equivalentes; dist: Distribucion; pcts: Record<ComidaId, number>; alimentos: AlimentoClinica[]; notas: string; objetivo: string }) {
  const grupos = Object.keys(o.eq).filter((g) => o.eq[g] > 0)
  const t = totalesPlan(o.eq)
  const filas = grupos
    .map((g) => `<tr><th>${esc(nombreGrupo(grupo(g)!))}</th>${COMIDAS.map((c) => `<td>${n05(o.dist[g]?.[c.id] ?? 0)}</td>`).join('')}<td><b>${n05(o.eq[g])}</b></td></tr>`)
    .join('')
  const ejemplos = grupos
    .map((g) => {
      const al = o.alimentos.filter((a) => a.grupo === g)
      return al.length ? `<div class="ej"><h3>${esc(nombreGrupo(grupo(g)!))}</h3><ul>${al.map((a) => `<li>${esc(a.porcion)} ${esc(a.alimento)}</li>`).join('')}</ul></div>` : ''
    })
    .join('')
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Plan de alimentación</title><style>
    body{font:12px/1.45 system-ui,sans-serif;color:#111;margin:18px}h1{font-size:18px;margin:0;color:#0f766e}h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #999}
    h3{font-size:12px;margin:6px 0 2px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:center}th{text-align:left;background:#f1f3f5}
    thead th{text-align:center}.muted{color:#555}.ejs{columns:2;column-gap:20px}.ej{break-inside:avoid}ul{margin:0;padding-left:16px}.pre{white-space:pre-wrap}@page{margin:12mm}</style></head><body>
    <h1>Plan de alimentación por equivalentes</h1>
    <div class="muted">${esc(o.s.clinica)} · ${esc(o.s.doctor.nombre)}${o.s.doctor.cedula ? ` · Céd. ${esc(o.s.doctor.cedula)}` : ''} · ${fmtFecha(new Date().toISOString())}</div>
    <p><b>${esc(nombreCompleto(o.p))}</b> · ${edad(o.p.fechaNac).texto}${o.objetivo ? ` · Objetivo: ${esc(o.objetivo)}` : ''}</p>
    <p>Energía: <b>${Math.round(o.meta.kcal)} kcal/día</b> · Hidratos de carbono ${Math.round(o.meta.hc)} g · Proteínas ${Math.round(o.meta.prot)} g · Lípidos ${Math.round(o.meta.lip)} g
    <span class="muted">(plan calculado: ${Math.round(t.kcal)} kcal)</span></p>
    <h2>Equivalentes por tiempo de comida</h2>
    <table><thead><tr><th>Grupo</th>${COMIDAS.map((c) => `<th>${c.label}<br><span class="muted">${o.pcts[c.id]}%</span></th>`).join('')}<th>Total</th></tr></thead><tbody>${filas}</tbody></table>
    ${ejemplos ? `<h2>Ejemplos de 1 equivalente</h2><div class="ejs">${ejemplos}</div>` : ''}
    ${o.notas ? `<h2>Recomendaciones</h2><p class="pre">${esc(o.notas)}</p>` : ''}
    <p class="muted" style="margin-top:18px">Valores por equivalente: Sistema Mexicano de Alimentos Equivalentes (SMAE), 4.ª ed. Consulte a su nutriólogo antes de hacer cambios.</p>
    </body></html>`
  imprimirHTML(html, 'Plan de alimentación')
}
