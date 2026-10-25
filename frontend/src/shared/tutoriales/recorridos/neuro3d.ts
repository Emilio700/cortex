/**
 * Recorrido del Neuro 3D (tramo C).
 *
 * Como todos, no arranca solo: se pide desde el centro de ayuda. Los pasos de
 * la escena (vistas, separar vértebras) sólo aparecen cuando el modelo terminó
 * de cargar; si el equipo no tiene gráficos 3D, esos pasos se saltan solos.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

const CLINICO = [Role.DOCTOR, Role.ADMIN, Role.MASTER]

export const RECORRIDOS_NEURO3D: Recorrido[] = [
  {
    id: 'neuro-3d',
    version: 1,
    titulo: 'Neuro 3D',
    resumen:
      'Encéfalo y columna en 3D para explicarle al paciente su lesión: capas, vistas, raíces con su dermatoma y captura.',
    grupo: 'Consulta médica',
    ruta: '/imagen/neuro-3d',
    requiere: ['neuro3d.read'],
    roles: CLINICO,
    irA: { ruta: '/imagen/neuro-3d', nombre: 'Neuro 3D' },
    pasos: [
      {
        elemento: 'atlas-aviso',
        titulo: 'Un modelo para explicar',
        texto:
          'Neuro 3D es un modelo <b>esquemático</b>: no es la anatomía de tu paciente ni sustituye su estudio de imagen. Sirve para enseñarle dónde está su lesión y qué hace la cirugía.',
        lado: 'bottom',
      },
      {
        elemento: 'atlas-escena',
        titulo: 'El modelo',
        texto:
          'Arrastra para girar, usa la rueda (o pellizca) para acercar y toca una estructura para ver qué es. Al pasar el cursor, cada pieza dice su nombre.',
        lado: 'left',
      },
      {
        elemento: 'atlas-vistas',
        titulo: 'Vistas predefinidas',
        texto:
          'Anterior, lateral, superior, sagital medio (con el corte en la línea media), columna completa, base con el polígono de Willis y posterior. También con las teclas <b>1</b> a <b>7</b>.',
        lado: 'bottom',
      },
      {
        elemento: 'atlas-buscar',
        titulo: 'Buscar una estructura',
        texto:
          'Escribe un nombre o un nivel («ínsula», «L4-L5», «raíz C6», «cola de caballo»). Al elegirla, la cámara va hacia ella.',
        lado: 'right',
      },
      {
        elemento: 'atlas-capas',
        titulo: 'Capas',
        texto:
          'Enciende o apaga piel, cráneo, encéfalo, ventrículos, vasos, columna, médula y raíces, y ajusta la opacidad de cada una. Las <b>vías principales</b> son un trazo esquemático, no una tractografía.',
        lado: 'right',
      },
      {
        elemento: 'atlas-pelado',
        titulo: 'Pelar por capas',
        texto:
          'Con el deslizador o con <b>Pelar capas</b> se van quitando la piel y el cráneo y el encéfalo se vuelve translúcido para ver ventrículos y vasos.',
        lado: 'right',
      },
      {
        elemento: 'atlas-despiece',
        titulo: 'Separar vértebras',
        texto:
          'Separa la columna para ver los discos y por dónde sale cada raíz. <b>Unir vértebras</b> la regresa.',
        lado: 'top',
      },
      {
        elemento: 'atlas-ficha',
        titulo: 'La ficha y el camino de una raíz',
        texto:
          'Al tocar una <b>raíz</b> se encienden juntos su segmento de la médula, el disco que cruza, las vértebras de su agujero y, en la silueta, la piel que siente (su dermatoma) con el punto clave de ASIA.',
        lado: 'left',
      },
      {
        elemento: 'atlas-explicar',
        titulo: 'Explicar al paciente',
        texto:
          'Marca un nivel (p. ej. «hernia L4-L5 paracentral derecha») y Neuro 3D muestra la hernia, la raíz comprimida y su dermatoma. Las marcas no se guardan solas.',
        lado: 'bottom',
      },
      {
        elemento: 'atlas-capturar',
        titulo: 'Captura',
        texto:
          'Descarga un PNG con la vista, la silueta y el aviso de modelo esquemático, sin el nombre del paciente. Si abriste Neuro 3D desde la pestaña <b>Imágenes</b> del expediente, también puedes <b>guardarla en el expediente</b> (con su consentimiento); solo dice «guardado» cuando el sistema lo confirmó.',
        lado: 'bottom',
      },
    ],
  },
]
