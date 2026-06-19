import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/contexts/ToastContext";
import { clientSupportApi } from "@/services/support";
import { api, getApiErrorMessage } from "@/services/api";

const CATEGORIES = [
  { value: "NO_INTERNET", label: "No Internet" },
  { value: "SLOW_SPEED", label: "Slow Speed" },
  { value: "BILLING_ISSUE", label: "Billing Issue" },
  { value: "PLAN_CHANGE", label: "Plan Change" },
  { value: "TECHNICAL_ISSUE", label: "Technical Issue" },
  { value: "OTHER", label: "Other" },
];

export function ClientSupportNewPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [subscriptionId, setSubscriptionId] = useState("");

  const { data: subs } = useQuery({
    queryKey: ["client-subscriptions-for-ticket"],
    queryFn: () =>
      api.get("/client/subscriptions").then((r) => r.data as { items: Array<{ id: string; connection_name: string }> }),
  });

  const create = useMutation({
    mutationFn: () =>
      clientSupportApi.create({
        subject: subject.trim(),
        description: description.trim(),
        category,
        subscription_id: subscriptionId || null,
      }),
    onSuccess: (ticket) => {
      showToast(`Ticket ${ticket.ticket_number} created.`, "success");
      navigate(`/client/support/${ticket.id}`);
    },
    onError: (err) => showToast(getApiErrorMessage(err, "Failed to create ticket. Please try again."), "error"),
  });

  const isValid = subject.trim().length >= 5 && description.trim().length >= 10 && category;

  return (
    <ClientLayout title="Support">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">Raise a Support Ticket</h2>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-5">
            <div>
              <Label htmlFor="category">Category *</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {subs && subs.items.length > 0 && (
              <div>
                <Label htmlFor="subscription">Related Connection (Optional)</Label>
                <select
                  id="subscription"
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">No specific connection</option>
                  {subs.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.connection_name || s.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue"
                maxLength={255}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">{subject.length}/255</p>
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe the issue in detail — when it started, what you've tried, error messages, etc."
                rows={6}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">Minimum 10 characters</p>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button
                onClick={() => create.mutate()}
                disabled={!isValid || create.isPending}
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Ticket
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
