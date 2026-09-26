import type { HandResult, PublicMatchView } from '@okey101/engine';
import { t } from '@okey101/shared';

export function ScoreBoard({ view, result, secondsToNext, onMenu }: { view: PublicMatchView; result: HandResult; secondsToNext: number | null; onMenu: () => void }) {
  const teams = view.settings.mode === 'teams';
  const finished = view.status === 'finished';
  const name = (seat: number) => view.seats[seat]?.name ?? `#${seat + 1}`;
  const finishText = result.finisherSeat === null ? t('game.deckExhausted')
    : `${t('game.finishedBy', { name: name(result.finisherSeat) })}${result.finish ? [result.finish.pairs && t('game.finish.pairs'), result.finish.okey && t('game.finish.okey'), result.finish.elden && t('game.finish.elden')].filter(Boolean).map((s) => ` · ${s}`).join('') : ''}`;
  const teamTotal = (tm: 0 | 1) => view.totals[tm] + view.totals[tm + 2] + view.teamAdjust[tm];
  const winnerText = view.winner ? (view.winner.seats.length === 4 || (!teams && view.winner.seats.length > 1) ? t('score.tie')
    : t('score.winner', { name: teams ? (view.winner.seats[0] === 0 ? t('score.teamA') : t('score.teamB')) : view.winner.seats.map(name).join(', ') })) : '';

  return (
    <div className="overlay">
      <div className="card">
        <h2>{finished ? t('score.final') : `${t('score.title')} · ${t('game.hand', { n: result.handNumber, total: view.settings.hands })}`}</h2>
        <p className="muted" style={{ marginTop: -8 }}>{finishText}{result.multiplier > 1 && ` · ${t('game.multiplier', { m: result.multiplier })}`}</p>
        <table className="score">
          <thead><tr><th>{t('score.player')}</th><th>{t('score.base')}</th><th>{t('score.mult')}</th><th>{t('score.extra')}</th><th>{t('score.inGame')}</th><th>{t('score.hand')}</th><th>{t('score.total')}</th></tr></thead>
          <tbody>
            {result.seats.map((s) => (
              <tr key={s.seat}>
                <td>{name(s.seat)}<span className="reason">{t(`score.reason.${s.reason}`)}</span></td>
                <td>{s.base}</td><td>×{s.multiplier}</td><td>{s.extra || ''}</td><td>{s.inGame || ''}</td>
                <td className={s.total < 0 ? 'neg' : ''}>{s.total}</td>
                <td className={view.totals[s.seat] < 0 ? 'neg' : ''}><b>{view.totals[s.seat]}</b></td>
              </tr>
            ))}
            {teams && (
              <>
                <tr><td>{t('score.teamA')}</td><td colSpan={4}></td><td>{result.seats[0].total + result.seats[2].total + result.teamAdjust[0]}</td><td><b>{teamTotal(0)}</b></td></tr>
                <tr><td>{t('score.teamB')}</td><td colSpan={4}></td><td>{result.seats[1].total + result.seats[3].total + result.teamAdjust[1]}</td><td><b>{teamTotal(1)}</b></td></tr>
              </>
            )}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 20 }}>
          {finished ? <><b>{winnerText}</b><span className="spacer" /><button className="tbtn" onClick={onMenu}>{t('score.toMenu')}</button></>
            : <span className="muted">{secondsToNext !== null ? t('game.waitingNext', { s: Math.max(0, secondsToNext) }) : ''}</span>}
        </div>
      </div>
    </div>
  );
}
