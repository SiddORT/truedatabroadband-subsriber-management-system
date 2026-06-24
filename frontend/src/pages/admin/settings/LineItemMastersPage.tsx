import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/contexts/ToastContext";
import { getApiErrorMessage } from "@/services/api";
import { lineItemMastersService, type LineItemMasterPayload } from "@/services/lineItemMasters";
import type { LineItemMaster } from "@/types/lineItemMaster";

const GST_RATES = [0, 5, 12, 18, 28];

const INPUT_CLS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

function fmtAmount(v: string | null) {
  if (!v) return "—";
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

interface FormState {
  name: string;
  hsn_sac_code: string;
  description: string;
  default_amount: string;
  gst_percentage: number;
  is_active: boolean;
}

function emptyForm(): FormState {
  return { name: "", hsn_sac_code: "", description: "", default_amount: "", gst_percentage: 18, is_active: true };
}

function formToPayload(f: FormState): LineItemMasterPayload {
  return {
    name: f.name.trim(),
    hsn_sac_code: f.hsn_sac_code.trim() || null,
    description: f.description.trim() || null,
    default_amount: f.default_amount ? Number(f.default_amount) : null,
    gst_percentage: f.gst_percentage,
    is_active: f.is_active,
  };
}

export function LineItemMastersPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Modal state
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<LineItemMaster | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<LineItemMaster | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["line-item-masters", page, search],
    queryFn: () => lineItemMastersService.list({ page, page_size: PAGE_SIZE, search }),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (p: LineItemMasterPayload) => lineItemMastersService.create(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["line-item-masters"] }); setDialog(null); showToast("Line item created", "success"); },
    onError: (e) => showToast(getApiErrorMessage(e), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: (p: LineItemMasterPayload) => lineItemMastersService.update(editing!.id, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["line-item-masters"] }); setDialog(null); showToast("Line item updated", "success"); },
    onError: (e) => showToast(getApiErrorMessage(e), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lineItemMastersService.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["line-item-masters"] }); setDeleteTarget(null); showToast("Line item deleted", "success"); },
    onError: (e) => showToast(getApiErrorMessage(e), "error"),
  });

  function openCreate() {
    setForm(emptyForm());
    setErrors({});
    setEditing(null);
    setDialog("create");
  }

  function openEdit(item: LineItemMaster) {
    setForm({
      name: item.name,
      hsn_sac_code: item.hsn_sac_code ?? "",
      description: item.description ?? "",
      default_amount: item.default_amount ? String(Number(item.default_amount)) : "",
      gst_percentage: Number(item.gst_percentage),
      is_active: item.is_active,
    });
    setErrors({});
    setEditing(item);
    setDialog("edit");
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const payload = formToPayload(form);
    if (dialog === "create") createMutation.mutate(payload);
    else updateMutation.mutate(payload);
  }

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout title="Line Item Masters" portalLabel="Administration">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-semibold text-foreground">Line Item Masters</h2>
              <p className="text-sm text-muted-foreground">Pre-defined charge items with GST rates for invoices</p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Line Item
          </Button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name or HSN/SAC code…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-sm rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Package className="h-8 w-8 opacity-30" />
                <p className="text-sm">No line items yet</p>
                <Button variant="outline" size="sm" onClick={openCreate}><Plus className="mr-1.5 h-3.5 w-3.5" />Add First Item</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-12">Sr.</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Default Amount</th>
                      <th className="px-4 py-3 text-center font-semibold text-muted-foreground">GST %</th>
                      <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{item.name}</p>
                          {item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{fmtAmount(item.default_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {Number(item.gst_percentage)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                            {item.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(item)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(item)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="text-muted-foreground">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} title={dialog === "create" ? "Add Line Item" : "Edit Line Item"}>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Router Fee" className={INPUT_CLS} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Default Amount (₹)</label>
            <input type="number" min="0" step="0.01" value={form.default_amount} onChange={(e) => setForm((f) => ({ ...f, default_amount: e.target.value }))} placeholder="0.00" className={INPUT_CLS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">GST Rate <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {GST_RATES.map((r) => (
                <button key={r} type="button"
                  onClick={() => setForm((f) => ({ ...f, gst_percentage: r }))}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${form.gst_percentage === r ? "border-primary bg-primary text-white" : "border-border bg-muted/30 text-foreground hover:bg-muted"}`}
                >
                  {r}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional description…" className={`${INPUT_CLS} resize-none`} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 accent-primary" />
            <label htmlFor="is_active" className="text-sm font-medium">Active</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialog(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : dialog === "create" ? "Create" : "Save Changes"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Line Item">
        <p className="text-sm text-muted-foreground">
          Delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteTarget!.id)} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Dialog>
    </AppLayout>
  );
}
