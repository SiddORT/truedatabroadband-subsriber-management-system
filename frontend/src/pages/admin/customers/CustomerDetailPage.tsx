import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Key, ShieldOff, ShieldCheck, Edit, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/Dialog";
import { AppLayout } from "@/layouts/AppLayout";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import type { Customer, CustomerStatus } from "@/types/customer";

const STATUS_COLORS: Record<CustomerStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  DISCONNECTED: "bg-red-100 text-red-800",
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-2 border-b border-border/50 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    newStatus: CustomerStatus | null;
  }>({ open: false, newStatus: null });

  const [resetDialog, setResetDialog] = useState<{
    open: boolean;
    tempPassword: string | null;
  }>({ open: false, tempPassword: null });

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

  const nextStatus: CustomerStatus =
    customer.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

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
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[customer.status]}`}
                >
                  {customer.status}
                </span>
              </div>
              <p className="font-mono text-sm text-muted-foreground">{customer.customer_code}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/admin/customers/${id}/edit`)}
            >
              <Edit className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusDialog({ open: true, newStatus: nextStatus })}
            >
              {nextStatus === "ACTIVE" ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
              Set {nextStatus}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              <Key className="h-4 w-4" />
              Reset Password
            </Button>
          </div>
        </div>

        {/* Customer information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-0">
              <InfoRow label="Full Name" value={customer.full_name} />
              <InfoRow label="Login Email" value={customer.email} />
              <InfoRow label="Mobile Number" value={customer.mobile_number} />
              <InfoRow label="Alternate Mobile" value={customer.alternate_mobile_number} />
              <InfoRow label="Status" value={customer.status} />
              <InfoRow label="Account Active" value={customer.is_active ? "Yes" : "No"} />
              <InfoRow label="Must Change Password" value={customer.must_change_password ? "Yes" : "No"} />
              <InfoRow label="Created" value={new Date(customer.created_at).toLocaleString("en-IN")} />
            </dl>
          </CardContent>
        </Card>

        {/* Installation address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Installation Address</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-0">
              <InfoRow label="Address" value={customer.installation_address} />
              <InfoRow label="City" value={customer.city} />
              <InfoRow label="State" value={customer.state} />
              <InfoRow label="Pincode" value={customer.pincode} />
            </dl>
          </CardContent>
        </Card>

        {/* Placeholder sections */}
        <Card className="border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              Subscription Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Subscription details will appear here in a future phase.
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Invoice history will appear here in a future phase.
            </p>
          </CardContent>
        </Card>

        {customer.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{customer.notes}</p>
            </CardContent>
          </Card>
        )}
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
              <span className="mt-1 block text-red-600">
                This will disable the customer's login access.
              </span>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setStatusDialog({ open: false, newStatus: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (statusDialog.newStatus)
                  statusMutation.mutate(statusDialog.newStatus);
              }}
              disabled={statusMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reset password result dialog */}
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
          <div className="flex justify-end">
            <Button onClick={() => setResetDialog({ open: false, tempPassword: null })}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </AppLayout>
  );
}
