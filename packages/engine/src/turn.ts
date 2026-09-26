import {
  CONST, EngineError, type Action, type HandState, type MatchState, type Meld, type MeldInput,
  type MeldTile, type PlayerHand, type SeatInfo, type TableSettings, type Tile,
} from './types';
import { faceValue, isOkeyTile, tileById } from './tiles';
import { buildSlots, canReplaceJoker, isIslek, meldPoints, slotOf, tryExtend, type MeldContext } from './melds';
import { dealHand } from './deal';
import { sameTeam, scoreHand, teamOf, type FinishInfo } from './scoring';
import { mulberry32 } from './rng';

export interface ApplyContext { now: number; seat: number | null }

// ---------- helpers ----------

function ctxOf(hand: HandState, settings: TableSettings): MeldContext {
  return { okey: hand.okey, gosterge: hand.gosterge, k3: settings.rules.k3 };
}

function log(match: MatchState, seat: number | null, key: string, params?: Record<string, string | number>, now = Date.now()) {
  match.log.push({ t: now, seat, key, params });
  if (match.log.length > 60) match.log.splice(0, match.log.length - 60);
}

function requireHand(match: MatchState): HandState {
  if (match.status !== 'playing' || !match.hand) throw new EngineError('NOT_PLAYING');
  return match.hand;
}

function requireTurn(match: MatchState, ctx: ApplyContext): { hand: HandState; p: PlayerHand } {
  const hand = requireHand(match);
  if (hand.phase === 'finished') throw new EngineError('HAND_FINISHED');
  if (ctx.seat === null || ctx.seat !== hand.turnSeat) throw new EngineError('NOT_YOUR_TURN');
  return { hand, p: hand.players[ctx.seat] };
}

function takeFromRack(p: PlayerHand, ids: number[]): Tile[] {
  const out: Tile[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) throw new EngineError('DUPLICATE_TILE');
    seen.add(id);
    const idx = p.rack.findIndex((t) => t.id === id);
    if (idx < 0) throw new EngineError('TILE_NOT_IN_RACK');
    out.push(p.rack[idx]);
  }
  p.rack = p.rack.filter((t) => !seen.has(t.id));
  return out;
}

function inRack(p: PlayerHand, id: number): boolean { return p.rack.some((t) => t.id === id); }

function addTime(hand: HandState, seconds: number) { hand.turnDeadline += seconds * 1000; }

function penalize(match: MatchState, hand: HandState, seat: number, points: number, key: string, params?: Record<string, string | number>, now?: number) {
  hand.players[seat].inGamePoints += points;
  log(match, seat, key, { ...(params ?? {}), points }, now);
}

function resolveMeld(p: PlayerHand, input: MeldInput, mctx: MeldContext, taken: Set<number>): MeldTile[] {
  if (!input.tiles || input.tiles.length === 0) throw new EngineError('EMPTY_MELD');
  const tiles: { tile: Tile; joker: boolean }[] = [];
  for (const t of input.tiles) {
    if (taken.has(t.tileId)) throw new EngineError('DUPLICATE_TILE');
    if (!inRack(p, t.tileId)) throw new EngineError('TILE_NOT_IN_RACK');
    taken.add(t.tileId);
    tiles.push({ tile: tileById(t.tileId), joker: !!t.joker });
  }
  const built = buildSlots(input.kind, tiles, mctx);
  if (!built) throw new EngineError('INVALID_MELD');
  return built;
}

function nextMeldId(hand: HandState): string { hand.meldSeq += 1; return `m${hand.handNumber}-${hand.meldSeq}`; }

function drawTile(hand: HandState, p: PlayerHand) {
  const t = hand.deck.pop();
  if (!t) throw new EngineError('DECK_EMPTY');
  p.rack.push(t);
  if (hand.deck.length === 0) hand.lastDeckDrawn = true;
  hand.islekWindow = null;
}

