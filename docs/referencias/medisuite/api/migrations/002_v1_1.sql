-- MediSuite v1.1: preferencias, mensajes (WhatsApp/correo), facturas CFDI, recuperación de contraseña,
-- bloqueo ARCO de pacientes e índices para paginación/sincronización incremental.

-- ---------- Preferencias (org o usuario) ----------
CREATE TABLE preferencias (
  org_id      text NOT NULL REFERENCES orgs(id),
  scope       text NOT NULL CHECK (scope IN ('org', 'user')),
  owner_id    text NOT NULL,            -- '' para scope org; id de usuario para scope user
  clave       text NOT NULL,
  valor       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL,
  updated_by  text,
  PRIMARY KEY (org_id, scope, owner_id, clave)
);

-- ---------- Mensajes enviados (recordatorios, pruebas) ----------
CREATE TABLE mensajes (
  id              text PRIMARY KEY,
  org_id          text NOT NULL REFERENCES orgs(id),
  appointment_id  text,
  patient_id      text,
  canal           text NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  tipo            text NOT NULL CHECK (tipo IN ('recordatorio', 'manual', 'prueba')),
  horas           integer,              -- anticipación del recordatorio automático (null en manual/prueba)
  cita_inicio     timestamptz,          -- inicio de la cita al momento del envío
  destino         text NOT NULL,        -- +52… o correo
  estado          text NOT NULL CHECK (estado IN ('pendiente', 'enviado', 'entregado', 'leido', 'fallido', 'respondido')),
  wa_id           text,
  error           text,
  respuesta       text,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  enviado_en      timestamptz,
  entregado_en    timestamptz,
  leido_en        timestamptz,
  respondido_en   timestamptz,
  created_by      text
);
-- Idempotencia del recordatorio automático: uno por cita, tipo, anticipación y horario de la cita
-- (si la cita se reprograma, se vuelve a recordar). En manual/prueba horas es NULL → no aplica.
CREATE UNIQUE INDEX mensajes_recordatorio_uq ON mensajes (org_id, appointment_id, tipo, horas, cita_inicio);
CREATE INDEX mensajes_org_fecha_idx ON mensajes (org_id, created_at DESC);
CREATE INDEX mensajes_wa_idx ON mensajes (wa_id);
CREATE INDEX mensajes_appt_idx ON mensajes (org_id, appointment_id);

-- ---------- Facturas CFDI 4.0 (timbradas con el PAC) ----------
CREATE TABLE facturas (
  org_id            text NOT NULL REFERENCES orgs(id),
  id                text NOT NULL,
  payment_id        text NOT NULL,
  patient_id        text,
  pac_id            text,               -- id de la factura en Facturapi
  uuid              text,               -- folio fiscal (UUID del SAT)
  serie             text,
  folio             text,
  status            text NOT NULL,      -- pendiente | error | valid | canceled | (otros del PAC)
  cancellation_status text,
  total             numeric(14, 2),
  receptor          jsonb NOT NULL,
  forma_pago        text NOT NULL,
  uso_cfdi          text NOT NULL,
  error             text,
  cancelacion       jsonb,
  created_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  created_by        text,
  PRIMARY KEY (org_id, id)
);
-- Un pago solo puede tener una factura vigente (pendiente o timbrada).
CREATE UNIQUE INDEX facturas_payment_vigente_uq ON facturas (org_id, payment_id) WHERE status NOT IN ('error', 'canceled');
CREATE INDEX facturas_org_fecha_idx ON facturas (org_id, created_at DESC);

-- ---------- Recuperación de contraseña ----------
CREATE TABLE password_resets (
  token_hash  text PRIMARY KEY,         -- SHA-256 del token; el token solo viaja en el correo
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  ip          text
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- ---------- Bloqueo ARCO (oposición/cancelación): el expediente se conserva ----------
ALTER TABLE patients ADD COLUMN bloqueado boolean NOT NULL DEFAULT false;
ALTER TABLE patients ADD COLUMN bloqueo jsonb;
ALTER TABLE patients ADD COLUMN bloqueo_at timestamptz;   -- último cambio de bloqueo (para sincronización)

-- ---------- Índices para paginación por llave (created_at, id) y sincronización (updated_at) ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','appointments','encounters','observations','prescriptions','documents','payments'] LOOP
    EXECUTE format('CREATE INDEX %1$s_org_created_idx ON %1$I (org_id, created_at, id)', t);
    EXECUTE format('CREATE INDEX %1$s_org_updated_idx ON %1$I (org_id, updated_at)', t);
  END LOOP;
END $$;
