/**
 * Llamadas al servidor del ajuste de columna desde radiografías.
 *
 * Las mediciones que se guardan las calcula el servidor; la respuesta trae las
 * suyas y la pantalla muestra ésas, no las que sugirió mientras se marcaba.
 */
import { apiClient } from '../../../shared/services/api'
import { estudiosApi } from '../../imagen/servicios/estudiosApi'
import type { CalibracionesRx, MarcasRx, OpcionesRx, ResultadoRx } from '../dominio/ajusteRadiografico'

export type TipoDeOrigen = 'imagen_clinica' | 'serie_dicom'

export interface OrigenDeVista {
  tipo: TipoDeOrigen
  id: number
}

export interface AjusteRxGuardado {
  id: number
  patient_id: number
  doctor_id: number
  lateral_origen: TipoDeOrigen | null
  lateral_origen_id: number | null
  ap_origen: TipoDeOrigen | null
  ap_origen_id: number | null
  puntos: MarcasRx
  calibracion: CalibracionesRx
  opciones: OpcionesRx
  mediciones: ResultadoRx
  version_calculo: string
  notas: string | null
  created_at: string
  anulado_at: string | null
  anulado_motivo: string | null
}

/** Una radiografía que se puede marcar: una foto del expediente o una serie CR/DX. */
export interface FuenteRx {
  origen: OrigenDeVista
  titulo: string
  fecha: string
  /** Sólo en DICOM: el espaciado del píxel que trae la serie, en mm (x = columna). */
  espaciado: { x: number; y: number } | null
}

const MODALIDADES_RX = ['CR', 'DX']

interface FotoDelExpediente {
  id: number
  caption: string | null
  file_name: string
  taken_at: string
  mime_type: string
}

export const columnaRxApi = {
  async listar(patientId: number, incluirAnulados = true): Promise<AjusteRxGuardado[]> {
    const { data } = await apiClient.get<AjusteRxGuardado[]>(`/patients/${patientId}/columna-rx`, {
      params: { incluir_anulados: incluirAnulados },
    })
    return data
  },

  /** El ajuste vigente más reciente, el que dibuja Neuro 3D; `null` si no hay. */
  async vigente(patientId: number): Promise<AjusteRxGuardado | null> {
    const lista = await columnaRxApi.listar(patientId, false)
    return lista[0] ?? null
  },

  async guardar(
    patientId: number,
    datos: {
      lateral: OrigenDeVista | null
      ap: OrigenDeVista | null
      puntos: MarcasRx
      calibracion: CalibracionesRx
      opciones: OpcionesRx
      notas?: string | null
    },
  ): Promise<AjusteRxGuardado> {
    const { data } = await apiClient.post<AjusteRxGuardado>(`/patients/${patientId}/columna-rx`, datos)
    return data
  },

  async anular(patientId: number, ajusteId: number, motivo: string): Promise<AjusteRxGuardado> {
    const { data } = await apiClient.post<AjusteRxGuardado>(`/patients/${patientId}/columna-rx/${ajusteId}/anular`, { motivo })
    return data
  },

  /** Fotos del expediente y series CR/DX del paciente, de la más reciente a la más antigua. */
  async fuentes(patientId: number): Promise<FuenteRx[]> {
    const [fotos, estudios] = await Promise.all([
      apiClient
        .get<FotoDelExpediente[]>(`/clinical-images/patient/${patientId}`, { params: { limit: 60 } })
        .then((r) => r.data)
        .catch(() => [] as FotoDelExpediente[]),
      estudiosApi.listar(patientId).catch(() => []),
    ])
    const deFotos: FuenteRx[] = fotos
      .filter((f) => f.mime_type.startsWith('image/'))
      .map((f) => ({
        origen: { tipo: 'imagen_clinica', id: f.id },
        titulo: `Foto · ${f.caption || f.file_name}`,
        fecha: f.taken_at,
        espaciado: null,
      }))
    const radiografias = estudios.filter((e) => MODALIDADES_RX.includes((e.modality || '').toUpperCase()))
    const detalles = await Promise.all(radiografias.map((e) => estudiosApi.detalle(e.id).catch(() => null)))
    const deDicom: FuenteRx[] = []
    for (const e of detalles) {
      if (!e) continue
      for (const s of e.series ?? []) {
        if (!MODALIDADES_RX.includes((s.modality || '').toUpperCase())) continue
        deDicom.push({
          origen: { tipo: 'serie_dicom', id: s.id },
          titulo: `${s.modality} · ${s.series_description || e.study_description || 'Radiografía'}`,
          fecha: e.study_date,
          // La ingesta guarda PixelSpacing[0] (filas) en _x y [1] (columnas) en _y.
          espaciado: s.pixel_spacing_x && s.pixel_spacing_y ? { x: s.pixel_spacing_y, y: s.pixel_spacing_x } : null,
        })
      }
    }
    return [...deFotos, ...deDicom].sort((a, b) => b.fecha.localeCompare(a.fecha))
  },

  async foto(imagenId: number): Promise<Blob> {
    const { data } = await apiClient.get(`/clinical-images/${imagenId}/download`, { responseType: 'blob' })
    return data as Blob
  },
}
