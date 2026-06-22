import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import {
  Loader2, ArrowLeft, ArrowRight, Upload, CheckCircle2, Check,
  Users, User, Building2, CreditCard, MapPin, Receipt,
  UserCheck, Info, FolderUp, FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AppLayout } from "@/layouts/AppLayout";
import { CredentialsModal } from "@/components/customers/CredentialsModal";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import type { DocType } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import { staffUsersService } from "@/services/roles";
import type { CustomerCreateResponse } from "@/types/customer";
import { Field, PhoneField, PincodeAutoFillInput } from "@/components/customers/CustomerFormParts";

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
  { value: "PAN",     label: "PAN Card" },
  { value: "PASSPORT",label: "Passport" },
  { value: "VOTER_ID",label: "Voter ID" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
];
const REFERENCE_OPTIONS = ["Online","Referral","Walk-In","Agent","Newspaper","Social Media","Other"];

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { icon: Users,    title: "Customer & Contact",  description: "Account type and primary contact details" },
  { icon: MapPin,   title: "Identity & Address",  description: "KYC verification and service location" },
  { icon: Info,     title: "Additional Details",  description: "Spokesperson, connection info and notes" },
  { icon: FolderUp, title: "Documents",            description: "Upload supporting files (optional)" },
];

const STEP_FIELDS: Record<number, string[]> = {
  0: ["customer_type","company_name","gst_number","full_name","mobile_number","alternate_mobile_number","email"],
  1: ["kyc_type","kyc_number","installation_address","address_line_2","landmark",
      "pincode","district","city","state",
      "billing_same_as_installation","billing_address_line_1","billing_city","billing_state","billing_pincode"],
  2: ["spokesperson_name","spokesperson_mobile","spokesperson_email","spokesperson_designation",
      "connection_date","reference_source","reference_source_other","sales_person","notes"],
  3: [],
};

// ── Schema ────────────────────────────────────────────────────────────────────

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
    pincode: z.string().regex(/^\d{6}$/, "Must be 6 digits"),
    district: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    billing_same_as_installation: z.boolean(),
    billing_address_line_1: z.string().optional(),
    billing_address_line_2: z.string().optional(),
    billing_landmark: z.string().optional(),
    billing_pincode: z.string().optional(),
    billing_district: z.string().optional(),
    billing_city: z.string().optional(),
    billing_state: z.string().optional(),
    spokesperson_name: z.string().optional(),
    spokesperson_mobile: z.string().regex(/^\d{10}$/, "Must be 10 digits").or(z.literal("")).optional(),
    spokesperson_email: z.string().email("Invalid email").or(z.literal("")).optional(),
    spokesperson_designation: z.string().optional(),
    connection_date: z.string().optional(),
    reference_source: z.string().optional(),
    reference_source_other: z.string().optional(),
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

const SELECT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10">
        <Icon className="h-3.5 w-3.5 text-accent" />
      </div>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

// ── Wizard progress ───────────────────────────────────────────────────────────

