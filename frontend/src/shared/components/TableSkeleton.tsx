/**
 * Skeleton loader for table/list content (Fase 7.2).
 *
 * Replaces a full-screen CSpinner on the highest-traffic list/table screens
 * (agenda, patient list, dashboards) with placeholder rows
 * that preview the eventual layout - reduces perceived load time and avoids
 * the jarring "blank screen -> spinner -> content pops in" sequence. Kept
 * generic/columns-based rather than one bespoke skeleton per screen, since
 * every list here is fundamentally "N rows of M text-ish cells".
 */
import React from 'react'
import { CPlaceholder } from '@coreui/react-pro'

interface TableSkeletonProps {
    rows?: number
    columns?: number
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 5, columns = 4 }) => {
    return (
        <div className="d-flex flex-column gap-2" aria-busy="true" aria-label="Cargando">
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="d-flex gap-3 align-items-center py-2">
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <CPlaceholder
                            key={colIndex}
                            as="div"
                            animation="glow"
                            style={{ height: '1rem', flex: colIndex === 0 ? 2 : 1, width: '100%' }}
                        />
                    ))}
                </div>
            ))}
        </div>
    )
}

interface CardGridSkeletonProps {
    count?: number
}

/** Skeleton for card-grid layouts (dashboards, KPI tiles). */
export const CardGridSkeleton: React.FC<CardGridSkeletonProps> = ({ count = 4 }) => {
    return (
        <div className="row g-3" aria-busy="true" aria-label="Cargando">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="col-sm-6 col-lg-3">
                    <div className="glass-card p-3">
                        <CPlaceholder as="div" animation="glow" style={{ height: '0.75rem', width: '60%' }} className="mb-2" />
                        <CPlaceholder as="div" animation="glow" style={{ height: '1.5rem', width: '40%' }} />
                    </div>
                </div>
            ))}
        </div>
    )
}
