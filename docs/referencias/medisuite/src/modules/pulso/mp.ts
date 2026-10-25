// Carga de MediaPipe Tasks Vision desde archivos propios (/public/mediapipe y /public/models), sin CDN.
// Compartido por los módulos pulso y goniometro.
import type { FaceDetector, PoseLandmarker } from '@mediapipe/tasks-vision'
import { asset } from '../../lib/utils'

async function fileset() {
  const { FilesetResolver } = await import('@mediapipe/tasks-vision')
  return FilesetResolver.forVisionTasks(asset('mediapipe'))
}

/** Intenta con GPU y, si falla, con CPU. */
async function conDelegado<T>(crear: (d: 'GPU' | 'CPU') => Promise<T>): Promise<{ task: T; delegado: 'GPU' | 'CPU' }> {
  try {
    return { task: await crear('GPU'), delegado: 'GPU' }
  } catch (e) {
    console.warn('MediaPipe GPU no disponible, usando CPU', e)
    return { task: await crear('CPU'), delegado: 'CPU' }
  }
}

export async function crearFaceDetector() {
  const [vision, mod] = await Promise.all([fileset(), import('@mediapipe/tasks-vision')])
  return conDelegado<FaceDetector>((delegate) =>
    mod.FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: asset('models/blaze_face_short_range.tflite'), delegate },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
    }),
  )
}

export async function crearPoseLandmarker() {
  const [vision, mod] = await Promise.all([fileset(), import('@mediapipe/tasks-vision')])
  return conDelegado<PoseLandmarker>((delegate) =>
    mod.PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: asset('models/pose_landmarker_lite.task'), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
  )
}

/** Detiene todas las pistas de un MediaStream. */
export function detener(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop())
}

export const hayCamara = () => !!navigator.mediaDevices?.getUserMedia
