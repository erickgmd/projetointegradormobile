// Componentes compartilhados das telas de acesso (login, cadastro, recuperação):
// botão Google (web e app Android), medidor de força da senha, mostrar/ocultar
// senha e janela da política de privacidade sem sair da página.
(function () {
  "use strict";

  const cap = window.Capacitor;
  const isNativeApp = !!(
    cap &&
    typeof cap.isNativePlatform === "function" &&
    cap.isNativePlatform()
  );

  let publicConfig;
  const getConfig = () =>
    (publicConfig ||= fetch("/api/config/publica", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})));

  // ---------- Senha forte (mesmas regras do servidor) ----------
  const passwordRules = [
    { id: "len", label: "8 caracteres ou mais", test: (v) => v.length >= 8 },
    { id: "upper", label: "Uma letra maiúscula", test: (v) => /\p{Lu}/u.test(v) },
    { id: "lower", label: "Uma letra minúscula", test: (v) => /\p{Ll}/u.test(v) },
    { id: "num", label: "Um número", test: (v) => /\p{Nd}/u.test(v) },
    {
      id: "special",
      label: "Um caractere especial (! @ # $ % & * ...)",
      test: (v) => /[^\p{L}\p{Nd}]/u.test(v),
    },
  ];

  function checkPassword(value) {
    const passed = passwordRules.filter((r) => r.test(value || ""));
    const missing = passwordRules.filter((r) => !r.test(value || ""));
    return { ok: missing.length === 0, score: passed.length, missing };
  }

  function attachStrengthMeter(input) {
    if (!input || input.dataset.meter) return;
    input.dataset.meter = "1";
    const box = document.createElement("div");
    box.className = "pw-meter";
    box.id = `${input.id}-forca`;
    box.innerHTML =
      '<div class="pw-meter-bar" aria-hidden="true"><span></span></div>' +
      '<p class="pw-meter-label" aria-live="polite">Use letras maiúsculas e minúsculas, números e símbolos.</p>' +
      '<ul class="pw-rules">' +
      passwordRules
        .map((r) => `<li data-rule="${r.id}">${r.label}</li>`)
        .join("") +
      "</ul>";
    const anchor = input.closest(".input-wrapper, .pw-field") || input;
    anchor.insertAdjacentElement("afterend", box);
    input.setAttribute(
      "aria-describedby",
      [input.getAttribute("aria-describedby"), box.id].filter(Boolean).join(" "),
    );
    const levels = [
      ["", "Use letras maiúsculas e minúsculas, números e símbolos."],
      ["weak", "Senha muito fraca"],
      ["weak", "Senha fraca"],
      ["medium", "Senha média"],
      ["medium", "Quase lá: falta pouco"],
      ["strong", "Senha forte"],
    ];
    const update = () => {
      const { score } = checkPassword(input.value);
      const [level, text] = input.value ? levels[score] : levels[0];
      box.dataset.level = level;
      box.querySelector(".pw-meter-bar span").style.width = `${(score / 5) * 100}%`;
      box.querySelector(".pw-meter-label").textContent = text;
      for (const rule of passwordRules)
        box
          .querySelector(`[data-rule="${rule.id}"]`)
          .classList.toggle("ok", rule.test(input.value));
    };
    input.addEventListener("input", update);
    update();
  }

  // ---------- Mostrar/ocultar senha ----------
  const eye =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const eyeOff =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function attachPasswordToggle(input, existingButton) {
    if (!input || input.dataset.toggle) return;
    input.dataset.toggle = "1";
    let button = existingButton;
    if (!button) {
      const wrap = document.createElement("div");
      wrap.className = "pw-field";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      button = document.createElement("button");
      button.type = "button";
      button.className = "pw-toggle";
      wrap.appendChild(button);
    }
    button.removeAttribute("onclick");
    const render = () => {
      const visible = input.type === "text";
      button.innerHTML = visible ? eyeOff : eye;
      button.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
      button.setAttribute("aria-pressed", String(visible));
    };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.type = input.type === "password" ? "text" : "password";
      render();
    });
    render();
  }

  // ---------- Política de privacidade em janela ----------
  let policyDialog;
  async function openPolicy({ checkbox } = {}) {
    if (!policyDialog) {
      policyDialog = document.createElement("dialog");
      policyDialog.className = "policy-dialog";
      policyDialog.setAttribute("aria-labelledby", "policyTitle");
      policyDialog.innerHTML =
        '<div class="policy-sheet"><header class="policy-head"><h2 id="policyTitle">Privacidade e uso dos dados</h2>' +
        '<button type="button" class="policy-close" aria-label="Fechar">×</button></header>' +
        '<div class="policy-body"><p>Carregando...</p></div>' +
        '<footer class="policy-actions"><button type="button" class="policy-back">Voltar</button>' +
        '<button type="button" class="policy-agree">Li e concordo</button></footer></div>';
      document.body.appendChild(policyDialog);
      const close = () => policyDialog.close();
      policyDialog.querySelector(".policy-close").onclick = close;
      policyDialog.querySelector(".policy-back").onclick = close;
      policyDialog.addEventListener("click", (e) => {
        if (e.target === policyDialog) close();
      });
      try {
        const html = await (await fetch("/privacidade.html")).text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const main = doc.querySelector("main");
        main.querySelector("h1")?.remove();
        main.querySelectorAll("[data-only-page]").forEach((el) => el.remove());
        policyDialog.querySelector(".policy-body").innerHTML = main.innerHTML;
      } catch {
        policyDialog.querySelector(".policy-body").innerHTML =
          '<p>Não foi possível carregar o texto agora. <a href="/privacidade.html" target="_blank" rel="noopener">Abrir em outra página</a>.</p>';
      }
    }
    const agree = policyDialog.querySelector(".policy-agree");
    agree.hidden = !checkbox;
    agree.onclick = () => {
      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
      policyDialog.close();
    };
    if (typeof policyDialog.showModal === "function") policyDialog.showModal();
    else policyDialog.setAttribute("open", "");
    policyDialog.querySelector(".policy-body").scrollTop = 0;
  }

  // Links para /privacidade.html abrem a janela e mantêm o formulário preenchido.
  function interceptPolicyLinks(root = document) {
    root.querySelectorAll('a[href="/privacidade.html"]').forEach((link) => {
      if (link.dataset.policy) return;
      link.dataset.policy = "1";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const label = link.closest("label");
        const checkbox = label?.htmlFor
          ? document.getElementById(label.htmlFor)
          : label?.querySelector("input[type=checkbox]");
        openPolicy({ checkbox });
      });
    });
  }

  // ---------- Entrar com Google ----------
  const googleMark =
    '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

