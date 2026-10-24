# 🧭 Guía de buenas prácticas para repositorios 

<!-- ESTADO-INTEGRABRAIN:INICIO -->

> **Estado de adopción:** por compartir; cada desarrollo la incorpora en su `CLAUDE.md`
> **Resumen:** Una forma común de trabajar en todos los desarrollos. `main` es producción y `develop` es
> integración; cada cambio va en su propia rama con prefijo de tipo; cada versión que llega a producción
> lleva su número `vX.Y.Z` y su etiqueta. Lo que se construye se especifica con **OpenSpec**, la
> documentación vive en `docs/` (lo general del repo y una carpeta interna por desarrollador), y un
> `DESIGN.md` describe los patrones del sistema para que los módulos nuevos se construyan igual que los
> existentes. Cada proyecto la incorpora a su `CLAUDE.md` para que todos los repos queden ordenados igual.
<!-- ESTADO-INTEGRABRAIN:FIN -->

---

## Cómo usar esta guía

1. **Lee las reglas en una página** (§ 1). Es lo único que hace falta para el día a día.
2. **Copia el bloque de § 2 en el `CLAUDE.md` de tu desarrollo** y llena lo marcado con `‹ ›`.
   Con eso, Claude y cualquier persona que llegue al repo trabajan con las mismas reglas.
3. **Si tu `CLAUDE.md` ya tenía reglas de ramas distintas**, ajústalas a esta guía para que no se
   contradigan.
4. **Si tu repo todavía no tiene `main` y `develop` en orden**, el anexo (§ 12) tiene los pasos según
   cómo esté hoy.

**¿Por qué?** Hoy cada repo se organiza distinto: producción sale de `main`, `production`, `master` u
otra rama; hay ramas por persona y ramas de pruebas; casi ningún proyecto tiene versiones; y los
requerimientos con los que se trabaja muchas veces no quedan en ningún repo. Cuando cada repo funciona
distinto, quien cambia de proyecto tiene que reaprender todo, cuesta saber qué está en producción, nadie
más puede consultar lo que se acordó construir, y cuando varias personas trabajan en el mismo repo se
pisan. Una forma común resuelve todo eso.

**Qué cubre:**

| Tema | Sección |
|---|---|
| Ramas, ciclo de un cambio, commits | § 3, § 4, § 5 |
| Versiones, liberación, hotfix y etiquetas | § 6, § 7 |
| Varias personas y *worktrees* | § 8 |
| Estructura del repo, ambientes y secretos | § 9 |
| Documentación, especificaciones (OpenSpec) y `DESIGN.md` | § 10 |
| Calidad antes de integrar | § 11 |
| Poner en orden un repo que ya existe | § 12 |

---

## 1. Las reglas en una página

> 1. **Solo dos ramas permanentes:** `main` = producción. `develop` = integración, lo más actualizado.
> 2. **Todo trabajo nace de `develop` actualizado**, en una rama propia con prefijo de tipo:
>    `feat/`, `fix/`, `bug/`, `refactor/`, `chore/`, `docs/`. El resto del nombre es libre.
> 3. **Una rama = un cambio.** No se juntan cosas sin relación.
> 4. **Nadie hace commit directo en `develop` ni en `main`.**
> 5. **La rama vuelve a `develop`**, probada, por merge request (o `merge --no-ff` donde el responsable lo autorice).
> 6. **`main` solo recibe `develop`**, completo, en una liberación con versión `vX.Y.Z`.
> 7. **`develop` nunca se queda atrás de `main`.** Lo que está en `main` está en `develop`.
> 8. **Las urgencias de producción** salen de `main` como `hotfix/` y regresan a `main` **y** a `develop` el mismo día.
> 9. **Cada liberación sube la versión** y se anota en el `CHANGELOG.md`.
> 10. **Las etiquetas `vX.Y.Z` solo se ponen sobre `main`**, una por cada versión que llega a producción.
>     La lista de etiquetas en GitLab es el historial de producción.
> 11. **Lo nuevo se especifica antes de construirse:** funcionalidad nueva, o cambios que tocan datos,
>     integraciones, permisos o cálculos fiscales, llevan un cambio de **OpenSpec**, que se archiva al integrar
>     (en un sistema de varios repos, al verificarlo en pruebas y a más tardar en la liberación).
> 12. **Los documentos viven en el repo**, no en el correo: especificaciones en `openspec/`, planes y
>     decisiones en `docs/`, borradores en `docs/usuarios/<nombre>/`, y los patrones del sistema en `DESIGN.md`.

---

## 2. Bloque para el `CLAUDE.md` de tu desarrollo

Cópialo tal cual en el `CLAUDE.md` del repo y llena lo marcado con `‹ ›`:

````markdown
## Buenas prácticas Integra TI

### Ramas
- `main` = producción. `develop` = integración. No hay otras ramas permanentes.
- Todo cambio va en su propia rama **desde `develop` actualizado**, con prefijo obligatorio:
  `feat/`, ‹`fix/` o `bug/`›, `refactor/`, `chore/`, `docs/`. El resto del nombre es libre,
  en minúsculas y con guiones. No lleva número de tarea.
