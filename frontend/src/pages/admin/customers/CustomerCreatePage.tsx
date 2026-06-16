import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import {
  Loader2, ArrowLeft, Upload, CheckCircle2,
  User, Users, Building2, CreditCard, MapPin, Receipt,
  UserCheck, Info, FolderUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { AppLayout } from "@/layouts/AppLayout";
import { CredentialsModal } from "@/components/customers/CredentialsModal";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import type { DocType } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import type { CustomerCreateResponse } from "@/types/customer";

// ── Static data ───────────────────────────────────────────────────────────────

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

// ── Zod schema (unchanged logic) ─────────────────────────────────────────────

const schema = z
  .object({
    customer_type: z.enum(["INDIVIDUAL", "BUSINESS"]),
    company_name: z.string().optional(),
    gst_number: z.string().optional(),
    full_name: z.string().min(2, "Full name is required"),
    mobile_number: z.string().regex(/^\d{10}$/, "Must be exactly 10 digits"),
    alternate_mobile_number: z.string().regex(/^\d{10}$/, "Must be exactly 10 digits").or(z.literal("")).optional(),
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
    spokesperson_mobile: z.string().regex(/^\d{10}$/, "Must be exactly 10 digits").or(z.literal("")).optional(),
    spokesperson_email: z.string().email("Invalid email").or(z.literal("")).optional(),
    spokesperson_designation: z.string().optional(),
    connection_date: z.string().optional(),
    reference_source: z.string().optional(),
    sales_person: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.customer_type === "BUSINESS" && !d.company_name?.trim())
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company name is required for business customers", path: ["company_name"] });
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

// ── Shared primitives ─────────────────────────────────────────────────────────

const SELECT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({
  label, error, required, className, hint, children,
}: {
  label: string; error?: string; required?: boolean;
  className?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {hint && <p className="text-[11px] text-muted-foreground -mt-0.5">{hint}</p>}
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <span className="h-1 w-1 rounded-full bg-destructive shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon, title, description, step, total,
}: {
  icon: React.ElementType; title: string; description: string; step: number; total: number;
}) {
  return (
    <CardHeader className="border-b border-border/40 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-4.5 w-4.5 text-primary" style={{ height: "1.125rem", width: "1.125rem" }} />
          </div>
          <div>
            <CardTitle className="text-[15px] leading-tight">{title}</CardTitle>
            <CardDescription className="mt-0.5 text-[12px]">{description}</CardDescription>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {step} / {total}
        </span>
      </div>
    </CardHeader>
  );
}

// ── File upload zone ──────────────────────────────────────────────────────────

function FileUploadZone({
  label, acceptHint, accept, inputRef, onChange, fileName,
}: {
  label: string; acceptHint: string; accept: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (name: string) => void;
  fileName: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`
          group flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6
          text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${fileName
            ? "border-green-400/60 bg-green-50/50 hover:border-green-500/60"
            : "border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-primary/5"}
        `}
      >
        {fileName ? (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700 truncate max-w-[160px]">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click to replace</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 transition-colors group-hover:bg-primary/10">
              <Upload className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Upload {label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{acceptHint} · Max 10 MB</p>
            </div>
          </>
        )}
      </button>
    </div>
  );
}

// ── Toggle switch (styled checkbox) ──────────────────────────────────────────

function ToggleField({
  label, description, name, register: reg,
}: {
  label: string; description?: string;
  name: string; register: ReturnType<typeof useForm>["register"];
}) {
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40 select-none">
      <div className="relative h-5 w-9 shrink-0">
        <input {...reg(name)} type="checkbox" className="peer sr-only" />
        <div className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary" />
        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TOTAL_SECTIONS = 8;

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [credentials, setCredentials] = useState<CustomerCreateResponse | null>(null);

  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const kycDocRef = useRef<HTMLInputElement>(null);
  const agreementDocRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState({
    profile_photo: "", kyc_document: "", agreement_document: "",
  });

  const {
    register, handleSubmit, watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { customer_type: "INDIVIDUAL", billing_same_as_installation: true },
  });

  const customerType = watch("customer_type");
  const billingSame = watch("billing_same_as_installation");

  const onSubmit = async (values: FormValues) => {
    try {
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

      const docUploads: Array<[DocType, React.RefObject<HTMLInputElement>]> = [
        ["profile_photo", profilePhotoRef],
        ["kyc_document", kycDocRef],
        ["agreement_document", agreementDocRef],
      ];
      await Promise.all(docUploads.map(async ([docType, ref]) => {
        const file = ref.current?.files?.[0];
        if (!file) return;
        try {
          await customersService.uploadDocument(result.id, docType, file);
        } catch (err) {
          showToast(`${docType} upload failed: ${getApiErrorMessage(err)}`, "error");
        }
      }));

      setCredentials(result);
    } catch (err) {
      showToast(getApiErrorMessage(err, "Failed to create customer"), "error");
    }
  };

  return (
    <AppLayout title="New Customer" portalLabel="Administration">
      <div className="mx-auto max-w-3xl space-y-5">

        {/* Page header */}
        <div className="flex items-start gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")} className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">New Customer</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Complete all relevant sections. Fields marked <span className="text-destructive font-medium">*</span> are required.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* ── 1. Customer Type ─────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={Users} title="Customer Type" description="Is this a personal or business account?" step={1} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: "INDIVIDUAL", label: "Individual", desc: "Personal broadband connection", Icon: User },
                  { value: "BUSINESS", label: "Business / Company", desc: "Corporate or commercial account", Icon: Building2 },
                ] as const).map(({ value, label, desc, Icon }) => {
                  const selected = customerType === value;
                  return (
                    <label key={value} className={`
                      relative flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 transition-all select-none
                      ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40"}
                    `}>
                      <input type="radio" value={value} {...register("customer_type")} className="sr-only" />
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${selected ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{label}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground leading-snug pl-9">{desc}</span>
                      {selected && <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                    </label>
                  );
                })}
              </div>

              {customerType === "BUSINESS" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-border/50 bg-muted/20 p-4">
                  <Field label="Company Name" error={errors.company_name?.message} required>
                    <Input placeholder="Acme Pvt. Ltd." {...register("company_name")} />
                  </Field>
                  <Field label="GST Number" error={errors.gst_number?.message} hint="15-character alphanumeric">
                    <Input placeholder="22AAAAA0000A1Z5" maxLength={15} className="uppercase" {...register("gst_number")} />
                  </Field>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 2. Basic Information ──────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={User} title="Basic Information" description="Primary contact details for this customer" step={2} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full Name" error={errors.full_name?.message} required className="sm:col-span-2">
                <Input placeholder="Customer's full legal name" {...register("full_name")} />
              </Field>
              <Field label="Mobile Number" error={errors.mobile_number?.message} required hint="Primary contact number">
                <Input placeholder="9876543210" maxLength={10} {...register("mobile_number")} />
              </Field>
              <Field label="Alternate Mobile" error={errors.alternate_mobile_number?.message} hint="Optional secondary number">
                <Input placeholder="9876543210" maxLength={10} {...register("alternate_mobile_number")} />
              </Field>
              <Field label="Email Address" error={errors.email?.message} required className="sm:col-span-2" hint="Used for login and billing communications">
                <Input type="email" placeholder="customer@example.com" {...register("email")} />
              </Field>
            </CardContent>
          </Card>

          {/* ── 3. Identity ───────────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={CreditCard} title="Identity Information" description="KYC details for compliance verification" step={3} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="KYC Document Type" error={errors.kyc_type?.message}>
                <select {...register("kyc_type")} className={SELECT_CLS}>
                  <option value="">— Select document type —</option>
                  {KYC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Document Number" error={errors.kyc_number?.message} hint="As printed on the document">
                <Input placeholder="e.g. 1234 5678 9012" {...register("kyc_number")} />
              </Field>
            </CardContent>
          </Card>

          {/* ── 4. Installation Address ───────────────────────────────────── */}
          <Card>
            <SectionHeader icon={MapPin} title="Installation Address" description="Physical location where the broadband connection will be installed" step={4} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Address Line 1" error={errors.installation_address?.message} required className="sm:col-span-2">
                <Input placeholder="House / Flat No., Building name, Street" {...register("installation_address")} />
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
                  list="install-state-list"
                  placeholder="Maharashtra"
                  {...register("state")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="install-state-list">
                  {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <Field label="Pincode" error={errors.pincode?.message} required>
                <Input placeholder="400001" maxLength={6} {...register("pincode")} />
              </Field>
            </CardContent>
          </Card>

          {/* ── 5. Billing Address ────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={Receipt} title="Billing Address" description="Where invoices and billing correspondence will be sent" step={5} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5 space-y-4">
              <ToggleField
                label="Same as installation address"
                description="Billing invoices will be sent to the installation location"
                name="billing_same_as_installation"
                register={register}
              />

              {!billingSame && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-border/50 bg-muted/20 p-4">
                  <Field label="Address Line 1" error={errors.billing_address_line_1?.message} required className="sm:col-span-2">
                    <Input placeholder="House / Flat No., Building name, Street" {...register("billing_address_line_1")} />
                  </Field>
                  <Field label="Address Line 2" className="sm:col-span-2">
                    <Input placeholder="Area, Colony, Sector (optional)" {...register("billing_address_line_2")} />
                  </Field>
                  <Field label="Landmark" className="sm:col-span-2">
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

          {/* ── 6. Spokesperson ───────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={UserCheck} title="Spokesperson / Alternate Contact" description="Authorised contact person — useful for business accounts" step={6} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          {/* ── 7. Additional Information ─────────────────────────────────── */}
          <Card>
            <SectionHeader icon={Info} title="Additional Information" description="Connection details, referral tracking and internal notes" step={7} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Connection Date" error={errors.connection_date?.message}>
                <Input type="date" {...register("connection_date")} />
              </Field>
              <Field label="Reference Source" error={errors.reference_source?.message}>
                <select {...register("reference_source")} className={SELECT_CLS}>
                  <option value="">— How did they find us? —</option>
                  {REFERENCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Salesperson" error={errors.sales_person?.message} className="sm:col-span-2">
                <Input placeholder="Name of the assigned salesperson" {...register("sales_person")} />
              </Field>
              <Field label="Internal Notes" error={errors.notes?.message} className="sm:col-span-2">
                <textarea
                  rows={3}
                  placeholder="Any internal notes or special instructions for this customer…"
                  {...register("notes")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </Field>
            </CardContent>
          </Card>

          {/* ── 8. Documents ──────────────────────────────────────────────── */}
          <Card>
            <SectionHeader icon={FolderUp} title="Documents" description="Upload supporting documents — can also be added or replaced after creation" step={8} total={TOTAL_SECTIONS} />
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FileUploadZone
                  label="Profile Photo"
                  acceptHint="JPG, PNG, WebP"
                  accept="image/jpeg,image/png,image/webp"
                  inputRef={profilePhotoRef}
                  fileName={fileNames.profile_photo}
                  onChange={(n) => setFileNames((p) => ({ ...p, profile_photo: n }))}
                />
                <FileUploadZone
                  label="KYC Document"
                  acceptHint="JPG, PNG, PDF"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  inputRef={kycDocRef}
                  fileName={fileNames.kyc_document}
                  onChange={(n) => setFileNames((p) => ({ ...p, kyc_document: n }))}
                />
                <FileUploadZone
                  label="Agreement"
                  acceptHint="JPG, PNG, PDF"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  inputRef={agreementDocRef}
                  fileName={fileNames.agreement_document}
                  onChange={(n) => setFileNames((p) => ({ ...p, agreement_document: n }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 shadow-card">
            <p className="text-[12px] text-muted-foreground">
              Fields marked <span className="text-destructive font-semibold">*</span> are required
            </p>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => navigate("/admin/customers")}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Customer
              </Button>
            </div>
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
