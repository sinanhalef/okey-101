import { buildSlots, meldPoints, slotOf, type MeldContext, type MeldInput, type MeldKind, type Tile } from '@okey101/engine';

export interface Pick { tile: Tile; joker: boolean }
export interface Inferred { kind: MeldKind; tiles: Pick[]; points: number }

function attempt(kind: MeldKind, tiles: Pick[], ctx: MeldContext): Inferred | null {
  const built = buildSlots(kind, tiles, ctx);
  if (!built) return null;
  return { kind, tiles: built.map((b) => ({ tile: b.tile, joker: b.joker })), points: meldPoints(kind, built.map((b) => slotOf(b, ctx))) };
}

/** Infer the meld kind from a selection (rack order matters for runs with jokers). */
export function inferMeld(tiles: Pick[], ctx: MeldContext): Inferred | null {
  if (tiles.length === 2) return attempt('pair', tiles, ctx);
  if (tiles.length < 3) return null;
  const inOrder = attempt('run', tiles, ctx) ?? attempt('set', tiles, ctx);
  if (inOrder) return inOrder;
  // try sorting concrete tiles by number and placing jokers in every position
  const jokers = tiles.filter((t) => t.joker);
  const concrete = tiles.filter((t) => !t.joker).sort((a, b) => (a.tile.color === 'fake' ? ctx.okey.number : a.tile.number) - (b.tile.color === 'fake' ? ctx.okey.number : b.tile.number));
  if (jokers.length === 0) return attempt('run', concrete, ctx);
  const n = concrete.length;
  const positions = (k: number): number[][] => (k === 0 ? [[]] : positions(k - 1).flatMap((p) => Array.from({ length: n + k }, (_, i) => [...p, i])));
  for (const pos of positions(jokers.length)) {
    const arr: Pick[] = concrete.slice();
    let ok = true;
    pos.forEach((p, i) => { if (p > arr.length) ok = false; else arr.splice(p, 0, jokers[i]); });
    if (!ok) continue;
    const r = attempt('run', arr, ctx);
    if (r) return r;
  }
  return null;
}

export function toInput(m: Inferred): MeldInput {
  return { kind: m.kind, tiles: m.tiles.map((t) => ({ tileId: t.tile.id, joker: t.joker || undefined })) };
}
