/* Єдина точка входу до Firebase: ініціалізація + реекспорт потрібних функцій.
   Усі інші модулі імпортують Firebase лише звідси. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

export {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

export {
  doc, setDoc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfsfF3nLzqaAJTAfp73715efQhri-SOT8",
  authDomain: "my-salary-9ea25.firebaseapp.com",
  projectId: "my-salary-9ea25",
  storageBucket: "my-salary-9ea25.firebasestorage.app",
  messagingSenderId: "412323283290",
  appId: "1:412323283290:web:b4706af670a57776333363"
};

/* Окремий екземпляр Firebase на кожен підключений профіль (js/profiles.js, поле cloud.appName). getAuth() зберігає сесію
   на пристрої окремо для кожного appName, тож вхід і вихід в одному екземплярі не чіпають інші. DEFAULT_APP — екземпляр
   за замовчуванням: ним користувалися версії до 1.21.0 (з нього переноситься наявний вхід). */
export const DEFAULT_APP = '[DEFAULT]';
const instances = new Map();
export function instance(appName = DEFAULT_APP) {
  let found = instances.get(appName);
  if (!found) {
    const app = appName === DEFAULT_APP ? initializeApp(firebaseConfig) : initializeApp(firebaseConfig, appName);
    found = { auth: getAuth(app), db: getFirestore(app) };
    instances.set(appName, found);
  }
  return found;
}
