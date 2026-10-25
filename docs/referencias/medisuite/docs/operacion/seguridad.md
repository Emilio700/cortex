# Seguridad: lista de verificación y respuesta a incidentes

Los datos de salud son **datos personales sensibles**. Esta guía resume las medidas técnicas y administrativas mínimas para operar MediSuite en producción. No sustituye un análisis de riesgos propio ni asesoría legal (ver [cumplimiento.md](cumplimiento.md)). El resultado de la última revisión de seguridad del código y del despliegue está en [revision-seguridad.md](revision-seguridad.md).

## 1. Lista de verificación

Revísala al instalar y luego cada 3 meses. Marca y fecha cada punto en tu bitácora de operación.

### Antes de capturar pacientes reales

- [ ] HTTPS activo con certificado válido; `http://` redirige a `https://` (Caddy lo hace solo). HSTS presente (`Strict-Transport-Security: max-age=31536000; includeSubDomains`).
- [ ] `curl -sI https://TU-DOMINIO/ | grep -i content-security-policy` devuelve la CSP.
- [ ] `SEED_DEMO=false`. No hay usuarios `@demo.mx`.
- [ ] `MASTER_KEY`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` y llave privada `age` guardados **fuera** del servidor; `.env` con permisos `600`.
- [ ] La API usa el rol restringido: `docker compose exec api printenv DATABASE_URL` empieza con `postgres://medisuite_app:`; `db-init` terminó con código 0.
- [ ] `curl -i https://TU-DOMINIO/api/metrics` responde `404` (métricas solo por red interna).
- [ ] Respaldos **cifrados** (`BACKUP_AGE_RECIPIENTS`): si no, `docker compose logs backup` muestra «respaldo SIN cifrar».
- [ ] `ADMIN_PASSWORD` eliminado del `.env` tras el primer arranque; contraseña del administrador cambiada.
- [ ] **Verificación en dos pasos (2FA)** activa para todos los administradores y médicos (recomendado: todos).
- [ ] Una cuenta por persona; roles mínimos necesarios; nadie comparte contraseñas.
- [ ] Respaldos cifrados funcionando y **una restauración de prueba exitosa** ([respaldos.md](respaldos.md)).
- [ ] Aviso de privacidad publicado y mecanismo de consentimiento expreso por escrito ([plantilla](aviso-privacidad-plantilla.md)).
- [ ] Contratos / términos revisados con los encargados: hosting, almacenamiento S3, proveedor de IA (si se usa), WhatsApp, Jitsi.
- [ ] Servidor endurecido (sección 2). Solo puertos 22, 80 y 443 abiertos.

### Periódico

| Frecuencia | Tarea |
|---|---|
| Semanal | Revisar **Sistema → Bitácora** (sección 4); revisar `docker compose ps` (todo `healthy`) |
| Mensual | Prueba de restauración; aplicar actualizaciones de MediSuite e imágenes; revisar usuarios activos (dar de baja a quien ya no colabora **el mismo día** que se va) |
| Trimestral | Esta lista completa; revisar alertas de Dependabot / avisos de seguridad; capacitar al personal (phishing, contraseñas, bloqueo de pantalla) |
| Anual | Rotar secretos (sección 5); prueba de desastre completa; revisar aviso de privacidad y análisis de riesgos |

## 2. Servidor

```bash
# SSH solo con llave, sin root (en /etc/ssh/sshd_config):
#   PasswordAuthentication no
#   PermitRootLogin no
#   KbdInteractiveAuthentication no
sudo systemctl restart ssh

# Firewall
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable && sudo ufw status verbose
# Mejor aún: limita SSH a tu IP o VPN:  sudo ufw allow from 203.0.113.10 to any port 22 proto tcp

# fail2ban para SSH
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled  = true
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
sudo systemctl enable --now fail2ban && sudo fail2ban-client status sshd

# Actualizaciones automáticas de seguridad
sudo apt -y install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
# Opcional: reinicio automático nocturno si un parche lo requiere
echo 'Unattended-Upgrade::Automatic-Reboot "true"; Unattended-Upgrade::Automatic-Reboot-Time "04:30";' | sudo tee /etc/apt/apt.conf.d/52reinicio

# Hora sincronizada (necesaria para 2FA y la bitácora)
timedatectl   # "System clock synchronized: yes"
```

