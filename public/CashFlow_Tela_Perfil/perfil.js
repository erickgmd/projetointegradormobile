// ===============================
// 🔹 DROPDOWN USUÁRIO
// ===============================
const userIcon = document.getElementById("userIcon");
const userDropdown = document.getElementById("userDropdown");
const userName = document.getElementById("userName");

if (userIcon && userDropdown) {
    userIcon.addEventListener("click", () => {
        userDropdown.style.display =
            userDropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", (event) => {
        if (!userIcon.contains(event.target) && !userDropdown.contains(event.target)) {
            userDropdown.style.display = "none";
        }
    });
}

// ===============================
// 🔹 CARREGAR NOME (PODE MANTER)
// ===============================
async function loadUserName() {
    try {
        const response = await fetch("/api/perfil", {
            credentials: "include" // 🔥 importante
        });

        const result = await response.json();

        if (result.status === "success") {
            const d = result.dados;
            const prefs = d.preferencias || {};
            prefs.theme ||= ({automatico:'system',claro:'light',escuro:'dark'})[prefs.tema] || 'system';
            prefs.fontScale ||= prefs.fonte || 100;
            prefs.highContrast ??= prefs.altoContraste || false;
            if (document.getElementById('profileTheme')) {
                document.getElementById('profileTheme').value = prefs.theme || 'system';
                document.getElementById('profileFont').value = prefs.fontScale || 100;
                document.getElementById('profileContrast').checked = !!prefs.highContrast;
            }

            if (userName) {
                userName.textContent = d.nome;
                userName.style.display = "block";
            }
        }

    } catch (error) {
        console.error("Erro ao setar nome:", error);
    }
}

// ===============================
// 🔹 LOGOUT (AGORA COM BACKEND)
// ===============================
const logoutBtn = document.getElementById("logoutBtn");

// ===============================
// 🔹 CARREGAR PERFIL (SEM ID)
// ===============================
async function carregarPerfil() {
    try {
        const response = await fetch("/api/perfil", { credentials: "include" });
        const result = await response.json();

        if (result.status === "success") {
            const d = result.dados;
            const prefs = d.preferencias || {};
            prefs.theme ||= ({automatico:'system',claro:'light',escuro:'dark'})[prefs.tema] || 'system';
            prefs.fontScale ||= prefs.fonte || 100;
            prefs.highContrast ??= prefs.altoContraste || false;
            if (document.getElementById('profileTheme')) {
                document.getElementById('profileTheme').value = prefs.theme || 'system';
                document.getElementById('profileFont').value = prefs.fontScale || 100;
                document.getElementById('profileContrast').checked = !!prefs.highContrast;
            }

            const set = (name, value) => {
                const el = document.querySelector(`[name="${name}"]`);
                if (el) el.value = value || "";
            };

            set("nome", d.nome);
            set("cpf", d.cpf);
            set("nascimento", d.nascimento);
            set("telefone", d.telefone);
            set("email", d.email);
            set("cep", d.cep);
            set("logradouro", d.logradouro);
            set("complemento", d.complemento);
            set("bairro", d.bairro);
            set("cidade", d.cidade);
            set("estado", d.estado);
            set("tipo_residencia", d.tipo_residencia);
            set("tempo_residencia", d.tempo_residencia);
            set("tipo_investimento", d.tipo_investimento);
            set("faixa_investimento", d.faixa_investimento);

            set("renda", formatarReal(d.renda));
            set("despesas", formatarReal(d.despesas));
            set("gasto_maximo", formatarReal(d.gasto_maximo));
        }

    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
    }
}

// ===============================
// 🔹 MOEDA
// ===============================
function formatarReal(valor) {
    if (!valor) return "";
    return "R$ " + Number(valor).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
    });
}

