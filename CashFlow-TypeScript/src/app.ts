import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import compress from "@fastify/compress";
import helmet from "@fastify/helmet";
import { userDatabase } from "./db.js";
import {
  requirementsRoutes,
  type RequirementsOptions,
} from "./routes-requirements.js";
import { saveTransaction, scheduleAlerts } from "./services/finance.js";
import { randomBytes, createHash, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import type { Database } from "./db.js";
import {
  HttpError,
  text,
  date,
  money,
  email,
  id,
  strongPassword,
} from "./validation.js";
import type { GoogleVerifier } from "./integrations/google.js";
import type { FastifyReply, FastifyRequest } from "fastify";
declare module "fastify" {
  interface FastifyRequest {
    userId: number | null;
  }
}
const success = (extra: object = {}) => ({ status: "success", ...extra });
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const profileFields = [
  "nome",
  "cpf",
  "nascimento",
  "telefone",
  "email",
  "cep",
  "logradouro",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "tipo_residencia",
  "tempo_residencia",
  "renda",
  "despesas",
  "gasto_maximo",
  "tipo_investimento",
  "faixa_investimento",
  "preferencias",
  "consentimento_em",
];
export async function buildApp(
  db: Database,
  options: RequirementsOptions & {
    logger?: boolean;
    production?: boolean;
    appOrigin?: string;
    // Origens adicionais aceitas, ex.: http://10.0.2.2:3001 do emulador Android.
    extraOrigins?: string[];
    // Login com Google: Client ID Web público e verificador do ID token.
    googleClientId?: string;
    verifyGoogle?: GoogleVerifier;
  } = {},
) {
  const app = Fastify({
    logger: options.logger
      ? {
          serializers: {
            req: (req: any) => ({
              method: req.method,
              url: req.url?.split("?")[0],
            }),
          },
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "req.headers.x-telegram-bot-api-secret-token",
          ],
        }
      : false,
    bodyLimit: 64 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  await app.register(compress);
  await app.register(helmet, {
    contentSecurityPolicy: false,
    // O botão "Entrar com Google" abre uma janela do Google: exige allow-popups.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, {
    attachFieldsToBody: "keyValues",
    limits: { files: 0, fields: 40, fieldSize: 4096 },
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  app.decorateRequest("userId", null);
  app.setErrorHandler((err: any, req, reply) => {
    const status =
      err.code === "23505"
        ? 409
        : ["23514", "23502", "22001"].includes(err.code)
          ? 400
          : ["40001", "40P01", "ECONNREFUSED", "ETIMEDOUT"].includes(err.code)
            ? 503
            : (err.statusCode ?? 500);
    if (status >= 500 || ["23514", "23502", "22001"].includes(err.code))
      req.log.error(err);
    reply.code(status).send({
      status: "error",
      message:
        err.code === "23505"
          ? String(err.constraint ?? "").startsWith("categorias_")
            ? "Já existe uma categoria com esse nome e tipo."
            : String(err.constraint ?? "").includes("telegram")
              ? "Esse Telegram já está vinculado a outra conta."
              : "Email ou CPF já cadastrado."
          : status >= 500
            ? "Não foi possível concluir agora. Tente novamente; se persistir, contate o suporte."
            : // Erros do banco (campo obrigatório, tamanho, regra) sem detalhes técnicos.
              ["23514", "23502", "22001"].includes(err.code)
              ? "Algum dado não foi aceito. Confira os campos e tente novamente."
              : err.message,
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin");
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (options.production && req.protocol !== "https")
        throw new HttpError(426, "Use HTTPS para acessar o sistema publicado.");
      const origin = req.headers.origin;
      const expected = options.appOrigin ?? `${req.protocol}://${req.host}`;
      const allowed = [expected, ...(options.extraOrigins ?? [])];
      // Desenvolvimento: localhost, 127.0.0.1 e 10.0.2.2 (emulador) são o
      // mesmo computador; aceita qualquer um deles na mesma porta.
      if (!options.production) {
        const port = (() => {
          try {
            return new URL(expected).port;
          } catch {
            return "";
          }
        })();
        for (const host of ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"])
          allowed.push(`http://${host}${port ? ":" + port : ""}`);
      }
      if (
        req.headers["sec-fetch-site"] === "cross-site" ||
        (origin && !allowed.includes(origin))
      )
        throw new HttpError(403, "Origem não autorizada.");
    }
  });
  app.addHook("preHandler", async (req) => {
    const path = req.url.split("?")[0];
    if (
      !path.startsWith("/api/") ||
      [
        "/api/login",
        "/api/login/google",
        "/api/config/publica",
        "/api/cadastro/etapa1",
        "/api/health",
        "/api/senha/recuperar",
        "/api/senha/redefinir",
        "/api/telegram/webhook",
      ].includes(path)
    )
      return;
    const token = req.cookies.cashflow_session;
    if (!token) throw new HttpError(401, "Faça login para continuar.");
    const result = await db.query(
      "SELECT usuario_id FROM sessoes WHERE token_hash=$1 AND expira_em>NOW() AND ultima_atividade>NOW()-(CASE WHEN lembrar THEN INTERVAL '30 days' ELSE INTERVAL '30 minutes' END)",
      [digest(token)],
    );
    if (!result.rows[0])
      throw new HttpError(401, "Sessão expirada. Faça login novamente.");
    req.userId = result.rows[0].usuario_id;
  });
  const body = (req: FastifyRequest): Record<string, any> => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
      throw new HttpError(400, "Envie os campos do formulário.");
    return req.body as Record<string, any>;
  };
  const remembered = (value: unknown) =>
    [true, "true", "on", "1"].includes(value as any);
  // "Lembrar de mim": sessão de 30 dias que sobrevive ao fechar o app/navegador.
  // Sem ele: cookie de sessão do navegador e encerramento após 30 min parado.
  const newSession = async (
    req: FastifyRequest,
    reply: FastifyReply,
    userId: number,
    remember = false,
  ) => {
    if (req.cookies.cashflow_session)
      await db.query("DELETE FROM sessoes WHERE token_hash=$1", [
        digest(req.cookies.cashflow_session),
      ]);
    await db.query("DELETE FROM sessoes WHERE expira_em<=NOW()");
    const token = randomBytes(32).toString("hex");
    await db.query(
      `INSERT INTO sessoes(token_hash,usuario_id,expira_em,lembrar) VALUES($1,$2,NOW()+INTERVAL '${remember ? "30 days" : "7 days"}',$3)`,
      [digest(token), userId, remember],
    );
    reply.setCookie("cashflow_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: options.production ?? false,
      ...(remember ? { maxAge: 30 * 24 * 3600 } : {}),
    });
  };
  const updateUser = async (userId: number, values: Record<string, any>) => {
    const keys = Object.keys(values);
    if (!keys.length) throw new HttpError(400, "Nenhum campo enviado.");
    await userDatabase(db, userId).transaction(async (tx) => {
      await tx.query(
        `UPDATE usuarios SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${keys.length + 1}`,
        [...Object.values(values), userId],
      );
      if (keys.includes("gasto_maximo")) await scheduleAlerts(tx, userId);
    });
  };
  app.get("/api/health", async () => {
    await db.query("SELECT 1");
    return success();
  });
  app.post(
    "/api/cadastro/etapa1",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = body(req);
      if (![true, "true", "on", "1"].includes(b.consentimento))
        throw new HttpError(
          400,
          "Leia e aceite o aviso de privacidade para criar sua conta.",
        );
      const password = strongPassword(b.senha);
      if (b.senha !== b.confirmar_senha)
        throw new HttpError(400, "As senhas não coincidem.");
      const r = await db.query(
        "INSERT INTO usuarios(nome,cpf,nascimento,telefone,email,senha,etapa,consentimento_em,consentimento_versao) VALUES($1,$2,$3,$4,$5,$6,1,NOW(),'2026-11-v1') RETURNING id",
        [
          text(b.nome, "nome"),
          b.cpf ? text(b.cpf, "cpf", 20) : null,
          b.nascimento ? date(b.nascimento, "nascimento") : null,
          b.telefone ? text(b.telefone, "telefone", 40) : null,
          email(b.email),
          await bcrypt.hash(password, 12),
        ],
      );
      await newSession(req, reply, r.rows[0].id);
      return success({ message: "Etapa 1 concluída!" });
    },
  );
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = body(req);
      const r = await db.query(
        "SELECT id,nome,senha FROM usuarios WHERE lower(email)=$1 LIMIT 1",
        [email(b.email)],
      );
      const user = r.rows[0];
      const hash = user?.senha?.replace(/^\$2y\$/, "$2b$");
      text(b.senha, "senha", 1024);
      const pass = b.senha;
      // Dummy bcrypt evita uma resposta instantânea quando o email não existe.
      const valid = await bcrypt.compare(
        pass,
        hash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5Pj5eKKxfamc4O2JXXiZpaAKw1nwS7e",
      );
      if (!user || !valid)
        throw new HttpError(401, "Email ou senha inválidos.");
      await newSession(req, reply, user.id, remembered(b.lembrar));
      return success({
        lembrar: remembered(b.lembrar),
        message: "Login realizado com sucesso!",
        usuario_id: user.id,
        username: user.nome,
      });
    },
  );
  app.get("/api/config/publica", async () =>
    success({ googleClientId: options.googleClientId ?? null }),
  );
  app.post(
    "/api/login/google",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!options.verifyGoogle)
        throw new HttpError(
          503,
          "O login com Google ainda não foi configurado neste servidor.",
        );
      const b = body(req);
      const profile = await options.verifyGoogle(
        text(b.credential, "credencial Google", 4096),
      );
      const found = (
        await db.query(
          "SELECT id,google_sub FROM usuarios WHERE google_sub=$1 OR lower(email)=$2 ORDER BY (google_sub=$1) DESC NULLS LAST LIMIT 1",
          [profile.sub, profile.email],
        )
      ).rows[0];
      let userId: number,
        novo = false;
      if (found) {
        userId = found.id;
        // Conta existente com o mesmo email verificado: vincula ao Google.
        if (!found.google_sub)
          await db.query("UPDATE usuarios SET google_sub=$1 WHERE id=$2", [
            profile.sub,
            userId,
          ]);
      } else {
        if (![true, "true", "on", "1"].includes(b.consentimento)) {
          reply.code(409);
          return {
            status: "consent_required",
            message:
              "Ainda não existe conta com esse Google. Aceite os termos para criar sua conta.",
            nome: profile.name,
            email: profile.email,
          };
        }
        const r = await db.query(
          "INSERT INTO usuarios(nome,email,google_sub,etapa,consentimento_em,consentimento_versao) VALUES($1,$2,$3,1,NOW(),'2026-11-v1') RETURNING id",
          [profile.name.slice(0, 255), profile.email, profile.sub],
        );
        userId = r.rows[0].id;
        novo = true;
      }
      await newSession(req, reply, userId, remembered(b.lembrar));
      return success({
        message: novo
          ? "Conta criada com Google!"
          : "Login realizado com sucesso!",
        novo,
        // Conta nova segue o cadastro normal pelo endereço (etapa 2, opcional).
        proxima: novo
          ? "/CashFlow_Tela_de_Cadastro/endereco.html"
          : "/CashFlow_Tela_HomePage/home.html",
      });
    },
  );
  app.post("/api/logout", async (req, reply) => {
    await db.query("DELETE FROM sessoes WHERE token_hash=$1", [
      digest(req.cookies.cashflow_session!),
    ]);
    reply.clearCookie("cashflow_session", { path: "/" });
    return success({ message: "Sessão encerrada." });
  });
  app.post("/api/cadastro/etapa2", async (req) => {
    const b = body(req),
      values: Record<string, any> = {};
    for (const key of ["cep", "logradouro", "bairro", "cidade", "estado"])
      values[key] = b[key]
        ? text(b[key], key, key === "estado" ? 2 : key === "cep" ? 20 : 255)
        : null;
    for (const key of ["complemento", "tipo_residencia", "tempo_residencia"])
      if (b[key] !== undefined) values[key] = String(b[key]).slice(0, 255);
    if (values.estado) values.estado = values.estado.toUpperCase();
    values.etapa = 2;
    await updateUser(req.userId!, values);
    return success({ message: "Endereço salvo com sucesso!" });
  });
  app.post("/api/cadastro/etapa3", async (req) => {
    const b = body(req);
    await updateUser(req.userId!, {
      renda: money(b.renda || "0", "renda"),
      despesas: money(b.despesas || "0", "despesas"),
      menor_18: ["true", "1", "on", true].includes(b.menor_18),
      tipo_investimento: b.tipo_investimento
        ? text(b.tipo_investimento, "tipo_investimento")
        : null,
      faixa_investimento: b.faixa_investimento
        ? text(b.faixa_investimento, "faixa_investimento")
        : null,
      etapa: 3,
    });
    return success({ message: "Cadastro concluído!" });
  });
  app.get("/api/perfil", async (req) => {
    const r = await userDatabase(db, req.userId!).query(
      `SELECT ${profileFields.map((k) => (k === "nascimento" ? "to_char(nascimento,'YYYY-MM-DD') AS nascimento" : k)).join(",")} FROM usuarios WHERE id=$1`,
      [req.userId],
    );
    if (!r.rows[0]) throw new HttpError(404, "Usuário não encontrado.");
    return success({ dados: r.rows[0] });
  });
  app.post("/api/perfil", async (req) => {
    const b = body(req),
      values: Record<string, any> = {};
    for (const key of profileFields) {
      if (b[key] === undefined || key === "consentimento_em") continue;
      if (key === "preferencias") {
        let p = b[key];
        try {
          if (typeof p === "string") p = JSON.parse(p);
        } catch {
          throw new HttpError(400, "Preferências inválidas.");
        }
        if (!p || typeof p !== "object" || Array.isArray(p))
          throw new HttpError(400, "Preferências inválidas.");
        let theme =
          p.theme ??
          ({ automatico: "system", claro: "light", escuro: "dark" } as any)[
            p.tema
          ] ??
          "system";
        if (theme === "auto") theme = "system";
        if (!["system", "light", "dark"].includes(theme))
          throw new HttpError(400, "Tema inválido.");
        const prefs: any = { theme };
        for (const [field, alias] of [
          ["contrast", "contraste"],
          ["brightness", "brilho"],
          ["fontScale", "fonte"],
        ]) {
          const n = Number(p[field] ?? p[alias] ?? 100);
          if (
            !Number.isFinite(n) ||
            n < (field === "fontScale" ? 80 : 50) ||
            n > 150
          )
            throw new HttpError(
              400,
              "Ajuste visual fora do intervalo permitido.",
            );
          prefs[field] = n;
        }
        prefs.highContrast = !!(p.highContrast ?? p.altoContraste);
        values[key] = JSON.stringify(prefs);
        continue;
      }
      if (["renda", "despesas", "gasto_maximo"].includes(key))
        values[key] =
          b[key] === "" && key !== "gasto_maximo"
            ? null
            : money(b[key] === "" ? "0" : b[key], key);
      else if (key === "email") values[key] = email(b[key]);
      else if (key === "nascimento")
        values[key] = b[key] ? date(b[key], key) : null;
      else if (key === "nome") values[key] = text(b[key], key);
      else {
        if (
          typeof b[key] !== "string" ||
          b[key].length >
            ((
              { cpf: 20, telefone: 40, cep: 20, estado: 2 } as Record<
                string,
                number
              >
            )[key] ?? 255)
        )
          throw new HttpError(400, `Campo ${key} inválido.`);
        values[key] = b[key].trim();
      }
    }
    if (values.estado && values.estado.length !== 2)
      throw new HttpError(400, "UF inválida.");
    await updateUser(req.userId!, values);
    return success({ message: "Dados atualizados com sucesso!" });
  });
  app.get("/api/config/gastos", async (req) => {
    const r = await userDatabase(db, req.userId!).query(
      "SELECT gasto_maximo FROM usuarios WHERE id=$1",
      [req.userId],
    );
    return success({ gasto_maximo: Number(r.rows[0]?.gasto_maximo ?? 0) });
  });
  app.post("/api/config/gastos", async (req) => {
    const value = money(body(req).gasto_maximo, "gasto_maximo");
    await updateUser(req.userId!, { gasto_maximo: value });
    return success({
      message: "Gasto máximo atualizado.",
      gasto_maximo: Number(value),
    });
  });
  app.get("/api/transacoes", async (req) => {
    const r = await userDatabase(db, req.userId!).query(
      "SELECT id,descricao AS description,valor AS amount,categoria AS category,tipo AS type,to_char(data_transacao,'YYYY-MM-DD') AS date FROM transacoes WHERE usuario_id=$1 ORDER BY data_transacao DESC,id DESC",
      [req.userId],
    );
    return success({
      transactions: r.rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
      })),
    });
  });
  app.post("/api/transacoes", async (req) =>
    saveTransaction(db, req.userId!, {
      ...body(req),
      idempotency_key:
        body(req).idempotency_key ?? req.headers["idempotency-key"],
    }),
  );
  app.post("/api/transacoes/excluir", async (req) => {
    const r = await userDatabase(db, req.userId!).query(
      "DELETE FROM transacoes WHERE id=$1 AND usuario_id=$2 RETURNING id",
      [id(body(req).id), req.userId],
    );
    if (!r.rows.length) throw new HttpError(404, "Transação não encontrada.");
    return success({ message: "Transação excluída." });
  });
  app.post("/api/transacoes/limpar", async (req) => {
    await userDatabase(db, req.userId!).query(
      "DELETE FROM transacoes WHERE usuario_id=$1",
      [req.userId],
    );
    return success({ message: "Todas as transações foram removidas." });
  });
  await requirementsRoutes(app, db, options);
  await app.register(staticFiles, {
    root: fileURLToPath(new URL("../public", import.meta.url)),
    dotfiles: "deny",
  });
  app.setNotFoundHandler((_req, reply) =>
    reply
      .code(404)
      .send({ status: "error", message: "Página ou rota não encontrada." }),
  );
  return app;
}
