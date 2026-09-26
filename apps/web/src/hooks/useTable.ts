import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import type { PrivateHandView, PublicMatchView } from '@okey101/engine';
import { parseHand, parseView, type HandDoc, type TableDoc } from '@okey101/shared';
import { db } from '../firebase';

export interface TableState {
  table: TableDoc | null;
  view: PublicMatchView | null;
  hand: PrivateHandView | null;
  missing: boolean;
  /** serverNow - clientNow estimate */
  offset: number;
}

export function useTable(tableId: string | undefined, uid: string | undefined): TableState {
  const [table, setTable] = useState<TableDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [handDoc, setHandDoc] = useState<HandDoc | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!tableId) return;
    const unsub = onSnapshot(doc(db, 'tables', tableId), (snap) => {
      if (!snap.exists()) { setMissing(true); setTable(null); return; }
      const d = snap.data() as TableDoc;
      setMissing(false);
      setTable(d);
      if (!snap.metadata.hasPendingWrites && d.serverNow) setOffset(d.serverNow - Date.now());
    }, (e) => console.error('table snapshot', e));
    return unsub;
  }, [tableId]);

  useEffect(() => {
    if (!tableId || !uid) return;
    const unsub = onSnapshot(doc(db, 'tables', tableId, 'hands', uid), (snap) => {
      setHandDoc(snap.exists() ? (snap.data() as HandDoc) : null);
    }, (e) => console.error('hand snapshot', e));
    return unsub;
  }, [tableId, uid]);

  const view = useMemo(() => (table ? parseView(table) : null), [table?.viewJson]);
  const hand = useMemo(() => (handDoc ? parseHand(handDoc) : null), [handDoc?.json]);
  return { table, view, hand, missing, offset };
}

/** Ticks every `ms` and returns an estimate of the server clock. */
export function useServerClock(offset: number, ms = 250): number {
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(id);
  }, [offset, ms]);
  return now;
}