function maskMoney(el) {
    if (!el) return;

    el.addEventListener("input", () => {
        let v = el.value.replace(/\D/g, "");

        if (!v) {
            el.value = "";
            return;
        }

        v = (parseInt(v) / 100).toFixed(2);
        v = v.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        el.value = "R$ " + v;
    });
}

function brToDecimal(str) {
    if (!str) return "";
    return str
        .replace(/[^0-9,.-]/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
}

// ===============================
// 🔹 SALVAR PERFIL
// ===============================
function setupForm() {
    const form = document.querySelector(".profile-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        formData.set('preferencias', JSON.stringify({
            ...(window.cashflowPreferences || {}),
            theme: document.getElementById('profileTheme').value,
            fontScale: Number(document.getElementById('profileFont').value),
            highContrast: document.getElementById('profileContrast').checked
        }));

        formData.set("renda", brToDecimal(formData.get("renda")));
        formData.set("despesas", brToDecimal(formData.get("despesas")));
        formData.set("gasto_maximo", brToDecimal(formData.get("gasto_maximo")));

        try {
            const response = await fetch("/api/perfil", {
                method: "POST",
                body: formData,
                credentials: "include"
            });

            const result = await response.json();

            if (result.status === "success") {
                alert("Dados atualizados!");
                await carregarPerfil();
                const saved = JSON.parse(formData.get('preferencias'));
                window.cashflowPreferences = saved;
                document.body.classList.toggle('high-contrast', !!saved.highContrast);
                document.body.style.fontSize = `${saved.fontScale}%`;

                const novoNome = formData.get("nome");

                if (userName) userName.textContent = novoNome;
            } else {
                alert(result.message + (result.debug ? "\n\nDebug: " + result.debug : ""));
            }

        } catch (err) {
            console.error(err);
            alert("Erro ao salvar");
        }
    });
}

