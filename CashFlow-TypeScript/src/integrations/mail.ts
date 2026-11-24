import nodemailer from "nodemailer";

export function verificationEmail(link: string) {
  const safe = escapeHtml(link);
  return {
    subject: "Confirme seu e-mail no CashFlow",
    text: `Confirme seu cadastro no CashFlow. Abra este link e toque em Confirmar e-mail:\n${link}\n\nO link vale por 24 horas e só pode ser usado uma vez. Se você não criou a conta, ignore este e-mail.`,
    html: `<html lang="pt-BR"><body style="background:#f1f5f9;font-family:Arial,sans-serif;color:#17365b;padding:24px"><main style="max-width:480px;margin:auto;background:white;padding:32px;border-radius:16px"><h1>CashFlow</h1><h2>Confirme seu e-mail</h2><p>Para liberar sua conta, abra o link abaixo e confirme seu endereço.</p><p><a style="display:inline-block;background:#2563eb;color:white;padding:14px 24px;border-radius:8px;text-decoration:none" href="${safe}">Confirmar cadastro</a></p><p>O link vale por 24 horas e só pode ser usado uma vez.</p><p>Se o botão não funcionar, copie: <span style="word-break:break-all">${safe}</span></p><p>Se você não criou a conta, ignore este e-mail.</p></main></body></html>`,
  };
}

export function verificationSender() {
  let origin: URL;
  try {
    origin = new URL(process.env.APP_ORIGIN ?? "");
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    )
      return undefined;
  } catch {
    return undefined;
  }
  const link = (token: string) => {
    const url = new URL("/confirmar-email.html", origin.origin);
    url.hash = "token=" + encodeURIComponent(token);
    return url.toString();
  };
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    if (process.env.NODE_ENV === "production") return undefined;
    return async (_address: string, token: string) => {
      console.log(
        "[CashFlow DEV] Confirmação de e-mail (não usar em produção): " +
          link(token),
      );
    };
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: String(process.env.SMTP_PASSWORD ?? "").replace(/\s+/g, ""),
        }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  return async (address: string, token: string) => {
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: address,
        ...verificationEmail(link(token)),
      });
    } catch {
      console.error(
        "[CashFlow] Falha no envio de confirmação. Verifique o SMTP.",
      );
      throw new Error("Falha SMTP.");
    }
  };
}

const resetLink = (token: string) => {
  const origin = process.env.APP_ORIGIN;
  if (!origin)
    throw new Error("Configure APP_ORIGIN para os links de recuperação.");
  const url = new URL("/redefinir-senha.html", origin);
  url.searchParams.set("token", token);
  return url.toString();
};

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

export function resetSender() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    // Desenvolvimento sem SMTP: o link aparece no terminal do servidor para testes.
    if (process.env.NODE_ENV !== "production")
      return async (address: string, token: string) => {
        console.log(
          `\n[CashFlow] SMTP não configurado. Link de redefinição para ${address}:\n${resetLink(token)}\n`,
        );
      };
    return undefined;
  }
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
    .then(() =>
      console.log("[CashFlow] SMTP conectado: emails de recuperação ativos."),
    )
    .catch((error: Error) =>
      console.error(
        `[CashFlow] SMTP com problema: ${error.message}. Rode "npm run email:teste -- seuemail@..." para diagnosticar.`,
      ),
    );
  return async (address: string, token: string) => {
    const message = resetEmail(resetLink(token));
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: address,
        ...message,
      });
    } catch (error) {
      console.error(
        "Falha ao enviar recuperação. Confira a configuração SMTP.",
        (error as Error)?.message,
      );
      throw new Error("Falha SMTP.");
    }
  };
}
