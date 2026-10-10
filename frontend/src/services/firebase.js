import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, onIdTokenChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "smartdocs-svnit-6904c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "smartdocs-svnit-6904c",
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const authReady = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
    unsubscribe();
    resolve(user);
  });
});
onIdTokenChanged(firebaseAuth, async (user) => {
  try {
    window.dispatchEvent(new CustomEvent("smartdocs-firebase-token", {
      detail: user ? await user.getIdToken() : "",
    }));
  } catch {
    window.dispatchEvent(new CustomEvent("smartdocs-firebase-token", { detail: "" }));
  }
});
