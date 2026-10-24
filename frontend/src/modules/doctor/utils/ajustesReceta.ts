/**
 * Configuración de la receta, por doctor.
 *
 * El backend manda y recibe este mismo juego de interruptores
 * (`backend/app/utils/receta_config.py`). Aquí solo se dibuja: la vista previa
 * es el **PDF de verdad** generado por el servidor, así que esta pantalla no
 * puede contradecir a `pdf.py` — no reimplementa el dibujo de la receta.
 */

export interface AjustesReceta {
    mostrar_logo: boolean
    mostrar_firma: boolean
    mostrar_nombre: boolean
    mostrar_especialidad: boolean
    mostrar_cedula_profesional: boolean
    mostrar_registro_general: boolean
    mostrar_cedula_especialidad: boolean
    mostrar_registro_ssa: boolean
    mostrar_consejo: boolean
    mostrar_edad: boolean
    mostrar_fecha_nacimiento: boolean
    mostrar_alergias: boolean
    mostrar_signos_vitales: boolean
    mostrar_direccion: boolean
    mostrar_telefono: boolean
    /** Plan 26, tercera ronda: apagados de fábrica para no cambiar ninguna receta. */
    mostrar_celular: boolean
    mostrar_correo: boolean
    mostrar_pie_legal: boolean
}

export type ClaveAjusteReceta = keyof AjustesReceta

/** Los mismos valores de fábrica que aplica el backend. */
export const AJUSTES_RECETA_POR_DEFECTO: AjustesReceta = {
    mostrar_logo: true,
    mostrar_firma: true,
    mostrar_nombre: true,
    mostrar_especialidad: false,
    mostrar_cedula_profesional: false,
    mostrar_registro_general: true,
    mostrar_cedula_especialidad: true,
    mostrar_registro_ssa: true,
    mostrar_consejo: true,
    mostrar_edad: true,
    mostrar_fecha_nacimiento: true,
    mostrar_alergias: true,
    mostrar_signos_vitales: false,
    mostrar_direccion: true,
    mostrar_telefono: true,
    mostrar_celular: false,
    mostrar_correo: false,
    mostrar_pie_legal: true,
}

export interface OpcionReceta {
    clave: ClaveAjusteReceta
    etiqueta: string
    /** Una línea explicando qué se ve o se deja de ver. */
    ayuda?: string
    /** Aviso en ámbar: se puede apagar, pero conviene saber qué implica. */
    aviso?: string
}

export interface GrupoReceta {
    titulo: string
    descripcion: string
    opciones: OpcionReceta[]
}

const AVISO_LEGAL =
    'El nombre y la cédula de quien receta son obligatorios en una receta (Art. 64 del Reglamento de Insumos para la Salud). Si tu imagen de firma ya los incluye, puedes dejarlo apagado.'

