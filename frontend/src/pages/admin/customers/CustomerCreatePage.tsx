import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import {
  Loader2, ArrowLeft, ArrowRight, Upload, CheckCircle2, Check,
  Users, User, Building2, CreditCard, MapPin, Receipt,
  UserCheck, Info, FolderUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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

// ── Wizard step definitions (4 steps) ────────────────────────────────────────

const STEPS = [
  { icon: Users,     title: "Customer & Contact",  description: "Account type and primary contact details" },
  { icon: MapPin,    title: "Identity & Address",   description: "KYC verification and service location" },
  { icon: Info,      title: "Additional Details",   description: "Spokesperson, connection info and notes" },
  { icon: FolderUp,  title: "Documents",             description: "Upload supporting files (optional)" },
];

const STEP_FIELDS: Record<number, string[]> = {
  0: ["customer_type","company_name","gst_number","full_name","mobile_number","alternate_mobile_number","email"],
  1: ["kyc_type","kyc_number","installation_address","address_line_2","landmark","city","state","pincode",
      "billing_same_as_installation","billing_address_line_1","billing_city","billing_state","billing_pincode"],
  2: ["spokesperson_name","spokesperson_mobile","spokesperson_email","spokesperson_designation",
      "connection_date","reference_source","sales_person","notes"],
  3: [],
};

// ── Zod schema ────────────────────────────────────────────────────────────────

const schema = z
  .object({
    customer_type: z.enum(["INDIVIDUAL", "BUSINESS"]),
    company_name: z.string().optional(),
    gst_number: z.string().optional(),
    full_name: z.string().min(2, "Full name is required"),
    mobile_number: z.string().regex(/^\d{10}$/, "Must be exactly 10 digits"),
    alternate_mobile_number: z.string().regex(/^\d{10}$/, "Must be 10 digits").or(z.literal("")).optional(),
    email: z.string().email("Invalid email address"),
    kyc_type: z.string().optional(),
    kyc_number: z.string().optional(),
    installation_address: z.string().min(3, "Address is required"),
    address_line_2: z.string().optional(),
    landmark: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    pincode: z.string().regex(/^\d{6}$/, "Must be 6 digits"),
    billing_same_as_installation: z.boolean(),
    billing_address_line_1: z.string().optional(),
    billing_address_line_2: z.string().optional(),
    billing_landmark: z.string().optional(),
    billing_city: z.string().optional(),
    billing_state: z.string().optional(),
    billing_pincode: z.string().optional(),
    spokesperson_name: z.string().optional(),
    spokesperson_mobile: z.string().regex(/^\d{10}$/, "Must be 10 digits").or(z.literal("")).optional(),
    spokesperson_email: z.string().email("Invalid email").or(z.literal("")).optional(),
    spokesperson_designation: z.string().optional(),
    connection_date: z.string().optional(),
    reference_source: z.string().optional(),
    sales_person: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.customer_type === "BUSINESS" && !d.company_name?.trim())
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company name is required for business accounts", path: ["company_name"] });
    if (!d.billing_same_as_installation) {
      if (!d.billing_address_line_1?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["billing_address_line_1"] });
      if (!d.billing_city?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["billing_city"] });
      if (!d.billing_state?.trim())
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["billing_state"] });
      if (d.billing_pincode && !/^\d{6}$/.test(d.billing_pincode))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be 6 digits", path: ["billing_pincode"] });
    }
  });

type FormValues = z.infer<typeof schema>;

// ── Field primitive ───────────────────────────────────────────────────────────

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
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <span className="h-1 w-1 rounded-full bg-destructive shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

// ── Section sub-header ────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
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
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`
          group flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8
          text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${fileName
            ? "border-green-400/60 bg-green-50/50"
            : "border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-primary/5"}
        `}
      >
        {fileName ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700 truncate max-w-[180px]">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click to replace</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/60 transition-colors group-hover:bg-primary/10">
              <Upload className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Upload {label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{acceptHint} · Max 10 MB</p>
            </div>
          </>
        )}
      </button>
    </div>
  );
}

// ── Wizard progress bar ───────────────────────────────────────────────────────

