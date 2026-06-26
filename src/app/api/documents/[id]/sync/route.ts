import { NextResponse } from "next/server";
import { requireDocumentAccess } from "@/lib/auth/authorization";
import { parseJsonSafely, syncPushSchema } from "@/lib/validation/schemas";
import { processSyncPush } from "@/lib/server/sync-service";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDocumentAccess(id, "edit").catch((r) => r);
  if (access instanceof Response) return access;

  if (!checkRateLimit(access.user.id)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await request.text();
  const parsed = parseJsonSafely(body, syncPushSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await processSyncPush(
      id,
      access.user.id,
      parsed.data.operations
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDocumentAccess(id).catch((r) => r);
  if (access instanceof Response) return access;

  const { prisma } = await import("@/lib/prisma");
  const ops = await prisma.operation.findMany({
    where: { documentId: id },
    orderBy: [{ lamportClock: "asc" }, { userId: "asc" }, { id: "asc" }],
  });

  const doc = await prisma.document.findUniqueOrThrow({ where: { id } });

  return NextResponse.json({
    operations: ops,
    content: doc.content,
  });
}
