import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import {
  CONST, canReplaceJoker, isOkeyTile, mod3, tileById, tryExtend, faceValue,
  type Action, type Meld, type MeldContext, type Tile,
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
import { bestOpening } from '../game/count';
import { groupPossible, insertAt, resolveGroup, toInput, tryAppend, type Pick, type Resolved } from '../game/staging';

interface Stage { mode: 'open' | 'lay'; groups: Pick[][] }
interface Drag {
  id: number; source: 'rack' | 'stage'; fromSlot: number | null; fromGroup: number | null;
  x: number; y: number; w: number; h: number; active: boolean;
  overSlot: number | null; overGroup: { g: number; end: 'front' | 'back' } | 'new' | null;
}

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

  // ---- rack order (local) ----
  const rackTiles = priv?.rack ?? [];
  const rackKey = priv?.rack.map((x) => x.id).join(',') ?? '';
  const orderKey = `okey101.rack.${tableId}.${hand.handNumber}`;
  const [order, setOrderState] = useState<(number | null)[]>(() => {
    try { return reconcile(JSON.parse(localStorage.getItem(orderKey) || 'null'), rackTiles); } catch { return reconcile(null, rackTiles); }
  });
  useEffect(() => { setOrderState((o) => reconcile(o, rackTiles)); }, [rackKey, hand.handNumber]);
  const setOrder = useCallback((o: (number | null)[]) => { setOrderState(o); try { localStorage.setItem(orderKey, JSON.stringify(o)); } catch {} }, [orderKey]);

  // ---- ui state ----
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [stage, setStage] = useState<Stage | null>(null);
  const [busy, setBusy] = useState(false);
  const [areaPick, setAreaPick] = useState<Resolved[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const startPt = useRef({ x: 0, y: 0 });
  const landing = useRef<{ id: number; rect: DOMRect } | null>(null);
  const stageRef = useRef<Stage | null>(null);
  stageRef.current = stage;
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => { setSelectedId(null); setStage(null); }, [hand.handNumber, hand.turnIndex]);
  useEffect(() => { // drop staged/selected tiles that left the rack
    const ids = new Set(rackTiles.map((x) => x.id));
    setSelectedId((s) => (s !== null && ids.has(s) ? s : null));
    setStage((st) => (st ? { ...st, groups: st.groups.map((g) => g.filter((p) => ids.has(p.tile.id))).filter((g) => g.length) } : st));
  }, [rackKey]);
  useEffect(() => { // server says we are mid-opening (e.g. after reload) → show the board
    if (myTurn && me?.openingDeclared && !stage) setStage({ mode: 'open', groups: [] });
  }, [myTurn, me?.openingDeclared]);

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
  const fmt = (n: number) => (settings.rules.k7 ? mod3(n) : String(n));
  const count = useMemo(() => (me && me.opened === 'none' ? bestOpening(rackTiles, mctx) : null), [rackKey, mctx, me?.opened]);
  const stagedIds = useMemo(() => new Set((stage?.groups ?? []).flatMap((g) => g.map((p) => p.tile.id))), [stage]);
  const selectedTile = selectedId !== null && !stagedIds.has(selectedId) ? rackTiles.find((x) => x.id === selectedId) ?? null : null;
  const single: Pick | null = selectedTile ? { tile: selectedTile, joker: flipped.has(selectedTile.id) } : null;
  const handValue = rackTiles.reduce((s, x) => s + faceValue(x, hand.okey), 0);
  const leftSeat = (mySeat + 3) % 4;
  const sidePile = hand.discards[leftSeat] ?? [];
  const sideTile = sidePile[sidePile.length - 1];
  const sideTakeable = !!sideTile && sideTile.turnIndex === hand.turnIndex - 1 && !sideTile.penalized;
  const canPress = settings.rules.k9 && hand.islekWindow && seated && hand.islekWindow.seat !== mySeat && (settings.mode !== 'teams' || hand.islekWindow.seat % 2 !== mySeat % 2);
  const pairOpeners = hand.players.filter((p) => p.opened === 'pairs').map((p) => p.seat);
  const seriesThreshold = settings.rules.k4 ? Math.max(CONST.OPEN_THRESHOLD, hand.highestSeriesOpening + 1) : CONST.OPEN_THRESHOLD;
  const pairThreshold = settings.rules.k4 ? Math.max(CONST.PAIR_THRESHOLD, hand.highestPairOpening + 1) : CONST.PAIR_THRESHOLD;

  // staged groups resolved
  const staged = useMemo(() => {
    if (!stage) return null;
    const resolved = stage.groups.map((g) => resolveGroup(g, mctx));
    const allPairs = resolved.length > 0 && resolved.every((r) => r && r.kind === 'pair');
    const allSeries = resolved.length > 0 && resolved.every((r) => r && r.kind !== 'pair');
    const points = resolved.reduce((s, r) => s + (r && r.kind !== 'pair' ? r.points : 0), 0);
    const complete = allPairs || allSeries;
    const kind: 'series' | 'pairs' | null = allPairs ? 'pairs' : allSeries ? 'series' : null;
    const meets = stage.mode === 'lay' ? complete : kind === 'series' ? points >= seriesThreshold && !me?.declaredPairs : kind === 'pairs' ? resolved.length >= pairThreshold : false;
    return { resolved, kind, points, complete, meets };
  }, [stage, mctx, seriesThreshold, pairThreshold, me?.declaredPairs]);

  // extend / steal targets for the selected tile (opened players only)
  const targets = useMemo(() => {
    const ext = new Map<string, Set<'front' | 'back'>>();
    const steal = new Map<string, Set<number>>();
    if (!single || !me || me.opened === 'none' || !myTurn || hand.phase !== 'act' || stage) return { ext, steal };
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
  }, [single, me?.opened, myTurn, hand.phase, hand.melds, mctx, stage]);

  // ---- staging helpers ----
  const pickOf = (id: number): Pick => ({ tile: tileById(id), joker: flipped.has(id) });
  const stageTile = (id: number) => {
    setStage((st) => {
      if (!st) return st;
      const p = pickOf(id);
      const groups = st.groups.map((g) => g.slice());
      const last = groups[groups.length - 1];
      if (last) { const ng = tryAppend(last, p, mctx); if (ng) { groups[groups.length - 1] = ng; return { ...st, groups }; } }
      groups.push([p]);
      return { ...st, groups };
    });
  };
  const unstageTile = (id: number) => setStage((st) => (st ? { ...st, groups: st.groups.map((g) => g.filter((p) => p.tile.id !== id)).filter((g) => g.length) } : st));
  const moveToGroup = (id: number, target: { g: number; end: 'front' | 'back' } | 'new') => {
    setStage((st) => {
      if (!st) return st;
      const p = pickOf(id);
      let groups = st.groups.map((g) => g.filter((x) => x.tile.id !== id));
      if (target === 'new') { groups.push([p]); return { ...st, groups: groups.filter((g) => g.length) }; }
      const g = st.groups[target.g]?.filter((x) => x.tile.id !== id);
      if (!g) return st;
      const ng = insertAt(g, p, target.end, mctx);
      if (!ng) { toast(t('err.INVALID_MELD')); return st; }
      groups[target.g] = ng;
      return { ...st, groups: groups.filter((gg) => gg.length) };
    });
  };

  // ---- drag (rack ↔ staging) ----
  const setD = (d: Drag | null) => { dragRef.current = d; setDrag(d); };
  const beginDrag = (e: React.PointerEvent, id: number, source: 'rack' | 'stage', fromSlot: number | null, fromGroup: number | null) => {
    e.preventDefault();
    startPt.current = { x: e.clientX, y: e.clientY };
    const el = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.tile') ?? (e.currentTarget as HTMLElement);
    const r = el.getBoundingClientRect();
    setD({ id, source, fromSlot, fromGroup, x: e.clientX, y: e.clientY, w: r.width, h: r.height, active: false, overSlot: null, overGroup: null });
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active && Math.hypot(e.clientX - startPt.current.x, e.clientY - startPt.current.y) < 6) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const slotEl = hit?.closest<HTMLElement>('[data-slot]');
      const dropEl = hit?.closest<HTMLElement>('[data-drop]');
      let overGroup: Drag['overGroup'] = null;
      if (dropEl) overGroup = dropEl.dataset.drop === 'new' ? 'new' : { g: Number(dropEl.dataset.group), end: dropEl.dataset.end as 'front' | 'back' };
      setD({ ...d, active: true, x: e.clientX, y: e.clientY, overSlot: slotEl && !slotEl.classList.contains('reserved') ? Number(slotEl.dataset.slot) : null, overGroup });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setD(null);
      if (!d.active) return;
      const ghostRect = new DOMRect(e.clientX - d.w / 2, e.clientY - d.h / 2, d.w, d.h);
      const o = orderRef.current.slice();
      if (d.overGroup !== null && stageRef.current) {
        moveToGroup(d.id, d.overGroup);
        return;
      }
      if (d.overSlot !== null) {
        const from = o.indexOf(d.id);
        const target = o[d.overSlot];
        if (d.overSlot !== from) {
          if (from >= 0) o[from] = target ?? null;
          o[d.overSlot] = d.id;
        }
        landing.current = { id: d.id, rect: ghostRect };
        if (d.source === 'stage') unstageTile(d.id);
        setOrder(o);
        return;
      }
      // dropped nowhere: settle back
      if (d.source === 'stage') {
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if (hit?.closest('.rack')) { landing.current = { id: d.id, rect: ghostRect }; unstageTile(d.id); }
      } else {
        landing.current = { id: d.id, rect: ghostRect };
        setOrder(o);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [setOrder, mctx]);

  // ---- handlers ----
  const onSelect = (id: number) => {
    if (dragRef.current?.active) return;
    if (stage && myTurn && hand.phase === 'act') { stageTile(id); return; }
    setSelectedId((s) => (s === id ? null : id));
  };
  const startOpen = async () => { if (await play({ type: 'startOpen' })) { setStage({ mode: 'open', groups: [] }); setSelectedId(null); } };
  const startLay = () => { setStage({ mode: 'lay', groups: [] }); setSelectedId(null); };
  const takeBack = async () => {
    if (stage?.mode === 'open') { if (!(await play({ type: 'cancelOpen' }))) return; }
    setStage(null);
  };
  const confirmStage = async (areaSeat?: number) => {
    if (!stage || !staged || !staged.complete) return;
    const resolved = staged.resolved as Resolved[];
    if (stage.mode === 'open') {
      if (await play({ type: 'open', kind: staged.kind!, melds: resolved.map(toInput) })) setStage(null);
      return;
    }
    if (resolved.some((r) => r.kind === 'pair') && me?.opened === 'series' && pairOpeners.length > 1 && areaSeat === undefined) { setAreaPick(resolved); return; }
    for (const r of resolved) {
      const ok = await play({ type: 'layMeld', meld: toInput(r), areaSeat: r.kind === 'pair' ? areaSeat : undefined });
      if (!ok) return;
      setStage((st) => (st ? { ...st, groups: st.groups.filter((g) => !g.some((p) => r.tiles.some((x) => x.tile.id === p.tile.id))) } : st));
    }
    setStage(null);
    setAreaPick(null);
  };
  const doDiscard = async () => { if (single && !stage && (await play({ type: 'discard', tileId: single.tile.id }))) setSelectedId(null); };
  const doExtend = async (meldId: string, end: 'front' | 'back') => { if (single && (await play({ type: 'extend', meldId, tileId: single.tile.id, joker: single.joker || undefined, end }))) setSelectedId(null); };
  const doSteal = async (meldId: string, index: number) => { if (single && (await play({ type: 'stealOkey', meldId, index, tileId: single.tile.id }))) setSelectedId(null); };
  const flipSelected = () => { if (single && isOkey(single.tile)) setFlipped((f) => { const n = new Set(f); n.has(single.tile.id) ? n.delete(single.tile.id) : n.add(single.tile.id); return n; }); };

  // ---- rendering helpers ----
  const rel = (offset: number) => (mySeat + offset) % 4;
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
        <div className="meta">{t('game.tiles', { n: p.tileCount })} · {p.opened === 'none' ? (p.openingDeclared ? t('game.opening') : p.declaredPairs ? t('game.declared') : t('game.notOpened')) : t(`game.opened.${p.opened}`, { v: p.opened === 'series' ? fmt(p.openingValue) : p.openingValue })}</div>
        <div className="meta">{view.totals[seat]} {t('common.points')}{p.inGamePoints ? <span className="pen"> · {p.inGamePoints > 0 ? '+' : ''}{p.inGamePoints}</span> : null}</div>
        {active && <div className={`ring-timer ${secondsLeft <= 5 ? 'low' : ''}`} style={{ width: `${ringPct}%` }} />}
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

  let hint = '';
  let warn = false;
  if (!seated) hint = t('game.spectating');
  else if (hand.phase === 'finished') hint = '';
  else if (!myTurn) hint = t('game.turnOf', { name: name(hand.turnSeat) });
  else if (hand.phase === 'draw') hint = t('game.drawPhase');
  else if (stage) hint = stage.mode === 'open' ? t('game.stageHint.open') : t('game.stageHint.lay');
  else if (priv?.sideObligation) { hint = t('game.sideObligation'); warn = true; }
  else if (priv?.stolenOkeyIds.length && !settings.rules.k8) { hint = t('game.stolenObligation'); warn = true; }
  else hint = t('game.actPhase');

  const secondsToNext = view.nextHandAt ? Math.ceil((view.nextHandAt - now) / 1000) : null;
  const ghostTile = drag?.active ? rackTiles.find((x) => x.id === drag.id) : undefined;
  const stagedText = staged ? (staged.kind === 'pairs' ? t('game.stagedPairs', { n: staged.resolved.length, t: pairThreshold }) : t('game.stagedTotal', { v: fmt(staged.points), t: fmt(seriesThreshold) })) : '';

  return (
    <div className="game">
      <div className="topbar">
        <span className="status">{t('game.hand', { n: hand.handNumber, total: settings.hands })}</span>
        <span className="row" style={{ gap: 6 }}>{t('game.okey')} <TileView tile={okeyTile} size="xs" /></span>
        {me && <span>{t('game.handValue', { v: fmt(handValue) })}</span>}
        {count && <span className="count">{t('game.count', { v: fmt(count.points) })} · {t('game.countPairs', { n: count.pairs })}</span>}
        {me?.opened === 'none' && <span>{t('game.threshold', { v: fmt(seriesThreshold) })}</span>}
        <span className="spacer" />
        {hand.phase !== 'finished' && <span className="status" style={{ fontVariantNumeric: 'tabular-nums' }}>{secondsLeft} sn</span>}
        <button className="tbtn ghost sm" onClick={() => { if (window.confirm(t('game.leaveConfirm'))) nav('/'); }}>{t('common.leave')}</button>
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
              <div className="count-label">{t('game.deck')}</div>
            </div>
            <div>
              <TileView tile={hand.gosterge} />
              <div className="count-label">{t('game.gosterge')}</div>
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
        {stage && (
          <div className="stage">
            {stage.groups.length === 0 && <span className="hint">{t('game.stageEmpty')}</span>}
            {stage.groups.map((g, gi) => {
              const r = staged?.resolved[gi];
              const ok = !!r;
              return (
                <div className={`meld staged ${ok ? 'ok' : 'partial'}`} key={gi}>
                  <div className={`end ${drag?.active && typeof drag.overGroup === 'object' && drag.overGroup?.g === gi && drag.overGroup.end === 'front' ? 'hot' : ''}`} data-drop="group" data-group={gi} data-end="front" />
                  {g.map((p) => (
                    <div key={p.tile.id} style={{ visibility: drag?.active && drag.id === p.tile.id ? 'hidden' : 'visible' }}
                      onPointerDown={(e) => e.button === 0 && beginDrag(e, p.tile.id, 'stage', null, gi)}
                      onClick={() => { if (!dragRef.current?.active) unstageTile(p.tile.id); }}>
                      <TileView tile={p.tile} size="sm" joker={p.joker} selectable />
                    </div>
                  ))}
                  <div className={`end ${drag?.active && typeof drag.overGroup === 'object' && drag.overGroup?.g === gi && drag.overGroup.end === 'back' ? 'hot' : ''}`} data-drop="group" data-group={gi} data-end="back" />
                  {r && r.kind !== 'pair' && <span className="pts">{fmt(r.points)}</span>}
                </div>
              );
            })}
            <div className={`newgroup ${drag?.active && drag.overGroup === 'new' ? 'hot' : ''}`} data-drop="new">{t('game.newGroup')}</div>
            <span className="spacer" />
            <span className={`hint ${staged && !staged.complete && stage.groups.length ? 'warn' : ''}`}>{staged && !staged.complete && stage.groups.length ? t('game.stagedInvalid') : stagedText}</span>
            <button className="tbtn sm" disabled={busy || !staged?.meets} onClick={() => confirmStage()}>{t('game.openConfirm')}</button>
            <button className="tbtn danger sm" disabled={busy} onClick={takeBack} title={stage.mode === 'open' ? t('game.takeBackWarn') : undefined}>{t('game.takeBack')}{stage.mode === 'open' ? ' (+101)' : ''}</button>
          </div>
        )}
        <div className="actions">
          <span className={`hint ${warn ? 'warn' : ''}`}>{hint}</span>
          <span className="spacer" />
          {canPress && <button className="tbtn accent sm" disabled={busy} onClick={() => play({ type: 'pressIslek' })}>{t('game.islek')}</button>}
          {myTurn && hand.phase === 'draw' && <>
            <button className="tbtn sm" disabled={busy} onClick={() => play({ type: 'draw' })}>{t('game.draw')}</button>
            <button className="tbtn sm" disabled={busy || !sideTakeable} onClick={() => play({ type: 'takeSide' })}>{t('game.takeSide')}</button>
          </>}
          {myTurn && settings.rules.k5 && me?.opened === 'none' && !me.declaredPairs && !stage && <button className="tbtn ghost sm" disabled={busy} onClick={() => play({ type: 'declarePairs' })}>{t('game.declare')}</button>}
          {myTurn && hand.phase === 'act' && !stage && <>
            {single && isOkey(single.tile) && <button className="tbtn ghost sm" onClick={flipSelected}>{t('game.flipOkey')}</button>}
            {priv?.sideObligation && <button className="tbtn ghost sm" disabled={busy} onClick={() => play({ type: 'returnSide' })}>{t('game.returnSide')}</button>}
            {me?.opened === 'none' && <button className="tbtn sm" disabled={busy} onClick={startOpen}>{t('game.open')}</button>}
            {me && me.opened !== 'none' && <button className="tbtn sm" disabled={busy} onClick={startLay}>{t('game.layStart')}</button>}
            <button className="tbtn sm" disabled={busy || !single} onClick={doDiscard}>{t('game.discard')}</button>
          </>}
          <button className="tbtn ghost sm" onClick={() => setOrder(sortedOrder(rackTiles, 'color', hand.okey.number))} title="Renge göre diz">Renk</button>
          <button className="tbtn ghost sm" onClick={() => setOrder(sortedOrder(rackTiles, 'number', hand.okey.number))} title="Sayıya göre diz">Sayı</button>
        </div>
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
            <Rack tiles={rackTiles} order={order} selectedId={stage ? null : selectedId} onSelect={onSelect} flipped={flipped} isOkey={isOkey}
              hiddenIds={stagedIds} countGroups={count?.groups ?? []} highlightId={priv?.sideObligation ? priv.sideTakenTileId : null}
              dragId={drag?.active ? drag.id : null} overSlot={drag?.active ? drag.overSlot : null}
              onTilePointerDown={(e, id, slot) => beginDrag(e, id, 'rack', slot, null)} landing={landing} />
          ) : <div className="rack" />}
        </div>
        <div className="log">
          {view.log.slice(-3).reverse().map((l, i) => <div key={i}>{l.seat !== null && <b>{name(l.seat)} </b>}{t(l.key, l.params)}</div>)}
        </div>
      </div>

      {ghostTile && drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}>
          <TileView tile={ghostTile} joker={flipped.has(ghostTile.id)} marked={isOkey(ghostTile) && !flipped.has(ghostTile.id)} />
        </div>
      )}
      {areaPick && (
        <div className="overlay" onClick={() => setAreaPick(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>{t('game.chooseArea')}</h2>
            <div className="row">{pairOpeners.map((s) => <button key={s} className="tbtn" onClick={() => confirmStage(s)}>{name(s)}</button>)}</div>
          </div>
        </div>
      )}
      {hand.phase === 'finished' && hand.result && (
        <ScoreBoard view={view} result={hand.result} secondsToNext={secondsToNext} onMenu={() => nav('/')} />
      )}
    </div>
  );
}