/** 2.2 failure: return side-taken tile, penalty (unless K10), draw from deck. */
function returnSideTile(match: MatchState, hand: HandState, p: PlayerHand, settings: TableSettings, now: number) {
  const id = p.sideTakenTileId;
  if (id === null || !inRack(p, id)) return;
  const [tile] = takeFromRack(p, [id]);
  const left = (p.seat + 3) % 4;
  const pile = hand.discards[left];
  pile.push({ tile, turnIndex: hand.turnIndex - 1, penalized: false, returned: true });
  p.sideTakenTileId = null;
  p.sideObligation = false;
  if (!settings.rules.k10) penalize(match, hand, p.seat, CONST.PENALTY, 'penalty.sideReturn', undefined, now);
  else log(match, p.seat, 'info.sideReturned', undefined, now);
  if (hand.deck.length > 0) drawTile(hand, p);
}

/** Revert unused stolen okeys (K8 off) and clear records. Returns true if `tileId` was a stolen okey still in rack. */
function settleStolen(match: MatchState, hand: HandState, p: PlayerHand, settings: TableSettings, discardId: number | null, now: number) {
  for (const s of p.stolen) {
    if (!inRack(p, s.okeyTileId)) continue; // used
    if (settings.rules.k8) continue; // may keep
    if (discardId === s.okeyTileId) throw new EngineError('STOLEN_OKEY_MUST_BE_USED');
    const meld = hand.melds.find((m) => m.id === s.meldId);
    if (!meld) continue;
    const [okeyTile] = takeFromRack(p, [s.okeyTileId]);
    const replaced = meld.tiles[s.index].tile;
    meld.tiles[s.index] = { tile: okeyTile, joker: true };
    p.rack.push(replaced);
    if (s.penalizedSeat !== null) penalize(match, hand, s.penalizedSeat, -CONST.PENALTY, 'info.okeyStealReverted', undefined, now);
  }
  p.stolen = [];
}

function startTurn(hand: HandState, seat: number, settings: TableSettings, now: number) {
  const p = hand.players[seat];
  hand.turnSeat = seat;
  hand.phase = 'draw';
  hand.turnIndex += 1;
  hand.turnStartedAt = now;
  const secs = Math.max(5, settings.turnSeconds - p.nextTurnPenaltySeconds);
  p.nextTurnPenaltySeconds = 0;
  hand.turnDeadline = now + secs * 1000;
  hand.extendsThisTurn = {};
  hand.openedThisTurn = false;
  p.sideTakenTileId = null;
  p.sideObligation = false;
  p.stolen = [];
}

function endHand(match: MatchState, hand: HandState, finish: FinishInfo | null, now: number) {
  const settings = match.settings;
  const result = scoreHand(hand, settings, finish);
  result.teamAdjust = [result.teamAdjust[0] + hand.teamPoints[0], result.teamAdjust[1] + hand.teamPoints[1]];
  hand.result = result;
  hand.phase = 'finished';
  match.results.push(result);
  for (const s of result.seats) match.totals[s.seat] += s.total;
  match.teamAdjust = [match.teamAdjust[0] + result.teamAdjust[0], match.teamAdjust[1] + result.teamAdjust[1]];
  log(match, finish ? finish.seat : null, finish ? 'hand.finished' : 'hand.deckExhausted', { hand: hand.handNumber }, now);
  if (hand.handNumber >= settings.hands) {
    match.status = 'finished';
    match.nextHandAt = null;
    match.winner = computeWinner(match);
  } else {
    match.nextHandAt = now + CONST.BETWEEN_HANDS_MS;
  }
}

export function teamTotals(match: MatchState): [number, number] {
  return [
    match.totals[0] + match.totals[2] + match.teamAdjust[0],
    match.totals[1] + match.totals[3] + match.teamAdjust[1],
  ];
}

function computeWinner(match: MatchState): { seats: number[] } {
  if (match.settings.mode === 'teams') {
    const [a, b] = teamTotals(match);
    if (a < b) return { seats: [0, 2] };
    if (b < a) return { seats: [1, 3] };
    return { seats: [0, 1, 2, 3] };
  }
  const min = Math.min(...match.totals);
  return { seats: match.totals.map((t, i) => (t === min ? i : -1)).filter((i) => i >= 0) };
}

// ---------- match lifecycle ----------

