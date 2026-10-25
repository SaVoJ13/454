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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
