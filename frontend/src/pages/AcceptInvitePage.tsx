import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { acceptInvite } from "@/services/roles";
import { cn } from "@/lib/utils";

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setViolations([]);

    if (!token) {
      setError("Invalid invite link. Please use the link from your invitation email.");
      return;
    }

    setLoading(true);
    try {
      await acceptInvite({ token, password, confirm_password: confirm });
      setSuccess(true);
      setTimeout(() => navigate("/admin/login", { replace: true }), 3000);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      if (typeof detail === "object" && detail !== null && "violations" in detail) {
        setViolations((detail as { violations: string[] }).violations);
        setError((detail as unknown as { message: string }).message);
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <svg className="h-7 w-7 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground">Invalid Invite Link</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is missing required information. Please use the full link from your invitation email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/logo-small.png" alt="True Data Broadband" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Accept Your Invitation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a password to activate your staff account.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-8 shadow-lg">
          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Account Activated!</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your password has been set. Redirecting to login…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3">
                  <p className="text-sm font-medium text-destructive">{error}</p>
                  {violations.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {violations.map((v) => (
                        <li key={v} className="text-xs text-destructive/80">• {v}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Re-enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  "w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity",
                  loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
                )}
              >
                {loading ? "Activating…" : "Activate Account"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/admin/login" className="text-primary hover:underline">Sign in</a>
        </p>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/60">
          Powered by <span className="font-semibold">ORT</span>
        </p>
      </div>
    </div>
  );
}
