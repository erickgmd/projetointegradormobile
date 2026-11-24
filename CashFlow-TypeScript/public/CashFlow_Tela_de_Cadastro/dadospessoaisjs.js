// Cadastro, etapa 1: dados pessoais, senha forte, termos e cadastro com Google.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = document.querySelector("form");
  const alerta = $("cadastroAlerta");
  const termos2 = $("termos2");
  // Voltou do endereço com a conta já criada: os dados são atualizados e a senha é opcional.
  let returning = false;
  const DRAFT_KEY = "cashflow-cadastro-rascunho";
  const draftFields = ["nome", "cpf", "nascimento", "telefone", "email"];

  // ---------- Máscaras ----------
  $("cpf").addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "").slice(0, 11);
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    e.target.value = value;
  });

  $("telefone").addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "").slice(0, 11);
    value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
    value = value.replace(/(\d{5})(\d)/, "$1-$2");
    e.target.value = value;
  });

  // ---------- Senha ----------
  CashFlowAuth.attachPasswordToggle($("senha"));
  CashFlowAuth.attachPasswordToggle($("confirmar-senha"));
  CashFlowAuth.attachStrengthMeter($("senha"));

  // ---------- Rascunho: nada se perde ao abrir os termos ou voltar ----------
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
    for (const id of draftFields) if (draft[id] && !$(id).value) $(id).value = draft[id];
    if (draft.termos2) termos2.checked = true;
  } catch { /* sem armazenamento */ }
  const saveDraft = () => {
    try {
      const draft = { termos2: termos2.checked };
      for (const id of draftFields) draft[id] = $(id).value;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* sem armazenamento */ }
  };
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  // ---------- Erros no padrão da tela (texto vermelho abaixo do campo) ----------
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
      const meter = group.querySelector(".pw-meter");
      (meter || element.closest(".pw-field") || element).insertAdjacentElement("afterend", p);
    }
    return p;
  }

  function showAlert(type, message) {
    alerta.className = `form-alert show ${type}`;
    alerta.textContent = message;
    alerta.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  function termsOk() {
    let ok = true;
    if (!termos2.checked) {
      fieldError(termos2, "Você deve aceitar os Termos de Uso e a Política de Privacidade para continuar.");
      ok = false;
    }
    return ok;
  }

  termos2.addEventListener("change", () => {
    const next = termos2.closest(".checkbox-container").nextElementSibling;
    if (termos2.checked && next?.classList.contains("field-error")) next.remove();
    if (termos2.checked && pendingGoogle) submitGoogle(pendingGoogle);
  });

  // ---------- Validações de nome e CPF ----------
  function cpfValido(valor) {
    const d = valor.replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (const size of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < size; i++) soma += Number(d[i]) * (size + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[size])) return false;
    }
    return true;
  }
  function erroNome(nome) {
    if (!nome) return "Informe seu nome completo.";
    if (!/^[\p{L}][\p{L}'’.\- ]*$/u.test(nome)) return "O nome deve ter apenas letras.";
    if (nome.split(/\s+/).filter((p) => p.replace(/[.'’-]/g, "").length >= 2).length < 2)
      return "Informe nome e sobrenome.";
    return "";
  }

  // ---------- Voltou da etapa 2: carrega os dados já salvos ----------
  fetch("/api/perfil", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((r) => {
      const d = r?.dados;
      if (!d || Number(d.etapa) >= 3) return;
      returning = true;
      for (const id of draftFields) if (d[id]) $(id).value = d[id];
      termos2.checked = true;
      $("senha").placeholder = "Deixe em branco para manter a senha";
      $("confirmar-senha").placeholder = "Deixe em branco para manter a senha";
      showAlert("info", "Sua conta já foi criada. Corrija o que precisar e siga para o próximo passo.");
    })
    .catch(() => {});

  // ---------- Envio do formulário ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    let firstInvalid = null;
    const fail = (el, msg) => {
      const p = fieldError(el, msg);
      firstInvalid ||= p;
    };

    const nome = $("nome").value.trim();
    const email = $("email").value.trim();
    const senha = $("senha").value;
    const confirmar = $("confirmar-senha").value;

    const nomeErro = erroNome(nome);
    if (nomeErro) fail($("nome"), nomeErro);
    if (!email) fail($("email"), "Informe seu e-mail.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail($("email"), "Digite um email válido, por exemplo nome@gmail.com.");

    const cpf = $("cpf").value.replace(/\D/g, "");
    if (cpf && cpf.length !== 11) fail($("cpf"), "O CPF precisa ter 11 números.");
    else if (cpf && !cpfValido(cpf)) fail($("cpf"), "CPF inválido. Confira os números.");

    const nascimento = $("nascimento").value;
    if (nascimento) {
      const data = new Date(nascimento);
      if (data > new Date() || data < new Date("1900-01-01"))
        fail($("nascimento"), "Data de nascimento inválida.");
    }

    const forca = CashFlowAuth.checkPassword(senha);
    const senhaOpcional = returning && !senha && !confirmar;
    if (!senhaOpcional) {
      if (!senha) fail($("senha"), "Crie uma senha.");
      else if (!forca.ok)
        fail($("senha"), "Senha fraca: falta " + forca.missing.map((r) => r.label.toLowerCase()).join(", ") + ".");
      if (!confirmar) fail($("confirmar-senha"), "Repita a senha.");
      else if (senha !== confirmar) fail($("confirmar-senha"), "As senhas não coincidem.");
    }

    if (!termsOk()) firstInvalid ||= form.querySelector(".field-error");

    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = returning ? "Salvando..." : "Criando conta...";
    try {
      const response = await fetch("/api/cadastro/etapa1", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          consentimento: true,
          nome,
          cpf: $("cpf").value,
          nascimento,
          telefone: $("telefone").value,
          email,
          senha,
          confirmar_senha: confirmar,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === "success") {
        try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ok */ }
        window.location.assign("/CashFlow_Tela_de_Cadastro/endereco.html");
        return;
      }
      showAlert("error", result.message || "Não foi possível criar sua conta. Confira os dados.");
    } catch {
      showAlert("error", "Sem conexão com o servidor. Verifique sua internet e tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = "Próximo Passo";
    }
  });

  // ---------- Cadastro com Google ----------
  let pendingGoogle = null;

  async function submitGoogle(credential) {
    clearErrors();
    if (!termsOk()) {
      pendingGoogle = credential;
      showAlert("info", "Conta Google confirmada. Agora marque a caixa dos Termos de Uso no final da página para concluir.");
      termos2.closest(".checkbox-container").scrollIntoView({ behavior: "smooth", block: "center" });
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
      showAlert("success", data.novo ? "Conta criada! Vamos continuar o cadastro." : "Você já tinha conta. Entrando...");
      setTimeout(() => window.location.assign(data.proxima || "/CashFlow_Tela_HomePage/home.html"), 700);
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
