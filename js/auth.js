import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { firebaseConfig } from "../firebase-config.js";

export const firebaseConfigured = !Object.values(firebaseConfig).some((value) => String(value).startsWith("ERSETZEN"));
export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseConfigured ? getAuth(app) : null;
export const db = firebaseConfigured ? getFirestore(app) : null;
export const storage = firebaseConfigured ? getStorage(app) : null;

export function waitForUser() {
  if (!auth) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

export async function ensureAnonymousAuth() {
  if (!firebaseConfigured) return null;
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  await setDoc(doc(db, "users", credential.user.uid), {
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp()
  }, { merge: true });
  return credential.user;
}

export async function refreshAdminState() {
  if (!auth?.currentUser) return false;
  const token = await auth.currentUser.getIdTokenResult(true);
  return token.claims.admin === true;
}