function WizardProgress({ step, steps }: { step: number; steps: typeof STEPS }) {
  return (
    <div className="flex items-start">
      {steps.map(({ title }, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            <div className={`h-0.5 flex-1 ${i === 0 ? "invisible" : i <= step ? "bg-accent" : "bg-border"}`} />
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all
              ${i < step ? "bg-accent text-white shadow-sm" : i === step ? "bg-accent/10 text-accent ring-2 ring-accent ring-offset-1" : "bg-muted text-muted-foreground"}`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? "invisible" : i < step ? "bg-accent" : "bg-border"}`} />
          </div>
          <span className={`hidden text-[11px] font-medium sm:block text-center leading-tight ${i === step ? "text-accent" : "text-muted-foreground"}`}>
            {title}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── File upload zone with preview ─────────────────────────────────────────────

function getFileStyle(mimeType: string, ext: string): { color: string; bg: string; badge: string } {
  if (mimeType === "application/pdf" || ext === "pdf")
    return { color: "text-red-600", bg: "bg-red-50", badge: "PDF" };
  if (mimeType.includes("word") || ["doc","docx"].includes(ext))
    return { color: "text-blue-600", bg: "bg-blue-50", badge: "DOC" };
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet") || ["xls","xlsx","csv"].includes(ext))
    return { color: "text-green-600", bg: "bg-green-50", badge: "XLS" };
  return { color: "text-muted-foreground", bg: "bg-muted/60", badge: ext.toUpperCase() || "FILE" };
}

function FileUploadZone({
  label, acceptHint, accept, inputRef, onChange, fileName, hasExisting,
}: {
  label: string; acceptHint: string; accept: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (name: string) => void;
  fileName: string;
  hasExisting?: boolean;
}) {
  const [preview, setPreview] = useState<{ url: string | null; mimeType: string; ext: string }>({
    url: null, mimeType: "", ext: "",
  });
  // Use a ref so we only revoke the blob URL on true unmount,
  // not on React Strict Mode's double-effect invocation.
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
      setPreview({ url: null, mimeType: "", ext: "" });
      onChange("");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    let url: string | null = null;
    if (file.type.startsWith("image/")) {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      url = URL.createObjectURL(file);
      blobUrlRef.current = url;
    } else {
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    }
    setPreview({ url, mimeType: file.type, ext });
    onChange(file.name);
  }, [onChange]);

  const showReplace = hasExisting && !fileName;
  const fileStyle = getFileStyle(preview.mimeType, preview.ext);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`group flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6
          text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${fileName ? "border-primary/30 bg-primary/3 hover:border-primary/50"
            : showReplace ? "border-green-300/60 bg-green-50/40 hover:border-primary/50"
            : "border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-primary/5"}`}>
        {fileName && preview.url ? (
          // Image preview
          <>
            <img src={preview.url} alt={fileName}
              className="h-20 w-full rounded-lg object-cover shadow-sm" />
            <div className="min-w-0 w-full">
              <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click to replace</p>
            </div>
          </>
        ) : fileName ? (
          // Non-image file preview
          <>
            <div className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl ${fileStyle.bg}`}>
              <FileText className={`h-6 w-6 ${fileStyle.color}`} />
              <span className={`text-[9px] font-bold mt-0.5 ${fileStyle.color}`}>{fileStyle.badge}</span>
            </div>
            <div className="min-w-0 w-full">
              <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click to replace</p>
            </div>
          </>
        ) : showReplace ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700">Already uploaded</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click to replace</p>
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

// ── Step 1 ────────────────────────────────────────────────────────────────────

function Step1({ register, watch, errors }: { register: any; watch: any; errors: any }) {
  const customerType = watch("customer_type");
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div>
        <SectionTitle icon={Users} title="Customer Type" />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: "INDIVIDUAL", label: "Individual", desc: "Personal broadband connection", Icon: User },
              { value: "BUSINESS",   label: "Business",   desc: "Corporate or company account",  Icon: Building2 },
            ] as const).map(({ value, label, desc, Icon }) => {
              const sel = customerType === value;
              return (
                <label key={value} className={`relative flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 transition-all select-none
                  ${sel ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}>
                  <input type="radio" value={value} {...register("customer_type")} className="sr-only" />
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${sel ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className={`text-sm font-semibold ${sel ? "text-primary" : ""}`}>{label}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground pl-9">{desc}</span>
                  {sel && <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-primary" />}
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
      <div>
        <SectionTitle icon={User} title="Basic Information" />
        <div className="grid grid-cols-1 gap-4">
          <Field label="Full Name" error={errors.full_name?.message} required>
            <Input placeholder="Customer's full legal name" {...register("full_name")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <PhoneField label="Mobile Number" error={errors.mobile_number?.message} required
              registerProps={register("mobile_number")} />
            <PhoneField label="Alternate Mobile" error={errors.alternate_mobile_number?.message}
              registerProps={register("alternate_mobile_number")} />
          </div>
          <Field label="Email Address" error={errors.email?.message} required hint="Used for customer login">
            <Input type="email" placeholder="customer@example.com" {...register("email")} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function AddressFields({
  prefix, register, errors, setValue,
  stateListId, isBilling,
}: {
  prefix: "" | "billing_";
  register: any; errors: any; setValue: any;
  stateListId: string; isBilling?: boolean;
}) {
  const pf = (f: string) => `${prefix}${f}` as any;
  return (
    <div className="grid grid-cols-1 gap-3">
      {!isBilling && (
        <>
          <Field label="Address Line 1" error={errors[pf("installation_address")]?.message} required>
            <Input placeholder="House / Flat No., Building, Street" {...register(pf("installation_address"))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Address Line 2">
              <Input placeholder="Area, Colony (optional)" {...register("address_line_2")} />
            </Field>
            <Field label="Landmark">
              <Input placeholder="Near…" {...register("landmark")} />
            </Field>
          </div>
        </>
      )}
      {isBilling && (
        <>
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
        </>
      )}
      {/* Pincode first, then District, City, State */}
      <div className="grid grid-cols-2 gap-3">
        <PincodeAutoFillInput
          label="Pincode" required
          error={errors[pf("pincode")]?.message}
          registerProps={register(pf("pincode"))}
          onAutoFill={(district, state) => {
            setValue(pf("district"), district, { shouldValidate: true });
            setValue(pf("state"), state, { shouldValidate: true });
          }}
        />
        <Field label="District" error={errors[pf("district")]?.message}>
          <Input placeholder="Auto-filled from pincode" {...register(pf("district"))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" error={errors[pf("city") as keyof typeof errors]?.message} required>
          <Input placeholder="Mumbai" {...register(pf("city"))} />
        </Field>
        <Field label="State" error={errors[pf("state") as keyof typeof errors]?.message} required>
          <input list={stateListId} placeholder="Maharashtra" {...register(pf("state"))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <datalist id={stateListId}>
            {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
      </div>
    </div>
  );
}

function Step2({ register, watch, errors, setValue }: { register: any; watch: any; errors: any; setValue: any }) {
  const billingSame = watch("billing_same_as_installation");
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
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
          <AddressFields prefix="" register={register} errors={errors} setValue={setValue}
            stateListId="create-install-state" isBilling={false} />
        </div>
      </div>
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
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <AddressFields prefix="billing_" register={register} errors={errors} setValue={setValue}
                stateListId="create-billing-state" isBilling={true} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 3 ────────────────────────────────────────────────────────────────────

function Step3({ register, watch, errors }: { register: any; watch: any; errors: any }) {
  const refSource = watch("reference_source");

  const { data: staffData } = useQuery({
    queryKey: ["staff-users-active"],
    queryFn: () => staffUsersService.list({ limit: 200 }),
    staleTime: 60_000,
  });
  const salesStaff = (staffData?.items ?? []).filter((u) => u.invite_status === "ACTIVE");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div>
        <SectionTitle icon={UserCheck} title="Spokesperson / Alternate Contact" />
        <div className="grid grid-cols-1 gap-3">
          <Field label="Full Name">
            <Input placeholder="Contact person's name" {...register("spokesperson_name")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <PhoneField label="Mobile" error={errors.spokesperson_mobile?.message}
              registerProps={register("spokesperson_mobile")} />
            <Field label="Email" error={errors.spokesperson_email?.message}>
              <Input type="email" placeholder="contact@example.com" {...register("spokesperson_email")} />
            </Field>
          </div>
          <Field label="Designation">
            <Input placeholder="Manager, Director, Owner…" {...register("spokesperson_designation")} />
          </Field>
        </div>
      </div>
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
          {refSource === "Other" && (
            <Field label="Please specify" error={errors.reference_source_other?.message}>
              <Input
                placeholder="e.g. Billboard, Friend recommendation…"
                {...register("reference_source_other")}
              />
            </Field>
          )}
          <Field label="Salesperson">
            {salesStaff.length > 0 ? (
              <select {...register("sales_person")} className={SELECT_CLS}>
                <option value="">— Select salesperson —</option>
                {salesStaff.map((u) => {
                  const name = u.display_name || u.email;
                  return (
                    <option key={u.id} value={name}>
                      {name}{u.staff_role ? ` (${u.staff_role.name})` : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <Input placeholder="No staff users available yet" {...register("sales_person")} />
            )}
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

// ── Step 4 ────────────────────────────────────────────────────────────────────

function Step4({
  profilePhotoRef, kycDocRef, agreementDocRef, fileNames, setFileNames,
}: {
  profilePhotoRef: React.RefObject<HTMLInputElement>;
  kycDocRef: React.RefObject<HTMLInputElement>;
  agreementDocRef: React.RefObject<HTMLInputElement>;
  fileNames: { profile_photo: string; kyc_document: string; agreement_document: string };
  setFileNames: React.Dispatch<React.SetStateAction<{ profile_photo: string; kyc_document: string; agreement_document: string }>>;
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
    register, handleSubmit, watch, trigger, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { customer_type: "INDIVIDUAL", billing_same_as_installation: true },
    mode: "onTouched",
  });

  const isLastStep = step === STEPS.length - 1;

  const handleNext = async () => {
    const fields = STEP_FIELDS[step] as (keyof FormValues)[];
    if (fields.length > 0) { const valid = await trigger(fields); if (!valid) return; }
    setStep((s) => s + 1);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await customersService.create({
        ...values,
        alternate_mobile_number:  values.alternate_mobile_number  || undefined,
        kyc_type:                 (values.kyc_type as any)        || undefined,
        gst_number:               values.gst_number               || undefined,
        company_name:             values.company_name             || undefined,
        district:                 values.district                 || undefined,
        connection_date:          values.connection_date          || undefined,
        reference_source:         values.reference_source === "Other"
                                    ? (values.reference_source_other || undefined)
                                    : (values.reference_source || undefined),
        sales_person:             values.sales_person             || undefined,
        notes:                    values.notes                    || undefined,
        spokesperson_mobile:      values.spokesperson_mobile      || undefined,
        spokesperson_email:       values.spokesperson_email       || undefined,
        billing_address_line_1:   values.billing_same_as_installation ? undefined : values.billing_address_line_1,
        billing_address_line_2:   values.billing_same_as_installation ? undefined : values.billing_address_line_2,
        billing_landmark:         values.billing_same_as_installation ? undefined : values.billing_landmark,
        billing_pincode:          values.billing_same_as_installation ? undefined : values.billing_pincode,
        billing_district:         values.billing_same_as_installation ? undefined : (values.billing_district || undefined),
        billing_city:             values.billing_same_as_installation ? undefined : values.billing_city,
        billing_state:            values.billing_same_as_installation ? undefined : values.billing_state,
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

  const StepIcon = STEPS[step].icon;

  return (
    <AppLayout title="New Customer" portalLabel="Administration">
      <div className="flex h-full flex-col space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/customers")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">New Customer</h2>
            <p className="text-sm text-muted-foreground">Complete all 4 steps to register a new customer.</p>
          </div>
        </div>

        <Card className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border/40 px-6 pt-5 pb-6">
            <WizardProgress step={step} steps={STEPS} />
          </div>
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <StepIcon className="text-accent" style={{ height: "1.125rem", width: "1.125rem" }} />
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

          <CardContent className="flex-1 pt-2 pb-6">
            <form id="wizard-form"
              onSubmit={isLastStep ? handleSubmit(onSubmit) : (e) => { e.preventDefault(); handleNext(); }}>
              {step === 0 && <Step1 register={register} watch={watch} errors={errors} />}
              {step === 1 && <Step2 register={register} watch={watch} errors={errors} setValue={setValue} />}
              {step === 2 && <Step3 register={register} watch={watch} errors={errors} />}
              {step === 3 && (
                <Step4 profilePhotoRef={profilePhotoRef} kycDocRef={kycDocRef}
                  agreementDocRef={agreementDocRef} fileNames={fileNames} setFileNames={setFileNames} />
              )}
            </form>
          </CardContent>

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
                {step >= 2 ? "All fields on this step are optional" : "Fields marked * are required"}
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