- Urgencias en producción: `hotfix/` desde `main`; regresa a `main` y a `develop` el mismo día.
- Nunca commit directo en `develop` ni en `main`. Nunca `--force` sobre ellas.
- Integración a `develop`: ‹por merge request revisado por ‹persona›› ‹o: `git merge --no-ff`,
  autorizado por ‹responsable››. Siempre probado antes: compila, pasan las pruebas y se vio funcionar.

### Commits y CHANGELOG
- Commits en español: `tipo(área): qué se logró`. El cuerpo explica por qué.
- Título del merge request en lenguaje de negocio. Su descripción lleva `Tarea: #<id>` cuando la tarea
  ya existe; la rama y el commit no llevan el número.
- Cada rama agrega su línea en `[Sin publicar]` del `CHANGELOG.md`, en el mismo merge.

### Versiones
- `vMAYOR.MENOR.PARCHE` (semver). PARCHE = corrección; MENOR = funcionalidad nueva;
  MAYOR = cambio estructural. La versión vive en ‹archivo: package.json / pyproject.toml / VERSION›.
- Liberar: subir versión y cerrar el CHANGELOG en `chore/version-X.Y.Z` → integrar a `develop`
  → `git merge --ff-only develop` en `main` → etiqueta anotada `vX.Y.Z` **sobre `main`** →
  Release en GitLab → desplegar. Libera ‹responsable›.
- Las etiquetas solo existen sobre `main`, una por versión desplegada. No se mueven ni se borran.

### Reglas para Claude en este repo
- Antes de tocar código, revisar la rama (`git branch --show-current`). Si es `main` o `develop`,
  crear una rama con prefijo desde `develop` actualizado antes de cambiar nada.
- No hacer `push`, merge a `develop` o `main`, ni crear etiquetas sin confirmación explícita.
- Si el directorio de trabajo tiene cambios sin relación con la tarea, avisar antes de commitear.
- No proponer integrar un cambio que no se haya probado.
- Nunca etiquetar `develop` ni una rama de trabajo.
- *Worktrees*: uno por tarea, cada uno con su rama nueva desde `origin/develop`; se quita al integrar.

### Especificaciones (OpenSpec)
- Especificaciones del sistema: ‹`openspec/` en este repo | repo `<sistema>-openspec`›.
- Funcionalidad nueva, o cambios que tocan datos, integraciones, permisos o cálculos fiscales:
  primero un cambio de OpenSpec (propuesta + tareas), después el código.
- Nombre del cambio: `‹prefijo›-<qué se logra>`. La rama lleva el mismo nombre con su prefijo de tipo.
- Antes de proponer un cambio, leer `openspec/specs/` del área que se va a tocar.
- Marcar las tareas en `tasks.md` conforme se terminan. Archivar el cambio: si `openspec/` está en el
  mismo repo, al integrar a `develop`, en el mismo merge; si vive en otro repo (`<sistema>-openspec`),
  al verificarlo en pruebas y a más tardar en la liberación.
- Si el negocio mandó un documento, va dentro de la carpeta del cambio.

### Documentación
- **Antes de crear una pantalla o un módulo, leer `DESIGN.md`** y seguir sus componentes, patrones y la
  pantalla modelo que indique. No inventar estilos ni componentes nuevos si ya existe uno.
- Si el cambio agrega un patrón nuevo o el código ya no coincide con `DESIGN.md`, actualizarlo en el
  mismo cambio. Si no coinciden, manda el código.
- Planes de versión, decisiones, despliegue y manual: `docs/` (fuente oficial).
- Documentación interna de cada desarrollador: `docs/usuarios/<nombre>/`. Escribir solo en la carpeta
  de quien está trabajando; usar las de otros solo como consulta.
- Nada de datos personales ni secretos en `docs/`.

### Datos del repo
- Responsable: ‹nombre› · Versión actual: ‹v0.0.0›
- Producción: ‹servidor/URL›, corre `main` · Pruebas: ‹servidor/URL, corre `develop`, o "no hay"›
- Excepciones a estas prácticas: ‹ninguna, o cuál y por qué›
````

---

## 3. Las ramas

### 3.1 Ramas permanentes: solo dos

| Rama | Qué representa | Qué recibe | Protegida en GitLab |
|---|---|---|---|
| `main` | **Lo que está en producción, y nada más.** El servidor productivo se despliega desde aquí. | Solo liberaciones desde `develop` y `hotfix/*` | Sí: nadie hace push directo, solo integra el **coordinador del desarrollo** (rol *Maintainer*), sin `--force` |
| `develop` | **La integración:** el trabajo terminado de todos, junto. Es la base de toda rama nueva. | Solo ramas de trabajo terminadas | Sí: nadie hace push directo, sin `--force` |

**Quién integra y libera:** el **coordinador del desarrollo** (en GitLab, rol *Maintainer* de ese repo). El
resto del equipo tiene rol *Developer*: trabaja en su rama y abre merge request, pero no integra a `main`.
Cada repo declara quién es su coordinador en el bloque de § 2 (campo *Responsable*).

**No se usa rama `qa`, `testing`, `production`, `master` ni ramas por persona.** Una rama de pruebas
entre `develop` y `main` es un paso más donde el código se desfasa, sin aportar nada que `develop` no
dé. Si el proyecto tiene servidor de pruebas, ese servidor **despliega `develop`**.

