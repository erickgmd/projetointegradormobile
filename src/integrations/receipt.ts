import { money } from "../validation.js";
export function classifyExpense(text: string): string {
  const s = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/mercado|supermerc|restaurante|padaria|alimento|lanche/.test(s))
    return "alimentacao";
  if (/posto|combustivel|gasolina|uber|taxi|transporte/.test(s))
    return "transporte";
  if (/farmacia|drogaria|hospital|clinica/.test(s)) return "saude";
  return "outros-despesas";
}
export function extractReceipt(text: string): {
  description: string;
  amount: string;
  date: string;
  category: string;
} | null {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const total = lines.find(
    (s) =>
      /(?:valor\s*(?:a\s*pagar|total)|total\s*(?:a\s*pagar)?)/i.test(s) &&
      !/subtotal|tribut|desconto/i.test(s) &&
      /\d+[,.]\d{2}/.test(s),
  );
  const values = total?.match(/(?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}/g);
  const d = text.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
  const description = lines
    .find(
      (s) =>
        /[a-zÀ-ÿ]{3}/i.test(s) &&
        !/cnpj|cpf|cupom|nota fiscal|danfe|documento|consumidor/i.test(s),
    )
    ?.slice(0, 500);
  if (!values?.length || !d || !description) return null;
  const date = `${d[3]}-${d[2]}-${d[1]}`;
  if (
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    return null;
  try {
    const amount = money(values[values.length - 1], "valor");
    return Number(amount) > 0
      ? { description, amount, date, category: classifyExpense(description) }
      : null;
  } catch {
    return null;
  }
}
export function brazilToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function categoryLabel(category: string): string {
  return (
    (
      {
        alimentacao: "Alimentação",
        transporte: "Transporte",
        saude: "Saúde",
        "outros-despesas": "Outros",
        "outros-receitas": "Outras receitas",
        salario: "Salário",
      } as Record<string, string>
    )[category] ?? category
  );
}
export function parseTransaction(text: string) {
  const m = text
    .trim()
    .match(
      /^\/?(receita|despesa)\s+(.{1,500}?)\s+(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)$/i,
    );
  if (!m) return null;
  try {
    const amount = money(m[3], "valor");
    if (Number(amount) <= 0) return null;
    return {
      description: m[2].trim(),
      amount,
      category:
        m[1].toLowerCase() === "receita"
          ? /sal[aá]rio/i.test(m[2])
            ? "salario"
            : "outros-receitas"
          : classifyExpense(m[2]),
      type:
        m[1].toLowerCase() === "receita"
          ? ("income" as const)
          : ("expense" as const),
      date: brazilToday(),
    };
  } catch {
    return null;
  }
}
