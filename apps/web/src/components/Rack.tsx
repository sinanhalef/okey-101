import { useLayoutEffect, useRef } from 'react';
import type { Tile } from '@okey101/engine';
import { TileView } from './Tile';

export const COLS = 15;
export const SLOTS = COLS * 2;

interface Props {
  tiles: Tile[];
  order: (number | null)[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  flipped: Set<number>;
  isOkey: (t: Tile) => boolean;
  hiddenIds: Set<number>;       // staged tiles: slot reserved, tile not shown
  countGroups: number[][];      // groups of tile ids to ring in green
  highlightId?: number | null;
  dragId: number | null;        // tile currently lifted
  overSlot: number | null;
  onTilePointerDown: (e: React.PointerEvent, tileId: number, slot: number) => void;
  landing: React.MutableRefObject<{ id: number; rect: DOMRect } | null>;
}

export function Rack({ tiles, order, selectedId, onSelect, flipped, isOkey, hiddenIds, countGroups, highlightId, dragId, overSlot, onTilePointerDown, landing }: Props) {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const rackRef = useRef<HTMLDivElement>(null);
  const rects = useRef(new Map<number, DOMRect>());
  const groupOf = new Map<number, number>();
  countGroups.forEach((g, gi) => g.forEach((id) => groupOf.set(id, gi)));

  // FLIP: animate tiles from their previous position to the new one.
  useLayoutEffect(() => {
    const root = rackRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>('[data-tile]');
    const next = new Map<number, DOMRect>();
    els.forEach((el) => {
      const id = Number(el.dataset.tile);
      const r = (el.parentElement ?? el).getBoundingClientRect(); // slot rect: never transformed
      next.set(id, r);
      if (el.style.visibility === 'hidden') return;
      const land = landing.current && landing.current.id === id ? landing.current.rect : null;
      const prev = land ?? rects.current.get(id);
      if (prev && (Math.abs(prev.left - r.left) > 1 || Math.abs(prev.top - r.top) > 1)) {
        const dx = prev.left - r.left; const dy = prev.top - r.top;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${land ? 1.08 : 1})`;
        el.style.zIndex = '5';
        requestAnimationFrame(() => {
          el.style.transition = 'transform 260ms cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
          const done = () => { el.style.transition = ''; el.style.zIndex = ''; el.removeEventListener('transitionend', done); };
          el.addEventListener('transitionend', done);
        });
      }
    });
    rects.current = next;
    if (landing.current && next.has(landing.current.id)) landing.current = null;
  }, [order, tiles, hiddenIds]);

  const rows = [order.slice(0, COLS), order.slice(COLS, SLOTS)];
  return (
    <div className={`rack ${dragId !== null ? 'dragging' : ''}`} aria-label="Istaka" ref={rackRef}>
      {rows.map((row, r) => {
        // contiguous ring segments per group in this row
        const segs: { g: number; a: number; b: number }[] = [];
        row.forEach((id, i) => {
          const g = id !== null && !hiddenIds.has(id) ? groupOf.get(id) : undefined;
          if (g === undefined) return;
          const last = segs[segs.length - 1];
          if (last && last.g === g && last.b === i - 1) last.b = i; else segs.push({ g, a: i, b: i });
        });
        return (
          <div className="rowr" key={r}>
            {row.map((id, i) => {
              const idx = r * COLS + i;
              const tile = id !== null ? byId.get(id) : undefined;
              const hidden = tile ? hiddenIds.has(tile.id) || dragId === tile.id : false;
              return (
                <div
                  key={idx}
                  data-slot={idx}
                  className={`slot ${overSlot === idx ? 'over' : ''} ${tile && hiddenIds.has(tile.id) ? 'reserved' : ''}`}
                  style={{ gridColumn: i + 1, gridRow: 1 }}
                  onPointerDown={(e) => { if (tile && !hiddenIds.has(tile.id) && e.button === 0) onTilePointerDown(e, tile.id, idx); }}
                  onClick={() => { if (tile && !hiddenIds.has(tile.id)) onSelect(tile.id); }}
                >
                  {tile && (
                    <div data-tile={tile.id} style={{ width: '100%', height: '100%', visibility: hidden ? 'hidden' : 'visible' }}>
                      <TileView tile={tile} selectable selected={selectedId === tile.id} joker={flipped.has(tile.id)} marked={isOkey(tile) && !flipped.has(tile.id)} hot={highlightId === tile.id} />
                    </div>
                  )}
                </div>
              );
            })}
            {segs.map((sg, k) => <div key={k} className={`ring g${sg.g % 4}`} style={{ gridColumn: `${sg.a + 1} / ${sg.b + 2}`, gridRow: 1 }} />)}
          </div>
        );
      })}
    </div>
  );
}

/** Reconcile a stored order with the current rack contents. */
export function reconcile(order: (number | null)[] | null, tiles: Tile[]): (number | null)[] {
  const ids = new Set(tiles.map((t) => t.id));
  const o: (number | null)[] = Array.from({ length: SLOTS }, (_, i) => (order && ids.has(order[i] as number) ? (order[i] as number) : null));
  const placed = new Set(o.filter((x): x is number => x !== null));
  for (const t of tiles) {
    if (placed.has(t.id)) continue;
    const free = o.indexOf(null);
    if (free >= 0) { o[free] = t.id; placed.add(t.id); }
  }
  return o;
}

export function sortedOrder(tiles: Tile[], mode: 'color' | 'number', okeyNumber: number): (number | null)[] {
  const val = (t: Tile) => (t.color === 'fake' ? okeyNumber : t.number);
  const ci = (t: Tile) => ['red', 'yellow', 'blue', 'black', 'fake'].indexOf(t.color);
  const s = tiles.slice().sort((a, b) => (mode === 'color' ? ci(a) - ci(b) || val(a) - val(b) : val(a) - val(b) || ci(a) - ci(b)));
  const o: (number | null)[] = Array(SLOTS).fill(null);
  s.forEach((t, i) => { o[i] = t.id; });
  return o;
}