### 3.2 Ramas de trabajo

**Formato:** `<prefijo>/<descripción libre>`. El prefijo es obligatorio; lo demás lo escribe cada quien
como le sea claro, en minúsculas y con guiones, sin espacios ni acentos.

| Prefijo | Para qué | Ejemplo |
|---|---|---|
| `feat/` | Funcionalidad nueva | `feat/reporte-de-cartera` |
| `fix/` o `bug/` | Corrección de un error (son equivalentes; cada repo usa uno y no los mezcla) | `fix/fecha-de-vigencia` |
| `refactor/` | Reorganizar código sin cambiar lo que hace | `refactor/servicio-de-polizas` |
| `chore/` | Mantenimiento, configuración, dependencias, subir versión | `chore/version-0.2.0` |
| `docs/` | Solo documentación | `docs/manual-de-usuario` |
| `hotfix/` | Urgencia en producción. **Es la única que nace de `main`** | `hotfix/timbrado-rechazado` |

- **La rama no lleva número de tarea.** El trabajo empieza en el repositorio y la tarea se registra o se
  actualiza conforme se avanza. El vínculo con la tarea se hace **en la descripción del merge request**
  (ver § 5), que es cuando el número ya existe.
- **Las ramas que ya existen con otros nombres** se terminan con su nombre actual. Las nuevas siguen
  esta guía.
- **Ramas vivas días, no semanas.** Una rama que acumula meses de trabajo termina siendo una rama por
  persona con otro nombre.

---

## 4. El ciclo de un cambio

```text
            ┌──────────── feat/mi-cambio ────────────┐
            │  commits · pruebas · merge request      │
            │                                         ▼
develop ────●─────────────────────────────────────────●──────── (integración)
                                                       │
                                   liberación vX.Y.Z    │
                                                       ▼
main ──────────────────────────────────────────────────●──────── (producción)
```

**1. Partir de `develop` actualizado.** Nunca de `main` ni de la rama de otro compañero.

```bash
git switch develop
git pull origin develop
git switch -c feat/mi-cambio
```

**2. Mantenerse al día.** Si la rama dura más de un día, trae `develop` al menos una vez al día para que
los conflictos salgan chicos y temprano:

```bash
git fetch origin
git merge origin/develop
```

**3. Probar antes de integrar.** Compila, pasan las pruebas (y el linter, si hay), y el flujo que tocaste
se vio funcionar en local. "Compila" no es "funciona".

**4. Integrar a `develop`.** Por merge request hacia `develop` (nunca hacia `main`), revisado por otra
persona del proyecto. Donde el responsable autorice el merge directo (por ejemplo, proyectos de una sola
persona):

```bash
git switch develop && git pull origin develop
git merge --no-ff feat/mi-cambio -m "merge: qué cambia"
git push origin develop
```

**Siempre `--no-ff`**: deja visible en la historia "aquí entró este cambio" y permite deshacerlo completo.
Al integrar, se agrega la línea del `CHANGELOG.md` y **se borra la rama**.

---

## 5. Commits y merge requests

```text
fix(contratos): la fecha de vigencia ya no se guarda un día antes

Capturada desde Mazatlán (UTC-7), la pantalla mostraba el día anterior.
Se ancla a mediodía UTC al guardar.
```

- **Primera línea** en español: `tipo(área): qué se logró`, sin punto final.
- **El cuerpo** explica **por qué**, no repite qué.
- **Commits pequeños.** Un commit que dice "varios ajustes" no se puede revisar ni deshacer.
- **Título del merge request** en lenguaje de negocio:
  ✅ *"Gravados y Exentos: nuevo módulo de reporte de nómina"* ❌ *"feat: add report module"*.
- **Descripción del merge request:** qué cambia, por qué y cómo probarlo. Conviene tener una plantilla en
  `.gitlab/merge_request_templates/Default.md`.
- **Liga con la tarea:** cuando la tarea de OpenProject ya existe, la descripción del merge request lleva
  una línea `Tarea: #<id>`. Ni la rama ni el commit llevan el número. Si la tarea todavía no existe, se
  crea al abrir el merge request y se agrega la línea. Con eso OpenProject ubica el trabajo sin pedirle a
  nadie el número antes de empezar.
- **Qué pasa con la tarea:** al aprobarse y fusionarse el merge request a `develop`, la tarea se cierra sola
  (si solo es una hoja). Un merge request rechazado la deja abierta. El paso de `develop` a `main` es la
  liberación y no cambia estados. Detalle en `Bitacora-de-Decisiones` D-024 y `Definicion-de-Estados`.

---

## 6. Versiones

### 6.1 Qué significa cada número

Versionado semántico estándar, **`vMAYOR.MENOR.PARCHE`**, que se lee de derecha a izquierda:

| Sube | Cuándo | Ejemplo | Los de la derecha |
|---|---|---|---|
| **PARCHE** `v0.1.0 → v0.1.1` | **Cambio mínimo:** corrección de errores, ajustes de texto o de estilo. | Se corrige un cálculo | — |
| **MENOR** `v0.1.1 → v0.2.0` | **Cambio mediano:** funcionalidad nueva que no rompe lo que ya existía. | Se agrega un reporte | PARCHE vuelve a 0 |
| **MAYOR** `v0.2.0 → v1.0.0` | **Cambio estructural:** salida a producción formal, rediseño, cambio de base de datos o de integraciones que obliga a otros a ajustarse. | Arranque de operación real | MENOR y PARCHE vuelven a 0 |

