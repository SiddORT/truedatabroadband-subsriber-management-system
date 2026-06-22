import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Loader2,
  Lock,
  MessageSquareDashed,
  Paperclip,
  Send,
  User,
  X,
} from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { adminSupportApi, TicketMessage } from "@/services/support";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_FOR_CUSTOMER", label: "Waiting for Customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  WAITING_FOR_CUSTOMER: "bg-purple-100 text-purple-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function MessageBubble({ msg }: { msg: TicketMessage }) {
  const isAdmin = msg.sender_role === "SUPERADMIN";
  const isInternal = msg.is_internal_note;

  if (isInternal) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <Lock className="h-3 w-3 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700">
            Internal Note · {msg.sender_name || "Admin"}
          </span>
          <span className="text-xs text-amber-500">{fmt(msg.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-amber-900 leading-relaxed">
          {msg.message}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex", isAdmin ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-3 shadow-sm",
          isAdmin
            ? "rounded-br-none bg-primary text-white"
            : "rounded-bl-none border border-border bg-surface text-foreground"
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className={cn("text-xs font-semibold", isAdmin ? "text-white/80" : "text-muted-foreground")}>
            {isAdmin ? (msg.sender_name || "Support Team") : (msg.sender_name || "Customer")}
          </span>
          <span className={cn("text-xs", isAdmin ? "text-white/60" : "text-muted-foreground")}>
            {fmt(msg.created_at)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.message}</p>
        {msg.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {msg.attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-1.5 text-xs opacity-80">
                <Paperclip className="h-3 w-3" />
                <span>{att.original_filename}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CloseTicketModal({
  open,
  onConfirm,
  onCancel,
  isPending,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <span className="text-sm font-semibold text-foreground">Close Ticket</span>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-foreground">
            Are you sure you want to close this ticket?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This action cannot be undone. The customer will no longer be able to reply.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Close Ticket
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canEditTicket = usePermission("support_tickets", "edit");
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [replyMode, setReplyMode] = useState<"reply" | "note">("reply");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: () => adminSupportApi.get(id!),
    enabled: !!id,
  });

  const update = useMutation({
    mutationFn: (payload: { status?: string; priority?: string }) =>
      adminSupportApi.update(id!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      showToast("Ticket updated.", "success");
    },
    onError: (e: Error) => showToast(e.message || "Update failed.", "error"),
  });

  const closeTicket = useMutation({
    mutationFn: () => adminSupportApi.close(id!),
    onSuccess: () => {
      setShowCloseModal(false);
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      showToast("Ticket closed.", "success");
    },
    onError: () => {
      setShowCloseModal(false);
      showToast("Failed to close ticket.", "error");
    },
  });

  const reply = useMutation({
    mutationFn: () => adminSupportApi.reply(id!, replyText.trim()),
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      showToast("Reply sent.", "success");
    },
    onError: () => showToast("Failed to send reply.", "error"),
  });

  const addNote = useMutation({
    mutationFn: () => adminSupportApi.addInternalNote(id!, noteText.trim()),
    onSuccess: () => {
      setNoteText("");
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      showToast("Internal note added.", "success");
    },
    onError: () => showToast("Failed to add note.", "error"),
  });

  const upload = useMutation({
    mutationFn: (file: File) => adminSupportApi.uploadAttachment(id!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      showToast("File uploaded.", "success");
    },
    onError: () => showToast("Upload failed.", "error"),
  });

  if (isLoading) {
    return (
      <AppLayout title="Support Ticket" portalLabel="Administration">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!ticket) {
    return (
      <AppLayout title="Support Ticket" portalLabel="Administration">
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Ticket not found.
        </div>
      </AppLayout>
    );
  }

  const isClosed = ticket.status === "CLOSED";

  return (
    <AppLayout title={`Ticket ${ticket.ticket_number}`} portalLabel="Administration">
      <CloseTicketModal
        open={showCloseModal}
        onConfirm={() => closeTicket.mutate()}
        onCancel={() => setShowCloseModal(false)}
        isPending={closeTicket.isPending}
      />

      <div className="space-y-4">
        {/* Top bar */}
        <div className="flex flex-wrap items-start gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/support")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-muted-foreground">
                {ticket.ticket_number}
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_BADGE[ticket.status])}>
                {ticket.status.replace(/_/g, " ")}
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_BADGE[ticket.priority])}>
                {ticket.priority}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-semibold leading-tight">{ticket.subject}</h2>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Main: conversation */}
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-border bg-background shadow-sm">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium">Conversation</p>
              </div>
              <div className="space-y-4 p-4">
                {ticket.messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  ticket.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
                )}
              </div>

              {/* Reply / Note composer */}
              {!isClosed && canEditTicket && (
                <div className="border-t border-border p-4">
                  <div className="mb-3 flex gap-2">
                    <button
                      onClick={() => setReplyMode("reply")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        replyMode === "reply"
                          ? "bg-primary text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      Reply to Customer
                    </button>
                    <button
                      onClick={() => setReplyMode("note")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        replyMode === "note"
                          ? "bg-amber-500 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      <Lock className="h-3 w-3" />
                      Internal Note
                    </button>
                  </div>
                  {replyMode === "reply" ? (
                    <>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply to the customer…"
                        rows={3}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            ref={fileRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) upload.mutate(f);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileRef.current?.click()}
                            disabled={upload.isPending}
                          >
                            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            Attach
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => reply.mutate()}
                          disabled={!replyText.trim() || reply.isPending}
                        >
                          {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Send Reply
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Internal note (not visible to customer)…"
                        rows={3}
                        className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          className="bg-amber-500 hover:bg-amber-600 text-white"
                          onClick={() => addNote.mutate()}
                          disabled={!noteText.trim() || addNote.isPending}
                        >
                          {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareDashed className="h-4 w-4" />}
                          Add Note
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {isClosed && (
                <div className="border-t border-border p-3 text-center text-sm text-muted-foreground">
                  This ticket is closed.
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: info + actions */}
          <div className="space-y-4">
            {/* Ticket Actions */}
            {!isClosed && canEditTicket && (
              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold">Actions</p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                    <select
                      defaultValue={ticket.status}
                      onChange={(e) => update.mutate({ status: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
                    <select
                      defaultValue={ticket.priority}
                      onChange={(e) => update.mutate({ priority: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {PRIORITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50"
                    disabled={closeTicket.isPending}
                    onClick={() => setShowCloseModal(true)}
                  >
                    {closeTicket.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    Close Ticket
                  </Button>
                </div>
              </div>
            )}

            {/* Customer Context */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Customer</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{ticket.customer.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span className="font-mono text-xs">{ticket.customer.customer_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mobile</span>
                  <span>{ticket.customer.mobile_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="truncate text-xs">{ticket.customer.email || "—"}</span>
                </div>
                {ticket.outstanding_amount > 0 && (
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className="font-semibold text-red-600">
                      ₹{ticket.outstanding_amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Subscription */}
            {ticket.subscription && (
              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold">Connection</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connection</span>
                    <span className="font-medium">{ticket.subscription.connection_name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plan</span>
                    <span>{ticket.subscription.plan_name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expiry</span>
                    <span>{fmtDate(ticket.subscription.expiry_date)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Ticket Info */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Ticket Info</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span>{ticket.category.replace(/_/g, " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-xs">{fmt(ticket.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">First Response</span>
                  <span className="text-xs">{fmt(ticket.first_response_at)}</span>
                </div>
                {ticket.resolved_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resolved</span>
                    <span className="text-xs">{fmt(ticket.resolved_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
