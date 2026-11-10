import type { CapacitorConfig } from "@capacitor/cli";

// Endereço do servidor CashFlow que o aplicativo vai abrir.
// Emulador do Android Studio: http://10.0.2.2:3001 (10.0.2.2 é o computador visto pelo emulador).
// Celular físico via USB com "adb reverse tcp:3001 tcp:3001": CASHFLOW_URL=http://localhost:3001
// Produção: o domínio HTTPS publicado, ex.: CASHFLOW_URL=https://cashflow.seudominio.com.br
const serverUrl = process.env.CASHFLOW_URL ?? "https://projetointegradormobile.onrender.com";

const config: CapacitorConfig = {
  appId: "com.Cashflow",
  appName: "CashFlow",
  webDir: "www",
  server: {
    url: serverUrl,
    // Permite http apenas no teste local. Em produção use https.
    cleartext: serverUrl.startsWith("http://"),
    // Página exibida quando o servidor não responde.
    errorPath: "erro.html",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
