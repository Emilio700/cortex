# Changelog

Todos los cambios notables de Cortex. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con
[versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado
- Base de Cortex a partir de GEMS v1.2.0: agenda, triage, consulta SOAP, expediente,
  recetas, órdenes y resultados, consentimientos, certificados, cobros, auditoría y
  ayuda guiada.
- Identidad visual de Cortex: marca del logo, acceso con red neuronal animada y
  escáner, menú y bandas marinas, tipografías propias y movimiento que respeta
  «reducir movimiento».
- Ficha neurológica del paciente: lateralidad, antecedentes neurológicos, implantes
  y anticoagulantes (migración 0048).
- Señales de implantes y anticoagulantes en el expediente y en la consulta.
- Consentimientos de neurocirugía: craneotomía, columna, derivación de LCR, biopsia
  estereotáctica, dolor intervencionista, nervio periférico y punción lumbar.
- Episodios clínicos, plantillas de órdenes y categorías de estudio (Neuroimagen,
  Neurofisiología) de neurocirugía.
- «Cirugías programadas» de las próximas dos semanas en el inicio del médico.
- Seed de demostración `seed_cortex` con un consultorio de neurocirugía ficticio.

### Cambiado
- Voz de la interfaz en masculino genérico: «el paciente», «el médico».
- Puertos, contenedores y nombres de producción propios para convivir con GEMS.

### Quitado
- Lo ginecológico deja de ofrecerse (embarazo y control prenatal, historia
  gineco-obstétrica, FUR, consentimientos y plantillas de ginecología, aviso
  prenatal). Los datos y la cadena de migraciones se conservan.
- Scripts del sistema legado y de despliegue específicos de GEMS.
