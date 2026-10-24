import type { AjustesReceta, EstiloFirma } from '../utils/ajustesReceta'
import type { AjustesOrden } from '../utils/ajustesOrden'

export interface Specialty {
    id: number
    name: string
    slug: string
    description?: string
    is_active: boolean
}

export interface DoctorProfile {
    id: number
    user_id: number
    specialty_id: number
    specialty: Specialty
    professional_id: string
    university?: string
    phone?: string
    clinic_address?: string
    /** Correo para imprimir; distinto del de inicio de sesión (plan 26, 3.ª ronda). */
    contact_email?: string | null
    /** Celular o WhatsApp para imprimir. */
    mobile_phone?: string | null
    logo_url?: string
    signature_url?: string
    general_registry?: string
    specialty_license?: string
    health_registry?: string
    council_cert?: string
    /** Nombre tal como debe imprimirse en la receta. */
    prescription_display_name?: string | null
    /** Qué se imprime en la receta y qué no. */
    prescription_settings?: AjustesReceta
    /** Leyenda del pie; siempre llega completa desde el servidor. */
    prescription_footer_text?: string
    /** Color del membrete (#RRGGBB). */
    prescription_accent_color?: string
    /** Tipografía del bloque de la firma. */
    prescription_signature_style?: EstiloFirma
    /** Lo propio de la orden de estudio (plan 26, D-7); el membrete es el de la receta. */
    order_settings?: AjustesOrden
}

export interface DoctorProfileUpdate {
    specialty_id?: number
    professional_id?: string
    university?: string
    phone?: string
    clinic_address?: string
    /** Correo para imprimir; distinto del de inicio de sesión (plan 26, 3.ª ronda). */
    contact_email?: string | null
    /** Celular o WhatsApp para imprimir. */
    mobile_phone?: string | null
    logo_url?: string
    signature_url?: string
    general_registry?: string
    specialty_license?: string
    health_registry?: string
    council_cert?: string
    prescription_display_name?: string | null
    prescription_settings?: AjustesReceta
    prescription_footer_text?: string | null
    prescription_accent_color?: string | null
    prescription_signature_style?: EstiloFirma | null
    /** Se manda completo: el servidor lo guarda tal cual. */
    order_settings?: AjustesOrden
}
