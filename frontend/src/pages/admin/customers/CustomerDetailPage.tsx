import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Key, ShieldOff, ShieldCheck, Edit, Loader2,
  CheckCircle2, XCircle, Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  DISCONNECTED: "bg-red-100 text-red-800",
};

const KYC_LABELS: Record<string, string> = {
  AADHAAR: "Aadhaar Card",
  PAN: "PAN Card",
  PASSPORT: "Passport",
  VOTER_ID: "Voter ID",
  DRIVING_LICENSE: "Driving License",
};

// ── Shared components ────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-2 border-b border-border/50 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-2 border-b border-border/50 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium flex items-center gap-1">
        {value ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        {value ? "Yes" : "No"}
      </dd>
    </div>
  );
}

// ── Document download helper (fetches with auth token, creates blob URL) ─────

async function downloadDocument(customerId: string, docType: DocType, filename: string) {
  const token = tokenService.getAccess();
  const resp = await fetch(`/api/v1/customers/${customerId}/documents/${docType}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("Download failed");
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DocRow({
  label, docType, customerId, hasDoc,
}: {
  label: string; docType: DocType; customerId: string; hasDoc: boolean;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      await downloadDocument(customerId, docType, label);
    } catch {
      showToast("Failed to download document", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-sm">
        {hasDoc ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium">{label}</span>
        {!hasDoc && <span className="text-muted-foreground text-xs">(not uploaded)</span>}
      </div>
      {hasDoc && (
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          View
        </Button>
      )}
    </div>
  );
}

// ── Address formatter ────────────────────────────────────────────────────────

function formatAddress(
  line1: string | null | undefined,
  line2: string | null | undefined,
  landmark: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  pincode: string | null | undefined,
): string {
  return [line1, line2, landmark, city && state ? `${city}, ${state}` : city || state, pincode]
    .filter(Boolean)
    .join(", ");
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [statusDialog, setStatusDialog] = useState<{ open: boolean; newStatus: CustomerStatus | null }>({
    open: false, newStatus: null,
  });
  const [resetDialog, setResetDialog] = useState<{ open: boolean; tempPassword: string | null }>({
    open: false, tempPassword: null,
  });

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
          <Button variant="outline" onClick={() => navigate("/admin/customers")}>
            Back to Customers
          </Button>
        </div>
      </AppLayout>
    );
  }

  const nextStatus: CustomerStatus = customer.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

  return (
    <AppLayout title={customer.full_name} portalLabel="Administration">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{customer.full_name}</h2>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[customer.status]}`}>
                  {customer.status}
                </span>
                {customer.customer_type === "BUSINESS" && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                    Business
                  </span>
                )}
              </div>
              <p className="font-mono text-sm text-muted-foreground">{customer.customer_code}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/customers/${id}/edit`)}>
              <Edit className="h-4 w-4" />Edit
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setStatusDialog({ open: true, newStatus: nextStatus })}
            >
              {nextStatus === "ACTIVE" ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
              Set {nextStatus}
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              <Key className="h-4 w-4" />Reset Password
            </Button>
          </div>
        </div>

        {/* Section 1 & 2: Type + Basic Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-0">
              <InfoRow label="Full Name" value={customer.full_name} />
              <InfoRow label="Customer Type" value={customer.customer_type === "BUSINESS" ? "Business / Company" : "Individual"} />
              {customer.customer_type === "BUSINESS" && (
                <>
                  <InfoRow label="Company Name" value={customer.company_name} />
                  <InfoRow label="GST Number" value={customer.gst_number} />
                </>
              )}
              <InfoRow label="Mobile Number" value={customer.mobile_number} />
              <InfoRow label="Alternate Mobile" value={customer.alternate_mobile_number} />
              <InfoRow label="Email Address" value={customer.email} />
              <InfoRow label="Customer Code" value={customer.customer_code} />
              <InfoRow label="Status" value={customer.status} />
              <BoolRow label="Account Active" value={customer.is_active} />
              <BoolRow label="Must Change Password" value={customer.must_change_password} />
              <InfoRow label="Created" value={new Date(customer.created_at).toLocaleString("en-IN")} />
            </dl>
          </CardContent>
        </Card>

        {/* Section 3: Identity */}
        {(customer.kyc_type || customer.kyc_number) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Identity / KYC</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-0">
                <InfoRow label="KYC Type" value={customer.kyc_type ? KYC_LABELS[customer.kyc_type] ?? customer.kyc_type : null} />
                <InfoRow label="KYC Number" value={customer.kyc_number} />
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Section 4: Installation Address */}
        <Card>
          <CardHeader><CardTitle className="text-base">Installation Address</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-0">
              <InfoRow label="Address Line 1" value={customer.installation_address} />
              <InfoRow label="Address Line 2" value={customer.address_line_2} />
              <InfoRow label="Landmark" value={customer.landmark} />
              <InfoRow label="City" value={customer.city} />
              <InfoRow label="State" value={customer.state} />
              <InfoRow label="Pincode" value={customer.pincode} />
            </dl>
          </CardContent>
        </Card>

        {/* Section 5: Billing Address */}
        <Card>
          <CardHeader><CardTitle className="text-base">Billing Address</CardTitle></CardHeader>
          <CardContent>
            {customer.billing_same_as_installation ? (
              <p className="text-sm text-muted-foreground italic">Same as installation address</p>
            ) : (
              <dl className="space-y-0">
                <InfoRow label="Address Line 1" value={customer.billing_address_line_1} />
                <InfoRow label="Address Line 2" value={customer.billing_address_line_2} />
                <InfoRow label="Landmark" value={customer.billing_landmark} />
                <InfoRow label="City" value={customer.billing_city} />
                <InfoRow label="State" value={customer.billing_state} />
                <InfoRow label="Pincode" value={customer.billing_pincode} />
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Section 6: Spokesperson */}
        {(customer.spokesperson_name || customer.spokesperson_mobile || customer.spokesperson_email) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Spokesperson / Alternate Contact</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-0">
                <InfoRow label="Name" value={customer.spokesperson_name} />
                <InfoRow label="Mobile" value={customer.spokesperson_mobile} />
                <InfoRow label="Email" value={customer.spokesperson_email} />
                <InfoRow label="Designation" value={customer.spokesperson_designation} />
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Section 7: Additional Information */}
        {(customer.connection_date || customer.reference_source || customer.sales_person || customer.notes) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Additional Information</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-0">
                <InfoRow
                  label="Connection Date"
                  value={customer.connection_date
                    ? new Date(customer.connection_date).toLocaleDateString("en-IN")
                    : null}
                />
                <InfoRow label="Reference Source" value={customer.reference_source} />
                <InfoRow label="Salesperson" value={customer.sales_person} />
                {customer.notes && (
                  <div className="py-2">
                    <dt className="text-sm text-muted-foreground mb-1">Notes</dt>
                    <dd className="text-sm font-medium whitespace-pre-wrap">{customer.notes}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Section 8: Documents */}
        <Card>
          <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
          <CardContent>
            <DocRow
              label="Profile Photo"
              docType="profile_photo"
              customerId={customer.id}
              hasDoc={!!customer.profile_photo_path}
            />
            <DocRow
              label="KYC Document"
              docType="kyc_document"
              customerId={customer.id}
              hasDoc={!!customer.kyc_document_path}
            />
            <DocRow
              label="Agreement Document"
              docType="agreement_document"
              customerId={customer.id}
              hasDoc={!!customer.agreement_document_path}
            />
          </CardContent>
        </Card>

        {/* Future placeholders */}
        <Card className="border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Subscription Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Subscription details will appear here in a future phase.</p>
          </CardContent>
        </Card>

        <Card className="border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Invoice history will appear here in a future phase.</p>
          </CardContent>
        </Card>
      </div>

      {/* Status change dialog */}
      <Dialog
        open={statusDialog.open}
        onClose={() => setStatusDialog({ open: false, newStatus: null })}
        title="Change Status"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Change status to <strong>{statusDialog.newStatus}</strong>?
            {statusDialog.newStatus === "DISCONNECTED" && (
              <span className="mt-1 block text-red-600">This will disable the customer's login access.</span>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusDialog({ open: false, newStatus: null })}>
              Cancel
            </Button>
            <Button
              onClick={() => { if (statusDialog.newStatus) statusMutation.mutate(statusDialog.newStatus); }}
              disabled={statusMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Password reset result */}
      <Dialog
        open={resetDialog.open}
        onClose={() => setResetDialog({ open: false, tempPassword: null })}
        title="New Temporary Password"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground mb-1">Temporary Password</p>
            <p className="font-mono text-lg font-semibold">{resetDialog.tempPassword}</p>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Copy this password now — it will not be shown again.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (resetDialog.tempPassword) {
                  await navigator.clipboard.writeText(resetDialog.tempPassword);
                  showToast("Copied to clipboard", "success");
                }
              }}
            >
              Copy
            </Button>
            <Button onClick={() => setResetDialog({ open: false, tempPassword: null })}>Done</Button>
          </div>
        </div>
      </Dialog>
    </AppLayout>
  );
}
