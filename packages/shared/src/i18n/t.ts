import { tr } from './tr';

type Dict = typeof tr;
export type StringKey = keyof Dict;

let dict: Record<string, string> = tr as unknown as Record<string, string>;
export function setDictionary(d: Record<string, string>) { dict = d; }

/** Translate a key, substituting {param} placeholders. Falls back to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dict[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