// ===============================
// 🔹 TELEGRAM (SEGURO)
// ===============================
function setupTelegram() {
    const btnTelegram = document.getElementById("btnTelegram");
    const modal = document.getElementById("modalCodigo");
    const fechar = modal?.querySelector(".fechar");
    const gerarBtn = document.getElementById("gerarCodigoBtn");
    const codigoBox = document.getElementById("codigoBox");
    const codigoEl = document.getElementById("codigoGerado");
    const validadeEl = document.getElementById("codigoValidade");
    const copiarBtn = document.getElementById("copiarCodigo");
    const inputNome = document.getElementById("inputTelegram");
    const statusMsg = document.getElementById("statusMsg");
    const badge = document.getElementById("tgBadge");

    if (!btnTelegram || !modal) return;

    const usernameOk = (v) => /^[a-z0-9_]{5,32}$/i.test(v.replace(/^@/, ""));
    const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    function status(texto, tipo = "") {
        statusMsg.textContent = texto;
        statusMsg.dataset.type = tipo;
    }

    function setBadge(texto, tipo) {
        badge.textContent = texto;
        badge.dataset.type = tipo;
    }

    function atualizarBotao() {
        gerarBtn.disabled = !usernameOk(inputNome.value.trim());
    }

    // O código só é mostrado no momento em que é gerado (por segurança o servidor guarda só o hash).
    function mostrarCodigo(codigo, expiraEm) {
        codigoEl.textContent = `/vincular ${codigo}`;
        validadeEl.textContent = expiraEm ? `Válido até ${hora(expiraEm)}. Depois disso, gere outro.` : "";
        codigoBox.hidden = false;
        gerarBtn.textContent = "Gerar novo código";
    }

    async function carregarEstadoAtual() {
        try {
            const res = await fetch("/api/telegram", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: "acao=verificar"
            });
            const data = await res.json();
            if (data.status !== "success") return;
            if (data.nome_telegram && !inputNome.value) inputNome.value = data.nome_telegram;
            atualizarBotao();
            if (data.vinculado) {
                setBadge("✓ Telegram vinculado", "ok");
                gerarBtn.textContent = "Vincular de novo";
                status("Sua conta já está vinculada. Só gere um código novo se trocar de Telegram.");
            } else if (data.tem_codigo) {
                setBadge("Código aguardando uso", "wait");
                if (codigoBox.hidden) {
                    gerarBtn.textContent = "Gerar novo código";
                    status(`Já existe um código válido até ${hora(data.expires_at)}. Se não anotou, gere outro.`);
                }
            } else {
                setBadge("Sem vínculo", "off");
                gerarBtn.textContent = "Gerar código";
                status("");
            }
        } catch (e) {
            console.error(e);
        }
    }

    inputNome.addEventListener("input", atualizarBotao);

    function abrir(e) {
        e.preventDefault();
        document.getElementById("userDropdown")?.style.setProperty("display", "none");
        modal.style.display = "block";
        document.body.style.overflow = "hidden";
        carregarEstadoAtual();
        setTimeout(() => inputNome.focus(), 50);
    }
    function fecharModal() {
        modal.style.display = "none";
        document.body.style.overflow = "";
        btnTelegram.focus();
    }

    btnTelegram.addEventListener("click", abrir);
    fechar?.addEventListener("click", fecharModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(); });

    gerarBtn.addEventListener("click", async () => {
        const nome = inputNome.value.trim().replace(/^@/, "");
        if (!usernameOk(nome)) {
            status("Digite seu nome de usuário do Telegram: de 5 a 32 caracteres, só letras, números ou sublinhado ( _ ).", "error");
            inputNome.focus();
            return;
        }
        gerarBtn.disabled = true;
        gerarBtn.textContent = "Gerando...";
        try {
            const res = await fetch("/api/telegram", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `acao=gerar&nome_telegram=${encodeURIComponent(nome)}`
            });
            const data = await res.json();
            if (data.status === "success" && data.codigo) {
                mostrarCodigo(data.codigo, data.expires_at);
                setBadge("Código aguardando uso", "wait");
                status("Código gerado. Copie a mensagem e envie ao bot.", "ok");
            } else {
                status(data.message || "Não foi possível gerar o código.", "error");
                gerarBtn.textContent = "Tentar novamente";
            }
        } catch (err) {
            status("Sem conexão com o servidor. Tente novamente.", "error");
            gerarBtn.textContent = "Tentar novamente";
        } finally {
            atualizarBotao();
        }
    });

    copiarBtn.addEventListener("click", async () => {
        const texto = codigoEl.textContent;
        try {
            await navigator.clipboard.writeText(texto);
        } catch {
            const area = document.createElement("textarea");
            area.value = texto;
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            area.remove();
        }
        copiarBtn.textContent = "✓ Copiado";
        setTimeout(() => (copiarBtn.textContent = "Copiar mensagem"), 2000);
    });
}

// ===============================
// 🔹 GASTO MÁXIMO: vindo de "Configurar gasto máximo", rola e destaca o campo
// ===============================
function destacarGastoMaximo() {
    if (location.hash !== "#gasto-maximo") return;
    const campo = document.getElementById("gasto-maximo");
    const input = document.getElementById("gastoMaximo");
    if (!campo || !input) return;
    // Espera os dados do perfil preencherem a página para a rolagem ficar no lugar certo.
    setTimeout(() => {
        campo.scrollIntoView({ behavior: "smooth", block: "center" });
        campo.classList.add("limit-focus");
        setTimeout(() => input.focus({ preventScroll: true }), 450);
        const tirar = () => campo.classList.remove("limit-focus");
        input.addEventListener("blur", tirar, { once: true });
        setTimeout(tirar, 6000);
    }, 400);
}

// ===============================
// 🔹 INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    loadUserName();
    carregarPerfil();
    setupForm();
    setupTelegram();
    destacarGastoMaximo();

    maskMoney(document.getElementById("renda"));
    maskMoney(document.getElementById("despesas"));
    maskMoney(document.getElementById("gastoMaximo"));
});