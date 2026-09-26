import type { Meld, MeldKind, MeldTile, Tile, TileIdentity } from './types';
import { identityOf, isGostergeTwin, isOkeyTile, sameIdentity } from './tiles';

export interface MeldContext { okey: TileIdentity; gosterge: Tile; k3: boolean }

export type Slot = { joker: true } | { joker: false; id: TileIdentity };

/** A tile may act as a joker only if it is the okey, or (K3, pairs only) the gösterge twin. */
export function canBeJoker(t: Tile, ctx: MeldContext, kind: MeldKind): boolean {
  if (isOkeyTile(t, ctx.okey)) return true;
  if (kind === 'pair' && ctx.k3 && isGostergeTwin(t, ctx.gosterge)) return true;
  return false;
}

export function slotOf(mt: MeldTile, ctx: MeldContext): Slot {
  if (mt.joker) return { joker: true };
  return { joker: false, id: identityOf(mt.tile, ctx.okey) };
}

export interface RunInfo { color: TileIdentity['color']; start: number } // numbers start..start+len-1

/** Validate a run: same colour, consecutive by position, 1..13, no wrap. Jokers fill gaps. */
export function runInfo(slots: Slot[]): RunInfo | null {
  if (slots.length < 3 || slots.length > 13) return null;
  let color: TileIdentity['color'] | null = null;
  let start: number | null = null;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.joker) continue;
    if (color === null) color = s.id.color;
    else if (color !== s.id.color) return null;
    const st = s.id.number - i;
    if (start === null) start = st;
    else if (start !== st) return null;
  }
  if (color === null || start === null) return null;
  if (start < 1 || start + slots.length - 1 > 13) return null;
  return { color, start };
}

export interface SetInfo { number: number; colors: Set<string> }

/** Validate a set: 3 or 4 tiles, same number, distinct colours. */
export function setInfo(slots: Slot[]): SetInfo | null {
  if (slots.length < 3 || slots.length > 4) return null;
  let number: number | null = null;
  const colors = new Set<string>();
  for (const s of slots) {
    if (s.joker) continue;
    if (number === null) number = s.id.number;
    else if (number !== s.id.number) return null;
    if (colors.has(s.id.color)) return null;
    colors.add(s.id.color);
  }
  if (number === null) return null;
  return { number, colors };
}

export function pairValid(slots: Slot[]): boolean {
  if (slots.length !== 2) return false;
  const concrete = slots.filter((s): s is { joker: false; id: TileIdentity } => !s.joker);
  if (concrete.length === 2) return sameIdentity(concrete[0].id, concrete[1].id);
  return true;
}

export function meldValid(kind: MeldKind, slots: Slot[]): boolean {
  if (kind === 'run') return runInfo(slots) !== null;
  if (kind === 'set') return setInfo(slots) !== null;
  return pairValid(slots);
}

/** Point value of a meld (jokers take the value of the tile they replace). */
export function meldPoints(kind: MeldKind, slots: Slot[]): number {
  if (kind === 'run') {
    const r = runInfo(slots);
    if (!r) return 0;
    let sum = 0;
    for (let i = 0; i < slots.length; i++) sum += r.start + i;
    return sum;
  }
  if (kind === 'set') {
    const s = setInfo(slots);
    return s ? s.number * slots.length : 0;
  }
  const c = slots.find((s) => !s.joker);
  return c && !c.joker ? c.id.number * 2 : 0;
}

/** Validate a candidate meld built from tiles; returns slots or null. */
export function buildSlots(kind: MeldKind, tiles: { tile: Tile; joker: boolean }[], ctx: MeldContext): MeldTile[] | null {
  const out: MeldTile[] = [];
  for (const t of tiles) {
    if (t.joker && !canBeJoker(t.tile, ctx, kind)) return null;
    out.push({ tile: t.tile, joker: t.joker });
  }
  const slots = out.map((mt) => slotOf(mt, ctx));
  return meldValid(kind, slots) ? out : null;
}

/** Can `tile` be appended to a run/set (işleme)? Returns the resulting tiles or null. */
export function tryExtend(meld: Meld, tile: Tile, joker: boolean, end: 'front' | 'back', ctx: MeldContext): MeldTile[] | null {
  if (meld.kind === 'pair') return null;
  if (joker && !canBeJoker(tile, ctx, meld.kind)) return null;
  const mt: MeldTile = { tile, joker };
  const tiles = end === 'front' ? [mt, ...meld.tiles] : [...meld.tiles, mt];
  const slots = tiles.map((x) => slotOf(x, ctx));
  return meldValid(meld.kind, slots) ? tiles : null;
}

/** Is a concrete tile "işlek": could it be added to any meld on the table? */
export function isIslek(tile: Tile, melds: Meld[], ctx: MeldContext): boolean {
  for (const m of melds) {
    if (m.kind === 'pair') continue;
    if (tryExtend(m, tile, false, 'back', ctx) || tryExtend(m, tile, false, 'front', ctx)) return true;
  }
  return false;
}

/** Can `tile` replace the joker at `index` of `meld` (okey çalma)? */
export function canReplaceJoker(meld: Meld, index: number, tile: Tile, ctx: MeldContext): boolean {
  const mt = meld.tiles[index];
  if (!mt || !mt.joker) return false;
  if (!isOkeyTile(mt.tile, ctx.okey)) return false; // gösterge twin cannot be stolen
  const tiles = meld.tiles.slice();
  tiles[index] = { tile, joker: false };
  return meldValid(meld.kind, tiles.map((x) => slotOf(x, ctx)));
}
