import { t } from '@okey101/shared';
import { ApiError } from './api';

export function errMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : (e as any)?.code ?? 'unknown';
  const key = `err.${code}`;
  const s = t(key);
  return s === key ? t('err.unknown') : s;
}
