import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../src/app.js";
import bcrypt from "bcryptjs";
import { testDatabase } from "./helpers.js";
import { randomUUID } from "node:crypto";

const person = (email = "erick@example.test") => ({
  nome: "Erick Teste",
  cpf: "12345678901",
  nascimento: "2000-01-02",
  telefone: "61999999999",
  email,
  senha: "Senha teste 123!",
  confirmar_senha: "Senha teste 123!",
  consentimento: true,
});
async function setup(t: any) {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, { logger: false });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const call = async (
    url: string,
    payload?: any,
    cookie?: string,
    headers: any = {},
  ) =>
    app.inject({
      method: payload === undefined ? "GET" : "POST",
      url,
      payload:
        payload && ["/api/transacoes", "/api/transacoes/editar"].includes(url)
          ? { idempotency_key: randomUUID(), ...payload }
          : payload,
      headers: { ...(cookie ? { cookie } : {}), ...headers },
    });
  const register = async (email?: string) => {
    const r = await call("/api/cadastro/etapa1", person(email));
    assert.equal(r.statusCode, 200, r.body);
    return r.cookies[0].name + "=" + r.cookies[0].value;
  };
  return { pg, db, app, call, register };
}
test("cadastro em três etapas, perfil, moeda, Telegram e login/logout persistentes", async (t) => {
  const { call, register, pg } = await setup(t);
  const cookie = await register();
  assert.equal(
    (
      await call(
        "/api/cadastro/etapa2",
        {
          cep: "70000000",
          logradouro: "Rua Teste",
          bairro: "Centro",
          cidade: "Brasília",
          estado: "DF",
        },
        cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/cadastro/etapa3",
        {
          renda: "R$ 5.000,50",
          despesas: "1000.25",
          menor_18: "false",
          tipo_investimento: "Renda fixa",
          faixa_investimento: "Até 1000",
        },
        cookie,
      )
    ).statusCode,
    200,
  );
  const profile = (await call("/api/perfil", undefined, cookie)).json().dados;
  assert.equal(Number(profile.renda), 5000.5);
  assert.equal(profile.nascimento, "2000-01-02");
  assert.equal(profile.senha, undefined);
  assert.equal(
    (
      await call(
        "/api/perfil",
        { nome: "Erick Teste", gasto_maximo: "" },
        cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await pg.query("select menor_18 from usuarios")).rows[0].menor_18,
    false,
  );
  assert.equal(
    (
      await call(
        "/api/perfil",
        { nome: "Erick Atualizado", gasto_maximo: "R$ 1.234,56" },
        cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await call("/api/config/gastos", undefined, cookie)).json().gasto_maximo,
    1234.56,
  );
  assert.equal(
    (
      await call("/api/config/gastos", { gasto_maximo: "300.10" }, cookie)
    ).json().gasto_maximo,
    300.1,
  );
  const telegram = await call(
    "/api/telegram",
    { acao: "gerar", nome_telegram: "@erick" },
    cookie,
  );
  assert.equal(telegram.json().tem_codigo, true);
  assert.equal(
    (await call("/api/telegram", { acao: "verificar" }, cookie)).json().codigo,
    null,
  );
  assert.equal((await call("/api/logout", {}, cookie)).statusCode, 200);
  assert.equal((await call("/api/perfil", undefined, cookie)).statusCode, 401);
  assert.equal(
    (await call("/api/login", { email: person().email, senha: "incorreta" }))
      .statusCode,
    401,
  );
  const login = await call("/api/login", {
    email: person().email.toUpperCase(),
    senha: person().senha,
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().username, "Erick Atualizado");
  const token = login.cookies[0].value;
  assert.ok(
    !JSON.stringify((await pg.query("select * from sessoes")).rows).includes(
      token,
    ),
  );
});
test("transações, isolamento entre usuários e validação de data/valor", async (t) => {
  const { call, register } = await setup(t);
  const a = await register("a@test.com");
  const b = await register("b@test.com");
  const tx = {
    description: "Salário",
    amount: "2.500,25",
    category: "salario",
    type: "income",
    date: "2026-11-04",
  };
  assert.equal((await call("/api/transacoes", tx)).statusCode, 401);
  const saved = await call("/api/transacoes", tx, a);
  assert.equal(saved.statusCode, 200, saved.body);
  const id = saved.json().id;
  const list = (await call("/api/transacoes", undefined, a)).json()
    .transactions;
  assert.equal(list.length, 1);
  assert.equal(Number(list[0].amount), 2500.25);
  assert.equal(list[0].date, tx.date);
  assert.equal(
    (await call("/api/transacoes", undefined, b)).json().transactions.length,
    0,
  );
  assert.equal(
    (await call("/api/transacoes/excluir", { id }, b)).statusCode,
    404,
  );
  for (const bad of [
    { amount: "-1" },
    { amount: "abc" },
    { amount: "1.001" },
    { date: "2026-02-30" },
    { type: "invalid" },
  ])
    assert.equal(
      (await call("/api/transacoes", { ...tx, ...bad }, a)).statusCode,
      400,
    );
  assert.equal(
    (await call("/api/transacoes/excluir", { id }, a)).statusCode,
    200,
  );
  await call("/api/transacoes", tx, a);
  await call("/api/transacoes", tx, b);
  assert.equal((await call("/api/transacoes/limpar", {}, a)).statusCode, 200);
  assert.equal(
    (await call("/api/transacoes", undefined, a)).json().transactions.length,
    0,
  );
  assert.equal(
    (await call("/api/transacoes", undefined, b)).json().transactions.length,
    1,
  );
});
test("bcrypt PHP, formulários multipart, duplicidade e proteção de origem", async (t) => {
  const { call, register, pg, app } = await setup(t);
  const cookie = await register();
  const hash = await bcrypt.hash(person().senha, 4);
  await pg.query("update usuarios set senha=$1", [
    hash.replace("$2b$", "$2y$"),
  ]);
  assert.equal(
    (await call("/api/login", { email: person().email, senha: person().senha }))
      .statusCode,
    200,
  );
  assert.equal((await call("/api/cadastro/etapa1", person())).statusCode, 409);
  assert.equal(
    (
      await call("/api/config/gastos", { gasto_maximo: "999" }, cookie, {
        origin: "https://outro.example",
      })
    ).statusCode,
    403,
  );
  const boundary = "cashflow-test";
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="gasto_maximo"\r\n\r\n123,45\r\n--${boundary}--\r\n`;
  const r = await app.inject({
    method: "POST",
    url: "/api/config/gastos",
    headers: {
      cookie,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().gasto_maximo, 123.45);
  assert.equal(
    (await call("/api/perfil", { email: "inválido" }, cookie)).statusCode,
    400,
  );
  assert.equal((await call("/src/app.ts")).statusCode, 404);
});
test("migração aditiva e idempotente mantém dados", async (t) => {
  const { pg, register, call } = await setup(t);
  const c = await register();
  await pg.exec(await readFile("database/001_schema.sql", "utf8"));
  assert.equal(
    (await call("/api/perfil", undefined, c)).json().dados.nome,
    "Erick Teste",
  );
});
test("sessão expirada, senha com espaços e campos limitados", async (t) => {
  const { call, pg } = await setup(t);
  const p = {
    ...person("espacos@test.com"),
    senha: "  Senha teste 123!  ",
    confirmar_senha: "  Senha teste 123!  ",
  };
  const registered = await call("/api/cadastro/etapa1", p);
  assert.equal(registered.statusCode, 200);
  const login = await call("/api/login", { email: p.email, senha: p.senha });
  assert.equal(login.statusCode, 200);
  assert.equal(
    (await call("/api/login", { email: p.email, senha: p.senha.trim() }))
      .statusCode,
    401,
  );
  const c = login.cookies[0].name + "=" + login.cookies[0].value;
  assert.equal(
    (await call("/api/perfil", { cpf: "1".repeat(21) }, c)).statusCode,
    400,
  );
  await pg.query("update sessoes set expira_em=NOW()-INTERVAL '1 day'");
  assert.equal((await call("/api/perfil", undefined, c)).statusCode, 401);
});

test("aceita a origem do emulador Android configurada como adicional", async (t) => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, {
    logger: false,
    appOrigin: "http://localhost:3001",
    extraOrigins: ["http://10.0.2.2:3001"],
  });
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const login = (origin: string) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin, "content-type": "application/json" },
      payload: { email: "ninguem@example.test", senha: "Senha teste 123!" },
    });
  assert.notEqual((await login("http://10.0.2.2:3001")).statusCode, 403);
  assert.notEqual((await login("http://localhost:3001")).statusCode, 403);
  assert.equal((await login("http://192.168.0.9:3001")).statusCode, 403);
});
