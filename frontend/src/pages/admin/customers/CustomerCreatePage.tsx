import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Upload, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLayout } from "@/layouts/AppLayout";
import { CredentialsModal } from "@/components/customers/CredentialsModal";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import type { DocType } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import type { CustomerCreateResponse } from "@/types/customer";

// ── Constants ────────────────────────────────────────────────────────────────

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa",
  "Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
  "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
  "Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
  "Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands",
  "Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi",
  "Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

const KYC_OPTIONS = [
  { value: "AADHAAR", label: "Aadhaar Card" },
  { value: "PAN", label: "PAN Card" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
];

const REFERENCE_OPTIONS = [
  "Online","Referral","Walk-In","Agent","Newspaper","Social Media","Other",
];

// ── Zod schema ───────────────────────────────────────────────────────────────

const schema = z
  .object({
    customer_type: z.enum(["INDIVIDUAL", "BUSINESS"]),
    company_name: z.string().optional(),
    gst_number: z.string().optional(),

    full_name: z.string().min(2, "Full name is required"),
    mobile_number: z.string().regex(/^\d{10}$/, "Must be exactly 10 digits"),
    alternate_mobile_number: z
      .string()
      .regex(/^\d{10}$/, "Must be exactly 10 digits")
      .or(z.literal(""))
      .optional(),
    email: z.string().email("Invalid email address"),

    kyc_type: z.string().optional(),
    kyc_number: z.string().optional(),

    installation_address: z.string().min(3, "Address is required"),
    address_line_2: z.string().optional(),
    landmark: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    pincode: z.string().regex(/^\d{6}$/, "Must be exactly 6 digits"),

    billing_same_as_installation: z.boolean(),
    billing_address_line_1: z.string().optional(),
    billing_address_line_2: z.string().optional(),
    billing_landmark: z.string().optional(),
    billing_city: z.string().optional(),
    billing_state: z.string().optional(),
    billing_pincode: z.string().optional(),

    spokesperson_name: z.string().optional(),
    spokesperson_mobile: z
      .string()
      .regex(/^\d{10}$/, "Must be exactly 10 digits")
      .or(z.literal(""))
      .optional(),
    spokesperson_email: z.string().email("Invalid email").or(z.literal("")).optional(),
    spokesperson_designation: z.string().optional(),

    connection_date: z.string().optional(),
    reference_source: z.string().optional(),
    sales_person: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.customer_type === "BUSINESS" && !d.company_name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Company name is required for business customers",
        path: ["company_name"],
      });
    }
    if (!d.billing_same_as_installation) {
      if (!d.billing_address_line_1?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["billing_address_line_1"] });
      if (!d.billing_city?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["billing_city"] });
      if (!d.billing_state?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["billing_state"] });
      if (!d.billing_pincode?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["billing_pincode"] });
      else if (!/^\d{6}$/.test(d.billing_pincode))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be 6 digits", path: ["billing_pincode"] });
    }
  });

type FormValues = z.infer<typeof schema>;

// ── Shared Field wrapper ─────────────────────────────────────────────────────

