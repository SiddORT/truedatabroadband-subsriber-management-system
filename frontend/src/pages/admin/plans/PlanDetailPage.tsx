import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft, Edit, Loader2, Zap, Infinity, AlertCircle,
  IndianRupee, Plus, Trash2, CheckCircle2, XCircle, Power,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/contexts/ToastContext";
import { plansService } from "@/services/plans";
import { getApiErrorMessage } from "@/services/api";
import type { Plan, PlanPricing, BillingCycle } from "@/types/plan";
import { BILLING_CYCLE_LABELS } from "@/types/plan";
import { Field } from "@/components/customers/CustomerFormParts";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_CYCLES: BillingCycle[] = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"];

const SELECT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const fmt = (n: number | string) =>
  `₹ ${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ── Edit plan schema ──────────────────────────────────────────────────────────

const editPlanSchema = z
  .object({
    name: z.string().min(1, "Required"),
    description: z.string().optional(),
    speed_mbps: z
      .number({ invalid_type_error: "Enter speed in Mbps" })
      .int()
      .positive("Must be > 0"),
    data_policy: z.enum(["UNLIMITED", "FUP"]),
    fup_limit_gb: z.number().int().positive("Must be > 0").optional(),
  })
  .superRefine((d, ctx) => {
    if (d.data_policy === "FUP" && !d.fup_limit_gb)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FUP limit is required",
        path: ["fup_limit_gb"],
      });
  });

type EditPlanValues = z.infer<typeof editPlanSchema>;

// ── Pricing schema ────────────────────────────────────────────────────────────

const pricingSchema = z.object({
  billing_cycle: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"]),
  base_price: z.number({ invalid_type_error: "Enter a valid price" }).min(0),
  gst_percentage: z.number({ invalid_type_error: "Enter a valid %" }).min(0),
  is_active: z.boolean(),
});

type PricingValues = z.infer<typeof pricingSchema>;

// ── Small helpers ─────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-5 gap-3 py-2.5 border-b border-border/40 last:border-0">
      <dt className="col-span-2 text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-3 text-sm font-medium">{value ?? "—"}</dd>
    </div>
  );
}

function PricingFormFields({
  register,
  watch,
  errors,
  isEdit,
}: {
  register: any;
  watch: any;
  errors: any;
  isEdit?: boolean;
}) {
  const base = watch("base_price") ?? 0;
  const gst = watch("gst_percentage") ?? 0;
  const total = Number(base) + Number(base) * Number(gst) / 100;

  return (
    <div className="space-y-4">
      {!isEdit && (
        <Field label="Billing Cycle" error={errors.billing_cycle?.message} required>
          <select {...register("billing_cycle")} className={SELECT_CLS}>
            {ALL_CYCLES.map((c) => (
              <option key={c} value={c}>{BILLING_CYCLE_LABELS[c]}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Base Price (₹)" error={errors.base_price?.message} required>
          <div className="relative">
            <IndianRupee className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number" min="0" step="0.01" placeholder="799.00"
              className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register("base_price", { valueAsNumber: true })}
            />
          </div>
        </Field>
        <Field label="GST %" error={errors.gst_percentage?.message} required>
          <div className="relative">
            <input
              type="number" min="0" step="0.01" placeholder="18.00"
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register("gst_percentage", { valueAsNumber: true })}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5">
        <span className="text-sm text-muted-foreground">Computed Total</span>
        <span className="text-base font-bold text-primary">{fmt(total)}</span>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-3 select-none">
        <div className="relative h-5 w-9 shrink-0">
          <input type="checkbox" {...register("is_active")} className="peer sr-only" />
          <div className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary" />
          <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </div>
        <span className="text-sm font-medium">Active pricing option</span>
      </label>
    </div>
  );
}

// ── Pricing table row ─────────────────────────────────────────────────────────

function PricingTableRow({
  row, planId, onEdit, onDelete,
}: {
  row: PlanPricing;
  planId: string;
  onEdit: (row: PlanPricing) => void;
  onDelete: (row: PlanPricing) => void;
}) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
      <td className="py-3 pl-4 pr-3">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {BILLING_CYCLE_LABELS[row.billing_cycle]}
        </span>
      </td>
      <td className="px-3 py-3 text-sm font-medium">{fmt(row.base_price)}</td>
      <td className="px-3 py-3 text-sm">{Number(row.gst_percentage).toFixed(1)}%</td>
      <td className="px-3 py-3 text-sm font-bold text-primary">{fmt(row.total_price)}</td>
      <td className="px-3 py-3">
        {row.is_active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
            <CheckCircle2 className="h-3 w-3" />Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            <XCircle className="h-3 w-3" />Inactive
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onEdit(row)} className="h-7 px-2.5 text-xs">
            <Edit className="h-3 w-3" />Edit
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => onDelete(row)}
            className="h-7 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [addPricingOpen, setAddPricingOpen] = useState(false);
  const [editPricingRow, setEditPricingRow] = useState<PlanPricing | null>(null);
  const [deletePricingRow, setDeletePricingRow] = useState<PlanPricing | null>(null);

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: ["plans", id],
    queryFn: () => plansService.get(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["plans", id] });
    qc.invalidateQueries({ queryKey: ["plans"] });
  };

  // ── Edit plan form ──────────────────────────────────────────────────────────
  const editPlanForm = useForm<EditPlanValues>({
    resolver: zodResolver(editPlanSchema),
    mode: "onTouched",
  });

  const openEditPlan = () => {
    if (!plan) return;
    editPlanForm.reset({
      name: plan.name,
      description: plan.description ?? "",
      speed_mbps: plan.speed_mbps,
      data_policy: plan.data_policy,
      fup_limit_gb: plan.fup_limit_gb ?? undefined,
    });
    setEditPlanOpen(true);
  };

  const updatePlanMutation = useMutation({
    mutationFn: (v: EditPlanValues) =>
      plansService.update(id!, {
        name: v.name,
        description: v.description || undefined,
        speed_mbps: v.speed_mbps,
        data_policy: v.data_policy,
        fup_limit_gb: v.data_policy === "FUP" ? v.fup_limit_gb : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setEditPlanOpen(false);
      showToast("Plan updated", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) => plansService.setStatus(id!, active),
    onSuccess: () => { invalidate(); showToast("Status updated", "success"); },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── Add pricing form ────────────────────────────────────────────────────────
  const usedCycles = plan?.pricing.map((p) => p.billing_cycle) ?? [];
  const availableCycles = ALL_CYCLES.filter((c) => !usedCycles.includes(c));

  const addPricingForm = useForm<PricingValues>({
    resolver: zodResolver(pricingSchema),
    defaultValues: { billing_cycle: "MONTHLY", base_price: 0, gst_percentage: 18, is_active: true },
    mode: "onTouched",
  });

  const openAddPricing = () => {
    addPricingForm.reset({
      billing_cycle: availableCycles[0] ?? "MONTHLY",
      base_price: 0,
      gst_percentage: 18,
      is_active: true,
    });
    setAddPricingOpen(true);
  };

  const addPricingMutation = useMutation({
    mutationFn: (v: PricingValues) => plansService.addPricing(id!, v),
    onSuccess: () => {
      invalidate();
      setAddPricingOpen(false);
      showToast("Pricing added", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err, "Failed to add pricing"), "error"),
  });

  // ── Edit pricing form ───────────────────────────────────────────────────────
  const editPricingForm = useForm<PricingValues>({
    resolver: zodResolver(pricingSchema),
    mode: "onTouched",
  });

  const openEditPricing = (row: PlanPricing) => {
    editPricingForm.reset({
      billing_cycle: row.billing_cycle,
      base_price: Number(row.base_price),
      gst_percentage: Number(row.gst_percentage),
      is_active: row.is_active,
    });
    setEditPricingRow(row);
  };

  const updatePricingMutation = useMutation({
    mutationFn: (v: PricingValues) =>
      plansService.updatePricing(id!, editPricingRow!.id, {
        base_price: v.base_price,
        gst_percentage: v.gst_percentage,
        is_active: v.is_active,
      }),
    onSuccess: () => {
      invalidate();
      setEditPricingRow(null);
      showToast("Pricing updated", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const deletePricingMutation = useMutation({
    mutationFn: () => plansService.deletePricing(id!, deletePricingRow!.id),
    onSuccess: () => {
      invalidate();
      setDeletePricingRow(null);
      showToast("Pricing removed", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppLayout title="Plan" portalLabel="Administration">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!plan) {
    return (
      <AppLayout title="Plan" portalLabel="Administration">
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <p className="text-muted-foreground">Plan not found.</p>
          <Button variant="outline" onClick={() => navigate("/admin/plans")}>
            Back to Plans
          </Button>
        </div>
      </AppLayout>
    );
  }

  const editDataPolicy = editPlanForm.watch("data_policy") ?? plan.data_policy;

  return (
    <AppLayout title={plan.name} portalLabel="Administration">
      <div className="space-y-5 max-w-5xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/plans")} className="mt-0.5 shrink-0">
              <ArrowLeft className="h-4 w-4" />Back
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border
                    ${plan.is_active
                      ? "bg-green-100 text-green-800 border-green-200"
                      : "bg-muted text-muted-foreground border-border"}`}
                >
                  {plan.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="font-mono text-sm text-muted-foreground mt-0.5">{plan.plan_code}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openEditPlan}>
              <Edit className="h-4 w-4" />Edit Plan
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => statusMutation.mutate(!plan.is_active)}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Power className="h-4 w-4" />}
              {plan.is_active ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>

        {/* Plan info grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                  <Zap className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plan Details</span>
              </div>
              <dl>
                <InfoRow label="Plan Code" value={<span className="font-mono">{plan.plan_code}</span>} />
                <InfoRow label="Speed" value={
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-yellow-500" />
                    {plan.speed_mbps >= 1000 ? `${plan.speed_mbps / 1000} Gbps` : `${plan.speed_mbps} Mbps`}
                  </span>
                } />
                <InfoRow label="Data Policy" value={
                  plan.data_policy === "UNLIMITED" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                      <Infinity className="h-3 w-3" />Unlimited
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
                      <AlertCircle className="h-3 w-3" />FUP — {plan.fup_limit_gb} GB
                    </span>
                  )
                } />
                {plan.description && <InfoRow label="Description" value={plan.description} />}
                <InfoRow label="Created" value={new Date(plan.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                  <IndianRupee className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pricing Summary</span>
              </div>
              {plan.pricing.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground italic">No pricing configured yet.</p>
              ) : (
                <dl>
                  {plan.pricing.map((p) => (
                    <InfoRow
                      key={p.id}
                      label={BILLING_CYCLE_LABELS[p.billing_cycle]}
                      value={
                        <span className={p.is_active ? "font-semibold text-primary" : "text-muted-foreground line-through"}>
                          {fmt(p.total_price)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (incl. {Number(p.gst_percentage).toFixed(0)}% GST)
                          </span>
                        </span>
                      }
                    />
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pricing matrix */}
        <Card>
          <CardContent className="pt-5 pb-0">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <IndianRupee className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-sm font-semibold">Pricing Matrix</span>
              </div>
              {availableCycles.length > 0 && (
                <Button variant="outline" size="sm" onClick={openAddPricing} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />Add Cycle
                </Button>
              )}
            </div>
            {plan.pricing.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 py-10 text-center mb-5">
                <IndianRupee className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No pricing rows yet</p>
                <Button variant="outline" size="sm" onClick={openAddPricing} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />Add First Pricing
                </Button>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="pb-2.5 pl-4 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cycle</th>
                    <th className="px-3 pb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base Price</th>
                    <th className="px-3 pb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">GST</th>
                    <th className="px-3 pb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Price</th>
                    <th className="px-3 pb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="pb-2.5 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.pricing.map((row) => (
                    <PricingTableRow
                      key={row.id} row={row} planId={plan.id}
                      onEdit={openEditPricing} onDelete={setDeletePricingRow}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Subscriptions placeholder */}
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Subscriptions</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Subscription management will appear here in a future phase.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Edit plan modal ─────────────────────────────────────────── */}
      <Dialog open={editPlanOpen} onClose={() => setEditPlanOpen(false)} title="Edit Plan">
        <form
          onSubmit={editPlanForm.handleSubmit((v) => updatePlanMutation.mutate(v))}
          className="space-y-4"
        >
          <Field label="Plan Name" error={editPlanForm.formState.errors.name?.message} required>
            <Input {...editPlanForm.register("name")} />
          </Field>
          <Field label="Description">
            <textarea rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              {...editPlanForm.register("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Speed (Mbps)" error={editPlanForm.formState.errors.speed_mbps?.message} required>
              <Input type="number" min="1" {...editPlanForm.register("speed_mbps", { valueAsNumber: true })} />
            </Field>
            <Field label="Data Policy" error={editPlanForm.formState.errors.data_policy?.message} required>
              <select {...editPlanForm.register("data_policy")} className={SELECT_CLS}>
                <option value="UNLIMITED">Unlimited</option>
                <option value="FUP">FUP</option>
              </select>
            </Field>
          </div>
          {editDataPolicy === "FUP" && (
            <Field label="FUP Limit (GB)" error={editPlanForm.formState.errors.fup_limit_gb?.message} required>
              <Input type="number" min="1" {...editPlanForm.register("fup_limit_gb", { valueAsNumber: true })} />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditPlanOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={updatePlanMutation.isPending}>
              {updatePlanMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── Add pricing modal ───────────────────────────────────────── */}
      <Dialog open={addPricingOpen} onClose={() => setAddPricingOpen(false)} title="Add Pricing Tier">
        <form
          onSubmit={addPricingForm.handleSubmit((v) => addPricingMutation.mutate(v))}
          className="space-y-4"
        >
          <Field label="Billing Cycle" error={addPricingForm.formState.errors.billing_cycle?.message} required>
            <select {...addPricingForm.register("billing_cycle")} className={SELECT_CLS}>
              {availableCycles.map((c) => (
                <option key={c} value={c}>{BILLING_CYCLE_LABELS[c]}</option>
              ))}
            </select>
          </Field>
          <PricingFormFields
            register={addPricingForm.register}
            watch={addPricingForm.watch}
            errors={addPricingForm.formState.errors}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddPricingOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={addPricingMutation.isPending}>
              {addPricingMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Add Pricing
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── Edit pricing modal ──────────────────────────────────────── */}
      <Dialog
        open={editPricingRow !== null}
        onClose={() => setEditPricingRow(null)}
        title={`Edit ${editPricingRow ? BILLING_CYCLE_LABELS[editPricingRow.billing_cycle] : ""} Pricing`}
      >
        <form
          onSubmit={editPricingForm.handleSubmit((v) => updatePricingMutation.mutate(v))}
          className="space-y-4"
        >
          <PricingFormFields
            register={editPricingForm.register}
            watch={editPricingForm.watch}
            errors={editPricingForm.formState.errors}
            isEdit
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditPricingRow(null)}>Cancel</Button>
            <Button type="submit" disabled={updatePricingMutation.isPending}>
              {updatePricingMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── Delete pricing dialog ───────────────────────────────────── */}
      <Dialog
        open={deletePricingRow !== null}
        onClose={() => setDeletePricingRow(null)}
        title="Remove Pricing Tier"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Remove the{" "}
            <strong>
              {deletePricingRow ? BILLING_CYCLE_LABELS[deletePricingRow.billing_cycle] : ""}
            </strong>{" "}
            pricing tier ({deletePricingRow ? fmt(deletePricingRow.total_price) : ""})? This can be re-added later.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletePricingRow(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletePricingMutation.mutate()}
              disabled={deletePricingMutation.isPending}
            >
              {deletePricingMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </div>
        </div>
      </Dialog>
    </AppLayout>
  );
}
