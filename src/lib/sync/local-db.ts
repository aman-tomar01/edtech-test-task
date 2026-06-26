import Dexie, { type Table } from "dexie";
import type { TextOperation } from "./operations";

export interface LocalDocument {
  id: string;
  title: string;
  content: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  ownerId: string;
  updatedAt: number;
  lastSyncedAt: number | null;
  pendingSync: boolean;
}

export interface LocalVersion {
  id: string;
  documentId: string;
  label: string | null;
  title: string;
  content: string;
  createdAt: number;
  synced: boolean;
}

export interface SyncQueueItem {
  id?: number;
  documentId: string;
  payload: string;
  createdAt: number;
  retries: number;
}

export interface LocalMeta {
  key: string;
  value: string;
}

export class LocalDatabase extends Dexie {
  documents!: Table<LocalDocument, string>;
  operations!: Table<TextOperation, string>;
  versions!: Table<LocalVersion, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  meta!: Table<LocalMeta, string>;

  constructor() {
    super("EdtechDocEditor");
    this.version(1).stores({
      documents: "id, updatedAt, pendingSync",
      operations: "id, documentId, lamportClock, synced",
      versions: "id, documentId, createdAt",
      syncQueue: "++id, documentId, createdAt",
      meta: "key",
    });
  }
}

let dbInstance: LocalDatabase | null = null;

export function getLocalDB(): LocalDatabase {
  if (typeof window === "undefined") {
    throw new Error("LocalDB is only available in the browser");
  }
  if (!dbInstance) {
    dbInstance = new LocalDatabase();
  }
  return dbInstance;
}

export const CLIENT_ID_KEY = "client_id";

export function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}
