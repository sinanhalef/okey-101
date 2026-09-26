/**
 * DEV ONLY (emulator): replace a seated player's rack with given tiles, keeping tile-count invariants.
 * Usage: FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 npx tsx scripts/dev-set-rack.ts <tableId> <seat> r10 r11 r12 r13 r9 b9 k9 y10 b10 k10 ...
 * Colours: r=red y=yellow b=blue k=black, f=fake okey. Other tiles from the rack are swapped into the deck.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fullSet, privateView, publicView, type MatchState, type Tile } from '@okey101/engine';

initializeApp({ projectId: 'okey101-ce391' });
const db = getFirestore();
const argv = process.argv.slice(2);
const EXACT = argv.includes('--exact');
const [tableId, seatArg, ...specs] = argv.filter((a) => a !== '--exact');
const seat = Number(seatArg);
const COLORS: Record<string, Tile['color']> = { r: 'red', y: 'yellow', b: 'blue', k: 'black', f: 'fake' };

async function main() {
  const ref = db.doc(`tables/${tableId}/secret/state`);
  const m = JSON.parse((await ref.get()).get('json')) as MatchState;
  const h = m.hand!;
  const p = h.players[seat];
  const all = fullSet();
  const inUse = new Set<number>([...h.melds.flatMap((x) => x.tiles.map((t) => t.tile.id)), ...h.discards.flat().map((d) => d.tile.id), h.gosterge.id, ...h.players.filter((q) => q.seat !== seat).flatMap((q) => q.rack.map((t) => t.id))]);
  const seen = new Set<number>();
  const pool = [...p.rack, ...h.deck].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))); // dedupe (repairs earlier corruption)
  const poolIds = new Set(pool.map((t) => t.id));
  const want: Tile[] = [];
  for (const s of specs) {
    const color = COLORS[s[0]]; const n = color === 'fake' ? 0 : Number(s.slice(1));
    const cand = all.find((t) => t.color === color && t.number === n && poolIds.has(t.id) && !want.some((w) => w.id === t.id) && !inUse.has(t.id));
    if (!cand) { console.log(`skip ${s} (not available)`); continue; }
    want.push(cand);
  }
  const wantIds = new Set(want.map((t) => t.id));
  const rest = pool.filter((t) => !wantIds.has(t.id));
  const n = EXACT ? want.length : 21;
  const newRack = [...want, ...rest.slice(0, Math.max(0, n - want.length))];
  const newDeck = rest.slice(Math.max(0, n - want.length));
  p.rack = newRack.slice(0, n);
  h.deck = [...newDeck, ...newRack.slice(n)];
  const now = Date.now();
  const batch = db.batch();
  batch.set(ref, { json: JSON.stringify(m), updatedAt: now });
  batch.update(db.doc(`tables/${tableId}`), { viewJson: JSON.stringify(publicView(m)), updatedAt: now, serverNow: now });
  m.seats.forEach((s, i) => batch.set(db.doc(`tables/${tableId}/hands/${s.uid}`), { json: JSON.stringify(privateView(m, i)), updatedAt: now }));
  await batch.commit();
  console.log('rack set:', p.rack.map((t) => `${t.color}${t.number}`).join(' '), '| deck', h.deck.length);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
