import { describe, expect, it } from 'vitest';
import { CONST } from '../src';
import { FAKE0, NOW, T, act, ids, makeMatch, rackIds, settings, tryAct } from './helpers';

// gösterge yellow 5 => okey yellow 6
const G = T('yellow', 5);
const OKEY = T('yellow', 6);
const OKEY2 = T('yellow', 6, 1);

/** A 101+ opening: red 10-11-12-13 (46) + set 9x3 (27) + set 10x3 (30) = 103 */
const OPEN103 = [
  { kind: 'run' as const, tiles: ids(T('red', 10), T('red', 11), T('red', 12), T('red', 13)) },
  { kind: 'set' as const, tiles: ids(T('red', 9), T('blue', 9), T('black', 9)) },
  { kind: 'set' as const, tiles: ids(T('yellow', 10), T('blue', 10), T('black', 10)) },
];
const OPEN103_TILES = [T('red', 10), T('red', 11), T('red', 12), T('red', 13), T('red', 9), T('blue', 9), T('black', 9), T('yellow', 10), T('blue', 10), T('black', 10)];
const filler = (n: number, from = 1) => Array.from({ length: n }, (_, i) => T('black', ((from + i) % 13) + 1, 1));

function baseRacks(): any[][] {
  return [
    [...OPEN103_TILES, T('red', 1), T('red', 2)], // seat 0 starter (12 tiles; count doesn't matter for tests)
    [T('blue', 1), T('blue', 2), T('blue', 3)],
    [T('black', 1), T('black', 2), T('black', 3)],
    [T('red', 3), T('red', 4), T('red', 5)],
  ];
}

