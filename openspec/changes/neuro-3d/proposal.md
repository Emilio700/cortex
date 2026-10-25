# Neuro 3D

## Por qué

El neurocirujano explica en consulta dónde está la lesión y qué va a hacer la
cirugía con dibujos a mano o con imágenes sueltas de internet. Una hernia L4-L5
que «baja por la pierna» se entiende mucho mejor si el paciente ve la raíz L5, el
disco que la comprime y la piel que esa raíz siente. Cortex no tenía ninguna
herramienta para eso. Es además la carta de presentación del producto ante los
médicos (plan maestro, fila «Neuro 3D»).

## Qué cambia

- **Módulo `frontend/src/modules/neuro3d/`** con la estructura de DESIGN §11.
  - `dominio/`: catálogo anatómico (nombres en español, sistema, capa, color por
    token), niveles C1–sacro, raíces y su agujero, relación segmento medular–
    vértebra, efecto de una hernia por nivel y posición, dermatomas con los puntos
    clave de ASIA, conexiones de una raíz, capas y pelado, vistas y marcas. Puro y
    con pruebas. Lo no seguro va marcado `(verificar)` con su fuente.
  - `servicios/`: escena three.js aislada de React (montaje y liberación
    completos), anatomía procedural (encéfalo, ventrículos, Willis, columna,
    médula, raíces, vías esquemáticas, piel y cráneo), captura PNG y guardado en el
    expediente con el endpoint de imágenes clínicas que ya existe.
  - Interfaz `CapaAnatomica` para cargar en la misma escena, más adelante, las
    mallas del paciente.
- **Pantalla** `AtlasNeuroPage` en `/imagen/neuro-3d` y
  `/pacientes/:patientId/neuro-3d`: capas con opacidad, búsqueda, siete vistas
  (teclas 1–7), cortes, columna despiezada, pelado por capas, flujo opcional en
  Willis, modo «Explicar al paciente» con silueta de dermatomas, captura y aviso
  fijo de modelo esquemático. Sin WebGL, un mensaje claro.
- **Menú**: grupo nuevo «Imagen y señales» con «Neuro 3D». **Expediente**:
  botón «Neuro 3D» en la pestaña Imágenes.
- **Permiso** `neuro3d.read` (médico, administración y master por omisión), en
  `MODULE_HIERARCHY` bajo «Imagen y señales». Sólo por permiso, sin respaldo por
  rol.
- **Dependencia** `three` 0.186.1 (versión exacta) en su paquete `vendor-three`.
- Recorrido guiado `atlas-neuro-3d` (no arranca solo), sección 4.11 de DESIGN y
  línea en el CHANGELOG.

## Impacto

- **Datos**: ninguno nuevo. No hay migración. Guardar una captura crea una imagen
  clínica normal («Imagen de referencia»), con su consentimiento y su bitácora.
- **Permisos**: uno nuevo, de sólo lectura de un modelo educativo; no abre datos
  del paciente. Las sesiones abiertas lo ven cuando se recargan sus permisos (la
  migración de permisos de otro tramo sube `permissions_version`; si este cambio
  se integra solo, hay que cerrar y abrir sesión).
- **Rendimiento**: three.js (≈ 0.7 MB) sólo lo descarga quien abre el atlas.
- **Riesgo clínico**: el modelo es esquemático; la pantalla y la captura lo dicen
  siempre, y el atlas no afirma nada del paciente: las marcas son del médico y no
  se guardan como dato.
