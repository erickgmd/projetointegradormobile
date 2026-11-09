import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.js";
import { processUpdate, processNotification } from "../src/services/worker.js";
test("RNF018 webhook durável processa comando uma vez e apaga payload", async (t) => {
  const { db, pg } = await testDatabase();
  t.after(() => pg.close());
  await db.query(
    "INSERT INTO telegram_updates(update_id,payload) VALUES($1,$2)",
    [101, JSON.stringify({ update_id: 101, message: { text: "/saldo" } })],
  );
  let count = 0;
  const tg = {
    handle: async () => {
      count++;
    },
  } as any;
  assert.equal(await processUpdate(db, tg), true);
  assert.equal(await processUpdate(db, tg), false);
  assert.equal(count, 1);
  assert.deepEqual(
    (await db.query("select payload from telegram_updates")).rows[0].payload,
    {},
  );
});
test("RNF003 alertas em fila são marcados apenas após envio e têm retry", async (t) => {
  const { db, pg } = await testDatabase();
  t.after(() => pg.close());
  await db.query(
    "INSERT INTO usuarios(nome,email,senha) VALUES('Teste','alert@test.com','hash')",
  );
  await db.query(
    "INSERT INTO telegram_vinculos(usuario_id,telegram_id,nome_telegram,usado_em) VALUES(1,99,'erick',NOW())",
  );
  await db.query(
    "INSERT INTO notificacoes(usuario_id,mes,nivel,mensagem) VALUES(1,'2026-11',80,'Alerta80')",
  );
  let fail = true;
  let sent = 0;
  const tg = {
    send: async () => {
      if (fail) throw Error("offline");
      sent++;
    },
  } as any;
  assert.equal(await processNotification(db, tg), true);
  assert.equal(
    (await db.query("select entregue_em from notificacoes")).rows[0]
      .entregue_em,
    null,
  );
  fail = false;
  await db.query("UPDATE notificacoes SET proxima_tentativa=NOW()");
  await processNotification(db, tg);
  await processNotification(db, tg);
  assert.equal(sent, 1);
  assert.ok(
    (await db.query("select entregue_em from notificacoes")).rows[0]
      .entregue_em,
  );
});
