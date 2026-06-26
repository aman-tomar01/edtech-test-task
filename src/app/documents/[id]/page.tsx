import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDocumentRole } from "@/lib/auth/authorization";
import { DocumentEditor } from "@/components/document-editor";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const role = await getDocumentRole(id, session.user.id);
  if (!role) notFound();

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      ownerId: true,
      updatedAt: true,
    },
  });

  if (!doc) notFound();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 sm:p-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to documents
          </Link>
        </Button>
      </div>
      <DocumentEditor
        documentId={doc.id}
        userId={session.user.id}
        ownerId={doc.ownerId}
        initialTitle={doc.title}
        initialContent={doc.content}
        role={role}
      />
    </main>
  );
}
