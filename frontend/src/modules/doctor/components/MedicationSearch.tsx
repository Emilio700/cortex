/**
 * MedicationSearch Component — Typeahead search input for medications.
 *
 * Connects to the backend medication search API (OpenFDA + local cache).
 * Shows results as a dropdown while the user types (min. 2 characters).
 * On selection, calls the onSelect callback with the chosen medication data
 * (brand name, suggested dosage, suggested frequency).
 */
import React, { useState, useRef, useEffect } from 'react'
import {
    CButton,
    CFormInput,
    CSpinner,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilSearch } from '@coreui/icons'
import { useMedicationSearch } from '../hooks/useMedicationSearch'
import type { MedicationSearchItem } from '../hooks/useMedicationSearch'

interface MedicationSearchProps {
    /** Called when a medication is selected from the dropdown. Receives the full item. */
    onSelect: (medication: MedicationSearchItem) => void
    /** Optional placeholder text */
    placeholder?: string
    /** Optional className for the wrapper */
    className?: string
    /** If true, shows the search input small/inline */
    compact?: boolean
    /** If true, disables the search input */
    disabled?: boolean
}

export const MedicationSearch: React.FC<MedicationSearchProps> = ({
    onSelect,
    placeholder = 'Buscar medicamento...',
    className,
    compact = false,
    disabled = false,
}) => {
    const [query, setQuery] = useState('')
    const [showDropdown, setShowDropdown] = useState(false)
    const [localResults, setLocalResults] = useState<MedicationSearchItem[]>([])
    const wrapperRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const { loading, searching, error: errorBusqueda, debouncedSearch } = useMedicationSearch()

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setQuery(value)

        if (value.trim().length >= 2) {
            setShowDropdown(true)
            debouncedSearch(value, (items) => {
                setLocalResults(items)
            })
        } else {
            setLocalResults([])
            setShowDropdown(false)
        }
    }

    const handleSelect = (item: MedicationSearchItem) => {
        setQuery(item.brand_name)
        setShowDropdown(false)
        setLocalResults([])
        onSelect(item)
    }

    const handleFocus = () => {
        if (localResults.length > 0) {
            setShowDropdown(true)
        }
    }

    return (
        <div ref={wrapperRef} className={`position-relative ${className || ''}`}>
            <div className="input-group">
                <span className="input-group-text bg-transparent border-end-0">
                    {searching ? (
                        <CSpinner size="sm" />
                    ) : (
                        <CIcon icon={cilSearch} className="text-muted" />
                    )}
                </span>
                <CFormInput
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    disabled={disabled}
                    className="border-start-0"
                    aria-label="Buscar medicamento"
                    autoComplete="off"
                />
                {query && (
                    <CButton
                        color="light"
                        size="sm"
                        className="position-absolute end-0 top-50 translate-middle-y me-2 z-1"
                        onClick={() => {
                            setQuery('')
                            setLocalResults([])
                            setShowDropdown(false)
                            inputRef.current?.focus()
                        }}
                        style={{ border: 'none', background: 'transparent' }}
                    >
                        &times;
                    </CButton>
                )}
            </div>

            {/* Dropdown results */}
            {showDropdown && (
                <div
                    className="position-absolute w-100 mt-1 bg-white border rounded shadow-sm"
                    style={{
                        maxHeight: '320px',
                        overflowY: 'auto',
                        zIndex: 1050,
                        minWidth: compact ? '250px' : '350px',
                    }}
                >
                    {loading || searching ? (
                        <div className="text-center py-3">
                            <CSpinner size="sm" className="me-2" />
                            <span className="text-muted small">Buscando...</span>
                        </div>
                    ) : errorBusqueda ? (
                        <div className="px-3 py-2 text-danger small" role="alert">
                            No se pudo buscar en el catálogo de medicamentos. Puedes escribir el nombre a mano.
                        </div>
                    ) : localResults.length === 0 ? (
                        <div className="px-3 py-2 text-muted small">
                            {query.length >= 2
                                ? 'Sin resultados. Puedes escribir el nombre a mano.'
                                : 'Escribe al menos 2 caracteres para buscar.'}
                        </div>
                    ) : (
                        localResults.map((item) => (
                            <button
                                key={item.id}
                                className="dropdown-item border-bottom px-3 py-2 text-start w-100"
                                onClick={() => handleSelect(item)}
                                type="button"
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="fw-medium">{item.brand_name}</div>
                                <div className="small text-muted">
                                    {item.generic_name && item.generic_name !== item.brand_name
                                        ? `${item.generic_name}`
                                        : item.active_ingredient || ''}
                                </div>
                                {item.presentations && item.presentations.length > 0 && (
                                    <div className="small text-info">
                                        {item.presentations
                                            .slice(0, 2)
                                            .map((p) => p.form)
                                            .join(', ')}
                                    </div>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

export default MedicationSearch
