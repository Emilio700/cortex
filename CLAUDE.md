# GEMS — instrucciones para Claude

## Git: nunca trabajar directo en `main`

**Antes de escribir una sola línea, crea una rama.** Aplica a todas las sesiones y a
todos los agentes, sin excepción. `main` debe quedar siempre en el mismo commit que
`origin/main`.

Convención de nombres, la que ya usa el repo:

- `fix/<descripcion-corta>` — corrección de un defecto
- `feat/<descripcion-corta>` — funcionalidad nueva
- `docs/<descripcion-corta>` — sólo documentación
- `fase-<n>-<descripcion>` — lotes grandes de trabajo planeado

Una rama por unidad de trabajo entendible por sí sola, no una por sesión.

## Flujo: rama → `develop` → `main`

Decisión de Emilio al publicar la versión 1.0.0 (2026-09-29):

- **`main` es lo que está en producción**, y nada más. Solo recibe `develop` cuando ya se
  probó, y cada despliegue lleva su etiqueta de versión (`vX.Y.Z`, versionado semántico)
  en el commit que quedó desplegado.
- **`develop` es la integración.** Toda rama nace del tip vigente de `develop` y se fusiona
  de vuelta a `develop` con `--no-ff`. Ahí se juntan los cambios de las distintas sesiones
  y se verifica que funcionen juntos antes de pasar a `main`.
- Nunca fusiones una rama de trabajo directo a `main`, ni `git push --force` a `main` o
  `develop`. Las ramas fusionadas se conservan para trazabilidad.
- Pasar `develop` a `main`, etiquetar y desplegar lo autoriza Emilio, igual que el push.

## Un solo working tree compartido

Varias sesiones de Claude trabajan sobre **el mismo checkout al mismo tiempo**. Eso
tiene dos consecuencias que no son obvias:

**Ramificar no basta.** La rama es del directorio, no de tu sesión: otra sesión pudo
haberla cambiado debajo de ti entre que empezaste y que vas a commitear. Verifica con
`git branch --show-current` **justo antes de commitear**, no sólo al empezar. Y no
cambies de rama mientras otra sesión esté escribiendo.

**Nunca `git add .`.** Se traga trabajo ajeno a medio hacer y produce commits
imposibles de revisar o revertir. Siempre `git add` por ruta explícita, listando cada
archivo, y antes de commitear verifica con `git diff --cached --stat` que sólo esté
lo tuyo.

Si de verdad hacen falta dos ramas a la vez, la herramienta correcta es
`git worktree`, no otra sesión sobre el mismo directorio.

## Se trabaja en el checkout principal, rama por rama

Decisión de Emilio (2026-10-05): lo normal es trabajar **en el checkout principal**,
cambiando a la rama de cada trabajo (`git switch`). Así VS Code muestra la rama real y
el ambiente local (`localhost:3000`, que corre desde esta carpeta) enseña exactamente
lo que se está cambiando, para ir verificando cada paso antes de llegar a `develop`.

- Una tanda de cambios tiene su rama de integración (p. ej. `integracion/v1.1.1`), que
  nace del tip de `develop`. Cada cambio nace de esa integración en su propia rama
  (`fix/...`, `feat/...`), se verifica ahí (pruebas y en el navegador) y se fusiona de
  vuelta a la integración con `--no-ff`. Al final, la integración pasa a `develop`.
- Antes de cambiar de rama, `git status` limpio (salvo `.claude/settings.local.json`):
  no se lleva trabajo a medias de una rama a otra.
- Los `git worktree` quedan **solo** para cuando varios agentes trabajan en paralelo y
  de verdad no pueden compartir carpeta. Con un solo trabajo a la vez no se usan: lo
  que se ve tiene que ser lo que se cambia.

## Commits

- Mensaje en español. Evita acentos en el asunto (el resto del repo lo hace así).
- El cuerpo explica **por qué**, no qué archivos cambiaron — eso ya lo dice el diff.
- Si el trabajo viene de un plan en `docs/plans/`, cítalo.
- Un commit por cambio coherente. No mezcles corrección de defectos con refactor:
  cuando algo falle después, hay que poder saber cuál de los dos lo rompió.

Para mensajes de varias líneas usa heredoc con la herramienta de Bash:

```sh
git commit -F - <<'EOF'
asunto
EOF
```

No uses here-strings de PowerShell (`@'...'@`) ahí: la shell de Bash no los entiende
y se cuelan literales en el asunto del commit.

## No subas sin que te lo pidan

`git push`, abrir un PR y desplegar a producción los autoriza Emilio, cada vez.
Commitear en la rama local no requiere permiso; publicar sí.

## Verificación antes de reportar

Desde `frontend/`:

```
npm test          # vitest run
npx tsc --noEmit
```