export const GRUPOS_RECETA: GrupoReceta[] = [
    {
        titulo: 'Encabezado',
        descripcion: 'Lo que aparece arriba, junto a tu logo y tu firma.',
        opciones: [
            { clave: 'mostrar_logo', etiqueta: 'Logo del consultorio', ayuda: 'También es la marca de agua del cuadro de tratamiento.' },
            { clave: 'mostrar_firma', etiqueta: 'Imagen de firma', ayuda: 'Si la apagas, se imprime tu nombre en su lugar.' },
            { clave: 'mostrar_nombre', etiqueta: 'Tu nombre', ayuda: 'Solo se imprime cuando no hay imagen de firma.', aviso: AVISO_LEGAL },
            { clave: 'mostrar_especialidad', etiqueta: 'Especialidad' },
            { clave: 'mostrar_cedula_profesional', etiqueta: 'Cédula profesional', aviso: AVISO_LEGAL },
            { clave: 'mostrar_registro_general', etiqueta: 'R.G.P.' },
            { clave: 'mostrar_cedula_especialidad', etiqueta: 'Cédula de especialidad' },
            { clave: 'mostrar_registro_ssa', etiqueta: 'Registro SSA' },
            { clave: 'mostrar_consejo', etiqueta: 'Consejo / CONACEM' },
        ],
    },
    {
        titulo: 'Datos de la paciente',
        descripcion:
            'Solo lo necesario para saber de quién es la receta. El número de expediente, el motivo de consulta y las notas de la consulta ya no se imprimen.',
        opciones: [
            { clave: 'mostrar_fecha_nacimiento', etiqueta: 'Fecha de nacimiento' },
            { clave: 'mostrar_edad', etiqueta: 'Edad' },
            {
                clave: 'mostrar_alergias',
                etiqueta: 'Alergias',
                aviso: 'Es lo que impide que en la farmacia le den algo a lo que es alérgica. Apágalo solo si sabes lo que haces.',
            },
            {
                clave: 'mostrar_signos_vitales',
                etiqueta: 'Signos vitales',
                ayuda: 'Peso, talla, T/A y temperatura de la consulta. Apagados de origen: son del expediente.',
            },
        ],
    },
    {
        titulo: 'Pie de página',
        descripcion: 'Cómo te localiza la paciente.',
        opciones: [
            { clave: 'mostrar_direccion', etiqueta: 'Dirección del consultorio' },
            { clave: 'mostrar_telefono', etiqueta: 'Teléfono del consultorio' },
            { clave: 'mostrar_celular', etiqueta: 'Celular / WhatsApp', ayuda: 'El que capturas en tus datos profesionales.' },
            { clave: 'mostrar_correo', etiqueta: 'Correo de contacto', ayuda: 'El que capturas en tus datos profesionales.' },
            { clave: 'mostrar_pie_legal', etiqueta: 'Leyenda del consultorio', ayuda: '«Cuidamos tu salud, acompañamos tu vida.»' },
        ],
    },
]

/**
 * Lo guardado sobre los valores de fábrica.
 *
 * Un perfil que nunca tocó la configuración llega con `null`, y una versión
 * anterior puede llegar a medias: la pantalla necesita el juego completo o
 * pintaría interruptores apagados que en el PDF salen encendidos.
 */
export const combinarAjustes = (guardados?: Partial<AjustesReceta> | null): AjustesReceta => {
    const resultado = { ...AJUSTES_RECETA_POR_DEFECTO }
    if (!guardados) return resultado
    ;(Object.keys(AJUSTES_RECETA_POR_DEFECTO) as ClaveAjusteReceta[]).forEach((clave) => {
        const valor = guardados[clave]
        if (typeof valor === 'boolean') resultado[clave] = valor
    })
    return resultado
}

/** ¿El nombre escrito ya trae "Dra." delante? Misma regla que el backend. */
export const tieneTratamiento = (nombre: string): boolean =>
    /^\s*(dr|dra|doctor|doctora|lic|mtro|mtra|q\.f\.b|m\.c|md)\.?\s/i.test(nombre || '')

/**
 * El nombre tal como se imprimirá, para decirlo en la pantalla sin tener que
 * generar el PDF. Si no se escribe nada, manda el nombre de la cuenta.
 *
 * Si el nombre no trae tratamiento escrito se antepone el de la cuenta
 * ("Dra."), y si la cuenta no tiene, va el nombre solo: misma regla que
 * `nombre_para_receta` en el backend.
 */
export const nombreImpreso = (
    configurado: string,
    nombreDeLaCuenta: string,
    tratamientoDeLaCuenta?: string | null,
): string => {
    const elegido = (configurado || '').trim() || (nombreDeLaCuenta || '').trim()
    if (!elegido) return ''
    if (tieneTratamiento(elegido)) return elegido
    const tratamiento = (tratamientoDeLaCuenta || '').trim()
    return tratamiento ? `${tratamiento} ${elegido}` : elegido
}

