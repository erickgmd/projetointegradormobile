// Controles adicionais mantêm as ferramentas e os painéis existentes.
window.cashflowRequest = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.status === "error")
    throw new Error(result.message || "Não foi possível concluir.");
  return result;
};
document.addEventListener("DOMContentLoaded", () => {
  const quickHost =
    document.querySelector(".main-content") || document.querySelector("main");
  const transactionForm = document.getElementById("transactionForm");
  if (transactionForm) {
    const section = document.createElement("section");
    section.className = "requirement-card quick-expense-card";
    section.setAttribute("aria-labelledby", "quickExpenseTitle");
    section.innerHTML =
      '<div class="quick-head"><span class="quick-eyebrow">Atalho</span><h2 id="quickExpenseTitle">Despesa rápida</h2>' +
      '<p class="quick-help">Escreva o que gastou e o valor, como <strong>mercado 35,90</strong>. A data de hoje e a categoria são preenchidas sozinhas.</p></div>' +
      '<form id="quickExpense" class="quick-form"><label for="quickText" class="quick-label">Descrição e valor</label>' +
      '<div class="quick-row"><input id="quickText" required placeholder="Ex.: mercado 35,90" autocomplete="off" enterkeyhint="send">' +
      '<button type="submit">Registrar</button></div><p id="quickStatus" class="quick-status" role="status"></p></form>' +
      '<details class="quick-category"><summary>Minhas categorias: criar ou excluir</summary><form id="categoryCreate" class="quick-category-form">' +
      '<div class="quick-field"><label for="categoryName">Nome</label><input id="categoryName" required maxlength="80" placeholder="Ex.: Academia"></div>' +
      '<div class="quick-field"><label for="categoryType">Tipo</label><select id="categoryType"><option value="">Escolha o tipo</option><option value="expense">Despesa</option><option value="income">Receita</option></select></div>' +
      '<button type="submit">Criar categoria</button><p id="categoryStatus" class="quick-status" role="status"></p></form>' +
      '<div class="quick-category-list"><h3 class="quick-category-title">Suas categorias</h3><ul id="categoryList" aria-live="polite"></ul></div></details>';
    // Na página inicial vira um cartão próprio, logo depois da "Nova Transação":
    // assim a pessoa registra primeiro receitas e saldo, e só depois usa o atalho.
    const formSection = transactionForm.closest(".section-block");
    if (formSection) formSection.after(section);
    else (quickHost || transactionForm.parentElement).prepend(section);
    let quickKey;
    document.getElementById("quickExpense").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector("button");
      button.disabled = true;
      const status = document.getElementById("quickStatus");
      try {
        quickKey ||= crypto.randomUUID();
        await cashflowRequest("/api/transacoes/rapida", {
          texto: document.getElementById("quickText").value,
          idempotency_key: quickKey,
        });
        quickKey = null;
        e.target.reset();
        status.dataset.type = "ok";
        status.textContent =
          "Despesa registrada. Você pode editar na lista de transações.";
        await window.financeManager.loadTransactions();
        window.financeManager.updateDisplay();
      } catch (error) {
        status.dataset.type = "error";
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    // O tipo da categoria acompanha o tipo escolhido na Nova Transação.
    const typeSelect = document.getElementById("type");
    const categoryType = document.getElementById("categoryType");
    const syncCategoryType = () => {
      if (typeSelect?.value && !categoryType.dataset.tocado) categoryType.value = typeSelect.value;
    };
    typeSelect?.addEventListener("change", syncCategoryType);
    categoryType.addEventListener("change", () => (categoryType.dataset.tocado = "1"));
    document.querySelector(".quick-category")?.addEventListener("toggle", syncCategoryType);
    // Depois de criar, a categoria já fica escolhida no formulário da Nova Transação.
    const selecionarNaTransacao = (nome, tipo) => {
      const fm = window.financeManager;
      if (!typeSelect || !fm) return;
      typeSelect.value = tipo;
      fm.filterCategoriesByType(tipo);
      const category = document.getElementById("category");
      const option = [...category.options].find((o) => o.value.toLowerCase() === nome.toLowerCase());
      if (option) category.value = option.value;
    };
    document.getElementById("categoryCreate").onsubmit = async (e) => {
      e.preventDefault();
      const status = document.getElementById("categoryStatus");
      const button = e.target.querySelector("button[type=submit]");
      const nome = document.getElementById("categoryName").value.trim().replace(/\s+/g, " ");
      const tipo = categoryType.value;
      const rotulo = tipo === "income" ? "Receita" : "Despesa";
      const mostrar = (tipoMsg, texto) => {
        status.dataset.type = tipoMsg;
        status.textContent = texto;
        status.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      };
      if (!nome) return mostrar("error", "Dê um nome para a categoria.");
      if (!tipo) return mostrar("error", "Escolha se a categoria é de Receita ou de Despesa.");
      button.disabled = true;
      try {
        await cashflowRequest("/api/categorias", { nome, tipo });
        await window.financeManager.loadCategories();
        selecionarNaTransacao(nome, tipo);
        renderCategorias();
        e.target.reset();
        delete categoryType.dataset.tocado;
        mostrar("ok", `✓ Categoria "${nome}" criada em ${rotulo}. Ela já está selecionada na Nova Transação.`);
        window.financeManager?.showSuccessMessage?.(`Categoria "${nome}" criada em ${rotulo}.`);
      } catch (error) {
        if (/já existe/i.test(error.message)) {
          await window.financeManager.loadCategories();
          selecionarNaTransacao(nome, tipo);
          mostrar("ok", `A categoria "${nome}" já existe em ${rotulo}. Selecionamos ela na Nova Transação.`);
        } else mostrar("error", error.message);
      } finally {
        button.disabled = false;
      }
    };

    // ---------- Lista "Suas categorias" com opção de excluir ----------
    const nomeTipo = (t) => (t === "income" ? "Receita" : "Despesa");
    const plural = (n) => `${n} transaç${n === 1 ? "ão" : "ões"}`;
    function renderCategorias() {
      const lista = document.getElementById("categoryList");
      if (!lista) return;
      const cats = window.financeManager?.customCategories || [];
      lista.replaceChildren();
      if (!cats.length) {
        const vazio = document.createElement("li");
        vazio.className = "category-empty";
        vazio.textContent = "Você ainda não criou categorias. As predefinidas (Salário, Alimentação...) não podem ser excluídas.";
        lista.appendChild(vazio);
        return;
      }
      cats.forEach((c) => {
        const li = document.createElement("li");
        li.className = "category-item";
        const info = document.createElement("div");
        info.className = "category-info";
        const nome = document.createElement("strong");
        nome.textContent = c.nome;
        const meta = document.createElement("span");
        meta.className = "category-meta";
        const uso = Number(c.uso) || 0;
        meta.textContent = `${nomeTipo(c.tipo)} · ${uso ? plural(uso) : "sem transações"}`;
        info.append(nome, meta);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "category-delete";
        btn.textContent = "🗑 Excluir";
        btn.setAttribute("aria-label", `Excluir a categoria ${c.nome}`);
        btn.addEventListener("click", () => confirmarExclusao(c));
        li.append(info, btn);
        lista.appendChild(li);
      });
    }

    function confirmarExclusao(c) {
      const uso = Number(c.uso) || 0;
      const outros = c.tipo === "income" ? "Outros (receitas)" : "Outros (despesas)";
      const dialog = document.createElement("dialog");
      dialog.className = "confirm-dialog";
      dialog.innerHTML = `
        <form method="dialog" class="confirm-sheet">
          <div class="confirm-icon" aria-hidden="true">🏷️</div>
          <h3>Excluir a categoria?</h3>
          <p></p>
          <div class="confirm-actions">
            <button type="button" class="confirm-cancel">Cancelar</button>
            <button type="submit" class="confirm-ok">Excluir categoria</button>
          </div>
        </form>`;
      const texto = dialog.querySelector("p");
      const forte = document.createElement("strong");
      forte.textContent = `"${c.nome}" (${nomeTipo(c.tipo)})`;
      texto.append("A categoria ", forte, " será excluída. ");
      texto.append(uso
        ? `${uso === 1 ? "A transação que usa" : `As ${plural(uso)} que usam`} essa categoria ${uso === 1 ? "passa" : "passam"} para "${outros}". Nenhuma transação é apagada.`
        : "Nenhuma transação usa essa categoria.");
      const fechar = () => { if (dialog.open) dialog.close(); dialog.remove(); };
      dialog.querySelector(".confirm-cancel").addEventListener("click", fechar);
      dialog.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
      dialog.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const ok = dialog.querySelector(".confirm-ok");
        ok.disabled = true;
        ok.textContent = "Excluindo...";
        const status = document.getElementById("categoryStatus");
        try {
          const r = await cashflowRequest("/api/categorias/excluir", { id: c.id });
          fechar();
          const fm = window.financeManager;
          await fm?.loadCategories();
          if (r.movidas) await fm?.loadTransactions?.();
          renderCategorias();
          status.dataset.type = "ok";
          status.textContent = "✓ " + r.message;
          fm?.showSuccessMessage?.(r.message);
        } catch (error) {
          fechar();
          status.dataset.type = "error";
          status.textContent = error.message;
        }
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.querySelector(".confirm-cancel").focus();
    }

    // A lista aparece ao abrir "Minhas categorias" e acompanha as mudanças.
    document.querySelector(".quick-category")?.addEventListener("toggle", (e) => {
      if (e.target.open) window.financeManager?.loadCategories?.();
    });
    window.addEventListener("cashflow:categorias", renderCategorias);
    renderCategorias();

  }
  const profile = document.querySelector(".profile-form");
  if (profile) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "prefs-fieldset";
    fieldset.innerHTML =
      "<legend>Preferências de apresentação</legend>" +
      '<label>Tema<select id="profileTheme"><option value="system">Automático</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label>' +
      '<label>Tamanho da fonte (%)<input id="profileFont" type="number" min="80" max="150" step="10" value="100" inputmode="numeric"></label>' +
      '<label class="switch-row"><input id="profileContrast" type="checkbox" role="switch"><span class="switch-ui" aria-hidden="true"></span><span class="switch-text"><strong>Alto contraste</strong><small>Cores mais fortes para facilitar a leitura.</small></span></label>' +
      '<p class="prefs-note">As preferências são salvas junto com suas informações ao tocar em "Salvar Informações".</p>';
    profile.insertBefore(
      fieldset,
      profile.querySelector("button[type=submit]"),
    );
    const section = document.createElement("section");
    section.className = "requirement-card account-card";
    section.setAttribute("aria-labelledby", "accountCardTitle");
    section.innerHTML =
      '<h2 id="accountCardTitle">Privacidade e conta</h2>' +
      '<p class="account-lead">Veja como seus dados são usados e gerencie seu consentimento.</p>' +
      '<a class="account-link" href="/privacidade.html">📄 Política de privacidade e uso dos dados<span aria-hidden="true">›</span></a>' +
      '<form id="consentForm" class="account-consent"><label class="account-check"><input type="checkbox" id="acceptPrivacy" required><span>Li e aceito o tratamento descrito na política</span></label><button type="submit">Registrar consentimento</button></form>' +
      '<details class="account-danger"><summary>Excluir minha conta</summary><p>A exclusão remove permanentemente sua conta e os dados financeiros associados. Não é possível desfazer.</p><form id="deleteAccount"><label for="deletePassword">Senha atual <small>(contas criadas pelo Google podem deixar em branco)</small></label><input id="deletePassword" type="password" autocomplete="current-password"><label for="deleteConfirmation">Digite EXCLUIR para confirmar</label><input id="deleteConfirmation" pattern="EXCLUIR" required autocapitalize="characters"><button type="submit">Excluir conta permanentemente</button></form></details>' +
      '<p id="privacyStatus" class="account-status" role="status"></p>';
    profile.after(section);
    // Consentimento já registrado: troca a caixinha por uma confirmação com a data.
    const showConsent = (when) => {
      const form = document.getElementById("consentForm");
      if (!form) return;
      const date = new Date(when);
      const text = Number.isNaN(date.getTime())
        ? "agora"
        : `em ${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      const box = document.createElement("div");
      box.className = "account-consent-ok";
      box.innerHTML =
        '<span class="account-consent-icon" aria-hidden="true">✓</span><div><strong>Consentimento registrado</strong><small></small></div>';
      box.querySelector("small").textContent =
        `Você aceitou a política ${text}. Para retirar o consentimento, exclua a conta abaixo.`;
      form.replaceWith(box);
    };
    fetch("/api/perfil", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (r?.dados?.consentimento_em) showConsent(r.dados.consentimento_em);
      })
      .catch(() => {});
    document.getElementById("consentForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await cashflowRequest("/api/consentimento", { aceito: true });
        showConsent(new Date().toISOString());
      } catch (error) {
        document.getElementById("privacyStatus").dataset.type = "error";
        document.getElementById("privacyStatus").textContent = error.message;
      }
    };
    document.getElementById("deleteAccount").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await cashflowRequest("/api/conta/excluir", {
          senha: document.getElementById("deletePassword").value,
          confirmacao: document.getElementById("deleteConfirmation").value,
        });
        location.replace("/CashFlow_Tela_de_Login/login.html");
      } catch (error) {
        document.getElementById("privacyStatus").dataset.type = "error";
        document.getElementById("privacyStatus").textContent = error.message;
      }
    };
  }
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Vincular Telegram");
    modal.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const controls = [
        ...modal.querySelectorAll('button,input,a[href],[tabindex="0"]'),
      ].filter((el) => !el.disabled);
      if (!controls.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  });
  document
    .querySelectorAll("#notificationStatus,#statusMsg")
    .forEach((el) => el.setAttribute("role", "status"));
  document.querySelectorAll("input,select,textarea").forEach((input, index) => {
    if (
      input.type === "hidden" ||
      input.hasAttribute("aria-label") ||
      input.labels?.length
    )
      return;
    input.setAttribute(
      "aria-label",
      input.placeholder || input.name || input.id || `Campo ${index + 1}`,
    );
  });
  document
    .querySelectorAll("#userIcon,.password-toggle,.fechar")
    .forEach((el) => {
      if (el.tagName === "BUTTON") return;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        el.id === "userIcon"
          ? "Abrir menu do usuário"
          : el.classList.contains("fechar")
            ? "Fechar janela"
            : "Mostrar ou ocultar senha",
      );
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          el.click();
        }
      });
    });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal").forEach((m) => {
        if (m.style.display === "block") {
          m.style.display = "none";
          document.getElementById("btnTelegram")?.focus();
        }
      });
      document
        .getElementById("userDropdown")
        ?.style.setProperty("display", "none");
    }
  });
});
