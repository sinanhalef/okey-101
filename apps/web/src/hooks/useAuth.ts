import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth, authReady } from '../firebase';

export function useAuth(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let unsub = () => {};
    authReady.then(() => {
      unsub = onAuthStateChanged(auth, (u) => {
        if (u) { setUser(u); setReady(true); }
        else signInAnonymously(auth).catch((e) => { console.error(e); setReady(true); });
      });
    });
    return () => unsub();
  }, []);
  return { user, ready };
}

const NAME_KEY = 'okey101.name';
export function getStoredName(): string {
  try {
    const s = sessionStorage.getItem(NAME_KEY);
    if (s) return s;
    const n = `Misafir-${Math.floor(1000 + Math.random() * 9000)}`;
    sessionStorage.setItem(NAME_KEY, n);
    return n;
  } catch { return 'Misafir'; }
}
export function setStoredName(n: string) { try { sessionStorage.setItem(NAME_KEY, n); } catch {} }
