import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, User, Phone, MapPin, Hash, CheckCircle } from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientService } from "@/services/client";
import { useToast } from "@/contexts/ToastContext";
import type { ClientProfile } from "@/types/client";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </p>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  SUSPENDED: "bg-yellow-100 text-yellow-700",
  DISCONNECTED: "bg-red-100 text-red-700",
};

export function ProfilePage() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [altMobile, setAltMobile] = useState("");

  const { data: profile, isLoading } = useQuery<ClientProfile>({
    queryKey: ["client-profile"],
    queryFn: () => clientService.getProfile(),
  });

  // Sync altMobile when profile data arrives
  useEffect(() => {
    if (profile) {
      setAltMobile(profile.alternate_mobile_number ?? "");
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (alt: string | null) =>
      clientService.updateProfile({ alternate_mobile_number: alt || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-profile"] });
      setEditing(false);
      showToast("Profile updated successfully.", "success");
    },
    onError: () => {
      showToast("Failed to update profile. Please try again.", "error");
    },
  });

  const handleSave = () => {
    mutation.mutate(altMobile.trim() || null);
  };

  const handleCancel = () => {
    setAltMobile(profile?.alternate_mobile_number ?? "");
    setEditing(false);
  };

  if (isLoading) {
    return (
      <ClientLayout title="My Profile">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </ClientLayout>
    );
  }

  if (!profile) {
    return (
      <ClientLayout title="My Profile">
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <User className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No profile data found.</p>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout title="My Profile">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">My Profile</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              View your account details and update contact information.
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[profile.status] ?? "bg-muted text-muted-foreground"}`}
          >
            {profile.status}
          </span>
        </div>

        {/* Account summary card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              <SectionTitle icon={User} label="Account Information" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <InfoRow
                label="Customer Code"
                value={<span className="font-mono text-primary">{profile.customer_code}</span>}
              />
              <InfoRow label="Full Name" value={profile.full_name} />
              <InfoRow label="Account Type" value={profile.customer_type} />
              {profile.connection_date && (
                <InfoRow
                  label="Connection Date"
                  value={new Date(profile.connection_date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contact card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              <SectionTitle icon={Phone} label="Contact Details" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <InfoRow label="Primary Email (read-only)" value={profile.email} />
              <InfoRow label="Mobile Number (read-only)" value={profile.mobile_number} />

              {/* Editable: alternate mobile */}
              <div className="py-2.5">
                <Label className="text-xs text-muted-foreground">Alternate Mobile</Label>
                {editing ? (
                  <div className="mt-1.5">
                    <Input
                      value={altMobile}
                      onChange={(e) => setAltMobile(e.target.value)}
                      placeholder="10-digit mobile"
                      inputMode="numeric"
                      className="max-w-xs"
                    />
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {profile.alternate_mobile_number ?? (
                      <span className="text-muted-foreground/60">Not set</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Edit controls */}
            <div className="mt-4 flex items-center gap-2">
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
                    {mutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={mutation.isPending}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit Contact Info
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Address card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              <SectionTitle icon={MapPin} label="Installation Address" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <InfoRow label="Address" value={profile.installation_address} />
              <InfoRow label="City" value={profile.city} />
              <InfoRow label="State" value={profile.state} />
              <InfoRow label="Pincode" value={profile.pincode} />
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Hash className="mr-1 inline h-3 w-3" />
          Customer ID: <span className="font-mono">{profile.customer_code}</span>
        </p>
      </div>
    </ClientLayout>
  );
}
