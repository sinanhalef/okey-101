import { buildSlots, identityOf, isOkeyTile, meldPoints, pairValid, slotOf, type MeldContext, type MeldInput, type MeldKind, type Tile } from '@okey101/engine';

export interface Pick { tile: Tile; joker: boolean }

function jokerOf(p: Pick, ctx: MeldContext): boolean { return p.joker && isOkeyTile(p.tile, ctx.okey); }

/** Could these tiles (in this order) still become a run? (any length ≥ 1) */
function runPossible(tiles: Pick[], ctx: MeldContext): boolean {
  let color: string | null = null; let start: number | null = null;
  for (let i = 0; i < tiles.length; i++) {
    const p = tiles[i];
    if (jokerOf(p, ctx)) continue;
    const id = identityOf(p.tile, ctx.okey);
    if (color === null) color = id.color; else if (color !== id.color) return false;
    const st = id.number - i;
    if (start === null) start = st; else if (start !== st) return false;
  }
  if (start !== null && (start < 1 || start + tiles.length - 1 > 13)) return false;
  return tiles.length <= 13;
}

/** Could these tiles still become a set? */
function setPossible(tiles: Pick[], ctx: MeldContext): boolean {
  if (tiles.length > 4) return false;
  let num: number | null = null; const colors = new Set<string>();
  for (const p of tiles) {
    if (jokerOf(p, ctx)) continue;
    const id = identityOf(p.tile, ctx.okey);
    if (num === null) num = id.number; else if (num !== id.number) return false;
    if (colors.has(id.color)) return false;
    colors.add(id.color);
  }
  return true;
}

export function groupPossible(tiles: Pick[], ctx: MeldContext): boolean {
  return tiles.length === 0 || runPossible(tiles, ctx) || setPossible(tiles, ctx);
}

/** Try to add a tile to a group: back first, then front. Returns the new group or null. */
export function tryAppend(group: Pick[], p: Pick, ctx: MeldContext): Pick[] | null {
  const back = [...group, p];
  if (groupPossible(back, ctx)) return back;
  const front = [p, ...group];
  if (groupPossible(front, ctx)) return front;
  return null;
}

export function insertAt(group: Pick[], p: Pick, end: 'front' | 'back', ctx: MeldContext): Pick[] | null {
  const g = end === 'front' ? [p, ...group] : [...group, p];
  return groupPossible(g, ctx) ? g : null;
}

export interface Resolved { kind: MeldKind; tiles: Pick[]; points: number }

/** Resolve a finished group into a concrete meld kind (pair for 2 identical tiles). */
export function resolveGroup(tiles: Pick[], ctx: MeldContext): Resolved | null {
  if (tiles.length === 2) {
    const b = buildSlots('pair', tiles, ctx);
    return b ? { kind: 'pair', tiles: b.map((x) => ({ tile: x.tile, joker: x.joker })), points: 0 } : null;
  }
  if (tiles.length < 3) return null;
  for (const kind of ['run', 'set'] as const) {
    const b = buildSlots(kind, tiles, ctx);
    if (b) return { kind, tiles: b.map((x) => ({ tile: x.tile, joker: x.joker })), points: meldPoints(kind, b.map((x) => slotOf(x, ctx))) };
  }
  return null;
}

export function toInput(r: Resolved): MeldInput {
  return { kind: r.kind, tiles: r.tiles.map((t) => ({ tileId: t.tile.id, joker: t.joker || undefined })) };
}

export { pairValid };
