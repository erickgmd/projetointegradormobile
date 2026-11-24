-- Aditiva e idempotente: contas existentes não passam a exigir confirmação.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_confirmado_em TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificacao_obrigatoria BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS verificacoes_email (
 token_hash CHAR(64) PRIMARY KEY,
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 email VARCHAR(254) NOT NULL,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expira_em TIMESTAMPTZ NOT NULL,
 UNIQUE(usuario_id)
);
CREATE INDEX IF NOT EXISTS verificacoes_email_expiracao ON verificacoes_email(expira_em);
ALTER TABLE verificacoes_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE verificacoes_email FROM PUBLIC;
-- Tokens só são manipulados pelo backend proprietário, nunca pelo papel do usuário.
REVOKE ALL ON TABLE verificacoes_email FROM cashflow_app;
