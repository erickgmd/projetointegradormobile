import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { userDatabase } from "../db.js";
import { categoryLabel, extractReceipt, parseTransaction } from "./receipt.js";
const brl = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
const normalize = (s) => s.replace(/^@/, "").toLowerCase();
export class TelegramService {
    deps;
    fetcher;
    constructor(deps) {
        this.deps = deps;
        this.fetcher = deps.fetcher ?? fetch;
    }
    async api(method, payload) {
        if (!this.deps.token)
            throw new Error("Telegram não configurado.");
        const response = await this.fetcher(`https://api.telegram.org/bot${this.deps.token}/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(4500),
        });
        if (!response.ok)
            throw new Error("Falha na comunicação com Telegram.");
        const result = (await response.json());
        if (!result.ok)
            throw new Error("Telegram recusou a operação.");
        return result.result;
    }
    async send(chatId, text, options = {}) {
        await this.api("sendMessage", {
            ...options,
            chat_id: chatId,
            text: text.slice(0, 4096),
        });
    }
    async handle(update) {
        const cb = update.callback_query;
        const message = cb?.message ?? update.message;
        const from = cb?.from ?? message?.from;
        if (!message?.chat ||
            message.chat.type !== "private" ||
            String(message.chat.id) !== String(from?.id))
            return;
        const chat = message.chat.id;
        if (cb?.id)
            await this.api("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => { });
        const command = String(message.text ?? "").trim();
        const link = command.match(/^\/(?:start|vincular)(?:@\w+)?\s+(\S{16,256})$/);
        if (link) {
            if (!from.username) {
                await this.send(chat, "Defina um nome de usuário no Telegram antes de vincular.");
                return;
            }
            const hash = createHash("sha256").update(link[1]).digest("hex");
            const result = await this.deps.db.query(`UPDATE telegram_vinculos SET telegram_id=$1,usado_em=NOW() WHERE token_hash=$2 AND LOWER(LTRIM(nome_telegram,'@'))=$3 AND usado_em IS NULL AND expira_em>NOW() RETURNING usuario_id`, [from.id, hash, normalize(String(from.username ?? ""))]);
            await this.send(chat, result.rows.length
                ? "Telegram vinculado com sucesso."
                : "Código inválido, expirado ou usuário diferente.");
            return;
        }
        const linked = await this.deps.db.query("SELECT usuario_id FROM telegram_vinculos WHERE telegram_id=$1 AND usado_em IS NOT NULL", [from.id]);
        const userId = linked.rows[0]?.usuario_id;
        if (!userId) {
            await this.send(chat, "Vincule sua conta usando /vincular e o código gerado no CashFlow.");
            return;
        }
        if (cb) {
            await this.confirm(chat, userId, String(cb.data ?? ""));
            return;
        }
        if (message.photo?.length) {
            await this.photo(chat, userId, message.photo.at(-1));
            return;
        }
        if (/^\/saldo(?:@\w+)?$/.test(command)) {
            const result = await this.deps.summary(userId);
            await this.send(chat, [
                "Resumo financeiro",
                `Saldo: ${brl(result.saldo_total ?? result.saldo ?? result.balance)}`,
                `Receitas: ${brl(result.receitas ?? result.total_receitas ?? result.receitas_total)}`,
                `Despesas: ${brl(result.despesas ?? result.total_despesas ?? result.despesas_total)}`,
                `Gasto máximo: ${brl(result.gasto_maximo)}`,
            ].join("\n"));
            return;
        }
        if (/^\/extrato(?:@\w+)?$/.test(command)) {
            const r = await userDatabase(this.deps.db, userId).query("SELECT descricao,valor,tipo,to_char(data_transacao,'DD/MM/YYYY') AS data FROM transacoes WHERE usuario_id=$1 ORDER BY data_transacao DESC,id DESC LIMIT 20", [userId]);
            await this.send(chat, r.rows.length
                ? r.rows
                    .map((x) => `${x.data} • ${x.descricao} • ${x.tipo === "income" ? "+" : "−"} R$ ${Number(x.valor).toFixed(2)}`)
                    .join("\n")
                : "Nenhuma transação.");
            return;
        }
        const parsed = parseTransaction(command);
        if (parsed) {
            try {
                await this.deps.record(userId, {
                    ...parsed,
                    idempotency_key: `telegram:${update.update_id ?? `${chat}:${message.message_id}`}`,
                });
            }
            catch (error) {
                if (error?.statusCode >= 400 && error?.statusCode < 500) {
                    await this.send(chat, error.message);
                    return;
                }
                throw error;
            }
            await this.send(chat, "Transação registrada.");
            return;
        }
        await this.send(chat, "Use receita salário 1000,50, despesa mercado 30,00, /saldo, /extrato ou envie uma foto de comprovante.");
    }
    async confirm(chat, userId, data) {
        const m = data.match(/^(confirmar|cancelar):(\d+)$/);
        if (!m)
            return;
        if (m[1] === "cancelar") {
            await userDatabase(this.deps.db, userId).query("DELETE FROM ocr_pendencias WHERE id=$1 AND usuario_id=$2 AND telegram_id=$3 AND confirmado_em IS NULL", [m[2], userId, chat]);
            await this.send(chat, "Comprovante cancelado.");
            return;
        }
        const r = await userDatabase(this.deps.db, userId).query("SELECT * FROM ocr_pendencias WHERE id=$1 AND usuario_id=$2 AND telegram_id=$3 AND confirmado_em IS NULL AND expira_em>NOW()", [m[2], userId, chat]);
        const p = r.rows[0];
        if (!p) {
            await this.send(chat, "Confirmação expirada ou já processada.");
            return;
        }
        await this.deps.record(userId, {
            description: p.descricao,
            amount: String(p.valor),
            category: p.categoria,
            type: "expense",
            date: p.data_transacao instanceof Date
                ? p.data_transacao.toISOString().slice(0, 10)
                : String(p.data_transacao).slice(0, 10),
            idempotency_key: `ocr:${p.id}`,
        });
        await userDatabase(this.deps.db, userId).query("UPDATE ocr_pendencias SET confirmado_em=NOW() WHERE id=$1 AND usuario_id=$2 AND telegram_id=$3 AND confirmado_em IS NULL RETURNING id", [p.id, userId, chat]);
        await this.send(chat, "Despesa confirmada.");
    }
    async photo(chat, userId, photo) {
        const deadline = Date.now() + 15000;
        let image;
        try {
            if (photo.file_size > 10 * 1024 * 1024)
                throw new Error("Imagem muito grande.");
            const file = await this.api("getFile", { file_id: photo.file_id });
            if (!/^photos\/[\w.\/-]+$/.test(file.file_path) ||
                file.file_path.includes(".."))
                throw new Error("Imagem inválida.");
            const response = await this.fetcher(`https://api.telegram.org/file/bot${this.deps.token}/${file.file_path}`, { signal: AbortSignal.timeout(4500) });
            if (!response.ok ||
                Number(response.headers.get("content-length")) > 10 * 1024 * 1024)
                throw new Error("Imagem inválida.");
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error("Imagem vazia.");
            const chunks = [];
            let size = 0;
            try {
                while (true) {
                    const next = await reader.read();
                    if (next.done)
                        break;
                    size += next.value.length;
                    if (size > 10 * 1024 * 1024)
                        throw new Error("Imagem muito grande.");
                    chunks.push(next.value);
                }
                image = new Uint8Array(size);
                let offset = 0;
                for (const c of chunks) {
                    image.set(c, offset);
                    offset += c.length;
                    c.fill(0);
                }
            }
            finally {
                await reader.cancel().catch(() => { });
                for (const c of chunks)
                    c.fill(0);
            }
            const text = await this.recognize(image, Math.max(1, deadline - Date.now()));
            image.fill(0);
            image = undefined;
            const receipt = extractReceipt(text);
            if (!receipt) {
                await this.send(chat, "Não identifiquei valor, data e estabelecimento. Envie outra foto ou registre despesa descrição valor.");
                return;
            }
            const r = await userDatabase(this.deps.db, userId).query("INSERT INTO ocr_pendencias(telegram_id,usuario_id,descricao,valor,categoria,data_transacao,texto_ocr,expira_em) VALUES($1,$2,$3,$4,$5,$6,NULL,NOW()+INTERVAL '15 minutes') RETURNING id", [
                chat,
                userId,
                receipt.description,
                receipt.amount,
                receipt.category,
                receipt.date,
            ]);
            const id = r.rows[0].id;
            await this.send(chat, `Confirmar despesa?\n${receipt.description}\nR$ ${receipt.amount} • ${receipt.date}\nCategoria: ${categoryLabel(receipt.category)}`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "Confirmar", callback_data: `confirmar:${id}` },
                            { text: "Cancelar", callback_data: `cancelar:${id}` },
                        ],
                    ],
                },
            });
        }
        catch {
            await this.send(chat, "Não foi possível ler o comprovante. Tente outra foto ou registre despesa descrição valor.");
        }
        finally {
            image?.fill(0);
        }
    }
    async recognize(image, timeoutMs = 15000) {
        let worker;
        let expired = false;
        let timer;
        const run = async () => {
            if (this.deps.ocr)
                return this.deps.ocr(image);
            const moduleName = "tesseract.js";
            const t = await import(moduleName);
            const cachePath = process.env.OCR_CACHE_PATH ?? join(tmpdir(), "cashflow-ocr");
            await mkdir(cachePath, { recursive: true });
            worker = await t.createWorker("por", undefined, {
                cachePath,
                cacheMethod: "write",
            });
            if (expired) {
                await worker.terminate();
                worker = undefined;
                throw new Error("OCR excedeu o prazo.");
            }
            try {
                return (await worker.recognize(image)).data.text;
            }
            finally {
                await worker.terminate();
                worker = undefined;
            }
        };
        try {
            return await Promise.race([
                run(),
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        expired = true;
                        void worker?.terminate().catch(() => { });
                        reject(new Error("OCR excedeu o prazo."));
                    }, timeoutMs);
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
}
