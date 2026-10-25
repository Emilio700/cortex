-- MediSuite v1.2: colección genérica `registros` (control prenatal, vacunas, inventario, órdenes, tareas...).
-- Misma estructura que las demás colecciones; patient_id es opcional (registros de la clínica sin paciente).
CREATE TABLE registros (
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
CREATE INDEX registros_org_patient_idx ON registros (org_id, patient_id);
CREATE INDEX registros_org_tipo_idx ON registros (org_id, (data->>'tipo'));
CREATE INDEX registros_org_created_idx ON registros (org_id, created_at, id);
CREATE INDEX registros_org_updated_idx ON registros (org_id, updated_at);
