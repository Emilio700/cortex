# Proyecto

## Descripción General

**CORTEX** es el sistema clínico de un consultorio de neurocirugía. Digitaliza la
agenda, la recepción, la consulta y el expediente, con control de acceso por rol
y trazabilidad de lo clínico. Nació como copia de Cortex v1.2.0 (sistema de
ginecología, commit `987df76`) y se adaptó a neurocirugía: ficha neurológica,
consentimientos, órdenes y episodios de neurocirugía, y una identidad visual
propia. Opera como **consultorio único** (un tenant), aunque la infraestructura
multi-sucursal de Cortex sigue disponible.

**Usuarios:**
1. **Médico (neurocirujano):** consulta SOAP, recetas, órdenes de estudio y
   resultados, consentimientos, certificados, cirugías programadas.
2. **Recepción:** agenda, alta de pacientes, triage (signos vitales), documentos,
   entrega de resultados y cobros.
3. **Administración:** usuarios, servicios y precios, salas, reportes, auditoría.
4. **Master:** rol de desarrollador (sucursales, roles y permisos).

**Lo propio de neurocirugía:**
- Ficha: lateralidad, antecedentes neurológicos y neuroquirúrgicos, implantes y
  dispositivos (seguridad en resonancia) y anticoagulantes.
- Señales de implantes y anticoagulantes en el expediente y en la consulta.
- Consentimientos: craneotomía, cirugía de columna, derivación de LCR, biopsia
  estereotáctica, intervencionismo de dolor, nervio periférico y punción lumbar.
- Órdenes: plantillas (prequirúrgico, RM de encéfalo, columna lumbar y cervical,
  epilepsia, nervio periférico, vascular) y categorías Neuroimagen y
  Neurofisiología.
- Citas de tipo cirugía con hospital y anestesiólogo; «Cirugías programadas» en el
  inicio del médico.

**Siguientes módulos previstos:** visor de neuroimagen (DICOM/MRI) y
neurofisiología (EEG, EMG, potenciales evocados).

---

# Arquitectura General

La arquitectura sigue un patrón cliente-servidor tradicional separado (SPA + API RESTful), desplegado mediante contenedores Docker.

## Stack Tecnológico

*   **Frontend (SPA):**
    *   **Framework:** React 19 + Vite.
    *   **Lenguaje:** TypeScript (Strict mode).
    *   **UI Library:** CoreUI Pro 5.8 (basado en Bootstrap).
    *   **Estado:** Redux + React Context.
    *   **Enrutamiento:** React Router v7.
    *   **Interacción de red:** Axios.
*   **Backend (API RESTful):**
    *   **Framework:** FastAPI.
    *   **Lenguaje:** Python 3.11+.
    *   **ORM:** SQLAlchemy 2.0.
    *   **Migraciones:** Alembic.
    *   **Validación y Serialización:** Pydantic v2.
*   **Base de datos:**
    *   PostgreSQL 15+ (Relacional).
*   **Autenticación:**
    *   JSON Web Tokens (JWT) generados con `python-jose`.
    *   Hashing de contraseñas con `bcrypt` (`passlib`).
*   **Infraestructura y Despliegue:**
    *   Docker & Docker Compose para desarrollo local (con contenedores para Backend y PostgreSQL, y pgAdmin opcional).

**Interacción:** El Frontend React interactúa exclusivamente con el Backend FastAPI a través de peticiones HTTP REST. FastAPI actúa como capa intermedia, validando entradas con Pydantic, y gestionando la persistencia y lectura de datos en PostgreSQL mediante SQLAlchemy.

---

# Estructura del Repositorio

El proyecto se divide en dos componentes principales y recursos compartidos:

