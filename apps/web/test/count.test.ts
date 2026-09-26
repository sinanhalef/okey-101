import { describe, expect, it } from 'vitest';
import { tileById, type MeldContext, type Tile } from '@okey101/engine';
import { bestOpening } from '../src/game/count';

const T = (color: string, n: number, copy = 0): Tile => tileById(['red', 'yellow', 'blue', 'black'].indexOf(color) * 26 + (n - 1) * 2 + copy);
const ctx: MeldContext = { okey: { color: 'black', number: 9 }, gosterge: T('black', 8), k3: false };

describe('bestOpening', () => {
  it('finds y9-10-11 + okey run', () => {
    const rack = [T('yellow', 2), T('blue', 13), T('black', 10), T('yellow', 3), T('blue', 13, 1), T('red', 5), T('black', 4), T('yellow', 10), T('black', 9), T('yellow', 11), T('yellow', 9), T('blue', 7), T('red', 7), T('yellow', 5), T('red', 12), T('red', 6), T('blue', 9), T('black', 1), T('black', 10, 1), T('blue', 4), T('blue', 6)];
    const r = bestOpening(rack, ctx);
    expect(r.points).toBeGreaterThanOrEqual(42);
  });
  it('simple 101', () => {
    const rack = [T('red', 10), T('red', 11), T('red', 12), T('red', 13), T('red', 9), T('blue', 9), T('black', 9), T('yellow', 10), T('blue', 10), T('black', 10), T('yellow', 1)];
    const r = bestOpening(rack, { ...ctx, okey: { color: 'yellow', number: 6 } });
    expect(r.points).toBe(103);
    expect(r.groups).toHaveLength(3);
  });
});
