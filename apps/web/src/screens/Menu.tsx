import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { t } from '@okey101/shared';
import { api } from '../api';
import { errMessage } from '../errors';
import { getStoredName, setStoredName } from '../hooks/useAuth';

export function Menu({ user }: { user: User }) {
  const nav = useNavigate();
  const [name, setName] = useState(getStoredName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: string, fn: () => Promise<{ tableId: string }>) => {
    setBusy(kind); setError(null); setStoredName(name);
    try { const r = await fn(); nav(`/t/${r.tableId}`); }
    catch (e) { setError(errMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="page">
      <div className="column">
        <h1 className="wordmark">101</h1>
        <p className="tagline">{t('app.tagline')}</p>
        <label className="field">
          <span>{t('menu.name')}</span>
          <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder={t('menu.namePlaceholder')} />
        </label>
        <div className="stack">
          <button className="tbtn big" disabled={!!busy} onClick={() => run('find', () => api.findTable({ name }))}>
            {t('menu.find')}<small>{t('menu.findHint')}</small>
          </button>
          <button className="tbtn big" disabled={!!busy} onClick={() => { setStoredName(name); nav('/create'); }}>
            {t('menu.create')}<small>{t('menu.createHint')}</small>
          </button>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('menu.joinCode')} maxLength={6} style={{ letterSpacing: '0.15em', fontWeight: 600 }} />
            <button className="tbtn ghost" disabled={!!busy || code.length < 6} onClick={() => run('join', () => api.joinTable({ name, code }))}>{t('menu.join')}</button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <p className="muted small" style={{ marginTop: 32 }}>{t('menu.guest')} · {user.uid.slice(0, 6)}</p>
      </div>
    </div>
  );
}
