import { useState, useCallback } from 'react'
import api from '../../../shared/services/api'
import type { DoctorProfile, DoctorProfileUpdate } from '../types/doctorProfile'
import { mensajeDeError } from '../../../shared/utils/errors'

export const useDoctorProfile = () => {
    const [profile, setProfile] = useState<DoctorProfile | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const getProfile = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.get('/doctor-profile/me')
            setProfile(response.data)
            return response.data
        } catch (err: any) {
            setError(mensajeDeError(err, 'No se pudo cargar tu perfil.'))
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    /**
     * Lo que se manda al servidor va como `DoctorProfileUpdate` y no como
     * `Partial<DoctorProfile>`: hay campos que se pueden BORRAR (el nombre de
     * la receta, la leyenda) y el tipo de la respuesta no admite nulos.
     */
    const updateProfile = async (data: DoctorProfileUpdate) => {
        setLoading(true)
        setError(null)
        try {
            const response = await api.put('/doctor-profile/me', data)
            setProfile(response.data)
            return response.data
        } catch (err: any) {
            setError(mensajeDeError(err, 'No se pudo actualizar tu perfil.'))
            return null
        } finally {
            setLoading(false)
        }
    }

    const uploadLogo = async (file: File) => {
        setLoading(true)
        setError(null)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const response = await api.post('/doctor-profile/upload-logo', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })
            // Refresh profile to get new URL
            await getProfile() 
            return response.data.url
        } catch (err: any) {
            setError(mensajeDeError(err, 'No se pudo subir el logotipo.'))
            return null
        } finally {
            setLoading(false)
        }
    }

    const uploadSignature = async (file: File) => {
        setLoading(true)
        setError(null)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const response = await api.post('/doctor-profile/upload-signature', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })
            // Refresh profile to get new URL
            await getProfile()
            return response.data.url
        } catch (err: any) {
            setError(mensajeDeError(err, 'No se pudo subir la firma.'))
            return null
        } finally {
            setLoading(false)
        }
    }

    return {
        profile,
        loading,
        error,
        getProfile,
        updateProfile,
        uploadLogo,
        uploadSignature,
    }
}
