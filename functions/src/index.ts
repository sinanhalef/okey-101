import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import {
  DEFAULT_SETTINGS, EngineError, applyAction, privateView, publicView, startMatch,
  type Action, type MatchState, type SeatInfo, type TableSettings,
} from '@okey101/engine';
import type { CreateTableReq, FindTableReq, JoinTableReq, LeaveTableReq, PlayActionReq, TableDoc } from '@okey101/shared';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 20 });
const db = getFirestore();
const tables = db.collection('tables');

// ---------- helpers ----------

function uidOf(req: CallableRequest<unknown>): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'unauthenticated');
  return uid;
}

function cleanName(raw: unknown): string {
  const s = String(raw ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
  return s.length ? s : 'Misafir';
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

function sanitizeSettings(raw: unknown): TableSettings {
  const r = (raw ?? {}) as Partial<TableSettings>;
  const rules = { ...DEFAULT_SETTINGS.rules };
  for (const k of Object.keys(rules) as (keyof typeof rules)[]) rules[k] = !!(r.rules as any)?.[k];
  const hands = [5, 7, 9, 11].includes(Number(r.hands)) ? (Number(r.hands) as TableSettings['hands']) : 9;
  const turnSeconds = Math.min(120, Math.max(10, Math.round(Number(r.turnSeconds) || 30)));
  return {
    mode: r.mode === 'teams' ? 'teams' : 'single',
    hands,
    turnSeconds,
    finishReward: r.finishReward === 'opponents' ? 'opponents' : 'finisher',
    k6Mode: r.k6Mode === 'others' ? 'others' : 'self',
    rules,
  };
}

function engineErr(e: unknown): never {
  if (e instanceof EngineError) throw new HttpsError('failed-precondition', e.code, { code: e.code, detail: e.message });
  if (e instanceof HttpsError) throw e;
  console.error(e);
  throw new HttpsError('internal', 'internal');
}

/** Write match state: secret + public view + private hands. */
function writeMatch(tx: Transaction, tableId: string, match: MatchState, now: number, extra: Partial<TableDoc> = {}) {
  const ref = tables.doc(tableId);
  tx.set(ref.collection('secret').doc('state'), { json: JSON.stringify(match), updatedAt: now });
  tx.update(ref, {
    status: match.status, viewJson: JSON.stringify(publicView(match)), updatedAt: now, serverNow: now, ...extra,
  });
  match.seats.forEach((s, seat) => {
    const pv = privateView(match, seat);
    tx.set(ref.collection('hands').doc(s.uid), { json: JSON.stringify(pv), updatedAt: now });
  });
}

async function readMatch(tx: Transaction, tableId: string): Promise<MatchState> {
  const snap = await tx.get(tables.doc(tableId).collection('secret').doc('state'));
  if (!snap.exists) throw new HttpsError('failed-precondition', 'NOT_PLAYING', { code: 'NOT_PLAYING' });
  return JSON.parse(snap.get('json') as string) as MatchState;
}

function seatOf(seats: SeatInfo[], uid: string): number {
  const i = seats.findIndex((s) => s.uid === uid);
  if (i < 0) throw new HttpsError('permission-denied', 'NOT_SEATED', { code: 'NOT_SEATED' });
  return i;
}

/** Seat a user in a waiting table; starts the match when the 4th seat fills. Must run inside tx. */
async function seatUser(tx: Transaction, tableId: string, doc: TableDoc, uid: string, name: string, now: number) {
  if (doc.status !== 'waiting') throw new HttpsError('failed-precondition', 'GAME_STARTED', { code: 'GAME_STARTED' });
  if (doc.seats.some((s) => s.uid === uid)) return; // idempotent
  if (doc.seats.length >= 4) throw new HttpsError('failed-precondition', 'TABLE_FULL', { code: 'TABLE_FULL' });
  const seats = [...doc.seats, { uid, name }];
  if (seats.length === 4) {
    const match = startMatch(doc.settings, seats, (Math.random() * 2 ** 32) >>> 0, now);
    writeMatch(tx, tableId, match, now, { seats, seatCount: 4 });
  } else {
    tx.update(tables.doc(tableId), { seats, seatCount: seats.length, updatedAt: now, serverNow: now });
  }
}

// ---------- callables ----------

export const createTable = onCall(async (req: CallableRequest<CreateTableReq>) => {
  const uid = uidOf(req);
  const name = cleanName(req.data?.name);
  const settings = sanitizeSettings(req.data?.settings);
  const isPublic = !!req.data?.isPublic;
  const now = Date.now();
  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const clash = await tables.where('code', '==', code).where('status', 'in', ['waiting', 'playing']).limit(1).get();
    if (clash.empty) break;
    code = randomCode();
  }
  const ref = tables.doc();
  const doc: TableDoc = {
    code, isPublic, status: 'waiting', hostUid: uid, createdAt: now, updatedAt: now, serverNow: now,
    settings, seats: [{ uid, name }], seatCount: 1, viewJson: null,
  };
  await ref.set(doc);
  return { tableId: ref.id, code };
});

export const joinTable = onCall(async (req: CallableRequest<JoinTableReq>) => {
  const uid = uidOf(req);
  const name = cleanName(req.data?.name);
  const code = String(req.data?.code ?? '').trim().toUpperCase();
  const q = await tables.where('code', '==', code).where('status', 'in', ['waiting', 'playing']).limit(1).get();
  if (q.empty) throw new HttpsError('not-found', 'TABLE_NOT_FOUND', { code: 'TABLE_NOT_FOUND' });
  const tableId = q.docs[0].id;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(tables.doc(tableId));
    const doc = snap.data() as TableDoc;
    if (doc.seats.some((s) => s.uid === uid)) return;
    await seatUser(tx, tableId, doc, uid, name, Date.now());
  });
  return { tableId };
});

