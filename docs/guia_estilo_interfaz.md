# Guía de estilo de la interfaz

> Nace de la acción U-01 del backlog
> ([`auditoria/10_acciones_de_mejora.md`](auditoria/10_acciones_de_mejora.md)) y de la
> decisión 5.1 de Emilio (2026-09-29): **la interfaz habla de tú**. Aplica a todo texto
> que ve una persona: etiquetas, botones, avisos, mensajes de error, marcadores de
> posición y pasos de los recorridos guiados.

## 1. A quien usa el sistema se le habla de tú

| En vez de | Escribe |
|---|---|
| Inténtelo de nuevo | Inténtalo de nuevo |
| Seleccione un paciente | Elige a una paciente |
| Escriba al menos 2 caracteres | Escribe al menos 2 caracteres |
| Agregue / Indique / Guarde / Describa | Agrega / Indica / Guarda / Describe |
| Use Imprimir o descargue el PDF | Usa Imprimir o descarga el PDF |
| Lo decide usted | Lo decides tú |
| Debe seleccionar un doctor | Elige a la doctora. |

- **Nada de «Debe…».** Un error de validación dice qué hacer, en imperativo de tú:
  «Elige la sala donde será la cita.», «Escribe el motivo de la cancelación.».
- **«Su/sus» referido a la paciente es correcto** y se queda: «Elige a una paciente de
  la lista para ver y gestionar sus documentos.» Sólo cambia cuando se dirige a quien
  usa el sistema: «Aparecerán en *tus* recetas».
- Lo impersonal sigue valiendo cuando nadie tiene que hacer nada: «No se pudo cargar…»,
  «Puede que la hayan eliminado».
- Los textos que llegan del servidor (`detail`) ya vienen en tú; el respaldo del
  cliente (`mensajeDeError(err, '…')`) también.

## 2. A quien atiende se le llama «doctora»

- En el habla del personal (etiquetas, filtros, columnas, avisos): **doctora**. «Doctora»
  como etiqueta del campo, «Todas las doctoras» en el filtro, «Esta doctora no tiene
  horario…», «Nota de la doctora».
- Para nombrar a una persona concreta, **siempre** `nombreConTratamiento()` de
  [`frontend/src/shared/utils/tratamiento.ts`](../frontend/src/shared/utils/tratamiento.ts):
  sale «Dra. Cintia Castro» o «Dr. …» según lo que administración capturó. Nunca un
  «Dr.» fijo. El saludo del inicio de la doctora usa esa función.
- **«Médico» como adjetivo se queda**: certificado médico, historial médico, perfil
  médico. Lo que se quitó es «el médico» / «el doctor» como la persona.
- **Excepciones que se dejaron a propósito:**
  - El **nombre del rol** del sistema («Doctor») en Administración, Usuarios, Roles,
    Permisos y en los mensajes del servidor que listan roles: es el nombre del rol, no
    la forma de hablar de alguien. El pie de página muestra ese mismo nombre (antes
    decía «Médico»).
  - Valores que se **guardan** en la base, como el origen de la FPP
    (`'Fecha ajustada por el médico'` en `PrenatalCarePanel.tsx`): cambiarlos es
    migrar datos, no corregir un texto.

## 3. Lo que sigue abierto

Las preguntas 5.2 y 5.3 de
[`auditoria/11_preguntas_abiertas.md`](auditoria/11_preguntas_abiertas.md) no se han
decidido: **no se unifica «cita» / «consulta»** ni los títulos de menú contra los de
página. Recepción sigue diciendo «cita» y la doctora «consulta».

## 4. Cómo se sostiene

- `frontend/src/shared/utils/vozDeLaInterfaz.test.ts` falla si reaparecen las formas de
  usted y los «doctor/médico» ya barridos. No es exhaustiva: un texto nuevo sigue
  necesitando revisión.
- Si cambias un texto que describe un recorrido guiado, revisa sus pasos en
  `frontend/src/shared/tutoriales/recorridos/` y sube su `version` (ver `CLAUDE.md`).