Notas:

- **Docker y ufw:** los puertos publicados por Docker se saltan ufw. Por diseño solo `caddy` publica 80/443; `db` y `api` no tienen `ports:` y `db` está en una red interna sin Internet. No cambies eso.
- La API ya limita intentos de inicio de sesión (5 fallidos → bloqueo de 15 min; 10/min por IP). No hace falta fail2ban para la app; si lo quieres, usa los registros JSON de Caddy (`docker compose logs caddy`).
- Activa el cifrado de disco/volúmenes que ofrezca tu proveedor y sus snapshots.
- Acceso administrativo remoto: preferible por VPN (WireGuard/Tailscale) en lugar de SSH abierto a Internet.

## 3. Aplicación

| Control | Cómo está implementado | Qué te toca |
|---|---|---|
| HTTPS / HSTS | Caddy + Let's Encrypt; HSTS 1 año | Nada. Considera `preload` solo si todo tu dominio es HTTPS |
| Contraseñas | scrypt; mínimo 10 caracteres; bloqueo tras 5 fallos | Política interna: frases largas, gestor de contraseñas |
| 2FA (TOTP) | Menú del usuario → *Activar verificación en dos pasos* | Exigirlo a todo el personal; el administrador puede reiniciarlo si alguien pierde el teléfono (verifica identidad en persona) |
| Roles | `admin`, `medico`, `enfermeria`, `recepcion` aplicados en el servidor (ver `docs/api.md`) | Asignar el mínimo; recepción no ve antecedentes ni notas |
| Sesiones | Expiran a los **30 min de inactividad** o **12 h** absolutas; cookie `HttpOnly`, `Secure`, `SameSite=Strict` | Bloquear la pantalla de la computadora al levantarse (Win+L / Ctrl+Cmd+Q) |
| Bitácora | Solo inserción (un *trigger* impide modificarla): logins, fallos, lecturas de expediente, cambios, firmas, adendas, descargas, exportaciones, con IP | Revisión semanal (sección 4) |
| Notas firmadas | No se editan ni borran; correcciones por adenda con autor y hora del servidor | — |
| CSP y encabezados | `deploy/web/security-headers.caddy`: CSP restrictiva, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara/micrófono solo propios y Jitsi) | Si agregas servicios en otro dominio: `CSP_CONNECT_EXTRA` en `.env` |
| Archivos subidos | Máx. 25 MB, nombre aleatorio, tipo detectado por contenido, se sirven con `CSP: sandbox` y solo con sesión | — |
| Base de datos | La API trabaja con `medisuite_app` (sin DDL, sin `UPDATE/DELETE/TRUNCATE` en la bitácora, sin borrar datos clínicos); solo las migraciones usan el dueño | No uses el rol dueño en herramientas externas salvo para mantenimiento |
| Métricas | `/api/metrics` bloqueado en Caddy (`404`); Prometheus lo lee por la red interna con `METRICS_TOKEN` | — |
| Webhook de WhatsApp | Público pero con firma HMAC (`WHATSAPP_APP_SECRET`) verificada en tiempo constante sobre el cuerpo crudo | No compartas el App Secret; rótalo en Meta si se expone |
| Contenedores | `no-new-privileges`, sin *capabilities*, sistema de archivos de solo lectura (api, web), API sin root | No agregues `privileged`, `ports:` a `db`/`api` ni volúmenes del *socket* de Docker |
| IA externa | El Asistente desidentifica (Presidio + reglas locales) antes de enviar a la API de Anthropic; la llave de API se captura en Configuración | Decide si se permite; infórmalo en el aviso de privacidad; no pegues identificadores en el texto libre |

### Sobre la CSP

