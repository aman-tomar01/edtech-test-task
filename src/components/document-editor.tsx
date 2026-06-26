"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Wand2,
  FileText,
  PenLine,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { SyncStatusIndicator } from "@/components/sync-status";
import { VersionTimeline } from "@/components/version-timeline";
import { SyncEngine, type SyncState } from "@/lib/sync/sync-engine";
import { cacheDocumentFromServer } from "@/lib/sync/sync-engine";
import type { LocalVersion } from "@/lib/sync/local-db";
import { Badge } from "@/components/ui/badge";

interface DocumentEditorProps {
  documentId: string;
  userId: string;
  ownerId: string;
  initialTitle: string;
  initialContent: string;
  role: string;
}

export function DocumentEditor({
  documentId,
  userId,
  ownerId,
  initialTitle,
  initialContent,
  role,
}: DocumentEditorProps) {
  const [title] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [syncState, setSyncState] = useState<SyncState>({
    status: "synced",
    lastSyncedAt: null,
    pendingCount: 0,
    error: null,
  });
  const [versions, setVersions] = useState<LocalVersion[]>([]);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<string | null>(null);

  const engineRef = useRef<SyncEngine | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  useEffect(() => {
    async function init() {
      await cacheDocumentFromServer({
        id: documentId,
        title: initialTitle,
        content: initialContent,
        role,
        ownerId,
        updatedAt: new Date().toISOString(),
      });

      const engine = new SyncEngine(documentId, userId);
      engineRef.current = engine;

      const unsub = engine.subscribe(setSyncState);
      await engine.init();
      const localContent = await engine.getContent();
      if (localContent) setContent(localContent);
      const v = await engine.fetchVersions();
      setVersions(v);

      return unsub;
    }

    let cleanup: (() => void) | undefined;
    init().then((unsub) => {
      cleanup = unsub;
    });

    return () => {
      cleanup?.();
      engineRef.current?.destroy();
    };
  }, [documentId, userId, ownerId, initialTitle, initialContent, role]);

  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value);
      if (!canEdit) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        engineRef.current?.applyLocalEdit(value, role);
      }, 300);
    },
    [canEdit, role]
  );

  async function runAI(action: string, tone?: string) {
    setAiLoading(action);
    setAiResult(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, content, tone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiResult(data.error ?? "AI unavailable");
        return;
      }
      setAiResult(data.result);
    } catch {
      setAiResult("AI request failed");
    } finally {
      setAiLoading(null);
    }
  }

  function applyAIResult() {
    if (aiResult && canEdit) {
      handleContentChange(aiResult);
      setAiResult(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{title}</h1>
            <Badge variant="info">{role}</Badge>
          </div>
          <SyncStatusIndicator state={syncState} />
        </div>

        {canEdit && (
          <div
            className="flex flex-wrap gap-2"
            role="toolbar"
            aria-label="AI writing tools"
          >
            {[
              { action: "summarize", icon: FileText, label: "Summarize" },
              { action: "improve", icon: Wand2, label: "Improve" },
              { action: "continue", icon: PenLine, label: "Continue" },
              { action: "tone", icon: Sparkles, label: "Professional tone", tone: "professional" },
            ].map(({ action, icon: Icon, label, tone }) => (
              <Button
                key={action + (tone ?? "")}
                variant="outline"
                size="sm"
                disabled={!!aiLoading}
                onClick={() => runAI(action, tone)}
              >
                {aiLoading === action ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {label}
              </Button>
            ))}
          </div>
        )}

        {aiResult && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
            <p className="mb-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
              AI Suggestion
            </p>
            <p className="mb-3 whitespace-pre-wrap text-sm">{aiResult}</p>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" onClick={applyAIResult}>
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAiResult(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        )}

        <Textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          readOnly={!canEdit}
          className="min-h-[60vh] flex-1 resize-none font-mono text-sm leading-relaxed"
          aria-label="Document content"
          placeholder={canEdit ? "Start writing…" : "Read-only document"}
        />
      </div>

      <aside className="w-full lg:w-80 lg:shrink-0">
        <VersionTimeline
          versions={versions}
          canEdit={canEdit}
          onSnapshot={async (label) => {
            const v = await engineRef.current!.createSnapshot(label);
            setVersions((prev) => [v, ...prev]);
          }}
          onRestore={async (id) => {
            await engineRef.current!.restoreVersion(id, role);
            const c = await engineRef.current!.getContent();
            setContent(c);
            const v = await engineRef.current!.fetchVersions();
            setVersions(v);
          }}
        />
      </aside>
    </div>
  );
}
