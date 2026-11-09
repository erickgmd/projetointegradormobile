-- Executar como proprietário do banco, em transação e após backup.
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS ultima_atividade TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS consentimento_em TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS consentimento_versao VARCHAR(30);
-- O schema anterior usa int8; tokens novos precisam de texto e não reutilizam códigos legados.
ALTER TABLE usuarios ALTER COLUMN codigo_telegram TYPE VARCHAR(64) USING codigo_telegram::text;
ALTER TABLE telegram_vinculos ADD COLUMN IF NOT EXISTS token_hash CHAR(64);
ALTER TABLE telegram_vinculos ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ;
ALTER TABLE telegram_vinculos ADD COLUMN IF NOT EXISTS usado_em TIMESTAMPTZ;
ALTER TABLE telegram_vinculos ALTER COLUMN codigo_vinculo TYPE VARCHAR(64) USING codigo_vinculo::text;
ALTER TABLE telegram_vinculos ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE telegram_vinculos ALTER COLUMN codigo_vinculo DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_usuario_unico ON telegram_vinculos(usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_token_unico ON telegram_vinculos(token_hash) WHERE token_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS categorias (
 id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 nome VARCHAR(100) NOT NULL, tipo VARCHAR(10) NOT NULL CHECK(tipo IN ('income','expense'))
);
CREATE UNIQUE INDEX IF NOT EXISTS categorias_usuario_nome_tipo ON categorias(usuario_id,lower(nome),tipo);
CREATE TABLE IF NOT EXISTS operacoes (
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 chave VARCHAR(160) NOT NULL, payload_hash CHAR(64) NOT NULL, resultado JSONB,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(usuario_id,chave)
);
CREATE TABLE IF NOT EXISTS notificacoes (
 id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 mes CHAR(7) NOT NULL, nivel INTEGER NOT NULL CHECK(nivel IN(80,100)), mensagem TEXT NOT NULL,
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), entregue_em TIMESTAMPTZ,
 tentativas INTEGER NOT NULL DEFAULT 0, proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(usuario_id,mes,nivel)
);
CREATE TABLE IF NOT EXISTS recuperacoes_senha (
 token_hash CHAR(64) PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 expira_em TIMESTAMPTZ NOT NULL, usado_em TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS telegram_updates (
 update_id BIGINT PRIMARY KEY, payload JSONB NOT NULL, criado_em TIMESTAMPTZ DEFAULT NOW(),
 processado_em TIMESTAMPTZ, tentativas INTEGER NOT NULL DEFAULT 0,
 proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT NOW(), erro BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS ocr_pendencias (
 id SERIAL PRIMARY KEY, telegram_id BIGINT NOT NULL, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 descricao TEXT,valor NUMERIC(12,2),categoria VARCHAR(100),data_transacao DATE,texto_ocr TEXT,criado_em TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ocr_pendencias ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ;
ALTER TABLE ocr_pendencias ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '15 minutes';
-- Nunca armazenamos a foto nem o texto integral extraído no fluxo novo.
CREATE INDEX IF NOT EXISTS notificacoes_pendentes ON notificacoes(proxima_tentativa) WHERE entregue_em IS NULL;
CREATE INDEX IF NOT EXISTS telegram_updates_pendentes ON telegram_updates(proxima_tentativa) WHERE processado_em IS NULL;
-- Papel restrito usado em cada transação financeira autenticada, inclusive se
-- a conexão administrativa original tiver BYPASSRLS (como no Supabase).
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cashflow_app') THEN
  CREATE ROLE cashflow_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 EXECUTE format('GRANT cashflow_app TO %I',current_user);
END $$;
GRANT USAGE ON SCHEMA public TO cashflow_app;
GRANT SELECT,UPDATE ON usuarios TO cashflow_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON transacoes,categorias,operacoes,notificacoes,telegram_vinculos,ocr_pendencias TO cashflow_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cashflow_app;
DO $$ DECLARE t TEXT; campo TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['usuarios','transacoes','categorias','operacoes','notificacoes','telegram_vinculos','ocr_pendencias','sessoes','recuperacoes_senha'] LOOP
  campo:=CASE WHEN t='usuarios' THEN 'id' ELSE 'usuario_id' END;
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS cashflow_isolamento ON %I',t);
  EXECUTE format('DROP POLICY IF EXISTS cashflow_permitir ON %I',t);
  EXECUTE format('CREATE POLICY cashflow_permitir ON %I TO cashflow_app USING (true) WITH CHECK (true)',t);
  EXECUTE format('CREATE POLICY cashflow_isolamento ON %I AS RESTRICTIVE TO cashflow_app USING (%I = NULLIF(current_setting(''app.user_id'',true),'''')::integer) WITH CHECK (%I = NULLIF(current_setting(''app.user_id'',true),'''')::integer)',t,campo,campo);
 END LOOP;
END $$;
-- Tabelas internas: nenhum acesso pelos papéis públicos de API do Supabase.
DO $$ DECLARE r TEXT; t TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   FOREACH t IN ARRAY ARRAY['sessoes','recuperacoes_senha','telegram_updates','operacoes','notificacoes','ocr_pendencias','usuarios','transacoes','categorias','telegram_vinculos'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',t,r);
   END LOOP;
  END IF;
 END LOOP;
END $$;

-- Coleta mínima nova: campos complementares podem ser omitidos pelo usuário.
DO $$ DECLARE c TEXT; BEGIN
 FOREACH c IN ARRAY ARRAY['cpf','nascimento','telefone','cep','logradouro','complemento','bairro','cidade','estado','tipo_residencia','tempo_residencia','renda','despesas','tipo_investimento','faixa_investimento'] LOOP
  EXECUTE format('ALTER TABLE usuarios ALTER COLUMN %I DROP NOT NULL',c);
 END LOOP;
END $$;
ALTER TABLE telegram_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sessoes,recuperacoes_senha,telegram_updates,operacoes,notificacoes,ocr_pendencias,usuarios,transacoes,categorias,telegram_vinculos FROM PUBLIC;

-- Categorias já usadas no banco legado continuam disponíveis para edição.
INSERT INTO categorias(usuario_id,nome,tipo)
 SELECT DISTINCT usuario_id,categoria,tipo FROM transacoes
 WHERE categoria IS NOT NULL AND length(categoria)<=100 AND tipo IN ('income','expense')
 AND categoria NOT IN ('salario','freelance','investimentos','outros-receitas','alimentacao','transporte','moradia','saude','educacao','lazer','outros-despesas')
 ON CONFLICT DO NOTHING;