La política (resumen) es: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: <onnxruntime en jsDelivr>; worker-src 'self' blob:; connect-src 'self' Hugging Face, api.anthropic.com; frame-src 'self' blob: https://meet.jit.si; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. No usa `'unsafe-eval'` ni scripts en línea. Se verificó con Chromium cargando inicio, pacientes, DICOM (estudio demo), OCR (ejemplo con tesseract), goniómetro y pulso (MediaPipe con cámara simulada), telemedicina (Jitsi + pizarra), visor 3D, anatomía, patología, ECG, escalas, receta (impresión con iframe `blob:`) sin violaciones. Si actualizas dependencias, repite la prueba (ver `deploy/web/security-headers.caddy`).

Para no depender de jsDelivr (Whisper en el navegador) y de Hugging Face, sirve los modelos y el WASM de onnxruntime desde tu dominio y pon `CSP_ORT_SRC=off`.

## 4. Revisión de la bitácora (semanal, 10 minutos)

**Sistema → Bitácora** (solo administradores). Busca:

- Muchos `Inicio fallido` para un usuario o desde una IP desconocida (¿ataque de contraseñas?).
- Inicios de sesión a horas o desde ubicaciones inusuales.
- `ver_expediente` de pacientes que no tienen cita con ese usuario (curiosidad indebida — p. ej. familiares, personas conocidas).
- `exportar` o `descargar_archivo` masivos.
- Cambios de usuarios/roles que nadie solicitó.

Documenta la revisión (fecha, quién, hallazgos). Ante algo sospechoso, sigue la sección 7.

## 5. Secretos y su rotación

