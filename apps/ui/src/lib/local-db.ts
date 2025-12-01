// src/lib/local-db.ts
// Local IndexedDB setup using Dexie.js for Pegasus UI

import Dexie from 'dexie';

export interface Conversation {
  id: string;
  messages: any; // Can be Array<Message> or EncryptedData
  updatedAt: number;
}

export interface QueryHistory {
  id: string;
  query: string;
  result: string;
  executedAt: number;
}

export interface UserSetting {
  id: string;
  value: any;
}

export interface DashboardLayout {
  id: string;
  encrypted: any;
  updatedAt: number;
}

export class PegasusDB extends Dexie {
  conversations!: Dexie.Table<Conversation, string>;
  queries!: Dexie.Table<QueryHistory, string>;
  settings!: Dexie.Table<UserSetting, string>;
  dashboard!: Dexie.Table<DashboardLayout, string>;

  constructor() {
    super('PegasusDB');
    this.version(2).stores({
      conversations: 'id, updatedAt',
      queries: 'id, executedAt',
      settings: 'id',
      dashboard: 'id, updatedAt'
    });
  }
}

export const db = new PegasusDB();
