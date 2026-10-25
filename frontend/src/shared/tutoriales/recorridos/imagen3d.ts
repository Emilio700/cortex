/**
 * Recorridos del render volumétrico del estudio (feat/render-volumetrico).
 *
 * En archivo propio para no chocar con `neuro3d.ts`, que tocan otras ramas.
 * Como todos, no arranca solo: se pide desde el centro de ayuda. Los pasos de
 * los controles aparecen aunque el volumen siga cargando (sólo están
 * deshabilitados); si el equipo no puede pintar 3D, la escena dice por qué.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

const CLINICO = [Role.DOCTOR, Role.ADMIN, Role.MASTER]

export const RECORRIDOS_IMAGEN_3D: Recorrido[] = [
  {
    id: 'ver-estudio-en-3d',
    version: 1,
    titulo: 'Ver el estudio en 3D',
    resumen: 'Abre la TC o RM que estás viendo pintada en volumen: hueso, vasos con contraste o piel.',
    grupo: 'Consulta médica',
    ruta: '/pacientes/:patientId/estudios/:studyId',
    requiere: ['clinical_images.read'],
    roles: CLINICO,
    comoLlegar: 'Abre una tomografía o resonancia del paciente desde la pestaña Imágenes de su expediente.',
    pasos: [
      {
        elemento: 'visor-ver-3d',
        titulo: 'Ver en 3D',
        texto:
          '<b>Ver en 3D</b> pinta en volumen la serie que estás viendo. Sólo se habilita si la serie forma un volumen (TC o RM con cortes suficientes, paralelos y a la misma distancia); si no, dice por qué al lado del botón.',
        lado: 'bottom',
      },
    ],
  },
  {
    id: 'render-3d-del-estudio',
    version: 1,
    titulo: '3D del estudio',
    resumen: 'Preajustes, umbral, recorte y captura del render volumétrico de una TC o RM.',
    grupo: 'Consulta médica',
    ruta: '/pacientes/:patientId/estudios/:studyId/3d/:serieId',
    requiere: ['clinical_images.read'],
    roles: CLINICO,
    comoLlegar: 'En el visor de una TC o RM del paciente, pulsa «Ver en 3D». También desde Neuro 3D, con «Ver el estudio en 3D».',
    pasos: [
      {
        elemento: 'vol3d-aviso',
        titulo: 'Es el estudio, pintado',
        texto:
          'Esto es el estudio original en volumen, sin IA. Lo que ves depende del preajuste y del umbral: un vaso fino puede desaparecer o un hueso verse roto. <b>Aquí no se mide</b>; para medir y decidir, usa los cortes del visor.',
        lado: 'bottom',
      },
      {
        elemento: 'vol3d-escena',
        titulo: 'Gira, mueve y acerca',
        texto:
          'Arrastra con el botón izquierdo para girar (o con un dedo en la tableta). El botón central mueve y el derecho o la rueda acercan. Mientras carga, la barra dice cuántos cortes van; si la tarjeta no alcanza, te ofrece <b>Reducir resolución</b>.',
        lado: 'left',
      },
      {
        elemento: 'vol3d-preajuste',
        titulo: 'Preajuste',
        texto:
          'Elige qué quieres ver: <b>Hueso</b>, <b>Angio-TC</b> para vasos con contraste, <b>Piel</b> o <b>Tejidos blandos</b>. En una RM salen los de RM.',
        lado: 'left',
      },
      {
        elemento: 'vol3d-umbral',
        titulo: 'Umbral, opacidad e iluminación',
        texto:
          'El umbral mueve qué densidades se vuelven visibles y la opacidad las hace más o menos sólidas. La <b>iluminación cinematográfica</b> agrega sombras suaves; pide más a la tarjeta.',
        lado: 'left',
      },
      {
        elemento: 'vol3d-recorte',
        titulo: 'Recorte',
        texto:
          'Quita una parte del volumen para «abrir» el cráneo o la columna: axial desde arriba, sagital desde la izquierda del paciente, coronal desde delante. «Desde el otro lado» invierte el lado.',
        lado: 'left',
      },
      {
        elemento: 'vol3d-capturar',
        titulo: 'Captura',
        texto:
          'Descarga un PNG con el estudio, la serie, el preajuste y el recorte, <b>sin el nombre del paciente</b>. <b>Restablecer</b> regresa la vista y quita el recorte.',
        lado: 'left',
      },
    ],
  },
]