*   **/backend**: Contiene toda la lógica del servidor, API y modelos de base de datos.
    *   `/backend/app`: Lógica central de la API FastAPI.
        *   `/backend/app/core`: Configuración global, variables de entorno, dependencias de inyección (`deps.py`) y utilidades de seguridad (JWT, hashing).
        *   `/backend/app/db`: Configuración de sesiones y conexión a PostgreSQL.
        *   `/backend/app/models`: Definición de modelos ORM (SQLAlchemy). Representan las tablas.
        *   `/backend/app/schemas`: Modelos de Pydantic para validación de requests y responses.
        *   `/backend/app/routers`: Controladores/Endpoints agrupados por dominio de negocio.
    *   `/backend/alembic`: Archivos de control de versiones y migraciones de la base de datos.
    *   `/backend/scripts`: Scripts utilitarios (ej. `seed.py` para datos iniciales).
*   **/frontend**: Aplicación cliente React (Single Page Application).
    *   `/frontend/src/modules`: Agrupación lógica por rol o gran funcionalidad (ej. `secretaria`, `doctor`). Cada módulo tiene sus propias páginas y componentes específicos.
    *   `/frontend/src/shared`: Código común reutilizable (servicios Axios, hooks genéricos, guards de rutas, tipos).
    *   `/frontend/src/views`: Componentes de páginas generales (ej. Dashboard base).
    *   `/frontend/src/components`: Componentes UI reutilizables (layout, header, footer, sidebar).
    *   `/frontend/src/layout`: Estructura principal de la interfaz visual de CoreUI.
*   **/coreui-pro-source**: Carpeta de referencia que contiene código de inspección de la librería UI.
*   **docker-compose.yml**: Orquestador principal para levantar base de datos y backend en entornos de desarrollo local.

---

# Flujo General del Sistema

1.  **Entrada:** El usuario accede a la URL del frontend y se le presenta la pantalla de Login.
2.  **Autenticación:** Envía credenciales (email/password). El backend verifica contra la base de datos, hashea la contraseña, y si es correcta, devuelve un JWT (`/auth/login`).
3.  **Autorización & Navegación:** El frontend guarda el JWT (generalmente en `localStorage`) y redirige al dashboard correspondiente según el rol extraído (Admin, Secretaria, Doctor).
4.  **Operación / Proceso:** El usuario navega por los módulos (ej. `Secretaria` abre `/secretaria/agenda`). El frontend realiza peticiones GET/POST/PUT/DELETE a los `/routers` de FastAPI (ej. `/appointments`).
5.  **Validación y Transformación:** FastAPI recibe la petición, inyecta dependencias (como el usuario actual vía token, y la sesión de DB). Valida el body usando schemas Pydantic. Si falla, retorna 422.
6.  **Persistencia:** Si es válido, el router utiliza SQLAlchemy para consultar o persistir los datos en PostgreSQL.
7.  **Salida:** El backend formatea la respuesta según el schema Pydantic de salida y la envía al frontend, que actualiza la UI (Redux/Context) reflejando los cambios.

---

# Mapa de Módulos

## Módulo Secretaría

### Objetivo
Gestionar el flujo administrativo del paciente antes de la consulta médica.

### Flujo funcional
Recepción de paciente -> Búsqueda/Registro de paciente -> Agendamiento -> Toma de signos vitales (Triage) -> Carga de documentos previos.

### Componentes involucrados
*   **Frontend:** `/frontend/src/modules/secretaria/pages/*` (`AgendaPage`, `PacientesPage`, `TriagePage`, `DocumentsPage`).
*   **Backend:** `/routers/patients.py`, `/routers/appointments.py`, `/routers/triage.py`.

### Archivos principales
*   Modelos: `app/models/patient.py`, `app/models/appointment.py`, `app/models/triage.py`.
*   Rutas UI: Definidas en `routes.tsx` bajo `/secretaria/*`.

### Dependencias
CoreUI (para tablas/formularios), FullCalendar (para la Agenda).

### Riesgos técnicos
Manejo de concurrencia en la agenda (múltiples secretarias agendando al mismo tiempo).

## Módulo Médico (Doctor)

### Objetivo
Proveer al doctor la capacidad de realizar consultas, revisar expedientes y recetar.

### Flujo funcional
Visualización de agenda del día -> Selección de cita -> Revisión de Triage previo -> Redacción de nota SOAP -> Generación de Prescripción o Certificado Médico.

