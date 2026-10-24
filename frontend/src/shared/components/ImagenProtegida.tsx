import { useEffect, useState } from 'react'

import api from '../services/api'

/**
 * Muestra una imagen que el servidor solo entrega con autenticación.
 *
 * Una etiqueta `<img src="...">` no puede enviar la cabecera Authorization,
 * así que el navegador recibía 401 y pintaba el icono de imagen rota. Aquí se
 * descarga con el cliente de API (que sí manda el token) y se muestra desde
 * memoria.
 */
interface Props {
    /** Ruta relativa que devuelve el backend, p. ej. /doctor-profile/files/x.png */
    url?: string | null
    alt: string
    style?: React.CSSProperties
    className?: string
}

const ImagenProtegida = ({ url, alt, style, className }: Props) => {
    const [src, setSrc] = useState<string | null>(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!url) {
            setSrc(null)
            return
        }

        let cancelado = false
        let objectUrl: string | null = null
        setError(false)
        setSrc(null)

        api.get(url, { responseType: 'blob' })
            .then((respuesta) => {
                if (cancelado) return
                objectUrl = URL.createObjectURL(respuesta.data)
                setSrc(objectUrl)
            })
            .catch(() => {
                if (!cancelado) setError(true)
            })

        return () => {
            cancelado = true
            // Sin esto el navegador retiene el blob mientras viva la pestaña.
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [url])

    if (!url) return null
    if (error) {
        return (
            <span className="text-danger small">
                No se pudo cargar la imagen. Vuelve a subirla.
            </span>
        )
    }
    if (!src) return <span className="text-body-secondary small">Cargando…</span>

    return <img src={src} alt={alt} style={style} className={className} />
}

export default ImagenProtegida
