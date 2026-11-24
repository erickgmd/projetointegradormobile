import { createHmac, timingSafeEqual, createHash } from "node:crypto";

// Token assinado (sem tabela nova): id do usuário + email + validade.
// Se o email mudar, links antigos deixam de valer.
const secret = () =>
  process.env.EMAIL_TOKEN_SECRET ||
  createHash("sha256")
    .update("cashflow-confirmacao:" + (process.env.DATABASE_URL || "desenvolvimento"))
    .digest("hex");

const sign = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

export function confirmationToken(userId: number, email: string, days = 7) {
  const payload = Buffer.from(
    JSON.stringify({ u: Number(userId), e: email.toLowerCase(), x: Date.now() + days * 86400000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readConfirmationToken(token: unknown) {
  if (typeof token !== "string" || token.length > 600) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // O id pode vir como texto ("2"): o banco devolve alguns ids como string.
    const userId = Number(data.u);
    if (!Number.isSafeInteger(userId) || userId <= 0 || typeof data.e !== "string" || typeof data.x !== "number")
      return null;
    return { userId, email: data.e as string, expired: Date.now() > data.x };
  } catch {
    return null;
  }
}