### Componentes involucrados
*   **Frontend:** `/frontend/src/modules/doctor/pages/*` (`DoctorDashboard`, `DoctorAppointmentsPage`, `ConsultationPage`).
*   **Backend:** `/routers/soap_notes.py`, `/routers/prescriptions.py`, `/routers/medical_certificates.py`, `/routers/doctor_profile.py`.

### Archivos principales
*   Modelos: `app/models/soap_note.py`, `app/models/prescription.py`, `app/models/medical_certificate.py`.

### Riesgos técnicos
Estandarización de las recetas médicas, generación dinámica de PDFs y firmas digitales (previsto para Fase 4).

---

# Base de Datos

Motor: **PostgreSQL 15+**

## Tablas principales

*   **tenants**: Soporte multi-tenant. Permite que el sistema sea utilizado por múltiples clínicas aisladas. Es la raíz de casi todas las relaciones.
*   **users**: Almacena credenciales de acceso, rol (Enum: Admin, Secretaria, Doctor), y referencia al tenant. Relacionado con perfiles específicos (ej. `DoctorProfile`).
*   **patients**: Información demográfica e identificativa de los pacientes. Relacionado con `tenants`.
*   **appointments**: Citas médicas. Une a un `patient` con un `user` (doctor), tiene estados (programada, completada, cancelada).
*   **triages**: Registro de signos vitales y síntomas iniciales. Tiene una relación 1-a-1 estricta con `appointments`.
*   **soap_notes**: Notas clínicas de evolución. Generadas durante la consulta. Relacionadas con la cita.
*   **prescriptions**: Recetas emitidas. Relacionadas con la cita.
*   **medical_certificates**: Justificantes médicos.
*   **documents** / **patient_documents**: Archivos físicos subidos (PDFs, imágenes de ultrasonido).

**Resumen de relaciones (Jerarquía principal):**
`Tenant` -> (`Users`, `Patients`)
`Patient` -> `Appointments` -> (`Triage`, `SOAPNote`, `Prescriptions`)
`User (Doctor)` -> `Appointments`

---

# Modelos de Negocio

*   **Entidades principales:** Inquilino (Clínica), Usuario, Paciente, Cita, Consulta (compuesta por Triage + SOAP + Prescripción).
*   **Reglas de negocio:**
    *   Aislamiento de datos: Un usuario de un Tenant (Clínica A) no puede bajo ninguna circunstancia acceder a registros (pacientes, citas) del Tenant (Clínica B). Esta es una restricción arquitectónica (Soft-delete / Tenant ID en queries).
    *   Roles estrictos: Las acciones están capadas por rol. La secretaria no crea notas SOAP, el doctor no administra usuarios.
    *   Flujo de Cita: Una cita debe tener un Triage completado (opcionalmente) antes de que el médico comience la nota SOAP.

---

# APIs

## APIs Internas

La API está documentada dinámicamente vía Swagger UI (`/docs`). Endpoints principales organizados por router:

*   **/auth/login**: `POST` (Login credentials -> Retorna JWT). Dependencias: `app.core.security`.
*   **/users**: CRUD de usuarios.
*   **/appointments**: `GET` (Listar agenda), `POST` (Crear cita), `PUT` (Actualizar estado).
*   **/patients**: `GET` (Búsqueda por ID/Nombre), `POST` (Registro).
*   **/triage**: `POST`, `GET` asociado a Appointment_ID.
*   **/soap-notes**: `POST`, `GET` asociado a Appointment_ID.
*   **/prescriptions**: `POST`, `GET`.
*   **/medical-certificates**: `POST`, `GET`.
*   **/patient-documents**: Subida y descarga de archivos físicos.

## APIs Externas

Actualmente el sistema no parece tener integraciones externas (como pasarelas de pago o APIs de mensajería SMS/Email) configuradas de base, aunque la arquitectura permite integrarlas fácilmente en la capa de `services`.

---

# Autenticación y Autorización

Implementado en `backend/app/core/security.py` y `backend/app/routers/auth.py`.

