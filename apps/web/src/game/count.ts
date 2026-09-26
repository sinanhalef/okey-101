import { buildSlots, isGostergeTwin, isOkeyTile, meldPoints, slotOf, type MeldContext, type Tile } from '@okey101/engine';
import { identityOf } from '@okey101/engine';

export interface CountResult { points: number; groups: number[][]; pairs: number }

/** Best opening value of a rack: max-weight set of disjoint runs/sets (okeys act as jokers). */
export function bestOpening(rack: Tile[], ctx: MeldContext): CountResult {
  const n = rack.length;
  const okeyIdx = rack.map((t, i) => (isOkeyTile(t, ctx.okey) ? i : -1)).filter((i) => i >= 0);
  const normal = rack.map((t, i) => (isOkeyTile(t, ctx.okey) ? -1 : i)).filter((i) => i >= 0);
  const pick = (idx: number[], jokerIdx: number[]) => [...idx.map((i) => ({ tile: rack[i], joker: false })), ...jokerIdx.map((i) => ({ tile: rack[i], joker: true }))];
  const cands: { mask: number; points: number; idx: number[] }[] = [];
  const seen = new Set<number>();
  const add = (kind: 'run' | 'set', tiles: { tile: Tile; joker: boolean }[], idx: number[]) => {
    const b = buildSlots(kind, tiles, ctx);
    if (!b) return;
    const mask = idx.reduce((m, i) => m | (1 << i), 0);
    const pts = meldPoints(kind, b.map((x) => slotOf(x, ctx)));
    const key = mask * 1000 + pts;
    if (seen.has(key)) return;
    seen.add(key);
    cands.push({ mask, points: pts, idx });
  };
  // runs: per colour, unique numbers (choose one copy per number: prefer any), with 0..2 jokers inserted
  const byColor = new Map<string, number[]>();
  for (const i of normal) { const id = identityOf(rack[i], ctx.okey); const k = id.color; (byColor.get(k) ?? byColor.set(k, []).get(k)!).push(i); }
  for (const idxs of byColor.values()) {
    const byNum = new Map<number, number[]>();
    for (const i of idxs) { const nn = identityOf(rack[i], ctx.okey).number; (byNum.get(nn) ?? byNum.set(nn, []).get(nn)!).push(i); }
    const nums = [...byNum.keys()].sort((a, b) => a - b);
    // enumerate windows [a, b] of numbers 1..13 of length 3..13; each number either present (pick a copy) or filled by joker
    for (let a = 1; a <= 13; a++) {
      for (let b = a + 2; b <= 13; b++) {
        let jokersNeeded = 0; const idx: number[] = []; const jok: number[] = [];
        let ok = true;
        const order: { tile: Tile; joker: boolean }[] = [];
        for (let x = a; x <= b; x++) {
          const copies = byNum.get(x);
          if (copies && copies.length) { idx.push(copies[0]); order.push({ tile: rack[copies[0]], joker: false }); }
          else { jokersNeeded++; if (jokersNeeded > okeyIdx.length) { ok = false; break; } const j = okeyIdx[jokersNeeded - 1]; jok.push(j); order.push({ tile: rack[j], joker: true }); }
        }
        if (!ok) continue;
        if (b - a + 1 - jokersNeeded < 1) continue;
        add('run', order, [...idx, ...jok]);
      }
    }
    void nums;
  }
  // sets: per number, distinct colours, 3-4 tiles with 0..2 jokers
  const byNum2 = new Map<number, Map<string, number>>();
  for (const i of normal) { const id = identityOf(rack[i], ctx.okey); const m = byNum2.get(id.number) ?? byNum2.set(id.number, new Map()).get(id.number)!; if (!m.has(id.color)) m.set(id.color, i); }
  for (const colors of byNum2.values()) {
    const idxs = [...colors.values()];
    const subsets = (arr: number[]): number[][] => arr.reduce<number[][]>((acc, v) => acc.concat(acc.map((s) => [...s, v])), [[]]);
    for (const sub of subsets(idxs)) {
      for (let j = 0; j <= Math.min(2, okeyIdx.length); j++) {
        const size = sub.length + j;
        if (size < 3 || size > 4 || sub.length === 0) continue;
        add('set', pick(sub, okeyIdx.slice(0, j)), [...sub, ...okeyIdx.slice(0, j)]);
      }
    }
  }
  cands.sort((x, y) => y.points - x.points);
  // exact max-weight packing with memo on used mask
  const byTile: number[][] = Array.from({ length: n }, () => []);
  cands.forEach((c, ci) => c.idx.forEach((i) => byTile[i].push(ci)));
  const memo = new Map<number, { points: number; chosen: number[] }>();
  const solve = (used: number, from: number): { points: number; chosen: number[] } => {
    let i = from;
    while (i < n && (used & (1 << i))) i++;
    if (i >= n) return { points: 0, chosen: [] };
    const key = used * 64 + i;
    const hit = memo.get(key);
    if (hit) return hit;
    let best = solve(used | (1 << i), i + 1); // skip tile i
    for (const ci of byTile[i]) {
      const c = cands[ci];
      if (c.mask & used) continue;
      const r = solve(used | c.mask, i + 1);
      if (r.points + c.points > best.points) best = { points: r.points + c.points, chosen: [ci, ...r.chosen] };
    }
    memo.set(key, best);
    return best;
  };
  const res = n <= 26 ? solve(0, 0) : { points: 0, chosen: [] };
  // pairs
  const counts = new Map<string, number>();
  let wild = okeyIdx.length;
  for (const i of normal) {
    const t = rack[i];
    if (ctx.k3 && isGostergeTwin(t, ctx.gosterge)) { wild++; continue; }
    const id = identityOf(t, ctx.okey); const k = `${id.color}${id.number}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let pairs = 0; let singles = 0;
  for (const c of counts.values()) { pairs += Math.floor(c / 2); singles += c % 2; }
  const w = Math.min(wild, singles); pairs += w; wild -= w; pairs += Math.floor(wild / 2);
  return { points: res.points, groups: res.chosen.map((ci) => cands[ci].idx.map((i) => rack[i].id)), pairs };
}
