import { describe, expect, it } from 'vitest';
import { buildSlots, isIslek, meldPoints, slotOf, type Meld, type MeldContext } from '../src';
import { FAKE0, T } from './helpers';

const ctx: MeldContext = { okey: { color: 'yellow', number: 6 }, gosterge: T('yellow', 5), k3: false };
const OKEY = T('yellow', 6);
const b = (kind: 'run' | 'set' | 'pair', tiles: { tile: any; joker?: boolean }[]) => buildSlots(kind, tiles.map((t) => ({ tile: t.tile, joker: !!t.joker })), ctx);
const pts = (kind: 'run' | 'set' | 'pair', tiles: { tile: any; joker?: boolean }[]) => meldPoints(kind, b(kind, tiles)!.map((t) => slotOf(t, ctx)));

describe('meld validation', () => {
  it('runs: same colour consecutive, no wrap', () => {
    expect(b('run', [{ tile: T('yellow', 4) }, { tile: T('yellow', 5) }, { tile: T('yellow', 7) }])).toBeNull();
    expect(b('run', [{ tile: T('red', 1) }, { tile: T('red', 2) }, { tile: T('red', 3) }])).not.toBeNull();
    expect(b('run', [{ tile: T('red', 12) }, { tile: T('red', 13) }, { tile: T('red', 1) }])).toBeNull();
    expect(b('run', [{ tile: T('red', 13) }, { tile: T('red', 1) }, { tile: T('red', 2) }])).toBeNull();
    expect(b('run', [{ tile: T('red', 3) }, { tile: T('blue', 4) }, { tile: T('red', 5) }])).toBeNull();
    expect(b('run', [{ tile: T('red', 3) }, { tile: T('red', 4) }])).toBeNull();
    expect(pts('run', [{ tile: T('red', 3) }, { tile: T('red', 4) }, { tile: T('red', 5) }, { tile: T('red', 6) }])).toBe(18);
  });
  it('sets: same number distinct colours, 3 or 4', () => {
    expect(b('set', [{ tile: T('red', 9) }, { tile: T('blue', 9) }, { tile: T('black', 9) }])).not.toBeNull();
    expect(b('set', [{ tile: T('red', 9) }, { tile: T('red', 9, 1) }, { tile: T('black', 9) }])).toBeNull();
    expect(b('set', [{ tile: T('red', 9) }, { tile: T('blue', 9) }, { tile: T('black', 9) }, { tile: T('yellow', 9) }])).not.toBeNull();
    expect(pts('set', [{ tile: T('red', 9) }, { tile: T('blue', 9) }, { tile: T('black', 9) }])).toBe(27);
  });
  it('okey as joker takes replaced value; okey unflipped is natural yellow 6', () => {
    expect(pts('run', [{ tile: T('red', 11) }, { tile: OKEY, joker: true }, { tile: T('red', 13) }])).toBe(36);
    expect(b('run', [{ tile: T('yellow', 5) }, { tile: OKEY }, { tile: T('yellow', 7) }])).not.toBeNull();
    expect(b('run', [{ tile: T('red', 5) }, { tile: OKEY }, { tile: T('red', 7) }])).toBeNull();
    expect(pts('run', [{ tile: OKEY, joker: true }, { tile: T('blue', 12) }, { tile: T('blue', 13) }])).toBe(36);
    expect(b('run', [{ tile: T('blue', 12) }, { tile: T('blue', 13) }, { tile: OKEY, joker: true }])).toBeNull();
  });
  it('sahte okey is yellow 6, never a joker', () => {
    expect(b('run', [{ tile: T('yellow', 5) }, { tile: FAKE0 }, { tile: T('yellow', 7) }])).not.toBeNull();
    expect(b('run', [{ tile: T('red', 5) }, { tile: FAKE0 }, { tile: T('red', 7) }])).toBeNull();
    expect(b('run', [{ tile: T('red', 5) }, { tile: FAKE0, joker: true }, { tile: T('red', 7) }])).toBeNull();
    expect(b('pair', [{ tile: FAKE0 }, { tile: T('yellow', 6, 1) }])).not.toBeNull();
  });
  it('non-okey tile cannot be a joker', () => {
    expect(b('run', [{ tile: T('red', 5) }, { tile: T('black', 2), joker: true }, { tile: T('red', 7) }])).toBeNull();
  });
  it('pairs: identical or with okey; K3 gösterge twin only in pairs', () => {
    expect(b('pair', [{ tile: T('red', 7) }, { tile: T('red', 7, 1) }])).not.toBeNull();
    expect(b('pair', [{ tile: T('red', 7) }, { tile: T('blue', 7) }])).toBeNull();
    expect(b('pair', [{ tile: T('red', 7) }, { tile: OKEY, joker: true }])).not.toBeNull();
    const twin = T('yellow', 5, 1);
    expect(b('pair', [{ tile: T('red', 7) }, { tile: twin, joker: true }])).toBeNull();
    const k3 = { ...ctx, k3: true };
    expect(buildSlots('pair', [{ tile: T('red', 7), joker: false }, { tile: twin, joker: true }], k3)).not.toBeNull();
    expect(buildSlots('run', [{ tile: T('red', 7), joker: false }, { tile: twin, joker: true }, { tile: T('red', 9), joker: false }], k3)).toBeNull();
  });
  it('işlek detection', () => {
    const melds: Meld[] = [
      { id: 'a', kind: 'run', ownerSeat: 0, areaSeat: 0, tiles: [T('red', 7), T('red', 8), T('red', 9)].map((tile) => ({ tile, joker: false })) },
      { id: 'b', kind: 'set', ownerSeat: 0, areaSeat: 0, tiles: [T('red', 3), T('blue', 3), T('black', 3)].map((tile) => ({ tile, joker: false })) },
      { id: 'c', kind: 'pair', ownerSeat: 0, areaSeat: 0, tiles: [T('blue', 5), T('blue', 5, 1)].map((tile) => ({ tile, joker: false })) },
    ];
    expect(isIslek(T('red', 6), melds, ctx)).toBe(true);
    expect(isIslek(T('red', 10), melds, ctx)).toBe(true);
    expect(isIslek(T('red', 11), melds, ctx)).toBe(false);
    expect(isIslek(T('yellow', 3), melds, ctx)).toBe(true);
    expect(isIslek(T('red', 3, 1), melds, ctx)).toBe(false);
    expect(isIslek(T('blue', 5), melds, ctx)).toBe(false); // pairs never extended
    // sahte okey counts as yellow 6: extends nothing here
    expect(isIslek(FAKE0, melds, ctx)).toBe(false);
    const runY: Meld = { id: 'd', kind: 'run', ownerSeat: 1, areaSeat: 1, tiles: [T('yellow', 7), T('yellow', 8), T('yellow', 9)].map((tile) => ({ tile, joker: false })) };
    expect(isIslek(FAKE0, [runY], ctx)).toBe(true);
  });
});
