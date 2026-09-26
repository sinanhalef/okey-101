import type { Discard, HandResult, HandState, LogEntry, MatchState, Meld, OpenKind, SeatInfo, TableSettings, Tile, TileIdentity } from './types';

export interface PublicPlayer {
  seat: number;
  tileCount: number;
  opened: OpenKind;
  openingValue: number;
  declaredPairs: boolean;
  inGamePoints: number;
}

export interface PublicHand {
  handNumber: number;
  dealerSeat: number;
  starterSeat: number;
  deckCount: number;
  gosterge: Tile;
  okey: TileIdentity;
  players: PublicPlayer[];
  melds: Meld[];
  discards: Discard[][];
  turnSeat: number;
  phase: 'draw' | 'act' | 'finished';
  turnIndex: number;
  turnStartedAt: number;
  turnDeadline: number;
  openedThisTurn: boolean;
  lastDeckDrawn: boolean;
  islekWindow: { seat: number; tileId: number } | null;
  highestSeriesOpening: number;
  highestPairOpening: number;
  result: HandResult | null;
}

export interface PublicMatchView {
  status: MatchState['status'];
  settings: TableSettings;
  seats: SeatInfo[];
  hand: PublicHand | null;
  results: HandResult[];
  totals: number[];
  teamAdjust: [number, number];
  nextHandAt: number | null;
  winner: { seats: number[] } | null;
  log: LogEntry[];
}

export interface PrivateHandView {
  seat: number;
  handNumber: number;
  rack: Tile[];
  sideTakenTileId: number | null;
  sideObligation: boolean;
  stolenOkeyIds: number[];
}

export function publicView(match: MatchState): PublicMatchView {
  const h = match.hand;
  return {
    status: match.status,
    settings: match.settings,
    seats: match.seats,
    hand: h ? publicHand(h) : null,
    results: match.results,
    totals: match.totals,
    teamAdjust: match.teamAdjust,
    nextHandAt: match.nextHandAt,
    winner: match.winner,
    log: match.log.slice(-30),
  };
}

function publicHand(h: HandState): PublicHand {
  return {
    handNumber: h.handNumber, dealerSeat: h.dealerSeat, starterSeat: h.starterSeat,
    deckCount: h.deck.length, gosterge: h.gosterge, okey: h.okey,
    players: h.players.map((p) => ({
      seat: p.seat, tileCount: p.rack.length, opened: p.opened, openingValue: p.openingValue,
      declaredPairs: p.declaredPairs, inGamePoints: p.inGamePoints,
    })),
    melds: h.melds, discards: h.discards,
    turnSeat: h.turnSeat, phase: h.phase, turnIndex: h.turnIndex,
    turnStartedAt: h.turnStartedAt, turnDeadline: h.turnDeadline,
    openedThisTurn: h.openedThisTurn, lastDeckDrawn: h.lastDeckDrawn,
    islekWindow: h.islekWindow ? { seat: h.islekWindow.seat, tileId: h.islekWindow.tileId } : null,
    highestSeriesOpening: h.highestSeriesOpening, highestPairOpening: h.highestPairOpening,
    result: h.result,
  };
}

export function privateView(match: MatchState, seat: number): PrivateHandView | null {
  const h = match.hand;
  if (!h) return null;
  const p = h.players[seat];
  return {
    seat, handNumber: h.handNumber, rack: p.rack,
    sideTakenTileId: p.sideTakenTileId, sideObligation: p.sideObligation,
    stolenOkeyIds: p.stolen.map((s) => s.okeyTileId),
  };
}
