"use client";

import { useState } from "react";
import { History, RotateCcw, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { LocalVersion } from "@/lib/sync/local-db";

interface VersionTimelineProps {
  versions: LocalVersion[];
  onSnapshot: (label?: string) => Promise<void>;
  onRestore: (versionId: string) => Promise<void>;
  canEdit: boolean;
}

export function VersionTimeline({
  versions,
  onSnapshot,
  onRestore,
  canEdit,
}: VersionTimelineProps) {
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<LocalVersion | null>(null);

  async function handleSnapshot() {
    setLoading("snapshot");
    try {
      await onSnapshot(label || undefined);
      setLabel("");
    } finally {
      setLoading(null);
    }
  }

  async function handleRestore(id: string) {
    if (!confirm("Restore this version? A new sync will propagate to collaborators.")) {
      return;
    }
    setLoading(id);
    try {
      await onRestore(id);
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" aria-hidden />
          Version History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="space-y-2">
            <Label htmlFor="snapshot-label">Snapshot label (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="snapshot-label"
                placeholder="e.g. Before restructure"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button
                size="sm"
                onClick={handleSnapshot}
                disabled={loading === "snapshot"}
                aria-label="Capture snapshot"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div
          className="max-h-[400px] space-y-2 overflow-y-auto"
          role="list"
          aria-label="Document versions"
        >
          {versions.length === 0 && (
            <p className="text-sm text-zinc-500">No versions yet.</p>
          )}
          {versions.map((v) => (
            <div
              key={v.id}
              role="listitem"
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {v.label ?? "Untitled snapshot"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatRelativeTime(v.createdAt)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreview(preview?.id === v.id ? null : v)}
                    aria-expanded={preview?.id === v.id}
                  >
                    Preview
                  </Button>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(v.id)}
                      disabled={loading === v.id}
                      aria-label={`Restore version ${v.label}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {preview?.id === v.id && (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
                  {v.content.slice(0, 500)}
                  {v.content.length > 500 && "…"}
                </pre>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
