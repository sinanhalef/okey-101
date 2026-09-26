import { describe, expect, it } from 'vitest';
import { scoreHand, startMatch, applyAction, teamTotals } from '../src';
import { NOW, T, makeMatch, settings } from './helpers';

const G = T('yellow', 5);
const OKEY = T('yellow', 6);

function handWith(over: (m: ReturnType<typeof makeMatch>) => void, s = settings()) {
  const m = makeMatch({ gosterge: G, racks: [[T('red', 1)], [T('red', 2)], [T('red', 3)], [T('red', 4)]] }, s);
  over(m);
  return m;
}

describe('scoring', () => {
  it('normal finish: -101, opened by remaining, not opened 202', () => {
    const m = handWith((m) => {
      const ps = m.hand!.players;
      ps[0].opened = 'series'; ps[0].rack = [];
      ps[1].opened = 'series'; ps[1].rack = [T('red', 5), T('blue', 13)];
      ps[2].opened = 'pairs'; ps[2].rack = [T('black', 10)];
      ps[3].rack = [T('red', 4)];
    });
    const r = scoreHand(m.hand!, m.settings, { seat: 0, pairs: false, okey: false, elden: false });
    expect(r.seats.map((s) => s.total)).toEqual([-101, 18, 20, 202]);
  });
  it('pairs finisher doubles everyone: 404 for not opened, -202 reward', () => {
    const m = handWith((m) => { m.hand!.players[0].opened = 'pairs'; m.hand!.players[0].rack = []; });
    const r = scoreHand(m.hand!, m.settings, { seat: 0, pairs: true, okey: false, elden: false });
    expect(r.multiplier).toBe(2);
    expect(r.seats[0].total).toBe(-202);
    expect(r.seats[1].total).toBe(404);
  });
  it('pairs + elden + okey => x8', () => {
    const m = handWith((m) => { m.hand!.players[0].opened = 'pairs'; m.hand!.players[0].rack = []; });
    const r = scoreHand(m.hand!, m.settings, { seat: 0, pairs: true, okey: true, elden: true });
    expect(r.multiplier).toBe(8);
    expect(r.seats[1].total).toBe(202 * 8);
    expect(r.seats[0].total).toBe(-808);
  });
  it('okey in hand = 101, fake = okey number; aşım +101 not multiplied; in-game penalties not multiplied', () => {
    const m = handWith((m) => {
      const ps = m.hand!.players;
      ps[0].opened = 'series'; ps[0].rack = [];
      ps[1].opened = 'series'; ps[1].rack = [OKEY, T('blue', 13), T('red', 13), T('black', 13), T('yellow', 13), T('red', 12), T('blue', 12), T('black', 12), T('yellow', 12)]; // 101+52+48=201
      ps[2].opened = 'pairs'; ps[2].rack = [T('black', 10), T('black', 11), T('black', 12), T('black', 13), T('red', 10), T('red', 11), T('red', 12), T('red', 13), T('blue', 10)]; // 102 x2 = 204 > 202
      ps[2].inGamePoints = 101;
      ps[3].rack = [T('red', 4), T('yellow', 6, 1)];
    });
    const r = scoreHand(m.hand!, m.settings, { seat: 0, pairs: true, okey: false, elden: false });
    expect(r.seats[1].base).toBe(201);
    expect(r.seats[1].extra).toBe(0);
    expect(r.seats[1].total).toBe(402);
    expect(r.seats[2].base).toBe(204);
    expect(r.seats[2].extra).toBe(101);
    expect(r.seats[2].total).toBe(204 * 2 + 101 + 101);
  });
  it('teams: teammate of finisher gets 0; opponents mode gives +101 to other team', () => {
    const s = settings({ mode: 'teams', finishReward: 'opponents' });
    const m = handWith((m) => {
      const ps = m.hand!.players;
      ps[0].opened = 'series'; ps[0].rack = [];
      ps[2].rack = [T('red', 13)];
      ps[1].opened = 'series'; ps[1].rack = [T('red', 5)];
    }, s);
    const r = scoreHand(m.hand!, s, { seat: 0, pairs: true, okey: false, elden: false });
    expect(r.seats[0].total).toBe(0);
    expect(r.seats[2].total).toBe(0);
    expect(r.seats[2].reason).toBe('teammate');
    expect(r.teamAdjust).toEqual([0, 202]);
    expect(r.seats[1].total).toBe(10);
    expect(r.seats[3].total).toBe(404);
  });
  it('match: hands rotate dealer, totals accumulate, winner = lowest', () => {
    const s = settings({ hands: 5 });
    const m = startMatch(s, [0, 1, 2, 3].map((i) => ({ uid: `u${i}`, name: `P${i}` })), 42, NOW);
    expect(m.status).toBe('playing');
    const dealer1 = m.hand!.dealerSeat;
    // play by timeouts until match ends
    let now = NOW;
    let guard = 0;
    while (m.status === 'playing' && guard++ < 5000) {
      if (m.hand!.phase === 'finished') { now = m.nextHandAt!; applyAction(m, { type: 'nextHand' }, { now, seat: null }); continue; }
      now = m.hand!.turnDeadline;
      applyAction(m, { type: 'timeout' }, { now, seat: null });
    }
    expect(m.status).toBe('finished');
    expect(m.results).toHaveLength(5);
    expect(m.results[1].handNumber).toBe(2);
    expect(m.winner!.seats.length).toBeGreaterThan(0);
    const sum = (i: number) => m.results.reduce((a, r) => a + r.seats[i].total, 0);
    expect(m.totals).toEqual([sum(0), sum(1), sum(2), sum(3)]);
    expect(teamTotals(m)[0]).toBe(m.totals[0] + m.totals[2]);
    void dealer1;
  });
});
