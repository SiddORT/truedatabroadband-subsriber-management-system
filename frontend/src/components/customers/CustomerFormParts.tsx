import { useCallback, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Label } from "@/components/ui/label";

// ── Shared field wrapper ──────────────────────────────────────────────────────

export function Field({
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

// ── Phone field — +91 country code prefix (India default) ────────────────────

export function PhoneField({
  label, error, required, className, hint, placeholder = "9876543210", registerProps,
}: {
  label: string; error?: string; required?: boolean;
  className?: string; hint?: string; placeholder?: string;
  registerProps: Record<string, any>;
}) {
  return (
    <Field label={label} error={error} required={required} hint={hint} className={className}>
      <div className="flex overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
        <span className="flex shrink-0 items-center gap-1 border-r border-input bg-muted/50 px-2.5 text-sm font-medium text-foreground select-none">
          🇮🇳 +91
        </span>
        <input
          type="tel"
          placeholder={placeholder}
          maxLength={10}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm focus:outline-none"
          {...registerProps}
        />
      </div>
    </Field>
  );
}

// ── Pincode input — auto-fills city + state via India Post API ───────────────

interface PostOffice {
  Name: string;
  District: string;
  State: string;
}
interface PostalRecord {
  Status: string;
  PostOffice: PostOffice[] | null;
}

export function PincodeAutoFillInput({
  label = "Pincode", error, required, className,
  registerProps,
  onAutoFill,
}: {
  label?: string; error?: string; required?: boolean; className?: string;
  registerProps: Record<string, any>;
  onAutoFill: (city: string, state: string) => void;
}) {
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      registerProps.onChange?.(e);
      const val = e.target.value.replace(/\D/g, "");
      if (val.length !== 6) {
        setFetchError(null);
        return;
      }
      setFetching(true);
      setFetchError(null);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${val}`);
        const json: PostalRecord[] = await res.json();
        const rec = json[0];
        if (rec?.Status === "Success" && rec.PostOffice?.length) {
          const po = rec.PostOffice[0];
          onAutoFill(po.District, po.State);
        } else {
          setFetchError("Pincode not found");
        }
      } catch {
        setFetchError("Could not look up pincode");
      } finally {
        setFetching(false);
      }
    },
    [registerProps, onAutoFill],
  );

  const displayError = error || fetchError || undefined;

  return (
    <Field label={label} error={displayError} required={required} className={className}>
      <div className="relative">
        <input
          type="tel"
          placeholder="400001"
          maxLength={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          {...registerProps}
          onChange={handleChange}
        />
        {fetching ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-primary" />
        ) : (
          <MapPin className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/30" />
        )}
      </div>
    </Field>
  );
}
