/**
 * Recorrido del Neuro 3D (tramo C).
 *
 * Como todos, no arranca solo: se pide desde el centro de ayuda. Los pasos de
 * la escena (vistas, separar vértebras) sólo aparecen cuando el modelo terminó
 * de cargar; si el equipo no tiene gráficos 3D, esos pasos se saltan solos.
 *
 * Modelo 3D desde TC (feat/modelo-3d-desde-tc): el paso «Origen del modelo»
 * sólo aparece con un paciente en contexto, y el del modelo del paciente sólo
 * cuando su TC ya se ve; si no, se saltan solos. El recorrido del visor
 * («Modelo 3D desde la tomografía») vive aquí porque termina en Neuro 3D.
 *
 * Modo realista (feat/neuro3d-realista): paso «Calidad» (junto a los botones
 * de la escena, sólo con el modelo cargado) y venas y senos en las capas.
 *
 * Atlas detallado (feat/neuro3d-atlas): «Modelo» (simplificado o atlas
 * BodyParts3D) se ve siempre; el pie de créditos, también.
 *
 * Versión 5: une los pasos de las dos ramas (calidad, venas, atlas y créditos)
 * y la calidad dice que en Realista el atlas también toma el material de cada
 * tejido.
 */
import { Role } from '../../types'
import type { Recorrido } from '../tipos'

const CLINICO = [Role.DOCTOR, Role.ADMIN, Role.MASTER]

export const RECORRIDOS_NEURO3D: Recorrido[] = [
  {
    id: 'neuro-3d',
    version: 5,
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
          'Este aviso dice siempre de dónde sale lo que ves. Por omisión es un modelo <b>esquemático</b>: no es la anatomía de tu paciente ni sustituye su estudio de imagen. Sirve para enseñarle dónde está su lesión y qué hace la cirugía.',
        lado: 'bottom',
      },
      {
        elemento: 'atlas-origen',
        titulo: 'Origen del modelo',
        texto:
          'Con un paciente en contexto eliges de dónde sale la columna: el modelo <b>esquemático</b>, el ajustado desde su <b>radiografía</b> o la <b>tomografía del paciente</b> (una reconstrucción automática de su TC). Lo que no está disponible aparece deshabilitado y dice por qué. Si puedes marcar radiografías, <b>Marcar radiografías</b> abre la herramienta para medirlas.',
        lado: 'bottom',
      },
      {
        elemento: 'atlas-detalle',
        titulo: 'Modelo simplificado o atlas detallado',
        texto:
          'El <b>simplificado</b> lo dibuja Cortex y carga al instante. El <b>atlas detallado</b> usa mallas reales (BodyParts3D) de una <b>persona de referencia</b>, no de tu paciente: giros, huesos del cráneo y vértebras con su forma real. Se descarga al elegirlo y sólo se usa con el origen esquemático. Si el servidor no lo tiene instalado, la opción aparece deshabilitada y dice por qué.',
        lado: 'bottom',
      },
      {
        elemento: 'atlas-modelo-paciente',
        titulo: 'La tomografía del paciente',
        texto:
          'Dice de qué estudio salió, con qué motor y si alguien ya la revisó. Es una reconstrucción automática: compárala con las imágenes originales y usa <b>Marcar como revisada</b> cuando lo hayas hecho. Tocar una raíz enciende la vértebra <b>del paciente</b>; las raíces, los discos y el encéfalo siguen siendo esquemáticos.',
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
          'Enciende o apaga piel, cráneo, encéfalo, ventrículos, arterias, venas y senos, columna, médula y raíces, y ajusta la opacidad de cada una. Las <b>vías principales</b> son un trazo esquemático, no una tractografía.',
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
        elemento: 'atlas-calidad',
        titulo: 'Calidad: Estándar o Realista',
        texto:
          '<b>Estándar</b> es el modelo didáctico, con un color por lóbulo. <b>Realista</b> pinta cada tejido como en una pieza anatómica (hueso, encéfalo, arterias y venas), con más detalle y sombras suaves. Debajo dice si este equipo puede con Realista; si se pone lento, baja solo a Estándar y te deja <b>reintentar</b>. Con el atlas detallado, Realista también pinta sus mallas con el material de cada tejido. Tu elección se recuerda. Ninguna de las dos es la anatomía de tu paciente.',
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
          'Descarga un PNG con la vista, la silueta y el aviso del origen del modelo (esquemático, aproximación desde radiografía o reconstrucción de su TC), sin el nombre del paciente. Con el atlas detallado, la imagen lleva también su crédito. Si abriste Neuro 3D desde la pestaña <b>Imágenes</b> del expediente, también puedes <b>guardarla en el expediente</b> (con su consentimiento); solo dice «guardado» cuando el sistema lo confirmó.',
        lado: 'bottom',
      },
      {
        elemento: 'atlas-creditos',
        titulo: 'Créditos',
        texto:
          'Al pie, <b>Créditos</b> se despliega con la atribución de lo que se está viendo: el motor 3D y, con el atlas detallado, BodyParts3D con el texto que pide su licencia.',
        lado: 'top',
      },
    ],
  },
  {
    id: 'modelo-3d-desde-tc',
    version: 1,
    titulo: 'Modelo 3D desde la tomografía',
    resumen: 'Arma la columna 3D del paciente desde su TC y ábrela en Neuro 3D.',
    grupo: 'Consulta médica',
    ruta: '/pacientes/:patientId/estudios/:studyId',
    // El mismo permiso que abre el visor. Generar pide además
    // neuro3d.generar_modelo; sin él, el paso muestra sólo el estado.
    requiere: ['clinical_images.read'],
    roles: [Role.DOCTOR, Role.ADMIN, Role.MASTER],
    comoLlegar:
      'Abre una tomografía del paciente desde la pestaña Imágenes de su expediente. Requiere que el consultorio tenga encendido el módulo «Neuro 3D del paciente».',
    pasos: [
      {
        elemento: 'visor-modelo-3d',
        titulo: 'Generar modelo 3D',
        texto:
          'Si tienes permiso, <b>Generar modelo 3D</b> manda la serie que estás viendo al segmentador, que arma las vértebras C1 a S1, la médula y el conducto. Tarda unos minutos: mientras tanto dice <b>Procesando…</b> y puedes seguir trabajando. Sólo dice <b>listo</b> cuando el servidor lo confirmó; si no se pudo, dice por qué. Con el modelo listo, <b>Ver en Neuro 3D</b> lo abre.',
        lado: 'bottom',
      },
    ],
  },
]
