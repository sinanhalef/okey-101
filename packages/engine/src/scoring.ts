import { CONST, type HandResult, type HandState, type SeatScore, type TableSettings } from './types';
import { handValue } from './tiles';

export function teamOf(seat: number): 0 | 1 { return (seat % 2) as 0 | 1; }
export function sameTeam(a: number, b: number, settings: TableSettings): boolean {
  return settings.mode === 'teams' ? teamOf(a) === teamOf(b) : a === b;
}

export interface FinishInfo { seat: number; pairs: boolean; okey: boolean; elden: boolean }

export function finishMultiplier(f: FinishInfo | null): number {
  if (!f) return 1;
  let m = 1;
  if (f.pairs) m *= 2;
  if (f.okey) m *= 2;
  if (f.elden) m *= 2;
  return m;
}

/** 3.1–3.5: compute the hand result. Does not mutate. */
export function scoreHand(hand: HandState, settings: TableSettings, finish: FinishInfo | null): HandResult {
  const m = finishMultiplier(finish);
  const seats: SeatScore[] = [];
  const teamAdjust: [number, number] = [0, 0];
  for (const p of hand.players) {
    const remaining = p.rack.reduce((s, t) => s + handValue(t, hand.okey, CONST.OKEY_IN_HAND), 0);
    let base = 0;
    let extra = 0;
    let reason: SeatScore['reason'];
    if (finish && finish.seat === p.seat) {
      reason = 'finisher';
      if (settings.mode === 'teams' && settings.finishReward === 'opponents') {
        base = 0;
        teamAdjust[1 - teamOf(p.seat)] += CONST.FINISH_REWARD * m;
      } else {
        base = -CONST.FINISH_REWARD;
      }
    } else if (finish && settings.mode === 'teams' && teamOf(p.seat) === teamOf(finish.seat)) {
      reason = 'teammate';
      base = 0;
    } else if (p.opened === 'series') {
      reason = 'series';
      base = remaining;
    } else if (p.opened === 'pairs') {
      reason = 'pairs';
      base = remaining * 2;
    } else if (p.declaredPairs) {
      reason = 'declaredPairs';
      base = CONST.DECLARED_NOT_OPENED;
    } else {
      reason = 'notOpened';
      base = CONST.NOT_OPENED;
    }
    if ((reason === 'series' || reason === 'pairs') && base > CONST.OVERFLOW_LIMIT) extra = CONST.PENALTY;
    const total = base * m + extra + p.inGamePoints;
    seats.push({ seat: p.seat, base, multiplier: m, extra, inGame: p.inGamePoints, total, remaining, reason });
  }
  return {
    handNumber: hand.handNumber,
    finisherSeat: finish ? finish.seat : null,
    finish: finish ? { pairs: finish.pairs, okey: finish.okey, elden: finish.elden } : null,
    deckExhausted: finish === null,
    multiplier: m,
    seats,
    teamAdjust,
  };
}

/** K7 display helper: n -> "q yan r" (or "q" when r == 0). */
export function mod3(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const q = Math.floor(a / 3);
  const r = a % 3;
  return r === 0 ? `${sign}${q}` : `${sign}${q} yan ${r}`;
}
