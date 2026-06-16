import { useState } from "react";
import { CheckCheck, Copy, AlertTriangle } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/button";

interface CredentialsModalProps {
  open: boolean;
  onClose: () => void;
  customerCode: string;
  email: string;
  tempPassword: string;
}

export function CredentialsModal({
  open,
  onClose,
  customerCode,
  email,
  tempPassword,
}: CredentialsModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Customer Created Successfully" className="max-w-lg">
      <div className="space-y-5">
        {/* Warning */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>Copy this password now.</strong> It will not be shown again.
          </p>
        </div>

        {/* Details */}
        <div className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Customer Code</span>
            <span className="font-mono font-semibold text-foreground">{customerCode}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Login Email</span>
            <span className="font-medium text-foreground break-all">{email}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground shrink-0">Temp Password</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-foreground">{tempPassword}</span>
              <button
                onClick={handleCopy}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Copy password"
              >
                {copied ? (
                  <CheckCheck className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          The customer will be prompted to change their password on first login.
        </p>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
