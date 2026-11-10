import { test } from "node:test";
import assert from "node:assert/strict";
import { firebaseTokenVerifier } from "../src/integrations/firebase-web.js";
import { buildApp } from "../src/app.js";
import { testDatabase } from "./helpers.js";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";

const token = { uid: "firebase-user", email: "TESTE@example.com", email_verified: true, name: "Teste", firebase: { sign_in_provider: "google.com", identities: { "google.com": ["original-google-sub"] } } };
test("Firebase web maps verified Firebase identity back to the original Google account", async () => {
  const verify = firebaseTokenVerifier("test-project", async () => token);
  assert.deepEqual(await verify("firebase-token"), { sub: "original-google-sub", email: "teste@example.com", name: "Teste" });
});
test("Firebase web refuses unverified emails, other providers and missing Google identity", async () => {
  for (const invalid of [{ ...token, email_verified: false }, { ...token, firebase: { ...token.firebase, sign_in_provider: "password" } }, { ...token, firebase: { sign_in_provider: "google.com", identities: {} } }]) {
    const verify = firebaseTokenVerifier("test-project", async () => invalid);
    await assert.rejects(verify("token"));
  }
});
test("Firebase web converts invalid or expired token into 401", async () => {
  const verify = firebaseTokenVerifier("test-project", async () => { throw new Error("expired"); });
  await assert.rejects(verify("bad"), (error: any) => error.statusCode === 401);
});
test("Admin SDK refuses a malformed token without accepting decoded client data", async () => {
  await assert.rejects(firebaseTokenVerifier("cashflow-41beb")("not-a-jwt"), (e: any) => e.statusCode === 401);
});
test("Firebase web route reuses the Google account instead of creating a duplicate", async () => {
  const { pg, db } = await testDatabase();
  const profile = { sub: "google-existing", email: "same@example.com", name: "Existing" };
  const app = await buildApp(db, { verifyGoogle: async () => profile, verifyFirebase: async (value) => {
    assert.equal(value, "firebase-signed-token");
    return profile;
  }, firebaseWebConfig: { projectId: "test-project" } });
  try {
    const first = await app.inject({ method: "POST", url: "/api/login/google", payload: { credential: "google", consentimento: true } });
    assert.equal(first.statusCode, 200);
    const second = await app.inject({ method: "POST", url: "/api/login/google", payload: { credential: "firebase-signed-token", credentialType: "firebase" } });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().novo, false);
    assert.equal((await pg.query("select id from usuarios")).rows.length, 1);
    assert.equal((await app.inject("/api/config/publica")).json().firebaseWebConfig.projectId, "test-project");
  } finally { await app.close(); await pg.close(); }
});
test("Web UI loads Firebase and sends its token using the typed backend contract", async () => {
  const dom = new JSDOM('<div id="google"></div>', { url: "https://example.com", runScripts: "outside-only" });
  const win = dom.window as any;
  let sent: any;
  win.fetch = async (_url: string, init: any) => {
    if (init?.method === "POST") { sent = JSON.parse(init.body); return { json: async () => ({status:"success"}) }; }
    return { ok: true, json: async () => ({ firebaseWebConfig: {projectId:"test-project"} }) };
  };
  win.CashFlowFirebase = { initialize(config: any) { assert.equal(config.projectId,"test-project"); }, signIn: async () => "firebase-token" };
  win.eval(await readFile("public/auth-ui.js", "utf8"));
  let received: any;
  await win.CashFlowAuth.mountGoogleButton(win.document.getElementById("google"), { text:"signin", onCredential: (value: any) => {received = value;}, onError: (msg: string) => assert.fail(msg) });
  await win.document.querySelector("button").onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(received)), {type:"firebase",token:"firebase-token"});
  await win.CashFlowAuth.sendGoogleCredential(received, {lembrar:true});
  assert.equal(sent.credentialType,"firebase");
  assert.equal(sent.credential,"firebase-token");
  assert.equal(sent.lembrar,true);
  dom.window.close();
});
