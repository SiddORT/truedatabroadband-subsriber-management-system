import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Key, ShieldOff, ShieldCheck, Edit, Loader2,
  CheckCircle2, XCircle, User, MapPin, CreditCard,
  FolderUp, Info, UserCheck, Building2, FileText, ExternalLink,
  RefreshCw,
} from "lucide-react";
import { subscriptionsService } from "@/services/subscriptions";
import {
  SUBSCRIPTION_STATUS_COLORS,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/types/subscription";
import { BILLING_CYCLE_LABELS } from "@/types/plan";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/Dialog";
import { AppLayout } from "@/layouts/AppLayout";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import type { DocType } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import { tokenService } from "@/services/tokenService";
import type { Customer, CustomerStatus } from "@/types/customer";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<CustomerStatus, string> = {
  ACTIVE:       "bg-green-100 text-green-800 border border-green-200",
  SUSPENDED:    "bg-amber-100 text-amber-800 border border-amber-200",
  DISCONNECTED: "bg-red-100 text-red-800 border border-red-200",
};

const KYC_LABELS: Record<string, string> = {
  AADHAAR: "Aadhaar Card", PAN: "PAN Card", PASSPORT: "Passport",
  VOTER_ID: "Voter ID", DRIVING_LICENSE: "Driving License",
};

// ── Tab bar ───────────────────────────────────────────────────────────────────

type TabDef = { key: string; label: string; icon: React.ElementType };

function TabBar({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex overflow-x-auto border-b border-border scrollbar-none">
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors -mb-px
              ${isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        );
      })}
    </div>
  );
}

// ── Info primitives ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-5 gap-3 py-2.5 border-b border-border/40 last:border-0">
      <dt className="col-span-2 text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-3 text-sm font-medium break-words">{value || "—"}</dd>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-3 py-2.5 border-b border-border/40 last:border-0">
      <dt className="col-span-2 text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-3 flex items-center gap-1.5 text-sm font-medium">
        {value ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-400" />}
        {value ? "Yes" : "No"}
      </dd>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-3 w-3 text-primary" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
    </div>
  );
}

function InfoPanel({ icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
      <SectionTitle icon={icon} title={title} />
      <dl>{children}</dl>
    </div>
  );
}

// ── Document card with preview ─────────────────────────────────────────────────

function getDocFileType(path: string | null) {
  const ext = path?.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
  const isPdf   = ext === "pdf";
  const isDoc   = ["doc", "docx"].includes(ext);
  const isExcel = ["xls", "xlsx", "csv"].includes(ext);
  const color = isPdf ? "text-red-500" : isDoc ? "text-blue-500" : isExcel ? "text-green-500" : "text-muted-foreground";
  const badge = isPdf ? "PDF" : isDoc ? "DOC" : isExcel ? "XLS" : ext.toUpperCase() || "FILE";
  const bg    = isPdf ? "bg-red-50" : isDoc ? "bg-blue-50" : isExcel ? "bg-green-50" : "bg-muted/40";
  return { ext, isImage, isPdf, isDoc, isExcel, color, badge, bg };
}