*   **Login & Sesiones:** No hay sesiones persistentes en base de datos. Es un modelo Stateless basado en **JWT** (JSON Web Tokens).
*   **Hashing:** Las contraseñas en DB (`users.hashed_password`) se protegen mediante **bcrypt** con factor de costo 12.
*   **Tokens:** Al autenticarse, `/auth/login` retorna un Access Token (tiempo de expiración por defecto 30 minutos, definido en `.env`).
*   **Autorización / Permisos:** Se realiza vía **Dependencias de FastAPI** (Dependencies Injection) en `backend/app/core/deps.py`. Cada router sensible exige la inyección de la dependencia `get_current_active_user`. Dentro de los routers se verifica el rol asociado al usuario desencriptado del JWT.
*   **Frontend:** Almacena el token de manera local, lo envía en las cabeceras (`Authorization: Bearer <token>`) a través de un interceptor de Axios. Usa `React Context` o `Redux` para manejar el estado visual de la sesión (mostrar/ocultar menús según el rol).

---

# Flujo de Datos

1.  **Origen:** Interfaz de usuario React. Formularios capturan datos tipados.
2.  **Tránsito (Red):** JSON serializado enviado vía HTTP(s).
3.  **Validación Frontera (Backend):** Pydantic (schemas en `/app/schemas/`) intercepta el request. Si el JSON no hace match estricto con los tipos, se corta el flujo (HTTP 422).
4.  **Transformación y Lógica:** Los routers en FastAPI toman los objetos validados. Si es necesario, aplican lógica de negocio (ej. verificar que la cita no se traslape).
5.  **Persistencia:** Se mapean los datos al objeto SQLAlchemy (modelo en `/app/models/`) y se hace `session.commit()`.
6.  **Consumo:** Los datos viajan de vuelta serializados a JSON hacia React, donde son asimilados por el gestor de estado e hidratan la UI (CoreUI).

---

# Componentes Críticos

*   **Manejo de Tenants:** Toda consulta a la base de datos debe filtrar estrictamente por el `tenant_id` del usuario autenticado. Una fuga de este dato expondría información confidencial entre clínicas (Riesgo HIPAA/Datos Sensibles).
*   **Sistema de Documentos (`/routers/patient_documents.py`):** La carga y descarga de archivos físicos (posiblemente usando la carpeta `/backend/uploads`). Requiere validación estricta de tipos de archivo (MIME types) para evitar ejecución de scripts maliciosos.
*   **JWT Core (`/app/core/security.py`):** Si la `SECRET_KEY` se compromete, todo el sistema de autenticación cae.

---

# Convenciones del Proyecto

*   **Nomenclatura (Backend Python):** `snake_case` para variables y funciones, `PascalCase` para clases (Modelos y Schemas).
*   **Nomenclatura (Frontend TypeScript):** `camelCase` para variables/funciones, `PascalCase` para Componentes de React e interfaces. Archivos de React usan extensión `.tsx`.
*   **Patrones de diseño:**
    *   Backend: Repository Pattern (implementado implícitamente en los routers/db interactions), Dependency Injection Pattern (propio de FastAPI).
    *   Frontend: Container/Presentational Pattern (divisiones lógicas en `modules` y `views`), Hooks genéricos.
*   **Organización:** Altamente modular, separando estrictamente base de datos (Models) de validación API (Schemas).

---

# Dependencias Técnicas

**Backend (`requirements.txt` / `pyproject.toml` deducidos):**
*   FastAPI (Framework core).
*   Uvicorn (Servidor ASGI).
*   SQLAlchemy 2.0 (ORM).
*   Alembic (Migraciones DB).
*   python-jose[cryptography] (Generación y validación JWT).
*   passlib[bcrypt] (Hashing).
*   pydantic v2.

**Frontend (`package.json`):**
*   React 19, react-dom.
*   Vite (Bundler).
*   @coreui/react-pro, @coreui/icons-react.
*   react-router-dom v7.
*   axios.
*   react-redux, @reduxjs/toolkit.
*   fullcalendar (Para Agenda).

---

# Deuda Técnica Detectada