- **Cada repo arranca en `v0.0.0`**: lo que corre en producción el día que adopta estas prácticas.
- **Mientras el MAYOR sea `0`, el sistema está en construcción.** El paso a `v1.0.0` lo decide el
  responsable, cuando el área usuaria opera con él de verdad.
- **Cada liberación lleva su propio número**, que nunca se repite ni se baja.
- **Si dudas entre dos niveles, elige el mayor.**

### 6.2 Dónde vive la versión

1. **En el archivo del proyecto:** `package.json`, `pyproject.toml`, `composer.json` o un archivo `VERSION`.
   Si el sistema tiene backend y frontend, **los dos llevan el mismo número**, aunque estén en repos distintos.
2. **En una etiqueta anotada sobre `main`.**
3. **En el `CHANGELOG.md`.**
4. **Visible en la aplicación** (pie de página o "Acerca de"), para que el área usuaria pueda decir en qué
   versión vio un problema.

### 6.3 Cómo se libera

```bash
# 1. Subir la versión y cerrar el CHANGELOG, en una rama como cualquier cambio
git switch develop && git pull origin develop
git switch -c chore/version-0.2.0
#    … editar package.json / pyproject.toml / VERSION
#    … en CHANGELOG.md: [Sin publicar] → [0.2.0] - AAAA-MM-DD
git commit -am "chore: versión 0.2.0"
#    … integrar a develop

# 2. Llevar exactamente develop a producción
git switch develop && git pull origin develop
git switch main && git pull origin main
git merge --ff-only develop
git push origin main

# 3. Etiquetar main
git tag -a v0.2.0 -m "v0.2.0 — Resumen en lenguaje de negocio"
git push origin v0.2.0

# 4. Desplegar en el servidor de producción desde main
```

**5. Publicar la versión en GitLab** (*Deploy → Releases → New release*): eliges la etiqueta y pegas el
texto de esa versión del `CHANGELOG.md`. Así cualquiera, aunque no use Git, ve qué versiones han salido y
qué trajo cada una.

**`--ff-only` es a propósito:** deja `main` idéntica a `develop` al liberar. Si falla, `main` tiene algo que
`develop` no tiene (un hotfix que no regresó): se corrige eso primero, no se fuerza.

### 6.4 Urgencias en producción (hotfix)

```bash
git switch main && git pull origin main
git switch -c hotfix/timbrado-rechazado
#    … corregir, probar, subir el PARCHE (v0.2.0 → v0.2.1) y anotarlo en el CHANGELOG
git switch main
git merge --no-ff hotfix/timbrado-rechazado -m "merge: hotfix timbrado rechazado"
git tag -a v0.2.1 -m "v0.2.1 — Corrección urgente del timbrado"
git push origin main v0.2.1

# El mismo día, de regreso a develop:
git switch develop && git pull origin develop
git merge --no-ff main -m "merge: regresa hotfix v0.2.1 a develop"
git push origin develop
```

> 🔴 **Un hotfix que no regresa a `develop` se pierde en la siguiente liberación** y el error vuelve a
> producción. El regreso es parte del hotfix.

### 6.5 Las etiquetas son el historial de producción

`main` dice **qué está hoy** en producción; las etiquetas dicen **todo lo que ha estado**.

- **Solo se etiqueta `main`**, y solo cuando esa versión de verdad se despliega.
- **Una etiqueta por despliegue.** Si se desplegó, tiene etiqueta; si tiene etiqueta, se desplegó.
- **Siempre anotadas** (`git tag -a`), con el resumen en lenguaje de negocio.
- **Nunca se mueven ni se borran.** Si una versión salió mal, se corrige con la siguiente.
- **Para regresar a una versión anterior** se despliega su etiqueta (`git checkout v0.1.0`) mientras se
  prepara el hotfix.

Se ven en GitLab en *Code → Tags* y en *Deploy → Releases*.

---

## 7. El `CHANGELOG.md`

En la raíz del repo, con formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), en lenguaje
de negocio:

```markdown
# Bitácora de cambios

## [Sin publicar]
### Agregado
- Reporte de cartera por empresa, con exportación a Excel.
### Corregido
- La fecha de vigencia del contrato ya no se muestra un día antes.

## [0.1.0] - 2026-10-20
### Agregado
- …

## [0.0.0] - 2026-10-13
- Versión base: lo que estaba en producción al adoptar estas prácticas.
```

Cada rama agrega su línea en `[Sin publicar]` en el mismo merge. Secciones: `Agregado`, `Cambiado`,
`Corregido`, `Eliminado`, `Seguridad`.

---

## 8. Varias personas y *worktrees* en el mismo repo

1. **Cada tarea, su rama; cada rama, su carpeta.** Un *worktree* se crea siempre con rama nueva desde
   `develop` actualizado:

   ```bash
   git fetch origin
   git worktree add ../mi-proyecto-reporte-cartera -b feat/reporte-cartera origin/develop
   ```

   Nunca dos *worktrees* sobre la misma rama, ni uno sobre `develop` o `main` para trabajar.
