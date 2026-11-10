import test from "node:test";
import assert from "node:assert/strict";
import {
  brazilToday,
  extractReceipt,
  parseTransaction,
} from "../src/integrations/receipt.js";
import { TelegramService } from "../src/integrations/telegram.js";
test("extrai comprovante brasileiro e classifica sem aceitar data inválida", () => {
  assert.deepEqual(
    extractReceipt(
      "SUPERMERCADO BOM\nCNPJ 11.111.111/0001-11\n04/11/2026\nTOTAL A PAGAR R$ 1.234,56",
    ),
    {
      description: "SUPERMERCADO BOM",
      amount: "1234.56",
      date: "2026-11-04",
      category: "alimentacao",
    },
  );
  assert.equal(extractReceipt("LOJA TESTE\n31/02/2026\nTOTAL 10,00"), null);
  assert.equal(extractReceipt("LOJA TESTE\n04/11/2026\nPRODUTO 10,00"), null);
});
test("parser aceita receita/despesa e rejeita zero", () => {
  assert.equal(parseTransaction("receita salario 1000,50")?.type, "income");
  assert.equal(
    parseTransaction("despesa mercado 30,00")?.category,
    "alimentacao",
  );
  assert.equal(parseTransaction("/despesa posto 130,50")?.amount, "130.50");
  assert.equal(parseTransaction("despesa nada 0"), null);
});
function setup(rows: any[] = [{ usuario_id: 7 }]) {
  const queries: { sql: string; params: any[] | undefined }[] = [];
  const messages: any[] = [];
  const records: any[] = [];
  const db = {
    async transaction(fn: any) {
      return fn(this);
    },
    async query(sql: string, params?: any[]) {
      queries.push({ sql, params });
      return { rows, rowCount: rows.length };
    },
  };
  const service = new TelegramService({
    db,
    token: "test",
    fetcher: (async (_url: any, init: any) => {
      messages.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }) as typeof fetch,
    record: async (...args) => {
      records.push(args);
    },
    summary: async () => ({ balance: 50 }),
  });
  return { service, queries, messages, records };
}
test("comando registrado com chave idempotente e chats de grupo ignorados", async () => {
  const s = setup();
  await s.service.handle({
    update_id: 42,
    message: {
      message_id: 1,
      from: { id: 8 },
      chat: { id: 8, type: "private" },
      text: "despesa mercado 30,00",
    },
  });
  assert.equal(s.records.length, 1);
  assert.equal(s.records[0][1].idempotency_key, "telegram:42");
  await s.service.handle({
    message: {
      from: { id: 8 },
      chat: { id: -1, type: "group" },
      text: "despesa mercado 30,00",
    },
  });
  assert.equal(s.records.length, 1);
});
test("vínculo exige nome do remetente real, hash, validade e consumo atômico", async () => {
  const s = setup();
  await s.service.handle({
    message: {
      from: { id: 8, username: "RealUser" },
      chat: { id: 8, type: "private" },
      text: "/start 1234567890123456",
    },
  });
  assert.equal(s.queries[0].params?.[2], "realuser");
  assert.equal(s.queries[0].params?.[1].length, 64);
  assert.match(s.queries[0].sql, /usado_em IS NULL AND expira_em>NOW/);
});
test("falha ao registrar comprovante mantém pendência para nova confirmação", async () => {
  const queries: string[] = [];
  const service = new TelegramService({
    db: {
      async transaction(fn: any) {
        return fn(this);
      },
      async query(sql) {
        queries.push(sql);
        return {
          rows: sql.startsWith("SELECT usuario_id")
            ? [{ usuario_id: 7 }]
            : [
                {
                  id: 3,
                  descricao: "Mercado",
                  valor: "30",
                  categoria: "alimentacao",
                  data_transacao: "2026-11-04",
                },
              ],
          rowCount: 1,
        };
      },
    },
    token: "test",
    record: async () => {
      throw new Error("banco indisponível");
    },
    summary: async () => ({}),
  });
  await assert.rejects(
    service.handle({
      callback_query: {
        from: { id: 8 },
        message: { chat: { id: 8, type: "private" } },
        data: "confirmar:3",
      },
    }),
    /indisponível/,
  );
  assert.equal(
    queries.some((sql) => sql.startsWith("UPDATE ocr_pendencias")),
    false,
  );
});
test("OCR pede confirmação, não guarda texto bruto nem imagem e limpa buffer", async () => {
  let ocrImage: Uint8Array | undefined;
  const queries: { sql: string; params?: any[] }[] = [];
  const sent: any[] = [];
  let records = 0;
  const service = new TelegramService({
    token: "test",
    db: {
      async transaction(fn: any) {
        return fn(this);
      },
      async query(sql, params) {
        queries.push({ sql, params });
        return {
          rows: sql.startsWith("SELECT usuario_id")
            ? [{ usuario_id: 7 }]
            : [{ id: 20 }],
          rowCount: 1,
        };
      },
    },
    fetcher: (async (url: any, init: any) => {
      if (String(url).includes("/file/bot"))
        return new Response(new Uint8Array([1, 2, 3]));
      const body = JSON.parse(init.body);
      if (String(url).endsWith("/getFile"))
        return new Response(
          JSON.stringify({
            ok: true,
            result: { file_path: "photos/receipt.jpg" },
          }),
        );
      sent.push(body);
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }) as typeof fetch,
    ocr: async (image) => {
      ocrImage = image;
      return "MERCADO LEGAL\n04/11/2026\nTOTAL R$ 30,00";
    },
    record: async () => {
      records++;
    },
    summary: async () => ({}),
  });
  await service.handle({
    update_id: 3,
    message: {
      message_id: 5,
      from: { id: 8 },
      chat: { id: 8, type: "private" },
      photo: [{ file_id: "fake", file_size: 3 }],
    },
  });
  assert.equal(records, 0);
  assert.deepEqual([...ocrImage!], [0, 0, 0]);
  const inserted = queries.find((q) =>
    q.sql.startsWith("INSERT INTO ocr_pendencias"),
  )!;
  assert.match(inserted.sql, /NULL/);
  assert.equal(
    inserted.params?.includes("MERCADO LEGAL\n04/11/2026\nTOTAL R$ 30,00"),
    false,
  );
  assert.equal(
    sent[0].reply_markup.inline_keyboard[0][0].callback_data,
    "confirmar:20",
  );
});

test("data dos comandos segue São Paulo na virada UTC", () => {
  assert.equal(brazilToday(new Date("2026-11-05T01:30:00Z")), "2026-11-04");
  assert.equal(parseTransaction("receita salário 500,00")?.category, "salario");
  assert.equal(
    parseTransaction("receita presente 500,00")?.category,
    "outros-receitas",
  );
});
test("saldo é apresentado em português e callback remove spinner", async () => {
  const s = setup();
  await s.service.handle({
    update_id: 42,
    message: {
      from: { id: 8 },
      chat: { id: 8, type: "private" },
      text: "/saldo",
    },
  });
  assert.match(s.messages[0].text, /Saldo: R\$\s*50,00/);
  assert.match(s.messages[0].text, /Gasto máximo:/);
  await s.service.handle({
    callback_query: {
      id: "callback-1",
      from: { id: 8 },
      message: { chat: { id: 8, type: "private" } },
      data: "invalido",
    },
  });
  assert.equal(s.messages[1].callback_query_id, "callback-1");
});
