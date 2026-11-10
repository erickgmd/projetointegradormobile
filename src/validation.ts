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
export function money(value: unknown, name: string) {
  let s = String(value ?? "").replace(/R\$|\s/g, "");
  if (s.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s))
      throw new HttpError(400, `Valor ${name} inválido.`);
    s = s.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(s) || Number(s) > 9999999999.99)
    throw new HttpError(400, `Valor ${name} inválido.`);
  return Number(s).toFixed(2);
}
export function email(value: unknown) {
  const s = text(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    throw new HttpError(400, "Email inválido.");
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