Desde `backend/`:

```
pytest
```

Si algo falla y no es tuyo, dilo en el reporte en vez de arreglarlo: puede ser de
otra sesión trabajando en paralelo.

## Idioma del código

Comentarios, nombres de pruebas y mensajes de interfaz en **español con acentos**.
Los comentarios explican **por qué** se tomó una decisión, no qué hace la línea
siguiente. El identificador en inglés se respeta donde ya existe; no se traduce
código que ya funciona sólo por consistencia.

## Trabajo en paralelo entre sesiones

Cuando varias sesiones trabajan a la vez, antes de empezar se acuerda **qué archivos
toca cada quien** y no se cruza esa línea. Si necesitas un archivo del dominio de
otra sesión, avísale por `SendMessage` en vez de editarlo.

## Cambios en el frontend: revisa los tutoriales

Cualquier cambio en el frontend obliga a revisar los recorridos guiados (driver.js)
de las pantallas afectadas. Un `data-tour` renombrado o un paso que describe un
botón que ya no existe deja al personal con un tutorial que miente, y nadie se
entera: el paso que no encuentra su elemento se salta en silencio.

Viven en `frontend/src/shared/tutoriales/`; los pasos, en `recorridos/`.

- Si tocas o quitas un `data-tour`, busca qué recorrido lo usa y corrígelo.
- Relee los textos de los pasos de esa pantalla: que el botón se llame como dice,
  que esté donde dice y que haga lo que dice. Los nombres del menú cuentan.
- Si cambia el contenido de un recorrido (pasos, textos, ids), sube su `version`.
  Así vuelve a salir como «Nuevo» para quien ya lo vio, y el progreso a medias
  de la versión anterior se descarta.

**Nada arranca solo.** Decisión de Emilio: la ayuda es un menú de apoyo para
cuando hay una duda. Ningún recorrido se abre sin que la persona lo pida desde el
«?» del encabezado (el centro de ayuda), desde un botón «¿Cómo se llena?» de un
formulario o desde el recorrido completo que ella empezó. Lo único que aparece sin
pedirlo es la franja de una línea en el encabezado, una sola vez por usuaria, que
dice dónde está la ayuda y no abre nada. No agregues invitaciones ni arranques
automáticos.

Cómo se agrega un recorrido:

- **Al índice y a la búsqueda:** basta declararlo en `recorridos/` (y en el
  `CATALOGO` de `recorridos/index.ts`). Quién lo ve lo deciden `requiere` y
  `roles`, con el mismo permiso que abre la pantalla en `routes.tsx` (hay prueba);
  `grupo` decide en qué tema del índice sale. La búsqueda recorre solos títulos,
  resúmenes y el texto de cada paso.
- **Si necesita datos concretos** (una ruta con `:param`, como la consulta) **o un
  formulario abierto** (`contexto`), escribe `comoLlegar`: el centro lo muestra en
  vez de elegir una paciente o abrir el formulario por ella, junto con los pasos
  para leerlos ahí mismo. `irA` agrega un botón para ir a la pantalla sin datos
  desde donde se llega (p. ej. «Mis consultas»). Una prueba exige `comoLlegar`.
- **Al recorrido completo:** agrega una etapa `{ recorridoId, nombre }` en
  `recorridos/completos.ts`, en el orden en que se aprende el trabajo, y sube la
  `version` de ese completo si cambian sus etapas. La etapa que un usuario no
  puede ver por permisos se salta sola y el centro lo dice.
- Un formulario en un modal lleva su `BotonAyudaContextual`: con el modal abierto,
  el «?» del encabezado queda tapado.

Todo lo que toca driver.js pasa por `motor.ts`, que nunca debe dejar la pantalla
inservible: ante un error cierra el recorrido y barre el fondo oscurecido, y si lo
señalado desaparece salta al siguiente paso o cierra guardando el avance. Si
cambias el motor, conserva esas pruebas.

`anclas.test.ts` falla si un recorrido usa un `data-tour` que no aparece en ningún
`.tsx`. Detecta el id renombrado, no el texto desactualizado: eso sigue siendo
tu revisión. Si escribes pasos para un id que otra rama todavía no agrega, anótalo
en `PENDIENTES_DE_OTRA_RAMA` y quítalo al unir las ramas (la prueba te lo pide).

## Este es un sistema clínico en producción

G.E.M.S. lo usan doctoras reales con pacientes reales. Antes de cambiar cómo se
guarda, se muestra o se borra información clínica, considera qué pasa si tu cambio
falla a media consulta.

Regla que salió de un caso real: **si el sistema no hizo algo, la interfaz no puede
decir que sí.** Un mensaje de éxito que miente hizo que una doctora duplicara una
receta. Ver `docs/plans/22_plan_maestro_consolidado.md`.
