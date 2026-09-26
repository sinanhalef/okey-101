import {
  DEFAULT_SETTINGS, applyAction, dealHand, fullSet, newPlayerHand, okeyFromGosterge, tileById,
  type Action, type Color, type HandState, type MatchState, type RuleFlags, type TableSettings, type Tile,
} from '../src';

export const NOW = 1_000_000;

/** Find a tile by colour/number (copy 0 or 1). */
export function T(color: Color, number: number, copy = 0): Tile {
  const ci = ['red', 'yellow', 'blue', 'black'].indexOf(color);
  return tileById(ci * 26 + (number - 1) * 2 + copy);
}
export const FAKE0 = tileById(104);
export const FAKE1 = tileById(105);

export function settings(over: Partial<TableSettings> = {}, rules: Partial<RuleFlags> = {}): TableSettings {
  return { ...DEFAULT_SETTINGS, ...over, rules: { ...DEFAULT_SETTINGS.rules, ...rules } };
}

export interface HandSpec {
  gosterge: Tile;
  racks: Tile[][];        // 4 racks
  deck?: Tile[];          // top of deck = last element
  starterSeat?: number;
  handNumber?: number;
}

/** Build a controlled hand. Unused tiles fill the deck if `deck` not given. */
export function makeMatch(spec: HandSpec, s: TableSettings = settings()): MatchState {
  const starter = spec.starterSeat ?? 0;
  const dealer = (starter + 3) % 4;
  const hand: HandState = dealHand(spec.handNumber ?? 1, dealer, 1, NOW, s.turnSeconds);
  const used = new Set<number>([spec.gosterge.id]);
  spec.racks.forEach((r) => r.forEach((t) => used.add(t.id)));
  hand.gosterge = spec.gosterge;
  hand.okey = okeyFromGosterge(spec.gosterge);
  hand.players = spec.racks.map((r, i) => newPlayerHand(i, r.slice()));
  if (spec.deck) {
    hand.deck = spec.deck.slice();
  } else {
    hand.deck = fullSet().filter((t) => !used.has(t.id));
  }
  hand.lastDeckDrawn = false;
  return {
    settings: s, seats: [0, 1, 2, 3].map((i) => ({ uid: `u${i}`, name: `P${i}` })), status: 'playing',
    hand, results: [], totals: [0, 0, 0, 0], teamAdjust: [0, 0], nextHandAt: null, seed: 1, winner: null, log: [],
  };
}

export function act(m: MatchState, seat: number, action: Action, now = NOW): MatchState {
  return applyAction(m, action, { now, seat });
}

export function tryAct(m: MatchState, seat: number, action: Action, now = NOW): string | null {
  try { applyAction(m, action, { now, seat }); return null; } catch (e: any) { return e.code ?? String(e); }
}

export function ids(...tiles: Tile[]) { return tiles.map((t) => ({ tileId: t.id })); }
export function rackIds(m: MatchState, seat: number) { return m.hand!.players[seat].rack.map((t) => t.id); }
