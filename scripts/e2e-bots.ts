/**
 * End-to-end smoke test: 4 bots play a full match through the Functions emulator.
 * Usage: FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 npx tsx scripts/e2e-bots.ts [hands]
 * Bots read the secret state via the admin SDK (test only) and act through the callables.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildSlots, isIslek, isOkeyTile, meldPoints, slotOf, tryExtend, faceValue,
  type Action, type MatchState, type MeldContext, type MeldInput, type PlayerHand, type Tile, type Color,
} from '@okey101/engine';

const PROJECT = 'okey101-ce391';
const AUTH = 'http://127.0.0.1:9199';
const FN = `http://127.0.0.1:5101/${PROJECT}/europe-west1`;
const args = process.argv.slice(2);
const HANDS = Number(args.find((a) => /^\d+$/.test(a)) ?? 5);
const BOTS = args.includes('--bots') ? Number(args[args.indexOf('--bots') + 1]) : 4;
const TURN = args.includes('--turn') ? Number(args[args.indexOf('--turn') + 1]) : 30;
const PROD = args.includes('--prod');
const TEAMS = args.includes('--teams');
const RULES = args.includes('--rules') ? args[args.indexOf('--rules') + 1].split(',').map((r) => r.trim().toLowerCase()) : ['k2', 'k3', 'k6'];

initializeApp({ projectId: PROJECT });
const db = getFirestore();

async function signIn(): Promise<{ token: string; uid: string }> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const j = await r.json();
  return { token: j.idToken, uid: j.localId };
}

async function call(token: string, name: string, data: unknown): Promise<any> {
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.details?.code ?? j.error.status, details: j.error });
  return j.result;
}

// ---- bot brain ----
function candidateMelds(rack: Tile[], ctx: MeldContext): { input: MeldInput; ids: number[]; points: number; kind: 'run' | 'set' | 'pair' }[] {
  const out: { input: MeldInput; ids: number[]; points: number; kind: 'run' | 'set' | 'pair' }[] = [];
  const okeys = rack.filter((t) => isOkeyTile(t, ctx.okey));
  const normal = rack.filter((t) => !isOkeyTile(t, ctx.okey));
  const tryAdd = (kind: 'run' | 'set' | 'pair', tiles: { tile: Tile; joker: boolean }[]) => {
    const b = buildSlots(kind, tiles, ctx);
    if (!b) return;
    out.push({ input: { kind, tiles: b.map((x) => ({ tileId: x.tile.id, joker: x.joker || undefined })) }, ids: b.map((x) => x.tile.id), points: meldPoints(kind, b.map((x) => slotOf(x, ctx))), kind });
  };
  const byColor: Record<string, Tile[]> = {};
  for (const t of normal) { const c = t.color === 'fake' ? ctx.okey.color : t.color; (byColor[c] ??= []).push(t); }
  for (const c of Object.keys(byColor)) {
    const tiles = byColor[c].slice().sort((a, b) => faceValue(a, ctx.okey) - faceValue(b, ctx.okey));
    // dedupe by number
    const uniq: Tile[] = []; const seen = new Set<number>();
    for (const t of tiles) { const n = faceValue(t, ctx.okey); if (!seen.has(n)) { seen.add(n); uniq.push(t); } }
    for (let i = 0; i < uniq.length; i++) for (let j = i + 2; j < uniq.length; j++) {
      const seg = uniq.slice(i, j + 1).map((tile) => ({ tile, joker: false }));
      tryAdd('run', seg);
      if (okeys[0]) { // run with one joker inserted
        for (let p = 0; p <= seg.length; p++) tryAdd('run', [...seg.slice(0, p), { tile: okeys[0], joker: true }, ...seg.slice(p)]);
      }
    }
    if (okeys[0]) for (let i = 0; i + 1 < uniq.length; i++) { const seg = uniq.slice(i, i + 2).map((tile) => ({ tile, joker: false })); for (let p = 0; p <= 2; p++) tryAdd('run', [...seg.slice(0, p), { tile: okeys[0], joker: true }, ...seg.slice(p)]); }
  }
  const byNum: Record<number, Tile[]> = {};
  for (const t of normal) (byNum[faceValue(t, ctx.okey)] ??= []).push(t);
  for (const n of Object.keys(byNum)) {
    const tiles = byNum[Number(n)];
    const colors = new Map<string, Tile>();
    for (const t of tiles) { const c = t.color === 'fake' ? ctx.okey.color : t.color; if (!colors.has(c)) colors.set(c, t); }
    const arr = [...colors.values()];
    if (arr.length >= 3) { tryAdd('set', arr.map((tile) => ({ tile, joker: false }))); if (arr.length === 4) for (let i = 0; i < 4; i++) tryAdd('set', arr.filter((_, j) => j !== i).map((tile) => ({ tile, joker: false }))); }
    if (arr.length === 2 && okeys[0]) tryAdd('set', [...arr.map((tile) => ({ tile, joker: false })), { tile: okeys[0], joker: true }]);
    // pairs
    const groups = new Map<string, Tile[]>();
    for (const t of tiles) { const k = t.color === 'fake' ? `${ctx.okey.color}` : t.color; (groups.get(k) ?? groups.set(k, []).get(k)!).push(t); }
    for (const g of groups.values()) if (g.length >= 2) tryAdd('pair', g.slice(0, 2).map((tile) => ({ tile, joker: false })));
  }
  return out;
}

function greedyDisjoint<T extends { ids: number[]; points: number }>(cands: T[]): T[] {
  const sorted = cands.slice().sort((a, b) => b.points - a.points);
  const used = new Set<number>(); const out: T[] = [];
  for (const c of sorted) { if (c.ids.some((id) => used.has(id))) continue; c.ids.forEach((id) => used.add(id)); out.push(c); }
  return out;
}

function decide(m: MatchState, seat: number): Action {
  const h = m.hand!; const p: PlayerHand = h.players[seat];
  const ctx: MeldContext = { okey: h.okey, gosterge: h.gosterge, k3: m.settings.rules.k3 };
  if (h.phase === 'draw') {
    const left = (seat + 3) % 4; const pile = h.discards[left]; const last = pile[pile.length - 1];
    const takeable = last && last.turnIndex === h.turnIndex - 1 && !last.penalized && !(m.settings.rules.k1 && last.turnIndex < 4);
    if (takeable && Math.random() < 0.15) return { type: 'takeSide' };
    return { type: 'draw' };
  }
  const cands = candidateMelds(p.rack, ctx);
  if (p.opened === 'none') {
    const series = greedyDisjoint(cands.filter((c) => c.kind !== 'pair'));
    const total = series.reduce((s, c) => s + c.points, 0);
    const thr = m.settings.rules.k4 ? Math.max(101, h.highestSeriesOpening + 1) : 101;
    if (total >= thr && !p.declaredPairs) return { type: 'open', kind: 'series', melds: series.map((c) => c.input) };
    const pairs = greedyDisjoint(cands.filter((c) => c.kind === 'pair'));
    const pthr = m.settings.rules.k4 ? Math.max(5, h.highestPairOpening + 1) : 5;
    if (pairs.length >= pthr) return { type: 'open', kind: 'pairs', melds: pairs.map((c) => c.input) };
  } else {
    if (p.opened === 'series') {
      const lay = cands.find((c) => c.kind !== 'pair' && c.ids.length < p.rack.length);
      if (lay) return { type: 'layMeld', meld: lay.input };
      if (h.players.some((q) => q.opened === 'pairs')) { const pr = cands.find((c) => c.kind === 'pair' && c.ids.length < p.rack.length); if (pr) return { type: 'layMeld', meld: pr.input, areaSeat: h.players.find((q) => q.opened === 'pairs')!.seat }; }
    } else {
      const pr = cands.find((c) => c.kind === 'pair' && c.ids.length < p.rack.length);
      if (pr) return { type: 'layMeld', meld: pr.input };
    }
    for (const t of p.rack) {
      if (p.rack.length < 2) break;
      for (const meld of h.melds) {
        if (meld.kind === 'pair') continue;
        const key = (end: string) => `${meld.id}:${meld.kind === 'set' ? 'set' : end}`;
        const limit = p.opened === 'pairs' ? 2 : 99;
        if (tryExtend(meld, t, false, 'back', ctx) && (h.extendsThisTurn[key('back')] ?? 0) < limit) return { type: 'extend', meldId: meld.id, tileId: t.id, end: 'back' };
        if (meld.kind === 'run' && tryExtend(meld, t, false, 'front', ctx) && (h.extendsThisTurn[key('front')] ?? 0) < limit) return { type: 'extend', meldId: meld.id, tileId: t.id, end: 'front' };
      }
    }
  }
  // discard: side obligation first (server handles), then lowest non-işlek non-okey
  let pool = p.rack.filter((t) => !isOkeyTile(t, h.okey));
  if (p.sideTakenTileId !== null && p.sideObligation) pool = pool.filter((t) => t.id !== p.sideTakenTileId);
  if (pool.length === 0) pool = p.rack.slice();
  const stolen = new Set(p.stolen.map((s) => s.okeyTileId));
  pool = pool.filter((t) => !stolen.has(t.id));
  const nonIslek = pool.filter((t) => !isIslek(t, h.melds, ctx));
  if (nonIslek.length) pool = nonIslek;
  pool.sort((a, b) => faceValue(a, h.okey) - faceValue(b, h.okey));
  return { type: 'discard', tileId: pool[0].id };
}

async function main() {
  const users = await Promise.all(Array.from({ length: BOTS }, () => signIn()));
  const rules = Object.fromEntries(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10'].map((k) => [k, RULES.includes(k)]));
  const settings = { mode: TEAMS ? 'teams' : 'single', hands: HANDS, turnSeconds: TURN, finishReward: 'finisher', k6Mode: 'self', rules };
  const { tableId, code } = await call(users[0].token, 'createTable', { name: 'Bot0', settings, isPublic: false });
  for (let i = 1; i < BOTS; i++) await call(users[i].token, 'joinTable', { name: `Bot${i}`, code });
  console.log('table', tableId, 'code', code, BOTS < 4 ? `- waiting for ${4 - BOTS} human(s) to join with the code` : '');
  const secretRef = db.doc(`tables/${tableId}/secret/state`);
  while (!(await secretRef.get()).exists) await new Promise((r) => setTimeout(r, 1000));
  const secret = db.doc(`tables/${tableId}/secret/state`);
  let steps = 0; const t0 = Date.now();
  const errors: Record<string, number> = {};
  while (steps++ < 50000) {
    const snap = await secret.get();
    const m = JSON.parse(snap.get('json')) as MatchState;
    if (m.status === 'finished') {
      console.log('MATCH FINISHED in', steps, 'steps,', ((Date.now() - t0) / 1000).toFixed(1), 's');
      console.log('totals', m.totals, 'winner', m.winner);
      for (const r of m.results) console.log(`hand ${r.handNumber}: finisher=${r.finisherSeat} x${r.multiplier} deckOut=${r.deckExhausted}`, r.seats.map((s) => `${s.reason}:${s.total}`).join(' '));
      console.log('errors seen', errors);
      // sanity: all 4 hand docs exist and public view has no rack contents
      const pub = (await db.doc(`tables/${tableId}`).get()).data()!;
      if (pub.viewJson.includes('"rack"')) throw new Error('LEAK: rack in public view');
      return;
    }
    const h = m.hand!;
    if (h.phase === 'finished') {
      const wait = (m.nextHandAt ?? 0) - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait + 50));
      await call(users[0].token, 'playAction', { tableId, action: { type: 'nextHand' } }).catch((e) => { errors[e.code] = (errors[e.code] ?? 0) + 1; });
      continue;
    }
    const seat = h.turnSeat;
    const uid = m.seats[seat].uid;
    const user = users.find((u) => u.uid === uid);
    if (!user) { // human's turn: wait, but fire timeout if overdue
      await new Promise((r) => setTimeout(r, 800));
      if (Date.now() > h.turnDeadline + 2000) await call(users[0].token, 'playAction', { tableId, action: { type: 'timeout' } }).catch(() => {});
      continue;
    }
    await new Promise((r) => setTimeout(r, BOTS < 4 ? 600 : 0));
    const action = decide(m, seat);
    try {
      await call(user.token, 'playAction', { tableId, action });
    } catch (e: any) {
      errors[e.code] = (errors[e.code] ?? 0) + 1;
      if (e.code === 'BELOW_THRESHOLD' || e.code === 'INVALID_MELD' || e.code === 'CANNOT_EXTEND' || e.code === 'NO_PAIR_OPENER' || e.code === 'PAIRS_OPENER_NO_MELD') {
        // fall back to a plain discard
        const p = h.players[seat];
        const t = p.rack.filter((x) => !isOkeyTile(x, h.okey))[0] ?? p.rack[0];
        await call(user.token, 'playAction', { tableId, action: { type: 'discard', tileId: t.id } }).catch((e2) => { errors['fallback:' + e2.code] = (errors['fallback:' + e2.code] ?? 0) + 1; });
      } else {
        console.error('action failed', action.type, e.code, e.message);
        // force progress via timeout if stuck
        await call(user.token, 'playAction', { tableId, action: { type: 'timeout' } }).catch(() => {});
      }
    }
  }
  throw new Error('did not finish');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
