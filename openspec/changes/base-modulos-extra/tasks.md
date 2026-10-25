# Tareas · base-modulos-extra

## 1. Preparación
- [x] 1.1 `Agustin-Propuesta/` en `.gitignore`
- [x] 1.2 `openspec/project.md`, `openspec/specs/` y `openspec/changes/`
- [x] 1.3 Propuesta y tareas de este cambio

## 2. Módulos opcionales (backend)
- [x] 2.1 Catálogo `MODULOS_OPCIONALES` en `core/modulos.py` con `disponible`
- [x] 2.2 Modelo `TenantModulo` y migración 0051 con su prueba de ida y vuelta
- [x] 2.3 Dependencia `require_modulo(id)` que responde 404 si está apagado
- [x] 2.4 `GET /modulos` y `PUT /modulos/{id}` con permiso `modulos.manage` y bitácora
- [x] 2.5 Pruebas: apagado → 404, encendido → 200, solo admin/master, bitácora, apagar no borra

## 3. Configuración y servicios (backend)
- [x] 3.1 Variables de Orthanc, Whisper, Presidio, IA y segmentador en `config.py` y `.env.example`
- [x] 3.2 `IA_API_KEY` obligatoria en producción si el proveedor la necesita
- [x] 3.3 `services/estado_servicios.py` y `GET /servicios/estado` (permiso `servicios.read`)
- [x] 3.4 Prueba: todo sin configurar → `no_configurado`

## 4. Frontend
- [x] 4.1 Módulos activos en `AuthContext`
- [x] 4.2 `modulo?` en `NavItem` y en las rutas; filtrado probado
- [x] 4.3 Pantallas «Servicios» y «Configuración → Módulos» en `modules/sistema/`
- [x] 4.4 Grupo «Sistema» en el menú, permisos en `MODULE_HIERARCHY`
- [x] 4.5 Recorrido guiado de las dos pantallas

## 5. Infraestructura y cierre
- [x] 5.1 Perfiles `imagen` e `ia` en `docker-compose.yml`
- [x] 5.2 `docs/DESIGN.md`: patrón de módulo opcional
- [x] 5.3 Línea en `CHANGELOG.md`
- [ ] 5.4 `npx tsc --noEmit`, `npm test` y `pytest` en verde
