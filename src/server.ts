import "dotenv/config";
import { buildApp } from "./app.js";
import { connectDatabase } from "./db.js";
import { resetSender } from "./integrations/mail.js";
import { firebaseGoogleVerifier, loadFirebaseConfig } from "./integrations/firebase.js";
<<<<<<< HEAD
import { firebaseTokenVerifier, loadFirebaseWebConfig } from "./integrations/firebase-web.js";
=======
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
import { TelegramService } from "./integrations/telegram.js";
import { saveTransaction, monthlySummary } from "./services/finance.js";
import { startWorkers } from "./services/worker.js";
const db = connectDatabase();
const firebase = loadFirebaseConfig();
<<<<<<< HEAD
const firebaseWeb = loadFirebaseWebConfig();
if (firebaseWeb.projectId !== firebase.projectId) throw new Error("Os apps Firebase Web e Android precisam usar o mesmo projeto.");
=======
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
const app = await buildApp(db, {
  logger: true,
  production: process.env.NODE_ENV === "production",
  appOrigin: process.env.APP_ORIGIN,
  extraOrigins: (process.env.APP_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  googleClientId: firebase.clientId,
  verifyGoogle: firebaseGoogleVerifier(firebase),
<<<<<<< HEAD
  verifyFirebase: firebaseTokenVerifier(firebase.projectId),
  firebaseWebConfig: firebaseWeb,
=======
>>>>>>> d9bf11a4561965d4e81f4674fbd3672dba96aef6
  sendReset: resetSender(),
  telegramSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
});
let stopWorkers = async () => {};
let telegram: TelegramService | undefined;
app.addHook("onClose", async () => {
  await stopWorkers();
  await db.end();
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
try {
  const ready = await db.query(
    "SELECT to_regclass('public.sessoes') AS sessoes,to_regclass('public.operacoes') AS operacoes",
  );
  if (!ready.rows[0]?.sessoes || !ready.rows[0]?.operacoes)
    throw new Error(
      "Estrutura desatualizada. Execute npm run db:migrate antes de iniciar.",
    );
  if (process.env.TELEGRAM_BOT_TOKEN) {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET)
      throw new Error(
        "Configure TELEGRAM_WEBHOOK_SECRET junto com TELEGRAM_BOT_TOKEN.",
      );
    telegram = new TelegramService({
      db,
      token: process.env.TELEGRAM_BOT_TOKEN,
      record: (uid, input) => saveTransaction(db, uid, input),
      summary: (uid) => monthlySummary(db, uid),
    });
  } else
    app.log.warn(
      "Telegram desativado: configure TELEGRAM_BOT_TOKEN e webhook para habilitar.",
    );
  stopWorkers = startWorkers(db, telegram);
  if (!process.env.SMTP_HOST)
    app.log.warn(
      process.env.NODE_ENV === "production"
        ? "Recuperação por email pendente de configuração SMTP."
        : "SMTP não configurado: os links de recuperação de senha aparecerão neste terminal.",
    );
  await app.listen({
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "127.0.0.1",
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