*(Basado en la estructura y el roadmap del README)*
*   ~~**Manejo de Estado Frontend:** sesión dispersa en `localStorage`.~~ **Resuelto (Fase 3):** centralizada en `AuthContext` (Context único reactivo). Redux queda solo para UI (theme/sidebar).
*   ~~**Hardcoding Local:** CORS_ORIGINS forzadas en `main.py`.~~ **Resuelto (Fase 3):** los orígenes se gobiernan por `CORS_ORIGINS` (.env) y los locales solo se añaden si `ENVIRONMENT == "development"`.
*   **Almacenamiento de Archivos:** La carpeta `backend/uploads/` sugiere almacenamiento local de archivos de pacientes. Esto no escala bien horizontalmente en entornos cloud. Deuda futura: Migrar a un bucket S3 o similar.
*   **Credenciales demo en el Login:** `views/pages/login/Login.tsx` muestra usuarios/contraseñas demo en pantalla y textos en inglés. Debe ocultarse según `ENVIRONMENT` y traducirse. *(Planeado Fase 2.)*

---

# Bitácora de Mejoras — Fase 1 (Seguridad y RBAC)

Auditoría realizada como Tech Lead sobre el código real. **Fase 1 aplicada y verificada** (`vite build` OK; `py_compile` OK). Cambios de bajo riesgo / alto impacto, sin alterar la arquitectura.

**Bugs corregidos:**
1.  **[Crítico] `GET /users` era público y sin filtro de tenant** (`routers/users.py`). Exponía todos los usuarios de todas las clínicas sin autenticación → fuga multi-tenant (riesgo HIPAA). Ahora exige `get_current_user`, filtra por `tenant_id` y acepta un filtro opcional `?role=`. El `AgendaPage` se actualizó para pedir `?role=doctor` al backend en vez de filtrar en cliente (ya no trae doctores de otros tenants).
2.  **[Crítico] RBAC del frontend inexistente:** `RoleGuard` estaba definido pero no se usaba; cualquier usuario veía todas las rutas y todo el menú. Ahora `routes.tsx` declara `roles` por ruta (Secretaría → secretaria+admin, Doctor → doctor+admin) y `AppContent.tsx` envuelve las rutas protegidas con `RoleGuard`.
3.  **[Crítico] Ruta `/403` inexistente:** `RoleGuard` redirigía a `/403` que no estaba registrada. Se creó `views/pages/page403/Page403.tsx` (estilo coherente con Page404) y se registró en `App.tsx`.
4.  **[Medio] `list_my_appointments` no filtraba por `tenant_id`** (`routers/appointments.py`). Se añadió el filtro junto a `doctor_id`.

**Mejoras de flujo:**
*   **Menú lateral por rol:** `_nav.tsx` ahora declara `roles` por ítem y expone `filterNavByRole`; `AppSidebar.tsx` filtra según el rol del usuario almacenado. Una secretaria ya no ve la sección Doctor y viceversa.

**Verificación:** `npm run build` (frontend) compila correctamente; `python -m py_compile` valida la sintaxis de los routers modificados. El `type-check` (`tsc`) arroja errores **preexistentes** de la plantilla CoreUI (`'React' is declared but never read` en decenas de archivos `views/*`), no introducidos por estos cambios.

**Próximas fases:** Fase 2 (UX/idioma/feedback de errores), Fase 3 (centralizar estado de sesión + limpiar CORS), Fase 4 (testing base: Vitest + pytest).

---

# Bitácora de Mejoras — Fase 2 (UX, idioma y feedback de errores)

**Fase 2 aplicada y verificada** (`vite build` OK). Cambios de bajo riesgo, reutilizando componentes y patrones existentes de CoreUI.

