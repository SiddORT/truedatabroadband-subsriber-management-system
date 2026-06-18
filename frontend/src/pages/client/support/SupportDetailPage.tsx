import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Paperclip, Send } from "lucide-react";
import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { clientSupportApi, TicketMessage } from "@/services/support";
import { cn } from "@/lib/utils";

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

function fmt(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ msg, isOwn }: { msg: TicketMessage; isOwn: boolean }) {
  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-3 shadow-sm",
          isOwn
            ? "rounded-br-none bg-primary text-white"
            : "rounded-bl-none bg-surface border border-border text-foreground"
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className={cn("text-xs font-semibold", isOwn ? "text-white/80" : "text-muted-foreground")}>
            {isOwn ? "You" : msg.sender_name || "Support Team"}
          </span>
          <span className={cn("text-xs", isOwn ? "text-white/60" : "text-muted-foreground")}>
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
                <span className="opacity-60">({(att.file_size / 1024).toFixed(0)} KB)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["client-ticket", id],
    queryFn: () => clientSupportApi.get(id!),
    enabled: !!id,
    refetchInterval: 30000,
  });

  const reply = useMutation({
    mutationFn: () => clientSupportApi.reply(id!, replyText.trim()),
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["client-ticket", id] });
      showToast("Reply sent.", "success");
    },
    onError: () => showToast("Failed to send reply.", "error"),
  });

  const upload = useMutation({
    mutationFn: (file: File) => clientSupportApi.uploadAttachment(id!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-ticket", id] });
      showToast("File uploaded.", "success");
    },
    onError: () => showToast("Upload failed.", "error"),
  });

  if (isLoading) {
    return (
      <ClientLayout title="Support">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ClientLayout>
    );
  }

  if (!ticket) {
    return (
      <ClientLayout title="Support">
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Ticket not found.
        </div>
      </ClientLayout>
    );
  }

  const isClosed = ticket.status === "CLOSED";

  return (
    <ClientLayout title="Support">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/client/support")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-muted-foreground">
                {ticket.ticket_number}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  STATUS_BADGE[ticket.status]
                )}
              >
                {ticket.status.replace(/_/g, " ")}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  PRIORITY_BADGE[ticket.priority]
                )}
              >
                {ticket.priority}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-semibold leading-tight">{ticket.subject}</h2>
          </div>
        </div>

        {/* Conversation */}
        <div className="rounded-xl border border-border bg-background shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-muted-foreground">Conversation</p>
          </div>
          <div className="space-y-4 p-4">
            {ticket.messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No messages yet.
              </p>
            ) : (
              ticket.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={msg.sender_role === "CLIENT"}
                />
              ))
            )}
          </div>

          {/* Reply box */}
          {!isClosed && (
            <div className="border-t border-border p-4">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply…"
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
                    {upload.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                    Attach
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={() => reply.mutate()}
                  disabled={!replyText.trim() || reply.isPending}
                >
                  {reply.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send Reply
                </Button>
              </div>
            </div>
          )}
          {isClosed && (
            <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">
              This ticket is closed and cannot receive further replies.
            </div>
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