| Secreto | Dónde vive | Rotación |
|---|---|---|
| Contraseñas de usuarios | BD (scrypt) | Cada usuario: menú → *Cambiar contraseña*. Obligatorio tras un incidente |
| `POSTGRES_PASSWORD` | `.env`, BD | Anual o tras incidente (procedimiento abajo) |
| `APP_DB_PASSWORD` | `.env`, BD | Anual o tras incidente: genera otra (`openssl rand -hex 24`), cámbiala en `.env` y `docker compose up -d` (`db-init` la aplica y la API se recrea) |
| `METRICS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` | `.env` | Anual: nuevo valor en `.env` (y en Prometheus / Meta), `docker compose up -d api` |
| `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `FACTURAPI_KEY`, `SMTP_PASS` | `.env` y consola del proveedor | Anual o al salir alguien que tuvo acceso: genera el nuevo en el proveedor, `.env`, `docker compose up -d api`, revoca el anterior |
| Credenciales S3 | `.env` | Anual: crea llave nueva en el proveedor, cámbiala en `.env`, `docker compose up -d backup`, borra la vieja |
| `SERVICIOS_HASH` | `.env` | Anual / al salir alguien que la conocía |
| Llave `age` de respaldos | Fuera del servidor | Al salir alguien que tenía acceso: genera una nueva, actualiza `BACKUP_AGE_RECIPIENTS`; conserva la vieja para leer respaldos anteriores hasta que expiren |
| Llave de API de IA | Configuración de MediSuite (navegador) | Revócala en la consola del proveedor si se expone |
| `MASTER_KEY` | `.env` | **La versión actual de la API no soporta rotarla** (cifra secretos 2FA y llaves de firma). Protégela como la llave más crítica. Si se compromete: trata el caso como incidente; la rotación requeriría re-cifrar `org_keys` y secretos TOTP (pendiente de implementar en `api/`) |

Rotar `POSTGRES_PASSWORD`:

```bash
cd ~/medisuite/deploy
NUEVA=$(openssl rand -base64 24 | tr -d '/+=')
docker compose exec db psql -U medisuite -d medisuite -c "ALTER USER medisuite PASSWORD '$NUEVA'"
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NUEVA/" .env
docker compose up -d                   # recrea api (DATABASE_URL_MIGRATIONS), backup y db-init con la nueva
docker compose exec backup backup.sh now
```

## 6. Equipos del consultorio

- Navegador actualizado (Chrome/Edge), sistema operativo con actualizaciones, antivirus del sistema activo, disco cifrado (BitLocker/FileVault).
- Usuarios de Windows/macOS individuales con contraseña y bloqueo automático a los 5 minutos.
- No guardar contraseñas de MediSuite en navegadores compartidos; usar un gestor de contraseñas.
- Tabletas para firma de consentimientos: modo invitado o perfil dedicado, sin sesiones abiertas de otros servicios.
- Descargas (PDF de recetas, expedientes exportados): no dejarlas en carpetas compartidas; bórralas cuando ya no sean necesarias.

## 7. Respuesta a incidentes

Un incidente es cualquier evento que afecte la confidencialidad, integridad o disponibilidad de los datos: robo de credenciales, acceso indebido de un empleado, laptop perdida con descargas, servidor comprometido, ransomware, respaldo expuesto, envío de datos a la persona equivocada.

### Pasos

1. **Contener (primeras horas)**
   - Desactiva usuarios comprometidos (**Sistema → Usuarios**) — esto cierra sus sesiones.
   - Si el servidor podría estar comprometido: toma un *snapshot* del proveedor (evidencia) y luego `docker compose stop caddy` para cortar el acceso externo.
   - Revoca llaves expuestas (S3, IA, SSH).
2. **Preservar evidencia**: exporta la bitácora (**Sistema → Bitácora**), `docker compose logs --since 168h > incidente-logs.txt`, `/var/log/auth.log`, snapshots. No borres nada.
3. **Evaluar**: qué datos, de cuántos pacientes, desde cuándo, quién tuvo acceso, si había cifrado (respaldos `.age`, disco). Determina si la vulneración **afecta de forma significativa los derechos patrimoniales o morales** de los titulares (en datos de salud, casi siempre sí).
4. **Erradicar y recuperar**: corrige la causa (parche, contraseña, permisos), rota secretos (sección 5), restaura desde un respaldo limpio si hubo alteración ([respaldos.md](respaldos.md)), reactiva el servicio.
5. **Notificar** (ver abajo).
6. **Documentar y aprender**: informe con cronología, causa raíz, datos afectados, medidas adoptadas y cambios para evitar que se repita. Actualiza el análisis de riesgos y capacita al personal.

### Deber de notificar (LFPDPPP 2025)

La **Ley Federal de Protección de Datos Personales en Posesión de los Particulares** publicada en el DOF el 20 de marzo de 2025 (vigente desde el 21 de marzo de 2025; sustituye a la ley de 2010) mantiene la obligación del responsable de **informar de forma inmediata al titular** las vulneraciones de seguridad que afecten de forma significativa sus derechos patrimoniales o morales, en cuanto se confirme que ocurrió y se hayan tomado acciones para dimensionarla, para que el titular pueda tomar medidas para proteger sus derechos.

Contenido recomendado del aviso a cada paciente afectado (tomado de lo que exigía el Reglamento de la ley anterior; verifica el reglamento vigente):

- La naturaleza del incidente.
- Los datos personales comprometidos.
- Recomendaciones al titular sobre medidas que puede adoptar para proteger sus intereses.
- Las acciones correctivas realizadas de forma inmediata.
- Los medios donde puede obtener más información.

Además:

- **Autoridad:** con la reforma de 2025 el INAI se extinguió y sus funciones para particulares pasaron a la **Secretaría Anticorrupción y Buen Gobierno**. A la fecha de esta guía **no tenemos certeza** de si la ley o su reglamento exigen notificar también a la autoridad en el sector privado ni en qué plazo; consúltalo con tu abogado al ocurrir el incidente y documenta la decisión.
- **Otros deberes posibles:** denuncia ante el Ministerio Público si hubo delito (acceso ilícito a sistemas, Código Penal Federal arts. 211 bis 1 y ss.); aviso a la aseguradora de ciberriesgos; aviso a la institución/hospital si atiendes por convenio; a COFEPRIS solo si el incidente afecta la seguridad de un dispositivo médico regulado.
- Conserva el registro del incidente y de las notificaciones (la autoridad puede requerirlo).

> **Revisión legal recomendada:** pide a un abogado especialista en protección de datos que valide este procedimiento contra el texto vigente de la LFPDPPP 2025 y su reglamento, y que prepare las plantillas de aviso a titulares.

### Contactos (complétalos)

| Rol | Nombre | Teléfono | Correo |
|---|---|---|---|
| Responsable de datos personales | | | |
| Soporte técnico / TI | | | |
| Abogado | | | |
| Proveedor de hosting (soporte) | | | |