// ---------------------------------------------------------------------------
// Estilo propio: leyenda, color y tipografía de la firma
//
// Espejo de `backend/app/utils/receta_config.py`. La vista previa es el PDF de
// verdad que genera el servidor, así que aquí solo se dibujan los controles:
// los valores de fábrica tienen que ser los mismos o la pantalla mentiría
// antes de guardar nada.
// ---------------------------------------------------------------------------

export const LEYENDA_POR_DEFECTO = 'CUIDAMOS TU SALUD, ACOMPAÑAMOS TU VIDA.'
export const LIMITE_LEYENDA = 150

export const COLOR_ACENTO_POR_DEFECTO = '#8B2E83'
/** El gris con el que se imprime el nombre si no se elige color. */
export const COLOR_FIRMA_POR_DEFECTO = '#404040'

export const TAMANO_FIRMA_MIN = 10
export const TAMANO_FIRMA_MAX = 26

export type FuenteFirma = 'sans' | 'serif' | 'cursiva'

export interface EstiloFirma {
    fuente: FuenteFirma
    tamano: number
    negritas: boolean
    cursiva: boolean
    /** `null` es el gris del membrete, no un color elegido. */
    color: string | null
    /** Raya bajo el nombre, para firmar a mano encima. */
    linea_firma: boolean
}

export const ESTILO_FIRMA_POR_DEFECTO: EstiloFirma = {
    fuente: 'sans',
    tamano: 15,
    negritas: true,
    cursiva: false,
    color: null,
    linea_firma: false,
}

export const FUENTES_FIRMA: { valor: FuenteFirma; etiqueta: string }[] = [
    { valor: 'sans', etiqueta: 'Sencilla' },
    { valor: 'serif', etiqueta: 'Con remates' },
    { valor: 'cursiva', etiqueta: 'Cursiva, como una firma' },
]

/** Un color que el servidor vaya a aceptar: #RRGGBB. */
export const esColorValido = (valor: string): boolean =>
    /^#?[0-9a-fA-F]{6}$/.test((valor || '').trim())

/** Normaliza a `#RRGGBB` en mayúsculas, o `null` si no se entiende. */
export const normalizarColor = (valor?: string | null): string | null => {
    const limpio = (valor || '').trim()
    if (!esColorValido(limpio)) return null
    return `#${limpio.replace('#', '').toUpperCase()}`
}

/** La leyenda efectiva: la escrita o la de fábrica. Vacía no es una leyenda. */
export const combinarLeyenda = (guardada?: string | null): string =>
    (guardada || '').trim() || LEYENDA_POR_DEFECTO

/** El color efectivo del membrete. */
export const combinarColor = (guardado?: string | null): string =>
    normalizarColor(guardado) || COLOR_ACENTO_POR_DEFECTO

/**
 * El estilo de firma completo.
 *
 * Un valor que no se entiende se descarta y manda el de fábrica: la pantalla
 * no puede pintar un tamaño de letra que sea texto, ni guardarlo.
 */
export const combinarEstiloFirma = (guardado?: Partial<EstiloFirma> | null): EstiloFirma => {
    const resultado = { ...ESTILO_FIRMA_POR_DEFECTO }
    if (!guardado || typeof guardado !== 'object') return resultado

    if (FUENTES_FIRMA.some((f) => f.valor === guardado.fuente)) {
        resultado.fuente = guardado.fuente as FuenteFirma
    }
    if (typeof guardado.tamano === 'number' && Number.isFinite(guardado.tamano)) {
        resultado.tamano = Math.min(
            Math.max(Math.round(guardado.tamano), TAMANO_FIRMA_MIN),
            TAMANO_FIRMA_MAX,
        )
    }
    for (const clave of ['negritas', 'cursiva', 'linea_firma'] as const) {
        if (typeof guardado[clave] === 'boolean') resultado[clave] = guardado[clave] as boolean
    }
    const color = normalizarColor(guardado.color)
    if (color) resultado.color = color

    return resultado
}
