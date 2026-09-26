import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import {
  CONST, canReplaceJoker, isOkeyTile, mod3, tileById, tryExtend, faceValue,
  type Action, type Meld, type MeldContext, type PublicMatchView, type Tile,
} from '@okey101/engine';
import { t } from '@okey101/shared';
import { api } from '../api';
import { errMessage } from '../errors';
import type { TableState } from '../hooks/useTable';
import { useServerClock } from '../hooks/useTable';
import { useToast } from '../components/Toast';
import { TileBack, TileView } from '../components/Tile';
import { Rack, reconcile, sortedOrder } from '../components/Rack';
import { ScoreBoard } from '../components/ScoreBoard';
import { inferMeld, toInput, type Inferred } from '../game/selection';

export function Game({ tableId, user, state }: { tableId: string; user: User; state: TableState }) {
  const nav = useNavigate();
  const toast = useToast();
  const view = state.view!;
  const hand = view.hand!;
  const priv = state.hand;
  const now = useServerClock(state.offset);
  const settings = view.settings;
  const mySeat = view.seats.findIndex((s) => s.uid === user.uid);
  const seated = mySeat >= 0;
  const me = seated ? hand.players[mySeat] : null;
  const myTurn = seated && hand.turnSeat === mySeat && hand.phase !== 'finished';
  const mctx: MeldContext = useMemo(() => ({ okey: hand.okey, gosterge: hand.gosterge, k3: settings.rules.k3 }), [hand.okey, hand.gosterge, settings.rules.k3]);
  const isOkey = useCallback((tile: Tile) => isOkeyTile(tile, hand.okey), [hand.okey]);
  const okeyTile: Tile = useMemo(() => ({ id: -1, color: hand.okey.color, number: hand.okey.number }), [hand.okey]);

  // ---- local UI state ----
  const rackTiles = priv?.rack ?? [];
  const orderKey = `okey101.rack.${tableId}.${hand.handNumber}`;
  const [order, setOrderState] = useState<(number | null)[]>(() => {
    try { return reconcile(JSON.parse(localStorage.getItem(orderKey) || 'null'), rackTiles); } catch { return reconcile(null, rackTiles); }
  });
  useEffect(() => { setOrderState((o) => reconcile(o, rackTiles)); }, [priv?.rack.map((x) => x.id).join(','), hand.handNumber]);
  const setOrder = (o: (number | null)[]) => { setOrderState(o); try { localStorage.setItem(orderKey, JSON.stringify(o)); } catch {} };
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [groups, setGroups] = useState<Inferred[]>([]);
  const [busy, setBusy] = useState(false);
  const [areaPick, setAreaPick] = useState<Inferred | null>(null);
  useEffect(() => { setSelected(new Set()); setGroups([]); }, [hand.handNumber, hand.turnIndex]);
  useEffect(() => { // drop selections that left the rack
    const ids = new Set(rackTiles.map((x) => x.id));
    setSelected((s) => new Set([...s].filter((id) => ids.has(id))));
    setGroups((g) => g.filter((gr) => gr.tiles.every((x) => ids.has(x.tile.id))));
  }, [priv?.rack.map((x) => x.id).join(',')]);

  const play = useCallback(async (action: Action, silent = false) => {
    if (busy) return false;
    setBusy(true);
    try { await api.play(tableId, action); return true; }
    catch (e) { if (!silent) toast(errMessage(e)); return false; }
    finally { setBusy(false); }
  }, [tableId, busy, toast]);

  // ---- timers: timeout + next hand (any client may trigger; server verifies) ----
  const fired = useRef<string>('');
  useEffect(() => {
    if (!seated) return;
    if (hand.phase === 'finished') {
      if (view.status === 'playing' && view.nextHandAt && now > view.nextHandAt + 300) {
        const key = `next-${hand.handNumber}`;
        if (fired.current !== key && (mySeat === hand.dealerSeat || now > view.nextHandAt + 3000)) { fired.current = key; play({ type: 'nextHand' }, true); }
      }
      return;
    }
    const grace = hand.turnSeat === mySeat ? 700 : 3500;
    if (now > hand.turnDeadline + grace) {
      const key = `to-${hand.handNumber}-${hand.turnIndex}`;
      if (fired.current !== key) { fired.current = key; play({ type: 'timeout' }, true); }
    }
  }, [now, hand.phase, hand.turnDeadline, hand.turnIndex, hand.handNumber, view.nextHandAt, view.status, seated, mySeat]);

  // ---- derived ----
  const selTiles = useMemo(() => order.filter((id): id is number => id !== null && selected.has(id)).map((id) => ({ tile: tileById(id), joker: flipped.has(id) })), [order, selected, flipped]);
  const inferred = useMemo(() => (selTiles.length >= 2 ? inferMeld(selTiles, mctx) : null), [selTiles, mctx]);
  const groupIds = useMemo(() => new Set(groups.flatMap((g) => g.tiles.map((x) => x.tile.id))), [groups]);
  const groupsPoints = groups.reduce((s, g) => s + g.points, 0);
  const groupsKind: 'series' | 'pairs' | null = groups.length === 0 ? null : groups.every((g) => g.kind === 'pair') ? 'pairs' : groups.every((g) => g.kind !== 'pair') ? 'series' : null;
  const seriesThreshold = settings.rules.k4 ? Math.max(CONST.OPEN_THRESHOLD, hand.highestSeriesOpening + 1) : CONST.OPEN_THRESHOLD;
  const pairThreshold = settings.rules.k4 ? Math.max(CONST.PAIR_THRESHOLD, hand.highestPairOpening + 1) : CONST.PAIR_THRESHOLD;
  const canOpen = me?.opened === 'none' && groupsKind !== null && (groupsKind === 'series' ? groupsPoints >= seriesThreshold && !me.declaredPairs : groups.length >= pairThreshold);
  const single = selTiles.length === 1 ? selTiles[0] : null;
  const handValue = rackTiles.reduce((s, x) => s + faceValue(x, hand.okey), 0);
  const fmt = (n: number) => (settings.rules.k7 ? mod3(n) : String(n));
  const leftSeat = (mySeat + 3) % 4;
  const sidePile = hand.discards[leftSeat] ?? [];
  const sideTile = sidePile[sidePile.length - 1];
  const sideTakeable = !!sideTile && sideTile.turnIndex === hand.turnIndex - 1 && !sideTile.penalized;
  const canPress = settings.rules.k9 && hand.islekWindow && seated && hand.islekWindow.seat !== mySeat && (settings.mode !== 'teams' || hand.islekWindow.seat % 2 !== mySeat % 2);
  const pairOpeners = hand.players.filter((p) => p.opened === 'pairs').map((p) => p.seat);

  // extend / steal targets for the single selected tile (opened players only)
  const targets = useMemo(() => {
    const ext = new Map<string, Set<'front' | 'back'>>();
    const steal = new Map<string, Set<number>>();
    if (!single || !me || me.opened === 'none' || !myTurn || hand.phase !== 'act') return { ext, steal };
    for (const m of hand.melds) {
      if (m.kind !== 'pair') {
        const ends = new Set<'front' | 'back'>();
        if (tryExtend(m, single.tile, single.joker, 'back', mctx)) ends.add('back');
        if (m.kind === 'run' && tryExtend(m, single.tile, single.joker, 'front', mctx)) ends.add('front');
        if (ends.size) ext.set(m.id, ends);
      }
      if (!single.joker) {
        const idx = new Set<number>();
        m.tiles.forEach((mt, i) => { if (mt.joker && canReplaceJoker(m, i, single.tile, mctx)) idx.add(i); });
        if (idx.size) steal.set(m.id, idx);
      }
    }
    return { ext, steal };
  }, [single, me?.opened, myTurn, hand.phase, hand.melds, mctx]);

  // ---- handlers ----
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addGroup = () => { if (inferred) { setGroups([...groups, inferred]); setSelected(new Set()); } };
  const removeGroup = (i: number) => setGroups(groups.filter((_, j) => j !== i));
  const doOpen = async () => {
    if (!groupsKind) return;
    if (await play({ type: 'open', kind: groupsKind, melds: groups.map(toInput) })) setGroups([]);
  };
  const doLay = async (m: Inferred, areaSeat?: number) => {
    if (m.kind === 'pair' && me?.opened === 'series' && pairOpeners.length > 1 && areaSeat === undefined) { setAreaPick(m); return; }
    if (await play({ type: 'layMeld', meld: toInput(m), areaSeat })) { setSelected(new Set()); setAreaPick(null); }
  };
  const doDiscard = async () => { if (single && (await play({ type: 'discard', tileId: single.tile.id }))) setSelected(new Set()); };
  const doExtend = async (meldId: string, end: 'front' | 'back') => { if (single && (await play({ type: 'extend', meldId, tileId: single.tile.id, joker: single.joker || undefined, end }))) setSelected(new Set()); };
  const doSteal = async (meldId: string, index: number) => { if (single && (await play({ type: 'stealOkey', meldId, index, tileId: single.tile.id }))) setSelected(new Set()); };
  const flipSelected = () => setFlipped((f) => { const n = new Set(f); for (const x of selTiles) if (isOkey(x.tile)) n.has(x.tile.id) ? n.delete(x.tile.id) : n.add(x.tile.id); return n; });
  const hasOkeySelected = selTiles.some((x) => isOkey(x.tile));

  // ---- rendering helpers ----
  const rel = (offset: number) => (mySeat + offset) % 4; // seats relative to me
  const name = (seat: number) => view.seats[seat]?.name ?? `#${seat + 1}`;
  const secondsLeft = Math.max(0, Math.ceil((hand.turnDeadline - now) / 1000));
  const turnTotal = Math.max(1, hand.turnDeadline - hand.turnStartedAt);
  const ringPct = Math.max(0, Math.min(100, ((hand.turnDeadline - now) / turnTotal) * 100));

  const Plate = ({ seat, cls }: { seat: number; cls: string }) => {
    const p = hand.players[seat];
    const active = hand.turnSeat === seat && hand.phase !== 'finished';
    return (
      <div className={`plate ${cls} ${active ? 'active' : ''}`}>
        <div className="name">{name(seat)}{seat === mySeat && <span className="chip">{t('common.you')}</span>}</div>
        <div className="meta">{t('game.tiles', { n: p.tileCount })} · {p.opened === 'none' ? (p.declaredPairs ? t('game.declared') : t('game.notOpened')) : t(`game.opened.${p.opened}`, { v: fmt(p.openingValue) })}</div>
        <div className="meta">{view.totals[seat]} {t('common.points')}{p.inGamePoints ? <span className="pen"> · {p.inGamePoints > 0 ? '+' : ''}{p.inGamePoints}</span> : null}</div>
        {active && <div className={`ring ${secondsLeft <= 5 ? 'low' : ''}`} style={{ width: `${ringPct}%` }} />}
      </div>
    );
  };

  const MeldBox = ({ m }: { m: Meld }) => {
    const ends = targets.ext.get(m.id);
    const steal = targets.steal.get(m.id);
    return (
      <div className={`meld ${m.kind === 'pair' ? 'pair-area' : ''}`}>
        {m.kind === 'run' && <div className={`end ${ends?.has('front') ? 'hot' : ''}`} onClick={() => ends?.has('front') && doExtend(m.id, 'front')} />}
        {m.tiles.map((mt, i) => (
          <TileView key={mt.tile.id} tile={mt.tile} size="sm" joker={mt.joker} hot={steal?.has(i)} onClick={steal?.has(i) ? () => doSteal(m.id, i) : undefined} />
        ))}
        {m.kind !== 'pair' && <div className={`end ${ends?.has('back') ? 'hot' : ''}`} onClick={() => ends?.has('back') && doExtend(m.id, 'back')} />}
      </div>
    );
  };

  const meldsByArea = [0, 1, 2, 3].map((s) => ({ seat: s, melds: hand.melds.filter((m) => m.areaSeat === s) })).filter((g) => g.melds.length);

  // hints
  let hint = '';
  let warn = false;
  if (!seated) hint = t('game.spectating');
  else if (hand.phase === 'finished') hint = '';
  else if (!myTurn) hint = t('game.turnOf', { name: name(hand.turnSeat) });
  else if (hand.phase === 'draw') hint = t('game.drawPhase');
  else if (priv?.sideObligation) { hint = t('game.sideObligation'); warn = true; }
  else if (priv?.stolenOkeyIds.length && !settings.rules.k8) { hint = t('game.stolenObligation'); warn = true; }
  else if (me?.opened === 'none') hint = t('game.groupHint');
  else hint = t('game.actPhase');

  const secondsToNext = view.nextHandAt ? Math.ceil((view.nextHandAt - now) / 1000) : null;

  return (
    <div className="game">
      <div className="topbar">
        <span className="status">{t('game.hand', { n: hand.handNumber, total: settings.hands })}</span>
        <span className="row" style={{ gap: 6 }}>{t('game.okey')} <TileView tile={okeyTile} size="xs" /></span>
        {me && <span>{t('game.handValue', { v: fmt(handValue) })}</span>}
        {me?.opened === 'none' && <span>{groupsKind === 'pairs' ? t('game.threshold.pairs', { v: pairThreshold }) : t('game.threshold', { v: fmt(seriesThreshold) })}</span>}
        <span className="spacer" />
        {hand.phase !== 'finished' && <span className="status" style={{ fontVariantNumeric: 'tabular-nums' }}>{secondsLeft} sn</span>}
        <button className="tbtn ghost sm" onClick={() => { if (confirm(t('game.leaveConfirm'))) nav('/'); }}>{t('common.leave')}</button>
      </div>

      <div className="table">
        <div className="seat-left"><Plate seat={rel(3)} cls="" /></div>
        <div className="seat-top">
          <Plate seat={rel(2)} cls="" />
          <div className="stock">
            <div>
              <div style={{ position: 'relative' }} className={myTurn && hand.phase === 'draw' ? 'tile hot back' : 'tile back'} onClick={() => myTurn && hand.phase === 'draw' && play({ type: 'draw' })} role="button" aria-label={t('game.draw')}>
                <span className="n" style={{ color: 'var(--ivory)', fontSize: 18 }}>{hand.deckCount}</span>
              </div>
              <div className="count">{t('game.deck')}</div>
            </div>
            <div>
              <TileView tile={hand.gosterge} />
              <div className="count">{t('game.gosterge')}</div>
            </div>
          </div>
        </div>
        <div className="seat-right"><Plate seat={rel(1)} cls="" /></div>
        {[{ seat: rel(2), cls: 'tl' }, { seat: rel(1), cls: 'tr' }].map(({ seat, cls }) => {
          const last = hand.discards[seat].at(-1);
          return (
            <div className={`corner ${cls}`} key={cls}>
              <div className="slot">{last ? <TileView tile={last.tile} penalized={last.penalized} /> : null}</div>
              <span>{name(seat)}</span>
            </div>
          );
        })}
        <div className="center">
          <div className="melds">
            {meldsByArea.map((g) => (
              <div className="meldgroup" key={g.seat}>
                <span className="who">{name(g.seat)}</span>
                <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>{g.melds.map((m) => <MeldBox key={m.id} m={m} />)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bottom">
        <div className="actions">
          <span className={`hint ${warn ? 'warn' : ''}`}>{hint}</span>
          <span className="spacer" />
          {canPress && <button className="tbtn accent sm" disabled={busy} onClick={() => play({ type: 'pressIslek' })}>{t('game.islek')}</button>}
          {myTurn && hand.phase === 'draw' && <>
            <button className="tbtn sm" disabled={busy} onClick={() => play({ type: 'draw' })}>{t('game.draw')}</button>
            <button className="tbtn sm" disabled={busy || !sideTakeable} onClick={() => play({ type: 'takeSide' })}>{t('game.takeSide')}</button>
          </>}
          {myTurn && settings.rules.k5 && me?.opened === 'none' && !me.declaredPairs && <button className="tbtn ghost sm" disabled={busy} onClick={() => play({ type: 'declarePairs' })}>{t('game.declare')}</button>}
          {myTurn && hand.phase === 'act' && <>
            {hasOkeySelected && <button className="tbtn ghost sm" onClick={flipSelected}>{t('game.flipOkey')}</button>}
            {priv?.sideObligation && <button className="tbtn ghost sm" disabled={busy} onClick={() => play({ type: 'returnSide' })}>{t('game.returnSide')}</button>}
            {me?.opened === 'none' && <>
              <button className="tbtn sm" disabled={!inferred || selTiles.some((x) => groupIds.has(x.tile.id))} onClick={addGroup}>{t('game.addGroup')}{inferred ? ` (${inferred.kind === 'pair' ? t('game.layPair') : inferred.points})` : ''}</button>
              <button className="tbtn sm" disabled={busy || !canOpen} onClick={doOpen}>{groupsKind === 'pairs' ? t('game.openPairs') : t('game.open')}</button>
            </>}
            {me && me.opened !== 'none' && <button className="tbtn sm" disabled={busy || !inferred} onClick={() => inferred && doLay(inferred)}>{inferred?.kind === 'pair' ? t('game.layPair') : t('game.lay')}{inferred && inferred.kind !== 'pair' ? ` (${inferred.points})` : ''}</button>}
            <button className="tbtn sm" disabled={busy || !single} onClick={doDiscard}>{t('game.discard')}</button>
          </>}
          <button className="tbtn ghost sm" onClick={() => setOrder(sortedOrder(rackTiles, 'color', hand.okey.number))} title="Renge göre diz">Renk</button>
          <button className="tbtn ghost sm" onClick={() => setOrder(sortedOrder(rackTiles, 'number', hand.okey.number))} title="Sayıya göre diz">Sayı</button>
        </div>
        {groups.length > 0 && (
          <div className="groups">
            <span className="hint">{groupsKind === 'pairs' ? t('game.groupsPairs', { n: groups.length }) : t('game.groups', { n: groups.length, v: fmt(groupsPoints) })}</span>
            {groups.map((g, i) => (
              <div className="group" key={i} onClick={() => removeGroup(i)} title={t('common.cancel')}>
                {g.tiles.map((x) => <TileView key={x.tile.id} tile={x.tile} size="xs" joker={x.joker} />)}
              </div>
            ))}
            <button className="tbtn ghost sm" onClick={() => setGroups([])}>{t('game.clearGroups')}</button>
          </div>
        )}
        <div className="rackwrap">
          <div className="sides">
            <div className="side">
              <span>{name(leftSeat)}</span>
              <div className="slot">{sideTile ? <TileView tile={sideTile.tile} penalized={sideTile.penalized} hot={myTurn && hand.phase === 'draw' && sideTakeable} onClick={() => myTurn && hand.phase === 'draw' && sideTakeable && play({ type: 'takeSide' })} /> : null}</div>
            </div>
            <div className="side side-mine">
              <div className="slot" onClick={doDiscard}>{seated && hand.discards[mySeat].length > 0 ? <TileView tile={hand.discards[mySeat].at(-1)!.tile} penalized={hand.discards[mySeat].at(-1)!.penalized} /> : <TileBack className="xs" />}</div>
              <span>{seated ? t('common.you') : ''}</span>
            </div>
          </div>
          {seated ? (
            <Rack tiles={rackTiles} order={order} onOrder={setOrder} selected={selected} onToggle={toggle} flipped={flipped} isOkey={isOkey} dimIds={groupIds} highlightId={priv?.sideObligation ? priv.sideTakenTileId : null} />
          ) : <div className="rack" />}
        </div>
        <div className="log">
          {view.log.slice(-3).reverse().map((l, i) => <div key={i}>{l.seat !== null && <b>{name(l.seat)} </b>}{t(l.key, l.params)}</div>)}
        </div>
      </div>

      {areaPick && (
        <div className="overlay" onClick={() => setAreaPick(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>{t('game.chooseArea')}</h2>
            <div className="row">{pairOpeners.map((s) => <button key={s} className="tbtn" onClick={() => doLay(areaPick, s)}>{name(s)}</button>)}</div>
          </div>
        </div>
      )}
      {hand.phase === 'finished' && hand.result && (
        <ScoreBoard view={view} result={hand.result} secondsToNext={secondsToNext} onMenu={() => nav('/')} />
      )}
    </div>
  );
}
