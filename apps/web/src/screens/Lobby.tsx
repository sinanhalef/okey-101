import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { t, type TableDoc } from '@okey101/shared';
import { api } from '../api';
import { errMessage } from '../errors';
import { getStoredName } from '../hooks/useAuth';
import { useToast } from '../components/Toast';

export function Lobby({ tableId, table, user }: { tableId: string; table: TableDoc; user: User }) {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seated = table.seats.some((s) => s.uid === user.uid);
  const rules = Object.entries(table.settings.rules).filter(([, v]) => v).map(([k]) => k);
  const link = `${location.origin}/t/${tableId}`;

  const join = async () => {
    setBusy(true); setError(null);
    try { await api.joinTable({ name: getStoredName(), code: table.code }); } catch (e) { setError(errMessage(e)); }
    setBusy(false);
  };
  const leave = async () => {
    setBusy(true);
    try { await api.leaveTable({ tableId }); nav('/'); } catch (e) { setError(errMessage(e)); setBusy(false); }
  };
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast(t('common.copied')));

  return (
    <div className="page">
      <div className="column">
        <h1 className="title">{t('lobby.title')}</h1>
        <div className="field"><span>{t('lobby.code')}</span>
          <div className="row">
            <div className="code">{table.code}</div>
            <button className="tbtn ghost sm" onClick={() => copy(table.code)}>{t('common.copy')}</button>
            <button className="tbtn ghost sm" onClick={() => copy(link)}>{t('lobby.share')}</button>
          </div>
        </div>
        <p className="muted">{t('lobby.players', { n: table.seats.length })} · {table.seats.length < 4 ? t('lobby.waiting') : t('lobby.starting')}</p>
        <div className="seats">
          {[0, 1, 2, 3].map((i) => {
            const s = table.seats[i];
            return <div key={i} className={`seatbox ${s ? 'filled' : ''}`}>{s ? s.name : t('lobby.seat')}{s?.uid === user.uid && <span className="chip">{t('common.you')}</span>}</div>;
          })}
        </div>
        <div className="field"><span>{t('lobby.rules')}</span>
          <div className="chips">
            <span className="chip">{table.settings.mode === 'teams' ? t('create.mode.teams') : t('create.mode.single')}</span>
            <span className="chip">{table.settings.hands} el</span>
            <span className="chip">{table.settings.turnSeconds} sn</span>
            {rules.length === 0 ? <span className="chip">{t('lobby.noRules')}</span> : rules.map((k) => <span className="chip" key={k} title={t(`rule.${k}.desc`)}>{k.toUpperCase()} {t(`rule.${k}`)}</span>)}
          </div>
        </div>
        <div className="row">
          {seated ? <button className="tbtn danger" disabled={busy} onClick={leave}>{t('common.leave')}</button>
            : <button className="tbtn" disabled={busy || table.seats.length >= 4} onClick={join}>{t('menu.join')}</button>}
          <button className="tbtn ghost" onClick={() => nav('/')}>{t('common.back')}</button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