**Mejoras aplicadas:**
1.  **Login en español + redirección por rol** (`views/pages/login/Login.tsx`): se tradujeron todos los textos (estaban en inglés) y, tras autenticar, se redirige según el rol — Admin → `/dashboard`, Secretaria → `/secretaria/agenda`, Doctor → `/doctor/dashboard` (mapa `DEFAULT_ROUTE_BY_ROLE`). Antes siempre iba a `/dashboard`.
2.  **Credenciales demo ocultas en producción**: el bloque de credenciales de prueba ahora solo se renderiza con `import.meta.env.DEV`. En build de producción no se expone.
3.  **Sistema de toasts reutilizable** (`shared/components/ToastProvider.tsx`): provee el hook `useToast()` (`showSuccess`/`showError`/`showToast`) construido sobre `CToaster` (API `push`). Montado una sola vez en `DefaultLayout`, disponible para todas las páginas de módulos.
4.  **Feedback de errores donde había fallos silenciosos**: `AgendaPage` (carga de citas y de doctores) y `PacientesPage` (carga de pacientes) ahora muestran toast de error en vez de solo `console.error`; `PacientesPage` además muestra toast de éxito al crear/editar. *(`TriagePage` y `DocumentsPage` ya mostraban el error vía `CAlert` del hook, por lo que no se tocaron para no duplicar el mensaje.)*

**Convención nueva:** para feedback al usuario, usar `useToast()` desde cualquier página dentro de `DefaultLayout`, respetando el contrato de los formularios (los `onSubmit` deben **lanzar** en error para que el modal permanezca abierto y muestre el mensaje inline).

**Verificación:** `npm run build` compila correctamente (incluye `Login` y `ToastProvider`).

---

# Bitácora de Mejoras — Fase 3 (Estado de sesión centralizado + CORS)

**Fase 3 aplicada y verificada** (`vite build` OK; `py_compile` OK). Decisión tomada con el usuario: centralizar en **React Context** (no en Redux), porque el store actual es un store mínimo de flags de UI con un reducer "mágico" y meter el dominio de auth ahí sería forzar el patrón.

**Cambios aplicados:**
1.  **`shared/context/AuthContext.tsx` (nuevo):** `AuthProvider` + hook `useAuth()` exponiendo `{ user, loading, isAuthenticated, login, logout }`. Hidrata desde `localStorage` al montar y mantiene `user` reactivo. `isAuthenticated` es **token-based** para evitar parpadeo de redirección durante la hidratación. `login()` devuelve el `User` para la redirección por rol.
2.  **Montaje único en `App.tsx`:** `AuthProvider` envuelve el `HashRouter`, disponible para guards, sidebar y header.
3.  **Consumidores migrados** (ya no leen `localStorage` directo): `ProtectedRoute` y `RoleGuard` (este último espera la hidratación con un spinner antes de evaluar el rol), `AppSidebar` (filtro de menú por rol), `AppHeaderDropdown` (perfil + logout reactivo), `Login` (usa el `User` devuelto por `login`).
4.  **Hook obsoleto eliminado:** `shared/hooks/useAuth.ts` (reemplazado por el del contexto). Único acceso a `localStorage` para sesión: `AuthContext` (que delega en `shared/services/auth.ts`).
5.  **CORS saneado (`backend/app/main.py`):** se eliminó el `extend` incondicional de orígenes locales. Ahora `origins = settings.cors_origins_list` y los orígenes de desarrollo solo se agregan si `ENVIRONMENT == "development"`. En producción el CORS queda restringido a lo definido en `.env`.

**Convención nueva:** para leer/escribir la sesión usar `useAuth()` del `AuthContext`; no llamar `getStoredUser()`/`isAuthenticated()` desde componentes.

**Nota / deuda residual:** el interceptor 401 de Axios (`shared/services/api.ts`) sigue haciendo `window.location.href` + limpieza de `localStorage` en caso de token inválido. Es un reload duro que re-hidrata el contexto, así que es consistente, pero a futuro podría integrarse con `logout()` del contexto para una salida sin recarga.

**Verificación:** `npm run build` OK (sin imports rotos tras eliminar el hook); `python -m py_compile app/main.py` OK.

**Próxima fase:** Fase 4 — testing base (Vitest en frontend, pytest en backend) con smoke tests de auth/RBAC.

---

# Bitácora de Mejoras — Fase 4 (Testing base)

**Fase 4 aplicada y verificada** (suites en verde). Se montó la infraestructura de pruebas que faltaba por completo, con smoke tests centrados en lo más crítico (auth/RBAC).

