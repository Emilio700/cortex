# CORTEX — instrucciones para Claude

Cortex es el sistema clínico de un consultorio de neurocirugía: agenda, triage,
consulta, expediente, recetas, órdenes de estudio, consentimientos y cobros. Nació
como copia de GEMS v1.2.0 (ginecología, commit `987df76`) y se adaptó a
neurocirugía con una identidad visual propia. Lo que sigue de GEMS (lógica,
pruebas, decisiones de diseño) se respeta; lo ginecológico se ocultó o se
reemplazó, sin borrar datos ni romper la cadena de migraciones.

## Buenas prácticas Integra TI

Cortex sigue la guía común (`Guia-Buenas-Practicas-Repositorios.md`).

### Ramas
- `main` = producción. `develop` = integración. No hay otras ramas permanentes.
- Todo cambio va en su propia rama **desde `develop` actualizado**, con prefijo obligatorio:
  `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`. El resto del nombre es libre,
  en minúsculas y con guiones. No lleva número de tarea.
- Urgencias en producción: `hotfix/` desde `main`; regresa a `main` y a `develop` el mismo día.
- Nunca commit directo en `develop` ni en `main`. Nunca `--force` sobre ellas.
- Integración a `develop`: `git merge --no-ff`, autorizado por Emilio. Siempre probado
  antes: compila, pasan las pruebas y se vio funcionar.

### Commits y CHANGELOG
- Commits en español: `tipo(área): qué se logró`. El cuerpo explica por qué.
  Evita acentos en el asunto.
- Título del merge request en lenguaje de negocio. Su descripción lleva `Tarea: #<id>` cuando la tarea
  ya existe; la rama y el commit no llevan el número.
- Cada rama agrega su línea en `[Sin publicar]` del `CHANGELOG.md`, en el mismo merge.
- Un commit por cambio coherente. No mezcles corrección de defectos con refactor.
- Para mensajes de varias líneas usa heredoc en Bash (`git commit -F - <<'EOF'`), no
  here-strings de PowerShell.

### Versiones
- `vMAYOR.MENOR.PARCHE` (semver). PARCHE = corrección; MENOR = funcionalidad nueva;
  MAYOR = cambio estructural. La versión vive en `frontend/package.json` y en
  `backend/app/core/version.py` (una prueba exige que coincidan; el pie de la
  interfaz y las novedades la leen de ahí).
- Liberar: subir versión y cerrar el CHANGELOG en `chore/version-X.Y.Z` → integrar a `develop`
  → `git merge --ff-only develop` en `main` → etiqueta anotada `vX.Y.Z` **sobre `main`** →
  Release en GitHub → desplegar. Libera Emilio.
- Las etiquetas solo existen sobre `main`, una por versión desplegada. No se mueven ni se borran.

### Reglas para Claude en este repo
- Antes de tocar código, revisar la rama (`git branch --show-current`). Si es `main` o `develop`,
  crear una rama con prefijo desde `develop` actualizado antes de cambiar nada.
- No hacer `push`, merge a `develop` o `main`, ni crear etiquetas sin confirmación explícita.
- Si el directorio de trabajo tiene cambios sin relación con la tarea, avisar antes de commitear.
- **Nunca `git add .`**: agrega por ruta y revisa `git diff --cached --stat` antes de commitear.
- No proponer integrar un cambio que no se haya probado.
- Nunca etiquetar `develop` ni una rama de trabajo.
- *Worktrees*: uno por tarea, cada uno con su rama nueva desde `origin/develop`; se quita al integrar.

### Especificaciones (OpenSpec)
- Especificaciones del sistema: `openspec/` en este repo (por crear con el primer cambio grande).
- Funcionalidad nueva, o cambios que tocan datos, integraciones o permisos:
  primero un cambio de OpenSpec (propuesta + tareas), después el código.
- Nombre del cambio: `<qué se logra>`. La rama lleva el mismo nombre con su prefijo de tipo.

### Documentación
- **Antes de crear una pantalla o un módulo, leer `docs/DESIGN.md`** y seguir sus componentes,
  patrones y la identidad de Cortex. No inventar estilos ni componentes nuevos si ya existe uno.
