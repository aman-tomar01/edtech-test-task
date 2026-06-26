import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDocumentAccess } from "@/lib/auth/authorization";
import { parseJsonSafely, createVersionSchema } from "@/lib/validation/schemas";
import { restoreDocumentVersion } from "@/lib/server/sync-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDocumentAccess(id).catch((r) => r);
  if (access instanceof Response) return access;

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ versions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDocumentAccess(id, "edit").catch((r) => r);
  if (access instanceof Response) return access;

  const body = await request.text();
  const parsed = parseJsonSafely(body, createVersionSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
  const opCount = await prisma.operation.count({ where: { documentId: id } });

  const version = await prisma.documentVersion.create({
    data: {
      documentId: id,
      userId: access.user.id,
      title: doc.title,
      content: doc.content,
      label: parsed.data.label ?? `Snapshot ${new Date().toLocaleString()}`,
      operationCount: opCount,
    },
  });

  return NextResponse.json({ version }, { status: 201 });
}

export async function restoreVersion(
  documentId: string,
  versionId: string,
  userId: string
) {
  return restoreDocumentVersion(documentId, versionId, userId);
}