<<<<<<< HEAD
  let firebaseLoading;
  const loadFirebase = () =>
    (firebaseLoading ||= new Promise((resolve, reject) => {
      if (window.CashFlowFirebase) return resolve();
      const s = document.createElement("script");
      s.src = "/vendor/firebase-auth.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { firebaseLoading = null; reject(new Error("Não foi possível carregar o login Firebase. Atualize a página.")); };
=======
  let gisLoading;
  const loadGis = () =>
    (gisLoading ||= new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Sem conexão com o Google."));
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
      document.head.appendChild(s);
    }));

  async function nativeGoogleCredential(clientId) {
    const plugin = cap?.Plugins?.SocialLogin;
    if (!plugin)
      throw new Error(
        "Atualize o aplicativo: o login com Google ainda não está instalado nesta versão.",
      );
    await plugin.initialize({
      google: { webClientId: clientId, skipAuthOnlyAuthorizationAfterSignIn: true },
    });
    const res = await plugin.login({ provider: "google", options: {} });
    const token = res?.result?.idToken;
    if (!token) throw new Error("O Google não retornou a confirmação da conta.");
    return token;
  }

  /**
   * Monta o botão Google.
   * opts.text: "signin" | "signup"
   * opts.onCredential(credential): chamado com o ID token do Google
   * opts.onError(message)
   */
  async function mountGoogleButton(container, opts) {
    if (!container) return;
    const label = opts.text === "signup" ? "Cadastrar com Google" : "Entrar com Google";
    const fallbackButton = () => {
      container.innerHTML = `<button type="button" class="google-btn">${googleMark}<span>${label}</span></button>`;
      return container.querySelector("button");
    };
    const config = await getConfig();
    const clientId = config.googleClientId;

<<<<<<< HEAD
    if (isNativeApp && !clientId) {
=======
    if (!clientId) {
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
      fallbackButton().onclick = () =>
        opts.onError(
          "O login com Google ainda não foi configurado no servidor Firebase.",
        );
      return;
    }

    if (isNativeApp) {
      const button = fallbackButton();
      button.onclick = async () => {
        button.disabled = true;
        try {
          opts.onCredential(await nativeGoogleCredential(clientId));
        } catch (error) {
          const msg = String(error?.message || error);
          if (!/cancel/i.test(msg)) opts.onError(/28444|Developer console|signingSha1/i.test(msg)
            ? "Assinatura Android não cadastrada para o login Google. Adicione o SHA-1 desta instalação ao app com.Cashflow no Firebase e baixe novamente o google-services.json."
            : msg);
        } finally {
          button.disabled = false;
        }
      };
      return;
    }

    try {
<<<<<<< HEAD
      if (!config.firebaseWebConfig) throw new Error("Firebase Web não configurado no servidor. Publique o backend atualizado.");
      await loadFirebase();
      window.CashFlowFirebase.initialize(config.firebaseWebConfig);
      const button = fallbackButton();
      button.onclick = async () => {
        button.disabled = true;
        try {
          const token = await window.CashFlowFirebase.signIn();
          await opts.onCredential({ type: "firebase", token });
        } catch (error) {
          if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error.code)) return;
          const message = {
            "auth/unauthorized-domain": "Autorize este domínio em Firebase Authentication > Configurações > Domínios autorizados.",
            "auth/popup-blocked": "Permita pop-ups para este site e tente novamente.",
            "auth/operation-not-allowed": "Ative o provedor Google no Firebase Authentication.",
            "auth/invalid-api-key": "A API key do Firebase Web não é válida. Confira a configuração publicada.",
            "auth/network-request-failed": "Sem conexão com o Firebase. Verifique sua internet.",
          }[error.code];
          opts.onError(message || "Não foi possível entrar pelo Firebase. Confira o provedor Google e o cliente OAuth no projeto Firebase.");
        } finally { button.disabled = false; }
      };
=======
      await loadGis();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => opts.onCredential(response.credential),
        ux_mode: "popup",
        context: opts.text === "signup" ? "signup" : "signin",
      });
      container.innerHTML = "";
      const width = Math.min(400, Math.max(220, container.clientWidth || 320));
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: opts.text === "signup" ? "signup_with" : "signin_with",
        logo_alignment: "center",
        width,
        locale: "pt-BR",
      });
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
    } catch (error) {
      fallbackButton().onclick = () =>
        opts.onError(error.message || "Não foi possível carregar o Google agora.");
    }
  }

  async function sendGoogleCredential(credential, extra = {}) {
    const response = await fetch("/api/login/google", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
<<<<<<< HEAD
      body: JSON.stringify({
        ...extra,
        credential: credential?.type === "firebase" ? credential.token : credential,
        credentialType: credential?.type === "firebase" ? "firebase" : "google",
      }),
=======
      body: JSON.stringify({ credential, ...extra }),
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  window.CashFlowAuth = {
    isNativeApp,
    checkPassword,
    attachStrengthMeter,
    attachPasswordToggle,
    openPolicy,
    interceptPolicyLinks,
    mountGoogleButton,
    sendGoogleCredential,
  };

  // ---------- Apagar o erro assim que a pessoa corrige o campo ----------
  function clearFieldError(event) {
    const el = event.target;
    if (!(el instanceof HTMLElement) || !el.matches("input, select, textarea")) return;
    if (el.type === "checkbox" && !el.checked) return;
    el.classList.remove("input-invalid");
    el.style.removeProperty("border-color");
    const group = el.closest(".form-group");
    if (group) {
      group.querySelectorAll(".field-error, .error-message").forEach((msg) => msg.remove());
    } else if (el.type === "checkbox") {
      const next = el.closest(".checkbox-container, label")?.nextElementSibling;
      if (next?.classList.contains("field-error")) next.hidden = true;
    } else {
      // Telas simples (recuperar/redefinir): o erro fica logo depois do campo.
      let next = (el.closest(".pw-field") || el).nextElementSibling;
      while (next && next.classList.contains("pw-meter")) next = next.nextElementSibling;
      if (next?.classList.contains("field-error")) next.hidden = true;
    }
    // Aviso geral vermelho do formulário também sai quando a pessoa volta a digitar.
    (el.closest(".form-container, .auth-card") || el.closest("form"))
      ?.querySelectorAll(".form-alert.error")
      .forEach((alerta) => (alerta.className = "form-alert"));
  }
  document.addEventListener("input", clearFieldError, true);
  document.addEventListener("change", clearFieldError, true);

  document.addEventListener("DOMContentLoaded", () => interceptPolicyLinks());
})();
