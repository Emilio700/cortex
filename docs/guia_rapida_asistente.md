# Guía rápida para la asistente — G.E.M.S

> Para imprimir y tener junto a la computadora.
> Versión 1.0 · 18 de septiembre de 2026 · Sistema: https://gems.makerdeep3d.com

Hola Jhoany 👋
Esta guía explica, paso a paso, cómo hacer las cosas del día a día en el sistema **tal como funcionan hoy**.
No necesitas saber nada técnico. Si algo no sale como dice aquí, no es tu culpa: anótalo y avísale al equipo.

---

## 1. Cómo entrar al sistema

1. Abre el navegador (Chrome de preferencia) y entra a **https://gems.makerdeep3d.com**
2. Escribe tu **correo**: `jhoany.reyes@gems.com`
3. Escribe tu **contraseña** (te la entregan aparte, nunca la escribas en un papel pegado a la pantalla).
4. Da clic en **Iniciar Sesión**.

**Al entrar vas directo al sistema**: no te pide ningún código ni cambio de contraseña.
Cuando tengas un momento tranquilo, cambia tu contraseña por una tuya desde el menú de tu usuario
(arriba a la derecha 👤 → **Cambiar contraseña**). No es obligatorio hoy, pero sí recomendable.

Al entrar caes directo en la **Agenda de Citas**. Ese es tu tablero principal.

**Si algo sale mal al entrar:**
- Si aparece un mensaje en rojo raro o en inglés (por ejemplo "Request failed with status code 401"), casi siempre significa **contraseña incorrecta**. Vuelve a intentar con calma.
- Si dice *"Demasiados intentos. Intenta de nuevo en unos minutos"*, espera **1 minuto** y vuelve a intentar. No sigas dándole.

**Para salir:** arriba a la derecha hay un círculo gris con un monito 👤 → **Cerrar sesión**.
Desde ahí también puedes **Cambiar contraseña** cuando quieras.

---

## 2. Qué hay en el menú de la izquierda

| Menú | Para qué te sirve |
|---|---|
| **Dashboard** | Pantalla de bienvenida con accesos rápidos. |
| **Dashboard Financiero** | Totales de dinero del día. *Ver nota abajo.* |
| **Pagos** | Aquí registras los cobros y ves el historial. |
| **Preregistro** | Personas que pidieron cita por fuera y todavía no son pacientes. |
| **Agenda** | El calendario de citas. **Tu pantalla principal.** |
| **Pacientes** | Buscar, registrar y editar pacientes. |
| **Documentos** | Subir y consultar archivos de cada paciente (estudios, INE, etc.). |

> ⚠️ **Nota sobre "Dashboard Financiero":** hoy esa pantalla te muestra un aviso rojo en inglés porque tu usuario no tiene habilitado el corte de caja. **No está descompuesto y no hiciste nada mal.** Usa **Pagos** en su lugar. Si necesitas el corte del día, pídeselo al administrador.

Arriba a la derecha también hay una **campanita 🔔**: ahí te avisa el sistema, por ejemplo cuando el doctor termina una consulta y queda **pendiente de cobro**.

---

## 3. Agendar una cita a un paciente que ya existe

1. Menú **Agenda**.
2. Botón **+ Nueva Cita** (arriba a la derecha).
   *Atajo:* también puedes dar clic directo sobre el día y la hora en el calendario, y el modal se abre con esa fecha ya puesta.
3. **Tipo de Cita**: déjalo en 🩺 *Consulta* (usa *Cirugía* o *Procedimiento* solo si el doctor lo indica).
4. **Paciente**: empieza a escribir el apellido, nombre o teléfono. Aparece una lista debajo → **da clic en el paciente correcto**. Debe quedar una etiqueta verde con su nombre.
5. **Doctor**: elige al doctor de la lista.
6. **Fecha y Hora**: revisa que sean las correctas.
7. **Duración**: 30 minutos es lo normal.
8. **Notas**: opcional (ej. "primera vez", "trae estudios").
9. Botón **Guardar**.

La cita queda en estado **Agendada** (azul) y el sistema envía un correo de confirmación al paciente si tiene correo registrado.

**Si te sale un mensaje en rojo, esto significa:**

