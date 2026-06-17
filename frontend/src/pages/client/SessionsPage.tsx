import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Monitor,
  Smartphone,
  Globe,
  Shield,
  LogOut,
  Trash2,
} from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clientService } from "@/services/client";
import { useToast } from "@/contexts/ToastContext";
import type { ClientSession } from "@/types/client";

function parseDevice(ua: string | null): { label: string; isMobile: boolean } {
  if (!ua) return { label: "Unknown device", isMobile: false };
  const low = ua.toLowerCase();
  const isMobile =
    low.includes("android") ||
    low.includes("iphone") ||
    low.includes("ipad") ||
    low.includes("mobile");

  let browser = "Unknown browser";
  const browsers = [
    ["Chrome", "chrome"],
    ["Firefox", "firefox"],
    ["Safari", "safari"],
    ["Edge", "edg"],
    ["Opera", "opr"],
  ] as const;
  for (const [name, token] of browsers) {
    if (low.includes(token)) { browser = name; break; }
  }

  let os = "";
  const oses = [
    ["Windows", "windows"],
    ["macOS", "mac os"],
    ["Linux", "linux"],
    ["Android", "android"],
    ["iOS", "iphone"],
    ["iOS", "ipad"],
  ] as const;
  for (const [name, token] of oses) {
    if (low.includes(token)) { os = name; break; }
  }

  return { label: os ? `${browser} on ${os}` : browser, isMobile };
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SessionCard({
  session,
  onRevoke,
  revoking,
}: {
  session: ClientSession;
  onRevoke: (jti: string) => void;
  revoking: boolean;
}) {
  const { label, isMobile } = parseDevice(session.user_agent);
  const DeviceIcon = isMobile ? Smartphone : Monitor;

  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors ${
        session.is_current
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            session.is_current
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <DeviceIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            {session.is_current && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Shield className="h-3 w-3" />
                This device
              </span>
            )}
          </div>
          {session.ip_address && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" />
              {session.ip_address}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Signed in: {fmtDate(session.created_at)}
          </p>
          <p className="text-xs text-muted-foreground">
            Expires: {fmtDate(session.expires_at)}
          </p>
        </div>
      </div>

      {!session.is_current && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRevoke(session.jti)}
          disabled={revoking}
          className="shrink-0 text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          {revoking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          Logout
        </Button>
      )}
    </div>
  );
}

export function SessionsPage() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [revokingJti, setRevokingJti] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["client-sessions"],
    queryFn: () => clientService.getSessions(),
  });

  const revokeMutation = useMutation({
    mutationFn: (jti: string) => clientService.revokeSession(jti),
    onMutate: (jti) => setRevokingJti(jti),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-sessions"] });
      showToast("Session logged out.", "success");
    },
    onError: () => {
      showToast("Failed to revoke session.", "error");
    },
    onSettled: () => setRevokingJti(null),
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => clientService.logoutAll(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-sessions"] });
      showToast("All other sessions have been revoked.", "success");
    },
    onError: () => {
      showToast("Failed to logout all sessions.", "error");
    },
  });

  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <ClientLayout title="Active Sessions">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Active Sessions</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage devices that are signed into your account.
            </p>
          </div>
          {otherSessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutAllMutation.mutate()}
              disabled={logoutAllMutation.isPending}
              className="shrink-0 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              {logoutAllMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Logout all other
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <Monitor className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          </div>
        ) : (
          <Card>
            <CardHeader className="border-b border-border px-5 py-3.5">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{sessions.length}</span>{" "}
                active session{sessions.length !== 1 ? "s" : ""}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {sessions.map((session) => (
                <SessionCard
                  key={session.jti}
                  session={session}
                  onRevoke={(jti) => revokeMutation.mutate(jti)}
                  revoking={revokingJti === session.jti && revokeMutation.isPending}
                />
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Sessions expire automatically after 7 days of inactivity.
        </p>
      </div>
    </ClientLayout>
  );
}
