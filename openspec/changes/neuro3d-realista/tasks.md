# Tareas · neuro3d-realista

## 1. Preparación
- [x] 1.1 Rama `feat/neuro3d-realista` desde `develop` (8cc9d2f), anotada en COORDINACION.md
- [x] 1.2 Propuesta y tareas de este cambio

## 2. Calidad
- [ ] 2.1 `dominio/calidad.ts`: capacidad del equipo, calidad inicial, preferencia por usuario y monitor de fps (puro, con pruebas)
- [ ] 2.2 Interruptor «Estándar | Realista» en la escena, con su motivo si no está disponible
- [ ] 2.3 Caída automática a Estándar con aviso; la elección del médico manda después

## 3. Materiales y luz
- [ ] 3.1 `servicios/materiales/`: tejidos, tokens `--cx-anat-real-*`, texturas generadas y triplanar
- [ ] 3.2 Materiales por tejido en la escena (también las mallas del paciente)
- [ ] 3.3 Entorno, tone mapping AgX y luz de estudio en Realista
- [ ] 3.4 Posproceso: GTAO a media resolución (sólo lo opaco), SMAA, OutputPass; GTAO apagado al mover
- [ ] 3.5 Liberar composer, pases y texturas

## 4. Geometría
- [ ] 4.1 Encéfalo: circunvoluciones más finas en Realista
- [ ] 4.2 Vértebras: carillas, agujeros transversos cervicales, láminas y apófisis
- [ ] 4.3 Sistema venoso (`anatomia/venas.ts`), capa «Venas y senos» y catálogo

## 5. Pantalla, documentación y pruebas
- [ ] 5.1 Página: calidad en la clave de escena, cámara conservada
- [ ] 5.2 Recorrido `neuro-3d` (versión nueva), DESIGN §4.17, CHANGELOG
- [ ] 5.3 Pruebas: capacidad y caída, interruptor y preferencia, catálogo venoso, materiales por tejido
- [ ] 5.4 tsc, vitest completo, build y tamaño de los paquetes
- [ ] 5.5 Revisión visual Estándar contra Realista (anterior, lateral, base con Willis y venas, columna, raíz L5)
