# Pruebas E2E en modo servidor

Scripts de Node (runner nativo `node:test`) que usan **Playwright como biblioteca** (`playwright`, no `@playwright/test`).
Se busca primero en `node_modules` del proyecto y si no, en la instalación global de npm (`npm root -g`).

```bash
npm run e2e                                   # levanta todo, corre e2e/tests/*.test.mjs y apaga
npm run e2e -- --test-name-pattern=triaje     # solo las pruebas cuyo nombre coincide
node e2e/servers.mjs                          # deja Postgres + API + Vite corriendo (para depurar)
E2E_EXTERNAL=1 npm run e2e                    # corre contra los servidores ya levantados
```

Qué levanta `servers.mjs` (puertos configurables con variables de entorno):

| Servicio | Puerto | Variable |
|---|---|---|
| PostgreSQL embebido (`embedded-postgres` de `api/`) | 56198 | `E2E_PG_PORT` |
| API (`api/src/server.ts` con tsx, `SEED_DEMO=true`, `COOKIE_SECURE=false`) | 3998 | `E2E_API_PORT` |
| Vite dev (`e2e/vite.config.ts`: la config del proyecto + proxy `/api` con `changeOrigin: false`, `cacheDir` propio) | 5398 | `E2E_WEB_PORT` |

- La base es temporal (se borra al terminar). Con `E2E_EXTERNAL=1` los datos se acumulan entre corridas: las pruebas usan un sufijo único (`RUN`).
- Usuarios: `admin@demo.mx`, `medico@demo.mx`, `enfermeria@demo.mx`, `recepcion@demo.mx` con `MediSuite2026!` (`E2E_DEMO_PASSWORD`).
- Cada prueba inicia sesión con el formulario, hace la acción desde la interfaz, comprueba el dato en la API (sondeo, porque el frontend escribe de forma asíncrona) y vuelve a comprobarlo tras recargar.
- Una prueba falla también si la página tuvo errores de JavaScript o si la app recibió una respuesta 4xx/5xx de la API (las llamadas hechas por la prueba con `api()` se marcan con `x-e2e` y no cuentan).
- Si una prueba falla se guarda `e2e/shots/FALLO-<nombre>.png`.

Archivos: `lib.mjs` (sesión, `campo()` por etiqueta de `<Field>`, `api()`, `esperarServidor()`, `conSesion()`), `tests/NN-*.test.mjs` (una por herramienta, `20-permisos` y `21-recorrido`).