function Field({
  label, error, required, className, children,
}: {
  label: string; error?: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const SELECT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ── Document file selector ────────────────────────────────────────────────────

function DocInput({
  label, accept, inputRef, onChange, fileName,
}: {
  label: string; accept: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (name: string) => void;
  fileName: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        Choose File
      </Button>
      <span className="text-sm text-muted-foreground truncate max-w-xs">
        {fileName ? (
          <span className="flex items-center gap-1 text-foreground">
            <FileText className="h-4 w-4 shrink-0" />
            {fileName}
          </span>
        ) : (
          <span className="italic">{label} — no file chosen</span>
        )}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [credentials, setCredentials] = useState<CustomerCreateResponse | null>(null);

  // Document file refs (outside RHF — uploaded separately after customer creation)
  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const kycDocRef = useRef<HTMLInputElement>(null);
  const agreementDocRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState({ profile_photo: "", kyc_document: "", agreement_document: "" });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_type: "INDIVIDUAL",
      billing_same_as_installation: true,
    },
  });

  const customerType = watch("customer_type");
  const billingSame = watch("billing_same_as_installation");

  const onSubmit = async (values: FormValues) => {
    try {
      // 1. Create customer
      const result = await customersService.create({
        ...values,
        alternate_mobile_number: values.alternate_mobile_number || undefined,
        kyc_type: (values.kyc_type as any) || undefined,
        gst_number: values.gst_number || undefined,
        company_name: values.company_name || undefined,
        connection_date: values.connection_date || undefined,
        reference_source: values.reference_source || undefined,
        sales_person: values.sales_person || undefined,
        notes: values.notes || undefined,
        spokesperson_mobile: values.spokesperson_mobile || undefined,
        spokesperson_email: values.spokesperson_email || undefined,
        billing_address_line_1: values.billing_same_as_installation ? undefined : values.billing_address_line_1,
        billing_address_line_2: values.billing_same_as_installation ? undefined : values.billing_address_line_2,
        billing_landmark: values.billing_same_as_installation ? undefined : values.billing_landmark,
        billing_city: values.billing_same_as_installation ? undefined : values.billing_city,
        billing_state: values.billing_same_as_installation ? undefined : values.billing_state,
        billing_pincode: values.billing_same_as_installation ? undefined : values.billing_pincode,
      });

      // 2. Upload documents in parallel (non-blocking errors)
      const docUploads: Array<[DocType, React.RefObject<HTMLInputElement>]> = [
        ["profile_photo", profilePhotoRef],
        ["kyc_document", kycDocRef],
        ["agreement_document", agreementDocRef],
      ];
      await Promise.all(
        docUploads.map(async ([docType, ref]) => {
          const file = ref.current?.files?.[0];
          if (!file) return;
          try {
            await customersService.uploadDocument(result.id, docType, file);
          } catch (err) {
            showToast(`${docType} upload failed: ${getApiErrorMessage(err)}`, "error");
          }
        }),
      );

      setCredentials(result);
    } catch (err) {
      showToast(getApiErrorMessage(err, "Failed to create customer"), "error");
    }
  };

  return (
    <AppLayout title="New Customer" portalLabel="Administration">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">New Customer</h2>
            <p className="text-sm text-muted-foreground">
              Fill in all relevant details. A CLIENT login is created automatically.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Section 1: Customer Type ───────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-6">
                {(["INDIVIDUAL", "BUSINESS"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                    <input
                      type="radio"
                      value={t}
                      {...register("customer_type")}
                      className="accent-primary"
                    />
                    {t === "INDIVIDUAL" ? "Individual" : "Business / Company"}
                  </label>
                ))}
              </div>

              {customerType === "BUSINESS" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-border/40">
                  <Field label="Company Name" error={errors.company_name?.message} required>
                    <Input placeholder="Acme Pvt. Ltd." {...register("company_name")} />
                  </Field>
                  <Field label="GST Number" error={errors.gst_number?.message}>
                    <Input placeholder="22AAAAA0000A1Z5" maxLength={15} style={{ textTransform: "uppercase" }} {...register("gst_number")} />
                  </Field>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 2: Basic Information ──────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full Name" error={errors.full_name?.message} required className="sm:col-span-2">
                <Input placeholder="Full legal name" {...register("full_name")} />
              </Field>
              <Field label="Mobile Number" error={errors.mobile_number?.message} required>
                <Input placeholder="9876543210" maxLength={10} {...register("mobile_number")} />
              </Field>
              <Field label="Alternate Mobile" error={errors.alternate_mobile_number?.message}>
                <Input placeholder="9876543210" maxLength={10} {...register("alternate_mobile_number")} />
              </Field>
              <Field label="Email Address" error={errors.email?.message} required className="sm:col-span-2">
                <Input type="email" placeholder="customer@example.com" {...register("email")} />
              </Field>
            </CardContent>
          </Card>

          {/* ── Section 3: Identity / KYC ─────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="KYC Document Type" error={errors.kyc_type?.message}>
                <select {...register("kyc_type")} className={SELECT_CLS}>
                  <option value="">— Select —</option>
                  {KYC_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="KYC Number" error={errors.kyc_number?.message}>
                <Input placeholder="Document number" {...register("kyc_number")} />
              </Field>
            </CardContent>
          </Card>

          {/* ── Section 4: Installation Address ───────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Installation Address</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Address Line 1" error={errors.installation_address?.message} required className="sm:col-span-2">
                <Input placeholder="House / Flat No., Building, Street" {...register("installation_address")} />
              </Field>
              <Field label="Address Line 2" error={errors.address_line_2?.message} className="sm:col-span-2">
                <Input placeholder="Area, Colony, Sector (optional)" {...register("address_line_2")} />
              </Field>
              <Field label="Landmark" error={errors.landmark?.message} className="sm:col-span-2">
                <Input placeholder="Near post office, opposite school…" {...register("landmark")} />
              </Field>
              <Field label="City" error={errors.city?.message} required>
                <Input placeholder="Mumbai" {...register("city")} />
              </Field>
              <Field label="State" error={errors.state?.message} required>
                <input
                  list="state-list"
                  placeholder="Maharashtra"
                  {...register("state")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="state-list">
                  {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <Field label="Pincode" error={errors.pincode?.message} required>
                <Input placeholder="400001" maxLength={6} {...register("pincode")} />
              </Field>
            </CardContent>
          </Card>

          {/* ── Section 5: Billing Address ────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billing Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="checkbox"
                  {...register("billing_same_as_installation")}
                  className="accent-primary h-4 w-4"
                />
                Same as installation address
              </label>

              {!billingSame && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-border/40">
                  <Field label="Address Line 1" error={errors.billing_address_line_1?.message} required className="sm:col-span-2">
                    <Input placeholder="House / Flat No., Building, Street" {...register("billing_address_line_1")} />
                  </Field>
                  <Field label="Address Line 2" error={errors.billing_address_line_2?.message} className="sm:col-span-2">
                    <Input placeholder="Area, Colony, Sector" {...register("billing_address_line_2")} />
                  </Field>
                  <Field label="Landmark" error={errors.billing_landmark?.message} className="sm:col-span-2">
                    <Input placeholder="Landmark (optional)" {...register("billing_landmark")} />
                  </Field>
                  <Field label="City" error={errors.billing_city?.message} required>
                    <Input placeholder="Mumbai" {...register("billing_city")} />
                  </Field>
                  <Field label="State" error={errors.billing_state?.message} required>
                    <input
                      list="billing-state-list"
                      placeholder="Maharashtra"
                      {...register("billing_state")}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <datalist id="billing-state-list">
                      {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </Field>
                  <Field label="Pincode" error={errors.billing_pincode?.message} required>
                    <Input placeholder="400001" maxLength={6} {...register("billing_pincode")} />
                  </Field>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 6: Spokesperson ───────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spokesperson / Alternate Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full Name" error={errors.spokesperson_name?.message} className="sm:col-span-2">
                <Input placeholder="Contact person's name" {...register("spokesperson_name")} />
              </Field>
              <Field label="Mobile Number" error={errors.spokesperson_mobile?.message}>
                <Input placeholder="9876543210" maxLength={10} {...register("spokesperson_mobile")} />
              </Field>
              <Field label="Email Address" error={errors.spokesperson_email?.message}>
                <Input type="email" placeholder="contact@example.com" {...register("spokesperson_email")} />
              </Field>
              <Field label="Designation" error={errors.spokesperson_designation?.message} className="sm:col-span-2">
                <Input placeholder="Manager, Director, Owner…" {...register("spokesperson_designation")} />
              </Field>
            </CardContent>
          </Card>

          {/* ── Section 7: Additional Information ────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Connection Date" error={errors.connection_date?.message}>
                <Input type="date" {...register("connection_date")} />
              </Field>
              <Field label="Reference Source" error={errors.reference_source?.message}>
                <select {...register("reference_source")} className={SELECT_CLS}>
                  <option value="">— Select —</option>
                  {REFERENCE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Salesperson" error={errors.sales_person?.message} className="sm:col-span-2">
                <Input placeholder="Assigned salesperson's name" {...register("sales_person")} />
              </Field>
              <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
                <textarea
                  rows={3}
                  placeholder="Internal notes about this customer…"
                  {...register("notes")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </Field>
            </CardContent>
          </Card>

          {/* ── Section 8: Documents ──────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Documents are uploaded after the customer is created. Max 10 MB per file.
              </p>
              <div className="divide-y divide-border/50">
                <div className="py-3">
                  <p className="text-sm font-medium mb-2">Profile Photo</p>
                  <DocInput
                    label="Profile Photo"
                    accept="image/jpeg,image/png,image/webp"
                    inputRef={profilePhotoRef}
                    fileName={fileNames.profile_photo}
                    onChange={(n) => setFileNames((p) => ({ ...p, profile_photo: n }))}
                  />
                </div>
                <div className="py-3">
                  <p className="text-sm font-medium mb-2">KYC Document</p>
                  <DocInput
                    label="KYC Document"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    inputRef={kycDocRef}
                    fileName={fileNames.kyc_document}
                    onChange={(n) => setFileNames((p) => ({ ...p, kyc_document: n }))}
                  />
                </div>
                <div className="py-3">
                  <p className="text-sm font-medium mb-2">Agreement Document</p>
                  <DocInput
                    label="Agreement Document"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    inputRef={agreementDocRef}
                    fileName={fileNames.agreement_document}
                    onChange={(n) => setFileNames((p) => ({ ...p, agreement_document: n }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Actions ───────────────────────────────────────────────────── */}
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
