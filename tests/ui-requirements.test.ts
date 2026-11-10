import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const read = (p: string) => readFile("public/" + p, "utf8");
test("editar preenche todos os campos e usa endpoint de edição sem perder dados", async () => {
  const html =
    '<form id="transactionForm">' +
    ["description", "amount", "category", "type", "date"]
      .map((id) => `<input id="${id}">`)
      .join("") +
    "</form>";
  const dom = new JSDOM(html, {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  const w: any = dom.window;
  const source = await read("CashFlow_Tela_HomePage/home1.js");
  // Execute somente a classe; os inicializadores da página dependem das bibliotecas de gráficos.
  w.eval(
    source.slice(
      0,
      source.indexOf(
        "\n//",
        source.indexOf("\n}", source.indexOf("class FinanceManager")),
      ),
    ) + "\nwindow.Manager=FinanceManager;",
  );
  const manager = Object.create(w.Manager.prototype);
  manager.transactions = [
    {
      id: 7,
      description: "Mercado",
      amount: 35.9,
      category: "alimentacao",
      type: "expense",
      date: "2026-11-04",
    },
  ];
  w.HTMLElement.prototype.scrollIntoView = () => {};
  manager.editTransaction(7);
  assert.equal(w.document.getElementById("description").value, "Mercado");
  assert.equal(w.document.getElementById("amount").value, "35.9");
  let endpoint = "";
  let payload: any;
  w.fetch = async (url: string, options: any) => {
    endpoint = url;
    payload = options.body;
    return { text: async () => JSON.stringify({ status: "success" }) };
  };
  manager.loadTransactions = async () => {};
  manager.updateDisplay = () => {};
  manager.showSuccessMessage = () => {};
  await manager.addTransaction();
  assert.equal(endpoint, "/api/transacoes/editar");
  assert.equal(payload.get("id"), "7");
  assert.ok(payload.get("idempotency_key"));
  assert.equal(manager.editingId, null);
  dom.window.close();
});
test("despesa rápida envia texto e mantém chave ao tentar novamente após falha", async () => {
  const dom = new JSDOM('<main><form id="transactionForm"></form></main>', {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  const w: any = dom.window;
  const requests: any[] = [];
  let fail = true;
  w.fetch = async (url: string, options: any) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (fail) throw Error("offline");
    return { ok: true, json: async () => ({ status: "success" }) };
  };
  w.financeManager = {
    loadTransactions: async () => {},
    updateDisplay: () => {},
  };
  w.eval(await read("requirements.js"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const form = w.document.getElementById("quickExpense");
  w.document.getElementById("quickText").value = "mercado 35,90";
  await form.onsubmit({ preventDefault() {}, target: form });
  fail = false;
  await form.onsubmit({ preventDefault() {}, target: form });
  assert.equal(requests[0].url, "/api/transacoes/rapida");
  assert.equal(requests[0].body.texto, "mercado 35,90");
  assert.equal(
    requests[0].body.idempotency_key,
    requests[1].body.idempotency_key,
  );
  assert.equal(w.document.getElementById("quickText").value, "");
  dom.window.close();
});
test("recuperação, consentimento e alertas têm contratos e limiares acessíveis", async () => {
  const login = new JSDOM(await read("CashFlow_Tela_de_Login/login.html"));
  assert.equal(
    login.window.document.querySelector(".forgot-link")?.getAttribute("href"),
    "/recuperar-senha.html",
  );
  login.window.close();
  const signup = new JSDOM(
    await read("CashFlow_Tela_de_Cadastro/dadospessoais.html"),
  );
  assert.ok(
    signup.window.document.querySelector(
      'label[for="termos2"] a[href="/privacidade.html"]',
    ),
  );
  signup.window.close();
  assert.match(await read("session.js"), /if \(!event\.isTrusted\) return/);
  assert.match(
    await read("CashFlow_Tela_HomePage/home1.js"),
    /despesas >= limite\)/,
  );
  assert.match(
    await read("CashFlow_Tela_HomePage/home1.js"),
    /despesas >= limite \* 0\.8/,
  );
});
test("etapas opcionais podem enviar vazios e perfil exige apenas nome e email", async () => {
  const dom = new JSDOM(await read("CashFlow_Tela_de_Cadastro/endereco.html"), {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  const w: any = dom.window;
  let body: any;
  w.alert = () => {};
  w.fetch = async (_url: string, options: any) => {
    body = options.body;
    return { json: async () => ({ status: "error", message: "teste" }) };
  };
  w.eval(await read("CashFlow_Tela_de_Cadastro/enderecojs.js"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  w.document.getElementById("logradouro").value = "Não coletar";
  w.document.getElementById("skipAddress").click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(body.get("logradouro"), "");
  assert.equal(body.get("cep"), "");
  dom.window.close();
  const profile = new JSDOM(await read("CashFlow_Tela_Perfil/perfil.html"));
  assert.deepEqual(
    [...profile.window.document.querySelectorAll("[required]")].map((e) =>
      e.getAttribute("name"),
    ),
    ["nome", "email"],
  );
  profile.window.close();
  const final = new JSDOM(
    await read("CashFlow_Tela_de_Cadastro/finalizacao.html"),
    { url: "http://localhost", runScripts: "outside-only" },
  );
  const fw: any = final.window;
  let financial: any;
  fw.alert = () => {};
  fw.fetch = async (_url: string, options: any) => {
    financial = options.body;
    return {
      text: async () => JSON.stringify({ status: "error", message: "teste" }),
    };
  };
  for (const script of fw.document.querySelectorAll("script:not([src])"))
    fw.eval(script.textContent);
  fw.document.getElementById("renda").value = "R$ 9.000,00";
  fw.document.getElementById("skipFinance").click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(financial.get("renda"), "");
  assert.equal(financial.get("tipo_investimento"), "");
  final.window.close();
});
test("axe-core: login, três etapas cadastro e privacidade sem violações automatizadas detectadas (cor excluída)", async () => {
  const axe = await readFile("node_modules/axe-core/axe.min.js", "utf8");
  for (const file of [
    "CashFlow_Tela_de_Login/login.html",
    "CashFlow_Tela_de_Cadastro/dadospessoais.html",
    "CashFlow_Tela_de_Cadastro/endereco.html",
    "CashFlow_Tela_de_Cadastro/finalizacao.html",
    "privacidade.html",
  ]) {
    const dom = new JSDOM(await read(file), { runScripts: "outside-only" });
    const w: any = dom.window;
    w.eval(axe);
    const result = await w.axe.run(w.document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    assert.equal(
      result.violations.length,
      0,
      file + ": " + JSON.stringify(result.violations.map((v: any) => v.id)),
    );
    dom.window.close();
  }
});
test("axe-core: Home e Perfil com controles dinâmicos sem violações automatizadas detectadas (cor excluída)", async () => {
  const axe = await readFile("node_modules/axe-core/axe.min.js", "utf8");
  for (const path of [
    "CashFlow_Tela_HomePage/home.html",
    "CashFlow_Tela_Perfil/perfil.html",
  ]) {
    const dom = new JSDOM(await read(path), {
      url: "http://localhost/" + path,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const w: any = dom.window;
    w.eval(await read("requirements.js"));
    w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
    w.eval(axe);
    const report = await w.axe.run(w.document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    assert.equal(
      JSON.stringify(
        report.violations.map((v: any) => ({
          id: v.id,
          nodes: v.nodes.map((n: any) => n.target),
        })),
      ),
      "[]",
      path,
    );
    dom.window.close();
  }
});
