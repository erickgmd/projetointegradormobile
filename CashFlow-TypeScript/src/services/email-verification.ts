import { createHash, randomBytes } from "node:crypto";
import type { Database } from "../db.js";
import { email, HttpError } from "../validation.js";

export type VerificationSender = (
  email: string,
  token: string,
) => Promise<void>;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const verificationResponse = () => ({
  status: "success",
  message:
    "Se houver uma conta pendente para esse e-mail, enviaremos um link de confirmação. Verifique também o spam. Aguarde um minuto antes de reenviar.",
});

export async function sendVerification(
  db: Database,
  address: unknown,
  send: VerificationSender,
) {
  const normalized = email(address);
  const pending = await db.transaction(async (tx) => {
    const user = (
      await tx.query(
        "SELECT id,email FROM usuarios WHERE lower(email)=$1 AND email_verificacao_obrigatoria=TRUE AND email_confirmado_em IS NULL FOR UPDATE",
        [normalized],
      )
    ).rows[0];
    if (!user) return null;
    const recent = await tx.query(
      "SELECT 1 FROM verificacoes_email WHERE usuario_id=$1 AND criado_em>NOW()-INTERVAL '1 minute'",
      [user.id],
    );
    if (recent.rows.length) return null;
    const token = randomBytes(32).toString("hex");
    await tx.query(
      "DELETE FROM verificacoes_email WHERE usuario_id=$1 OR expira_em<=NOW()",
      [user.id],
    );
    await tx.query(
      "INSERT INTO verificacoes_email(token_hash,usuario_id,email,expira_em) VALUES($1,$2,$3,NOW()+INTERVAL '24 hours')",
      [hash(token), user.id, normalized],
    );
    return { token, email: normalized };
  });
  if (!pending) return false;
  try {
    await send(pending.email, pending.token);
    return true;
  } catch {
    await db.query("DELETE FROM verificacoes_email WHERE token_hash=$1", [
      hash(pending.token),
    ]);
    return false;
  }
}

export async function confirmEmail(db: Database, token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(
      400,
      "Link inválido, expirado ou já utilizado. Solicite outro link.",
    );
  return db.transaction(async (tx) => {
    const candidate = (
      await tx.query(
        "SELECT usuario_id FROM verificacoes_email WHERE token_hash=$1",
        [hash(token)],
      )
    ).rows[0];
    if (!candidate)
      throw new HttpError(
        400,
        "Link inválido, expirado ou já utilizado. Solicite outro link.",
      );
    // Mesmo ordenamento de locks do reenvio: usuário primeiro, token depois.
    await tx.query("SELECT id FROM usuarios WHERE id=$1 FOR UPDATE", [
      candidate.usuario_id,
    ]);
    // DELETE RETURNING torna o uso único atômico mesmo com requisições simultâneas.
    const item = (
      await tx.query(
        "DELETE FROM verificacoes_email WHERE token_hash=$1 AND expira_em>NOW() RETURNING usuario_id,email",
        [hash(token)],
      )
    ).rows[0];
    if (!item)
      throw new HttpError(
        400,
        "Link inválido, expirado ou já utilizado. Solicite outro link.",
      );
    const r = await tx.query(
      "UPDATE usuarios SET email_confirmado_em=NOW() WHERE id=$1 AND lower(email)=$2 AND email_verificacao_obrigatoria=TRUE AND email_confirmado_em IS NULL RETURNING id",
      [item.usuario_id, item.email],
    );
    if (!r.rows.length)
      throw new HttpError(
        400,
        "Link inválido, expirado ou já utilizado. Solicite outro link.",
      );
    await tx.query("DELETE FROM sessoes WHERE usuario_id=$1", [
      item.usuario_id,
    ]);
    return {
      status: "success",
      message:
        "E-mail confirmado! Entre com seu e-mail e senha para continuar.",
    };
  });
}
