// ===============================
// 🔹 ELEMENTOS
// ===============================
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const rememberInput = document.getElementById('remember');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMessage');
const successMsg = document.getElementById('successMessage');
const REMEMBER_KEY = 'cashflow-remember-email';

const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* sem armazenamento */ } },
};

// ===============================
// 🔹 MOSTRAR/OCULTAR SENHA
// ===============================
CashFlowAuth.attachPasswordToggle(passwordInput, document.querySelector('.password-toggle'));

// ===============================
// 🔹 LEMBRAR DE MIM
// ===============================
// Marcado: o email fica salvo neste aparelho e a sessão dura até 30 dias.
// Desmarcado: a sessão termina ao fechar o navegador/app ou após 30 min parado.
const savedEmail = storage.get(REMEMBER_KEY);
if (savedEmail) {
    emailInput.value = savedEmail;
    rememberInput.checked = true;
}

function applyRemember(remember) {
    if (remember) {
        storage.set(REMEMBER_KEY, emailInput.value.trim());
        storage.set('cashflow-lembrar', '1');
    } else {
        storage.remove(REMEMBER_KEY);
        storage.remove('cashflow-lembrar');
    }
}

// ===============================
// 🔹 MENSAGENS
// ===============================
let messageTimer;
function showMessage(element, message, duration = 6000) {
    hideMessages();
    element.textContent = message;
    element.style.display = 'block';
    clearTimeout(messageTimer);
    if (duration) messageTimer = setTimeout(() => element.style.display = 'none', duration);
}

function hideMessages() {
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
}

// ===============================
// 🔹 LOADING
// ===============================
function setLoading(isLoading) {
    if (isLoading) {
        loginBtn.textContent = '';
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;
    } else {
        loginBtn.textContent = 'Entrar na conta';
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
}

// ===============================
// 🔹 VALIDAR EMAIL
// ===============================
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===============================
// 🔹 LOGIN (FETCH COM SESSION)
// ===============================
async function authenticate(email, password, remember) {
    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            credentials: "include",
            body: `email=${encodeURIComponent(email)}&senha=${encodeURIComponent(password)}&lembrar=${remember ? 'true' : 'false'}`
        });

        return await response.json();

    } catch (error) {
        return { status: "error", message: "Sem conexão com o servidor. Verifique sua internet e tente novamente." };
    }
}

// ===============================
// 🔹 SUBMIT LOGIN
// ===============================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    hideMessages();

    if (!email || !password) {
        showMessage(errorMsg, 'Preencha email e senha.');
        return;
    }

    if (!isValidEmail(email)) {
        showMessage(errorMsg, 'E-mail inválido.');
        emailInput.focus();
        return;
    }

    try {
        setLoading(true);

        const result = await authenticate(email, password, rememberInput.checked);

        if (result.status === "success") {
            applyRemember(rememberInput.checked);
            showMessage(successMsg, result.message, 0);
            setTimeout(() => {
                window.location.href = "/CashFlow_Tela_HomePage/home.html";
            }, 600);
        } else {
            showMessage(errorMsg, result.message || 'Email ou senha inválidos.');
            passwordInput.focus();
        }

    } catch (error) {
        console.error("ERRO LOGIN:", error);
        showMessage(errorMsg, 'Erro inesperado. Tente novamente.');
    } finally {
        setLoading(false);
    }
});

// ===============================
// 🔹 ENTRAR COM GOOGLE
// ===============================
const consentBox = document.getElementById('googleConsent');
const consentCheck = document.getElementById('googleTermos');
const consentError = document.getElementById('googleTermosErro');
let pendingGoogleCredential = null;

async function finishGoogle(credential, consentimento = false) {
    hideMessages();
    const { response, data } = await CashFlowAuth.sendGoogleCredential(credential, {
        lembrar: rememberInput.checked,
        consentimento,
    });
    if (response.status === 409 && data.status === 'consent_required') {
        pendingGoogleCredential = credential;
        consentBox.hidden = false;
        consentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    if (!response.ok || data.status !== 'success') {
        showMessage(errorMsg, data.message || 'Não foi possível entrar com o Google.');
        return;
    }
    if (rememberInput.checked) storage.set('cashflow-lembrar', '1');
    else storage.remove('cashflow-lembrar');
    showMessage(successMsg, data.message, 0);
    setTimeout(() => { window.location.href = data.proxima || '/CashFlow_Tela_HomePage/home.html'; }, 600);
}

CashFlowAuth.mountGoogleButton(document.getElementById('googleLogin'), {
    text: 'signin',
    onCredential: (credential) => finishGoogle(credential).catch(() =>
        showMessage(errorMsg, 'Sem conexão com o servidor. Tente novamente.')),
    onError: (message) => showMessage(errorMsg, message, 8000),
});

document.getElementById('googleCriar').addEventListener('click', () => {
    if (!consentCheck.checked) {
        consentError.hidden = false;
        return;
    }
    consentError.hidden = true;
    if (pendingGoogleCredential) finishGoogle(pendingGoogleCredential, true);
});
consentCheck.addEventListener('change', () => { if (consentCheck.checked) consentError.hidden = true; });

// Some com a mensagem vermelha assim que a pessoa corrige email ou senha.
[emailInput, passwordInput].forEach((input) =>
    input.addEventListener('input', () => { errorMsg.style.display = 'none'; }));

// ===============================
// 🔹 ANIMAÇÃO INPUT
// ===============================
document.querySelectorAll('.input-field').forEach(input => {
    input.addEventListener('focus', function () {
        this.parentElement.style.transform = 'scale(1.02)';
    });

    input.addEventListener('blur', function () {
        this.parentElement.style.transform = 'scale(1)';
    });
});
