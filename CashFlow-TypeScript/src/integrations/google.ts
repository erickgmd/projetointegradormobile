import { OAuth2Client } from "google-auth-library";
import { HttpError } from "../validation.js";

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}
export type GoogleVerifier = (credential: string) => Promise<GoogleProfile>;

// Confere o ID token emitido pelo Google (botão web ou login nativo do Android).
// O "aud" precisa ser o Client ID Web configurado em GOOGLE_CLIENT_ID.
export function googleVerifier(clientId?: string): GoogleVerifier | undefined {
  if (!clientId) return undefined;
  const client = new OAuth2Client(clientId);
  return async (credential) => {
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new HttpError(401, "Não foi possível confirmar sua conta Google.");
    }
    if (!payload?.sub || !payload.email || payload.email_verified === false)
      throw new HttpError(401, "A conta Google não tem email verificado.");
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split("@")[0],
    };
  };
}
