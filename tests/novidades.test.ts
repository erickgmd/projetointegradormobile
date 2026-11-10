import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { testDatabase } from "./helpers.js";
import { strongPassword } from "../src/validation.js";
import { resetEmail } from "../src/integrations/mail.js";

const person = {
  nome: "Ana Teste",
  email: "ana@example.test",
  senha: "Forte#2026ç",
  confirmar_senha: "Forte#2026ç",
  consentimento: true,
};

async function setup(t: any, extra: Record<string, any> = {}) {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, { logger: false, ...extra });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  return { app, pg };
}

test("senha forte: exige maiúscula, minúscula, número e especial; aceita acentos e símbolos", () => {
  assert.equal(strongPassword("Forte#2026ç"), "Forte#2026ç");
  assert.equal(strongPassword("Ação 2026!"), "Ação 2026!");
  for (const fraca of [
    "curta1!",
    "semnumero!A",
    "SEMMINUSCULA1!",
    "semmaiuscula1!",
    "SemEspecial123",
  ])
    assert.throws(() => strongPassword(fraca), /Senha fraca/);
});

test("cadastro recusa senha fraca e aceita nome com caracteres especiais", async (t) => {
  const { app } = await setup(t);
  const fraca = await app.inject({
    method: "POST",
    url: "/api/cadastro/etapa1",
    payload: { ...person, senha: "senha123", confirmar_senha: "senha123" },
  });
  assert.equal(fraca.statusCode, 400);
  assert.match(fraca.json().message, /maiúscula/);
  const ok = await app.inject({
    method: "POST",
    url: "/api/cadastro/etapa1",
    payload: { ...person, nome: "João D'Ávila-Conceição" },
  });
  assert.equal(ok.statusCode, 200);
});

test("lembrar de mim: cookie persistente só quando marcado", async (t) => {
  const { app } = await setup(t);
  await app.inject({
    method: "POST",
    url: "/api/cadastro/etapa1",
    payload: person,
  });
  const login = (lembrar: boolean) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: person.email, senha: person.senha, lembrar },
    });
  const sem = (await login(false)).cookies.find(
    (c) => c.name === "cashflow_session",
  );
  const com = (await login(true)).cookies.find(
    (c) => c.name === "cashflow_session",
  );
  assert.equal(sem?.maxAge, undefined);
  assert.equal(com?.maxAge, 30 * 24 * 3600);
});

test("login com Google: cria conta com consentimento, vincula e entra", async (t) => {
  const { app, pg } = await setup(t, {
    googleClientId: "cliente.apps.googleusercontent.com",
    verifyGoogle: async (credential: string) => {
      if (credential !== "token-valido")
        throw Object.assign(new Error("x"), { statusCode: 401 });
      return { sub: "g-123", email: "maria@gmail.com", name: "Maria Souza" };
    },
  });
  const config = await app.inject({ url: "/api/config/publica" });
  assert.equal(
    config.json().googleClientId,
    "cliente.apps.googleusercontent.com",
  );
  const google = (payload: any) =>
    app.inject({ method: "POST", url: "/api/login/google", payload });
  assert.equal(
    (await google({ credential: "token-invalido" })).statusCode,
    401,
  );
  const semConsentimento = await google({ credential: "token-valido" });
  assert.equal(semConsentimento.statusCode, 409);
  assert.equal(semConsentimento.json().status, "consent_required");
  const novo = await google({
    credential: "token-valido",
    consentimento: true,
  });
  assert.equal(novo.statusCode, 200);
  assert.equal(novo.json().novo, true);
  assert.match(novo.json().proxima, /endereco/);
  const denovo = await google({ credential: "token-valido" });
  assert.equal(denovo.json().novo, false);
  assert.match(denovo.json().proxima, /home/);
  const rows = (
    await pg.query("select nome,email,senha,google_sub from usuarios")
  ).rows as any[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].google_sub, "g-123");
  assert.equal(rows[0].senha, null);
  const cookie = denovo.cookies[0].name + "=" + denovo.cookies[0].value;
  const excluir = await app.inject({
    method: "POST",
    url: "/api/conta/excluir",
    headers: { cookie },
    payload: { confirmacao: "EXCLUIR" },
  });
  assert.equal(excluir.statusCode, 200);
});

