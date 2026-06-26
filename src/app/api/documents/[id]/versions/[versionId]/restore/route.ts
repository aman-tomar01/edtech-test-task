import { NextResponse } from "next/server";
import { requireDocumentAccess } from "@/lib/auth/authorization";
import { restoreDocumentVersion } from "@/lib/server/sync-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;
  const access = await requireDocumentAccess(id, "edit").catch((r) => r);
  if (access instanceof Response) return access;

  try {
    const content = await restoreDocumentVersion(
      id,
      versionId,
      access.user.id
    );
    return NextResponse.json({ content, restored: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
