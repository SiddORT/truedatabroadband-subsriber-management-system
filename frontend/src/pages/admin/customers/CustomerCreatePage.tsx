import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLayout } from "@/layouts/AppLayout";
import { CredentialsModal } from "@/components/customers/CredentialsModal";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import type { CustomerCreateResponse } from "@/types/customer";

const schema = z.object({
  full_name: z.string().min(2, "Full name is required"),
  mobile_number: z
    .string()
    .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),
  alternate_mobile_number: z
    .string()
    .regex(/^\d{10}$/, "Must be exactly 10 digits")
    .optional()
    .or(z.literal("")),
  email: z.string().email("Invalid email address"),
  installation_address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be exactly 6 digits"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [credentials, setCredentials] = useState<CustomerCreateResponse | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await customersService.create({
        ...values,
        alternate_mobile_number: values.alternate_mobile_number || undefined,
        notes: values.notes || undefined,
      });
      setCredentials(result);
    } catch (err) {
      showToast(getApiErrorMessage(err, "Failed to create customer"), "error");
    }
  };

  return (
    <AppLayout title="New Customer" portalLabel="Administration">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">New Customer</h2>
            <p className="text-sm text-muted-foreground">
              Create a customer account with an automatic CLIENT login.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Personal Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full Name" error={errors.full_name?.message} required>
                <Input placeholder="John Doe" {...register("full_name")} />
              </Field>
              <Field label="Email" error={errors.email?.message} required>
                <Input type="email" placeholder="john@example.com" {...register("email")} />
              </Field>
              <Field label="Mobile Number" error={errors.mobile_number?.message} required>
                <Input placeholder="9876543210" maxLength={10} {...register("mobile_number")} />
              </Field>
              <Field label="Alternate Mobile" error={errors.alternate_mobile_number?.message}>
                <Input placeholder="9876543210" maxLength={10} {...register("alternate_mobile_number")} />
              </Field>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Installation Address</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Address" error={errors.installation_address?.message} required>
                  <Input placeholder="House / Flat / Street" {...register("installation_address")} />
                </Field>
              </div>
              <Field label="City" error={errors.city?.message} required>
                <Input placeholder="Mumbai" {...register("city")} />
              </Field>
              <Field label="State" error={errors.state?.message} required>
                <Input placeholder="Maharashtra" {...register("state")} />
              </Field>
              <Field label="Pincode" error={errors.pincode?.message} required>
                <Input placeholder="400001" maxLength={6} {...register("pincode")} />
              </Field>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                placeholder="Optional notes about this customer…"
                {...register("notes")}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/admin/customers")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Customer
            </Button>
          </div>
        </form>
      </div>

      {/* Success modal showing credentials */}
      {credentials && (
        <CredentialsModal
          open={true}
          onClose={() => navigate("/admin/customers")}
          customerCode={credentials.customer_code}
          email={credentials.email}
          tempPassword={credentials.temp_password}
        />
      )}
    </AppLayout>
  );
}
