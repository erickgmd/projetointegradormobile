(function () {
  'use strict';
  const status = document.getElementById('verificationStatus');
  const confirm = document.getElementById('confirmEmail');
  const form = document.getElementById('resendForm');
  const email = document.getElementById('verificationEmail');
  let token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  // O token fica somente em memória; não vai para Referer, storage ou histórico.
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  try { email.value = sessionStorage.getItem('cashflow-verification-email') || ''; } catch { /* opcional */ }
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    confirm.hidden = false;
    status.textContent = 'Toque em Confirmar e-mail para concluir. Você precisará entrar com sua senha depois.';
  } else if (token) {
    token = null;
    status.textContent = 'Link inválido. Solicite outro link abaixo.';
  }
  async function post(url, payload) {
    const response = await fetch(url, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Não foi possível concluir. Tente novamente mais tarde.');
    return data;
  }
  confirm.addEventListener('click', async () => {
    if (!token) return;
    confirm.disabled = true;
    try {
      const data = await post('/api/email/confirmar', {token});
      token = null;
      confirm.hidden = true;
      form.hidden = true;
      try { sessionStorage.removeItem('cashflow-verification-email'); } catch { /* opcional */ }
      status.textContent = data.message;
    } catch (error) { status.textContent = error.message || 'Falha de conexão. Tente novamente.'; }
    finally { confirm.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = document.getElementById('resendEmail');
    button.disabled = true;
    try {
      const data = await post('/api/email/reenviar', {email:email.value.trim()});
      status.textContent = data.message;
    } catch (error) { status.textContent = error.message || 'Falha de conexão. Tente novamente.'; }
    finally { button.disabled = false; }
  });
})();
