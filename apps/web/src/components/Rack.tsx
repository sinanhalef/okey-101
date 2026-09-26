import { useEffect, useRef, useState } from 'react';
import type { Tile } from '@okey101/engine';
import { TileView } from './Tile';

export const SLOTS = 26;

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

export function Rack({ tiles, order, onOrder, selected, onToggle, flipped, isOkey, dimIds, highlightId }: Props) {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const [drag, setDrag] = useState<{ id: number; from: number; over: number | null } | null>(null);
  const moved = useRef(false);
  const start = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!drag) return;
    const up = () => {
      if (drag.over !== null && drag.over !== drag.from) {
        const o = order.slice();
        const target = o[drag.over];
        o[drag.from] = target ?? null;
        o[drag.over] = drag.id;
        onOrder(o);
      }
      setDrag(null);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [drag, order, onOrder]);

  const rows = [order.slice(0, 13), order.slice(13, 26)];
  return (
    <div className="rack" aria-label="Istaka">
      {rows.map((row, r) => (
        <div className="rowr" key={r}>
          {row.map((id, i) => {
            const idx = r * 13 + i;
            const tile = id !== null ? byId.get(id) : undefined;
            return (
              <div
                key={idx}
                className={`slot ${drag && drag.over === idx ? 'over' : ''}`}
                onPointerEnter={() => drag && setDrag({ ...drag, over: idx })}
                onPointerDown={(e) => {
                  if (!tile) return;
                  e.preventDefault();
                  moved.current = false;
                  start.current = { x: e.clientX, y: e.clientY };
                  setDrag({ id: tile.id, from: idx, over: null });
                }}
                onPointerMove={(e) => { if (drag && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) moved.current = true; }}
                onClick={() => { if (tile && !moved.current) onToggle(tile.id); }}
              >
                {tile && (
                  <TileView
                    tile={tile}
                    selectable
                    selected={selected.has(tile.id)}
                    joker={flipped.has(tile.id)}
                    marked={isOkey(tile) && !flipped.has(tile.id)}
                    dim={dimIds.has(tile.id)}
                    hot={highlightId === tile.id}
                    className={drag?.id === tile.id && drag.over !== null && drag.over !== drag.from ? 'dragging' : ''}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
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
