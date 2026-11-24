import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { OAuth2Client } from "google-auth-library";
import { googleVerifier } from "../src/integrations/google.js";
import { buildApp } from "../src/app.js";
import { testDatabase } from "./helpers.js";

const person = {
  nome: "Pessoa QA",
  email: "confirmar@example.test",
  senha: "Senha teste 123!",
  confirmar_senha: "Senha teste 123!",
  consentimento: true,
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function setup(
  t: any,
  sender?: (email: string, token: string) => Promise<void>,
) {
  const { pg, db } = await testDatabase();
  const sent: { email: string; token: string }[] = [];
  const app = await buildApp(db, {
    requireEmailVerification: true,
    sendVerification:
      sender ??
      (async (email: string, token: string) => {
        sent.push({ email, token });
      }),
    verifyGoogle: async () => ({
      sub: "google-qa",
      email: person.email,
      name: "Pessoa QA",
    }),
  } as any);
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const post = (url: string, payload: any) =>
    app.inject({ method: "POST", url, payload });
  return { pg, db, app, sent, post };
}

// Removing pending-account enforcement would expose a session before ownership is proven.
test("novo cadastro exige confirmação e não cria sessão", async (t) => {
  const { post, sent, pg } = await setup(t);
  const r = await post("/api/cadastro/etapa1", person);
  assert.equal(r.statusCode, 202, r.body);
  assert.equal(r.json().status, "verification_required");
  assert.equal(r.cookies.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].email, person.email);
  assert.match(sent[0].token, /^[a-f0-9]{64}$/);
  assert.ok(!r.body.includes(sent[0].token));
  const tokens: any = await pg.query(
    "SELECT token_hash FROM verificacoes_email",
  );
  assert.equal(tokens.rows[0].token_hash, hash(sent[0].token));
  const login = await post("/api/login", {
    email: person.email,
    senha: person.senha,
  });
  assert.equal(login.statusCode, 403);
  assert.equal(login.json().code, "EMAIL_NOT_VERIFIED");
  assert.equal(login.cookies.length, 0);
  assert.equal(
    (await post("/api/login", { email: person.email, senha: "errada" }))
      .statusCode,
    401,
  );
});

test("link válido confirma sem autenticar e não pode ser reutilizado", async (t) => {
  const { post, sent } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  assert.equal(
    (await post("/api/email/confirmar", { token: "a".repeat(64) })).statusCode,
    400,
  );
  const r = await post("/api/email/confirmar", { token: sent[0].token });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.cookies.length, 0);
  assert.equal(
    (await post("/api/email/confirmar", { token: sent[0].token })).statusCode,
    400,
  );
  const login = await post("/api/login", {
    email: person.email,
    senha: person.senha,
  });
  assert.equal(login.statusCode, 200, login.body);
  assert.ok(login.cookies.some((c) => c.name === "cashflow_session"));
});

test("link expirado não confirma a conta", async (t) => {
  const { post, sent, pg } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  await pg.exec(
    "UPDATE verificacoes_email SET expira_em=NOW()-INTERVAL '1 second'",
  );
  assert.equal(
    (await post("/api/email/confirmar", { token: sent[0].token })).statusCode,
    400,
  );
  assert.equal(
    (await post("/api/login", { email: person.email, senha: person.senha }))
      .statusCode,
    403,
  );
});

test("reenvio é uniforme, tem intervalo e invalida o link anterior", async (t) => {
  const { post, sent, pg } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  const old = sent[0].token;
  const known = await post("/api/email/reenviar", { email: person.email });
  const absent = await post("/api/email/reenviar", {
    email: "ausente@example.test",
  });
  assert.deepEqual(known.json(), absent.json());
  assert.equal(sent.length, 1);
  await pg.exec(
    "UPDATE verificacoes_email SET criado_em=NOW()-INTERVAL '2 minutes'",
  );
  await post("/api/email/reenviar", { email: person.email });
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].token, old);
  assert.equal(
    (await post("/api/email/confirmar", { token: old })).statusCode,
    400,
  );
  assert.equal(
    (await post("/api/email/confirmar", { token: sent[1].token })).statusCode,
    200,
  );
});

