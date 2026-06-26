import { mergeOperations, maxLamportClock, type TextOperation } from "@/lib/sync/operations";
import { prisma } from "@/lib/prisma";
import type { OperationInput } from "@/lib/validation/schemas";
import { LIMITS } from "@/lib/validation/limits";

export function toTextOperation(
  op: OperationInput,
  documentId: string,
  userId: string
): TextOperation {
  return {
    id: op.id,
    documentId,
    userId,
    clientId: op.clientId,
    type: op.type,
    position: op.position,
    content: op.content,
    lamportClock: op.lamportClock,
    timestamp:
      typeof op.timestamp === "string"
        ? new Date(op.timestamp).getTime()
        : op.timestamp,
  };
}

export async function processSyncPush(
  documentId: string,
  userId: string,
  operations: OperationInput[]
): Promise<{
  remoteOperations: TextOperation[];
  content: string;
  lamportClock: number;
}> {
  const existingCount = await prisma.operation.count({
    where: { documentId },
  });

  if (existingCount + operations.length > LIMITS.MAX_OPERATIONS_TOTAL) {
    throw new Error("Document operation limit exceeded");
  }

  const newOps = operations.map((op) => toTextOperation(op, documentId, userId));

  await prisma.$transaction(async (tx) => {
    for (const op of newOps) {
      await tx.operation.upsert({
        where: {
          documentId_id: { documentId, id: op.id },
        },
        create: {
          id: op.id,
          documentId,
          userId: op.userId,
          clientId: op.clientId,
          type: op.type,
          position: op.position,
          content: op.content,
          lamportClock: op.lamportClock,
          timestamp: new Date(op.timestamp),
        },
        update: {},
      });
    }

    const allOps = await tx.operation.findMany({
      where: { documentId },
      orderBy: [{ lamportClock: "asc" }, { userId: "asc" }, { id: "asc" }],
    });

    const textOps: TextOperation[] = allOps.map((o) => ({
      id: o.id,
      documentId: o.documentId,
      userId: o.userId,
      clientId: o.clientId,
      type: o.type as "insert" | "delete",
      position: o.position,
      content: o.content,
      lamportClock: o.lamportClock,
      timestamp: o.timestamp.getTime(),
    }));

    const content = mergeOperations("", textOps);

    if (content.length > LIMITS.MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new Error("Document content limit exceeded");
    }

    await tx.document.update({
      where: { id: documentId },
      data: { content, updatedAt: new Date() },
    });

    await tx.syncCursor.upsert({
      where: {
        documentId_userId: { documentId, userId },
      },
      create: {
        documentId,
        userId,
        lastLamportClock: maxLamportClock(textOps),
      },
      update: {
        lastLamportClock: maxLamportClock(textOps),
        lastSyncedAt: new Date(),
      },
    });
  });

  const allServerOps = await prisma.operation.findMany({
    where: { documentId },
    orderBy: [{ lamportClock: "asc" }, { userId: "asc" }, { id: "asc" }],
  });

  const pushedIds = new Set(operations.map((o) => o.id));
  const remoteOperations: TextOperation[] = allServerOps
    .filter((o) => !pushedIds.has(o.id))
    .map((o) => ({
      id: o.id,
      documentId: o.documentId,
      userId: o.userId,
      clientId: o.clientId,
      type: o.type as "insert" | "delete",
      position: o.position,
      content: o.content,
      lamportClock: o.lamportClock,
      timestamp: o.timestamp.getTime(),
    }));

  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
  });

  return {
    remoteOperations,
    content: doc.content,
    lamportClock: maxLamportClock(
      allServerOps.map((o) => ({
        id: o.id,
        documentId: o.documentId,
        userId: o.userId,
        clientId: o.clientId,
        type: o.type as "insert" | "delete",
        position: o.position,
        content: o.content,
        lamportClock: o.lamportClock,
        timestamp: o.timestamp.getTime(),
      }))
    ),
  };
}

export async function restoreDocumentVersion(
  documentId: string,
  versionId: string,
  userId: string
): Promise<string> {
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId },
  });

  if (!version) throw new Error("Version not found");

  const restoreOp: TextOperation = {
    id: crypto.randomUUID(),
    documentId,
    userId,
    clientId: "restore",
    type: "insert",
    position: 0,
    content: version.content,
    lamportClock: Date.now(),
    timestamp: Date.now(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.operation.deleteMany({ where: { documentId } });

    await tx.operation.create({
      data: {
        id: restoreOp.id,
        documentId,
        userId,
        clientId: restoreOp.clientId,
        type: "insert",
        position: 0,
        content: version.content,
        lamportClock: restoreOp.lamportClock,
        timestamp: new Date(),
      },
    });

    await tx.document.update({
      where: { id: documentId },
      data: { content: version.content, updatedAt: new Date() },
    });
  });

  return version.content;
}
