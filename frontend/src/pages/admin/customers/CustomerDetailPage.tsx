import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Key, ShieldOff, ShieldCheck, Edit, Loader2,
  CheckCircle2, XCircle, Download, User, MapPin, CreditCard,
  FolderUp, Info, UserCheck, Building2,
} from "lucide-react";

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

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<CustomerStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800 border border-green-200",
  SUSPENDED: "bg-amber-100 text-amber-800 border border-amber-200",
  DISCONNECTED: "bg-red-100 text-red-800 border border-red-200",
};

const KYC_LABELS: Record<string, string> = {
  AADHAAR: "Aadhaar Card",
  PAN: "PAN Card",
  PASSPORT: "Passport",
  VOTER_ID: "Voter ID",
  DRIVING_LICENSE: "Driving License",
};

// ── Tab component ─────────────────────────────────────────────────────────────

type TabDef = { key: string; label: string; icon: React.ElementType };

function TabBar({ tabs, active, onChange }: {
  tabs: TabDef[]; active: string; onChange: (k: string) => void;
}) {
  return (
    <div className="flex overflow-x-auto border-b border-border scrollbar-none">
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`
              flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors -mb-px
              ${isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}
            `}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── InfoRow / BoolRow ─────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-5 gap-3 py-2.5 border-b border-border/40 last:border-0">
      <dt className="col-span-2 text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-3 text-sm font-medium text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-3 py-2.5 border-b border-border/40 last:border-0">
      <dt className="col-span-2 text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-3 flex items-center gap-1.5 text-sm font-medium">
        {value
          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
          : <XCircle className="h-4 w-4 text-red-400" />}
        {value ? "Yes" : "No"}
      </dd>
    </div>
  );
}

// ── Document helpers ──────────────────────────────────────────────────────────

async function downloadDocument(customerId: string, docType: DocType, filename: string) {
  const token = tokenService.getAccess();
  const resp = await fetch(`/api/v1/customers/${customerId}/documents/${docType}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("Download failed");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DocCard({ label, docType, customerId, hasDoc }: {
  label: string; docType: DocType; customerId: string; hasDoc: boolean;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try { await downloadDocument(customerId, docType, label); }
    catch { showToast("Failed to download document", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className={`
      flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-colors
      ${hasDoc ? "border-green-200 bg-green-50/50" : "border-border/60 bg-muted/20"}
    `}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${hasDoc ? "bg-green-100" : "bg-muted"}`}>
        {hasDoc
          ? <CheckCircle2 className="h-5 w-5 text-green-600" />
          : <XCircle className="h-5 w-5 text-muted-foreground/50" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hasDoc ? "Uploaded" : "Not uploaded"}</p>
      </div>
      {hasDoc && (
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download
        </Button>
      )}
    </div>
  );
}

// ── Tab content panels ────────────────────────────────────────────────────────

