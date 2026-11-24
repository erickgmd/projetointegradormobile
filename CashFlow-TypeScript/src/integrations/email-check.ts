import { resolveMx, resolve4, resolve6 } from "node:dns/promises";

// Provedores de email descartável/temporário: contas criadas com eles somem em minutos.
const DESCARTAVEIS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "temp-mail.org", "tempmail.com",
  "tempmail.net", "tempmailo.com", "yopmail.com", "yopmail.net", "getnada.com",
  "trashmail.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
  "fakeinbox.com", "mohmal.com", "emailondeck.com", "minuteinbox.com",
  "mail.tm", "mailnesia.com", "spamgourmet.com", "tempr.email", "discard.email",
]);

// Provedores conhecidos: não precisam de consulta ao DNS.
const CONHECIDOS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com",
  "outlook.com.br", "live.com", "msn.com", "yahoo.com", "yahoo.com.br",
  "icloud.com", "me.com", "proton.me", "protonmail.com", "bol.com.br",
  "uol.com.br", "terra.com.br", "ig.com.br", "globo.com", "aol.com",
]);

export type EmailCheck = (email: string) => Promise<{ ok: boolean; message?: string }>;

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), ms),
    ),
  ]);

const semRegistro = (error: any) => ["ENOTFOUND", "ENODATA", "ENOTIMP"].includes(error?.code);

// Confere se o domínio do email existe e recebe mensagens (registro MX no DNS).
// Falha de rede/DNS lento não bloqueia o cadastro: só domínio comprovadamente
// inexistente, sem servidor de email ou descartável é recusado.
export const checkEmailDomain: EmailCheck = async (email) => {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (DESCARTAVEIS.has(domain))
    return { ok: false, message: "Use um email permanente: endereços temporários não são aceitos." };
  if (CONHECIDOS.has(domain)) return { ok: true };
  try {
    const mx: { exchange: string; priority: number }[] = await withTimeout(resolveMx(domain), 4000);
    // MX nulo (RFC 7505): o domínio declara que não recebe emails.
    if (mx.length && mx.every((r) => !r.exchange || r.exchange === "."))
      return { ok: false, message: `O domínio ${domain} não recebe emails. Confira o endereço.` };
    if (mx.length) return { ok: true };
  } catch (error) {
    if (!semRegistro(error)) return { ok: true };
  }
  // Sem MX: alguns domínios recebem direto pelo endereço do site (registro A/AAAA).
  for (const resolver of [resolve4, resolve6]) {
    try {
      const found: string[] = await withTimeout(resolver(domain), 3000);
      if (found.length) return { ok: true };
    } catch (error) {
      if (!semRegistro(error)) return { ok: true };
    }
  }
  // Antes de recusar, confere se o próprio DNS do servidor está funcionando:
  // se nem um domínio conhecido resolve, o problema é a rede, não o email.
  if (!(await dnsFuncionando())) return { ok: true };
  return {
    ok: false,
    message: `Não encontramos o domínio "${domain}". Confira se o email foi digitado certo.`,
  };
};

let dnsOk: { at: number; ok: boolean } | undefined;
async function dnsFuncionando() {
  if (dnsOk && Date.now() - dnsOk.at < 5 * 60000) return dnsOk.ok;
  let ok = false;
  try {
    const mx: unknown[] = await withTimeout(resolveMx("gmail.com"), 3000);
    ok = mx.length > 0;
  } catch {
    ok = false;
  }
  dnsOk = { at: Date.now(), ok };
  return ok;
}
