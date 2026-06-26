import {
  getLocalDB,
  getOrCreateClientId,
  type LocalDocument,
  type LocalVersion,
} from "./local-db";
import {
  compareOperations,
  diffToOperations,
  maxLamportClock,
  mergeOperations,
  type TextOperation,
} from "./operations";

export type SyncStatus = "synced" | "pending" | "syncing" | "offline" | "error";

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  pendingCount: number;
  error: string | null;
}

type SyncListener = (state: SyncState) => void;

export class SyncEngine {
  private documentId: string;
  private userId: string;
  private clientId: string;
  private lamportClock: number = 0;
  private listeners = new Set<SyncListener>();
  private state: SyncState = {
    status: "synced",
    lastSyncedAt: null,
    pendingCount: 0,
    error: null,
  };
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;

  constructor(documentId: string, userId: string) {
    this.documentId = documentId;
    this.userId = userId;
    this.clientId = getOrCreateClientId();
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  async init(): Promise<LocalDocument | undefined> {
    const db = getLocalDB();
    const doc = await db.documents.get(this.documentId);
    const ops = await db.operations
      .where("documentId")
      .equals(this.documentId)
      .toArray();
    this.lamportClock = maxLamportClock(ops);

    this.isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.isOnline = true;
        void this.sync();
      });
      window.addEventListener("offline", () => {
        this.isOnline = false;
        this.emit({ status: "offline" });
      });
    }

    const pending = ops.filter((o) => !o.synced).length;
    this.emit({
      pendingCount: pending,
      status: this.isOnline
        ? pending > 0
          ? "pending"
          : "synced"
        : "offline",
      lastSyncedAt: doc?.lastSyncedAt ?? null,
    });

    this.syncTimer = setInterval(() => void this.sync(), 5000);
    return doc;
  }

  destroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  async getDocument(): Promise<LocalDocument | undefined> {
    return getLocalDB().documents.get(this.documentId);
  }

  async getContent(): Promise<string> {
    const doc = await this.getDocument();
    return doc?.content ?? "";
  }

  async applyLocalEdit(newContent: string, role: string): Promise<void> {
    if (role === "VIEWER") {
      throw new Error("Viewers cannot edit documents");
    }

    const db = getLocalDB();
    const doc = await db.documents.get(this.documentId);
    if (!doc) return;

    const oldContent = doc.content;
    if (oldContent === newContent) return;

    const ops = diffToOperations(oldContent, newContent, this.lamportClock, {
      documentId: this.documentId,
      userId: this.userId,
      clientId: this.clientId,
      idPrefix: crypto.randomUUID(),
    });

    if (ops.length === 0) return;

    this.lamportClock = maxLamportClock(ops);

    await db.transaction("rw", db.documents, db.operations, async () => {
      await db.documents.update(this.documentId, {
        content: newContent,
        updatedAt: Date.now(),
        pendingSync: true,
      });
      for (const op of ops) {
        await db.operations.put({ ...op, synced: false });
      }
    });

    const pending = await db.operations
      .where("documentId")
      .equals(this.documentId)
      .filter((o) => !o.synced)
      .count();

    this.emit({
      pendingCount: pending,
      status: this.isOnline ? "pending" : "offline",
    });

    if (this.isOnline) {
      void this.sync();
    }
  }

  async sync(): Promise<void> {
    if (!this.isOnline) {
      this.emit({ status: "offline" });
      return;
    }

    const db = getLocalDB();
    const doc = await db.documents.get(this.documentId);
    if (!doc || doc.role === "VIEWER") return;

    const pendingOps = await db.operations
      .where("documentId")
      .equals(this.documentId)
      .filter((o) => !o.synced)
      .toArray();

    this.emit({ status: "syncing", pendingCount: pendingOps.length });

    try {
      const response = await fetch(`/api/documents/${this.documentId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: pendingOps.map((op) => ({
            id: op.id,
            type: op.type,
            position: op.position,
            content: op.content,
            lamportClock: op.lamportClock,
            clientId: op.clientId,
            timestamp: new Date(op.timestamp).toISOString(),
          })),
          lastKnownLamport: this.lamportClock,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `Sync failed (${response.status})`);
      }

      const data = (await response.json()) as {
        remoteOperations: TextOperation[];
        content: string;
        lamportClock: number;
      };

      await this.mergeRemote(data.remoteOperations, data.content, data.lamportClock);

      await db.documents.update(this.documentId, {
        lastSyncedAt: Date.now(),
        pendingSync: false,
      });

      const remaining = await db.operations
        .where("documentId")
        .equals(this.documentId)
        .filter((o) => !o.synced)
        .count();

      this.emit({
        status: remaining > 0 ? "pending" : "synced",
        lastSyncedAt: Date.now(),
        pendingCount: remaining,
        error: null,
      });
    } catch (err) {
      this.emit({
        status: this.isOnline ? "error" : "offline",
        error: err instanceof Error ? err.message : "Sync failed",
      });
    }
  }

  private async mergeRemote(
    remoteOps: TextOperation[],
    serverContent: string,
    serverLamport: number
  ): Promise<void> {
    const db = getLocalDB();
    const localOps = await db.operations
      .where("documentId")
      .equals(this.documentId)
      .toArray();

    const opMap = new Map<string, TextOperation>();
    for (const op of localOps) opMap.set(op.id, op);
    for (const op of remoteOps) {
      if (!opMap.has(op.id)) {
        opMap.set(op.id, {
          ...op,
          documentId: this.documentId,
          timestamp:
            typeof op.timestamp === "string"
              ? new Date(op.timestamp).getTime()
              : op.timestamp,
          synced: true,
        });
      }
    }

    const allOps = Array.from(opMap.values()).sort(compareOperations);
    const merged = mergeOperations("", allOps);
    const finalContent = merged || serverContent;

    await db.transaction("rw", db.documents, db.operations, async () => {
      await db.documents.update(this.documentId, {
        content: finalContent,
        updatedAt: Date.now(),
      });

      for (const op of remoteOps) {
        await db.operations.put({
          ...op,
          documentId: this.documentId,
          timestamp:
            typeof op.timestamp === "string"
              ? new Date(op.timestamp).getTime()
              : op.timestamp,
          synced: true,
        });
      }

      for (const op of localOps.filter((o) => o.synced)) {
        await db.operations.put(op);
      }

      const pendingIds = new Set(
        localOps.filter((o) => !o.synced).map((o) => o.id)
      );
      for (const id of pendingIds) {
        const op = opMap.get(id);
        if (op && remoteOps.some((r) => r.id === id)) {
          await db.operations.update(id, { synced: true });
        }
      }
    });

    this.lamportClock = Math.max(serverLamport, maxLamportClock(allOps));
  }

  async createSnapshot(label?: string): Promise<LocalVersion> {
    const db = getLocalDB();
    const doc = await db.documents.get(this.documentId);
    if (!doc) throw new Error("Document not found");

    const version: LocalVersion = {
      id: crypto.randomUUID(),
      documentId: this.documentId,
      label: label ?? null,
      title: doc.title,
      content: doc.content,
      createdAt: Date.now(),
      synced: false,
    };

    await db.versions.put(version);

    if (this.isOnline) {
      try {
        const res = await fetch(`/api/documents/${this.documentId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        });
        if (res.ok) {
          const data = await res.json();
          await db.versions.update(version.id, {
            id: data.version.id,
            synced: true,
          });
        }
      } catch {
        // Will sync later
      }
    }

    return version;
  }

  async fetchVersions(): Promise<LocalVersion[]> {
    const db = getLocalDB();

    if (this.isOnline) {
      try {
        const res = await fetch(`/api/documents/${this.documentId}/versions`);
        if (res.ok) {
          const data = await res.json();
          for (const v of data.versions) {
            await db.versions.put({
              id: v.id,
              documentId: this.documentId,
              label: v.label,
              title: v.title,
              content: v.content,
              createdAt: new Date(v.createdAt).getTime(),
              synced: true,
            });
          }
        }
      } catch {
        // Use local cache
      }
    }

    return db.versions
      .where("documentId")
      .equals(this.documentId)
      .reverse()
      .sortBy("createdAt");
  }

  async restoreVersion(versionId: string, role: string): Promise<void> {
    if (role === "VIEWER") throw new Error("Viewers cannot restore versions");

    const db = getLocalDB();
    const version = await db.versions.get(versionId);
    if (!version) throw new Error("Version not found");

    if (this.isOnline) {
      const res = await fetch(
        `/api/documents/${this.documentId}/versions/${versionId}/restore`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Restore failed");
      }
      const data = await res.json();
      await db.documents.update(this.documentId, {
        content: data.content,
        updatedAt: Date.now(),
        pendingSync: false,
      });
    } else {
      await this.applyLocalEdit(version.content, role);
    }

    await this.sync();
  }
}

export async function cacheDocumentFromServer(doc: {
  id: string;
  title: string;
  content: string;
  role: string;
  ownerId: string;
  updatedAt: string;
}): Promise<void> {
  const db = getLocalDB();
  await db.documents.put({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    role: doc.role as LocalDocument["role"],
    ownerId: doc.ownerId,
    updatedAt: new Date(doc.updatedAt).getTime(),
    lastSyncedAt: Date.now(),
    pendingSync: false,
  });
}

export async function fetchAndCacheDocuments(): Promise<LocalDocument[]> {
  if (!navigator.onLine) {
    return getLocalDB().documents.toArray();
  }

  const res = await fetch("/api/documents");
  if (!res.ok) return getLocalDB().documents.toArray();

  const data = await res.json();
  const db = getLocalDB();

  for (const doc of data.documents) {
    await cacheDocumentFromServer(doc);
  }

  return db.documents.toArray();
}
