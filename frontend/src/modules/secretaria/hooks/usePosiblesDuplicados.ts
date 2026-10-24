/**
 * Avisa de posibles pacientes duplicados antes de crear una nueva (S-06).
 *
 * Decisión de Emilio (3.5): **sólo advertir**. Se consultan candidatas con
 * `POST /patients/possible-duplicates` y se muestran; no se bloquea el alta ni
 * se fusiona. Si la consulta falla, se guarda igual: una advertencia no puede
 * impedir registrar a un paciente.
 */
import { useCallback, useRef, useState } from 'react'
import api from '../../../shared/services/api'

export interface CandidatoDuplicado {
  patient_id: number
  full_name: string
  date_of_birth?: string | null
  telefono_enmascarado?: string | null
  motivos: string[]
  coincidencia: 'alta' | 'media'
}

export interface TelefonoValidado {
  campo: string
  normalizado: string | null
  valido: boolean
}

export interface RespuestaDuplicados {
  telefonos: TelefonoValidado[]
  candidatos: CandidatoDuplicado[]
}

export interface DatosDuplicados {
  first_name?: string
  last_name?: string
  phone?: string
  cell_phone?: string
  email?: string
  date_of_birth?: string
  exclude_patient_id?: number
}

export const usePosiblesDuplicados = () => {
  const [resultado, setResultado] = useState<RespuestaDuplicados | null>(null)
  const [consultando, setConsultando] = useState(false)
  // Ignora la respuesta de una consulta vieja si ya salió otra más nueva.
  const secuencia = useRef(0)

  const consultar = useCallback(async (datos: DatosDuplicados): Promise<void> => {
    const id = ++secuencia.current
    setConsultando(true)
    try {
      const respuesta = await api.post<RespuestaDuplicados>('/patients/possible-duplicates', datos)
      if (id === secuencia.current) setResultado(respuesta.data)
    } catch {
      // Sin bloquear: si no se pudo consultar, no hay advertencia y se guarda igual.
      if (id === secuencia.current) setResultado(null)
    } finally {
      if (id === secuencia.current) setConsultando(false)
    }
  }, [])

  const limpiar = useCallback(() => {
    secuencia.current++
    setResultado(null)
  }, [])

  return { resultado, consultando, consultar, limpiar }
}