test("falha de envio mantém conta pendente e permite reenvio", async (t) => {
  let fail = true;
  let token = "";
  const { post, pg } = await setup(t, async (_email, value) => {
    if (fail) throw Error("SMTP indisponível");
    token = value;
  });
  const r = await post("/api/cadastro/etapa1", person);
  assert.equal(r.statusCode, 202, r.body);
  assert.equal(r.json().emailSent, false);
  assert.equal(
    (await pg.query("SELECT * FROM verificacoes_email")).rows.length,
    0,
  );
  fail = false;
  await post("/api/email/reenviar", { email: person.email });
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await post("/api/email/confirmar", { token })).statusCode, 200);
});

test("sem sender não cadastra conta que não poderá confirmar", async (t) => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, { requireEmailVerification: true } as any);
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  const r = await app.inject({
    method: "POST",
    url: "/api/cadastro/etapa1",
    payload: person,
  });
  assert.equal(r.statusCode, 503);
  assert.equal((await pg.query("SELECT * FROM usuarios")).rows.length, 0);
});

test("conta anterior à exigência mantém login", async (t) => {
  const { post, pg } = await setup(t);
  await pg.query("INSERT INTO usuarios(nome,email,senha) VALUES($1,$2,$3)", [
    person.nome,
    person.email,
    await bcrypt.hash(person.senha, 4),
  ]);
  assert.equal(
    (await post("/api/login", { email: person.email, senha: person.senha }))
      .statusCode,
    200,
  );
});

test("Google verificado confirma pendência sem preservar senha de pré-cadastro", async (t) => {
  const { post, pg } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  const r = await post("/api/login/google", {
    credential: "id-token-de-teste",
  });
  assert.equal(r.statusCode, 200, r.body);
  const user: any = (
    await pg.query("SELECT senha,email_confirmado_em FROM usuarios")
  ).rows[0];
  assert.equal(user.senha, null);
  assert.ok(user.email_confirmado_em);
  assert.equal(
    (await post("/api/login", { email: person.email, senha: person.senha }))
      .statusCode,
    401,
  );
});

test("trocar e-mail exige nova confirmação e revoga a sessão anterior", async (t) => {
  const { post, app, pg, sent } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  await post("/api/email/confirmar", { token: sent[0].token });
  const login = await post("/api/login", {
    email: person.email,
    senha: person.senha,
  });
  const cookie = login.cookies[0].name + "=" + login.cookies[0].value;
  const update = await app.inject({
    method: "POST",
    url: "/api/perfil",
    payload: { email: "novo@example.test" },
    headers: { cookie },
  });
  assert.equal(update.json().status, "verification_required", update.body);
  assert.equal(
    (await app.inject({ url: "/api/perfil", headers: { cookie } })).statusCode,
    401,
  );
  assert.equal(
    (
      await post("/api/login", {
        email: "novo@example.test",
        senha: person.senha,
      })
    ).statusCode,
    403,
  );
  assert.equal(sent[1].email, "novo@example.test");
  assert.equal(
    (await post("/api/email/confirmar", { token: sent[1].token })).statusCode,
    200,
  );
  assert.equal(
    (
      await post("/api/login", {
        email: "novo@example.test",
        senha: person.senha,
      })
    ).statusCode,
    200,
  );
  assert.equal((await pg.query("SELECT * FROM sessoes")).rows.length, 1);
});

