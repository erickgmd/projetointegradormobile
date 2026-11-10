import { readFileSync } from "node:fs";
import { googleVerifier, type GoogleVerifier } from "./google.js";
import { HttpError } from "../validation.js";

export interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  clientId: string;
  requestUri: string;
}

// Apenas configuração pública de cliente. Nunca carregar uma service-account aqui.
export function loadFirebaseConfig(): FirebaseConfig {
  let saved: Partial<FirebaseConfig> = {};
  try {
    saved = JSON.parse(readFileSync(new URL("../../config/firebase.json", import.meta.url), "utf8"));
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || saved.projectId || "",
    apiKey: process.env.FIREBASE_API_KEY || saved.apiKey || "",
    clientId: process.env.FIREBASE_WEB_CLIENT_ID || saved.clientId || "",
    requestUri: process.env.APP_ORIGIN || saved.requestUri || "",
  };
}

/**
 * Google fornece a credencial (GIS web ou seletor nativo Capacitor).
 * Firebase Authentication autentica/cria o usuário via signInWithIdp.
 * A sessão HTTP e o google_sub originais preservam os dados financeiros.
 * Refresh tokens Firebase nunca são armazenados ou enviados ao navegador.
 */
export function firebaseGoogleVerifier(
  config: FirebaseConfig,
  dependencies: { verifyGoogle?: GoogleVerifier; fetch?: typeof fetch } = {},
): GoogleVerifier {
  if (!config.projectId || !config.apiKey || !config.clientId || !config.requestUri)
    throw new Error("Firebase incompleto. Execute npm run firebase:configure ou configure FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_WEB_CLIENT_ID e APP_ORIGIN.");
  const origin = new URL(config.requestUri).origin;
  const verify = dependencies.verifyGoogle || googleVerifier(config.clientId)!;
  const request = dependencies.fetch || fetch;
  return async (credential) => {
    const profile = await verify(credential);
    let response: Response;
    try {
      response = await request(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(config.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postBody: new URLSearchParams({ id_token: credential, providerId: "google.com" }).toString(),
            requestUri: origin,
            returnSecureToken: true,
            returnIdpCredential: false,
          }),
          signal: AbortSignal.timeout(12000),
        },
      );
    } catch {
      throw new HttpError(503, "Não foi possível conectar ao Firebase. Tente novamente.");
    }
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const code = (result.error as { message?: string } | undefined)?.message || "";
      if (/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND|API_KEY_INVALID|INVALID_API_KEY|PROJECT_NOT_FOUND/.test(code))
        throw new HttpError(503, "Login Google indisponível: confira o provedor Google e a configuração do Firebase no servidor.");
      throw new HttpError(401, "O Firebase não autorizou o login Google. Confira a conta e tente novamente.");
    }
    if (result.needConfirmation || result.providerId !== "google.com" ||
        typeof result.localId !== "string" || !result.localId ||
        typeof result.idToken !== "string" || !result.idToken ||
        typeof result.email !== "string" || result.email.toLowerCase() !== profile.email)
      throw new HttpError(401, "Não foi possível confirmar a identidade no Firebase.");
    return profile;
  };
}
