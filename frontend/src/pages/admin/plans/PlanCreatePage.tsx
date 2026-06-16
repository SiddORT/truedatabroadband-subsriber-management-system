import { useNavigate } from "react-router-dom";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft, Plus, Trash2, Loader2, Zap, Infinity, AlertCircle, IndianRupee,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { plansService } from "@/services/plans";
import { getApiErrorMessage } from "@/services/api";
import type { BillingCycle } from "@/types/plan";
import { BILLING_CYCLE_LABELS } from "@/types/plan";
import { Field } from "@/components/customers/CustomerFormParts";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_CYCLES: BillingCycle[] = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"];

const SELECT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ── Schema ────────────────────────────────────────────────────────────────────

const pricingRowSchema = z.object({
  billing_cycle: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"]),
  base_price: z
    .number({ invalid_type_error: "Enter a valid price" })
    .min(0, "Must be ≥ 0"),
  gst_percentage: z
    .number({ invalid_type_error: "Enter a valid %" })
    .min(0, "Must be ≥ 0"),
  is_active: z.boolean(),
});

const schema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().optional(),
    speed_mbps: z
      .number({ invalid_type_error: "Enter speed in Mbps" })
      .int()
      .positive("Must be greater than 0"),
    data_policy: z.enum(["UNLIMITED", "FUP"]),
    fup_limit_gb: z.number().int().positive("Must be > 0").optional(),
    is_active: z.boolean(),
    pricing: z.array(pricingRowSchema),
  })
  .superRefine((d, ctx) => {
    if (d.data_policy === "FUP" && !d.fup_limit_gb) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FUP data limit is required",
        path: ["fup_limit_gb"],
      });
    }
    const cycles = d.pricing.map((p) => p.billing_cycle);
    const seen = new Set<string>();
    cycles.forEach((c, i) => {
      if (seen.has(c)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate billing cycle",
          path: ["pricing", i, "billing_cycle"],
        });
      }
      seen.add(c);
    });
  });

type FormValues = z.infer<typeof schema>;

// ── Pricing row component ─────────────────────────────────────────────────────

