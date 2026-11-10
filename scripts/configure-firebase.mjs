import { readFile, mkdir, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const json = JSON.parse(await readFile(new URL("mobile/android/app/google-services.json", root), "utf8"));
const client = json.client?.find(c => c.client_info?.android_client_info?.package_name === "com.Cashflow");
if (!client) throw new Error("google-services.json precisa conter o pacote publicado com.Cashflow.");
const config = {
  projectId: json.project_info?.project_id,
  apiKey: client.api_key?.[0]?.current_key,
  clientId: client.oauth_client?.find(c => c.client_type === 3)?.client_id,
  requestUri: "https://projetointegradormobile.onrender.com",
};
if (!config.projectId || !config.apiKey || !config.clientId) throw new Error("Baixe novamente o JSON após ativar Google no Firebase: falta projeto, API key ou cliente Web (tipo 3).");
await mkdir(new URL("config/", root), { recursive: true });
await writeFile(new URL("config/firebase.json", root), JSON.stringify(config, null, 2) + "\n");
console.log("Configuração Firebase atualizada a partir do JSON Android, sem credenciais privadas.");
