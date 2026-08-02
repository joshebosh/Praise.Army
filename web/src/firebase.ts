import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Public web config for the shared `praisearmy-firebase` project.
// Firebase client configs are not secrets (the security boundary is
// Firestore rules + API key restrictions), so this is safe to ship
// in a public static bundle — same values already committed in
// joshua.tel/praise-army/frontend/.env.
const firebaseConfig = {
  apiKey: "AIzaSyAgiAULVgOLKSr1qaH7Q-8xdaFY3NnOnmE",
  authDomain: "praisearmy-firebase.firebaseapp.com",
  projectId: "praisearmy-firebase",
  storageBucket: "praisearmy-firebase.firebasestorage.app",
  messagingSenderId: "722614701503",
  appId: "1:722614701503:web:e3fe28989b44eda632250a",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
