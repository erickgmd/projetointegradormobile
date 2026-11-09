import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { testDatabase } from "./helpers.js";
test("repro", async () => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, { logger: false });
  const fd = new FormData();
  for (const [k, v] of Object.entries({ consentimento: "true", nome: "José Ação D'Ávila", cpf: "123.456.789-01", nascimento: "", telefone: "(61) 99999-9999", email: "jose@example.test", senha: "S3nh@#$%&*!çã", confirmar_senha: "S3nh@#$%&*!çã" })) fd.append(k, v);
  const req = new Request("http://x", { method: "POST", body: fd });
  const r = await app.inject({ method: "POST", url: "/api/cadastro/etapa1", headers: Object.fromEntries(req.headers), payload: Buffer.from(await req.arrayBuffer()) });
  console.log(r.statusCode, r.body);
  const u = await pg.query("select nome, cpf from usuarios");
  console.log(u.rows);
  const l = await app.inject({ method: "POST", url: "/api/login", headers: {"content-type":"application/x-www-form-urlencoded"}, payload: `email=jose%40example.test&senha=${encodeURIComponent("S3nh@#$%&*!çã")}` });
  console.log(l.statusCode, l.body);
  await app.close(); await pg.close();
});