describe('turn flow', () => {
  it('starter does not draw on first turn; others must draw', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() });
    expect(m.hand!.phase).toBe('act');
    expect(tryAct(m, 0, { type: 'draw' })).toBe('ALREADY_DREW');
    expect(tryAct(m, 1, { type: 'discard', tileId: T('blue', 1).id })).toBe('NOT_YOUR_TURN');
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    expect(m.hand!.turnSeat).toBe(1);
    expect(m.hand!.phase).toBe('draw');
    expect(tryAct(m, 1, { type: 'discard', tileId: T('blue', 1).id })).toBe('MUST_DRAW_FIRST');
    const deckBefore = m.hand!.deck.length;
    act(m, 1, { type: 'draw' });
    expect(m.hand!.deck.length).toBe(deckBefore - 1);
    expect(m.hand!.players[1].rack.length).toBe(4);
  });

  it('opening needs >= 101 and only after drawing; below threshold rejected', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() });
    const low = { type: 'open' as const, kind: 'series' as const, melds: [OPEN103[1], OPEN103[2]] };
    expect(tryAct(m, 0, low)).toBe('BELOW_THRESHOLD');
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    const p = m.hand!.players[0];
    expect(p.opened).toBe('series');
    expect(p.openingValue).toBe(103);
    expect(m.hand!.melds).toHaveLength(3);
    expect(m.hand!.turnDeadline).toBe(NOW + 30_000 + 30_000);
    expect(tryAct(m, 0, { type: 'open', kind: 'series', melds: OPEN103 })).toBe('ALREADY_OPENED');
  });

  it('elden bitiş: open and discard last tile in one turn => elden multiplier', () => {
    const racks = baseRacks();
    racks[0] = [...OPEN103_TILES, T('red', 1)];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    expect(m.hand!.phase).toBe('finished');
    const r = m.hand!.result!;
    expect(r.finisherSeat).toBe(0);
    expect(r.finish).toEqual({ pairs: false, okey: false, elden: true });
    expect(r.multiplier).toBe(2);
    expect(r.seats[0].total).toBe(-202);
    expect(r.seats[1].total).toBe(404); // not opened 202 x2
  });

  it('side take: must use tile same turn, else returned + 101 + draw from deck', () => {
    const racks = baseRacks();
    racks[1] = [T('blue', 1), T('blue', 2), T('blue', 3)];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'takeSide' });
    expect(rackIds(m, 1)).toContain(T('red', 1).id);
    expect(m.hand!.players[1].sideObligation).toBe(true);
    const deck = m.hand!.deck.length;
    act(m, 1, { type: 'discard', tileId: T('blue', 3).id });
    // tile returned to seat 0's pile, penalty, drew from deck, and discard proceeded
    expect(m.hand!.discards[0].map((d) => d.tile.id)).toEqual([T('red', 1).id]);
    expect(m.hand!.discards[0][0].returned).toBe(true);
    expect(m.hand!.players[1].inGamePoints).toBe(101);
    expect(m.hand!.deck.length).toBe(deck - 1);
    expect(m.hand!.players[1].rack.length).toBe(3); // 3 +1 side -1 returned +1 drawn -1 discarded
    expect(m.hand!.turnSeat).toBe(2);
  });

  it('side take: discarding the side tile itself only returns it; player must discard again', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'takeSide' });
    act(m, 1, { type: 'discard', tileId: T('red', 1).id });
    expect(m.hand!.turnSeat).toBe(1);
    expect(m.hand!.phase).toBe('act');
    expect(m.hand!.players[1].inGamePoints).toBe(101);
    act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    expect(m.hand!.turnSeat).toBe(2);
  });

  it('K10: return without penalty', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() }, settings({}, { k10: true }));
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'takeSide' });
    act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    expect(m.hand!.players[1].inGamePoints).toBe(0);
    expect(m.hand!.discards[0]).toHaveLength(1);
  });

  it('side take used in opening satisfies obligation; K2 penalizes the discarder', () => {
    const racks = baseRacks();
    racks[0] = [T('red', 10), T('black', 5)];
    racks[1] = [...OPEN103_TILES.filter((t) => t.id !== T('red', 10).id), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks }, settings({}, { k2: true }));
    act(m, 0, { type: 'discard', tileId: T('red', 10).id });
    act(m, 1, { type: 'takeSide' });
    act(m, 1, { type: 'open', kind: 'series', melds: OPEN103 });
    expect(m.hand!.players[1].sideObligation).toBe(false);
    expect(m.hand!.players[0].inGamePoints).toBe(100); // 10 x 10
    act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    expect(m.hand!.players[1].inGamePoints).toBe(0);
  });

  it('only the immediately previous discard can be taken; penalized tiles cannot', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    // seat 2's left is seat 1 -> ok; seat 0's discard is stale for seat 1 next round
    expect(tryAct(m, 2, { type: 'takeSide' })).toBeNull();
    act(m, 2, { type: 'discard', tileId: T('black', 1).id });
    act(m, 3, { type: 'draw' });
    act(m, 3, { type: 'discard', tileId: T('red', 3).id });
    // seat 0 again; its left (seat 3) discard is last turn -> allowed
    expect(m.hand!.turnSeat).toBe(0);
    expect(tryAct(m, 0, { type: 'takeSide' })).toBeNull();
  });

  it('K1: no side take during the first 4 discards', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() }, settings({}, { k1: true }));
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    expect(tryAct(m, 1, { type: 'takeSide' })).toBe('K1_FIRST_ROUND');
    act(m, 1, { type: 'draw' }); act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    act(m, 2, { type: 'draw' }); act(m, 2, { type: 'discard', tileId: T('black', 1).id });
    act(m, 3, { type: 'draw' }); act(m, 3, { type: 'discard', tileId: T('red', 3).id });
    expect(tryAct(m, 0, { type: 'takeSide' })).toBe('K1_FIRST_ROUND');
    act(m, 0, { type: 'draw' }); act(m, 0, { type: 'discard', tileId: T('red', 2).id });
    expect(tryAct(m, 1, { type: 'takeSide' })).toBeNull();
  });

  it('işlek discard and okey discard penalized automatically (K9 off)', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 8), T('blue', 1), OKEY];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'discard', tileId: T('red', 8).id }); // extends red 10-13? no: 9 needed. red 8 not işlek
    expect(m.hand!.players[1].inGamePoints).toBe(0);
    act(m, 2, { type: 'draw' }); act(m, 2, { type: 'discard', tileId: T('black', 1).id });
    act(m, 3, { type: 'draw' }); act(m, 3, { type: 'discard', tileId: T('red', 3).id });
    act(m, 0, { type: 'draw' }); act(m, 0, { type: 'discard', tileId: T('red', 2).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'discard', tileId: OKEY.id });
    expect(m.hand!.players[1].inGamePoints).toBe(101);
    expect(m.hand!.discards[1].at(-1)!.penalized).toBe(true);
    expect(tryAct(m, 2, { type: 'takeSide' })).toBe('SIDE_TILE_PENALIZED');
  });

  it('işlek: a tile fitting a meld end is penalized', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 9, 1), T('blue', 1), T('blue', 2)];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'discard', tileId: T('red', 9, 1).id }); // extends red 10-13 at front
    expect(m.hand!.players[1].inGamePoints).toBe(101);
  });

  it('K9: manual işlek call; wrong call shortens next turn by 5s', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 9, 1), T('blue', 1), T('blue', 2)];
    const m = makeMatch({ gosterge: G, racks }, settings({}, { k9: true }));
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    expect(m.hand!.islekWindow).toEqual({ seat: 0, tileId: T('red', 1).id, applicable: false });
    expect(tryAct(m, 0, { type: 'pressIslek' })).toBe('CANNOT_PRESS');
    act(m, 3, { type: 'pressIslek' }); // wrong
    expect(m.hand!.players[3].nextTurnPenaltySeconds).toBe(5);
    expect(m.hand!.islekWindow).toBeNull();
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'discard', tileId: T('red', 9, 1).id });
    expect(m.hand!.players[1].inGamePoints).toBe(0);
    act(m, 0, { type: 'pressIslek' });
    expect(m.hand!.players[1].inGamePoints).toBe(101);
    expect(tryAct(m, 2, { type: 'takeSide' })).toBe('SIDE_TILE_PENALIZED');
    act(m, 2, { type: 'draw' }); act(m, 2, { type: 'discard', tileId: T('black', 1).id });
    const t0 = NOW + 5000;
    act(m, 3, { type: 'draw' }, t0);
    // seat 3 turn started when seat 2 discarded (NOW): 30 - 5 = 25s
    expect(m.hand!.turnDeadline).toBe(NOW + 25_000);
  });

  it('K9: window closes when next player draws (no penalty), tile then takeable later? no - stale', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 9, 1), T('blue', 1), T('blue', 2)];
    const m = makeMatch({ gosterge: G, racks }, settings({}, { k9: true }));
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'discard', tileId: T('red', 9, 1).id });
    act(m, 2, { type: 'draw' });
    expect(m.hand!.islekWindow).toBeNull();
    expect(tryAct(m, 0, { type: 'pressIslek' })).toBe('NO_ISLEK_WINDOW');
  });

  it('işleme: extend runs at both ends and sets; pair-opener limited to 2 per end per turn', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 9, 1), T('red', 8), T('red', 7), T('yellow', 9), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    const run = m.hand!.melds[0].id;
    expect(tryAct(m, 1, { type: 'extend', meldId: run, tileId: T('red', 9, 1).id, end: 'front' })).toBe('NOT_OPENED');
    // let seat 1 open with pairs to test the 2-per-end limit
    m.hand!.players[1].opened = 'pairs';
    act(m, 1, { type: 'extend', meldId: run, tileId: T('red', 9, 1).id, end: 'front' });
    act(m, 1, { type: 'extend', meldId: run, tileId: T('red', 8).id, end: 'front' });
    expect(tryAct(m, 1, { type: 'extend', meldId: run, tileId: T('red', 7).id, end: 'front' })).toBe('EXTEND_LIMIT');
    expect(m.hand!.melds[0].tiles.map((t) => t.tile.number)).toEqual([8, 9, 10, 11, 12, 13]);
    expect(tryAct(m, 1, { type: 'extend', meldId: run, tileId: T('yellow', 9).id, end: 'back' })).toBe('CANNOT_EXTEND');
    act(m, 1, { type: 'extend', meldId: m.hand!.melds[1].id, tileId: T('yellow', 9).id, end: 'back' });
    expect(m.hand!.melds[1].tiles).toHaveLength(4);
    expect(m.hand!.turnDeadline).toBe(NOW + 30_000 + 15_000);
  });

  it('okey çalma: replace joker with real tile, +101 to opponent owner, must use same turn (reverted otherwise)', () => {
    const racks = baseRacks();
    racks[0] = [T('red', 10), OKEY, T('red', 12), T('red', 13), T('red', 9), T('blue', 9), T('black', 9), T('yellow', 10), T('blue', 10), T('black', 10), T('red', 1), T('black', 6, 1)];
    racks[1] = [...OPEN103_TILES.map((t) => (t.id === T('red', 10).id ? T('red', 10, 1) : t)).filter((t) => t.id !== T('red', 11).id), T('red', 11, 1), T('blue', 1), T('red', 11)];
    // seat1 rack: red10', red12', ... hmm keep simple: seat 1 has its own 103 and an extra red 11 copy
    racks[1] = [T('red', 10, 1), T('red', 11, 1), T('red', 12, 1), T('red', 13, 1), T('red', 9, 1), T('blue', 9, 1), T('black', 9, 1), T('yellow', 10, 1), T('blue', 10, 1), T('black', 10, 1), T('red', 11), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks });
    const open0 = [
      { kind: 'run' as const, tiles: [{ tileId: T('red', 10).id }, { tileId: OKEY.id, joker: true }, { tileId: T('red', 12).id }, { tileId: T('red', 13).id }] },
      OPEN103[1], OPEN103[2],
    ];
    act(m, 0, { type: 'open', kind: 'series', melds: open0 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    const open1 = [
      { kind: 'run' as const, tiles: ids(T('red', 10, 1), T('red', 11, 1), T('red', 12, 1), T('red', 13, 1)) },
      { kind: 'set' as const, tiles: ids(T('red', 9, 1), T('blue', 9, 1), T('black', 9, 1)) },
      { kind: 'set' as const, tiles: ids(T('yellow', 10, 1), T('blue', 10, 1), T('black', 10, 1)) },
    ];
    act(m, 1, { type: 'open', kind: 'series', melds: open1 });
    const meld = m.hand!.melds[0];
    expect(tryAct(m, 1, { type: 'stealOkey', meldId: meld.id, index: 1, tileId: T('blue', 1).id })).toBe('CANNOT_STEAL');
    act(m, 1, { type: 'stealOkey', meldId: meld.id, index: 1, tileId: T('red', 11).id });
    expect(rackIds(m, 1)).toContain(OKEY.id);
    expect(m.hand!.players[0].inGamePoints).toBe(101);
    expect(meld.tiles[1]).toEqual({ tile: T('red', 11), joker: false });
    // cannot discard the stolen okey
    expect(tryAct(m, 1, { type: 'discard', tileId: OKEY.id })).toBe('STOLEN_OKEY_MUST_BE_USED');
    // discard something else without using -> reverted, penalty undone
    act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    expect(m.hand!.players[0].inGamePoints).toBe(0);
    expect(meld.tiles[1].joker).toBe(true);
    expect(m.hand!.players[1].rack.map((t) => t.id)).toContain(T('red', 11).id);
    expect(m.hand!.players[1].rack.map((t) => t.id)).not.toContain(OKEY.id);
  });

  it('okey çalma K8: may keep the okey', () => {
    const racks = baseRacks();
    racks[0] = [T('red', 10), OKEY, T('red', 12), T('red', 13), T('red', 9), T('blue', 9), T('black', 9), T('yellow', 10), T('blue', 10), T('black', 10), T('red', 1), T('black', 6, 1)];
    racks[1] = [T('red', 10, 1), T('red', 11, 1), T('red', 12, 1), T('red', 13, 1), T('red', 9, 1), T('blue', 9, 1), T('black', 9, 1), T('yellow', 10, 1), T('blue', 10, 1), T('black', 10, 1), T('red', 11), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks }, settings({}, { k8: true }));
    act(m, 0, { type: 'open', kind: 'series', melds: [{ kind: 'run', tiles: [{ tileId: T('red', 10).id }, { tileId: OKEY.id, joker: true }, { tileId: T('red', 12).id }, { tileId: T('red', 13).id }] }, OPEN103[1], OPEN103[2]] });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'open', kind: 'series', melds: [
      { kind: 'run', tiles: ids(T('red', 10, 1), T('red', 11, 1), T('red', 12, 1), T('red', 13, 1)) },
      { kind: 'set', tiles: ids(T('red', 9, 1), T('blue', 9, 1), T('black', 9, 1)) },
      { kind: 'set', tiles: ids(T('yellow', 10, 1), T('blue', 10, 1), T('black', 10, 1)) },
    ] });
    act(m, 1, { type: 'stealOkey', meldId: m.hand!.melds[0].id, index: 1, tileId: T('red', 11).id });
    act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    expect(rackIds(m, 1)).toContain(OKEY.id);
    expect(m.hand!.players[0].inGamePoints).toBe(101);
  });

  it('unflipped okey on the table is not stealable', () => {
    const racks = baseRacks();
    racks[0] = [T('yellow', 5, 1), OKEY, T('yellow', 7), ...OPEN103_TILES, T('red', 1), T('black', 6, 1)];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'open', kind: 'series', melds: [...OPEN103, { kind: 'run', tiles: ids(T('yellow', 5, 1), OKEY, T('yellow', 7)) }] });
    m.hand!.players[1].opened = 'series';
    m.hand!.players[1].rack.push(OKEY2);
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    expect(tryAct(m, 1, { type: 'stealOkey', meldId: m.hand!.melds[3].id, index: 1, tileId: OKEY2.id })).toBe('CANNOT_STEAL');
  });

  it('pairs opening: 5 pairs, cannot lay runs after, may lay new pairs; series opener may lay pairs only if a pair opener exists', () => {
    const racks = baseRacks();
    racks[0] = [T('red', 1), T('red', 1, 1), T('blue', 2), T('blue', 2, 1), T('black', 3), T('black', 3, 1), T('red', 4), OKEY, T('yellow', 12), T('yellow', 12, 1), T('black', 8), T('black', 8, 1), T('blue', 5), T('blue', 6), T('blue', 7), T('red', 12)];
    racks[1] = [...OPEN103_TILES, T('red', 5), T('red', 5, 1), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks });
    const pairs = (n: number) => [
      { kind: 'pair' as const, tiles: ids(T('red', 1), T('red', 1, 1)) },
      { kind: 'pair' as const, tiles: ids(T('blue', 2), T('blue', 2, 1)) },
      { kind: 'pair' as const, tiles: ids(T('black', 3), T('black', 3, 1)) },
      { kind: 'pair' as const, tiles: [{ tileId: T('red', 4).id }, { tileId: OKEY.id, joker: true }] },
      { kind: 'pair' as const, tiles: ids(T('yellow', 12), T('yellow', 12, 1)) },
    ].slice(0, n);
    expect(tryAct(m, 0, { type: 'open', kind: 'pairs', melds: pairs(4) })).toBe('BELOW_THRESHOLD');
    act(m, 0, { type: 'open', kind: 'pairs', melds: pairs(5) });
    expect(m.hand!.players[0].opened).toBe('pairs');
    expect(tryAct(m, 0, { type: 'layMeld', meld: { kind: 'run', tiles: ids(T('blue', 5), T('blue', 6), T('blue', 7)) } })).toBe('PAIRS_OPENER_NO_MELD');
    act(m, 0, { type: 'layMeld', meld: { kind: 'pair', tiles: ids(T('black', 8), T('black', 8, 1)) } });
    expect(m.hand!.melds).toHaveLength(6);
    act(m, 0, { type: 'discard', tileId: T('red', 12).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 1, { type: 'layMeld', meld: { kind: 'pair', tiles: ids(T('red', 5), T('red', 5, 1)) } });
    const pm = m.hand!.melds.at(-1)!;
    expect(pm.ownerSeat).toBe(1);
    expect(pm.areaSeat).toBe(0);
  });

  it('series opener cannot lay pairs when nobody opened with pairs', () => {
    const racks = baseRacks();
    racks[0] = [...OPEN103_TILES, T('red', 5), T('red', 5, 1), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    expect(tryAct(m, 0, { type: 'layMeld', meld: { kind: 'pair', tiles: ids(T('red', 5), T('red', 5, 1)) } })).toBe('NO_PAIR_OPENER');
  });

  it('K3: gösterge twin pairs with anything in pairs opening', () => {
    const twin = T('yellow', 5, 1);
    const racks = baseRacks();
    racks[0] = [T('red', 1), T('red', 1, 1), T('blue', 2), T('blue', 2, 1), T('black', 3), T('black', 3, 1), T('red', 4), OKEY, T('yellow', 12), twin, T('red', 12), T('black', 6, 1)];
    const melds = [
      { kind: 'pair' as const, tiles: ids(T('red', 1), T('red', 1, 1)) },
      { kind: 'pair' as const, tiles: ids(T('blue', 2), T('blue', 2, 1)) },
      { kind: 'pair' as const, tiles: ids(T('black', 3), T('black', 3, 1)) },
      { kind: 'pair' as const, tiles: [{ tileId: T('red', 4).id }, { tileId: OKEY.id, joker: true }] },
      { kind: 'pair' as const, tiles: [{ tileId: T('yellow', 12).id }, { tileId: twin.id, joker: true }] },
    ];
    const off = makeMatch({ gosterge: G, racks });
    expect(tryAct(off, 0, { type: 'open', kind: 'pairs', melds })).toBe('INVALID_MELD');
    const on = makeMatch({ gosterge: G, racks }, settings({}, { k3: true }));
    act(on, 0, { type: 'open', kind: 'pairs', melds });
    expect(on.hand!.players[0].opened).toBe('pairs');
    // twin cannot be stolen
    on.hand!.players[1].opened = 'series';
    on.hand!.players[1].rack.push(T('yellow', 12, 1));
    act(on, 0, { type: 'discard', tileId: T('red', 12).id });
    act(on, 1, { type: 'draw' });
    expect(tryAct(on, 1, { type: 'stealOkey', meldId: on.hand!.melds[4].id, index: 1, tileId: T('yellow', 12, 1).id })).toBe('CANNOT_STEAL');
  });

  it('K4: escalating thresholds', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 10, 1), T('red', 11, 1), T('red', 12, 1), T('red', 13, 1), T('red', 9, 1), T('blue', 9, 1), T('black', 9, 1), T('yellow', 10, 1), T('blue', 10, 1), T('black', 10, 1), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks }, settings({}, { k4: true }));
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    const same = [
      { kind: 'run' as const, tiles: ids(T('red', 10, 1), T('red', 11, 1), T('red', 12, 1), T('red', 13, 1)) },
      { kind: 'set' as const, tiles: ids(T('red', 9, 1), T('blue', 9, 1), T('black', 9, 1)) },
      { kind: 'set' as const, tiles: ids(T('yellow', 10, 1), T('blue', 10, 1), T('black', 10, 1)) },
    ];
    expect(tryAct(m, 1, { type: 'open', kind: 'series', melds: same })).toBe('BELOW_THRESHOLD'); // 103 < 104
  });

  it('K5: declare pairs -> no side obligation, right neighbour cannot take, 404 if not opened', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() }, settings({}, { k5: true }));
    expect(tryAct(m, 1, { type: 'declarePairs' })).toBe('NOT_YOUR_TURN');
    act(m, 0, { type: 'declarePairs' });
    expect(tryAct(m, 0, { type: 'open', kind: 'series', melds: OPEN103 })).toBe('DECLARED_PAIRS_ONLY');
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    expect(tryAct(m, 1, { type: 'takeSide' })).toBe('K5_BLOCKED');
    act(m, 1, { type: 'draw' }); act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    act(m, 2, { type: 'draw' }); act(m, 2, { type: 'discard', tileId: T('black', 1).id });
    act(m, 3, { type: 'draw' }); act(m, 3, { type: 'discard', tileId: T('red', 3).id });
    act(m, 0, { type: 'takeSide' });
    expect(m.hand!.players[0].sideObligation).toBe(false);
    act(m, 0, { type: 'discard', tileId: T('red', 2).id });
    expect(m.hand!.players[0].inGamePoints).toBe(0);
    // force deck exhaustion to score
    m.hand!.deck = [T('black', 13, 1)];
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'discard', tileId: T('blue', 2).id });
    expect(m.hand!.phase).toBe('finished');
    const r = m.hand!.result!;
    expect(r.deckExhausted).toBe(true);
    expect(r.seats[0].total).toBe(404);
    expect(r.seats[1].total).toBe(202);
  });

  it('deck exhaustion: last drawer discards anything without penalty and hand ends', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 9, 1), T('blue', 1)];
    const m = makeMatch({ gosterge: G, racks, deck: [T('black', 13, 1)] });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    expect(m.hand!.lastDeckDrawn).toBe(true);
    act(m, 1, { type: 'discard', tileId: T('red', 9, 1).id }); // işlek but final
    expect(m.hand!.phase).toBe('finished');
    expect(m.hand!.players[1].inGamePoints).toBe(0);
    const r = m.hand!.result!;
    expect(r.finisherSeat).toBeNull();
    expect(r.seats[0].reason).toBe('series');
    expect(r.seats[0].base).toBe(2); // red 2 left
    expect(r.seats[1].total).toBe(202);
  });

  it('timeout: draws if needed, discards lowest non-işlek non-okey tile', () => {
    const racks = baseRacks();
    racks[1] = [T('red', 9, 1), OKEY, T('blue', 4), T('blue', 2), FAKE0];
    const m = makeMatch({ gosterge: G, racks, deck: [T('black', 13, 1), T('black', 12, 1)] });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    expect(tryAct(m, 1, { type: 'timeout' })).toBe('NOT_EXPIRED');
    act(m, 3, { type: 'timeout' }, NOW + 31_000);
    expect(m.hand!.deck).toHaveLength(1);
    expect(m.hand!.discards[1].at(-1)!.tile.id).toBe(T('blue', 2).id); // red 9 işlek, okey never, fake=6, blue 2 lowest
    expect(m.hand!.players[1].inGamePoints).toBe(0);
    expect(m.hand!.turnSeat).toBe(2);
  });

  it('timeout with side tile in hand: returned with penalty, then auto discard', () => {
    const racks = baseRacks();
    racks[1] = [T('blue', 4), T('blue', 2)];
    const m = makeMatch({ gosterge: G, racks });
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'takeSide' });
    act(m, 1, { type: 'timeout' }, NOW + 31_000);
    expect(m.hand!.players[1].inGamePoints).toBe(101);
    expect(m.hand!.discards[0].at(-1)!.tile.id).toBe(T('red', 1).id);
    expect(m.hand!.turnSeat).toBe(2);
  });

  it('startOpen: taking back, discarding or timing out after pressing Aç costs 101; opening clears it', () => {
    const m = makeMatch({ gosterge: G, racks: baseRacks() });
    expect(tryAct(m, 0, { type: 'cancelOpen' })).toBe('NOT_OPENING');
    act(m, 0, { type: 'startOpen' });
    act(m, 0, { type: 'cancelOpen' });
    expect(m.hand!.players[0].inGamePoints).toBe(101);
    act(m, 0, { type: 'startOpen' });
    act(m, 0, { type: 'open', kind: 'series', melds: OPEN103 });
    expect(m.hand!.players[0].openingDeclared).toBe(false);
    expect(m.hand!.players[0].inGamePoints).toBe(101);
    act(m, 0, { type: 'discard', tileId: T('red', 1).id });
    act(m, 1, { type: 'draw' });
    act(m, 1, { type: 'startOpen' });
    act(m, 1, { type: 'discard', tileId: T('blue', 1).id });
    expect(m.hand!.players[1].inGamePoints).toBe(101);
    act(m, 2, { type: 'draw' });
    act(m, 2, { type: 'startOpen' });
    act(m, 2, { type: 'timeout' }, NOW + 200_000);
    expect(m.hand!.players[2].inGamePoints).toBe(101);
    expect(m.hand!.turnSeat).toBe(3);
  });

  it('K6: bonus for 150+ opening (self mode) and others mode', () => {
    const big = [
      { kind: 'run' as const, tiles: ids(T('red', 10), T('red', 11), T('red', 12), T('red', 13)) },
      { kind: 'run' as const, tiles: ids(T('blue', 10), T('blue', 11), T('blue', 12), T('blue', 13)) },
      { kind: 'run' as const, tiles: ids(T('black', 10), T('black', 11), T('black', 12), T('black', 13)) },
      { kind: 'set' as const, tiles: ids(T('red', 9), T('blue', 9), T('black', 9)) },
    ]; // 46*3 + 27 = 165
    const racks = baseRacks();
    racks[0] = [T('red', 10), T('red', 11), T('red', 12), T('red', 13), T('blue', 10), T('blue', 11), T('blue', 12), T('blue', 13), T('black', 10), T('black', 11), T('black', 12), T('black', 13), T('red', 9), T('blue', 9), T('black', 9), T('red', 1)];
    const a = makeMatch({ gosterge: G, racks }, settings({ k6Mode: 'self' }, { k6: true }));
    act(a, 0, { type: 'open', kind: 'series', melds: big });
    expect(a.hand!.players[0].inGamePoints).toBe(-101);
    const b = makeMatch({ gosterge: G, racks }, settings({ k6Mode: 'others' }, { k6: true }));
    act(b, 0, { type: 'open', kind: 'series', melds: big });
    expect(b.hand!.players.map((p) => p.inGamePoints)).toEqual([0, 101, 101, 101]);
    const c = makeMatch({ gosterge: G, racks }, settings({ k6Mode: 'others', mode: 'teams' }, { k6: true }));
    act(c, 0, { type: 'open', kind: 'series', melds: big });
    expect(c.hand!.teamPoints).toEqual([0, 101]);
  });
});