export const findTable = onCall(async (req: CallableRequest<FindTableReq>) => {
  const uid = uidOf(req);
  const name = cleanName(req.data?.name);
  const q = await tables.where('status', '==', 'waiting').where('isPublic', '==', true).limit(10).get();
  const candidates = q.docs
    .map((d) => ({ id: d.id, doc: d.data() as TableDoc }))
    .filter((c) => c.doc.seatCount < 4)
    .sort((a, b) => a.doc.createdAt - b.doc.createdAt);
  for (const c of candidates) {
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(tables.doc(c.id));
        const doc = snap.data() as TableDoc;
        if (doc.status !== 'waiting' || doc.seats.length >= 4) throw new HttpsError('failed-precondition', 'TABLE_FULL');
        await seatUser(tx, c.id, doc, uid, name, Date.now());
      });
      return { tableId: c.id };
    } catch (e) {
      if (e instanceof HttpsError && e.message === 'TABLE_FULL') continue;
      throw e;
    }
  }
  // none available: create a public default table
  const now = Date.now();
  const ref = tables.doc();
  const doc: TableDoc = {
    code: randomCode(), isPublic: true, status: 'waiting', hostUid: uid, createdAt: now, updatedAt: now, serverNow: now,
    settings: DEFAULT_SETTINGS, seats: [{ uid, name }], seatCount: 1, viewJson: null,
  };
  await ref.set(doc);
  return { tableId: ref.id };
});

export const leaveTable = onCall(async (req: CallableRequest<LeaveTableReq>) => {
  const uid = uidOf(req);
  const tableId = String(req.data?.tableId ?? '');
  await db.runTransaction(async (tx) => {
    const ref = tables.doc(tableId);
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const doc = snap.data() as TableDoc;
    if (doc.status !== 'waiting') throw new HttpsError('failed-precondition', 'GAME_STARTED', { code: 'GAME_STARTED' });
    const seats = doc.seats.filter((s) => s.uid !== uid);
    if (seats.length === 0) tx.delete(ref);
    else tx.update(ref, { seats, seatCount: seats.length, hostUid: seats[0].uid, updatedAt: Date.now() });
  });
  return { ok: true };
});

export const playAction = onCall(async (req: CallableRequest<PlayActionReq>) => {
  const uid = uidOf(req);
  const tableId = String(req.data?.tableId ?? '');
  const action = req.data?.action as Action;
  if (!action || typeof action.type !== 'string') throw new HttpsError('invalid-argument', 'bad action');
  try {
    await db.runTransaction(async (tx) => {
      const match = await readMatch(tx, tableId);
      const seat = seatOf(match.seats, uid);
      const now = Date.now();
      const isSystem = action.type === 'timeout' || action.type === 'nextHand';
      applyAction(match, action, { now, seat: isSystem ? null : seat });
      writeMatch(tx, tableId, match, now);
    });
  } catch (e) {
    engineErr(e);
  }
  return { ok: true, serverNow: Date.now() };
});

export const _internal = { FieldValue };
