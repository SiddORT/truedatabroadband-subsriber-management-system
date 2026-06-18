import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { adminNotificationsApi, AdminNotification } from "@/services/adminNotifications";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function AdminNotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => adminNotificationsApi.list({ page: 1, page_size: 10 }),
    refetchInterval: 15000,
    enabled: user?.role === "SUPERADMIN",
  });

  const markRead = useMutation({
    mutationFn: (id: string) => adminNotificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => adminNotificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  const unread = data?.unread_count ?? 0;

  function handleNotifClick(n: AdminNotification) {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.action_url) navigate(n.action_url);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {!data || data.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Bell className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                data.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={cn(
                      "w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/40 last:border-0",
                      !n.is_read && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm leading-snug", !n.is_read && "font-semibold")}>
                          {n.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {n.message}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {!n.is_read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                      {n.action_url && (
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-border px-4 py-2.5">
              <button
                onClick={() => { navigate("/admin/support"); setOpen(false); }}
                className="w-full text-center text-xs font-medium text-primary hover:underline"
              >
                View all support tickets →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