2. **Tareas delimitadas.** Antes de repartir el trabajo se acuerda qué toca cada quien. Dos ramas sobre la
   misma pantalla o tabla al mismo tiempo van a chocar: la segunda espera a que la primera entre a `develop`.
3. **Integrar pronto y limpiar:**

   ```bash
   git worktree remove ../mi-proyecto-reporte-cartera
   git branch -d feat/reporte-cartera
   ```

> 💡 **Las migraciones de base de datos** son el choque más común: dos ramas crean una migración con el
> mismo número. Al traer `develop` a tu rama, revisa que las tuyas sigan siendo las últimas.

---

## 9. Estructura, ambientes y secretos

### 9.1 Lo que conviene que tenga todo repo

```text
mi-proyecto/
├── README.md                 ← qué es, quién es el responsable y cómo se levanta
├── CLAUDE.md                 ← con el bloque de § 2
├── DESIGN.md                 ← patrones del sistema para crear módulos nuevos (§ 10.4)
├── CHANGELOG.md              ← qué trajo cada versión
├── .env.example              ← todas las variables, con valores de ejemplo, NUNCA reales
├── .gitignore                ← incluye .env, respaldos, logs, dependencias
├── docker-compose.yml        ← levanta todo en local con un comando
├── .gitlab/merge_request_templates/Default.md
├── backend/  ·  frontend/    ← o src/, según el proyecto
└── docs/                     ← planes, requerimientos y documentación del desarrollo (§ 10)
```

No todo proyecto necesita todo, pero lo que exista conviene que esté **en ese lugar y con ese nombre**, para
que cualquiera lo encuentre en cualquier repo.

### 9.2 Ambientes

| Ambiente | Rama | Para qué |
|---|---|---|
| **Local** | la rama de trabajo, o `develop` | Desarrollar y hacer la primera prueba. Siempre primero |
| **Pruebas** *(si hay servidor)* | `develop` | Validación con el área usuaria antes de liberar |
| **Producción** | `main`, en su etiqueta `vX.Y.Z` | Operación real |

- La rama dice **qué código** corre; la variable de ambiente (`APP_ENV`) dice **con qué configuración**.
- Producción nunca se despliega desde `develop` ni desde una rama de trabajo.
- Nadie prueba escribiendo en producción.

### 9.3 Secretos

- **Ningún secreto entra al repositorio** (contraseñas, llaves, tokens, cadenas de conexión). Viven en el
  `.env` del servidor, que está en `.gitignore`.
- **`.env.example` lista todas las variables.** Si agregas una, la agregas ahí en el mismo cambio.
- **Si un secreto se subió por error, borrarlo no basta**: sigue en el historial. Hay que cambiarlo y avisar
  al responsable.

---

## 10. Documentación, especificaciones y `DESIGN.md`

La documentación vive **dentro del repo**, junto al código que describe, para que se versione con él y para
que Claude la lea antes de trabajar. Cada tipo de documento tiene **un solo lugar**:

| Qué es | Dónde va |
|---|---|
| Lo que se va a construir o cambiar, y el requerimiento del negocio que lo origina | **`openspec/`** (§ 10.2) |
| Cómo funciona hoy el sistema | **`openspec/specs/`** (§ 10.2) |
| Patrones del sistema para construir módulos nuevos | **`DESIGN.md`** (§ 10.4) |
| Planes de versión, decisiones, despliegue y manual de usuario | **`docs/`** (§ 10.1) |
| Borradores, análisis y notas de cada desarrollador | **`docs/usuarios/<nombre>/`** (§ 10.1) |

### 10.1 La carpeta `docs/`

```text
docs/
├── README.md                 ← índice: qué hay en cada carpeta, dónde están las especificaciones
│                               y qué plan está en curso
├── planes/                   ← GENERAL: planes de versión (qué cambios entran en cada versión)
│   └── PLAN-001-<tema>.md
├── decisiones/               ← GENERAL: por qué algo es como es
├── despliegue/               ← GENERAL: cómo se instala y se reconstruye producción
├── manual/                   ← GENERAL: guía para el área usuaria
│
└── usuarios/                 ← INTERNO: una carpeta por desarrollador
    └── <nombre-apellido>/
        ├── planes/           ← sus planes de trabajo y borradores
        ├── analisis/         ← levantamientos, dudas, pruebas de concepto
        └── notas/
```

> En `docs/usuarios/`, "usuario" es **cada desarrollador del repo**. La documentación para el área que usa el
> sistema va en `docs/manual/`.

- **Lo general es la fuente oficial**: lo consulta cualquiera y Claude lo toma como referencia.
- **Lo interno es el espacio de trabajo de cada quien.** Ahí se arma un plan o se analiza un requerimiento sin
  tener que acordarlo con nadie. Cada persona escribe solo en su carpeta. Si usas métodos como Superpowers,
  sus planes van aquí.
- **Lo interno pasa a lo general cuando se acuerda**: un análisis que se va a construir se vuelve un cambio de
  OpenSpec; un plan que se adopta se vuelve un `PLAN-NNN`.
