/**
 * Hook for searching medications via the backend API (OpenFDA + local cache).
 * Provides debounced search, loading state, and the search function.
 */
import { useState, useCallback, useRef } from 'react'
import apiClient from '../../../shared/services/api'

export interface MedicationSearchItem {
  id: number
  brand_name: string
  generic_name: string | null
  active_ingredient: string | null
  presentations: Array<{ form: string; dosage: string; route: string }>
  common_dosages: string[]
  common_frequencies: string[]
  last_updated: string | null
  data_source: string
}

interface SearchResult {
  results: MedicationSearchItem[]
  source: string
  total: number
}

export function useMedicationSearch() {
  const [results, setResults] = useState<MedicationSearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  // Un fallo se veía como «sin resultados» (plan 29, T-1): la doctora creía que
  // el medicamento no estaba en el catálogo.
  const [error, setError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string): Promise<MedicationSearchItem[]> => {
    if (!query || query.trim().length < 2) {
      setResults([])
      setError(false)
      return []
    }

    setSearching(true)
    try {
      const resp = await apiClient.get<SearchResult>('/medications/search', {
        params: { q: query.trim(), limit: 20 },
      })
      const items = resp.data.results || []
      setResults(items)
      setError(false)
      return items
    } catch (err) {
      console.error('Error searching medications:', err)
      setResults([])
      setError(true)
      return []
    } finally {
      setSearching(false)
      setLoading(false)
    }
  }, [])

  const debouncedSearch = useCallback(
    (query: string, callback?: (items: MedicationSearchItem[]) => void) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setLoading(true)

      debounceRef.current = setTimeout(async () => {
        const items = await search(query)
        if (callback) callback(items)
      }, 350)
    },
    [search],
  )

  const clearResults = useCallback(() => {
    setResults([])
    setLoading(false)
    setSearching(false)
    setError(false)
  }, [])

  return {
    results,
    loading,
    searching,
    error,
    search,
    debouncedSearch,
    clearResults,
  }
}
