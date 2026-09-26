import { describe, expect, it } from 'vitest';
import { dealHand, fullSet, okeyFromGosterge, mod3 } from '../src';
import { T } from './helpers';

describe('tiles & dealing', () => {
  it('has 106 tiles, 2 of each', () => {
    const s = fullSet();
    expect(s).toHaveLength(106);
    expect(s.filter((t) => t.color === 'fake')).toHaveLength(2);
    expect(s.filter((t) => t.color === 'red' && t.number === 7)).toHaveLength(2);
  });
  it('deals 22/21/21/21 + gösterge + 20 deck; gösterge never fake', () => {
    for (let seed = 1; seed < 40; seed++) {
      const h = dealHand(1, 3, seed, 0, 30);
      expect(h.starterSeat).toBe(0);
      expect(h.players.map((p) => p.rack.length)).toEqual([22, 21, 21, 21]);
      expect(h.deck).toHaveLength(20);
      expect(h.gosterge.color).not.toBe('fake');
      const all = [...h.deck, h.gosterge, ...h.players.flatMap((p) => p.rack)];
      expect(new Set(all.map((t) => t.id)).size).toBe(106);
    }
  });
  it('derives okey (13 -> 1)', () => {
    expect(okeyFromGosterge(T('yellow', 5))).toEqual({ color: 'yellow', number: 6 });
    expect(okeyFromGosterge(T('blue', 13))).toEqual({ color: 'blue', number: 1 });
  });
  it('K7 mod3 display', () => {
    expect(mod3(101)).toBe('33 yan 2');
    expect(mod3(125)).toBe('41 yan 2');
    expect(mod3(106)).toBe('35 yan 1');
    expect(mod3(99)).toBe('33');
  });
});
