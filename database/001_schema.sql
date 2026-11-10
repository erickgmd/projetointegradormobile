-- Migração aditiva: executar em transação; não remove tabelas nem dados.
CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nascimento DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(40);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS etapa INTEGER DEFAULT 1;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cep VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS complemento VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bairro VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cidade VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado VARCHAR(2);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_residencia VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tempo_residencia VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS renda NUMERIC(12,2);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS despesas NUMERIC(12,2);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS menor_18 BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_investimento VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS faixa_investimento VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS gasto_maximo NUMERIC(12,2) DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_telegram VARCHAR(20);
-- Se houver emails duplicados (ignorando maiúsculas), resolver antes desta migração.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalizado ON usuarios (lower(email));
CREATE TABLE IF NOT EXISTS transacoes (
 id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 descricao TEXT NOT NULL, valor NUMERIC(12,2) NOT NULL CHECK (valor>0), categoria VARCHAR(255) NOT NULL,
 tipo VARCHAR(10) NOT NULL CHECK(tipo IN ('income','expense')), data_transacao DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS transacoes_usuario_data ON transacoes(usuario_id,data_transacao DESC,id DESC);
CREATE TABLE IF NOT EXISTS sessoes (
 token_hash CHAR(64) PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 expira_em TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_expiracao ON sessoes(expira_em);
CREATE TABLE IF NOT EXISTS telegram_vinculos (
 id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
 telegram_id BIGINT UNIQUE, nome_telegram VARCHAR(255), codigo_vinculo VARCHAR(20),criado_em TIMESTAMPTZ DEFAULT NOW()
);
