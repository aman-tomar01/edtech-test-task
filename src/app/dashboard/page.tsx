"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Plus, FileText, LogOut, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchAndCacheDocuments } from "@/lib/sync/sync-engine";
import type { LocalDocument } from "@/lib/sync/local-db";
import { formatRelativeTime } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchAndCacheDocuments()
      .then(setDocuments)
      .finally(() => setLoading(false));
  }, [status]);

  async function createDocument() {
    if (!newTitle.trim()) return;
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewTitle("");
      router.push(`/documents/${data.document.id}`);
    }
  }

  if (status === "loading" || loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DocSync</h1>
          <p className="text-sm text-zinc-500">
            Welcome, {session?.user?.name ?? session?.user?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {offline && (
            <Badge variant="warning" className="gap-1">
              <WifiOff className="h-3 w-3" />
              Offline mode
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">New document</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="Document title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createDocument()}
            aria-label="New document title"
          />
          <Button onClick={createDocument} disabled={offline && !newTitle}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>

      <section aria-label="Your documents">
        <h2 className="mb-4 text-lg font-semibold">Your documents</h2>
        {documents.length === 0 ? (
          <p className="text-zinc-500">No documents yet. Create one above.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link href={`/documents/${doc.id}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-start gap-3 p-4">
                      <FileText
                        className="mt-0.5 h-5 w-5 text-indigo-500"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{doc.title}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {doc.content.slice(0, 80) || "Empty document"}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="info">{doc.role}</Badge>
                          {doc.pendingSync && (
                            <Badge variant="warning">Pending sync</Badge>
                          )}
                          <span className="text-xs text-zinc-400">
                            {formatRelativeTime(doc.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
