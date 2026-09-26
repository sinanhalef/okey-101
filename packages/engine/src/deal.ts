import type { HandState, PlayerHand, Tile } from './types';
import { fullSet, isFake, okeyFromGosterge } from './tiles';
import { mulberry32, shuffle } from './rng';

export function newPlayerHand(seat: number, rack: Tile[]): PlayerHand {
  return {
    seat, rack, opened: 'none', openingValue: 0, openedTurnIndex: null, declaredPairs: false,
    sideTakenTileId: null, sideObligation: false, stolen: [], inGamePoints: 0, nextTurnPenaltySeconds: 0,
  };
}

/** Deal a hand: 22 to starter, 21 to others, gösterge (never fake), 20-tile deck. */
export function dealHand(handNumber: number, dealerSeat: number, seed: number, now: number, turnSeconds: number, penaltySeconds: number[] = [0, 0, 0, 0]): HandState {
  const rand = mulberry32(seed);
  let tiles = shuffle(fullSet(), rand);
  const starterSeat = (dealerSeat + 1) % 4;
  const players: PlayerHand[] = [];
  for (let s = 0; s < 4; s++) {
    const n = s === starterSeat ? 22 : 21;
    players.push(newPlayerHand(s, tiles.slice(0, n)));
    tiles = tiles.slice(n);
  }
  // gösterge: first non-fake; fakes stay in the deck
  let gIdx = tiles.findIndex((t) => !isFake(t));
  const gosterge = tiles[gIdx];
  tiles.splice(gIdx, 1);
  const deck = shuffle(tiles, rand);
  const base = turnSeconds - (penaltySeconds[starterSeat] ?? 0);
  return {
    handNumber, dealerSeat, starterSeat, deck, gosterge, okey: okeyFromGosterge(gosterge),
    players, melds: [], discards: [[], [], [], []],
    turnSeat: starterSeat, phase: 'act', turnIndex: 0,
    turnStartedAt: now, turnDeadline: now + Math.max(5, base) * 1000,
    extendsThisTurn: {}, openedThisTurn: false, lastDeckDrawn: false, islekWindow: null,
    highestSeriesOpening: 0, highestPairOpening: 0, meldSeq: 0, teamPoints: [0, 0], result: null,
  };
}
