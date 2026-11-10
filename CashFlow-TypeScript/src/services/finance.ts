import { createHash } from "node:crypto";
import type { Database } from "../db.js";
import { userDatabase } from "../db.js";
import { HttpError, text, date, money, id } from "../validation.js";
export const standardCategories: Record<string, string> = {
  salario: "income",
  freelance: "income",
  investimentos: "income",
  "outros-receitas": "income",
  alimentacao: "expense",
  transporte: "expense",
  moradia: "expense",
  saude: "expense",
  educacao: "expense",
  lazer: "expense",
  "outros-despesas": "expense",
};
export function localDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export async function summaryIn(
  tx: Database,
  userId: number,
  month = localDate().slice(0, 7),
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new HttpError(400, "Mês inválido. Use AAAA-MM.");
  const r = await tx.query(
    `SELECT COALESCE(SUM(valor) FILTER(WHERE tipo='income'),0) AS receitas,COALESCE(SUM(valor) FILTER(WHERE tipo='expense'),0) AS despesas,COALESCE(SUM(CASE WHEN tipo='income' THEN valor ELSE -valor END),0) AS saldo FROM transacoes WHERE usuario_id=$1 AND data_transacao>=($2||'-01')::date AND data_transacao<(($2||'-01')::date+INTERVAL '1 month')`,
    [userId, month],
  );
  const u = await tx.query("SELECT gasto_maximo FROM usuarios WHERE id=$1", [
    userId,
  ]);
  const total = await tx.query(
    "SELECT COALESCE(SUM(CASE WHEN tipo='income' THEN valor ELSE -valor END),0) AS saldo FROM transacoes WHERE usuario_id=$1",
    [userId],
  );
  const receitas = Number(r.rows[0].receitas),
    despesas = Number(r.rows[0].despesas),
    limit = Number(u.rows[0]?.gasto_maximo ?? 0),
    percent = limit > 0 ? Math.round((despesas / limit) * 10000) / 100 : 0;
  return {
    mes: month,
    receitas,
    despesas,
    saldo: Number(r.rows[0].saldo),
    saldo_total: Number(total.rows[0].saldo),
    gasto_maximo: limit,
    percentual: percent,
    percent,
    alertas:
      limit > 0
        ? despesas >= limit
          ? [80, 100]
          : despesas >= limit * 0.8
            ? [80]
            : []
        : [],
  };
}
export function monthlySummary(db: Database, userId: number, month?: string) {
  return userDatabase(db, userId).transaction((tx) =>
    summaryIn(tx, userId, month),
  );
}
export async function scheduleAlerts(tx: Database, userId: number) {
  const s = await summaryIn(tx, userId);
  for (const level of s.alertas) {
    const message =
      level === 100
        ? `Limite mensal ${s.despesas > s.gasto_maximo ? "ultrapassado" : "atingido"}: despesas de R$ ${s.despesas.toFixed(2)} para limite de R$ ${s.gasto_maximo.toFixed(2)}.`
        : `Você atingiu 80% do limite mensal. Despesas: R$ ${s.despesas.toFixed(2)}; limite: R$ ${s.gasto_maximo.toFixed(2)}.`;
    await tx.query(
      "INSERT INTO notificacoes(usuario_id,mes,nivel,mensagem) VALUES($1,$2,$3,$4) ON CONFLICT(usuario_id,mes,nivel) DO NOTHING",
      [userId, s.mes, level, message],
    );
  }
  return s;
}
export function validateTransaction(input: Record<string, any>) {
  if (!["income", "expense"].includes(input.type))
    throw new HttpError(400, "Selecione receita ou despesa.");
  const amount = money(input.amount, "valor");
  if (Number(amount) <= 0)
    throw new HttpError(400, "Informe um valor maior que zero.");
  return {
    description: text(input.description, "descrição", 500),
    amount,
    category: text(input.category, "categoria", 100),
    type: input.type as string,
    date: date(input.date, "transação"),
  };
}
async function categoryValid(
  tx: Database,
  uid: number,
  category: string,
  type: string,
) {
  if (standardCategories[category] === type) return;
  const c = await tx.query(
    "SELECT id FROM categorias WHERE usuario_id=$1 AND lower(nome)=lower($2) AND tipo=$3",
    [uid, category, type],
  );
  if (!c.rows.length)
    throw new HttpError(
      400,
      "A categoria não existe para esse tipo. Selecione uma categoria ou crie uma nova.",
    );
}
export async function saveTransaction(
  db: Database,
  uid: number,
  input: Record<string, any>,
  editing = false,
) {
  const values = validateTransaction(input);
  const key = text(input.idempotency_key, "chave de reenvio", 160);
  const txId = editing ? id(input.id) : undefined;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...values, id: txId ?? null, editing }))
    .digest("hex");
  return userDatabase(db, uid).transaction(async (tx) => {
    // Serializa mutações da mesma conta; não bloqueia outras contas.
    await tx.query("SELECT id FROM usuarios WHERE id=$1 FOR UPDATE", [uid]);
    const reserved = await tx.query(
      "INSERT INTO operacoes(usuario_id,chave,payload_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING chave",
      [uid, key, fingerprint],
    );
    if (!reserved.rows.length) {
      const previous = (
        await tx.query(
          "SELECT payload_hash,resultado FROM operacoes WHERE usuario_id=$1 AND chave=$2",
          [uid, key],
        )
      ).rows[0];
      if (previous.payload_hash !== fingerprint)
        throw new HttpError(
          409,
          "Essa chave de reenvio já foi usada com outros dados.",
        );
      return previous.resultado;
    }
    await categoryValid(tx, uid, values.category, values.type);
    const params = [
      values.description,
      values.amount,
      values.category,
      values.type,
      values.date,
      uid,
    ];
    const r = editing
      ? await tx.query(
          "UPDATE transacoes SET descricao=$1,valor=$2,categoria=$3,tipo=$4,data_transacao=$5 WHERE usuario_id=$6 AND id=$7 RETURNING id",
          [...params, txId],
        )
      : await tx.query(
          "INSERT INTO transacoes(descricao,valor,categoria,tipo,data_transacao,usuario_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          params,
        );
    if (!r.rows[0]) throw new HttpError(404, "Transação não encontrada.");
    const result = {
      status: "success",
      id: r.rows[0].id,
      message: editing
        ? "Transação atualizada."
        : "Transação salva com sucesso!",
    };
    await tx.query(
      "UPDATE operacoes SET resultado=$1 WHERE usuario_id=$2 AND chave=$3",
      [JSON.stringify(result), uid, key],
    );
    await scheduleAlerts(tx, uid);
    return result;
  });
}
export function quickExpense(input: Record<string, any>) {
  const raw = text(input.texto, "descrição e valor", 500);
  const match = raw.match(/^(.*?)\s+(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)$/i);
  if (!match)
    throw new HttpError(
      400,
      "Digite a descrição e o valor. Exemplo: mercado 35,90.",
    );
  const description = match[1].trim();
  const category = /mercado|aliment|restaurante|padaria|lanche/i.test(
    description,
  )
    ? "alimentacao"
    : /uber|onibus|ônibus|gasolina|combust/i.test(description)
      ? "transporte"
      : "outros-despesas";
  return {
    description,
    amount: match[2],
    category,
    type: "expense",
    date: localDate(),
    idempotency_key: input.idempotency_key,
  };
}
