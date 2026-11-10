import type { Database } from "../db.js";
import type { TelegramService } from "../integrations/telegram.js";
// As filas são duráveis. SKIP LOCKED permite múltiplos processos sem duplicar o claim.
export async function processUpdate(
  db: Database,
  telegram: TelegramService,
  kind: "command" | "ocr" = "command",
) {
  return db.transaction(async (tx) => {
    const r = await tx.query(
      `SELECT update_id,payload FROM telegram_updates WHERE processado_em IS NULL AND tentativas<5 AND proxima_tentativa<=NOW() AND (($1='ocr' AND COALESCE(payload->'message','{}'::jsonb) ? 'photo') OR ($1='command' AND NOT(COALESCE(payload->'message','{}'::jsonb) ? 'photo'))) ORDER BY update_id FOR UPDATE SKIP LOCKED LIMIT 1`,
      [kind],
    );
    if (!r.rows[0]) return false;
    const job = r.rows[0];
    try {
      await telegram.handle(job.payload);
      await tx.query(
        "UPDATE telegram_updates SET processado_em=NOW(),payload='{}'::jsonb,erro=FALSE WHERE update_id=$1",
        [job.update_id],
      );
    } catch {
      await tx.query(
        "UPDATE telegram_updates SET tentativas=tentativas+1,proxima_tentativa=NOW()+INTERVAL '10 seconds',erro=TRUE WHERE update_id=$1",
        [job.update_id],
      );
    }
    return true;
  });
}
export async function processNotification(
  db: Database,
  telegram: TelegramService,
) {
  return db.transaction(async (tx) => {
    const r = await tx.query(
      `SELECT n.id,n.mensagem,t.telegram_id FROM notificacoes n JOIN telegram_vinculos t ON t.usuario_id=n.usuario_id AND t.telegram_id IS NOT NULL AND t.usado_em IS NOT NULL WHERE n.entregue_em IS NULL AND n.proxima_tentativa<=NOW() ORDER BY n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1`,
    );
    const job = r.rows[0];
    if (!job) return false;
    try {
      await telegram.send(job.telegram_id, job.mensagem);
      await tx.query("UPDATE notificacoes SET entregue_em=NOW() WHERE id=$1", [
        job.id,
      ]);
    } catch {
      await tx.query(
        "UPDATE notificacoes SET tentativas=tentativas+1,proxima_tentativa=NOW()+INTERVAL '10 seconds' WHERE id=$1",
        [job.id],
      );
    }
    return true;
  });
}
export function startWorkers(db: Database, telegram?: TelegramService) {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const pending = new Set<Promise<any>>();
  const loop = (task: () => Promise<any>) => {
    const run = async () => {
      if (stopped) return;
      const job = task();
      pending.add(job);
      try {
        await job;
      } catch {
        console.error("Falha temporária na fila. Nova tentativa automática.");
      } finally {
        pending.delete(job);
      }
      if (!stopped) {
        const timer = setTimeout(run, 1000);
        timer.unref();
        timers.push(timer);
        if (timers.length > 100) timers.splice(0, timers.length - 10);
      }
    };
    void run();
  };
  // OCR em fila separada para não atrasar comandos simples.
  if (telegram) {
    for (let i = 0; i < 2; i++)
      loop(() => processUpdate(db, telegram, "command"));
    loop(() => processUpdate(db, telegram, "ocr"));
    loop(() => processNotification(db, telegram));
  }
  const cleanup = setInterval(() => {
    void db
      .transaction(async (tx) => {
        await tx.query(
          "DELETE FROM sessoes WHERE expira_em<=NOW() OR ultima_atividade<NOW()-(CASE WHEN lembrar THEN INTERVAL '30 days' ELSE INTERVAL '30 minutes' END)",
        );
        await tx.query("DELETE FROM recuperacoes_senha WHERE expira_em<=NOW()");
        await tx.query(
          "UPDATE telegram_vinculos SET token_hash=NULL,codigo_vinculo=NULL WHERE expira_em<=NOW() AND usado_em IS NULL",
        );
        await tx.query(
          "DELETE FROM ocr_pendencias WHERE expira_em<=NOW() OR confirmado_em IS NOT NULL",
        );
        await tx.query(
          "DELETE FROM telegram_updates WHERE criado_em<NOW()-INTERVAL '1 day'",
        );
      })
      .catch(() => console.error("Limpeza agendada pendente."));
  }, 60000);
  cleanup.unref();
  return async () => {
    stopped = true;
    clearInterval(cleanup);
    for (const timer of timers) clearTimeout(timer);
    await Promise.allSettled([...pending]);
  };
}
