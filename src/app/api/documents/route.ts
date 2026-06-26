import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/authorization";
import { parseJsonSafely, createDocumentSchema } from "@/lib/validation/schemas";

export async function GET() {
  const user = await requireAuth().catch((r) => r);
  if (user instanceof Response) return user;

  const owned = await prisma.document.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      ownerId: true,
      updatedAt: true,
    },
  });

  const memberships = await prisma.documentMember.findMany({
    where: { userId: user.id },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          content: true,
          ownerId: true,
          updatedAt: true,
        },
      },
    },
  });

  const memberDocs = memberships.map((m) => ({
    ...m.document,
    role: m.role,
  }));

  const ownedDocs = owned.map((d) => ({ ...d, role: "OWNER" as const }));

  const seen = new Set<string>();
  const documents = [...ownedDocs, ...memberDocs].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const user = await requireAuth().catch((r) => r);
  if (user instanceof Response) return user;

  const body = await request.text();
  const parsed = parseJsonSafely(body, createDocumentSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const doc = await prisma.document.create({
    data: {
      title: parsed.data.title,
      ownerId: user.id,
      members: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
    select: {
      id: true,
      title: true,
      content: true,
      ownerId: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    { document: { ...doc, role: "OWNER" } },
    { status: 201 }
  );
}
