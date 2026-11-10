import { test } from "node:test";
import assert from "node:assert/strict";
import { firebaseGoogleVerifier } from "../src/integrations/firebase.js";
const profile = { sub: "google-123", email: "teste@example.com", name: "Teste" };
const config = { projectId: "test-project", apiKey: "test-key", clientId: "test-client", requestUri: "https://example.com" };
test("Firebase preserves existing Google identity after verified exchange", async () => {
  let checked = false;
  const verify = firebaseGoogleVerifier(config, {
    verifyGoogle: async () => { checked = true; return profile; },
    fetch: async (url, init) => {
      assert.ok(checked);
      assert.match(String(url), /identitytoolkit.googleapis.com/);
      const body = JSON.parse(String(init?.body));
      assert.equal(new URLSearchParams(body.postBody).get("providerId"), "google.com");
      assert.equal(new URLSearchParams(body.postBody).get("id_token"), "google-token");
      return new Response(JSON.stringify({ localId: "firebase-uid", email: profile.email, providerId: "google.com", idToken: "firebase-token" }));
    },
  });
  assert.deepEqual(await verify("google-token"), profile);
});
test("Invalid Google credentials never reach Firebase", async () => {
  const verify = firebaseGoogleVerifier(config, {
    verifyGoogle: async () => { throw new Error("invalid"); },
    fetch: async () => { assert.fail("must not call Firebase"); },
  });
  await assert.rejects(verify("invalid"));
});
test("Firebase errors, incomplete responses and identity mismatch fail closed", async () => {
  for (const response of [new Response("{}", { status: 400 }), new Response("{}"), new Response(JSON.stringify({localId:"uid", idToken:"token", providerId:"google.com", email:"other@example.com"}))]) {
    const verify = firebaseGoogleVerifier(config, { verifyGoogle: async () => profile, fetch: async () => response });
    await assert.rejects(verify("google-token"));
  }
});
test("Incomplete Firebase configuration fails at startup", () => {
  assert.throws(() => firebaseGoogleVerifier({ ...config, apiKey: "" }));
});
