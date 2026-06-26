"use client";

import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SyncState } from "@/lib/sync/sync-engine";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_CONFIG = {
  synced: {
    label: "Synced",
    variant: "success" as const,
    icon: CheckCircle2,
  },
  pending: {
    label: "Pending sync",
    variant: "warning" as const,
    icon: Clock,
  },
  syncing: {
    label: "Syncing…",
    variant: "info" as const,
    icon: RefreshCw,
  },
  offline: {
    label: "Offline",
    variant: "default" as const,
    icon: WifiOff,
  },
  error: {
    label: "Sync error",
    variant: "error" as const,
    icon: AlertCircle,
  },
};

export function SyncStatusIndicator({ state }: { state: SyncState }) {
  const config = STATUS_CONFIG[state.status];
  const Icon = config.icon;
  const spinning = state.status === "syncing";

  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${config.label}`}
    >
      <Badge variant={config.variant} className="gap-1.5">
        <Icon
          className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`}
          aria-hidden
        />
        {config.label}
        {state.pendingCount > 0 && ` (${state.pendingCount})`}
      </Badge>
      {state.lastSyncedAt && state.status === "synced" && (
        <span className="text-xs text-zinc-500">
          {formatRelativeTime(state.lastSyncedAt)}
        </span>
      )}
      {typeof navigator !== "undefined" && navigator.onLine && (
        <Wifi className="h-3.5 w-3.5 text-emerald-500" aria-label="Online" />
      )}
      {state.error && (
        <span className="text-xs text-red-500" role="alert">
          {state.error}
        </span>
      )}
    </div>
  );
}