function ImagePreview({ customerId, docType }: { customerId: string; docType: DocType }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = tokenService.getAccess();
    let objectUrl = "";
    fetch(`/api/v1/customers/${customerId}/documents/${docType}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [customerId, docType]);

  if (!url) return <div className="h-28 w-full animate-pulse rounded-lg bg-muted/60" />;
  return <img src={url} alt="preview" className="h-28 w-full rounded-lg object-cover shadow-sm" />;
}

function DocCard({ label, docType, customerId, hasDoc, docPath }: {
  label: string; docType: DocType; customerId: string; hasDoc: boolean; docPath: string | null;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const { isImage, color, badge, bg } = getDocFileType(docPath);

  const handleOpen = async () => {
    setLoading(true);
    try {
      const token = tokenService.getAccess();
      const resp = await fetch(`/api/v1/customers/${customerId}/documents/${docType}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      showToast("Failed to open document", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col gap-3 rounded-xl border-2 p-4 transition-colors
      ${hasDoc ? "border-primary/20 bg-card" : "border-border/40 bg-muted/10"}`}>
      <p className="text-sm font-semibold">{label}</p>
      {hasDoc ? (
        <>
          {isImage ? (
            <ImagePreview customerId={customerId} docType={docType} />
          ) : (
            <div className="flex h-28 items-center justify-center rounded-lg bg-muted/30">
              <div className={`flex flex-col items-center gap-1.5 rounded-xl p-4 ${bg}`}>
                <FileText className={`h-8 w-8 ${color}`} />
                <span className={`text-[10px] font-bold ${color}`}>{badge}</span>
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleOpen} disabled={loading} className="w-full gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            Open in New Tab
          </Button>
        </>
      ) : (
        <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/50">
          <XCircle className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">Not uploaded</p>
        </div>
      )}
    </div>
  );
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function OverviewTab({ customer }: { customer: Customer }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <InfoPanel icon={User} title="Personal Details">
        <InfoRow label="Full Name" value={customer.full_name} />
        <InfoRow label="Customer Code" value={customer.customer_code} />
        <InfoRow label="Customer Type" value={customer.customer_type === "BUSINESS" ? "Business / Company" : "Individual"} />
        {customer.customer_type === "BUSINESS" && (
          <>
            <InfoRow label="Company Name" value={customer.company_name} />
            <InfoRow label="GST Number" value={customer.gst_number} />
          </>
        )}
        <InfoRow label="Member Since" value={new Date(customer.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
      </InfoPanel>

      <InfoPanel icon={Info} title="Contact Details">
        <InfoRow label="Mobile Number" value={customer.mobile_number} />
        <InfoRow label="Alternate Mobile" value={customer.alternate_mobile_number} />
        <InfoRow label="Email Address" value={customer.email} />
        {customer.spokesperson_name && <InfoRow label="Spokesperson" value={customer.spokesperson_name} />}
      </InfoPanel>

      <InfoPanel icon={CheckCircle2} title="Account Status">
        <div className="py-2.5 border-b border-border/40">
          <dt className="text-sm text-muted-foreground mb-1.5">Status</dt>
          <dd>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[customer.status]}`}>
              {customer.status}
            </span>
          </dd>
        </div>
        <BoolRow label="Account Active" value={customer.is_active} />
        <BoolRow label="Must Change Password" value={customer.must_change_password} />
        {customer.connection_date && (
          <InfoRow label="Connection Date" value={new Date(customer.connection_date).toLocaleDateString("en-IN")} />
        )}
        {customer.reference_source && <InfoRow label="Reference" value={customer.reference_source} />}
      </InfoPanel>
    </div>
  );
}

function AddressBlock({ title, address, district, city, state, pincode, landmark, line2 }: {
  title: string; address?: string | null; district?: string | null; city?: string | null;
  state?: string | null; pincode?: string | null; landmark?: string | null; line2?: string | null;
}) {
  return (
    <InfoPanel icon={MapPin} title={title}>
      <InfoRow label="Address Line 1" value={address} />
      {line2 && <InfoRow label="Address Line 2" value={line2} />}
      {landmark && <InfoRow label="Landmark" value={landmark} />}
      <InfoRow label="Pincode" value={pincode} />
      <InfoRow label="District" value={district} />
      <InfoRow label="City" value={city} />
      <InfoRow label="State" value={state} />
    </InfoPanel>
  );
}

function AddressesTab({ customer }: { customer: Customer }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AddressBlock
        title="Installation Address"
        address={customer.installation_address}
        line2={customer.address_line_2}
        landmark={customer.landmark}
        pincode={customer.pincode}
        district={customer.district}
        city={customer.city}
        state={customer.state}
      />
      {customer.billing_same_as_installation ? (
        <InfoPanel icon={MapPin} title="Billing Address">
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            Same as installation address
          </div>
        </InfoPanel>
      ) : (
        <AddressBlock
          title="Billing Address"
          address={customer.billing_address_line_1}
          line2={customer.billing_address_line_2}
          landmark={customer.billing_landmark}
          pincode={customer.billing_pincode}
          district={customer.billing_district}
          city={customer.billing_city}
          state={customer.billing_state}
        />
      )}
    </div>
  );
}