**Frontend (Vitest + Testing Library + jsdom):**
*   Config en `vite.config.mts` (bloque `test`: `jsdom`, `globals`, `setupFiles`, `include` solo de `*.test/spec`). Setup en `src/test/setup.ts` (jest-dom + limpieza de `localStorage`/cleanup entre tests).
*   Scripts: `npm test` (`vitest run`) y `npm run test:watch`.
*   Tests (12, todos en verde):
    *   `src/_nav.test.tsx` — `filterNavByRole` por rol (secretaria/doctor/admin/sin usuario).
    *   `src/shared/guards/RoleGuard.test.tsx` — render permitido, redirección a `/403`, redirección a `/login`, y espera durante la hidratación.
    *   `src/shared/services/auth.test.ts` — `isAuthenticated`/`getStoredUser`/`hasRole` sobre `localStorage`.

**Backend (pytest):**
*   `tests/conftest.py` fija `DATABASE_URL`/`SECRET_KEY`/`ENVIRONMENT` antes de importar la app (sin .env ni conexión real; el engine es lazy).
*   Tests (5, todos en verde):
    *   `tests/test_security.py` — roundtrip de hashing bcrypt y contenido del JWT (`sub`/`role`/`exp`).
    *   `tests/test_rbac.py` — `require_role` permite el rol listado, bloquea con 403 los demás, y aplana el argumento lista.

**Cómo correr:**
*   Frontend: `cd frontend && npm test`
*   Backend: `cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt && .venv\Scripts\python -m pytest`

**Deuda menor de deprecaciones — CORREGIDA (post-Fase 4):**
*   `app/db/session.py`: `declarative_base` migrado de `sqlalchemy.ext.declarative` a `sqlalchemy.orm` (API 2.0).
*   `app/core/security.py`: el `exp` del JWT usa ahora `datetime.now(timezone.utc)` (aware) en vez de `datetime.utcnow()`.
*   **14 modelos** (`app/models/*`): los `default`/`onupdate` de columnas de fecha usaban `datetime.utcnow` (deprecado). Se centralizó en un helper `utcnow()` en `app/db/session.py` que devuelve **UTC naive** (`datetime.now(timezone.utc).replace(tzinfo=None)`), drop-in exacto que mantiene idénticos los valores almacenados (las columnas no son timezone-aware). Imports de `datetime` sin uso eliminados.
*   **Verificado:** todos los modelos importan; `pytest -W error::DeprecationWarning` pasa 5/5 (ninguna deprecación en los paths ejecutados); el helper devuelve `tzinfo=None`.

**Próximos pasos de testing (no incluidos):** tests de integración de routers con base de datos de prueba (SQLite/Postgres efímero + `TestClient`), validando aislamiento multi-tenant end-to-end.

---

# Pendientes Técnicos Detectados

*   **Módulo de Secretaría (Frontend):** Las páginas de Agenda, CRUD de Pacientes, Formularios de Triage y Documentos están creadas a nivel enrutamiento pero (según Roadmap) en proceso de desarrollo activo ("Phase 2").
*   **Módulo Médico (Frontend):** Desarrollo de tableros de control (KPIs), expedientes obstétricos, redactor de SOAP y catálogos de medicamentos ("Phase 3").
*   **Motor PDF (Backend):** Implementación de la generación de PDF para recetas con firma digital rastreable ("Phase 4").
*   ~~**Testing:** Falta implementación de pruebas automatizadas.~~ **Iniciado (Fase 4):** infraestructura base lista — Vitest (frontend) y pytest (backend) con smoke tests de auth/RBAC. Pendiente: ampliar cobertura (routers con DB de prueba, hooks, formularios).

---

# Guía de Extensión del Proyecto

**Cómo agregar un nuevo módulo o API (Ej. "Facturación"):**