- **Los documentos entran por rama, como el código** (`docs/<descripción>`).
- **Lo que se le manda a alguien sale del repo.** Si un requerimiento o un plan se envía por correo o por chat,
  la versión vigente es la del repo, no la del adjunto.
- **Los documentos van en el repo donde se desarrolla.** Si un repo es copia de otro, la documentación vive en
  el original.
- **Nada de datos personales ni secretos**, ni en lo general ni en lo interno. Los archivos de Office pueden ir
  como anexos, pero no sus temporales: agrega `~$*` al `.gitignore`.

**Plantilla de plan** (`docs/planes/PLAN-NNN-<tema>.md`). Un plan agrupa los cambios que llevan a una versión:

```markdown
# PLAN 001 — <Tema en lenguaje de negocio>

| | |
|---|---|
| **Versión destino** | `v0.1.0` |
| **Abierto** | AAAA-MM-DD |
| **Dueño** | <nombre> |
| **Estado** | En curso / Cerrado AAAA-MM-DD |

## Objetivo
Qué se busca lograr y para quién, en dos o tres líneas.

## Cambios
| # | Cambio de OpenSpec | Rama | Por qué | Estado |
|---|---|---|---|---|
| 1 | `pf-serie-timbrado-empresa` | `fix/pf-serie-timbrado-empresa` | ... | Pendiente / Hecho |

## Fuera de este plan
Lo que surgió pero se deja para el siguiente plan.
```

Cerrar un plan = liberar su versión (§ 6.3). Lo que no entró se anota en "Fuera de este plan" y no se mete de lado.

### 10.2 Especificaciones con OpenSpec

Todo el equipo usa **OpenSpec** para especificar lo que se construye. Ya funciona en Cosalá Stack
(`cosala-openspec`), con cientos de cambios documentados desde abril de 2026. Separa dos cosas:

- **`openspec/specs/`** describe **cómo funciona hoy** el sistema, por área.
- **`openspec/changes/<cambio>/`** describe **lo que se va a cambiar**: la propuesta (por qué y qué), el diseño
  (cómo, solo si hay una decisión técnica que explicar), las tareas y las diferencias contra la especificación
  vigente. Cuando el cambio termina se **archiva**: sus diferencias pasan a `specs/` y el cambio queda en
  `changes/archive/` con su fecha.

```text
openspec/
├── config.yaml               ← contexto del sistema y tabla de prefijos
├── specs/                    ← cómo funciona hoy, una carpeta por área
│   └── <area>/spec.md
└── changes/
    ├── <prefijo>-<qué-se-logra>/
    │   ├── proposal.md       ← por qué y qué
    │   ├── design.md         ← cómo (opcional)
    │   ├── tasks.md          ← el desglose, se marca conforme se avanza
    │   ├── specs/            ← diferencias contra la especificación vigente
    │   └── REQUERIMIENTO-<tema>.md   ← lo que mandó el negocio, si hay (y sus anexos)
    └── archive/              ← cambios terminados, con fecha
```

**Dónde vive**

- **Sistema de un solo repo:** `openspec/` en la raíz del repo de código. No se mueve a `docs/`: la herramienta
  la necesita ahí.
- **Sistema de varios repos** (backend y frontend separados, por ejemplo): un repo `<sistema>-openspec` en el
  mismo grupo de GitLab, como `cosala-openspec`.
- En los dos casos, el `CLAUDE.md` del repo de código dice dónde está.

**Nombres**

- **Cambio:** `<prefijo-del-repo>-<qué se logra>`, en minúsculas y con guiones. El prefijo es corto y fijo por
  repo (`fb-` facturación backend, `pf-` préstamos filiales…) y se declara en `config.yaml`.
- **Rama:** prefijo de tipo + el nombre del cambio. El cambio `pf-serie-timbrado-empresa` va en la rama
  `fix/pf-serie-timbrado-empresa`. Así la especificación y el código quedan ligados por nombre.
- **Si ya trabajas con requerimientos numerados** (`via-terc-15`, `014-…`), el número puede ir dentro del
  nombre: `vi-terc-15-sso-sin-corte-por-inactividad`.

**Cuándo es obligatorio**

| Tipo de trabajo | ¿Lleva cambio de OpenSpec? |
|---|---|
| Funcionalidad nueva (`feat/`) | **Sí** |
| Cambio que toca base de datos, integraciones con otros sistemas, permisos o cálculos fiscales | **Sí**, aunque sea una corrección |
| Corrección acotada, refactor, mantenimiento, documentación | No |
| Hotfix | No al momento; si cambió una regla del sistema, se documenta después |

**Ciclo**

1. **Proponer:** crear el cambio con su propuesta y sus tareas (con Claude: `/opsx:new` o `/opsx:explore`).
   Si el negocio mandó un documento, va dentro de la carpeta del cambio.
2. **Implementar** en la rama de trabajo, marcando las tareas conforme se terminan (`/opsx:apply`).
3. **Archivar** (`/opsx:archive`):
   - **Si `openspec/` está en el mismo repo del código:** al integrar a `develop`, en el mismo merge. Así
     `openspec/specs/` siempre describe lo que hay en `develop`.
   - **Si vive en otro repo** (`<sistema>-openspec`): no cabe en el mismo merge, porque son repos distintos.
     Se archiva **al verificarlo en pruebas, a más tardar en la liberación**. Antes de liberar, no debe
     quedar ningún cambio de esa versión sin archivar.

   **Sin archivar, el cambio no está terminado.**