function WizardProgress({ step, steps }: { step: number; steps: typeof STEPS }) {
  return (
    <div className="flex items-start gap-0">
      {steps.map(({ title }, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            {/* Left connector */}
            <div className={`h-0.5 flex-1 ${i === 0 ? "invisible" : i <= step ? "bg-primary" : "bg-border"}`} />
            {/* Circle */}
            <div className={`
              flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all
              ${i < step ? "bg-primary text-white shadow-sm"
                : i === step ? "bg-primary/10 text-primary ring-2 ring-primary ring-offset-1"
                : "bg-muted text-muted-foreground"}
            `}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {/* Right connector */}
            <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? "invisible" : i < step ? "bg-primary" : "bg-border"}`} />
          </div>
          <span className={`hidden text-[11px] font-medium sm:block text-center leading-tight ${i === step ? "text-primary" : "text-muted-foreground"}`}>
            {title}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Customer & Contact ────────────────────────────────────────────────

function Step1({ register, watch, errors }: { register: any; watch: any; errors: any }) {
  const customerType = watch("customer_type");
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left: Customer type */}
      <div>
        <SectionTitle icon={Users} title="Customer Type" />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: "INDIVIDUAL", label: "Individual", desc: "Personal broadband connection", Icon: User },
              { value: "BUSINESS", label: "Business", desc: "Corporate or company account", Icon: Building2 },
            ] as const).map(({ value, label, desc, Icon }) => {
              const selected = customerType === value;
              return (
                <label key={value} className={`
                  relative flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 transition-all select-none
                  ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}
                `}>
                  <input type="radio" value={value} {...register("customer_type")} className="sr-only" />
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${selected ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className={`text-sm font-semibold ${selected ? "text-primary" : ""}`}>{label}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground pl-9">{desc}</span>
                  {selected && <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-primary" />}
                </label>
              );
            })}
          </div>
          {customerType === "BUSINESS" && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
              <Field label="Company Name" error={errors.company_name?.message} required>
                <Input placeholder="Acme Pvt. Ltd." {...register("company_name")} />
              </Field>
              <Field label="GST Number" hint="15-character alphanumeric">
                <Input placeholder="22AAAAA0000A1Z5" maxLength={15} className="uppercase" {...register("gst_number")} />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* Right: Basic info */}
      <div>
        <SectionTitle icon={User} title="Basic Information" />
        <div className="grid grid-cols-1 gap-4">
          <Field label="Full Name" error={errors.full_name?.message} required>
            <Input placeholder="Customer's full legal name" {...register("full_name")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile Number" error={errors.mobile_number?.message} required>
              <Input placeholder="9876543210" maxLength={10} {...register("mobile_number")} />
            </Field>
            <Field label="Alternate Mobile" error={errors.alternate_mobile_number?.message}>
              <Input placeholder="9876543210" maxLength={10} {...register("alternate_mobile_number")} />
            </Field>
          </div>
          <Field label="Email Address" error={errors.email?.message} required hint="Used for customer login">
            <Input type="email" placeholder="customer@example.com" {...register("email")} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Identity & Address ────────────────────────────────────────────────

function Step2({ register, watch, errors }: { register: any; watch: any; errors: any }) {
  const billingSame = watch("billing_same_as_installation");
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left: KYC + Installation */}
      <div className="space-y-6">
        <div>
          <SectionTitle icon={CreditCard} title="Identity / KYC" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Document Type" error={errors.kyc_type?.message}>
              <select {...register("kyc_type")} className={SELECT_CLS}>
                <option value="">— Select —</option>
                {KYC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Document Number" error={errors.kyc_number?.message}>
              <Input placeholder="e.g. 1234 5678 9012" {...register("kyc_number")} />
            </Field>
          </div>
        </div>
        <div>
          <SectionTitle icon={MapPin} title="Installation Address" />
          <div className="grid grid-cols-1 gap-3">
            <Field label="Address Line 1" error={errors.installation_address?.message} required>
              <Input placeholder="House / Flat No., Building, Street" {...register("installation_address")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Address Line 2">
                <Input placeholder="Area, Colony (optional)" {...register("address_line_2")} />
              </Field>
              <Field label="Landmark">
                <Input placeholder="Near…" {...register("landmark")} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City" error={errors.city?.message} required>
                <Input placeholder="Mumbai" {...register("city")} />
              </Field>
              <Field label="State" error={errors.state?.message} required>
                <input list="install-state-list" placeholder="Maharashtra" {...register("state")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <datalist id="install-state-list">
                  {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <Field label="Pincode" error={errors.pincode?.message} required>
                <Input placeholder="400001" maxLength={6} {...register("pincode")} />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Billing Address */}
      <div>
        <SectionTitle icon={Receipt} title="Billing Address" />
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-muted/20 p-4 hover:bg-muted/40 select-none transition-colors">
            <div className="relative h-5 w-9 shrink-0">
              <input {...register("billing_same_as_installation")} type="checkbox" className="peer sr-only" />
              <div className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Same as installation address</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Invoices sent to the installation location</p>
            </div>
          </label>
          {!billingSame && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
              <Field label="Address Line 1" error={errors.billing_address_line_1?.message} required>
                <Input placeholder="House / Flat No., Building, Street" {...register("billing_address_line_1")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Address Line 2">
                  <Input placeholder="Area, Colony (optional)" {...register("billing_address_line_2")} />
                </Field>
                <Field label="Landmark">
                  <Input placeholder="Near…" {...register("billing_landmark")} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="City" error={errors.billing_city?.message} required>
                  <Input placeholder="Mumbai" {...register("billing_city")} />
                </Field>
                <Field label="State" error={errors.billing_state?.message} required>
                  <input list="billing-state-list" placeholder="Maharashtra" {...register("billing_state")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <datalist id="billing-state-list">
                    {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </Field>
                <Field label="Pincode" error={errors.billing_pincode?.message} required>
                  <Input placeholder="400001" maxLength={6} {...register("billing_pincode")} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Additional Details ────────────────────────────────────────────────

function Step3({ register, errors }: { register: any; errors: any }) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left: Spokesperson */}
      <div>
        <SectionTitle icon={UserCheck} title="Spokesperson / Alternate Contact" />
        <div className="grid grid-cols-1 gap-3">
          <Field label="Full Name">
            <Input placeholder="Contact person's name" {...register("spokesperson_name")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile" error={errors.spokesperson_mobile?.message}>
              <Input placeholder="9876543210" maxLength={10} {...register("spokesperson_mobile")} />
            </Field>
            <Field label="Email" error={errors.spokesperson_email?.message}>
              <Input type="email" placeholder="contact@example.com" {...register("spokesperson_email")} />
            </Field>
          </div>
          <Field label="Designation">
            <Input placeholder="Manager, Director, Owner…" {...register("spokesperson_designation")} />
          </Field>
        </div>
      </div>

      {/* Right: Additional Info */}
      <div>
        <SectionTitle icon={Info} title="Additional Information" />
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Connection Date">
              <Input type="date" {...register("connection_date")} />
            </Field>
            <Field label="Reference Source">
              <select {...register("reference_source")} className={SELECT_CLS}>
                <option value="">— How did they find us? —</option>
                {REFERENCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Salesperson">
            <Input placeholder="Assigned salesperson" {...register("sales_person")} />
          </Field>
          <Field label="Internal Notes">
            <textarea rows={4} placeholder="Any notes or special instructions…" {...register("notes")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Documents ─────────────────────────────────────────────────────────

function Step4({
  profilePhotoRef, kycDocRef, agreementDocRef, fileNames, setFileNames,
}: {
  profilePhotoRef: React.RefObject<HTMLInputElement>;
  kycDocRef: React.RefObject<HTMLInputElement>;
  agreementDocRef: React.RefObject<HTMLInputElement>;
  fileNames: Record<string, string>;
  setFileNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        All documents are optional and can be uploaded or replaced at any time after the customer is created.
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <FileUploadZone label="Profile Photo" acceptHint="JPG, PNG, WebP"
          accept="image/jpeg,image/png,image/webp"
          inputRef={profilePhotoRef} fileName={fileNames.profile_photo}
          onChange={(n) => setFileNames((p) => ({ ...p, profile_photo: n }))} />
        <FileUploadZone label="KYC Document" acceptHint="JPG, PNG, PDF"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          inputRef={kycDocRef} fileName={fileNames.kyc_document}
          onChange={(n) => setFileNames((p) => ({ ...p, kyc_document: n }))} />
        <FileUploadZone label="Agreement Document" acceptHint="JPG, PNG, PDF"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          inputRef={agreementDocRef} fileName={fileNames.agreement_document}
          onChange={(n) => setFileNames((p) => ({ ...p, agreement_document: n }))} />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function CustomerCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [credentials, setCredentials] = useState<CustomerCreateResponse | null>(null);

  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const kycDocRef = useRef<HTMLInputElement>(null);
  const agreementDocRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState({ profile_photo: "", kyc_document: "", agreement_document: "" });

  const {
    register, handleSubmit, watch, trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { customer_type: "INDIVIDUAL", billing_same_as_installation: true },
    mode: "onTouched",
  });

  const isLastStep = step === STEPS.length - 1;

  const handleNext = async () => {
    const fields = STEP_FIELDS[step] as (keyof FormValues)[];
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    setStep((s) => s + 1);
  };

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
      const uploads: Array<[DocType, React.RefObject<HTMLInputElement>]> = [
        ["profile_photo", profilePhotoRef],
        ["kyc_document", kycDocRef],
        ["agreement_document", agreementDocRef],
      ];
      await Promise.all(uploads.map(async ([docType, ref]) => {
        const file = ref.current?.files?.[0];
        if (!file) return;
        try { await customersService.uploadDocument(result.id, docType, file); }
        catch { showToast(`${docType} upload failed`, "error"); }
      }));
      setCredentials(result);
    } catch (err) {
      showToast(getApiErrorMessage(err, "Failed to create customer"), "error");
    }
  };

  return (
    <AppLayout title="New Customer" portalLabel="Administration">
      <div className="flex h-full flex-col space-y-4">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">New Customer</h2>
            <p className="text-sm text-muted-foreground">Complete all 4 steps to register a new customer.</p>
          </div>
        </div>

        {/* Wizard card — full width */}
        <Card className="flex flex-1 flex-col overflow-hidden">

          {/* Progress header */}
          <div className="border-b border-border/40 px-6 pt-5 pb-6">
            <WizardProgress step={step} steps={STEPS} />
          </div>

          {/* Step title */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                {(() => { const Icon = STEPS[step].icon; return <Icon className="text-primary" style={{ height: "1.125rem", width: "1.125rem" }} />; })()}
              </div>
              <div>
                <h3 className="text-base font-semibold">{STEPS[step].title}</h3>
                <p className="text-[12px] text-muted-foreground">{STEPS[step].description}</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-muted-foreground bg-muted rounded-full px-2.5 py-1">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>

          {/* Step content */}
          <CardContent className="flex-1 pt-2 pb-6">
            <form id="wizard-form"
              onSubmit={isLastStep ? handleSubmit(onSubmit) : (e) => { e.preventDefault(); handleNext(); }}>
              {step === 0 && <Step1 register={register} watch={watch} errors={errors} />}
              {step === 1 && <Step2 register={register} watch={watch} errors={errors} />}
              {step === 2 && <Step3 register={register} errors={errors} />}
              {step === 3 && (
                <Step4
                  profilePhotoRef={profilePhotoRef} kycDocRef={kycDocRef}
                  agreementDocRef={agreementDocRef} fileNames={fileNames} setFileNames={setFileNames} />
              )}
            </form>
          </CardContent>

          {/* Wizard footer */}
          <div className="flex items-center justify-between border-t border-border/40 px-6 py-4">
            <div>
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="h-4 w-4" />Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                {(step === 2 || step === 3) ? "All fields on this step are optional" : "Fields marked * are required"}
              </p>
              {isLastStep ? (
                <Button form="wizard-form" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Customer
                </Button>
              ) : (
                <Button form="wizard-form" type="submit">
                  Next<ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {credentials && (
        <CredentialsModal open={true} onClose={() => navigate("/admin/customers")}
          customerCode={credentials.customer_code} email={credentials.email}
          tempPassword={credentials.temp_password} />
      )}
    </AppLayout>
  );
}