- Si el cambio agrega un patrón nuevo o el código ya no coincide con `DESIGN.md`, actualizarlo en el
  mismo cambio. Si no coinciden, manda el código.
- Planes de versión, decisiones, despliegue y manual: `docs/` (fuente oficial).
- Documentación interna de cada desarrollador: `docs/usuarios/<nombre>/`.
- Nada de datos personales ni secretos en `docs/`.

### Datos del repo
- Responsable: Emilio Cornejo · Versión actual: v0.1.0 (sin liberar)
- Producción: por definir (correrá `main`) · Pruebas: no hay
- Excepciones a estas prácticas: ninguna.

## Ambiente local

Cortex corre junto a GEMS en la misma máquina, así que usa sus propios puertos:

| Pieza | Puerto | Cómo |
|---|---|---|
| PostgreSQL | 5442 | `docker compose up -d postgres` |
| API (FastAPI) | 8010 | `backend/.venv/Scripts/uvicorn app.main:app --port 8010 --reload` |
| Web (Vite) | 3010 | `cd frontend && npm run dev` |

Base nueva: `alembic upgrade head` y luego `python -m scripts.seed_cortex` (desde
`backend/`). El seed es idempotente, crea un consultorio de neurocirugía ficticio
y muestra las contraseñas una sola vez (o usa `CORTEX_SEED_PASSWORD`). No uses
`seed.py` ni los `create_demo_*`: son de GEMS, con ids fijos.

## Verificación antes de reportar

```
cd frontend && npx tsc --noEmit && npm test
cd backend  && pytest
```

`scripts/verificar_todo.ps1` corre las tres. Si algo falla y no es tuyo, dilo en
el reporte en vez de arreglarlo.

## Idioma y voz

- Comentarios, nombres de pruebas y mensajes de interfaz en **español con acentos**.
  Los comentarios explican **por qué**, no qué hace la línea.
- El identificador en inglés se respeta donde ya existe (`doctor_id`, anclas
  `data-tour="doctora-*"`): no se traduce código que funciona.
- **Voz de Cortex:** al paciente y al médico en masculino genérico («el paciente»,
  «el médico»), con su concordancia. GEMS hablaba de «la paciente» y «la doctora»;
  `vozDeLaInterfaz.test.ts` falla si se cuela de nuevo en un texto visible.
- Se le habla de tú a quien usa el sistema.

## Identidad visual

La marca vive en `frontend/src/scss/_cortex.scss` (cargada al final) y en
`frontend/src/components/marca/`. Redefine las variables que leen las capas
heredadas (`--cui-*`, `--glass-*`, `--hf-*`), así que una pantalla nueva hereda
la marca si usa esos tokens. No pongas colores sueltos: usa `--cx-*`. Todo
movimiento respeta «reducir movimiento». Detalle en `docs/DESIGN.md`.

## Lo ginecológico que quedó de GEMS

Se conserva en la base y en el código para no perder datos ni romper la cadena
de migraciones, pero **no se ofrece**: embarazos y control prenatal, campos
gineco-obstétricos de la ficha, tipos de consentimiento, episodio y estudio de
ginecología. Al tocar esas áreas, no los vuelvas a exponer en la interfaz.

## Cambios en el frontend: revisa los tutoriales

Cualquier cambio en el frontend obliga a revisar los recorridos guiados (driver.js)
de las pantallas afectadas, en `frontend/src/shared/tutoriales/recorridos/`.

- Si tocas o quitas un `data-tour`, busca qué recorrido lo usa y corrígelo.
- Relee los textos de los pasos de esa pantalla: que el botón se llame como dice,
  que esté donde dice y que haga lo que dice.
- Si cambia el contenido de un recorrido (pasos, textos, ids), sube su `version`.
- **Nada arranca solo**: ningún recorrido se abre sin que la persona lo pida.
- `anclas.test.ts` falla si un recorrido usa un `data-tour` que no existe.

## Este es un sistema clínico

Antes de cambiar cómo se guarda, se muestra o se borra información clínica,
considera qué pasa si tu cambio falla a media consulta.

Regla heredada de un caso real en GEMS: **si el sistema no hizo algo, la interfaz
no puede decir que sí.** Un mensaje de éxito que miente hizo que una doctora
duplicara una receta.