**`config.yaml` base:** qué es el sistema, qué repos lo forman y con qué tecnología, la tabla de prefijos, y la
indicación de respetar el `CLAUDE.md` y el `DESIGN.md` de cada repo. El de `cosala-openspec` sirve de modelo.

**Para empezar en un repo:** instala OpenSpec, corre `openspec init` en la raíz y elige Claude Code como
herramienta; eso agrega los comandos `/opsx:*`. **No migres lo anterior**: los planes y requerimientos que ya
existen se quedan donde están, y solo los cambios nuevos entran por OpenSpec. La especificación de cómo funciona
hoy el sistema se va llenando con cada cambio archivado.

### 10.3 Otras herramientas de especificación

- **Spec Kit no se usa** como herramienta del equipo: crea ramas numeradas (`001-…`) que chocan con la regla de
  prefijos, y está pensado para funcionalidades nuevas más que para sistemas que ya operan. Su idea de
  "constitución" (las reglas que toda especificación respeta) ya la cubren el `CLAUDE.md` y el `DESIGN.md`.
- **Superpowers** u otros métodos personales se pueden seguir usando para ordenar la sesión de trabajo. Sus
  documentos van en `docs/usuarios/<nombre>/`; lo que se acuerda construir pasa a OpenSpec.

### 10.4 `DESIGN.md` — el archivo base del desarrollo

En la raíz del repo. Describe **cómo está hecho el sistema**: su estilo visual, sus componentes y la forma de sus
módulos. Sirve para dos cosas:

- **Para Claude:** antes de crear una pantalla o un módulo nuevo, lo lee y **sigue los patrones que el sistema ya
  usa**, en lugar de inventar unos nuevos. Es lo que hace que un módulo nuevo se vea y funcione como el resto.
- **Para el equipo:** quien llega nuevo entiende en una lectura cómo se construye ahí.

**La regla que lo mantiene útil:** `DESIGN.md` se escribe **a partir del código real**, no de cómo debería ser.
Si el código y el documento no coinciden, manda el código, y el documento se corrige en el mismo cambio. Quien
agrega un patrón nuevo (un componente, un tipo de pantalla) lo anota ahí.

**Qué lleva:**

