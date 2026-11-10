-- Migração aditiva 003: login com Google e "Lembrar de mim".
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_google_sub ON usuarios (google_sub) WHERE google_sub IS NOT NULL;
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS lembrar BOOLEAN NOT NULL DEFAULT FALSE;
-- Contas criadas pelo Google não têm senha local (bancos antigos exigiam NOT NULL).
ALTER TABLE usuarios ALTER COLUMN senha DROP NOT NULL;
