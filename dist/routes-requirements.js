import { randomBytes } from "node:crypto";
import { userDatabase } from "./db.js";
import { HttpError, text } from "./validation.js";
import { requestReset, resetPassword, deleteAccount, tokenHash, } from "./services/accounts.js";
import { saveTransaction, monthlySummary, quickExpense, standardCategories, } from "./services/finance.js";
export const requestBody = (req) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
        throw new HttpError(400, "Envie os campos do formulário.");
    return req.body;
};
export async function requirementsRoutes(app, db, options) {
    const ratesCache = new Map();
    app.get("/api/mercado/taxas", async (req, reply) => {
        const now = new Date();
        now.setUTCDate(1);
        now.setUTCMonth(now.getUTCMonth() - 1);
        const month = req.query?.mes || now.toISOString().slice(0, 7);
        if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
            throw new HttpError(400, "Informe o mês no formato AAAA-MM.");
        const cached = ratesCache.get(month);
        if (cached && Date.now() - cached.at < 30 * 60000)
            return cached.data;
        // API Olinda (OData). O recurso é TaxasJurosMensalPorMes, com os campos
        // Mes, Modalidade, Posicao, InstituicaoFinanceira, TaxaJurosAoMes,
        // TaxaJurosAoAno, cnpj8 e anoMes. Os "$" precisam ir sem codificação.
        const base = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes";
        const olinda = async (params) => {
            const query = Object.entries(params)
                .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                .join("&");
            const response = await (options.externalFetch ?? fetch)(`${base}?${query}&$format=json`, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(20000),
            });
            if (!response.ok)
                throw new Error(`Olinda HTTP ${response.status}`);
            const data = (await response.json());
            if (!Array.isArray(data?.value))
                throw new Error("Olinda sem dados");
            return data.value;
        };
        const byMonth = (anoMes) => olinda({ $filter: `anoMes eq '${anoMes}'`, $top: "5000" });
        try {
            let used = month;
            let rows = await byMonth(month);
            if (!rows.length) {
                // O BCB publica com atraso: usa o mês mais recente disponível.
                const latest = await olinda({
                    $orderby: "anoMes desc",
                    $top: "1",
                    $select: "anoMes",
                });
                const last = latest[0]?.anoMes;
                if (last && last !== month) {
                    used = String(last);
                    rows = await byMonth(used);
                }
            }
            const data = {
                value: rows,
                mes_solicitado: month,
                mes: used,
                atualizado_em: new Date().toISOString(),
            };
            if (ratesCache.size >= 12)
                ratesCache.delete(ratesCache.keys().next().value);
            ratesCache.set(month, { at: Date.now(), data });
            return data;
        }
        catch (error) {
            req.log.warn({ err: String(error) }, "Consulta Olinda falhou");
            if (cached)
                return { ...cached.data, desatualizado: true };
            reply.code(503);
            return {
                status: "error",
                message: "O Banco Central não respondeu agora. Tente novamente em alguns minutos. As outras funções continuam disponíveis.",
            };
        }
    });
    const limited = {
        config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    };
    app.post("/api/senha/recuperar", limited, async (req) => requestReset(db, requestBody(req).email, options.sendReset));
    app.post("/api/senha/redefinir", limited, async (req) => resetPassword(db, requestBody(req)));
    app.post("/api/session/atividade", async (req) => {
        await db.query("UPDATE sessoes SET ultima_atividade=NOW() WHERE token_hash=$1", [tokenHash(req.cookies.cashflow_session)]);
        return { status: "success" };
    });
    app.get("/api/resumo", async (req) => ({
        status: "success",
        ...(await monthlySummary(db, req.userId, req.query?.mes)),
    }));
    app.get("/api/categorias", async (req) => ({
        status: "success",
        categories: (await userDatabase(db, req.userId).query("SELECT id,nome,tipo FROM categorias WHERE usuario_id=$1 ORDER BY nome", [req.userId])).rows,
    }));
    app.post("/api/categorias", async (req) => {
        const b = requestBody(req), nome = text(b.nome, "nome da categoria", 100);
        if (!["income", "expense"].includes(b.tipo))
            throw new HttpError(400, "Selecione receita ou despesa para a categoria.");
        if (standardCategories[nome])
            throw new HttpError(409, "Essa categoria já é predefinida.");
        const r = await userDatabase(db, req.userId).query("INSERT INTO categorias(usuario_id,nome,tipo) VALUES($1,$2,$3) RETURNING id,nome,tipo", [req.userId, nome, b.tipo]);
        return { status: "success", ...r.rows[0] };
    });
    app.post("/api/transacoes/editar", async (req) => saveTransaction(db, req.userId, {
        ...requestBody(req),
        idempotency_key: requestBody(req).idempotency_key ?? req.headers["idempotency-key"],
    }, true));
    app.post("/api/transacoes/rapida", async (req) => saveTransaction(db, req.userId, quickExpense({
        ...requestBody(req),
        idempotency_key: requestBody(req).idempotency_key ?? req.headers["idempotency-key"],
    })));
    app.post("/api/consentimento", async (req) => {
        if (![true, "true", "on", "1"].includes(requestBody(req).aceito))
            throw new HttpError(400, "Confirme que leu o aviso de privacidade.");
        await userDatabase(db, req.userId).query("UPDATE usuarios SET consentimento_em=NOW(),consentimento_versao='2026-11-v1' WHERE id=$1", [req.userId]);
        return { status: "success" };
    });
    app.post("/api/conta/excluir", async (req, reply) => {
        const result = await deleteAccount(db, req.userId, requestBody(req));
        reply.clearCookie("cashflow_session", { path: "/" });
        return result;
    });
    app.post("/api/telegram", async (req) => {
        const b = requestBody(req), uid = req.userId, scoped = userDatabase(db, uid);
        const row = (await scoped.query("SELECT nome_telegram,expira_em,usado_em,telegram_id FROM telegram_vinculos WHERE usuario_id=$1", [uid])).rows[0];
        if ((b.acao ?? "verificar") === "verificar")
            return {
                status: "success",
                codigo: null,
                nome_telegram: row?.nome_telegram ?? null,
                tem_codigo: !!row?.expira_em &&
                    !row?.usado_em &&
                    new Date(row.expira_em) > new Date(),
                vinculado: !!row?.telegram_id,
                expires_at: row?.expira_em ?? null,
                gerado_agora: false,
                message: "Por segurança, o token só é exibido ao gerar. Gere outro se necessário.",
            };
        if (b.acao !== "gerar")
            throw new HttpError(400, "Ação inválida.");
        const username = text(b.nome_telegram, "username Telegram", 33)
            .replace(/^@/, "")
            .toLowerCase();
        if (!/^[a-z0-9_]{5,32}$/.test(username))
            throw new HttpError(400, "Informe seu username Telegram, com 5 a 32 letras, números ou _.");
        const token = randomBytes(24).toString("hex");
        const r = await scoped.query("INSERT INTO telegram_vinculos(usuario_id,nome_telegram,codigo_vinculo,token_hash,expira_em,usado_em,criado_em) VALUES($1,$2,NULL,$3,NOW()+INTERVAL '10 minutes',NULL,NOW()) ON CONFLICT(usuario_id) DO UPDATE SET nome_telegram=EXCLUDED.nome_telegram,codigo_vinculo=NULL,token_hash=EXCLUDED.token_hash,expira_em=EXCLUDED.expira_em,usado_em=NULL,criado_em=NOW() RETURNING expira_em", [uid, username, tokenHash(token)]);
        return {
            status: "success",
            codigo: token,
            nome_telegram: username,
            tem_codigo: true,
            expires_at: r.rows[0].expira_em,
            gerado_agora: true,
            message: "Envie /vincular seguido deste código no chat privado do bot em até 10 minutos. Ele só pode ser usado uma vez.",
        };
    });
    app.post("/api/telegram/webhook", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
        if (!options.telegramSecret ||
            req.headers["x-telegram-bot-api-secret-token"] !==
                options.telegramSecret)
            throw new HttpError(403, "Webhook não autorizado.");
        const update = requestBody(req);
        if (!Number.isSafeInteger(update.update_id))
            throw new HttpError(400, "Atualização inválida.");
        await db.query("INSERT INTO telegram_updates(update_id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING", [update.update_id, JSON.stringify(update)]);
        reply.code(200);
        return { ok: true };
    });
}
