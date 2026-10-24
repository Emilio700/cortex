import { useState, useEffect } from 'react'
import { apiClient } from '../../../shared/services/api'
import type { User } from '../../../shared/types'

interface UseMasterStatsReturn {
  totalUsers: number
  usersByRole: Record<string, number>
  loading: boolean
  error: string | null
}

export const useMasterStats = (): UseMasterStatsReturn => {
  const [totalUsers, setTotalUsers] = useState(0)
  const [usersByRole, setUsersByRole] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiClient.get('/users')
        const users: User[] = res.data
        setTotalUsers(users.length)

        const byRole: Record<string, number> = {}
        for (const u of users) {
          byRole[u.role] = (byRole[u.role] || 0) + 1
        }
        setUsersByRole(byRole)
        setError(null)
      } catch {
        setError('Error al cargar estadísticas')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  return { totalUsers, usersByRole, loading, error }
}
