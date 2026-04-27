import Dexie, { type Table } from 'dexie';
import type { PersistedDocumentAsset, PersistedWorkspaceSession } from '@/types';

export const WORKSPACE_DB_NAME = 'scholarflow-workspace-db';

export class ScholarFlowAppDatabase extends Dexie {
  workspaceSessions!: Table<PersistedWorkspaceSession, string>;
  documentAssets!: Table<PersistedDocumentAsset, string>;

  constructor() {
    super(WORKSPACE_DB_NAME);

    this.version(1).stores({
      workspaceSessions: 'id, updatedAt, version',
      documentAssets: 'id, name, updatedAt',
    });
  }
}

export const appDb = new ScholarFlowAppDatabase();
