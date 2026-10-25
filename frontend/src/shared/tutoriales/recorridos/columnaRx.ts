/**
 * Recorrido de «Columna desde radiografía» (feat/columna-desde-radiografias).
 *
 * Como todos, no arranca solo: se pide desde el centro de ayuda. Vive en la
 * pantalla de marcado, que cuelga del paciente; el centro dice cómo llegar.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

export const RECORRIDOS_COLUMNA_RX: Recorrido[] = [
  {
    id: 'columna-radiografia',
    version: 2,
    titulo: 'Columna desde radiografía',
    resumen:
      'Marca puntos sobre la lateral y la AP del paciente para medir sus curvas y ajustar la columna de Neuro 3D a ellas.',
    grupo: 'Consulta médica',
    ruta: '/pacientes/:patientId/neuro-3d/radiografia',
    requiere: ['spine_rx.write'],
    roles: [Role.DOCTOR, Role.MASTER],
    comoLlegar:
      'Abre el expediente del paciente, pestaña Imágenes → Neuro 3D → «Marcar radiografías».',
    pasos: [
      {
        elemento: 'rx-aviso',
        titulo: 'Una aproximación, no la anatomía del paciente',
        texto:
          'Las medidas doblan la columna <b>esquemática</b>: la forma de cada vértebra sigue siendo la del modelo. Si la radiografía es una foto de la placa, tómala de frente: una foto en ángulo deforma los ángulos.',
        lado: 'bottom',
      },
      {
        elemento: 'rx-vistas',
        titulo: 'Lateral y AP',
        texto:
          'Cada vista se marca por separado. La <b>lateral</b> da la lordosis, la cifosis, la listesis, la altura de los discos y la pelvis; la <b>AP</b>, el Cobb de una escoliosis.',
        lado: 'bottom',
      },
      {
        elemento: 'rx-fuente',
        titulo: 'Elige la radiografía',
        texto:
          'Una foto del expediente o una serie DICOM de radiografía (CR o DX). Si no está, súbela en la pestaña Imágenes del expediente.',
        lado: 'right',
      },
      {
        elemento: 'rx-escala',
        titulo: 'Escala',
        texto:
          'Una foto no trae escala: sin ella sólo hay ángulos y proporciones. Para ver milímetros marca una <b>distancia conocida</b> o, en DICOM, usa el espaciado del píxel. Las mediciones dicen cuál se usó.',
        lado: 'right',
      },
      {
        elemento: 'rx-paso',
        titulo: 'El punto que toca',
        texto:
          'Aquí dice qué esquina marcar y dónde está. Al tocar aparece una <b>lupa</b>: mientras no levantes el dedo puedes afinar el punto.',
        lado: 'bottom',
      },
      {
        elemento: 'rx-herramientas',
        titulo: 'Corregir sin empezar de nuevo',
        texto:
          '<b>Deshacer</b> quita lo último; <b>Saltar punto</b> sigue con el siguiente cuando una esquina no se ve; arrastra cualquier punto para moverlo. <b>Mover imagen</b> desplaza la placa sin marcar.',
        lado: 'bottom',
      },
      {
        elemento: 'rx-mediciones',
        titulo: 'Mediciones en vivo',
        texto:
          'Se calculan mientras marcas, como <b>sugerencia</b>, con su fuente. En la AP el sistema elige las vértebras límite del Cobb y tú puedes cambiarlas.',
        lado: 'left',
      },
      {
        elemento: 'rx-guardar',
        titulo: 'Guardar y verlo en 3D',
        texto:
          'Al guardar, el servidor vuelve a calcular las mediciones; solo dice «Guardado» cuando lo confirmó, y te avisa si sus números no coinciden con la sugerencia. Luego <b>Ver en Neuro 3D</b> abre el modelo con el origen «Radiografía».',
        lado: 'left',
      },
    ],
  },
]
