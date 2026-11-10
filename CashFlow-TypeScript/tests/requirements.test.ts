import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { userDatabase } from "../src/db.js";
const person = (email = "rf@test.com") => ({
  nome: "Usuário Teste",
  cpf: "12345678901",
  nascimento: "2000-01-01",
  telefone: "61999999999",
  email,
  senha: "SenhaSegura123!",
  confirmar_senha: "SenhaSegura123!",
  consentimento: true,
});
async function setup(t: any) {
  const { pg, db } = await testDatabase();
  const mails: any[] = [];
  const app = await buildApp(db, {
    logger: false,
    sendReset: async (...args: any[]) => {
      mails.push(args);
    },
  });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const call = (
    url: string,
    payload?: any,
    cookie?: string,
    headers: any = {},
  ) =>
    app.inject({
      url,
      method: payload === undefined ? "GET" : "POST",
      payload,
      headers: { ...(cookie ? { cookie } : {}), ...headers },
    });
  const reg = async (email?: string) => {
    const r = await call("/api/cadastro/etapa1", person(email));
    assert.equal(r.statusCode, 200, r.body);
    return r.cookies[0].name + "=" + r.cookies[0].value;
  };
  return { pg, db, app, call, reg, mails };
}
test("RF003 recuperação genérica, token único, expiração e revogação de sessões", async (t) => {
  const { call, reg, mails } = await setup(t);
  const c = await reg();
  assert.equal(
    (await call("/api/senha/recuperar", { email: "ausente@test.com" }))
      .statusCode,
    200,
  );
  await call("/api/senha/recuperar", { email: "rf@test.com" });
  assert.equal(mails.length, 1);
  const token = mails[0][1];
  assert.equal(
    (
      await call("/api/senha/redefinir", {
        token,
        senha: "NovaSenha123!",
        confirmar_senha: "NovaSenha123!",
      })
    ).statusCode,
    200,
  );
  assert.equal((await call("/api/perfil", undefined, c)).statusCode, 401);
  assert.equal(
    (
      await call("/api/senha/redefinir", {
        token,
        senha: "OutraSenha123!",
        confirmar_senha: "OutraSenha123!",
      })
    ).statusCode,
    400,
  );
});
test("RF004 inatividade não é renovada por consultas automáticas", async (t) => {
  const { call, reg, pg } = await setup(t);
  const c = await reg();
  await pg.query(
    "UPDATE sessoes SET ultima_atividade=NOW()-INTERVAL '31 minutes'",
  );
  assert.equal((await call("/api/perfil", undefined, c)).statusCode, 401);
});
test("RF007 RF010 RNF018 transação idempotente, edição e categoria própria", async (t) => {
  const { call, reg } = await setup(t);
  const c = await reg();
  const cat = await call(
    "/api/categorias",
    { nome: "Pets", tipo: "expense" },
    c,
  );
  assert.equal(cat.statusCode, 200, cat.body);
  const tx = {
    description: "Ração",
    amount: "50.25",
    category: "Pets",
    type: "expense",
    date: "2026-11-04",
    idempotency_key: "teste-reenvio-0001",
  };
  const a = await call("/api/transacoes", tx, c);
  const b = await call("/api/transacoes", tx, c);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(a.json().id, b.json().id);
  assert.equal(
    (await call("/api/transacoes", undefined, c)).json().transactions.length,
    1,
  );
  assert.equal(
    (await call("/api/transacoes", { ...tx, amount: "60" }, c)).statusCode,
    409,
  );
  const edit = await call(
    "/api/transacoes/editar",
    {
      ...tx,
      id: a.json().id,
      amount: "80.50",
      idempotency_key: "editar-teste-0001",
    },
    c,
  );
  assert.equal(edit.statusCode, 200, edit.body);
  assert.equal(
    (await call("/api/transacoes", undefined, c)).json().transactions[0].amount,
    80.5,
  );
});
test("RF011 RF014-016 RNF024 saldo exato e alertas de 80/100 por mês", async (t) => {
  const { call, reg, pg } = await setup(t);
  const c = await reg();
  await call("/api/config/gastos", { gasto_maximo: "100" }, c);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  for (const [i, amount] of ["80", "20", "0.10", "0.20"].entries())
    assert.equal(
      (
        await call(
          "/api/transacoes",
          {
            description: "Mercado",
            amount,
            category: "alimentacao",
            type: "expense",
            date: today,
            idempotency_key: "alerta-" + i + "-000000",
          },
          c,
        )
      ).statusCode,
      200,
    );
  const s = (await call("/api/resumo", undefined, c)).json();
  assert.equal(s.despesas, 100.3);
  assert.equal(s.saldo, -100.3);
  assert.equal((await pg.query("select * from notificacoes")).rows.length, 2);
});
test("RNF011 RLS bloqueia consulta sem filtro de usuário e alteração cruzada", async (t) => {
  const { reg, pg, db, call } = await setup(t);
  const a = await reg("a@test.com"),
    b = await reg("b@test.com");
  await call(
    "/api/transacoes",
    {
      description: "Outra conta",
      amount: "20",
      category: "lazer",
      type: "expense",
      date: "2026-11-04",
      idempotency_key: "rls-test-00001",
    },
    b,
  );
  const own = await userDatabase(db, 1).query("SELECT * FROM transacoes");
  assert.equal(own.rows.length, 0);
  assert.equal(
    (await userDatabase(db, 1).query("SELECT * FROM usuarios")).rows.length,
    1,
  );
  const otherId = (await pg.query("select id from transacoes")).rows[0].id;
  assert.equal(
    (
      await call(
        "/api/transacoes/editar",
        {
          id: otherId,
          description: "Invasão",
          amount: "1",
          category: "lazer",
          type: "expense",
          date: "2026-11-04",
          idempotency_key: "rls-test-00002",
        },
        a,
      )
    ).statusCode,
    404,
  );
});
test("RNF013 código Telegram expira e pode ser renovado", async (t) => {
  const { call, reg, pg } = await setup(t);
  const c = await reg();
  const r = await call(
    "/api/telegram",
    { acao: "gerar", nome_telegram: "@erick" },
    c,
  );
  assert.equal(r.statusCode, 200, r.body);
  assert.ok(r.json().expires_at);
  await pg.query(
    "update telegram_vinculos set expira_em=NOW()-INTERVAL '1 minute'",
  );
  assert.equal(
    (await call("/api/telegram", { acao: "verificar" }, c)).json().tem_codigo,
    false,
  );
});
test("RNF015 consentimento obrigatório e exclusão confirmada apaga dados", async (t) => {
  const { call, reg, pg } = await setup(t);
  assert.equal(
    (await call("/api/cadastro/etapa1", { ...person(), consentimento: false }))
      .statusCode,
    400,
  );
  const c = await reg();
  assert.ok(
    (await pg.query("select consentimento_em from usuarios")).rows[0]
      .consentimento_em,
  );
  assert.equal(
    (
      await call(
        "/api/conta/excluir",
        { senha: "SenhaErrada", confirmacao: "EXCLUIR" },
        c,
      )
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/conta/excluir",
        { senha: person().senha, confirmacao: "EXCLUIR" },
        c,
      )
    ).statusCode,
    200,
  );
  assert.equal((await pg.query("select * from usuarios")).rows.length, 0);
  assert.equal((await pg.query("select * from sessoes")).rows.length, 0);
});
test("RNF011 política pública legada não remove isolamento restritivo", async (t) => {
  const { pg, db, reg, call } = await setup(t);
  await reg("primeiro@test.com");
  const second = await reg("segundo@test.com");
  const saved = await call(
    "/api/transacoes",
    {
      description: "Dado privado",
      amount: "5",
      category: "lazer",
      type: "expense",
      date: "2026-11-04",
      idempotency_key: "legacy-policy-0001",
    },
    second,
  );
  assert.equal(saved.statusCode, 200, saved.body);
  await pg.exec(
    "CREATE POLICY legado_publico ON transacoes TO PUBLIC USING(true) WITH CHECK(true)",
  );
  assert.equal(
    (await userDatabase(db, 1).query("SELECT * FROM transacoes")).rows.length,
    0,
  );
});
test("RF001 RNF014 cadastro mínimo e etapas opcionais; preferências persistidas", async (t) => {
  const { call } = await setup(t);
  const r = await call("/api/cadastro/etapa1", {
    nome: "Conta Mínima",
    email: "minimo@test.com",
    senha: "SenhaSegura123!",
    confirmar_senha: "SenhaSegura123!",
    consentimento: true,
  });
  assert.equal(r.statusCode, 200, r.body);
  const cookie = r.cookies[0].name + "=" + r.cookies[0].value;
  assert.equal(
    (await call("/api/cadastro/etapa2", {}, cookie)).statusCode,
    200,
  );
  assert.equal(
    (await call("/api/cadastro/etapa3", {}, cookie)).statusCode,
    200,
  );
  const prefs = {
    theme: "auto",
    contrast: 120,
    brightness: 90,
    fontScale: 125,
    highContrast: true,
  };
  const updated = await call("/api/perfil", { preferencias: prefs }, cookie);
  assert.equal(updated.statusCode, 200, updated.body);
  const profile = (await call("/api/perfil", undefined, cookie)).json().dados;
  assert.equal(profile.preferencias.theme, "system");
  assert.equal(profile.preferencias.fontScale, 125);
  assert.equal(profile.cpf, null);
});
test("RNF018 reenvio após excluir transação não recria lançamento", async (t) => {
  const { call, reg } = await setup(t);
  const c = await reg();
  const b = {
    description: "Teste",
    amount: "10",
    category: "lazer",
    type: "expense",
    date: "2026-11-04",
    idempotency_key: "delete-retry-000001",
  };
  const r = await call("/api/transacoes", b, c);
  await call("/api/transacoes/excluir", { id: r.json().id }, c);
  await call("/api/transacoes", b, c);
  assert.equal(
    (await call("/api/transacoes", undefined, c)).json().transactions.length,
    0,
  );
});
test("RNF019 indisponibilidade Olinda não interrompe consulta de perfil", async (t) => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, {
    logger: false,
    externalFetch: async () => {
      throw new Error("offline");
    },
  });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const reg = await app.inject({
    url: "/api/cadastro/etapa1",
    method: "POST",
    payload: person(),
  });
  const cookie = reg.cookies[0].name + "=" + reg.cookies[0].value;
  assert.equal(
    (await app.inject({ url: "/api/mercado/taxas", headers: { cookie } }))
      .statusCode,
    503,
  );
  assert.equal(
    (await app.inject({ url: "/api/perfil", headers: { cookie } })).statusCode,
    200,
  );
});
test("RF003 SMTP ausente informa indisponibilidade sem revelar cadastro", async (t) => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, { logger: false });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const r = await app.inject({
    url: "/api/senha/recuperar",
    method: "POST",
    payload: { email: "nao@test.com" },
  });
  assert.equal(r.statusCode, 503);
  assert.match(r.json().message, /Tente novamente|indisponível/);
});
test("RNF018 webhook exige segredo e deduplica update_id", async (t) => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, {
    logger: false,
    telegramSecret: "segredo-teste-com-32-caracteres-123",
  });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const request = {
    url: "/api/telegram/webhook",
    method: "POST" as const,
    payload: { update_id: 501, message: { text: "/saldo" } },
  };
  assert.equal((await app.inject(request)).statusCode, 403);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await app.inject({
          ...request,
          headers: {
            "x-telegram-bot-api-secret-token":
              "segredo-teste-com-32-caracteres-123",
          },
        })
      ).statusCode,
      200,
    );
  assert.equal(
    (await db.query("select * from telegram_updates")).rows.length,
    1,
  );
});
test("migração suporta tipos legados varchar/int8 e preserva dados e categorias", async (t) => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(await readFile("database/001_schema.sql", "utf8"));
  await pg.exec(
    "ALTER TABLE usuarios ALTER COLUMN renda TYPE varchar USING renda::text; ALTER TABLE usuarios ALTER COLUMN despesas TYPE varchar USING despesas::text; ALTER TABLE usuarios ALTER COLUMN codigo_telegram TYPE bigint USING codigo_telegram::bigint; ALTER TABLE usuarios ALTER COLUMN cpf SET NOT NULL; INSERT INTO usuarios(nome,cpf,email,senha,renda,codigo_telegram) VALUES('Legado','123','legado@test.com','hash','1500.00',123456); INSERT INTO transacoes(usuario_id,descricao,valor,categoria,tipo,data_transacao) VALUES(1,'Ração',15,'Pets','expense','2026-11-04');",
  );
  const sql = await readFile("database/002_requisitos.sql", "utf8");
  await pg.exec(sql);
  await pg.exec(sql);
  const old = (await pg.query("SELECT nome,renda FROM usuarios WHERE id=1"))
    .rows[0];
  assert.equal(old.nome, "Legado");
  assert.equal(old.renda, "1500.00");
  assert.equal(
    (await pg.query("SELECT nome FROM categorias WHERE usuario_id=1")).rows[0]
      .nome,
    "Pets",
  );
  await pg.query(
    "INSERT INTO usuarios(nome,email,senha,consentimento_em) VALUES('Mínimo','minimo2@test.com','hash',NOW())",
  );
  assert.equal((await pg.query("SELECT * FROM usuarios")).rows.length, 2);
});