| Lo que dice la pantalla | Lo que realmente pasa | Qué hacer |
|---|---|---|
| *"Doctor has an overlapping appointment at this time"* | Ese doctor **ya tiene otra cita** a esa hora | Elige otro horario |
| *"This time is outside the doctor's configured working hours"* | Es **fuera del horario** de ese doctor | Elige una hora dentro de su horario |
| *"Doctor is unavailable during this time (schedule block)"* | El doctor **bloqueó** ese rato en su agenda | Elige otro horario |
| *"Debe seleccionar un paciente"* | Escribiste el nombre pero **no diste clic** en la lista | Vuelve a escribir y da clic en el paciente |

---

## 4. Registrar un paciente nuevo y agendarle cita

**Primero se crea el paciente, después la cita.** No se puede crear el paciente desde la ventana de la cita.

**Paso A — crear el paciente**
1. Menú **Pacientes**.
2. Botón **+ Nuevo Paciente**.
3. Llena lo obligatorio (marcado con asterisco rojo):
   - **Nombre**
   - **Apellidos**
   - **Fecha de Nacimiento**
4. Llena lo útil para ti: **Teléfono**, **Celular**, **Email** (el correo sirve para mandarle su confirmación y su recibo).
5. Si aparece **Doctor Dueño**, elige al doctor que la va a atender.
6. Lo demás (Menarca, FUR, FPP, Gestas, Paras, Cesáreas, Antecedentes…) **es información médica: puedes dejarlo vacío.** El doctor la llena en la consulta.
7. Botón **Guardar**. Sale el aviso verde "Paciente registrado correctamente."

> Si sale *"Email already registered for another patient"* quiere decir que **ese correo ya lo tiene otra paciente**. Déjalo en blanco o usa otro correo.

**Paso B — agendarle la cita**
8. En la lista de pacientes, busca a la paciente que acabas de crear.
9. Sigue los pasos de la sección 3 (**Agenda → + Nueva Cita**).

*Atajo:* en el renglón de la paciente hay un ícono de **calendario 📅** ("Ver Citas") que te lleva a la agenda ya filtrada por ella. Para quitar el filtro, da clic en la **×** de la etiqueta azul.

---

## 5. Ver la agenda del día y confirmar, cancelar o reagendar

Entra a **Agenda**. Abajo del calendario tienes dos tarjetas: **Hoy** y **Mañana**, con las citas ordenadas por hora. Esa es tu vista de trabajo.

Los colores: 🔵 Agendada · 🟢 Confirmada · 🟠 En Sala · ⚪ Atendida · 🔴 Cancelada.

> 📌 **Importante:** el calendario carga **solo el mes actual**. Si te mueves a otro mes con las flechas, se va a ver vacío aunque sí haya citas. **No te asustes.** Para volver a ver todo, da clic en **Hoy** o recarga la página (tecla F5).

**Confirmar una cita** (cuando la paciente confirma por teléfono)
1. Clic en la cita.
2. Abajo, en "Cambiar Estado", clic en **Confirmar**.
3. La ventana se cierra sola y la cita se pone verde.

**Reagendar (cambiar de día u hora)**
1. Clic en la cita.
2. Cambia **Fecha y Hora** (y la duración si hace falta).
3. Clic en **Guardar**.
   *(Al paciente no se le puede cambiar. Si te equivocaste de paciente, cancela la cita y crea una nueva.)*

**Cancelar una cita**
1. Clic en la cita.
2. Botón rojo **Cancelar Cita**.
3. Se abre un cuadro de texto: **es obligatorio escribir el motivo** (ej. "la paciente pidió reprogramar").
4. Clic en **Confirmar cancelación**.

El motivo queda guardado y se ve después dentro de la cita. Si te arrepientes antes de confirmar, usa **Volver**.

---

## 6. Preparar al paciente para el doctor (signos vitales y pasar a sala)

Cuando el paciente llega al consultorio, el orden es: **Confirmar → Signos vitales → Pasar a Sala.**

1. Menú **Agenda** → clic en la cita del paciente.
2. Si todavía está en azul (*Agendada*), clic en **Confirmar**. La ventana se cierra.
3. Vuelve a abrir la cita → hasta abajo dice **Triage: Pendiente** → clic en **Registrar Triage**.
4. Llena lo que hayas tomado: **Peso (kg)**, **Talla (cm)**, **Presión Arterial** (sistólica / diastólica), **Temperatura**, **Motivo de Consulta** y **Observaciones**.
   *Ninguno es obligatorio, pero llena todo lo que puedas: es lo que el doctor va a leer.*
5. **Guardar**. Los signos quedan como **Completado ✓**.
6. Ya con los signos guardados, clic en **Pasar a Sala**.
   → En ese momento le llega un aviso al médico: *"Paciente en sala"*.

