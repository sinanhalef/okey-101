import { httpsCallable } from 'firebase/functions';
import type { Action } from '@okey101/engine';
import type { CreateTableReq, CreateTableRes, FindTableReq, JoinTableReq, LeaveTableReq, PlayActionReq, TableRef } from '@okey101/shared';
import { functions } from './firebase';

export class ApiError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    const fn = httpsCallable<Req, Res>(functions, name);
    const r = await fn(data);
    return r.data;
  } catch (e: any) {
    const code = e?.details?.code ?? e?.message ?? e?.code ?? 'unknown';
    throw new ApiError(String(code).replace(/^functions\//, ''), e?.message);
  }
}

export const api = {
  createTable: (d: CreateTableReq) => call<CreateTableReq, CreateTableRes>('createTable', d),
  joinTable: (d: JoinTableReq) => call<JoinTableReq, TableRef>('joinTable', d),
  findTable: (d: FindTableReq) => call<FindTableReq, TableRef>('findTable', d),
  leaveTable: (d: LeaveTableReq) => call<LeaveTableReq, { ok: true }>('leaveTable', d),
  play: (tableId: string, action: Action) => call<PlayActionReq, { ok: true; serverNow: number }>('playAction', { tableId, action }),
};
