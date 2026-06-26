export type OperationType = "insert" | "delete";

export interface TextOperation {
  id: string;
  documentId: string;
  userId: string;
  clientId: string;
  type: OperationType;
  position: number;
  content: string;
  lamportClock: number;
  timestamp: number;
  synced?: boolean;
}

/**
 * Deterministic ordering for conflict resolution.
 * Lamport clock first, then userId, then operation id.
 */
export function compareOperations(a: TextOperation, b: TextOperation): number {
  if (a.lamportClock !== b.lamportClock) {
    return a.lamportClock - b.lamportClock;
  }
  if (a.userId !== b.userId) {
    return a.userId.localeCompare(b.userId);
  }
  return a.id.localeCompare(b.id);
}

function deleteLength(op: TextOperation): number {
  if (op.type !== "delete") return 0;
  const len = parseInt(op.content, 10);
  return Number.isFinite(len) && len >= 0 ? len : 0;
}

/**
 * Transform position against a concurrent operation (for OT-style merge).
 */
export function transformPosition(
  position: number,
  op: TextOperation,
  self: TextOperation
): number {
  const selfComesFirst = compareOperations(self, op) < 0;

  if (op.type === "insert") {
    if (op.position < position) {
      return position + op.content.length;
    }
    if (op.position === position && !selfComesFirst) {
      return position + op.content.length;
    }
    return position;
  }

  const delLen = deleteLength(op);
  const delEnd = op.position + delLen;

  if (delEnd <= position) {
    return position - delLen;
  }
  if (op.position >= position) {
    return position;
  }
  return op.position;
}

/**
 * Apply a single operation to document text.
 */
export function applyOperation(doc: string, op: TextOperation): string {
  const pos = Math.min(Math.max(0, op.position), doc.length);

  if (op.type === "insert") {
    return doc.slice(0, pos) + op.content + doc.slice(pos);
  }

  const len = Math.min(deleteLength(op), doc.length - pos);
  return doc.slice(0, pos) + doc.slice(pos + len);
}

/**
 * Merge and apply operations deterministically.
 * Transforms positions for concurrent edits before applying.
 */
export function mergeOperations(
  baseContent: string,
  operations: TextOperation[]
): string {
  if (operations.length === 0) return baseContent;

  const sorted = [...operations].sort(compareOperations);
  const applied: TextOperation[] = [];
  let doc = baseContent;

  for (const op of sorted) {
    let transformedPos = op.position;
    for (const prior of applied) {
      if (prior.id === op.id) continue;
      if (
        prior.lamportClock <= op.lamportClock ||
        (prior.lamportClock === op.lamportClock && prior.id !== op.id)
      ) {
        transformedPos = transformPosition(transformedPos, prior, op);
      }
    }

    const transformed: TextOperation = { ...op, position: transformedPos };
    doc = applyOperation(doc, transformed);
    applied.push(op);
  }

  return doc;
}

/**
 * Compute text diff as insert/delete operations from old to new content.
 * Uses a simple common-prefix/suffix approach for efficiency.
 */
export function diffToOperations(
  oldText: string,
  newText: string,
  baseLamport: number,
  meta: Pick<TextOperation, "documentId" | "userId" | "clientId"> & {
    idPrefix: string;
  }
): TextOperation[] {
  if (oldText === newText) return [];

  let prefix = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefix < minLen && oldText[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const ops: TextOperation[] = [];
  const now = Date.now();
  const deleteLen = oldText.length - prefix - suffix;

  if (deleteLen > 0) {
    ops.push({
      id: crypto.randomUUID(),
      documentId: meta.documentId,
      userId: meta.userId,
      clientId: meta.clientId,
      type: "delete",
      position: prefix,
      content: String(deleteLen),
      lamportClock: baseLamport + 1,
      timestamp: now,
    });
  }

  const insertText = newText.slice(prefix, newText.length - suffix);
  if (insertText.length > 0) {
    ops.push({
      id: crypto.randomUUID(),
      documentId: meta.documentId,
      userId: meta.userId,
      clientId: meta.clientId,
      type: "insert",
      position: prefix,
      content: insertText,
      lamportClock: baseLamport + ops.length + 1,
      timestamp: now + 1,
    });
  }

  return ops;
}

export function maxLamportClock(operations: TextOperation[]): number {
  return operations.reduce((max, op) => Math.max(max, op.lamportClock), 0);
}