function IdentityDocsTab({ customer }: { customer: Customer }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-muted/10 p-4 sm:col-span-2 lg:col-span-1">
          <SectionTitle icon={CreditCard} title="KYC / Identity" />
          {customer.kyc_type || customer.kyc_number ? (
            <dl>
              <InfoRow label="Document Type" value={customer.kyc_type ? (KYC_LABELS[customer.kyc_type] ?? customer.kyc_type) : null} />
              <InfoRow label="Document Number" value={customer.kyc_number} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground italic">No KYC details provided.</p>
          )}
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <FolderUp className="h-3 w-3 text-primary" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Uploaded Documents</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DocCard label="Profile Photo" docType="profile_photo" customerId={customer.id}
              hasDoc={!!customer.profile_photo_path} docPath={customer.profile_photo_path} />
            <DocCard label="KYC Document" docType="kyc_document" customerId={customer.id}
              hasDoc={!!customer.kyc_document_path} docPath={customer.kyc_document_path} />
            <DocCard label="Agreement" docType="agreement_document" customerId={customer.id}
              hasDoc={!!customer.agreement_document_path} docPath={customer.agreement_document_path} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MoreInfoTab({ customer }: { customer: Customer }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <InfoPanel icon={UserCheck} title="Spokesperson / Alternate Contact">
        {customer.spokesperson_name || customer.spokesperson_mobile || customer.spokesperson_email ? (
          <>
            <InfoRow label="Name" value={customer.spokesperson_name} />
            <InfoRow label="Mobile" value={customer.spokesperson_mobile} />
            <InfoRow label="Email" value={customer.spokesperson_email} />
            <InfoRow label="Designation" value={customer.spokesperson_designation} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">No spokesperson details provided.</p>
        )}
      </InfoPanel>
      <InfoPanel icon={Info} title="Additional Information">
        <InfoRow label="Connection Date" value={customer.connection_date ? new Date(customer.connection_date).toLocaleDateString("en-IN") : null} />
        <InfoRow label="Reference Source" value={customer.reference_source} />
        <InfoRow label="Salesperson" value={customer.sales_person} />
        {customer.notes ? (
          <div className="pt-2.5">
            <dt className="text-sm text-muted-foreground mb-1.5">Notes</dt>
            <dd className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm font-medium whitespace-pre-wrap">{customer.notes}</dd>
          </div>
        ) : (
          <InfoRow label="Notes" value={null} />
        )}
      </InfoPanel>
    </div>
  );
}

