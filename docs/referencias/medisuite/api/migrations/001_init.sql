-- MediSuite: esquema inicial.
-- Los recursos clínicos se guardan como JSONB (forma exacta de src/lib/types.ts);
-- las reglas de negocio se aplican en el código del servidor.

CREATE TABLE orgs (
  id          text PRIMARY KEY,
  nombre      text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id               text PRIMARY KEY,
  org_id           text NOT NULL REFERENCES orgs(id),
  email            text NOT NULL,
  nombre           text NOT NULL,
  rol              text NOT NULL CHECK (rol IN ('admin', 'medico', 'recepcion', 'enfermeria')),
  activo           boolean NOT NULL DEFAULT true,
  password_hash    text NOT NULL,
  profile          jsonb NOT NULL DEFAULT '{}'::jsonb,
  prefs            jsonb NOT NULL DEFAULT '{}'::jsonb,
  totp_enabled     boolean NOT NULL DEFAULT false,
  totp_secret_enc  text,
  totp_pending_enc text,
  totp_last_step   bigint,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE INDEX users_org_idx ON users (org_id);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,           -- SHA-256 del token; el token nunca se guarda
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      text NOT NULL REFERENCES orgs(id),
  created_at  timestamptz NOT NULL,
  last_seen   timestamptz NOT NULL,
  ip          text,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Llaves de firma por organización (ES256). La privada va cifrada con AES-256-GCM (MASTER_KEY).
CREATE TABLE org_keys (
  kid          text PRIMARY KEY,
  org_id       text NOT NULL REFERENCES orgs(id),
  public_jwk   jsonb NOT NULL,
  private_enc  text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_keys_org_idx ON org_keys (org_id);

-- Folio consecutivo de recetas por organización (se bloquea con SELECT ... FOR UPDATE).
CREATE TABLE folio_counters (
  org_id  text PRIMARY KEY REFERENCES orgs(id),
  last    integer NOT NULL DEFAULT 0
);

-- Una tabla por colección, misma estructura.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','appointments','encounters','observations','prescriptions','documents','payments'] LOOP
    EXECUTE format($f$
      CREATE TABLE %1$I (
        org_id      text NOT NULL REFERENCES orgs(id),
        id          text NOT NULL,
        patient_id  text,
        data        jsonb NOT NULL,
        created_at  timestamptz NOT NULL,
        updated_at  timestamptz NOT NULL,
        created_by  text,
        deleted_at  timestamptz,
        PRIMARY KEY (org_id, id)
      );
      CREATE INDEX %1$s_org_patient_idx ON %1$I (org_id, patient_id);
    $f$, t);
  END LOOP;
END $$;
CREATE INDEX prescriptions_folio_idx ON prescriptions (org_id, (data->>'folio'));

-- Archivos de documentos (contenido en disco, FILES_DIR).
CREATE TABLE files (
  org_id        text NOT NULL REFERENCES orgs(id),
  id            text NOT NULL,          -- = id del documento
  storage_name  text NOT NULL UNIQUE,   -- nombre aleatorio en disco
  mime          text NOT NULL,
  size          bigint NOT NULL,
  sha256        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- Bitácora de solo inserción.
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  fecha        timestamptz NOT NULL,
  org_id       text,
  user_id      text,
  user_nombre  text,
  accion       text NOT NULL,
  recurso      text,
  recurso_id   text,
  patient_id   text,
  ip           text,
  detalle      jsonb
);
CREATE INDEX audit_org_fecha_idx ON audit_log (org_id, fecha DESC);
CREATE INDEX audit_org_patient_idx ON audit_log (org_id, patient_id);
CREATE INDEX audit_org_user_idx ON audit_log (org_id, user_id);

CREATE FUNCTION audit_log_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es de solo inserción (% no permitido)', TG_OP;
END $$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_inmutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_inmutable();
