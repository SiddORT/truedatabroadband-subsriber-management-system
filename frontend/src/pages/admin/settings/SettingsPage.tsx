import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  CreditCard,
  Image,
  Loader2,
  MapPin,
  MessageSquare,
  Receipt,
  Save,
  Upload,
  X,
} from "lucide-react";

import { Link } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { settingsService } from "@/services/settings";
import { getApiErrorMessage } from "@/services/api";
import type { CompanySettingsUpdate } from "@/types/settings";

// ── Tab definition ────────────────────────────────────────────────────────────

type TabKey = "company" | "address" | "bank" | "invoice" | "branding";

const TABS: { key: TabKey; label: string; icon: typeof Building2 }[] = [
  { key: "company", label: "Company Information", icon: Building2 },
  { key: "address", label: "Address", icon: MapPin },
  { key: "bank", label: "Bank & Payments", icon: CreditCard },
  { key: "invoice", label: "Invoice Settings", icon: Receipt },
  { key: "branding", label: "Branding", icon: Image },
];

// ── Small reusable pieces ─────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5${className ? ` ${className}` : ""}`}>
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function inputCls(err?: string) {
  return `w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
    err ? "border-destructive" : "border-input"
  }`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("company");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // ── Load settings ──────────────────────────────────────────────────────────
  const { data: settings, isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => settingsService.get(),
  });

  // ── Local form state ───────────────────────────────────────────────────────
  const [form, setForm] = useState<CompanySettingsUpdate>({});

  useEffect(() => {
    if (!settings) return;
    setForm({
      company_name: settings.company_name ?? "",
      legal_name: settings.legal_name ?? "",
      gst_number: settings.gst_number ?? "",
      pan_number: settings.pan_number ?? "",
      support_email: settings.support_email ?? "",
      support_phone: settings.support_phone ?? "",
      address_line_1: settings.address_line_1 ?? "",
      address_line_2: settings.address_line_2 ?? "",
      landmark: settings.landmark ?? "",
      city: settings.city ?? "",
      state: settings.state ?? "",
      pincode: settings.pincode ?? "",
      country: settings.country ?? "India",
      bank_name: settings.bank_name ?? "",
      account_name: settings.account_name ?? "",
      account_number: settings.account_number ?? "",
      ifsc_code: settings.ifsc_code ?? "",
      upi_id: settings.upi_id ?? "",
      gpay_number: settings.gpay_number ?? "",
      invoice_prefix: settings.invoice_prefix ?? "TDB-INV",
      invoice_due_days: settings.invoice_due_days ?? 7,
      default_gst_percentage: settings.default_gst_percentage ?? "18.00",
      invoice_footer_text: settings.invoice_footer_text ?? "",
      terms_and_conditions: settings.terms_and_conditions ?? "",
    });
  }, [settings]);

  function set(key: keyof CompanySettingsUpdate, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[key];
      return copy;
    });
  }

  // ── Save settings ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => settingsService.update(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      showToast("Settings saved successfully", "success");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setErrors({});
    },
    onError: (err) => {
      const msg = getApiErrorMessage(err);
      showToast(msg, "error");
      // Parse field errors from 422 response
      const anyErr = err as any;
      if (anyErr?.response?.data?.detail) {
        const detail = anyErr.response.data.detail;
        if (Array.isArray(detail)) {
          const fieldErrors: Record<string, string> = {};
          detail.forEach((d: any) => {
            const field = d.loc?.[d.loc.length - 1];
            if (field) fieldErrors[field] = d.msg;
          });
          setErrors(fieldErrors);
        }
      }
    },
  });

  // ── Logo upload ────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoCacheBust, setLogoCacheBust] = useState(Date.now());

  const logoMutation = useMutation({
    mutationFn: (file: File) => settingsService.uploadLogo(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      setLogoCacheBust(Date.now());
      showToast("Logo uploaded successfully", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    logoMutation.mutate(file);
  }

  const isBusy = saveMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppLayout title="Settings" portalLabel="Administration">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Settings" portalLabel="Administration">
      <div className="space-y-5">
        {/* ── Communication Settings Quick Link ─────────────────────────── */}
        <Link
          to="/admin/settings/communication"
          className="flex items-center gap-3 rounded-xl border border-[#1F4959]/20 bg-[#1F4959]/5 px-4 py-3 text-sm text-[#1F4959] hover:bg-[#1F4959]/10 transition-colors"
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="font-medium">Communication Settings</span>
          <span className="ml-auto text-xs text-[#5C7C89]">SMS &amp; Email provider configuration →</span>
        </Link>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Company Settings
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage company profile, address, and invoice preferences.
            </p>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={isBusy || activeTab === "branding"}
          >
            {isBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/30 p-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────── */}

        {/* Tab 1 — Company Information */}
        {activeTab === "company" && (
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field
                  label="Company Name"
                  required
                  error={errors.company_name}
                >
                  <input
                    type="text"
                    value={(form.company_name as string) ?? ""}
                    onChange={(e) => set("company_name", e.target.value)}
                    placeholder="True Data Broadband Pvt. Ltd."
                    className={inputCls(errors.company_name)}
                  />
                </Field>

                <Field label="Legal Name" error={errors.legal_name}>
                  <input
                    type="text"
                    value={(form.legal_name as string) ?? ""}
                    onChange={(e) => set("legal_name", e.target.value)}
                    placeholder="True Data Broadband Services Pvt. Ltd."
                    className={inputCls(errors.legal_name)}
                  />
                </Field>

                <Field
                  label="GST Number"
                  error={errors.gst_number}
                  hint="Format: 27AAAPL1234C1ZV"
                >
                  <input
                    type="text"
                    value={(form.gst_number as string) ?? ""}
                    onChange={(e) =>
                      set("gst_number", e.target.value.toUpperCase())
                    }
                    placeholder="27AAAPL1234C1ZV"
                    maxLength={15}
                    className={inputCls(errors.gst_number)}
                  />
                </Field>

                <Field
                  label="PAN Number"
                  error={errors.pan_number}
                  hint="Format: AAAPL1234C"
                >
                  <input
                    type="text"
                    value={(form.pan_number as string) ?? ""}
                    onChange={(e) =>
                      set("pan_number", e.target.value.toUpperCase())
                    }
                    placeholder="AAAPL1234C"
                    maxLength={10}
                    className={inputCls(errors.pan_number)}
                  />
                </Field>

                <Field label="Support Email" error={errors.support_email}>
                  <input
                    type="email"
                    value={(form.support_email as string) ?? ""}
                    onChange={(e) => set("support_email", e.target.value)}
                    placeholder="support@truedata.in"
                    className={inputCls(errors.support_email)}
                  />
                </Field>

                <Field
                  label="Support Phone"
                  error={errors.support_phone}
                  hint="10-digit Indian mobile number"
                >
                  <input
                    type="tel"
                    value={(form.support_phone as string) ?? ""}
                    onChange={(e) => set("support_phone", e.target.value)}
                    placeholder="9876543210"
                    maxLength={10}
                    className={inputCls(errors.support_phone)}
                  />
                </Field>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => saveMutation.mutate()} disabled={isBusy}>
                  {isBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 2 — Address */}
        {activeTab === "address" && (
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field
                  label="Address Line 1"
                  error={errors.address_line_1}
                  className="sm:col-span-2"
                >
                  <input
                    type="text"
                    value={(form.address_line_1 as string) ?? ""}
                    onChange={(e) => set("address_line_1", e.target.value)}
                    placeholder="Building / Street"
                    className={inputCls(errors.address_line_1)}
                  />
                </Field>

                <Field label="Address Line 2" error={errors.address_line_2}>
                  <input
                    type="text"
                    value={(form.address_line_2 as string) ?? ""}
                    onChange={(e) => set("address_line_2", e.target.value)}
                    placeholder="Area / Locality"
                    className={inputCls(errors.address_line_2)}
                  />
                </Field>

                <Field label="Landmark" error={errors.landmark}>
                  <input
                    type="text"
                    value={(form.landmark as string) ?? ""}
                    onChange={(e) => set("landmark", e.target.value)}
                    placeholder="Near ..."
                    className={inputCls(errors.landmark)}
                  />
                </Field>

                <Field label="City" error={errors.city}>
                  <input
                    type="text"
                    value={(form.city as string) ?? ""}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Mumbai"
                    className={inputCls(errors.city)}
                  />
                </Field>

                <Field label="State" error={errors.state}>
                  <input
                    type="text"
                    value={(form.state as string) ?? ""}
                    onChange={(e) => set("state", e.target.value)}
                    placeholder="Maharashtra"
                    className={inputCls(errors.state)}
                  />
                </Field>

                <Field label="Pincode" error={errors.pincode}>
                  <input
                    type="text"
                    value={(form.pincode as string) ?? ""}
                    onChange={(e) => set("pincode", e.target.value)}
                    placeholder="400001"
                    maxLength={6}
                    className={inputCls(errors.pincode)}
                  />
                </Field>

                <Field label="Country" error={errors.country}>
                  <input
                    type="text"
                    value={(form.country as string) ?? "India"}
                    onChange={(e) => set("country", e.target.value)}
                    placeholder="India"
                    className={inputCls(errors.country)}
                  />
                </Field>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => saveMutation.mutate()} disabled={isBusy}>
                  {isBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 3 — Bank & Payments */}
        {activeTab === "bank" && (
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div>
                <p className="text-sm font-medium text-foreground">Bank Account Details</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These details will be printed on every invoice under "Payment Details".
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Bank Name" error={errors.bank_name}>
                  <input
                    type="text"
                    value={(form.bank_name as string) ?? ""}
                    onChange={(e) => set("bank_name", e.target.value)}
                    placeholder="State Bank of India"
                    maxLength={100}
                    className={inputCls(errors.bank_name)}
                  />
                </Field>

                <Field label="Account Holder Name" error={errors.account_name}>
                  <input
                    type="text"
                    value={(form.account_name as string) ?? ""}
                    onChange={(e) => set("account_name", e.target.value)}
                    placeholder="True Data Broadband Pvt. Ltd."
                    maxLength={100}
                    className={inputCls(errors.account_name)}
                  />
                </Field>

                <Field label="Account Number" error={errors.account_number}>
                  <input
                    type="text"
                    value={(form.account_number as string) ?? ""}
                    onChange={(e) => set("account_number", e.target.value)}
                    placeholder="00000011223344"
                    maxLength={50}
                    className={inputCls(errors.account_number)}
                  />
                </Field>

                <Field
                  label="IFSC Code"
                  error={errors.ifsc_code}
                  hint="11-character bank branch code"
                >
                  <input
                    type="text"
                    value={(form.ifsc_code as string) ?? ""}
                    onChange={(e) =>
                      set("ifsc_code", e.target.value.toUpperCase())
                    }
                    placeholder="SBIN0001234"
                    maxLength={20}
                    className={inputCls(errors.ifsc_code)}
                  />
                </Field>
              </div>

              <div className="border-t border-border pt-5">
                <p className="mb-4 text-sm font-medium text-foreground">UPI &amp; GPay</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field
                    label="UPI ID"
                    error={errors.upi_id}
                    hint="e.g. truedatabroadband@okaxis"
                  >
                    <input
                      type="text"
                      value={(form.upi_id as string) ?? ""}
                      onChange={(e) => set("upi_id", e.target.value)}
                      placeholder="truedatabroadband@okaxis"
                      maxLength={100}
                      className={inputCls(errors.upi_id)}
                    />
                  </Field>

                  <Field
                    label="GPay Number"
                    error={errors.gpay_number}
                    hint="Mobile number linked to Google Pay"
                  >
                    <input
                      type="tel"
                      value={(form.gpay_number as string) ?? ""}
                      onChange={(e) => set("gpay_number", e.target.value)}
                      placeholder="9876543210"
                      maxLength={50}
                      className={inputCls(errors.gpay_number)}
                    />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => saveMutation.mutate()} disabled={isBusy}>
                  {isBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 4 — Invoice Settings */}
        {activeTab === "invoice" && (
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Field
                  label="Invoice Prefix"
                  required
                  error={errors.invoice_prefix}
                  hint="Prefix for invoice numbers (e.g. TDB-INV)"
                >
                  <input
                    type="text"
                    value={(form.invoice_prefix as string) ?? "TDB-INV"}
                    onChange={(e) => set("invoice_prefix", e.target.value)}
                    placeholder="TDB-INV"
                    maxLength={20}
                    className={inputCls(errors.invoice_prefix)}
                  />
                </Field>

                <Field
                  label="Invoice Due Days"
                  error={errors.invoice_due_days}
                  hint="Days after invoice date to mark as due"
                >
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={(form.invoice_due_days as number) ?? 7}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      set("invoice_due_days", isNaN(v) ? 0 : v);
                    }}
                    className={inputCls(errors.invoice_due_days)}
                  />
                </Field>

                <Field
                  label="Default GST %"
                  error={errors.default_gst_percentage}
                  hint="Applied when no plan-specific GST is set"
                >
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={(form.default_gst_percentage as string) ?? "18.00"}
                    onChange={(e) =>
                      set("default_gst_percentage", e.target.value)
                    }
                    className={inputCls(errors.default_gst_percentage)}
                  />
                </Field>
              </div>

              <Field
                label="Invoice Footer Text"
                error={errors.invoice_footer_text}
                hint="Appears at the bottom of every invoice PDF"
              >
                <textarea
                  value={(form.invoice_footer_text as string) ?? ""}
                  onChange={(e) => set("invoice_footer_text", e.target.value)}
                  rows={3}
                  placeholder="Thank you for choosing True Data Broadband Services Pvt. Ltd."
                  className={`${inputCls(errors.invoice_footer_text)} resize-none`}
                />
              </Field>

              <Field
                label="Terms and Conditions"
                error={errors.terms_and_conditions}
                hint="Printed on invoices and customer agreements"
              >
                <textarea
                  value={(form.terms_and_conditions as string) ?? ""}
                  onChange={(e) => set("terms_and_conditions", e.target.value)}
                  rows={8}
                  placeholder={
                    "- Payments are due within the specified due date.\n" +
                    "- Services may be suspended for unpaid invoices.\n" +
                    "- Taxes are applied as per government regulations."
                  }
                  className={`${inputCls(errors.terms_and_conditions)} resize-y font-mono text-xs`}
                />
              </Field>

              <div className="flex justify-end pt-2">
                <Button onClick={() => saveMutation.mutate()} disabled={isBusy}>
                  {isBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 4 — Branding */}
        {activeTab === "branding" && (
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">
                  Company Logo
                </p>
                <p className="mb-5 text-xs text-muted-foreground">
                  Displayed on invoices and the client portal. PNG or JPG
                  recommended. Max 5 MB.
                </p>

                {/* Preview area */}
                <div className="mb-5 flex flex-col items-start gap-5 sm:flex-row">
                  <div className="flex h-36 w-56 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 p-4">
                    {logoPreview ||
                    (settings?.logo_url) ? (
                      <img
                        src={
                          logoPreview ||
                          `${settings!.logo_url}?v=${logoCacheBust}`
                        }
                        alt="Company logo"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-center">
                        <Image className="h-10 w-10 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">
                          No logo uploaded
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-foreground">
                      Upload a new logo
                    </p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li>• Formats: PNG, JPG, GIF, WEBP</li>
                      <li>• Maximum size: 5 MB</li>
                      <li>• Recommended: 400 × 200 px, transparent background</li>
                    </ul>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={logoMutation.isPending}
                      className="w-fit"
                    >
                      {logoMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {logoMutation.isPending
                        ? "Uploading…"
                        : "Choose File"}
                    </Button>

                    {logoMutation.isSuccess && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                        <Check className="h-3.5 w-3.5" />
                        Logo uploaded successfully
                      </p>
                    )}
                    {logoMutation.isError && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                        <X className="h-3.5 w-3.5" />
                        {getApiErrorMessage(logoMutation.error)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Current path */}
                {settings?.logo_path && (
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      Stored at:{" "}
                      <span className="font-mono text-foreground">
                        storage/company/{settings.logo_path}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
