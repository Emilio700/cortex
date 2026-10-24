import { useState, useEffect } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { User } from '../../../shared/types'

interface UseMasterUsersReturn {
  users: User[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export const useMasterUsers = (): UseMasterUsersReturn => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true)
      try {
        const res = await apiClient.get('/users')
        // Filter out MASTER users from the list (can't modify themselves)
        setUsers(res.data.filter((u: User) => u.role !== 'master'))
        setError(null)
      } catch {
        setError('Error al cargar usuarios')
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [refreshKey])

  const refresh = () => setRefreshKey(k => k + 1)

  return { users, loading, error, refresh }
}
