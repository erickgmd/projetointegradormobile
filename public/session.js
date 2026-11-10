// Autenticação e encerramento de sessão comuns às telas protegidas.
window.cashflowEscape = (value) => {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
};
(async function () {
  const login = "/CashFlow_Tela_de_Login/login.html";
  try {
    const response = await fetch("/api/perfil", {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401) window.location.replace(login);
    if (response.ok) {
      const result = await response.json();
      window.cashflowPreferences = result.dados?.preferencias || {};
      const prefs = window.cashflowPreferences;
      prefs.theme ||=
        { automatico: "system", claro: "light", escuro: "dark" }[prefs.tema] ||
        "system";
      prefs.fontScale ||= prefs.fonte || 100;
      prefs.contrast ||= prefs.contraste || 100;
      prefs.brightness ||= prefs.brilho || 100;
      prefs.highContrast ??= prefs.altoContraste || false;
      if (Object.keys(prefs).length)
        localStorage.setItem("cashflowThemeSettings", JSON.stringify(prefs));
      document.body.classList.toggle("high-contrast", !!prefs.highContrast);
      if (prefs.fontScale) document.body.style.fontSize = `${prefs.fontScale}%`;
      if (prefs.theme) {
        document.body.classList.remove("theme-light", "theme-dark");
        document.body.classList.add(
          "theme-" +
            (prefs.theme === "system"
              ? matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light"
              : prefs.theme),
        );
      }
    }
  } catch (error) {
    console.error("Não foi possível verificar a sessão.", error);
  }
  document.addEventListener(
    "click",
    async (event) => {
      if (!event.target.closest("#logoutBtn")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const response = await fetch("/api/logout", {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok && response.status !== 401)
          throw new Error("Não foi possível sair.");
        try {
          localStorage.removeItem("cashflow-lembrar");
        } catch {}
        window.location.replace(login);
      } catch (error) {
        alert("Não foi possível encerrar a sessão. Tente novamente.");
      }
    },
    true,
  );
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
})();

// Somente eventos reais renovam a sessão; o temporizador nunca envia atividade.
(() => {
  // "Lembrar de mim": a sessão de 30 dias é controlada pelo servidor;
  // o encerramento local por 30 min parado só vale sem essa opção.
  let remember = false;
  try {
    remember = localStorage.getItem("cashflow-lembrar") === "1";
  } catch {}
  const timeout = (remember ? 30 * 24 * 60 : 30) * 60 * 1000;
  let lastActivity = Date.now(),
    lastSent = 0;
  const expire = () => {
    if (Date.now() - lastActivity >= timeout) {
      fetch("/api/logout", { method: "POST", credentials: "include" }).finally(
        () => location.replace("/CashFlow_Tela_de_Login/login.html"),
      );
    }
  };
  // setTimeout não aceita mais de ~24 dias; com "lembrar" o servidor decide.
  const schedule = (ms) => (remember ? 0 : setTimeout(expire, ms));
  let timer = schedule(timeout);
  window.addEventListener("storage", (event) => {
    if (event.key !== "cashflow-session-activity") return;
    const time = Number(event.newValue);
    if (time > lastActivity && time <= Date.now()) {
      lastActivity = time;
      clearTimeout(timer);
      timer = schedule(timeout - (Date.now() - lastActivity));
    }
  });
  for (const name of ["pointerdown", "keydown", "scroll", "touchstart"])
    document.addEventListener(
      name,
      (event) => {
        if (!event.isTrusted) return;
        if (Date.now() - lastActivity >= timeout) {
          expire();
          return;
        }
        lastActivity = Date.now();
        localStorage.setItem("cashflow-session-activity", String(lastActivity));
        clearTimeout(timer);
        timer = schedule(timeout);
        if (Date.now() - lastSent < 60000) return;
        lastSent = Date.now();
        fetch("/api/session/atividade", {
          method: "POST",
          credentials: "include",
        })
          .then((r) => {
            if (r.status === 401)
              location.replace("/CashFlow_Tela_de_Login/login.html");
          })
          .catch(() => {});
      },
      { passive: true },
    );
})();
