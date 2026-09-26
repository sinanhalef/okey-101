import { initializeApp } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const app = initializeApp({
  apiKey: 'YOUR_FIREBASE_WEB_API_KEY',
  authDomain: 'okey101-ce391.firebaseapp.com',
  projectId: 'okey101-ce391',
  storageBucket: 'okey101-ce391.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_FIREBASE_APP_ID',
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');

// Session persistence: each browser tab is its own guest (handy for testing with 4 tabs).
export const authReady = setPersistence(auth, browserSessionPersistence);

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
  connectFunctionsEmulator(functions, '127.0.0.1', 5101);
}
