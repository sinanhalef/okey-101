import { COLORS, type Color, type Tile, type TileIdentity } from './types';

export const FAKE_OKEY_IDS = [104, 105];

/** 106 tiles: id = colorIndex*26 + (number-1)*2 + copy; 104,105 = sahte okey. */
export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  COLORS.forEach((color, ci) => {
    for (let n = 1; n <= 13; n++) {
      for (let copy = 0; copy < 2; copy++) tiles.push({ id: ci * 26 + (n - 1) * 2 + copy, color, number: n });
    }
  });
  tiles.push({ id: 104, color: 'fake', number: 0 }, { id: 105, color: 'fake', number: 0 });
  return tiles;
}

const ALL = fullSet();
export function tileById(id: number): Tile {
  const t = ALL[id];
  if (!t) throw new Error(`bad tile id ${id}`);
  return t;
}

export function isFake(t: Tile): boolean { return t.color === 'fake'; }

export function okeyFromGosterge(g: Tile): TileIdentity {
  if (g.color === 'fake') throw new Error('gösterge cannot be fake');
  return { color: g.color, number: g.number === 13 ? 1 : g.number + 1 };
}

export function isOkeyTile(t: Tile, okey: TileIdentity): boolean {
  return t.color === okey.color && t.number === okey.number;
}

export function isGostergeTwin(t: Tile, gosterge: Tile): boolean {
  return t.id !== gosterge.id && t.color === gosterge.color && t.number === gosterge.number;
}

/** Concrete identity a tile stands for when NOT used as a joker (fake okey => okey identity). */
export function identityOf(t: Tile, okey: TileIdentity): TileIdentity {
  if (t.color === 'fake') return okey;
  return { color: t.color as Color, number: t.number };
}

/** Point value of a tile in hand at hand end (3.1). */
export function handValue(t: Tile, okey: TileIdentity, okeyInHandValue: number): number {
  if (isOkeyTile(t, okey)) return okeyInHandValue;
  return identityOf(t, okey).number;
}

/** Numeric value used for "en düşük taş" and K2 (fake => okey number). */
export function faceValue(t: Tile, okey: TileIdentity): number {
  return identityOf(t, okey).number;
}

export function sameIdentity(a: TileIdentity, b: TileIdentity): boolean {
  return a.color === b.color && a.number === b.number;
}
