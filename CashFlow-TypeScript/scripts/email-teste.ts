// Testa o envio de email (SMTP) e mostra o motivo exato quando falha.
// Uso: npm run email:teste -- seuemail@exemplo.com
import "dotenv/config";
import nodemailer from "nodemailer";
import { resetEmail } from "../src/integrations/mail.js";

const destino = process.argv[2] || process.env.SMTP_USER;
const faltando = [
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
].filter((k) => !process.env[k]);
if (faltando.length) {
  console.error(`\n✗ Faltam no .env: ${faltando.join(", ")}\n`);
  process.exit(1);
}
const port = Number(process.env.SMTP_PORT ?? 587);
const senha = String(process.env.SMTP_PASSWORD);
console.log("\nConfiguração lida do .env:");
console.log(`  SMTP_HOST=${process.env.SMTP_HOST}`);
console.log(
  `  SMTP_PORT=${port}  SMTP_SECURE=${process.env.SMTP_SECURE ?? "false"}`,
);
console.log(`  SMTP_USER=${process.env.SMTP_USER}`);
console.log(
  `  SMTP_PASSWORD=${"*".repeat(senha.length)} (${senha.length} caracteres${/\s/.test(senha) ? ", CONTÉM ESPAÇOS" : ""})`,
);
console.log(`  SMTP_FROM=${process.env.SMTP_FROM}`);
console.log(`  APP_ORIGIN=${process.env.APP_ORIGIN ?? "(vazio!)"}`);
console.log(`  Enviando teste para: ${destino}\n`);

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: process.env.SMTP_SECURE === "true" || port === 465,
  auth: { user: process.env.SMTP_USER, pass: senha.replace(/\s+/g, "") },
  connectionTimeout: 15000,
  socketTimeout: 20000,
});

try {
  await transport.verify();
  console.log("✓ Conectou e autenticou no servidor SMTP.");
  const link = new URL(
    "/redefinir-senha.html?token=teste",
    process.env.APP_ORIGIN || "http://localhost:3001",
  ).toString();
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: destino,
    ...resetEmail(link),
    subject: "Teste de envio do CashFlow",
  });
  console.log(
    `✓ Email enviado (id ${info.messageId}). Confira a caixa de entrada e o spam.\n`,
  );
} catch (error: any) {
  const msg = String(error?.message ?? error);
  console.error(`\n✗ Falhou: ${msg}\n`);
  if (
    /535|Invalid login|Username and Password not accepted|BadCredentials/i.test(
      msg,
    )
  )
    console.error(
      "→ Usuário ou senha recusados. No Gmail use uma SENHA DE APP (16 letras), não a senha normal:\n  https://myaccount.google.com/apppasswords (exige verificação em duas etapas ativa).",
    );
  else if (
    /ETIMEDOUT|ECONNREFUSED|ESOCKET|Greeting never received|timeout/i.test(msg)
  )
    console.error(
      "→ Não conseguiu conectar. A porta pode estar bloqueada pela rede/antivírus.\n  Tente SMTP_PORT=465 e SMTP_SECURE=true (ou o contrário: 587 e false).",
    );
  else if (/ENOTFOUND|EAI_AGAIN/i.test(msg))
    console.error(
      "→ Servidor não encontrado. Confira a internet e o SMTP_HOST (Gmail: smtp.gmail.com).",
    );
  else if (/wrong version number|SSL/i.test(msg))
    console.error(
      "→ Combinação porta/segurança errada. Use 587 com SMTP_SECURE=false, ou 465 com SMTP_SECURE=true.",
    );
  else if (/sender|from address|553|550/i.test(msg))
    console.error(
      "→ Remetente recusado. No Gmail, o SMTP_FROM deve usar o mesmo email do SMTP_USER.",
    );
  process.exit(1);
}
