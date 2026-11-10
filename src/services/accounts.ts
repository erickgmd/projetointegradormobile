import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Database } from "../db.js";
import { HttpError, email, text, strongPassword } from "../validation.js";
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function newPassword(b: Record<string, any>) {
  strongPassword(b.senha);
  if (b.senha !== b.confirmar_senha)
    throw new HttpError(400, "As senhas não coincidem.");
  return b.senha as string;
}
export async function requestReset(
  db: Database,
  address: unknown,
  send?: (email: string, token: string) => Promise<void>,
) {
  if (!send)
    throw new HttpError(
      503,
      "A recuperação por email está temporariamente indisponível. Tente mais tarde ou contate o suporte.",
    );
  const e = email(address);
  const user = (
    await db.query("SELECT id FROM usuarios WHERE lower(email)=$1", [e])
  ).rows[0];
  if (user && send) {
    const token = randomBytes(32).toString("hex");
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM recuperacoes_senha WHERE usuario_id=$1", [
        user.id,
      ]);
      await tx.query(
        "INSERT INTO recuperacoes_senha(token_hash,usuario_id,expira_em) VALUES($1,$2,NOW()+INTERVAL '15 minutes')",
        [tokenHash(token), user.id],
      );
    });
    try {
      await send(e, token);
    } catch {
      await db.query("DELETE FROM recuperacoes_senha WHERE token_hash=$1", [
        tokenHash(token),
      ]); /* resposta uniforme; monitor operacional recebe falha genérica no sender */
    }
  }
  // Mesma resposta para emails existentes e ausentes, sem revelar tokens.
  return {
    status: "success",
    message:
      "Se houver uma conta para esse email, você receberá as instruções de recuperação. Verifique também o spam.",
  };
}
export async function resetPassword(db: Database, b: Record<string, any>) {
  const token = text(b.token, "link de recuperação", 128),
    password = await bcrypt.hash(newPassword(b), 12);
  return db.transaction(async (tx) => {
    const r = await tx.query(
      "SELECT usuario_id FROM recuperacoes_senha WHERE token_hash=$1 AND usado_em IS NULL AND expira_em>NOW() FOR UPDATE",
      [tokenHash(token)],
    );
    if (!r.rows[0])
      throw new HttpError(
        400,
        "Link inválido, expirado ou já utilizado. Solicite outro link.",
      );
    const uid = r.rows[0].usuario_id;
    await tx.query("UPDATE usuarios SET senha=$1 WHERE id=$2", [password, uid]);
    await tx.query("DELETE FROM sessoes WHERE usuario_id=$1", [uid]);
    await tx.query("DELETE FROM recuperacoes_senha WHERE usuario_id=$1", [uid]);
    return {
      status: "success",
      message: "Senha alterada. Entre novamente com a nova senha.",
    };
  });
}
export async function deleteAccount(
  db: Database,
  uid: number,
  b: Record<string, any>,
) {
  if (b.confirmacao !== "EXCLUIR")
    throw new HttpError(
      400,
      "Digite EXCLUIR para confirmar a exclusão definitiva.",
    );
  const user = (await db.query("SELECT senha FROM usuarios WHERE id=$1", [uid]))
    .rows[0];
  // Conta criada só com Google não tem senha: basta a confirmação EXCLUIR.
  if (user && user.senha) text(b.senha, "senha", 1024);
  if (
    !user ||
    (user.senha &&
      !(await bcrypt.compare(b.senha, user.senha.replace(/^\$2y\$/, "$2b$"))))
  )
    throw new HttpError(401, "Senha incorreta. Confira a senha da sua conta.");
  await db.transaction(async (tx) => {
    // Exclusões explícitas também funcionam no esquema legado sem ON DELETE CASCADE.
    const chat = (
      await tx.query(
        "SELECT telegram_id FROM telegram_vinculos WHERE usuario_id=$1",
        [uid],
      )
    ).rows[0]?.telegram_id;
    if (chat)
      await tx.query(
        "DELETE FROM telegram_updates WHERE payload->'message'->'from'->>'id'=$1 OR payload->'callback_query'->'from'->>'id'=$1",
        [String(chat)],
      );
    for (const table of [
      "sessoes",
      "recuperacoes_senha",
      "ocr_pendencias",
      "telegram_vinculos",
      "categorias",
      "operacoes",
      "notificacoes",
      "transacoes",
    ])
      await tx.query(`DELETE FROM ${table} WHERE usuario_id=$1`, [uid]);
    await tx.query("DELETE FROM usuarios WHERE id=$1", [uid]);
  });
  return { status: "success", message: "Conta e dados excluídos." };
}