1. **Principios.** Para quién es el sistema y qué estilo sigue (por ejemplo: "tableros ejecutivos, sobrios, una
   idea por tarjeta").
2. **Base visual.** Colores, tipografía, espaciados, radios, iconos, modo claro y oscuro, y **en qué archivo vive
   cada cosa**. Ningún color o tamaño se escribe fuera de ahí.
3. **Componentes base.** Tabla, formulario, encabezado de página, tarjetas, botones, modales, avisos, y los estados
   de **carga, vacío y error**. Para cada uno: dónde está, cuándo se usa y un ejemplo corto.
4. **Patrones de pantalla.** Listado, detalle, formulario, tablero. Para cada uno, **la pantalla existente que
   sirve de modelo**.
5. **Anatomía de un módulo.** Cómo se arma un módulo completo en este repo: carpetas, capas del backend (rutas,
   servicio, acceso a datos, validaciones), migraciones, permisos, registro en el menú y pruebas.
6. **Textos y formatos.** Idioma de la interfaz, formato de fechas, moneda y números.
7. **Lo que no se hace.** Por ejemplo: colores escritos a mano, tablas hechas desde cero, emojis en la interfaz.
8. **Receta para un módulo nuevo.** Los pasos en orden, apuntando a los modelos de los puntos 4 y 5.

**Cómo hacer el primero.** No hace falta escribirlo a mano. Dentro del repo, pídele a Claude:

> *Lee el código del frontend y del backend y escribe un `DESIGN.md` en la raíz con las ocho secciones de la guía
> de buenas prácticas de Integra TI. Sácalo solo de lo que el código ya hace, con la ruta de cada archivo, y marca
> lo que esté inconsistente entre pantallas en lugar de elegir uno.*

Luego se revisa, se corrige lo que no sea cierto y se integra por rama como cualquier cambio. Lo inconsistente
que aparezca es una buena lista de pendientes para unificar.

---

## 11. Calidad antes de integrar

Un cambio entra a `develop` cuando compila y pasan las pruebas, se vio funcionar, y lo revisó otra persona
(si el proyecto tiene más de un desarrollador).

**Conviene rechazar en revisión:** un secreto en el código, un cambio sin probar, una migración que no se
puede revertir sin avisar, y un merge request que mezcla cambios sin relación.

---

## 12. Anexo — Poner en orden un repo que ya existe

### 12.1 Cómo se ve un repo en orden

- [ ] Existen `main` y `develop`, y no hay otras ramas permanentes.
- [ ] `main` es la rama por defecto en GitLab.
- [ ] `main` y `develop` protegidas (*Settings → Repository → Protected branches*): push directo
      *No one*, sin *force push*; a `main` solo integra el coordinador del desarrollo (*Maintainer*).
- [ ] `develop` contiene todo lo que tiene `main`.
- [ ] El servidor de producción corre `main`; el de pruebas, si existe, corre `develop`.
- [ ] Etiqueta `v0.0.0` sobre `main`, versión `0.0.0` en el archivo del proyecto y `CHANGELOG.md` creado.
- [ ] El `CLAUDE.md` tiene el bloque de § 2.
- [ ] Existe `docs/` con `README.md`, `planes/` y `usuarios/<nombre>/` por cada desarrollador.
- [ ] OpenSpec iniciado (`openspec/` en la raíz o repo `<sistema>-openspec`), con su `config.yaml` y prefijo.
- [ ] Existe `DESIGN.md` en la raíz, sacado del código real (§ 10.4).
- [ ] No quedan ramas ya integradas sin borrar.

### 12.2 Según cómo esté hoy

> ⚠️ **Antes de mover ramas:** avisa a quienes trabajan en el repo, pide que suban lo pendiente, y anota
> qué rama y qué commit corre en producción (`git branch --show-current` y `git rev-parse --short HEAD`
> en la carpeta del sistema, dentro del servidor). Al terminar, el servidor debe seguir en ese mismo commit.

**Producción sale de `production`, `master` u otra rama.** GitLab no permite renombrar ramas, así que se
crea `main` con el mismo contenido:

```bash
git fetch origin
git push origin origin/production:refs/heads/main     # si main no existe
# si main ya existe y está vieja: respaldarla primero
#   git push origin origin/main:refs/heads/respaldo/main-anterior
#   git push --force origin origin/production:main
```

Luego: hacer `main` la rama por defecto, protegerla, cambiar el destino de los merge requests abiertos,
actualizar las reglas del `.gitlab-ci.yml`, cambiar el servidor (o el panel o script de despliegue) a `main`,
y después de una semana sin problemas, borrar la rama vieja.

**No existe `develop`:** `git push origin origin/main:refs/heads/develop` y protegerla.

**Hay rama `qa` o `testing`:** revisa qué tiene que no esté en `develop`
(`git log --oneline origin/develop..origin/qa`), intégralo a `develop`, cambia el servidor de pruebas a
`develop` y borra `qa`. Si `develop` no existía, créala desde `qa`, que es la que va más adelante.

**Hay ramas por persona (`dev-<nombre>`):** integra a `develop` lo terminado de cada una (por esta vez
puede ser un merge request grande), pasa lo que esté a medias a su propia rama `feat/` o `fix/`, cambia a
`develop` el destino de las ramas que apuntaban ahí, y borra `dev-<nombre>`.

**El servidor de producción corre `develop`:** lleva a `main` exactamente el commit que corre
(`git merge --ff-only <commit>` en `main`) y cambia el servidor a `main`.

**El repo está en un espacio personal:** *Settings → General → Advanced → Transfer project* a un grupo, y
actualiza el remoto en servidores y copias locales (`git remote set-url origin <nueva-dirección>`).

**No tiene versiones:**

```bash
git switch main && git pull origin main
git tag -a v0.0.0 -m "v0.0.0 — Versión base al adoptar las buenas prácticas"
git push origin v0.0.0
```

Y en una rama `chore/version-0.0.0`: versión `0.0.0` en el archivo del proyecto, `CHANGELOG.md` y bloque de
§ 2 en el `CLAUDE.md`.

**Ya tenía una `v0.0.0` que no está sobre `main`:** bórrala (`git tag -d v0.0.0` y
`git push origin :refs/tags/v0.0.0`) y vuélvela a poner en `main`. Es la única vez que se mueve una etiqueta.

**Repo vacío o abandonado:** *Settings → General → Advanced → Archive project*. No se borra.

---

## 13. Preguntas frecuentes

**¿Y si mi cambio es de una línea?** Va en su rama igual. Cuesta un minuto y queda registrado por separado.

**¿Puedo trabajar directo en `develop` si soy el único del proyecto?** Mejor no: el día que entra una
segunda persona, el repo ya está en orden.

**¿Cada merge a `develop` es una versión?** No. La versión se sube al liberar a producción, y una liberación
puede juntar varios cambios.

**Mi rama está muy atrás de `develop`.** Trae `develop` a tu rama, resuelve los conflictos ahí, prueba y
luego integra. Nunca al revés.

**¿Qué hago con mis ramas que ya existen con otro nombre?** Termínalas con su nombre. Las nuevas llevan prefijo.

**¿Dónde pruebo si no hay rama `qa`?** En local, y si el proyecto tiene servidor de pruebas, ese servidor
corre `develop`.

**¿Todo cambio necesita OpenSpec?** No. Solo funcionalidad nueva y lo que toca datos, integraciones, permisos o
cálculos fiscales. Una corrección acotada va directo a su rama.

**Ya uso Spec Kit o Superpowers.** Superpowers puedes seguir usándolo como método personal, con sus documentos en
`docs/usuarios/<nombre>/`. Lo que se acuerda construir pasa a OpenSpec. Spec Kit no se usa porque crea ramas
numeradas que chocan con los prefijos.

**¿Tengo que documentar todo lo que ya existe?** No. Lo anterior se queda donde está. La especificación de cómo
funciona hoy el sistema se va llenando con cada cambio archivado.