test("carregar a página do link não consome token; confirmação depende do botão", async (t) => {
  const { post, sent, app } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  const r = await app.inject({ url: "/confirmar-email.html" });
  assert.equal(r.statusCode, 200);
  const dom = new JSDOM(r.body, {
    url: "http://localhost/confirmar-email.html#token=" + sent[0].token,
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const calls: any[] = [];
  const w: any = dom.window;
  w.fetch = async (url: string, options: any) => {
    const result = await post(url, JSON.parse(options.body));
    calls.push({ url, status: result.statusCode });
    return { ok: result.statusCode === 200, json: async () => result.json() };
  };
  w.eval(await readFile("public/confirmar-email.js", "utf8"));
  assert.equal(w.location.hash, "");
  assert.equal(calls.length, 0);
  assert.equal(w.document.getElementById("confirmEmail").hidden, false);
  w.document.getElementById("confirmEmail").click();
  for (
    let n = 0;
    n < 100 && !w.document.getElementById("resendForm").hidden;
    n++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, [{ url: "/api/email/confirmar", status: 200 }]);
  assert.equal(w.document.getElementById("resendForm").hidden, true);
  assert.equal(
    (await post("/api/login", { email: person.email, senha: person.senha }))
      .statusCode,
    200,
  );
});

test("duas confirmações simultâneas não reutilizam o token", async (t) => {
  const { post, sent } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  const results = await Promise.all([
    post("/api/email/confirmar", { token: sent[0].token }),
    post("/api/email/confirmar", { token: sent[0].token }),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 400]);
});

test("tokens não podem ser consultados pelo papel de usuário", async (t) => {
  const { post, db, pg } = await setup(t);
  await post("/api/cadastro/etapa1", person);
  await assert.rejects(
    db.transaction(
      (tx) => tx.query("SELECT token_hash FROM verificacoes_email"),
      1,
    ),
  );
  await pg.exec(await readFile("database/004_email_verification.sql", "utf8"));
  assert.equal((await pg.query("SELECT * FROM usuarios")).rows.length, 1);
  assert.equal(
    (await pg.query("SELECT * FROM verificacoes_email")).rows.length,
    1,
  );
});

test("Google não confirma um endereço diferente do e-mail verificado no token", async (t) => {
  const { post, pg } = await setup(t);
  await pg.query(
    "INSERT INTO usuarios(nome,email,google_sub,email_verificacao_obrigatoria) VALUES('QA','outro@example.test','google-qa',TRUE)",
  );
  const r = await post("/api/login/google", { credential: "token-qa" });
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.cookies.length, 0);
  assert.equal(
    (await pg.query("SELECT email_confirmado_em FROM usuarios")).rows[0]
      .email_confirmado_em,
    null,
  );
});

test("sem SMTP não altera endereço nem bloqueia conta existente no perfil", async (t) => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, { requireEmailVerification: true } as any);
  t.after(async () => {
    await app.close();
    await pg.close();
  });
  await pg.query("INSERT INTO usuarios(nome,email,senha) VALUES($1,$2,$3)", [
    person.nome,
    person.email,
    await bcrypt.hash(person.senha, 4),
  ]);
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email: person.email, senha: person.senha },
  });
  const cookie = login.cookies[0].name + "=" + login.cookies[0].value;
  const r = await app.inject({
    method: "POST",
    url: "/api/perfil",
    payload: { email: "troca@example.test" },
    headers: { cookie },
  });
  assert.equal(r.statusCode, 503, r.body);
  assert.equal(
    (await pg.query("SELECT email FROM usuarios")).rows[0].email,
    person.email,
  );
  assert.equal(
    (await app.inject({ url: "/api/perfil", headers: { cookie } })).statusCode,
    200,
  );
});

test("verificador Google exige declaração explícita de e-mail verificado", async (t) => {
  let verified: boolean | undefined = undefined;
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({
    getPayload: () => ({
      sub: "qa",
      email: "qa@example.test",
      email_verified: verified,
    }),
  }));
  const verify = googleVerifier("client-qa")!;
  await assert.rejects(verify("token-fixture"));
  verified = false;
  await assert.rejects(verify("token-fixture"));
  verified = true;
  assert.equal((await verify("token-fixture")).email, "qa@example.test");
});
