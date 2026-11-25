export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function text(value: unknown, name: string, max = 255) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new HttpError(400, `Campo ${name} inválido.`);
  return value.trim();
}
export function date(value: unknown, name: string) {
  const s = text(value, name, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new HttpError(400, `Data ${name} inválida.`);
  return s;
}
// Nomes amigáveis para as mensagens de erro de valores.
const moneyLabels: Record<string, string> = {
  renda: "da renda mensal",
  despesas: "da média de despesas",
  gasto_maximo: "do gasto máximo",
  valor: "",
};
export function money(value: unknown, name: string) {
  const label = (moneyLabels[name] ?? name) ? ` ${moneyLabels[name] ?? name}` : "";
  let s = String(value ?? "").replace(/R\$|\s/g, "");
  if (s.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s))
      throw new HttpError(400, `Valor${label} inválido.`);
    s = s.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(s))
    throw new HttpError(400, `Valor${label} inválido.`);
  // Limite das colunas NUMERIC(12,2): até R$ 9.999.999.999,99 (R$ 10 bilhões).
  if (Number(s) > 9999999999.99)
    throw new HttpError(400, `O valor${label} pode ser de no máximo R$ 10 bilhões.`);
  return Number(s).toFixed(2);
}
export function email(value: unknown) {
  const s = text(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    throw new HttpError(400, "E-mail inválido.");
  return s;
}
export function id(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new HttpError(400, "ID inválido.");
  return n;
}

// Senha forte: 8+ caracteres, maiúscula, minúscula, número e caractere especial.
// Conta como especial qualquer símbolo que não seja letra ou número (! @ # $ % & * _ - espaço...).
export function strongPassword(value: unknown) {
  if (typeof value !== "string" || !value.length)
    throw new HttpError(400, "Informe uma senha.");
  const missing: string[] = [];
  if (value.length < 8) missing.push("8 caracteres");
  if (!/\p{Lu}/u.test(value)) missing.push("uma letra maiúscula");
  if (!/\p{Ll}/u.test(value)) missing.push("uma letra minúscula");
  if (!/\p{Nd}/u.test(value)) missing.push("um número");
  if (!/[^\p{L}\p{Nd}]/u.test(value)) missing.push("um caractere especial");
  if (missing.length)
    throw new HttpError(
      400,
      `Senha fraca. Inclua pelo menos ${missing.join(", ")}.`,
    );
  if (Buffer.byteLength(value) > 72)
    throw new HttpError(400, "A senha pode ter no máximo 72 bytes.");
  return value;
}

// CPF: 11 dígitos com dígitos verificadores corretos (rejeita 111.111.111-11 etc.).
export function isValidCpf(value: string) {
  const d = value.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(d[i]) * (size + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[size])) return false;
  }
  return true;
}
export function cpf(value: unknown) {
  const s = text(value, "cpf", 20);
  if (!isValidCpf(s)) throw new HttpError(400, "CPF inválido. Confira os números.");
  const d = s.replace(/\D/g, "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
// Nome completo: nome e sobrenome, só letras (com acento), espaço, hífen e apóstrofo.
export function fullName(value: unknown) {
  const s = text(value, "nome", 120).replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L}'’.\- ]*$/u.test(s))
    throw new HttpError(400, "O nome deve ter apenas letras.");
  if (s.split(" ").filter((p) => p.replace(/[.'’-]/g, "").length >= 2).length < 2)
    throw new HttpError(400, "Informe nome e sobrenome.");
  return s;
}
