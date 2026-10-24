/**
 * Carga una sola vez el vademecario del consultorio (los medicamentos que el
 * doctor receta de verdad, salidos de sus recetas historicas) y lo deja en
 * memoria para filtrar del lado del cliente. Son 315 entradas: no hace falta
 * pegarle al backend en cada tecla.
 */
import { useEffect, useState } from 'react'
import apiClient from '../../../shared/services/api'
import type { MedicamentoFrecuente } from '../utils/receta'

export function useMedicamentosFrecuentes() {
    const [medicamentos, setMedicamentos] = useState<MedicamentoFrecuente[]>([])
    const [cargando, setCargando] = useState(true)

    useEffect(() => {
        let vigente = true
        apiClient
            .get<MedicamentoFrecuente[]>('/medications/frecuentes', { params: { limite: 315 } })
            .then((resp) => {
                if (vigente) setMedicamentos(resp.data || [])
            })
            .catch(() => {
                if (vigente) setMedicamentos([])
            })
            .finally(() => {
                if (vigente) setCargando(false)
            })
        return () => {
            vigente = false
        }
    }, [])

    return { medicamentos, cargando }
}