function AccountTab({ customerId }: { customerId: string }) {
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["customer-subscriptions", customerId],
    queryFn: () => subscriptionsService.listByCustomer(customerId),
    enabled: !!customerId,
  });

  const active = subs.find((s) => s.status === "ACTIVE");

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-foreground">
          Current Subscription
        </h4>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : active ? (
          <div className="rounded-xl border border-border bg-muted/20 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <RefreshCw className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {active.plan_name_snapshot}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {active.speed_mbps_snapshot} Mbps ·{" "}
                    {BILLING_CYCLE_LABELS[active.billing_cycle_snapshot] ??
                      active.billing_cycle_snapshot}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SUBSCRIPTION_STATUS_COLORS[active.status]}`}
              >
                {SUBSCRIPTION_STATUS_LABELS[active.status]}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Sub. Code</p>
                <p className="font-mono text-xs font-medium">
                  {active.subscription_code}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-semibold text-primary">
                  ₹
                  {Number(active.total_price_snapshot).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Renewal Date</p>
                <p className="font-medium">
                  {new Date(active.renewal_date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expiry Date</p>
                <p className="font-medium">
                  {new Date(active.expiry_date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            {(active.connection_name || active.installation_address) && (
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
                {active.connection_name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Connection Label</p>
                    <p className="text-sm font-medium">{active.connection_name}</p>
                  </div>
                )}
                {active.installation_address && (
                  <div>
                    <p className="text-xs text-muted-foreground">Installation Address</p>
                    <p className="whitespace-pre-line text-sm font-medium">{active.installation_address}</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Link
                to={`/admin/subscriptions/${active.id}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                View details →
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
              <Building2 className="h-5 w-5 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                No Active Subscription
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                Assign a plan via Subscriptions →
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Subscription History */}
      {subs.length > 1 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">
            History
          </h4>
          <div className="divide-y divide-border rounded-xl border border-border">
            {subs
              .filter((s) => s.status !== "ACTIVE")
              .slice(0, 5)
              .map((s) => (
                <Link
                  key={s.id}
                  to={`/admin/subscriptions/${s.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30"
                >
                  <div>
                    <p className="font-mono text-xs font-medium text-foreground">
                      {s.subscription_code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.plan_name_snapshot} ·{" "}
                      {new Date(s.start_date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUBSCRIPTION_STATUS_COLORS[s.status]}`}
                  >
                    {SUBSCRIPTION_STATUS_LABELS[s.status]}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      )}

      {/* Invoice History placeholder */}
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
          <Info className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Invoice History
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Invoice history will appear here in a future phase.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { key: "overview",  label: "Overview",       icon: User },
  { key: "addresses", label: "Addresses",       icon: MapPin },
  { key: "identity",  label: "Identity & Docs", icon: CreditCard },
  { key: "more",      label: "More Info",        icon: Info },
  { key: "account",   label: "Account",          icon: Building2 },
];

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("overview");
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; newStatus: CustomerStatus | null }>({ open: false, newStatus: null });
  const [resetDialog, setResetDialog] = useState<{ open: boolean; tempPassword: string | null }>({ open: false, tempPassword: null });

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["customers", id],
    queryFn: () => customersService.get(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: CustomerStatus) => customersService.updateStatus(id!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      showToast("Status updated successfully", "success");
      setStatusDialog({ open: false, newStatus: null });
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const resetMutation = useMutation({
    mutationFn: () => customersService.resetPassword(id!),
    onSuccess: (data) => {
      setResetDialog({ open: true, tempPassword: data.temp_password });
      showToast("Password reset successfully", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  if (isLoading) {
    return (
      <AppLayout title="Customer" portalLabel="Administration">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }
  if (!customer) {
    return (
      <AppLayout title="Customer" portalLabel="Administration">
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <p className="text-muted-foreground">Customer not found.</p>
          <Button variant="outline" onClick={() => navigate("/admin/customers")}>Back to Customers</Button>
        </div>
      </AppLayout>
    );
  }

  const nextStatus: CustomerStatus = customer.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

  return (
    <AppLayout title={customer.full_name} portalLabel="Administration">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")} className="mt-0.5 shrink-0">
              <ArrowLeft className="h-4 w-4" />Back
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{customer.full_name}</h2>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[customer.status]}`}>
                  {customer.status}
                </span>
                {customer.customer_type === "BUSINESS" && (
                  <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                    Business
                  </span>
                )}
              </div>
              <p className="font-mono text-sm text-muted-foreground mt-0.5">{customer.customer_code}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/customers/${id}/edit`)}>
              <Edit className="h-4 w-4" />Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStatusDialog({ open: true, newStatus: nextStatus })}>
              {nextStatus === "ACTIVE" ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
              Set {nextStatus}
            </Button>
            <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
              Reset Password
            </Button>
          </div>
        </div>

        {/* Tabbed card */}
        <Card className="overflow-hidden">
          <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
          <CardContent className="pt-5 pb-6">
            {activeTab === "overview"  && <OverviewTab customer={customer} />}
            {activeTab === "addresses" && <AddressesTab customer={customer} />}
            {activeTab === "identity"  && <IdentityDocsTab customer={customer} />}
            {activeTab === "more"      && <MoreInfoTab customer={customer} />}
            {activeTab === "account"   && <AccountTab customerId={id!} />}
          </CardContent>
        </Card>
      </div>

      {/* Status dialog */}
      <Dialog open={statusDialog.open} onClose={() => setStatusDialog({ open: false, newStatus: null })} title="Change Status">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Change status to <strong>{statusDialog.newStatus}</strong>?
            {statusDialog.newStatus === "DISCONNECTED" && (
              <span className="mt-1 block text-red-600">This will disable the customer's login access.</span>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusDialog({ open: false, newStatus: null })}>Cancel</Button>
            <Button onClick={() => { if (statusDialog.newStatus) statusMutation.mutate(statusDialog.newStatus); }} disabled={statusMutation.isPending}>
              {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetDialog.open} onClose={() => setResetDialog({ open: false, tempPassword: null })} title="New Temporary Password">
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-xs text-muted-foreground mb-1.5">Temporary Password</p>
            <p className="font-mono text-lg font-semibold tracking-wider">{resetDialog.tempPassword}</p>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Copy this password now — it will not be shown again.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={async () => {
              if (resetDialog.tempPassword) {
                await navigator.clipboard.writeText(resetDialog.tempPassword);
                showToast("Copied to clipboard", "success");
              }
            }}>Copy</Button>
            <Button onClick={() => setResetDialog({ open: false, tempPassword: null })}>Done</Button>
          </div>
        </div>
      </Dialog>
    </AppLayout>
  );
}
