import "dotenv/config";
const token = process.env.TELEGRAM_BOT_TOKEN,
  secret = process.env.TELEGRAM_WEBHOOK_SECRET,
  origin = process.env.APP_ORIGIN;
if (!token || !secret || !origin?.startsWith("https://"))
  throw new Error(
    "Configure TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e APP_ORIGIN HTTPS.",
  );
const response = await fetch(
  `https://api.telegram.org/bot${token}/setWebhook`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: new URL("/api/telegram/webhook", origin).toString(),
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(10000),
  },
);
const body = (await response.json()) as any;
if (!response.ok || !body.ok)
  throw new Error(
    "Não foi possível configurar o webhook. Confira token, HTTPS e domínio.",
  );
console.log("Webhook configurado. Envie /start ao seu bot no Telegram.");
