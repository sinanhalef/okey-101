import type { Tile as TileT } from '@okey101/engine';

interface Props {
  tile: TileT;
  size?: 'md' | 'sm' | 'xs';
  joker?: boolean;      // rendered as flipped okey
  selected?: boolean;
  selectable?: boolean;
  dim?: boolean;
  marked?: boolean;     // okey marker (natural okey tile in rack)
  penalized?: boolean;
  hot?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

export function TileView({ tile, size = 'md', joker, selected, selectable, dim, marked, penalized, hot, onClick, title, className }: Props) {
  const cls = ['tile', tile.color, size !== 'md' ? size : '', joker ? 'joker' : '', selected ? 'selected' : '',
    selectable ? 'selectable' : '', dim ? 'dim' : '', marked ? 'marked' : '', penalized ? 'penalized' : '', hot ? 'hot' : '', className ?? '']
    .filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} title={title} role={onClick ? 'button' : undefined}>
      <span className="n">{tile.color === 'fake' ? '' : joker ? 'OK' : tile.number}</span>
      <span className="dot" />
    </div>
  );
}

export function TileBack({ size = 'md', className }: { size?: 'md' | 'sm' | 'xs'; className?: string }) {
  return <div className={['tile back', size !== 'md' ? size : '', className ?? ''].join(' ')} />;
}
