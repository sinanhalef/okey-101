import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tile } from '@okey101/engine';
import { TileView } from './Tile';

export const COLS = 15;
export const SLOTS = COLS * 2;

interface Props {
  tiles: Tile[];
  order: (number | null)[];
  onOrder: (o: (number | null)[]) => void;
  selected: Set<number>;
  onToggle: (id: number) => void;
  flipped: Set<number>;
  isOkey: (t: Tile) => boolean;
  dimIds: Set<number>;
  highlightId?: number | null;
}

interface Drag { id: number; from: number; x: number; y: number; active: boolean; over: number | null; w: number; h: number }

export function Rack({ tiles, order, onOrder, selected, onToggle, flipped, isOkey, dimIds, highlightId }: Props) {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const rackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const rects = useRef(new Map<number, DOMRect>());
  const landing = useRef<{ id: number; rect: DOMRect } | null>(null);

  const setD = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  // FLIP: animate tiles from their previous slot to the new one whenever the order changes.
  useLayoutEffect(() => {
    const root = rackRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>('[data-tile]');
    const next = new Map<number, DOMRect>();
    els.forEach((el) => {
      const id = Number(el.dataset.tile);
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const prev = landing.current && landing.current.id === id ? landing.current.rect : rects.current.get(id);
      if (prev && (Math.abs(prev.left - r.left) > 1 || Math.abs(prev.top - r.top) > 1)) {
        const dx = prev.left - r.left; const dy = prev.top - r.top;
        const s = landing.current && landing.current.id === id ? 1.08 : 1;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
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
    landing.current = null;
  }, [order, tiles]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dist = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
      if (!d.active && dist < 6) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-slot]');
      const over = el ? Number(el.dataset.slot) : null;
      setD({ ...d, active: true, x: e.clientX, y: e.clientY, over });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.active) {
        if (d.over !== null && d.over !== d.from) {
          const o = order.slice();
          const target = o[d.over];
          o[d.from] = target ?? null;
          o[d.over] = d.id;
          landing.current = { id: d.id, rect: new DOMRect(e.clientX - d.w / 2, e.clientY - d.h / 2, d.w, d.h) };
          onOrder(o);
        } else {
          landing.current = { id: d.id, rect: new DOMRect(e.clientX - d.w / 2, e.clientY - d.h / 2, d.w, d.h) };
          onOrder(order.slice()); // triggers the settle animation back into place
        }
      }
      setD(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [order, onOrder]);

  const rows = [order.slice(0, COLS), order.slice(COLS, SLOTS)];
  const ghostTile = drag?.active ? byId.get(drag.id) : undefined;
  return (
    <>
      <div className={`rack ${drag?.active ? 'dragging' : ''}`} aria-label="Istaka" ref={rackRef}>
        {rows.map((row, r) => (
          <div className="rowr" key={r}>
            {row.map((id, i) => {
              const idx = r * COLS + i;
              const tile = id !== null ? byId.get(id) : undefined;
              const lifted = drag?.active && drag.id === id;
              return (
                <div
                  key={idx}
                  data-slot={idx}
                  className={`slot ${drag?.active && drag.over === idx && drag.over !== drag.from ? 'over' : ''}`}
                  onPointerDown={(e) => {
                    if (!tile || e.button !== 0) return;
                    e.preventDefault();
                    start.current = { x: e.clientX, y: e.clientY };
                    const rct = (e.currentTarget.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
                    setD({ id: tile.id, from: idx, x: e.clientX, y: e.clientY, active: false, over: null, w: rct?.width ?? 44, h: rct?.height ?? 62 });
                  }}
                  onClick={() => { if (tile && !dragRef.current?.active && !drag?.active) onToggle(tile.id); }}
                >
                  {tile && (
                    <div data-tile={tile.id} style={{ width: '100%', height: '100%', visibility: lifted ? 'hidden' : 'visible' }}>
                      <TileView
                        tile={tile}
                        selectable
                        selected={selected.has(tile.id)}
                        joker={flipped.has(tile.id)}
                        marked={isOkey(tile) && !flipped.has(tile.id)}
                        dim={dimIds.has(tile.id)}
                        hot={highlightId === tile.id}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {ghostTile && drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}>
          <TileView tile={ghostTile} joker={flipped.has(ghostTile.id)} marked={isOkey(ghostTile) && !flipped.has(ghostTile.id)} className="ghost-tile" />
        </div>
      )}
    </>
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
