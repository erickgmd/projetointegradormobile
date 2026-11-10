// Bundled locally by scripts/vendor.mjs. No Analytics or localStorage tokens.
import { initializeApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

let auth;
window.CashFlowFirebase = {
  initialize(config) {
    if (!auth) auth = initializeAuth(initializeApp(config), { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  },
  async signIn() {
    if (!auth) throw new Error("Firebase Web não inicializado.");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await signInWithPopup(auth, provider);
      return await result.user.getIdToken();
    } finally {
      // A sessão de aplicação continua sendo o cookie HttpOnly do CashFlow.
      await signOut(auth).catch(() => {});
    }
  },
};
