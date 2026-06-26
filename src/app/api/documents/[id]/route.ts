import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDocumentAccess } from "@/lib/auth/authorization";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDocumentAccess(id).catch((r) => r);
  if (access instanceof Response) return access;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      ownerId: true,
      updatedAt: true,
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    document: { ...doc, role: access.role },
  });
}