export function startMatch(settings: TableSettings, seats: SeatInfo[], seed: number, now: number): MatchState {
  if (seats.length !== 4) throw new EngineError('NEED_FOUR_PLAYERS');
  const rand = mulberry32(seed);
  const dealer = Math.floor(rand() * 4);
  const match: MatchState = {
    settings, seats, status: 'playing', hand: null, results: [], totals: [0, 0, 0, 0], teamAdjust: [0, 0],
    nextHandAt: null, seed, winner: null, log: [],
  };
  match.hand = dealHand(1, dealer, seed ^ 0x9e3779b9, now, settings.turnSeconds);
  log(match, null, 'hand.started', { hand: 1 }, now);
  return match;
}

// ---------- actions ----------

export function applyAction(match: MatchState, action: Action, ctx: ApplyContext): MatchState {
  const settings = match.settings;
  const now = ctx.now;
  switch (action.type) {
    case 'draw': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'draw') throw new EngineError('ALREADY_DREW');
      drawTile(hand, p);
      hand.phase = 'act';
      return match;
    }
    case 'takeSide': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'draw') throw new EngineError('ALREADY_DREW');
      const left = (p.seat + 3) % 4;
      const pile = hand.discards[left];
      const last = pile[pile.length - 1];
      if (!last) throw new EngineError('NO_SIDE_TILE');
      if (last.turnIndex !== hand.turnIndex - 1) throw new EngineError('NOT_LAST_DISCARD');
      if (last.penalized) throw new EngineError('SIDE_TILE_PENALIZED');
      if (settings.rules.k1 && last.turnIndex < 4) throw new EngineError('K1_FIRST_ROUND');
      if (settings.rules.k5 && hand.players[left].declaredPairs && !p.declaredPairs) throw new EngineError('K5_BLOCKED');
      pile.pop();
      p.rack.push(last.tile);
      p.sideTakenTileId = last.tile.id;
      p.sideObligation = !p.declaredPairs;
      hand.islekWindow = null;
      hand.phase = 'act';
      log(match, p.seat, 'action.takeSide', undefined, now);
      return match;
    }
    case 'returnSide': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'act' || p.sideTakenTileId === null || !p.sideObligation) throw new EngineError('NOTHING_TO_RETURN');
      returnSideTile(match, hand, p, settings, now);
      return match;
    }
    case 'declarePairs': {
      const { hand, p } = requireTurn(match, ctx);
      if (!settings.rules.k5) throw new EngineError('K5_OFF');
      if (p.opened !== 'none' || p.declaredPairs) throw new EngineError('CANNOT_DECLARE');
      p.declaredPairs = true;
      p.sideObligation = false;
      log(match, p.seat, 'action.declarePairs', undefined, now);
      void hand;
      return match;
    }
    case 'open': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'act') throw new EngineError('MUST_DRAW_FIRST');
      if (p.opened !== 'none') throw new EngineError('ALREADY_OPENED');
      if (action.kind === 'series' && p.declaredPairs) throw new EngineError('DECLARED_PAIRS_ONLY');
      const mctx = ctxOf(hand, settings);
      const taken = new Set<number>();
      const built: MeldTile[][] = [];
      for (const mi of action.melds) {
        if (action.kind === 'series' && mi.kind === 'pair') throw new EngineError('PAIR_IN_SERIES_OPEN');
        if (action.kind === 'pairs' && mi.kind !== 'pair') throw new EngineError('NON_PAIR_IN_PAIRS_OPEN');
        built.push(resolveMeld(p, mi, mctx, taken));
      }
      let value = 0;
      if (action.kind === 'series') {
        value = built.reduce((s, tiles, i) => s + meldPoints(action.melds[i].kind, tiles.map((t) => slotOf(t, mctx))), 0);
        const threshold = settings.rules.k4 ? Math.max(CONST.OPEN_THRESHOLD, hand.highestSeriesOpening + 1) : CONST.OPEN_THRESHOLD;
        if (value < threshold) throw new EngineError('BELOW_THRESHOLD', `${value} < ${threshold}`);
      } else {
        value = built.length;
        const threshold = settings.rules.k4 ? Math.max(CONST.PAIR_THRESHOLD, hand.highestPairOpening + 1) : CONST.PAIR_THRESHOLD;
        if (value < threshold) throw new EngineError('BELOW_THRESHOLD', `${value} < ${threshold}`);
      }
      // commit
      takeFromRack(p, [...taken]);
      built.forEach((tiles, i) => hand.melds.push({ id: nextMeldId(hand), kind: action.melds[i].kind, tiles, ownerSeat: p.seat, areaSeat: p.seat }));
      p.opened = action.kind;
      p.openingValue = value;
      p.openedTurnIndex = hand.turnIndex;
      hand.openedThisTurn = true;
      if (action.kind === 'series') hand.highestSeriesOpening = Math.max(hand.highestSeriesOpening, value);
      else hand.highestPairOpening = Math.max(hand.highestPairOpening, value);
      addTime(hand, CONST.OPEN_BONUS_SEC);
      log(match, p.seat, action.kind === 'series' ? 'action.openSeries' : 'action.openPairs', { value }, now);
      // side-taken tile used in opening
      if (p.sideTakenTileId !== null && taken.has(p.sideTakenTileId)) {
        p.sideObligation = false;
        if (settings.rules.k2) {
          const left = (p.seat + 3) % 4;
          const v = faceValue(tileById(p.sideTakenTileId), hand.okey) * (action.kind === 'series' ? 10 : 20);
          penalize(match, hand, left, v, 'penalty.k2', undefined, now);
        }
      }
      // K6 bonus
      if (settings.rules.k6 && ((action.kind === 'series' && value >= CONST.K6_SERIES) || (action.kind === 'pairs' && value >= CONST.K6_PAIRS))) {
        if (settings.k6Mode === 'self') penalize(match, hand, p.seat, -CONST.PENALTY, 'bonus.k6self', undefined, now);
        else if (settings.mode === 'teams') {
          hand.teamPoints[1 - teamOf(p.seat)] += CONST.PENALTY;
          log(match, p.seat, 'bonus.k6team', undefined, now);
        } else {
          for (let s = 0; s < 4; s++) if (s !== p.seat) penalize(match, hand, s, CONST.PENALTY, 'bonus.k6others', undefined, now);
        }
      }
      return match;
    }
    case 'layMeld': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'act') throw new EngineError('MUST_DRAW_FIRST');
      if (p.opened === 'none') throw new EngineError('NOT_OPENED');
      const mctx = ctxOf(hand, settings);
      let areaSeat = p.seat;
      if (action.meld.kind === 'pair') {
        if (p.opened === 'series') {
          const openers = hand.players.filter((q) => q.opened === 'pairs').map((q) => q.seat);
          if (openers.length === 0) throw new EngineError('NO_PAIR_OPENER');
          areaSeat = action.areaSeat ?? openers[0];
          if (!openers.includes(areaSeat)) throw new EngineError('BAD_AREA_SEAT');
        }
      } else if (p.opened === 'pairs') throw new EngineError('PAIRS_OPENER_NO_MELD');
      const taken = new Set<number>();
      const tiles = resolveMeld(p, action.meld, mctx, taken);
      takeFromRack(p, [...taken]);
      hand.melds.push({ id: nextMeldId(hand), kind: action.meld.kind, tiles, ownerSeat: p.seat, areaSeat });
      addTime(hand, CONST.MELD_BONUS_SEC);
      log(match, p.seat, 'action.layMeld', { kind: action.meld.kind }, now);
      return match;
    }
    case 'extend': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'act') throw new EngineError('MUST_DRAW_FIRST');
      if (p.opened === 'none') throw new EngineError('NOT_OPENED');
      const meld = hand.melds.find((m) => m.id === action.meldId);
      if (!meld) throw new EngineError('NO_SUCH_MELD');
      if (!inRack(p, action.tileId)) throw new EngineError('TILE_NOT_IN_RACK');
      const mctx = ctxOf(hand, settings);
      const tile = tileById(action.tileId);
      const end = meld.kind === 'set' ? 'back' : action.end;
      const tiles = tryExtend(meld, tile, !!action.joker, end, mctx);
      if (!tiles) throw new EngineError('CANNOT_EXTEND');
      const key = `${meld.id}:${meld.kind === 'set' ? 'set' : end}`;
      const count = hand.extendsThisTurn[key] ?? 0;
      if (p.opened === 'pairs' && count >= 2) throw new EngineError('EXTEND_LIMIT');
      takeFromRack(p, [action.tileId]);
      meld.tiles = tiles;
      hand.extendsThisTurn[key] = count + 1;
      addTime(hand, CONST.EXTEND_BONUS_SEC);
      if (p.sideTakenTileId === action.tileId) p.sideObligation = false;
      log(match, p.seat, 'action.extend', undefined, now);
      return match;
    }
    case 'stealOkey': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'act') throw new EngineError('MUST_DRAW_FIRST');
      if (p.opened === 'none') throw new EngineError('NOT_OPENED');
      const meld = hand.melds.find((m) => m.id === action.meldId);
      if (!meld) throw new EngineError('NO_SUCH_MELD');
      if (!inRack(p, action.tileId)) throw new EngineError('TILE_NOT_IN_RACK');
      const mctx = ctxOf(hand, settings);
      const tile = tileById(action.tileId);
      if (!canReplaceJoker(meld, action.index, tile, mctx)) throw new EngineError('CANNOT_STEAL');
      const okeyTile = meld.tiles[action.index].tile;
      takeFromRack(p, [action.tileId]);
      meld.tiles[action.index] = { tile, joker: false };
      p.rack.push(okeyTile);
      let penalizedSeat: number | null = null;
      if (!sameTeam(meld.ownerSeat, p.seat, settings)) {
        penalizedSeat = meld.ownerSeat;
        penalize(match, hand, meld.ownerSeat, CONST.PENALTY, 'penalty.okeyStolen', { by: p.seat }, now);
      } else log(match, p.seat, 'action.okeyTaken', undefined, now);
      p.stolen.push({ okeyTileId: okeyTile.id, meldId: meld.id, index: action.index, replacedTileId: tile.id, penalizedSeat });
      if (p.sideTakenTileId === action.tileId) p.sideObligation = false;
      return match;
    }
    case 'discard': {
      const { hand, p } = requireTurn(match, ctx);
      if (hand.phase !== 'act') throw new EngineError('MUST_DRAW_FIRST');
      if (!inRack(p, action.tileId)) throw new EngineError('TILE_NOT_IN_RACK');
      if (p.sideObligation && p.sideTakenTileId !== null && inRack(p, p.sideTakenTileId)) {
        const wasSide = p.sideTakenTileId === action.tileId;
        returnSideTile(match, hand, p, settings, now);
        if (wasSide) return match; // player must pick another tile
      }
      settleStolen(match, hand, p, settings, action.tileId, now);
      doDiscard(match, hand, p, action.tileId, now);
      return match;
    }
    case 'pressIslek': {
      const hand = requireHand(match);
      if (!settings.rules.k9) throw new EngineError('K9_OFF');
      const w = hand.islekWindow;
      if (!w) throw new EngineError('NO_ISLEK_WINDOW');
      if (ctx.seat === null || ctx.seat === w.seat) throw new EngineError('CANNOT_PRESS');
      if (settings.mode === 'teams' && teamOf(ctx.seat) === teamOf(w.seat)) throw new EngineError('CANNOT_PRESS');
      hand.islekWindow = null;
      if (w.applicable) {
        penalize(match, hand, w.seat, CONST.PENALTY, 'penalty.islekCalled', { by: ctx.seat }, now);
        const pile = hand.discards[w.seat];
        const d = pile[pile.length - 1];
        if (d && d.tile.id === w.tileId) d.penalized = true;
      } else {
        hand.players[ctx.seat].nextTurnPenaltySeconds = CONST.K9_PENALTY_SEC;
        log(match, ctx.seat, 'info.islekWrong', undefined, now);
      }
      return match;
    }
    case 'timeout': {
      const hand = requireHand(match);
      if (hand.phase === 'finished') throw new EngineError('HAND_FINISHED');
      if (now < hand.turnDeadline) throw new EngineError('NOT_EXPIRED');
      const p = hand.players[hand.turnSeat];
      if (hand.phase === 'draw') { drawTile(hand, p); hand.phase = 'act'; }
      if (p.sideObligation && p.sideTakenTileId !== null && inRack(p, p.sideTakenTileId)) returnSideTile(match, hand, p, settings, now);
      settleStolen(match, hand, p, settings, null, now);
      const mctx = ctxOf(hand, settings);
      let pool = p.rack.filter((t) => !isOkeyTile(t, hand.okey));
      if (pool.length === 0) pool = p.rack.slice();
      const nonIslek = pool.filter((t) => !isIslek(t, hand.melds, mctx));
      if (nonIslek.length > 0) pool = nonIslek;
      pool.sort((a, b) => faceValue(a, hand.okey) - faceValue(b, hand.okey) || a.id - b.id);
      log(match, p.seat, 'info.timeout', undefined, now);
      doDiscard(match, hand, p, pool[0].id, now);
      return match;
    }
    case 'nextHand': {
      if (match.status !== 'playing' || !match.hand) throw new EngineError('NOT_PLAYING');
      if (match.hand.phase !== 'finished') throw new EngineError('HAND_NOT_FINISHED');
      if (match.nextHandAt === null || now < match.nextHandAt) throw new EngineError('TOO_EARLY');
      const n = match.hand.handNumber + 1;
      const dealer = (match.hand.dealerSeat + 1) % 4;
      match.hand = dealHand(n, dealer, (match.seed + n * 7919) >>> 0, now, settings.turnSeconds);
      match.nextHandAt = null;
      log(match, null, 'hand.started', { hand: n }, now);
      return match;
    }
    default:
      throw new EngineError('UNKNOWN_ACTION');
  }
}

