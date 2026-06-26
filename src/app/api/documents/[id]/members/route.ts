import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDocumentAccess } from "@/lib/auth/authorization";
import { parseJsonSafely, inviteMemberSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDocumentAccess(id, "owner").catch((r) => r);
  if (access instanceof Response) return access;

  const body = await request.text();
  const parsed = parseJsonSafely(body, inviteMemberSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const invitee = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (!invitee) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (invitee.id === access.user.id) {
    return NextResponse.json(
      { error: "Cannot invite yourself" },
      { status: 400 }
    );
  }

  const member = await prisma.documentMember.upsert({
    where: {
      documentId_userId: { documentId: id, userId: invitee.id },
    },
    create: {
      documentId: id,
      userId: invitee.id,
      role: parsed.data.role,
    },
    update: { role: parsed.data.role },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ member });
}
