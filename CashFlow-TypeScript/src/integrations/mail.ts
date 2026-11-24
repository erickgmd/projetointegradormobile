import nodemailer from "nodemailer";

const appLink = (path: string, token: string) => {
  const origin = process.env.APP_ORIGIN;
  if (!origin)
    throw new Error("Configure APP_ORIGIN para os links enviados por email.");
  const url = new URL(path, origin);
  url.searchParams.set("token", token);
  return url.toString();
};
const resetLink = (token: string) => appLink("/redefinir-senha.html", token);
const confirmLink = (token: string) => appLink("/confirmar-email.html", token);

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function resetEmail(link: string) {
  const safe = escapeHtml(link);
  return {
    subject: "Redefinir sua senha do CashFlow",
    text: `Recebemos um pedido para redefinir a senha da sua conta CashFlow.\n\nAbra o link abaixo em até 15 minutos (ele só pode ser usado uma vez):\n${link}\n\nSe você não pediu, ignore este email: sua senha continua a mesma.`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px 28px">
<tr><td style="font-size:22px;font-weight:bold;color:#1e3a5f;padding-bottom:8px">Cash Flow</td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:12px">Redefinir sua senha</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#334155;padding-bottom:24px">Recebemos um pedido para redefinir a senha da sua conta. Toque no botão abaixo para criar uma nova senha. O link vale por 15 minutos e só pode ser usado uma vez.</td></tr>
<tr><td align="center" style="padding-bottom:24px"><a href="${safe}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px">Criar nova senha</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#64748b">Se o botão não funcionar, copie este endereço no navegador:<br><span style="word-break:break-all;color:#2563eb">${safe}</span></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#64748b;padding-top:20px">Se você não pediu a troca, ignore este email: sua senha continua a mesma.</td></tr>
</table></td></tr></table></body></html>`,
  };
}

// Confirmação de email: prova que o endereço existe e é da pessoa.
export function confirmEmail(link: string, nome = "") {
  const safe = escapeHtml(link);
  const primeiro = escapeHtml(String(nome).trim().split(/\s+/)[0] || "");
  const ola = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  return {
    subject: "Confirme seu email no CashFlow",
    text: `${ola}\n\nFalta só confirmar que este email é seu. Abra o link abaixo (vale por 7 dias):\n${link}\n\nSe você não criou uma conta no CashFlow, ignore esta mensagem.`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px 28px">
<tr><td style="font-size:22px;font-weight:bold;color:#1e3a5f;padding-bottom:8px">CashFlow</td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:12px">${ola}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#334155;padding-bottom:24px">Sua conta foi criada. Falta só confirmar que este email é seu — assim você consegue recuperar a senha e receber os alertas de gastos.</td></tr>
<tr><td align="center" style="padding-bottom:24px"><a href="${safe}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px">Confirmar meu email</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#64748b">Se o botão não funcionar, copie este endereço no navegador:<br><span style="word-break:break-all;color:#2563eb">${safe}</span></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#64748b;padding-top:20px">Se você não criou uma conta no CashFlow, ignore esta mensagem.</td></tr>
</table></td></tr></table></body></html>`,
  };
}

type Message = { subject: string; text: string; html: string };
type Send = (address: string, message: Message) => Promise<void>;

// "Nome <email@dominio>" -> { name, email } (formato exigido pela API do Brevo).
const parseSender = (from: string) => {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m
    ? { name: m[1].trim() || "CashFlow", email: m[2].trim() }
    : { name: "CashFlow", email: from.trim() };
};

// Envio pela API HTTPS do Brevo (porta 443). Usado quando BREVO_API_KEY existe,
// pois o plano gratuito do Render bloqueia as portas SMTP (25, 465 e 587).
function brevoSend(apiKey: string, from: string): Send {
  const sender = parseSender(from);
  return async (address, message) => {
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: address }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    } catch (error) {
      console.error(
        "Falha ao enviar email pelo Brevo. Confira BREVO_API_KEY e o remetente verificado.",
        (error as Error)?.message,
      );
      throw new Error("Falha no envio de email.");
    }
  };
}

// Escolhe o canal uma vez: Brevo (API), SMTP ou, em desenvolvimento, o terminal.
let cached: { send?: Send; dev: boolean } | undefined;
function emailChannel() {
  if (cached) return cached;
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  if (brevoKey) {
    const from = process.env.MAIL_FROM || process.env.SMTP_FROM;
    if (!from)
      console.error(
        "[CashFlow] BREVO_API_KEY configurada, mas falta MAIL_FROM (remetente verificado no Brevo).",
      );
    else {
      console.log("[CashFlow] Emails via API do Brevo.");
      return (cached = { send: brevoSend(brevoKey, from), dev: false });
    }
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    return (cached = { send: undefined, dev: process.env.NODE_ENV !== "production" });
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          // A senha de app do Gmail é exibida com espaços; o envio precisa sem eles.
          pass: String(process.env.SMTP_PASSWORD ?? "").replace(/\s+/g, ""),
        }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  // Confere a conexão ao iniciar e mostra o motivo no terminal se falhar.
  transport
    .verify()
    .then(() => console.log("[CashFlow] SMTP conectado: emails ativos."))
    .catch((error: Error) =>
      console.error(
        `[CashFlow] SMTP com problema: ${error.message}. Rode "npm run email:teste -- seuemail@..." para diagnosticar.`,
      ),
    );
  const send: Send = async (address, message) => {
    try {
      await transport.sendMail({ from: process.env.SMTP_FROM, to: address, ...message });
    } catch (error) {
      console.error("Falha ao enviar email. Confira a configuração SMTP.", (error as Error)?.message);
      throw new Error("Falha SMTP.");
    }
  };
  return (cached = { send, dev: false });
}

export function resetSender() {
  const { send, dev } = emailChannel();
  if (send) return (address: string, token: string) => send(address, resetEmail(resetLink(token)));
  // Desenvolvimento sem email configurado: o link aparece no terminal do servidor.
  if (dev)
    return async (address: string, token: string) => {
      console.log(`\n[CashFlow] Email não configurado. Link de redefinição para ${address}:\n${resetLink(token)}\n`);
    };
  return undefined;
}

export function confirmSender() {
  const { send, dev } = emailChannel();
  if (send)
    return (address: string, token: string, nome?: string) =>
      send(address, confirmEmail(confirmLink(token), nome));
  if (dev)
    return async (address: string, token: string) => {
      console.log(`\n[CashFlow] Email não configurado. Link de confirmação para ${address}:\n${confirmLink(token)}\n`);
    };
  return undefined;
}