function OverviewTab({ customer }: { customer: Customer }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {/* Identity card */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal Details</span>
        </div>
        <dl>
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
        </dl>
      </div>

      {/* Contact card */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact & Status</span>
        </div>
        <dl>
          <InfoRow label="Mobile Number" value={customer.mobile_number} />
          <InfoRow label="Alternate Mobile" value={customer.alternate_mobile_number} />
          <InfoRow label="Email Address" value={customer.email} />
          <BoolRow label="Account Active" value={customer.is_active} />
          <BoolRow label="Must Change Password" value={customer.must_change_password} />
        </dl>
      </div>
    </div>
  );
}

function AddressesTab({ customer }: { customer: Customer }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {/* Installation */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Installation Address</span>
        </div>
        <dl>
          <InfoRow label="Address Line 1" value={customer.installation_address} />
          <InfoRow label="Address Line 2" value={customer.address_line_2} />
          <InfoRow label="Landmark" value={customer.landmark} />
          <InfoRow label="City" value={customer.city} />
          <InfoRow label="State" value={customer.state} />
          <InfoRow label="Pincode" value={customer.pincode} />
        </dl>
      </div>

      {/* Billing */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing Address</span>
        </div>
        {customer.billing_same_as_installation ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            Same as installation address
          </div>
        ) : (
          <dl>
            <InfoRow label="Address Line 1" value={customer.billing_address_line_1} />
            <InfoRow label="Address Line 2" value={customer.billing_address_line_2} />
            <InfoRow label="Landmark" value={customer.billing_landmark} />
            <InfoRow label="City" value={customer.billing_city} />
            <InfoRow label="State" value={customer.billing_state} />
            <InfoRow label="Pincode" value={customer.billing_pincode} />
          </dl>
        )}
      </div>
    </div>
  );
}

function IdentityDocsTab({ customer }: { customer: Customer }) {
  return (
    <div className="space-y-5">
      {/* KYC */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">KYC / Identity</span>
        </div>
        {customer.kyc_type || customer.kyc_number ? (
          <dl>
            <InfoRow label="Document Type" value={customer.kyc_type ? (KYC_LABELS[customer.kyc_type] ?? customer.kyc_type) : null} />
            <InfoRow label="Document Number" value={customer.kyc_number} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground italic">No KYC details provided.</p>
        )}
      </div>

      {/* Documents */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-0.5">
          <FolderUp className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uploaded Documents</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DocCard label="Profile Photo" docType="profile_photo" customerId={customer.id} hasDoc={!!customer.profile_photo_path} />
          <DocCard label="KYC Document" docType="kyc_document" customerId={customer.id} hasDoc={!!customer.kyc_document_path} />
          <DocCard label="Agreement" docType="agreement_document" customerId={customer.id} hasDoc={!!customer.agreement_document_path} />
        </div>
      </div>
    </div>
  );
}

function MoreInfoTab({ customer }: { customer: Customer }) {
  const hasSpokesPerson = customer.spokesperson_name || customer.spokesperson_mobile || customer.spokesperson_email;
  const hasAdditional = customer.connection_date || customer.reference_source || customer.sales_person || customer.notes;

  return (
    <div className="space-y-5">
      {/* Spokesperson */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserCheck className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spokesperson / Alternate Contact</span>
        </div>
        {hasSpokesPerson ? (
          <dl>
            <InfoRow label="Name" value={customer.spokesperson_name} />
            <InfoRow label="Mobile" value={customer.spokesperson_mobile} />
            <InfoRow label="Email" value={customer.spokesperson_email} />
            <InfoRow label="Designation" value={customer.spokesperson_designation} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground italic">No spokesperson details provided.</p>
        )}
      </div>

      {/* Additional Info */}
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional Information</span>
        </div>
        {hasAdditional ? (
          <dl>
            <InfoRow
              label="Connection Date"
              value={customer.connection_date ? new Date(customer.connection_date).toLocaleDateString("en-IN") : null}
            />
            <InfoRow label="Reference Source" value={customer.reference_source} />
            <InfoRow label="Salesperson" value={customer.sales_person} />
            {customer.notes && (
              <div className="py-2.5 border-t border-border/40 mt-2">
                <dt className="text-sm text-muted-foreground mb-1.5">Notes</dt>
                <dd className="rounded-lg bg-muted/40 px-3 py-2.5 text-sm font-medium whitespace-pre-wrap">{customer.notes}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground italic">No additional information provided.</p>
        )}
      </div>
    </div>
  );
}

function AccountTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-dashed border-border/60 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mx-auto mb-3">
          <Building2 className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Subscription Information</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Subscription details will appear here in a future phase.</p>
      </div>
      <div className="rounded-xl border-2 border-dashed border-border/60 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mx-auto mb-3">
          <Info className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Invoice History</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Invoice history will appear here in a future phase.</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { key: "overview",  label: "Overview",       icon: User },
  { key: "addresses", label: "Addresses",      icon: MapPin },
  { key: "identity",  label: "Identity & Docs", icon: CreditCard },
  { key: "more",      label: "More Info",       icon: Info },
  { key: "account",   label: "Account",         icon: Building2 },
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
      <div className="mx-auto max-w-3xl space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")} className="mt-0.5 shrink-0">
              <ArrowLeft className="h-4 w-4" />Back
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{customer.full_name}</h2>
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

        {/* Tabbed content card */}
        <Card className="overflow-hidden">
          <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
          <CardContent className="pt-5 pb-6">
            {activeTab === "overview"  && <OverviewTab customer={customer} />}
            {activeTab === "addresses" && <AddressesTab customer={customer} />}
            {activeTab === "identity"  && <IdentityDocsTab customer={customer} />}
            {activeTab === "more"      && <MoreInfoTab customer={customer} />}
            {activeTab === "account"   && <AccountTab />}
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
            <Button
              onClick={() => { if (statusDialog.newStatus) statusMutation.mutate(statusDialog.newStatus); }}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Password reset result */}
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
