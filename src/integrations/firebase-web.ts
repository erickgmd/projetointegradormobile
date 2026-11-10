import { readFileSync } from "node:fs";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { GoogleVerifier } from "./google.js";
import { HttpError } from "../validation.js";

export function loadFirebaseWebConfig(): Record<string, string> {
  return JSON.parse(readFileSync(new URL("../../config/firebase-web.json", import.meta.url), "utf8"));
}

// Admin SDK validates signature, expiry, issuer and audience using Google's public keys.
// No admin account mutations or revocation checks: projectId is explicit.
export function firebaseTokenVerifier(
  projectId: string,
  decode?: (token: string) => Promise<any>,
): GoogleVerifier {
  if (!projectId) throw new Error("Firebase projectId obrigatório.");
  const appName = `cashflow-auth-${projectId}`;
  const app = decode ? undefined : (getApps().find(a => a.name === appName) || initializeApp({ projectId }, appName));
  const verify = decode || ((token: string) => getAuth(app!).verifyIdToken(token));
  return async (credential) => {
    let claims;
    try { claims = await verify(credential); }
    catch { throw new HttpError(401, "Sua autenticação Firebase não é válida ou expirou. Entre novamente."); }
    const googleSub = claims.firebase?.identities?.["google.com"]?.[0];
    if (claims.firebase?.sign_in_provider !== "google.com" || claims.email_verified !== true ||
        typeof googleSub !== "string" || !googleSub || typeof claims.email !== "string" || !claims.email)
      throw new HttpError(401, "É necessário entrar com uma conta Google de email verificado.");
    return { sub: googleSub, email: claims.email.toLowerCase(), name: claims.name || claims.email.split("@")[0] };
  };
}
