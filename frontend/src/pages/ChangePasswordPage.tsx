import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuth } from "@/hooks/useAuth";
import { getApiErrorMessage } from "@/services/api";

const POLICY_RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[A-Z]/.test(v), label: "One uppercase letter" },
  { test: (v: string) => /[a-z]/.test(v), label: "One lowercase letter" },
  { test: (v: string) => /[0-9]/.test(v), label: "One number" },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: "One special character" },
];

const schema = z
  .object({
    old_password: z.string().min(1, "Current password is required"),
    new_password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "One uppercase letter required")
      .regex(/[a-z]/, "One lowercase letter required")
      .regex(/[0-9]/, "One number required")
      .regex(/[^A-Za-z0-9]/, "One special character required"),
    confirm_password: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange" });

  const newPassword = watch("new_password", "");

  const dashboardPath =
    user?.role === "SUPERADMIN" ? "/admin/dashboard" : "/client/dashboard";

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await changePassword({
        old_password: values.old_password,
        new_password: values.new_password,
      });
      navigate(dashboardPath, { replace: true });
    } catch (err) {
      setServerError(
        getApiErrorMessage(err, "Failed to change password. Please try again."),
      );
    }
  };

  const isForced = user?.must_change_password;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isForced ? "Set your password" : "Change password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isForced
              ? "You must set a new password before continuing."
              : "Choose a strong password to keep your account secure."}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="old_password">Current password</Label>
            <PasswordInput
              id="old_password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!errors.old_password}
              {...register("old_password")}
            />
            {errors.old_password && (
              <p className="text-xs text-destructive">
                {errors.old_password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <PasswordInput
              id="new_password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.new_password}
              {...register("new_password")}
            />
            {/* Live policy checklist */}
            <ul className="mt-2 space-y-1">
              {POLICY_RULES.map((rule) => {
                const met = newPassword ? rule.test(newPassword) : false;
                return (
                  <li
                    key={rule.label}
                    className={`text-xs flex items-center gap-1.5 ${met ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    <span>{met ? "✓" : "○"}</span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
            {errors.new_password && (
              <p className="text-xs text-destructive">
                {errors.new_password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <PasswordInput
              id="confirm_password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.confirm_password}
              {...register("confirm_password")}
            />
            {errors.confirm_password && (
              <p className="text-xs text-destructive">
                {errors.confirm_password.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isForced ? "Set password & continue" : "Change password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
