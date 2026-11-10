import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../src/app.js";
import { testDatabase } from "./helpers.js";
async function files(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    result.push(...(item.isDirectory() ? await files(p) : [p]));
  }
  return result;
}
test("HTML e JavaScript sem chamadas PHP; arquivos locais referenciados existem", async () => {
  for (const file of await files("public")) {
    if (!/\.(html|js)$/.test(file)) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /fetch\([^\n]*\.php/, file);
    if (!file.endsWith(".html")) continue;
    const dom = new JSDOM(source, {
      url: "http://localhost/" + file.replace(/^public\//, ""),
    });
    for (const el of dom.window.document.querySelectorAll(
      "[src],link[href],a[href]",
    )) {
      const ref = el.getAttribute("src") ?? el.getAttribute("href");
      if (!ref || /^(https?:|data:|#|mailto:|javascript:)/.test(ref)) continue;
      const url = new URL(ref, dom.window.location.href);
      const target = path.join("public", decodeURIComponent(url.pathname));
      await assert.doesNotReject(() => access(target), `${file} -> ${ref}`);
    }
    dom.window.close();
  }
});
test("tela inicial usa API para carregar, adicionar e remover transações", async (t) => {
  const { pg, db } = await testDatabase();
  const app = await buildApp(db, { logger: false });
  const register = await app.inject({
    method: "POST",
    url: "/api/cadastro/etapa1",
    payload: {
      nome: "Erick Teste",
      cpf: "12345678901",
      nascimento: "2000-01-02",
      telefone: "61999999999",
      email: "ui@test.com",
      senha: "Senha teste 123!",
      confirmar_senha: "Senha teste 123!",
      consentimento: true,
    },
  });
  assert.equal(register.statusCode, 200);
  const cookie = register.cookies[0].name + "=" + register.cookies[0].value;
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on("error", (...args) => errors.push(args.join(" ")));
  vc.on("jsdomError", (e) => {
    if (!e.message.includes("Not implemented")) errors.push(e.message);
  });
  const dom = new JSDOM(
    await readFile("public/CashFlow_Tela_HomePage/home.html", "utf8"),
    {
      url: "http://localhost/CashFlow_Tela_HomePage/home.html",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: vc,
    },
  );
  t.after(async () => {
    dom.window.close();
    await app.close();
    await pg.close();
  });
  const w: any = dom.window;
  w.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  w.alert = (m: string) => errors.push("alert: " + m);
  w.confirm = () => true;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  // Chart/PDF são bibliotecas de terceiros; este teste verifica a integração de dados da tela.
  w.HTMLCanvasElement.prototype.getContext = () => ({});
  w.Chart = class {
    destroy() {}
    update() {}
  };
  w.fetch = async (url: string, options: any = {}) => {
    const target = new URL(url, w.location.href);
    if (target.host !== "localhost")
      throw new Error("Serviço externo fora do teste");
    let payload = options.body;
    if (payload instanceof w.FormData)
      payload = Object.fromEntries(payload.entries());
    const response = await app.inject({
      url: target.pathname,
      method: options.method ?? "GET",
      headers: { cookie, ...options.headers },
      ...(payload !== undefined ? { payload } : {}),
    });
    return {
      ok: response.statusCode < 400,
      status: response.statusCode,
      text: async () => response.body,
      json: async () => response.json(),
    };
  };
  w.eval(await readFile("public/session.js", "utf8"));
  w.eval(await readFile("public/CashFlow_Tela_HomePage/home1.js", "utf8"));
  if (w.document.readyState !== "loading")
    w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  // Aguarde a inicialização assíncrona da tela.
  for (let i = 0; i < 100 && !w.financeManager; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.ok(w.financeManager, "FinanceManager inicializado");
  await w.financeManager.loadTransactions();
  for (const [key, value] of Object.entries({
    description: "Teste interface",
    amount: "250.50",
    category: "salario",
    type: "income",
    date: "2026-11-04",
  }))
    w.document.getElementById(key).value = value;
  await w.financeManager.addTransaction();
  assert.equal(w.financeManager.transactions.length, 1);
  assert.match(
    w.document.getElementById("transactionList").textContent,
    /Teste interface/,
  );
  const id = w.financeManager.transactions[0].id;
  await w.financeManager.deleteTransaction(id);
  assert.equal(w.financeManager.transactions.length, 0);
  assert.deepEqual(errors, []);
});
