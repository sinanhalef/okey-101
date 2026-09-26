import type { User } from 'firebase/auth';
import { useNavigate, useParams } from 'react-router-dom';
import { t } from '@okey101/shared';
import { useTable } from '../hooks/useTable';
import { Lobby } from './Lobby';
import { Game } from './Game';

export function TableScreen({ user }: { user: User }) {
  const { id } = useParams();
  const nav = useNavigate();
  const state = useTable(id, user.uid);
  if (state.missing) return <div className="page"><div className="column"><p>{t('err.TABLE_NOT_FOUND')}</p><button className="tbtn" onClick={() => nav('/')}>{t('score.toMenu')}</button></div></div>;
  if (!state.table || !id) return <div className="page"><div className="column muted">{t('common.loading')}</div></div>;
  if (state.table.status === 'waiting' || !state.view) return <Lobby tableId={id} table={state.table} user={user} />;
  return <Game tableId={id} user={user} state={state} />;
}
