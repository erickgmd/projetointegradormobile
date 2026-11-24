// Cadastro em um passo: nome, email e senha (ou Google). O resto fica no perfil.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = document.querySelector("form");
  const alerta = $("cadastroAlerta");
  const termos = $("termos2");
  const emailInput = $("email");
  const dica = $("emailDica");
  const DRAFT_KEY = "cashflow-cadastro-rascunho";
  const draftFields = ["nome", "email"];

  // ---------- Senha: mostrar/ocultar e requisitos ao vivo ----------
  CashFlowAuth.attachPasswordToggle($("senha"));
  CashFlowAuth.attachStrengthMeter($("senha"));

  // ---------- Rascunho: nada se perde ao abrir os termos ----------
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
    for (const id of draftFields) if (draft[id] && !$(id).value) $(id).value = draft[id];
    if (draft.termos) termos.checked = true;
  } catch { /* sem armazenamento */ }
  const saveDraft = () => {
    try {
      const draft = { termos: termos.checked };
      for (const id of draftFields) draft[id] = $(id).value;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* sem armazenamento */ }
  };
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  // ---------- Já conectado? Oferece voltar ao app ----------
  fetch("/api/perfil", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((r) => {
      if (!r?.dados?.nome) return;
      $("sessaoNome").textContent = r.dados.nome;
      $("sessaoAtiva").hidden = false;
    })
    .catch(() => {});

  // ---------- Erros no padrão da tela ----------
  function clearErrors() {
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
    form.querySelectorAll(".input-invalid").forEach((el) => el.classList.remove("input-invalid"));
    alerta.className = "form-alert";
  }

  function fieldError(element, message) {
    const p = document.createElement("p");
    p.className = "field-error";
    p.textContent = message;
    if (element.type === "checkbox") {
      element.closest(".checkbox-container").insertAdjacentElement("afterend", p);
    } else {
      element.classList.add("input-invalid");
      const group = element.closest(".form-group");
      const anchor = group.querySelector(".pw-meter") || group.querySelector(".email-suggestion:not([hidden])") || element.closest(".pw-field") || element;
      anchor.insertAdjacentElement("afterend", p);
    }
    return p;
  }

  function showAlert(type, message) {
    alerta.className = `form-alert show ${type}`;
    alerta.textContent = message;
    alerta.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  // ---------- Email: formato e sugestão de erro de digitação ----------
  const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  function mostrarSugestao() {
    const sugestao = CashFlowAuth.suggestEmail?.(emailInput.value);
    if (!sugestao) {
      dica.hidden = true;
      dica.textContent = "";
      return;
    }
    dica.hidden = false;
    dica.textContent = "Você quis dizer ";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "email-suggestion-btn";
    botao.textContent = sugestao;
    botao.addEventListener("click", () => {
      emailInput.value = sugestao;
      dica.hidden = true;
      emailInput.dispatchEvent(new Event("input", { bubbles: true }));
      emailInput.focus();
    });
    dica.appendChild(botao);
    dica.append("?");
  }
  emailInput.addEventListener("blur", mostrarSugestao);
  emailInput.addEventListener("input", () => { if (!dica.hidden) mostrarSugestao(); });

  // ---------- Nome ----------
  function erroNome(nome) {
    if (!nome) return "Informe seu nome completo.";
    if (!/^[\p{L}][\p{L}'’.\- ]*$/u.test(nome)) return "O nome deve ter apenas letras.";
    if (nome.split(/\s+/).filter((p) => p.replace(/[.'’-]/g, "").length >= 2).length < 2)
      return "Informe nome e sobrenome.";
    return "";
  }

  function termsOk() {
    if (termos.checked) return true;
    fieldError(termos, "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.");
    return false;
  }

  termos.addEventListener("change", () => {
    const next = termos.closest(".checkbox-container").nextElementSibling;
    if (termos.checked && next?.classList.contains("field-error")) next.remove();
    if (termos.checked && pendingGoogle) submitGoogle(pendingGoogle);
  });

  // ---------- Envio ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    let firstInvalid = null;
    const fail = (el, msg) => {
      const p = fieldError(el, msg);
      firstInvalid ||= p;
    };

    const nome = $("nome").value.trim().replace(/\s+/g, " ");
    const email = emailInput.value.trim();
    const senha = $("senha").value;

    const nomeErro = erroNome(nome);
    if (nomeErro) fail($("nome"), nomeErro);
    if (!email) fail(emailInput, "Informe seu email.");
    else if (!emailValido(email)) fail(emailInput, "Digite um email válido, por exemplo nome@gmail.com.");

    const forca = CashFlowAuth.checkPassword(senha);
    if (!senha) fail($("senha"), "Crie uma senha.");
    else if (!forca.ok)
      fail($("senha"), "Senha fraca: falta " + forca.missing.map((r) => r.label.toLowerCase()).join(", ") + ".");

    if (!termsOk()) firstInvalid ||= form.querySelector(".field-error");

    if (firstInvalid) {
      firstInvalid.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Criando sua conta...";
    try {
      const response = await fetch("/api/cadastro/etapa1", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ consentimento: true, nome, email, senha }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === "success") {
        try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ok */ }
        showAlert("success", "🎉 Conta criada! Abrindo o CashFlow...");
        setTimeout(() => window.location.assign(result.proxima || "/CashFlow_Tela_HomePage/home.html?bemvindo=1"), 600);
        return;
      }
      if (response.status === 409) {
        showAlert("error", "Já existe uma conta com esse email. Entre com ele ou use \"Esqueceu a senha?\" na tela de login.");
      } else if (/email|domínio/i.test(result.message || "")) {
        fail(emailInput, result.message);
        emailInput.focus();
      } else {
        showAlert("error", result.message || "Não foi possível criar sua conta. Confira os dados.");
      }
    } catch {
      showAlert("error", "Sem conexão com o servidor. Verifique sua internet e tente novamente.");
    }
    button.disabled = false;
    button.textContent = "Criar minha conta";
  });

  // ---------- Cadastro com Google ----------
  let pendingGoogle = null;

  async function submitGoogle(credential) {
    clearErrors();
    if (!termsOk()) {
      pendingGoogle = credential;
      showAlert("info", "Conta Google confirmada. Marque a caixa dos Termos de Uso para concluir.");
      termos.focus();
      return;
    }
    pendingGoogle = null;
    try {
      const { response, data } = await CashFlowAuth.sendGoogleCredential(credential, { consentimento: true });
      if (!response.ok || data.status !== "success") {
        showAlert("error", data.message || "Não foi possível cadastrar com o Google.");
        return;
      }
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ok */ }
      showAlert("success", data.novo ? "🎉 Conta criada! Abrindo o CashFlow..." : "Você já tinha conta. Entrando...");
      setTimeout(() => window.location.assign(data.proxima || "/CashFlow_Tela_HomePage/home.html"), 600);
    } catch {
      showAlert("error", "Sem conexão com o servidor. Tente novamente.");
    }
  }

  CashFlowAuth.mountGoogleButton($("googleSignup"), {
    text: "signup",
    onCredential: submitGoogle,
    onError: (message) => showAlert("error", message),
  });
})();
