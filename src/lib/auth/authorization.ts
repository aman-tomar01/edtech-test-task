import { DocumentRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type UserRole = DocumentRole | null;

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function getDocumentRole(
  documentId: string,
  userId: string
): Promise<UserRole> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { members: { where: { userId } } },
  });

  if (!doc) return null;
  if (doc.ownerId === userId) return DocumentRole.OWNER;

  const membership = doc.members[0];
  return membership?.role ?? null;
}

export function canRead(role: UserRole): boolean {
  return role !== null;
}

export function canEdit(role: UserRole): boolean {
  return role === DocumentRole.OWNER || role === DocumentRole.EDITOR;
}

export function canManageMembers(role: UserRole): boolean {
  return role === DocumentRole.OWNER;
}

export function canSync(role: UserRole): boolean {
  return canEdit(role);
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

export async function requireDocumentAccess(
  documentId: string,
  minRole: "read" | "edit" | "owner" = "read"
) {
  const user = await requireAuth();
  const role = await getDocumentRole(documentId, user.id);

  if (!canRead(role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (minRole === "edit" && !canEdit(role)) {
    throw new Response(JSON.stringify({ error: "Editors only" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (minRole === "owner" && !canManageMembers(role)) {
    throw new Response(JSON.stringify({ error: "Owner only" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { user, role: role! };
}