1.  **Backend - Modelo DB:** Crear `backend/app/models/invoice.py` definiendo la clase de SQLAlchemy. Agregarla a `backend/app/models/__init__.py`.
2.  **Backend - Migración DB:** Correr `alembic revision --autogenerate -m "Add invoice table"`, revisar el archivo generado y correr `alembic upgrade head`.
3.  **Backend - Schema Pydantic:** Crear `backend/app/schemas/invoice.py` con `InvoiceCreate`, `InvoiceResponse`.
4.  **Backend - Router FastAPI:** Crear `backend/app/routers/invoices.py`, implementar los métodos GET/POST e inyectar `Depends(get_current_active_user)`.
5.  **Backend - Conectar API:** Añadir `app.include_router(invoices.router)` en `backend/app/main.py`.
6.  **Frontend - Módulo UI:** Crear carpeta `frontend/src/modules/facturacion/pages/`. Desarrollar los componentes React (`.tsx`).
7.  **Frontend - Enrutamiento:** Importar las páginas lazy load y agregar las rutas en `frontend/src/routes.tsx` asegurando el acceso por rol correcto.

---

# Mapa de Navegación para IA

**Atajos cognitivos para sesiones futuras de Claude:**

*   **¿Si quiero modificar la Autenticación o Reglas de Contraseñas?**
    *   `backend/app/core/security.py` (Lógica de tokens y hashes).
    *   `backend/app/routers/auth.py` (Endpoints de Login).
    *   `backend/app/core/deps.py` (Inyección y validación de tokens en rutas seguras).
*   **¿Si quiero modificar la estructura de la base de datos (Ej. Agregar campos a Paciente)?**
    *   `backend/app/models/patient.py` (Agrega la columna SQLAlchemy).
    *   `backend/app/schemas/patient.py` (Agrega el campo a Pydantic para validación API).
    *   Ejecutar comando: `alembic revision --autogenerate -m "desc"` -> `alembic upgrade head`.
*   **¿Si quiero agregar una nueva pantalla en el Frontend?**
    *   1. Crear archivo en `frontend/src/modules/<modulo_correspondiente>/pages/MiPagina.tsx`.
    *   2. Registrar la ruta en `frontend/src/routes.tsx`.
    *   3. Añadir el enlace en la barra de navegación lateral editando (probablemente) `frontend/src/_nav.tsx` o similar en la carpeta layout/components.
*   **¿Si quiero modificar la Agenda de Secretaría?**
    *   Backend: `backend/app/routers/appointments.py`.
    *   Frontend: `frontend/src/modules/secretaria/pages/AgendaPage.tsx`.

---

# Conocimiento Acumulado del Proyecto

*   **El paradigma del proyecto es Multi-Tenant de base de datos única:** A diferencia de arquitecturas multi-tenant con esquemas separados, Cortex utiliza una sola base de datos y aisla las clínicas lógicamente filtrando todos los queries de SQLAlchemy utilizando la relación `tenant_id`. Esta es la decisión arquitectónica más importante del sistema.
*   El proyecto es una **migración** desde un sistema legado en FoxPro. Esto sugiere que las reglas de negocio, flujos y diccionarios de datos ya están probados históricamente en producción; la complejidad radica en mapearlos correctamente a web sin perder fluidez.

---

# Resumen Técnico para Futuras Sesiones de IA

CORTEX es un **SaaS Médico (React 19 + FastAPI + Postgres)**. La arquitectura es fuertemente tipada end-to-end (TypeScript en frontend, Pydantic/Mypy en backend). Utiliza un sistema **Multi-Tenant (Lógico)** y un **RBAC (Admin, Secretaria, Doctor)** gestionado vía **JWT Stateless**. El flujo principal interconecta la recepción del paciente (módulo Secretaria, manipula `appointments` y `triages`) con la atención clínica (módulo Doctor, manipula `soap_notes` y `prescriptions`). Riesgo principal: Aislamiento estricto de datos entre Tenants y estandarización del motor de PDFs para recetas que está pendiente de construcción. El sistema local levanta vía Docker Compose (`docker-compose up -d`). Para crear APIs nuevas, el flujo es siempre: *Modelo (DB) -> Migración (Alembic) -> Schema (Pydantic) -> Router (FastAPI) -> Vista (React)*.