test("Google vincula conta existente com o mesmo email", async (t) => {
  const { app, pg } = await setup(t, {
    googleClientId: "c",
    verifyGoogle: async () => ({
      sub: "g-9",
      email: person.email,
      name: "Ana",
    }),
  });
  await app.inject({
    method: "POST",
    url: "/api/cadastro/etapa1",
    payload: person,
  });
  const r = await app.inject({
    method: "POST",
    url: "/api/login/google",
    payload: { credential: "x" },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().novo, false);
  assert.equal(
    (await pg.query("select google_sub from usuarios")).rows.length,
    1,
  );
});

test("taxas BCB: consulta TaxasJurosMensalPorMes e usa o mês mais recente quando o pedido ainda não saiu", async (t) => {
  const urls: string[] = [];
  const { app } = await setup(t, {
    externalFetch: (async (url: any) => {
      const u = String(url);
      urls.push(u);
      const value = u.includes("2026-10")
        ? []
        : u.includes("orderby")
          ? [{ anoMes: "2026-09" }]
          : [
              {
                InstituicaoFinanceira: "BANCO X",
                TaxaJurosAoAno: 30,
                anoMes: "2026-09",
              },
            ];
      return new Response(JSON.stringify({ value }), { status: 200 });
    }) as any,
  });
  const reg = await app.inject({
    method: "POST",
    url: "/api/cadastro/etapa1",
    payload: person,
  });
  const cookie = reg.cookies[0].name + "=" + reg.cookies[0].value;
  const r = await app.inject({
    url: "/api/mercado/taxas?mes=2026-10",
    headers: { cookie },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().mes, "2026-09");
  assert.equal(r.json().value.length, 1);
  assert.ok(
    urls[0].startsWith(
      "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes?$filter=",
    ),
  );
  assert.ok(!urls.some((u) => u.includes("(Mes=")));
});

test("email de recuperação traz link em texto e botão em HTML", () => {
  const m = resetEmail(
    "https://cashflow.exemplo/redefinir-senha.html?token=a&b=1",
  );
  assert.match(m.text, /token=a&b=1/);
  assert.match(
    m.html,
    /href="https:\/\/cashflow\.exemplo\/redefinir-senha\.html\?token=a&amp;b=1"/,
  );
});

test("desenvolvimento aceita localhost, 127.0.0.1 e 10.0.2.2; produção não", async (t) => {
  for (const production of [false, true]) {
    const { app } = await setup(t, {
      appOrigin: "http://localhost:3001",
      production,
    });
    const r = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: {
        origin: "http://127.0.0.1:3001",
        "x-forwarded-proto": "https",
      },
      payload: { email: "nao@existe.test", senha: "x" },
    });
    if (production) assert.ok([403, 426].includes(r.statusCode));
    else assert.equal(r.statusCode, 401);
  }
});

test("banco antigo com senha NOT NULL: migração 003 libera conta só com Google", async (t) => {
  const { pg, db } = await testDatabase();
  await pg.exec(
    "UPDATE usuarios SET senha='x' WHERE senha IS NULL; ALTER TABLE usuarios ALTER COLUMN senha SET NOT NULL;",
  );
  const { readFile } = await import("node:fs/promises");
  await pg.exec(await readFile("database/003_google_lembrar.sql", "utf8"));
  const app = await buildApp(db, {
    logger: false,
    verifyGoogle: async () => ({
      sub: "g-1",
      email: "novo@gmail.com",
      name: "Novo",
    }),
  });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const r = await app.inject({
    method: "POST",
    url: "/api/login/google",
    payload: { credential: "x", consentimento: true },
  });
  assert.equal(r.statusCode, 200);
});
