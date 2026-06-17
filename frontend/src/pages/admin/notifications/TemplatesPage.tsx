import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Eye, X } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/contexts/ToastContext";
import { getApiErrorMessage } from "@/services/api";
import { listTemplates, updateTemplate } from "@/services/notification";
import type { NotificationTemplate, NotificationTemplateUpdate } from "@/types/notification";
import { CHANNEL_COLORS, TEMPLATE_KEY_LABELS } from "@/types/notification";

// ── Helpers ───────────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  const cls = CHANNEL_COLORS[channel as keyof typeof CHANNEL_COLORS] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {channel}
    </span>
  );
}

// ── Edit Drawer ───────────────────────────────────────────────────────────

interface EditDrawerProps {
  template: NotificationTemplate;
  onClose: () => void;
  onSave: (id: string, data: NotificationTemplateUpdate) => void;
  saving: boolean;
}

function EditDrawer({ template, onClose, onSave, saving }: EditDrawerProps) {
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const [isActive, setIsActive] = useState(template.is_active);
  const [previewMode, setPreviewMode] = useState(false);

  function handleSave() {
    onSave(template.id, {
      subject: template.channel === "EMAIL" ? subject : undefined,
      body,
      is_active: isActive,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex w-full max-w-2xl flex-col bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Edit Template
            </h2>
            <p className="text-xs text-muted-foreground">
              {TEMPLATE_KEY_LABELS[template.template_key] ?? template.template_key} /{" "}
              {template.channel}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Read-only info */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex gap-2">
              <span className="font-medium text-muted-foreground w-32">Template Key</span>
              <span className="font-mono text-foreground">{template.template_key}</span>
            </div>
            {template.dlt_template_id && (
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-32">DLT Template ID</span>
                <span className="font-mono text-foreground">{template.dlt_template_id}</span>
              </div>
            )}
            {template.approved_variables && template.approved_variables.length > 0 && (
              <div className="flex gap-2">
                <span className="font-medium text-muted-foreground w-32">Variables</span>
                <span className="text-foreground">{`{${template.approved_variables.join("}, {")}}`}</span>
              </div>
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground">Active</label>
            <button
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isActive ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Subject (email only) */}
          {template.channel === "EMAIL" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {template.channel === "EMAIL" ? "HTML Body" : "SMS Body"}
              </label>
              {template.channel === "EMAIL" && (
                <button
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={() => setPreviewMode((v) => !v)}
                >
                  <Eye className="h-3 w-3" />
                  {previewMode ? "Edit" : "Preview"}
                </button>
              )}
            </div>
            {previewMode ? (
              <div
                className="min-h-[200px] rounded-lg border border-border bg-white p-4 text-sm"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Use <code className="rounded bg-muted px-1">{"{variable_name}"}</code> placeholders.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export function NotificationTemplatesPage() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<NotificationTemplate | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: listTemplates,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: NotificationTemplateUpdate }) =>
      updateTemplate(id, data),
    onSuccess: () => {
      showToast("Template updated successfully", "success");
      qc.invalidateQueries({ queryKey: ["notification-templates"] });
      setEditTarget(null);
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err), "error");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateTemplate(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-templates"] });
      setTogglingId(null);
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err), "error");
      setTogglingId(null);
    },
  });

  // Group by template_key
  const grouped = templates.reduce<Record<string, NotificationTemplate[]>>((acc, t) => {
    if (!acc[t.template_key]) acc[t.template_key] = [];
    acc[t.template_key].push(t);
    return acc;
  }, {});

  return (
    <AppLayout title="Notification Templates" portalLabel="Admin Portal">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-foreground">Notification Templates</h2>
          <p className="text-sm text-muted-foreground">
            Manage SMS and Email templates. Variables shown in{" "}
            <code className="rounded bg-muted px-1 text-xs">{"{braces}"}</code> are replaced at send time.
          </p>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
            Loading templates…
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([key, rows]) => (
              <div
                key={key}
                className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
              >
                {/* Group header */}
                <div className="border-b border-border bg-muted/30 px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {TEMPLATE_KEY_LABELS[key] ?? key}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-mono">{key}</p>
                </div>

                {/* Channel rows */}
                <div className="divide-y divide-border">
                  {rows.map((tmpl) => {
                    const isToggling = togglingId === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ChannelBadge channel={tmpl.channel} />
                          {tmpl.subject && (
                            <span className="hidden text-xs text-muted-foreground truncate sm:block">
                              {tmpl.subject}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {tmpl.dlt_template_id && (
                            <span className="hidden text-[10px] font-mono text-muted-foreground sm:block">
                              DLT: {tmpl.dlt_template_id}
                            </span>
                          )}
                          {/* Inline enable/disable toggle */}
                          <button
                            onClick={() => {
                              setTogglingId(tmpl.id);
                              toggleMutation.mutate({ id: tmpl.id, is_active: !tmpl.is_active });
                            }}
                            disabled={isToggling}
                            title={tmpl.is_active ? "Click to disable" : "Click to enable"}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                              tmpl.is_active ? "bg-emerald-500" : "bg-gray-300"
                            } ${isToggling ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${tmpl.is_active ? "translate-x-4" : "translate-x-1"}`} />
                          </button>
                          <span className={`text-xs font-medium w-14 ${tmpl.is_active ? "text-emerald-600" : "text-gray-400"}`}>
                            {tmpl.is_active ? "Enabled" : "Disabled"}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditTarget(tmpl)}
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editTarget && (
        <EditDrawer
          template={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(id, data) => saveMutation.mutate({ id, data })}
          saving={saveMutation.isPending}
        />
      )}
    </AppLayout>
  );
}
