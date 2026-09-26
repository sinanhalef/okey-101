import type { Action, PrivateHandView, PublicMatchView, SeatInfo, TableSettings } from '@okey101/engine';

/** Public table document at tables/{id}. Views are stored as JSON strings (Firestore forbids nested arrays). */
export interface TableDoc {
  code: string;
  isPublic: boolean;
  status: 'waiting' | 'playing' | 'finished';
  hostUid: string;
  createdAt: number;
  updatedAt: number;
  serverNow: number;
  settings: TableSettings;
  seats: SeatInfo[];
  seatCount: number;
  viewJson: string | null;
}

/** Private hand document at tables/{id}/hands/{uid}. */
export interface HandDoc { json: string; updatedAt: number }

export function parseView(doc: TableDoc): PublicMatchView | null {
  return doc.viewJson ? (JSON.parse(doc.viewJson) as PublicMatchView) : null;
}
export function parseHand(doc: HandDoc): PrivateHandView { return JSON.parse(doc.json) as PrivateHandView; }

export interface CreateTableReq { name: string; settings: TableSettings; isPublic: boolean }
export interface CreateTableRes { tableId: string; code: string }
export interface JoinTableReq { name: string; code: string }
export interface FindTableReq { name: string }
export interface TableRef { tableId: string }
export interface PlayActionReq { tableId: string; action: Action }
export interface LeaveTableReq { tableId: string }