function PricingRow({
  index,
  remove,
  register,
  control,
  errors,
  usedCycles,
}: {
  index: number;
  remove: (i: number) => void;
  register: any;
  control: any;
  errors: any;
  usedCycles: BillingCycle[];
}) {
  const basePrice = useWatch({ control, name: `pricing.${index}.base_price` }) ?? 0;
  const gstPct = useWatch({ control, name: `pricing.${index}.gst_percentage` }) ?? 0;
  const total = (Number(basePrice) || 0) + (Number(basePrice) || 0) * (Number(gstPct) || 0) / 100;
  const currentCycle = useWatch({ control, name: `pricing.${index}.billing_cycle` });

  const availableCycles = ALL_CYCLES.filter(
    (c) => c === currentCycle || !usedCycles.includes(c) || usedCycles.filter((x) => x === c).length <= 1,
  );

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-start gap-3 rounded-xl border border-border/50 bg-muted/10 p-4">
      {/* Billing cycle */}
      <Field
        label="Billing Cycle"
        error={errors?.pricing?.[index]?.billing_cycle?.message}
        required
      >
        <select {...register(`pricing.${index}.billing_cycle`)} className={SELECT_CLS}>
          {ALL_CYCLES.map((c) => (
            <option key={c} value={c}>
              {BILLING_CYCLE_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>

      {/* Base price */}
      <Field
        label="Base Price (₹)"
        error={errors?.pricing?.[index]?.base_price?.message}
        required
      >
        <div className="relative">
          <IndianRupee className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="799.00"
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            {...register(`pricing.${index}.base_price`, { valueAsNumber: true })}
          />
        </div>
      </Field>

      {/* GST */}
      <Field
        label="GST %"
        error={errors?.pricing?.[index]?.gst_percentage?.message}
        required
      >
        <div className="relative">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="18.00"
            className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            {...register(`pricing.${index}.gst_percentage`, { valueAsNumber: true })}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            %
          </span>
        </div>
      </Field>

      {/* Computed total */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">Total Price</p>
        <div className="flex h-9 items-center rounded-md border border-border/50 bg-muted/30 px-3 text-sm font-semibold text-primary">
          ₹{" "}
          {total.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>

      {/* Remove */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium opacity-0 select-none">·</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => remove(index)}
          className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function PlanCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      data_policy: "UNLIMITED",
      is_active: true,
      pricing: [],
    },
    mode: "onTouched",
  });

  const { fields, append, remove } = useFieldArray({ control, name: "pricing" });
  const dataPolicy = watch("data_policy");
  const pricingValues = watch("pricing");
  const usedCycles = pricingValues?.map((p) => p.billing_cycle as BillingCycle) ?? [];
  const unusedCycles = ALL_CYCLES.filter((c) => !usedCycles.includes(c));

  const onSubmit = async (values: FormValues) => {
    try {
      const plan = await plansService.create({
        name: values.name,
        description: values.description || undefined,
        speed_mbps: values.speed_mbps,
        data_policy: values.data_policy,
        fup_limit_gb: values.data_policy === "FUP" ? values.fup_limit_gb : undefined,
        is_active: values.is_active,
        pricing: values.pricing.map((p) => ({
          billing_cycle: p.billing_cycle,
          base_price: p.base_price,
          gst_percentage: p.gst_percentage,
          is_active: p.is_active,
        })),
      });
      showToast("Plan created successfully", "success");
      navigate(`/admin/plans/${plan.id}`);
    } catch (err) {
      showToast(getApiErrorMessage(err, "Failed to create plan"), "error");
    }
  };

  const addNextCycle = () => {
    const next = unusedCycles[0];
    if (!next) return;
    append({ billing_cycle: next, base_price: 0, gst_percentage: 18, is_active: true });
  };

  return (
    <AppLayout title="New Plan" portalLabel="Administration">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/plans")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">New Broadband Plan</h2>
            <p className="text-sm text-muted-foreground">
              Define plan details and configure pricing by billing cycle.
            </p>
          </div>
        </div>

        {/* Plan information */}
        <Card>
          <CardContent className="pt-5 pb-6">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold">Plan Information</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Plan Name" error={errors.name?.message} required className="lg:col-span-2">
                <Input placeholder="e.g. Fiber 100 Mbps" {...register("name")} />
              </Field>

              <Field label="Speed (Mbps)" error={errors.speed_mbps?.message} required>
                <div className="relative">
                  <Zap className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-yellow-500" />
                  <input
                    type="number"
                    min="1"
                    placeholder="100"
                    className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    {...register("speed_mbps", { valueAsNumber: true })}
                  />
                </div>
              </Field>

              <Field label="Description" className="sm:col-span-2 lg:col-span-3">
                <textarea
                  rows={2}
                  placeholder="Brief description of this plan (optional)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  {...register("description")}
                />
              </Field>

              {/* Data policy */}
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="mb-2 text-sm font-medium">
                  Data Policy<span className="ml-0.5 text-destructive">*</span>
                </p>
                <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                  {(["UNLIMITED", "FUP"] as const).map((policy) => {
                    const Icon = policy === "UNLIMITED" ? Infinity : AlertCircle;
                    const sel = dataPolicy === policy;
                    return (
                      <label
                        key={policy}
                        className={`relative flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition-all select-none
                          ${sel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        <input
                          type="radio"
                          value={policy}
                          {...register("data_policy")}
                          className="sr-only"
                        />
                        <Icon
                          className={`h-4 w-4 shrink-0 ${sel ? "text-primary" : "text-muted-foreground"}`}
                        />
                        <div>
                          <p
                            className={`text-sm font-semibold ${sel ? "text-primary" : ""}`}
                          >
                            {policy === "UNLIMITED" ? "Unlimited" : "FUP"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {policy === "UNLIMITED"
                              ? "No data cap"
                              : "Fair usage policy"}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {dataPolicy === "FUP" && (
                <Field
                  label="FUP Data Limit (GB)"
                  error={errors.fup_limit_gb?.message}
                  required
                >
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 100"
                    {...register("fup_limit_gb", { valueAsNumber: true })}
                  />
                </Field>
              )}

              {/* Status toggle */}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="inline-flex cursor-pointer items-center gap-3 select-none">
                  <div className="relative h-5 w-9 shrink-0">
                    <input
                      type="checkbox"
                      {...register("is_active")}
                      className="peer sr-only"
                    />
                    <div className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary" />
                    <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-sm font-medium">Active (available for subscription)</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing tiers */}
        <Card>
          <CardContent className="pt-5 pb-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <IndianRupee className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <span className="text-sm font-semibold">Pricing Tiers</span>
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {fields.length} / 4 cycles
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addNextCycle}
                disabled={unusedCycles.length === 0}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />Add Billing Cycle
              </Button>
            </div>

            {fields.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 py-10 text-center">
                <IndianRupee className="h-8 w-8 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No pricing configured</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Click "Add Billing Cycle" to add pricing for Monthly, Quarterly, etc.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addNextCycle}
                  className="mt-1 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />Add First Billing Cycle
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <PricingRow
                    key={field.id}
                    index={index}
                    remove={remove}
                    register={register}
                    control={control}
                    errors={errors}
                    usedCycles={usedCycles}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer actions */}
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Fields marked <span className="text-destructive font-medium">*</span> are required
          </p>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/plans")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Plan
            </Button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}
