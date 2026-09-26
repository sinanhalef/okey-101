import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_SETTINGS, type RuleFlags, type TableSettings } from '@okey101/engine';
import { t } from '@okey101/shared';
import { api } from '../api';
import { errMessage } from '../errors';
import { getStoredName } from '../hooks/useAuth';

const RULE_KEYS = Object.keys(DEFAULT_SETTINGS.rules) as (keyof RuleFlags)[];

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => <button key={String(o.v)} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}

export function CreateTable({ user }: { user: User }) {
  void user;
  const nav = useNavigate();
  const [s, setS] = useState<TableSettings>(structuredClone(DEFAULT_SETTINGS));
  const [isPublic, setPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const up = (patch: Partial<TableSettings>) => setS({ ...s, ...patch });

  const submit = async () => {
    setBusy(true); setError(null);
    try { const r = await api.createTable({ name: getStoredName(), settings: s, isPublic }); nav(`/t/${r.tableId}`); }
    catch (e) { setError(errMessage(e)); setBusy(false); }
  };

  return (
    <div className="page">
      <div className="column">
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="tbtn ghost sm" onClick={() => nav('/')}>{t('common.back')}</button>
        </div>
        <h1 className="title">{t('create.title')}</h1>
        <div className="field"><span>{t('create.mode')}</span>
          <Seg value={s.mode} options={[{ v: 'single', label: t('create.mode.single') }, { v: 'teams', label: t('create.mode.teams') }]} onChange={(mode) => up({ mode })} />
        </div>
        <div className="field"><span>{t('create.hands')}</span>
          <Seg value={s.hands} options={[5, 7, 9, 11].map((v) => ({ v: v as TableSettings['hands'], label: String(v) }))} onChange={(hands) => up({ hands })} />
        </div>
        <div className="field"><span>{t('create.turnSeconds')}</span>
          <Seg value={s.turnSeconds} options={[20, 30, 45, 60].map((v) => ({ v, label: `${v} ${t('create.seconds')}` }))} onChange={(turnSeconds) => up({ turnSeconds })} />
        </div>
        {s.mode === 'teams' && (
          <div className="field"><span>{t('create.finishReward')}</span>
            <Seg value={s.finishReward} options={[{ v: 'finisher', label: t('create.finishReward.finisher') }, { v: 'opponents', label: t('create.finishReward.opponents') }]} onChange={(finishReward) => up({ finishReward })} />
          </div>
        )}
        <div className="field"><span>{t('create.visibility')}</span>
          <Seg value={isPublic ? 'pub' : 'priv'} options={[{ v: 'pub', label: t('create.public') }, { v: 'priv', label: t('create.private') }]} onChange={(v) => setPublic(v === 'pub')} />
        </div>
        <div className="field"><span>{t('create.rules')}</span>
          <div>
            {RULE_KEYS.map((k) => (
              <div className="rule" key={k}>
                <div className="name"><b>{k.toUpperCase()}</b>{t(`rule.${k}`)}</div>
                <button className="switch" role="switch" aria-checked={s.rules[k]} onClick={() => up({ rules: { ...s.rules, [k]: !s.rules[k] } })} aria-label={t(`rule.${k}`)} />
                <div className="desc">{t(`rule.${k}.desc`)}</div>
                {k === 'k6' && s.rules.k6 && (
                  <div style={{ gridColumn: 1, marginTop: 6 }}>
                    <Seg value={s.k6Mode} options={[{ v: 'self', label: t('create.k6Mode.self') }, { v: 'others', label: t('create.k6Mode.others') }]} onChange={(k6Mode) => up({ k6Mode })} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <button className="tbtn" style={{ width: '100%' }} disabled={busy} onClick={submit}>{t('create.submit')}</button>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
