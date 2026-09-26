// Core types of the 101 Okey engine. Pure data, no classes.

export type Color = 'red' | 'yellow' | 'blue' | 'black';
export const COLORS: Color[] = ['red', 'yellow', 'blue', 'black'];

export interface Tile {
  id: number;            // 0..103 numbered, 104/105 sahte okey
  color: Color | 'fake';
  number: number;        // 1..13, 0 for sahte okey
}

export interface TileIdentity { color: Color; number: number }

export type OpenKind = 'none' | 'series' | 'pairs';
export type MeldKind = 'run' | 'set' | 'pair';

export interface MeldTile {
  tile: Tile;
  /** Okey (or gösterge eşi under K3) used as a wildcard. */
  joker: boolean;
}

export interface Meld {
  id: string;
  kind: MeldKind;
  tiles: MeldTile[];
  /** Seat of the player who laid the meld (penalty target on okey steal). */
  ownerSeat: number;
  /** Seat whose area the meld sits in (pairs may sit in front of a pair-opener). */
  areaSeat: number;
}

export interface Discard {
  tile: Tile;
  turnIndex: number;
  penalized: boolean;
  returned?: boolean;
}

export interface StolenOkey {
  okeyTileId: number;
  meldId: string;
  index: number;
  replacedTileId: number;
  penalizedSeat: number | null;
}

export interface PlayerHand {
  seat: number;
  rack: Tile[];
  opened: OpenKind;
  openingValue: number;          // series total or pair count
  openedTurnIndex: number | null;
  declaredPairs: boolean;        // K5
  openingDeclared: boolean;      // pressed "Aç" this turn; taking back or timing out costs 101
  sideTakenTileId: number | null;
  sideObligation: boolean;       // must lay the side-taken tile this turn
  stolen: StolenOkey[];
  inGamePoints: number;          // 3.3 penalties, K2, K6 (a) bonus etc. (can be negative)
  nextTurnPenaltySeconds: number; // K9 wrong press
}

export interface IslekWindow {
  seat: number;          // discarder
  tileId: number;
  applicable: boolean;   // was the discard actually işlek or okey
}

export interface HandState {
  handNumber: number;    // 1-based
  dealerSeat: number;
  starterSeat: number;
  deck: Tile[];
  gosterge: Tile;
  okey: TileIdentity;
  players: PlayerHand[];
  melds: Meld[];
  discards: Discard[][]; // per seat
  turnSeat: number;
  phase: 'draw' | 'act' | 'finished';
  turnIndex: number;
  turnStartedAt: number;
  turnDeadline: number;
  extendsThisTurn: Record<string, number>;
  openedThisTurn: boolean;
  lastDeckDrawn: boolean;
  islekWindow: IslekWindow | null;
  highestSeriesOpening: number;
  highestPairOpening: number;
  meldSeq: number;
  teamPoints: [number, number]; // team-level in-game points (K6 b)
  result: HandResult | null;
}

export interface SeatScore {
  seat: number;
  base: number;          // before multiplier
  multiplier: number;
  extra: number;         // aşım cezası
  inGame: number;
  total: number;
  remaining: number;     // remaining tile points (info)
  reason: 'finisher' | 'teammate' | 'series' | 'pairs' | 'notOpened' | 'declaredPairs';
}

export interface HandResult {
  handNumber: number;
  finisherSeat: number | null;
  finish: { pairs: boolean; okey: boolean; elden: boolean } | null;
  deckExhausted: boolean;
  multiplier: number;
  seats: SeatScore[];
  teamAdjust: [number, number];
}

export interface RuleFlags {
  k1: boolean; k2: boolean; k3: boolean; k4: boolean; k5: boolean;
  k6: boolean; k7: boolean; k8: boolean; k9: boolean; k10: boolean;
}

export interface TableSettings {
  mode: 'single' | 'teams';
  hands: 5 | 7 | 9 | 11;
  turnSeconds: number;
  finishReward: 'finisher' | 'opponents'; // 3.5 (teams only)
  k6Mode: 'self' | 'others';
  rules: RuleFlags;
}

export const CONST = {
  OPEN_THRESHOLD: 101,
  PAIR_THRESHOLD: 5,
  NOT_OPENED: 202,
  DECLARED_NOT_OPENED: 404,
  FINISH_REWARD: 101,
  PENALTY: 101,
  OVERFLOW_LIMIT: 202,
  OKEY_IN_HAND: 101,
  K6_SERIES: 150,
  K6_PAIRS: 7,
  OPEN_BONUS_SEC: 30,
  EXTEND_BONUS_SEC: 5,
  MELD_BONUS_SEC: 10,
  K9_PENALTY_SEC: 5,
  BETWEEN_HANDS_MS: 10000,
} as const;

export const DEFAULT_SETTINGS: TableSettings = {
  mode: 'single',
  hands: 9,
  turnSeconds: 30,
  finishReward: 'finisher',
  k6Mode: 'self',
  rules: { k1: false, k2: false, k3: false, k4: false, k5: false, k6: false, k7: false, k8: false, k9: false, k10: false },
};

export interface SeatInfo { uid: string; name: string }

export interface MatchState {
  settings: TableSettings;
  seats: SeatInfo[];             // 4 when playing
  status: 'waiting' | 'playing' | 'finished';
  hand: HandState | null;
  results: HandResult[];
  totals: number[];              // per seat, cumulative
  teamAdjust: [number, number];  // cumulative team-level points (teams mode)
  nextHandAt: number | null;
  seed: number;
  winner: { seats: number[] } | null; // seats of winning player/team; several = tie
  log: LogEntry[];
}

export interface LogEntry { t: number; seat: number | null; key: string; params?: Record<string, string | number> }

// ---- Actions ----
export interface MeldInput { kind: MeldKind; tiles: { tileId: number; joker?: boolean }[] }

export type Action =
  | { type: 'draw' }
  | { type: 'takeSide' }
  | { type: 'returnSide' }
  | { type: 'startOpen' }
  | { type: 'cancelOpen' }
  | { type: 'open'; kind: 'series' | 'pairs'; melds: MeldInput[] }
  | { type: 'layMeld'; meld: MeldInput; areaSeat?: number }
  | { type: 'extend'; meldId: string; tileId: number; joker?: boolean; end: 'front' | 'back' }
  | { type: 'stealOkey'; meldId: string; index: number; tileId: number }
  | { type: 'declarePairs' }
  | { type: 'discard'; tileId: number }
  | { type: 'pressIslek' }
  | { type: 'timeout' }
  | { type: 'nextHand' };

export class EngineError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}