> El botón **Pasar a Sala** aparece gris ("Requiere triage") hasta que guardes los signos. Es a propósito.

**Todo se hace desde la Agenda.** No hay una pantalla aparte de Triage: la que había era una segunda puerta al mismo formulario y, además, no mostraba a los pacientes que llegaron sin confirmar. Si nadie alcanzó a tomar los signos, el médico los toma al abrir la consulta.

---

## 7. Registrar el cobro de una consulta

Cuando el doctor termina, te llega un aviso en la **campanita 🔔**: *"Consulta finalizada — pendiente de cobro"*.

1. Menú **Pagos**.
2. Botón verde **+ Nuevo Pago**.
3. Arriba sale la lista **🕐 Citas atendidas recientemente**. **Da clic en la cita de la paciente que vas a cobrar.** El renglón se pone azul.
   - Si el doctor dejó una nota de descuento, verás una etiqueta **💬 Nota doctor** y esa nota se copia sola al campo de notas.
4. **Monto**: escribe la cantidad (solo números, ej. `800`).
5. **Método de pago**: Efectivo, Tarjeta, Transferencia u Otro.
6. **Concepto**: ya viene lleno ("Consulta — Nombre"), puedes ajustarlo.
7. Clic en **Registrar Pago**.

> ⚠️ **Muy importante:** el botón **Registrar Pago** solo se activa después de dar clic en una cita de la lista de arriba. **Si esa lista está vacía no se puede registrar el cobro desde esta pantalla**, aunque el texto diga "ingresa los datos manualmente". Si te pasa: revisa que el doctor ya haya marcado la consulta como **Atendida** (o que tú la hayas marcado desde la Agenda). Si aun así no aparece, avísale al equipo.

**Mandar el recibo por correo:** en la tabla de pagos, en la columna **Recibo**, clic en el sobrecito ✉️. Sale un avisito "Recibo enviado". Le llega al correo que tiene registrado la paciente (si no tiene correo, no se puede enviar).

> En la tabla de pagos la columna Paciente puede decir *"Paciente #45"* en vez del nombre. Es un detalle pendiente del sistema, el pago sí quedó bien guardado.

---

## 8. Preregistro (personas que aún no son pacientes)

Si alguien pidió informes o cita y todavía no está en el sistema:

1. Menú **Preregistro** → **Nuevo preregistro** → nombre completo, teléfono, correo, especialidad y motivo → **Guardar**.
2. Cuando la contactes, márcalo como **Contactado**.
3. Cuando decida venir, usa **Convertir a paciente**: te va a pedir la **fecha de nacimiento** y el género, y con eso se crea el expediente.
4. Ya convertida, agéndale su cita normal (sección 3).

---

## 9. Chuleta de un día normal

| Momento | Qué haces | Dónde |
|---|---|---|
| Al abrir | Reviso las citas de **Hoy** | Agenda |
| Llaman a confirmar | Abro la cita → **Confirmar** | Agenda |
| Llega el paciente | Abro la cita → **Registrar Triage** → **Pasar a Sala** | Agenda |
| Paciente nueva | **+ Nuevo Paciente** y luego su cita | Pacientes → Agenda |
| Suena la campanita | Registro el cobro | Pagos |
| Trae estudios | Los subo a su expediente | Documentos |
| No puede venir | Abro la cita → **Cancelar Cita** + motivo | Agenda |

---

## 10. Cosas que hoy NO puedes hacer (es normal, no es una falla)

- Crear o editar **usuarios** del personal, **servicios y precios**, ver **reportes** o la **auditoría** → eso es del administrador.
- Ver el **corte de caja** (Dashboard Financiero) → pídelo al administrador.
- Ver o escribir **notas médicas, recetas y certificados** → eso es del doctor.
- **Borrar** pacientes o pagos → un pago registrado no se puede borrar ni editar. **Revisa bien el monto antes de dar Registrar Pago.**

---

## 11. Si algo se traba

1. **Recarga la página** con la tecla **F5**. Arregla la mayoría de los casos.
2. Si el mensaje está **en inglés**, tradúcelo con la tabla de la sección 3, o simplemente **toma una foto de la pantalla** y mándala al equipo.
3. Si el sistema te saca solo y te manda al login, vuelve a entrar: solo se venció tu sesión.
4. Nunca vuelvas a registrar el mismo pago "por si acaso" — primero revisa si ya aparece en la lista de Pagos.

**Nada de lo que hagas rompe el sistema.** Si tienes duda, mejor pregunta antes de repetir la operación.