function doDiscard(match: MatchState, hand: HandState, p: PlayerHand, tileId: number, now: number) {
  const settings = match.settings;
  const [tile] = takeFromRack(p, [tileId]);
  hand.discards[p.seat].push({ tile, turnIndex: hand.turnIndex, penalized: false });
  log(match, p.seat, 'action.discard', undefined, now);
  const isOkey = isOkeyTile(tile, hand.okey);
  if (p.rack.length === 0 && p.opened !== 'none') {
    endHand(match, hand, { seat: p.seat, pairs: p.opened === 'pairs', okey: isOkey, elden: hand.openedThisTurn }, now);
    return;
  }
  if (hand.lastDeckDrawn) {
    endHand(match, hand, null, now);
    return;
  }
  const mctx = ctxOf(hand, settings);
  const islek = !isOkey && isIslek(tile, hand.melds, mctx);
  if (settings.rules.k9) {
    hand.islekWindow = { seat: p.seat, tileId: tile.id, applicable: isOkey || islek };
  } else if (isOkey) {
    penalize(match, hand, p.seat, CONST.PENALTY, 'penalty.okeyDiscard', undefined, now);
    hand.discards[p.seat][hand.discards[p.seat].length - 1].penalized = true;
  } else if (islek) {
    penalize(match, hand, p.seat, CONST.PENALTY, 'penalty.islekDiscard', undefined, now);
    hand.discards[p.seat][hand.discards[p.seat].length - 1].penalized = true;
  }
  startTurn(hand, (p.seat + 1) % 4, settings, now);
}

/** Client-side helper: which melds could `tile` extend (for UI hints). */
export function extendTargets(hand: Pick<HandState, 'melds' | 'okey' | 'gosterge'>, tile: Tile, k3: boolean): { meldId: string; end: 'front' | 'back' }[] {
  const mctx: MeldContext = { okey: hand.okey, gosterge: hand.gosterge, k3 };
  const out: { meldId: string; end: 'front' | 'back' }[] = [];
  for (const m of hand.melds as Meld[]) {
    if (m.kind === 'pair') continue;
    if (tryExtend(m, tile, false, 'back', mctx)) out.push({ meldId: m.id, end: 'back' });
    if (m.kind === 'run' && tryExtend(m, tile, false, 'front', mctx)) out.push({ meldId: m.id, end: 'front' });
  }
  return out;
}
