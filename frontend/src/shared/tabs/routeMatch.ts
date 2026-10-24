/**
 * Shared route-matching utilities for the tab system.
 *
 * The tab system (TabsOutlet, AppContent) needs to match
 * a concrete URL path (e.g. `/secretaria/pacientes/7202/historial`) against
 * route *patterns* (e.g. `/secretaria/pacientes/:patientId/historial`).
 *
 * React Router's plain `routes.find(r => r.path === pathname)` only does
 * exact matches, so dynamic routes were silently failing:
 *   - Tab content never rendered (TabsOutlet returned null)
 *   - Tab titles fell back to raw paths ("/secretaria/patient...")
 *   - Breadcrumbs stopped at the parent route ("Pacientes")
 *
 * This module centralises pattern matching so both consumers behave
 * identically.
 */
import type { LazyExoticComponent, FC, ReactNode } from 'react'
import routes from '../../routes'
import type { Route as RouteConfig } from '../../routes'
import type { Role } from '../types'

export interface RouteEntry {
    path: string
    element?: LazyExoticComponent<FC>
    requires?: string[]
    roles?: Role[]
    name?: ReactNode
    /** Ruta retirada que lleva a otra pantalla (ver `Route.redirigeA`). */
    redirigeA?: string
    /** Path split into segments, e.g. ['secretaria','pacientes',':patientId','historial'] */
    segments: string[]
    /** True when the pattern has at least one `:param` segment */
    hasParams: boolean
}

/**
 * Build a flat list of all route patterns, walking nested route trees.
 */
export function buildRouteEntries(): RouteEntry[] {
    const result: RouteEntry[] = []
    const walk = (rs: RouteConfig[]) => {
        for (const r of rs) {
            if (r.path) {
                const segments = r.path.split('/').filter(Boolean)
                result.push({
                    path: r.path,
                    element: r.element,
                    requires: r.requires,
                    roles: (r.roles as Role[] | undefined),
                    name: r.name,
                    redirigeA: r.redirigeA,
                    segments,
                    hasParams: segments.some((s) => s.startsWith(':')),
                })
            }
            if (r.routes) walk(r.routes)
        }
    }
    walk(routes)
    return result
}

/**
 * Match a concrete path against the route patterns.
 * `:param` segments match any single segment; literal segments must be equal.
 */
export function matchRoutePath(path: string, entries: RouteEntry[]): RouteEntry | undefined {
    const pathSegments = path.split('/').filter(Boolean)
    for (const entry of entries) {
        if (entry.segments.length !== pathSegments.length) continue
        let matched = true
        for (let i = 0; i < entry.segments.length; i++) {
            const seg = entry.segments[i]
            if (seg.startsWith(':')) continue // dynamic segment matches anything
            if (seg !== pathSegments[i]) {
                matched = false
                break
            }
        }
        if (matched) return entry
    }
    return undefined
}

/**
 * A dónde lleva una ruta retirada, con sus `:param` puestos (plan 32, punto 6).
 * `/doctor/patients/7/record` → `/pacientes/7/expediente`.
 */
export function destinoDeRedireccion(path: string, entry: RouteEntry): string | undefined {
    if (!entry.redirigeA) return undefined
    const partes = path.split('/').filter(Boolean)
    const valores: Record<string, string> = {}
    entry.segments.forEach((seg, i) => {
        if (seg.startsWith(':')) valores[seg.slice(1)] = partes[i]
    })
    return entry.redirigeA.replace(/:([A-Za-z]+)/g, (_, nombre: string) => valores[nombre] ?? `:${nombre}`)
}

/**
 * Humanize a URL segment into a readable title:
 * "dashboard" -> "Dashboard", "historial-del-paciente" -> "Historial Del Paciente"
 */
export function humanizeSegment(segment: string): string {
    return segment
        .replace(/[-_]+/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase())
        .replace(/\s+\w/g, (c) => c.toUpperCase())
}

/**
 * Resolve a readable tab title from a concrete URL path.
 * 1. Prefer the route's string name (e.g. "Historial del Paciente")
 * 2. For ReactNode/Translation names, fall back to a humanized last segment
 *    (e.g. "dashboard" -> "Dashboard")
 * 3. If no route matches, humanize the last path segment
 */
export function resolveTabTitle(path: string, entries: RouteEntry[]): string {
    const entry = matchRoutePath(path, entries)
    const last = path.split('/').filter(Boolean).pop() || path

    if (!entry) return humanizeSegment(last)
    if (typeof entry.name === 'string') return entry.name
    return humanizeSegment(last)
}
